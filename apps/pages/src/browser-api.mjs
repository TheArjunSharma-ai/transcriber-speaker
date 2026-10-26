import { openDB } from "idb";
import { z } from "zod";
import { DOCUMENT_EXTENSIONS, MAX_TEXT_LENGTH, MAX_UPLOAD_BYTES, extension } from "../../web/src/lib/content.mjs";

let connection;

function database() {
    if (!connection) connection = openDB("sona-browser-projects", 1, {
        upgrade(store) { store.createObjectStore("projects", { keyPath: "id" }); },
    });
    return connection;
}

function publicProject(project) {
    const { sourceBlob, ...visible } = project;
    return { ...visible, ...(sourceBlob ? { sourceAsset: "browser-source" } : {}) };
}

function attachment(text, title, type = "text/plain; charset=utf-8") {
    const name = title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "project";
    return new Response(text, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}.txt"` } });
}

async function extractFile(file) {
    const type = extension(file.name);
    if (!DOCUMENT_EXTENSIONS.includes(type)) throw new Error("The Pages edition supports PDF, DOCX, TXT, Markdown, CSV, and HTML. Media transcription requires the local app.");
    if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new Error("Choose a non-empty document smaller than 25 MB.");
    let text;
    if (type === "pdf") {
        const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
        GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true });
        const document = await task.promise;
        try {
            if (document.numPages > 200) throw new Error("PDFs are limited to 200 pages.");
            const pages = [];
            for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
                const page = await document.getPage(pageNumber);
                const content = await page.getTextContent();
                pages.push(content.items.map((item) => item.str || "").join(" "));
                page.cleanup();
            }
            text = pages.join("\n\n");
        } finally { await task.destroy(); }
    } else if (type === "docx") {
        const mammoth = await import("mammoth/mammoth.browser.js");
        text = (await (mammoth.default || mammoth).extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
    } else {
        text = await file.text();
        if (text.includes("\0")) throw new Error("Choose a supported UTF-8 document.");
        if (type === "html") {
            const document = new DOMParser().parseFromString(text, "text/html");
            document.querySelectorAll("script, style, noscript, template").forEach((element) => element.remove());
            text = document.body.textContent;
        }
    }
    text = text.trim();
    if (!text) throw new Error("No readable text found. Scanned documents need OCR in a future edition.");
    if (text.length > MAX_TEXT_LENGTH) throw new Error("Document exceeds the 100,000 character limit.");
    return text;
}

const inputSchema = z.object({ title: z.string().trim().min(1).max(120), type: z.enum(["text", "chat"]), text: z.string().trim().min(1).max(MAX_TEXT_LENGTH) });
const editSchema = z.object({ title: z.string().trim().min(1).max(120), text: z.string().max(MAX_TEXT_LENGTH), revision: z.number().int().positive(), segments: z.array(z.never()).optional() });

export async function browserRequest(path, options = {}) {
    try {
        const url = new URL(path, "https://sona.invalid");
        const method = options.method || "GET";
        if (url.pathname === "/api/status") return Response.json({ workerOnline: false, speechConfigured: false, mode: "browser" });
        const store = await database();
        if (url.pathname === "/api/projects") {
            if (method === "GET") {
                const projects = (await store.getAll("projects")).map(publicProject).sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
                return Response.json({ projects });
            }
            if (method === "POST") {
                let input;
                if (options.body instanceof FormData) {
                    const file = options.body.get("file");
                    if (!(file instanceof File)) throw new Error("Choose a document first.");
                    input = { title: file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Document", type: "document", text: await extractFile(file), sourceBlob: file, sourceName: file.name, sourceSize: file.size };
                } else { input = inputSchema.parse(JSON.parse(options.body)); }
                const now = new Date().toISOString();
                const project = { id: crypto.randomUUID(), segments: [], status: "ready", revision: 1, createdAt: now, updatedAt: now, error: null, ...input };
                await store.add("projects", project);
                return Response.json({ project: publicProject(project) }, { status: 201 });
            }
        }
        const match = /^\/api\/projects\/([a-f0-9-]{36})(?:\/(.*))?$/.exec(url.pathname);
        if (!match) return Response.json({ error: "This feature requires the local server edition." }, { status: 400 });
        const [, id, action] = match;
        if (method === "PATCH" && !action) {
            const input = editSchema.parse(JSON.parse(options.body));
            const transaction = store.transaction("projects", "readwrite");
            const project = await transaction.store.get(id);
            if (!project) { await transaction.done; return Response.json({ error: "Project not found." }, { status: 404 }); }
            if (project.revision !== input.revision) { await transaction.done; return Response.json({ error: "This project changed. Reload it before saving." }, { status: 409 }); }
            const edited = { ...project, title: input.title, text: input.text, revision: project.revision + 1, updatedAt: new Date().toISOString() };
            await transaction.store.put(edited);
            await transaction.done;
            return Response.json({ project: publicProject(edited) });
        }
        const project = await store.get("projects", id);
        if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
        if (method === "GET" && !action) return Response.json({ project: publicProject(project) });
        if (method === "DELETE" && !action) {
            await store.delete("projects", id);
            return Response.json({ deleted: true });
        }
        if (method === "GET" && action === "export") {
            if ((url.searchParams.get("format") || "txt") !== "txt") throw new Error("Subtitle exports require a timed transcript in the local app.");
            return attachment(project.text, project.title);
        }
        if (method === "GET" && action === "assets/source" && project.sourceBlob) {
            return new Response(project.sourceBlob, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="source.${extension(project.sourceName)}"` } });
        }
        return Response.json({ error: "This feature requires the local server edition." }, { status: 400 });
    } catch (error) {
        const message = error instanceof z.ZodError ? error.issues[0].message : error.message;
        return Response.json({ error: message || "Browser storage is unavailable. Check storage permissions." }, { status: 400 });
    }
}