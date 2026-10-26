import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { assetDirectory } from "@/lib/store.mjs";
import { extension } from "@/lib/content.mjs";
import { HttpError, requireProject, route } from "@/lib/http.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async (request, context) => {
    const project = await requireProject(context);
    const { kind } = await context.params;
    const name = kind === "source" ? project.sourceAsset : kind === "speech" ? project.speechAsset : null;
    if (!name) throw new HttpError("Asset not found.", 404);
    const path = join(assetDirectory, name);
    let size;
    try { size = (await stat(path)).size; } catch { throw new HttpError("Asset not found.", 404); }
    const types = { mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", m4a: "audio/mp4", webm: "video/webm", ogg: "audio/ogg", flac: "audio/flac", mpeg: "video/mpeg", pdf: "application/pdf" };
    const headers = { "Content-Type": types[extension(name)] || "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
    if (new URL(request.url).searchParams.get("download") === "1") headers["Content-Disposition"] = `attachment; filename="${kind === "speech" ? "narration.wav" : "source." + extension(name)}"`;
    const range = request.headers.get("range");
    if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
        const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
        const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
        if (start >= size || end < start) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
        return new Response(Readable.toWeb(createReadStream(path, { start, end })), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
    }
    return new Response(Readable.toWeb(createReadStream(path)), { headers: { ...headers, "Content-Length": String(size) } });
});