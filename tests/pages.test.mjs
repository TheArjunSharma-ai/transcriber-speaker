import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/pages/package.json", import.meta.url));
require("fake-indexeddb/auto");
const { browserRequest } = await import("../apps/pages/src/browser-api.mjs");

test("Pages projects persist with revision protection, export, and deletion", async () => {
  const created = await browserRequest("/api/projects", { method: "POST", body: JSON.stringify({ title: "Browser project", type: "text", text: "Original text" }) });
  assert.equal(created.status, 201);
  const { project } = await created.json();
  const path = `/api/projects/${project.id}`;
  const input = { title: "Updated title", text: "Edited text", revision: 1, segments: [] };
  const edited = await browserRequest(path, { method: "PATCH", body: JSON.stringify(input) });
  assert.equal(edited.status, 200);
  assert.equal((await (await browserRequest(path)).json()).project.text, "Edited text");
  const stale = await browserRequest(path, { method: "PATCH", body: JSON.stringify(input) });
  assert.equal(stale.status, 409);
  assert.equal(await (await browserRequest(`${path}/export?format=txt`)).text(), "Edited text");
  assert.equal((await browserRequest(`${path}/export?format=srt`)).status, 400);
  await browserRequest(path, { method: "DELETE" });
  assert.equal((await browserRequest(path)).status, 404);
});

test("Pages imports local text documents without a backend", async () => {
  const form = new FormData();
  form.set("file", new File(["Text extracted in the browser."], "notes.txt"));
  const created = await browserRequest("/api/projects", { method: "POST", body: form });
  assert.equal(created.status, 201);
  const { project } = await created.json();
  assert.equal(project.type, "document");
  assert.equal(project.text, "Text extracted in the browser.");
  assert.equal(await (await browserRequest(`/api/projects/${project.id}/assets/source`)).text(), project.text);
  await browserRequest(`/api/projects/${project.id}`, { method: "DELETE" });
});

test("Pages rejects server-only imports and reports browser mode", async () => {
  const result = await browserRequest("/api/projects", { method: "POST", body: JSON.stringify({ title: "Website", type: "website", url: "https://example.com" }) });
  assert.equal(result.status, 400);
  assert.equal((await (await browserRequest("/api/status")).json()).mode, "browser");
});