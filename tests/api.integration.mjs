import test from "node:test";
import assert from "node:assert/strict";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const jsonHeaders = { "Content-Type": "application/json" };

test("live project create, update, conflict, export, security, and deletion", async () => {
    const created = await fetch(`${base}/api/projects`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ type: "text", title: "Integration test", text: "Original content" }) });
    assert.equal(created.status, 201);
    const { project } = await created.json();
    const endpoint = `${base}/api/projects/${project.id}`;
    try {
        const body = { title: "Renamed project", text: project.text, revision: project.revision, segments: [] };
        const renamed = await fetch(endpoint, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(body) });
        assert.equal(renamed.status, 200);
        const edited = (await renamed.json()).project;
        assert.equal(edited.revision, project.revision + 1);
        const stale = await fetch(endpoint, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(body) });
        assert.equal(stale.status, 409);
        const inventedTiming = await fetch(endpoint, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ ...body, revision: edited.revision, segments: [{ start: 0, end: 1, text: "Invented" }] }) });
        assert.equal(inventedTiming.status, 400);
        const exported = await fetch(`${endpoint}/export?format=txt`);
        assert.equal(await exported.text(), "Original content");
        const subtitle = await fetch(`${endpoint}/export?format=srt`);
        assert.equal(subtitle.status, 400);
        const crossOrigin = await fetch(endpoint, { headers: { Origin: "https://untrusted.example" } });
        assert.equal(crossOrigin.status, 403);
        const privateUrl = await fetch(`${base}/api/projects`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ type: "website", title: "Blocked", url: "http://169.254.169.254" }) });
        assert.equal(privateUrl.status, 400);
        const invalid = new FormData();
        invalid.set("file", new File(["Not a PDF"], "invalid.pdf"));
        assert.equal((await fetch(`${base}/api/projects`, { method: "POST", body: invalid })).status, 400);
    } finally {
        assert.equal((await fetch(endpoint, { method: "DELETE" })).status, 200);
        assert.equal((await fetch(endpoint)).status, 404);
    }
});