import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";

const directory = await mkdtemp(join(tmpdir(), "speaker-store-"));
process.env.DATA_DIR = directory;
const store = await import("../apps/web/src/lib/store.mjs");

test("importing the store does not initialize SQLite or create runtime directories", () => {
    assert.equal(existsSync(join(directory, "studio.sqlite")), false);
    assert.equal(existsSync(join(directory, "assets")), false);
});

test("concurrent first-use connections initialize one shared database", { timeout: 20000 }, async () => {
    const sharedDirectory = join(directory, "concurrent");
    const workers = [];
    const ready = [];
    const finished = [];
    try {
        for (let index = 0; index < 8; index += 1) {
            const worker = new Worker(`
        const { parentPort, workerData } = require("node:worker_threads");
        process.env.DATA_DIR = workerData.directory;
        import(workerData.module).then((store) => {
          parentPort.once("message", () => {
            store.createProject({ title: "Concurrent project" });
          });
          parentPort.postMessage("ready");
        });
      `, { eval: true, workerData: { directory: sharedDirectory, module: new URL("../apps/web/src/lib/store.mjs", import.meta.url).href } });
            workers.push(worker);
            ready.push(new Promise((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); }));
            finished.push(new Promise((resolve, reject) => {
                worker.once("error", reject);
                worker.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Store worker exited with code ${code}`)));
            }));
        }
        const completed = Promise.all(finished);
        await Promise.all(ready);
        for (const worker of workers) worker.postMessage("start");
        await completed;
        const database = new DatabaseSync(join(sharedDirectory, "studio.sqlite"));
        try {
            assert.equal(database.prepare("SELECT COUNT(*) AS count FROM projects").get().count, 8);
            assert.equal(database.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
        } finally {
            database.close();
        }
    } finally {
        await Promise.all(workers.map((worker) => worker.terminate()));
    }
});

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
    await rm(directory, { recursive: true, force: true, maxRetries: 3 }).catch(() => { });
});