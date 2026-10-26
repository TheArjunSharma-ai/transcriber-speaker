import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "speaker-store-"));
process.env.DATA_DIR = directory;
const store = await import("../apps/web/src/lib/store.mjs");

test("projects persist edits with revision conflict protection", () => {
  const project = store.createProject({ title: "Notes", text: "First draft" });
  const edited = store.updateProject(project.id, { text: "Second draft", revision: 2 }, 1);
  assert.equal(edited.text, "Second draft");
  assert.throws(() => store.updateProject(project.id, { text: "Stale" }, 1), /changed/);
  assert.equal(store.getProject(project.id).text, "Second draft");
  store.deleteProject(project.id);
  assert.equal(store.getProject(project.id), null);
});

test("queue claims once and prevents duplicate project jobs", () => {
  const project = store.createProject({ title: "Processing" });
  const job = store.enqueue(project.id, "extract");
  assert.throws(() => store.enqueue(project.id, "extract"), /already/);
  assert.equal(store.claimJob().id, job.id);
  assert.equal(store.claimJob(), null);
  store.finishJob(job.id, "completed");
  store.enqueue(project.id, "speech");
  assert.equal(store.claimJob().type, "speech");
  store.interruptRunningJobs();
  assert.equal(store.getProject(project.id).status, "failed");
  store.deleteProject(project.id);
});

test.after(async () => {
  await rm(directory, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
});