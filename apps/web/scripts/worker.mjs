import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { assetDirectory, claimJob, finishJob, getProject, updateProject, heartbeat, interruptRunningJobs } from "../src/lib/store.mjs";
import { extractDocument } from "../src/lib/extraction.mjs";
import { importWebsite } from "../src/lib/website.mjs";
import { generateSpeech, transcribe } from "../src/lib/providers.mjs";
import { MAX_TEXT_LENGTH } from "../src/lib/content.mjs";

let stopping = false;
let busy = false;
let timer;
let heartbeatTimer;

async function processNext() {
  if (busy || stopping) return;
  const job = claimJob();
  if (!job) return;
  busy = true;
  let generatedAsset;
  try {
    const project = getProject(job.projectId);
    if (!project) return;
    updateProject(project.id, { status: "processing", stage: "Reading source", error: null });
    let changes;
    if (job.type === "website") {
      const article = await importWebsite(project.sourceUrl);
      if (article.text.length > MAX_TEXT_LENGTH) throw new Error("Website exceeds the 100,000 character limit.");
      changes = { text: article.text, title: article.title.slice(0, 120), revision: project.revision + 1 };
    } else if (job.type === "extract") {
      const buffer = await readFile(join(assetDirectory, project.sourceAsset));
      const text = await extractDocument(buffer, project.sourceName);
      changes = { text, revision: project.revision + 1 };
    } else if (job.type === "transcribe") {
      updateProject(project.id, { stage: "Transcribing with speech provider" });
      const buffer = await readFile(join(assetDirectory, project.sourceAsset));
      changes = { ...await transcribe(buffer, project.sourceName, project.language), revision: project.revision + 1 };
    } else if (job.type === "speech") {
      const audio = await generateSpeech(project.text, job.input.voice, job.input.speed, (stage) => updateProject(project.id, { stage }));
      generatedAsset = `${randomUUID()}.wav`;
      await writeFile(join(assetDirectory, generatedAsset), audio);
      changes = { speechAsset: generatedAsset, speechRevision: project.revision, speechVoice: job.input.voice };
    } else {
      throw new Error("Unknown processing job.");
    }
    updateProject(project.id, { ...changes, status: "ready", stage: null, error: null });
    if (job.type === "speech" && project.speechAsset) await unlink(join(assetDirectory, project.speechAsset)).catch(() => {});
    finishJob(job.id, "completed");
    console.log(`Completed ${job.type}: ${job.id}`);
  } catch (error) {
    if (generatedAsset) await unlink(join(assetDirectory, generatedAsset)).catch(() => {});
    if (getProject(job.projectId)) updateProject(job.projectId, { status: "failed", stage: null, error: error.message || "Processing failed. Please retry." });
    finishJob(job.id, "failed");
    console.error(`Failed ${job.type}: ${job.id}: ${error.message}`);
  } finally {
    busy = false;
    if (stopping) shutdown();
  }
}

function shutdown() {
  stopping = true;
  clearInterval(timer);
  clearInterval(heartbeatTimer);
  if (!busy) process.exit(0);
}

interruptRunningJobs();
heartbeat();
heartbeatTimer = setInterval(heartbeat, 3000);
timer = setInterval(() => { processNext().catch((error) => console.error("Worker error:", error.message)); }, 1000);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
console.log("Transcriber & Speaker worker ready. Run only one worker for this local workspace.");
await processNext();