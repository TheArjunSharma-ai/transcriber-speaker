import { z } from "zod";
import { getProject } from "./store.mjs";

export class HttpError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

export function guardLocal(request) {
    const host = request.headers.get("host")?.split(":")[0];
    if (!["127.0.0.1", "localhost"].includes(host)) throw new HttpError("This workspace only accepts local requests.", 403);
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.headers.get("host")) throw new HttpError("Cross-origin requests are not allowed.", 403);
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError("Cross-site requests are not allowed.", 403);
}

export function route(handler) {
    return async (request, context) => {
        try {
            guardLocal(request);
            return await handler(request, context);
        } catch (error) {
            if (error instanceof z.ZodError) return Response.json({ error: error.issues[0].message }, { status: 400 });
            if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
            if (error instanceof SyntaxError) return Response.json({ error: "Invalid request body." }, { status: 400 });
            console.error("API request failed:", error.message);
            return Response.json({ error: "The request could not be completed. Check the local server log." }, { status: 500 });
        }
    };
}

export async function readJson(request) {
    const text = await request.text();
    if (text.length > 500000) throw new HttpError("Request body is too large.", 413);
    return JSON.parse(text);
}

export async function requireProject(context) {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new HttpError("Project not found.", 404);
    const project = getProject(id);
    if (!project) throw new HttpError("Project not found.", 404);
    return project;
}

export function requireIdle(project) {
    if (["queued", "processing"].includes(project.status)) throw new HttpError("Wait for the current processing job to finish.", 409);
}