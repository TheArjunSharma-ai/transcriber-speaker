import { enqueue, getProject } from "@/lib/store.mjs";
import { HttpError, requireIdle, requireProject, route } from "@/lib/http.mjs";

export const runtime = "nodejs";
export const POST = route(async (_request, context) => {
    const project = await requireProject(context);
    requireIdle(project);
    if (project.status !== "failed" || !project.lastJobType) throw new HttpError("There is no failed job to retry.");
    if (["transcribe", "speech"].includes(project.lastJobType) && !process.env.OPENAI_API_KEY) throw new HttpError("Configure OPENAI_API_KEY before retrying.", 503);
    enqueue(project.id, project.lastJobType, project.lastJobInput);
    return Response.json({ project: getProject(project.id) }, { status: 202 });
});