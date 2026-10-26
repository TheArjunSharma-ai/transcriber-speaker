import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { assetDirectory, deleteProject, updateProject } from "@/lib/store.mjs";
import { MAX_TEXT_LENGTH } from "@/lib/content.mjs";
import { HttpError, readJson, requireIdle, requireProject, route } from "@/lib/http.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (_request, context) => Response.json({ project: await requireProject(context) }, { headers: { "Cache-Control": "no-store" } }));

export const PATCH = route(async (request, context) => {
    const project = await requireProject(context);
    requireIdle(project);
    const input = z.object({
        title: z.string().trim().min(1).max(120),
        text: z.string().max(MAX_TEXT_LENGTH),
        revision: z.number().int().positive(),
        segments: z.array(z.object({ start: z.number().nonnegative(), end: z.number().positive(), text: z.string().max(MAX_TEXT_LENGTH) })).max(10000).optional(),
    }).parse(await readJson(request));
    const segments = input.segments || [];
    if (segments.length !== project.segments.length || segments.some((segment, index) => segment.start !== project.segments[index].start || segment.end !== project.segments[index].end)) {
        throw new HttpError("Transcript timing cannot be changed in this editor.");
    }
    const text = segments.length ? segments.map((segment) => segment.text.trim()).join(" ") : input.text;
    if (text.length > MAX_TEXT_LENGTH) throw new HttpError("Text exceeds the 100,000 character limit.");
    const changed = text !== project.text;
    try {
        return Response.json({
            project: updateProject(project.id, {
                title: input.title, text, segments, revision: project.revision + 1,
                ...(!changed && project.speechRevision === project.revision ? { speechRevision: project.revision + 1 } : {}),
            }, input.revision)
        });
    } catch (error) {
        if (error.message.includes("changed")) throw new HttpError(error.message, 409);
        throw error;
    }
});

export const DELETE = route(async (_request, context) => {
    const project = await requireProject(context);
    requireIdle(project);
    deleteProject(project.id);
    await Promise.all([project.sourceAsset, project.speechAsset].filter(Boolean).map((name) => unlink(join(assetDirectory, name)).catch(() => { })));
    return Response.json({ deleted: true });
});