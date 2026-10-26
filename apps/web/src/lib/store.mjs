import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export const dataDirectory = resolve(process.env.DATA_DIR || join(process.cwd(), "..", "..", ".data"));
export const assetDirectory = join(dataDirectory, "assets");
let connection;

function getDatabase() {
    if (connection) return connection;
    mkdirSync(assetDirectory, { recursive: true });
    const database = new DatabaseSync(join(dataDirectory, "studio.sqlite"));
    try {
        database.exec("PRAGMA busy_timeout = 5000;");
        const deadline = Date.now() + 5000;
        const contention = new Int32Array(new SharedArrayBuffer(4));
        while (true) {
            try {
                database.exec("PRAGMA journal_mode = WAL;");
                break;
            } catch (error) {
                if ((error.errcode & 255) !== 5 || Date.now() >= deadline) throw error;
                Atomics.wait(contention, 0, 0, 10);
            }
        }
        database.exec(`
                    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
                    CREATE TABLE IF NOT EXISTS jobs (
                        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, status TEXT NOT NULL,
                        created_at TEXT NOT NULL, payload TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, created_at);
                    CREATE TABLE IF NOT EXISTS heartbeat (id INTEGER PRIMARY KEY CHECK (id = 1), seen_at INTEGER NOT NULL);
                `);
        connection = database;
        return connection;
    } catch (error) {
        database.close();
        throw error;
    }
}

export function listProjects() {
    const database = getDatabase();
    return database.prepare("SELECT payload FROM projects").all()
        .map((row) => JSON.parse(row.payload)).sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
}

export function getProject(id) {
    const database = getDatabase();
    const row = database.prepare("SELECT payload FROM projects WHERE id = ?").get(id);
    return row ? JSON.parse(row.payload) : null;
}

export function createProject(input) {
    const database = getDatabase();
    const project = {
        id: randomUUID(), title: "Untitled project", type: "text", text: "", segments: [],
        status: "ready", error: null, revision: 1, createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), ...input,
    };
    database.prepare("INSERT INTO projects(id, payload) VALUES (?, ?)").run(project.id, JSON.stringify(project));
    return project;
}

export function updateProject(id, changes, expectedRevision) {
    const database = getDatabase();
    database.exec("BEGIN IMMEDIATE");
    try {
        const current = getProject(id);
        if (!current) throw new Error("Project not found.");
        if (expectedRevision !== undefined && current.revision !== expectedRevision) {
            throw new Error("This project changed. Reload it before saving.");
        }
        const project = { ...current, ...changes, id, updatedAt: new Date().toISOString() };
        database.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(project), id);
        database.exec("COMMIT");
        return project;
    } catch (error) {
        database.exec("ROLLBACK");
        throw error;
    }
}

export function deleteProject(id) {
    const database = getDatabase();
    database.exec("BEGIN IMMEDIATE");
    try {
        database.prepare("DELETE FROM jobs WHERE project_id = ?").run(id);
        database.prepare("DELETE FROM projects WHERE id = ?").run(id);
        database.exec("COMMIT");
    } catch (error) {
        database.exec("ROLLBACK");
        throw error;
    }
}

export function enqueue(projectId, type, input = {}) {
    const database = getDatabase();
    const job = { id: randomUUID(), projectId, type, input, createdAt: new Date().toISOString() };
    database.exec("BEGIN IMMEDIATE");
    try {
        const project = getProject(projectId);
        if (!project) throw new Error("Project not found.");
        const active = database.prepare("SELECT id FROM jobs WHERE project_id = ? AND status IN ('queued', 'running')").get(projectId);
        if (active) throw new Error("This project already has a processing job.");
        database.prepare("INSERT INTO jobs VALUES (?, ?, 'queued', ?, ?)").run(job.id, projectId, job.createdAt, JSON.stringify(job));
        project.status = "queued";
        project.lastJobType = type;
        project.lastJobInput = input;
        project.stage = type === "speech" ? "Waiting to generate audio" : "Waiting to process source";
        project.error = null;
        database.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(project), projectId);
        database.exec("COMMIT");
        return job;
    } catch (error) {
        database.exec("ROLLBACK");
        throw error;
    }
}

export function claimJob() {
    const database = getDatabase();
    database.exec("BEGIN IMMEDIATE");
    try {
        const row = database.prepare("SELECT id, payload FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1").get();
        if (row) database.prepare("UPDATE jobs SET status = 'running' WHERE id = ?").run(row.id);
        database.exec("COMMIT");
        return row ? JSON.parse(row.payload) : null;
    } catch (error) {
        database.exec("ROLLBACK");
        throw error;
    }
}

export function finishJob(id, status) {
    const database = getDatabase();
    database.prepare("UPDATE jobs SET status = ? WHERE id = ?").run(status, id);
}

export function interruptRunningJobs() {
    const database = getDatabase();
    const rows = database.prepare("SELECT project_id FROM jobs WHERE status = 'running'").all();
    for (const row of rows) {
        if (getProject(row.project_id)) updateProject(row.project_id, { status: "failed", error: "Processing was interrupted. Retry manually to avoid duplicate provider charges." });
    }
    database.prepare("UPDATE jobs SET status = 'failed' WHERE status = 'running'").run();
}

export function heartbeat() {
    const database = getDatabase();
    database.prepare("INSERT INTO heartbeat VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET seen_at = excluded.seen_at").run(Date.now());
}

export function workerOnline() {
    const database = getDatabase();
    const row = database.prepare("SELECT seen_at FROM heartbeat WHERE id = 1").get();
    return Boolean(row && Date.now() - row.seen_at < 15000);
}