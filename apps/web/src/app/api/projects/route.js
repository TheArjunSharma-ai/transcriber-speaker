import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { assetDirectory, createProject, deleteProject, enqueue, getProject, listProjects } from "@/lib/store.mjs";
import { DOCUMENT_EXTENSIONS, MEDIA_EXTENSIONS, MAX_TEXT_LENGTH, MAX_UPLOAD_BYTES, extension } from "@/lib/content.mjs";
import { validateSignature } from "@/lib/extraction.mjs";
import { validateWebUrl } from "@/lib/website.mjs";
import { HttpError, readJson, route } from "@/lib/http.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => Response.json({ projects: listProjects() }, { headers: { "Cache-Control": "no-store" } }));

export const POST = route(async (request) => {
    const contentLength = Number(request.headers.get("content-length"));
    if (contentLength > MAX_UPLOAD_BYTES + 1024 * 1024) throw new HttpError("Uploads are limited to 25 MB.", 413);
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || !file.size) throw new HttpError("Choose a non-empty file.");
        if (file.size > MAX_UPLOAD_BYTES) throw new HttpError("Uploads are limited to 25 MB.", 413);
        const name = file.name.replace(/[\\/\x00-\x1f]/g, "_").slice(0, 180);
        const type = extension(name);
        if (![...DOCUMENT_EXTENSIONS, ...MEDIA_EXTENSIONS].includes(type)) throw new HttpError("Unsupported file format. Choose audio, video, PDF, DOCX, or a text document.");
        const isMedia = MEDIA_EXTENSIONS.includes(type);
        if (isMedia && form.get("consent") !== "true") throw new HttpError("Confirm that this recording can be sent to the speech provider.");
        if (isMedia && !process.env.OPENAI_API_KEY) throw new HttpError("Set OPENAI_API_KEY in apps/web/.env.local and restart both services to enable transcription.", 503);
        const language = z.string().regex(/^(auto|[a-z]{2})$/).parse(form.get("language") || "auto");
        const buffer = Buffer.from(await file.arrayBuffer());
        try { validateSignature(buffer, name); } catch (error) { throw new HttpError(error.message); }
        const sourceAsset = `${randomUUID()}.${type}`;
        await mkdir(assetDirectory, { recursive: true });
        await writeFile(join(assetDirectory, sourceAsset), buffer);
        let project;
        try {
            project = createProject({ title: name.replace(/\.[^.]+$/, ""), type: isMedia ? (["mp4", "webm", "mpeg"].includes(type) ? "video" : "audio") : "document", sourceName: name, sourceAsset, sourceSize: file.size, language });
            enqueue(project.id, isMedia ? "transcribe" : "extract");
            return Response.json({ project: getProject(project.id) }, { status: 201 });
        } catch (error) {
            await unlink(join(assetDirectory, sourceAsset)).catch(() => { });
            if (project) deleteProject(project.id);
            throw error;
        }
    }
    const input = z.object({
        title: z.string().trim().min(1).max(120),
        type: z.enum(["text", "chat", "website"]),
        text: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
        url: z.string().max(2048).optional(),
    }).parse(await readJson(request));
    if (input.type === "website") {
        try { validateWebUrl(input.url); } catch (error) { throw new HttpError(error.message); }
        const project = createProject({ title: input.title, type: "website", sourceUrl: input.url });
        enqueue(project.id, "website");
        return Response.json({ project: getProject(project.id) }, { status: 201 });
    }
    if (!input.text) throw new HttpError("Add some text before creating a project.");
    return Response.json({ project: createProject({ title: input.title, type: input.type, text: input.text }) }, { status: 201 });
});