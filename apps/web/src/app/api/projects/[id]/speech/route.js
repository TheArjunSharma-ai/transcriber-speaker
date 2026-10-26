import { z } from "zod";
import { enqueue, getProject } from "@/lib/store.mjs";
import { SPEECH_VOICES } from "@/lib/content.mjs";
import { HttpError, readJson, requireIdle, requireProject, route } from "@/lib/http.mjs";

export const runtime = "nodejs";
export const POST = route(async (request, context) => {
    const project = await requireProject(context);
    requireIdle(project);
    if (!process.env.OPENAI_API_KEY) throw new HttpError("Set OPENAI_API_KEY and restart both services to enable downloadable audio.", 503);
    const input = z.object({ voice: z.enum(SPEECH_VOICES), speed: z.number().min(0.5).max(2), consent: z.literal(true) }).parse(await readJson(request));
    if (!project.text.trim()) throw new HttpError("This project has no text to speak.");
    if (project.text.length > 20000) throw new HttpError("Downloadable speech is limited to 20,000 characters per project.");
    enqueue(project.id, "speech", { voice: input.voice, speed: input.speed });
    return Response.json({ project: getProject(project.id) }, { status: 202 });
});