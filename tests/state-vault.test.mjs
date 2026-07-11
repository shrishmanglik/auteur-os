import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";
import { createStateVault } from "../scripts/state-vault.mjs";

test("state vault atomically stores and restores a local snapshot", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "auteur-state-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "state", "active.json");
  const vault = createStateVault(path);
  const server = createServer(async (request, response) => { if (!await vault(request, response)) { response.writeHead(404); response.end(); } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/api/state/snapshot`;
  const snapshot = { version: 1, savedAt: "2026-07-11T12:00:00.000Z", project: { id: "project" }, workspace: { mode: "story" } };
  const saved = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot) });
  assert.equal(saved.status, 200);
  assert.deepEqual(await fetch(url).then((response) => response.json()), snapshot);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), snapshot);
});

test("state vault rejects malformed snapshots and foreign origins", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "auteur-state-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const vault = createStateVault(join(root, "active.json"));
  const server = createServer(async (request, response) => { await vault(request, response); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/api/state/snapshot`;
  assert.equal((await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 400);
  assert.equal((await fetch(url, { headers: { Origin: "https://malicious.example" } })).status, 403);
});
