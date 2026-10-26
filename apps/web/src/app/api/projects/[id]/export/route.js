import { exportSubtitles } from "@/lib/content.mjs";
import { HttpError, requireProject, route } from "@/lib/http.mjs";

export const runtime = "nodejs";
export const GET = route(async (request, context) => {
    const project = await requireProject(context);
    const format = new URL(request.url).searchParams.get("format") || "txt";
    if (!["txt", "srt", "vtt"].includes(format)) throw new HttpError("Choose TXT, SRT, or VTT.");
    let text;
    try { text = format === "txt" ? project.text : exportSubtitles(project.segments, format); } catch (error) { throw new HttpError(error.message); }
    const name = project.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "transcript";
    return new Response(text, { headers: { "Content-Type": format === "vtt" ? "text/vtt; charset=utf-8" : "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.${format}"`, "Cache-Control": "no-store" } });
});