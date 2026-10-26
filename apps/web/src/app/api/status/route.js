import { workerOnline } from "@/lib/store.mjs";
import { route } from "@/lib/http.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async () => Response.json({ workerOnline: workerOnline(), speechConfigured: Boolean(process.env.OPENAI_API_KEY), mode: "local" }, { headers: { "Cache-Control": "no-store" } }));