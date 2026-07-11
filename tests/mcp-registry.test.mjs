import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createMcpRegistry, isTrustedMcpRequest, normalizeRegistry, publicMcpServer } from "../scripts/mcp-registry.mjs";

test("registry rejects remote servers unless explicitly allowed", () => {
  assert.throws(() => normalizeRegistry({ servers: [{ id: "remote", transport: "http", url: "https://example.com/mcp" }] }), /allowRemote/);
  const registry = normalizeRegistry({ servers: [{ id: "remote", transport: "streamable-http", url: "https://example.com/mcp", allowRemote: true }] });
  assert.equal(registry.servers[0].allowRemote, true);
});

test("registry rejects duplicate and unsafe identifiers", () => {
  assert.throws(() => normalizeRegistry({ servers: [{ id: "../bad", url: "http://127.0.0.1:1/mcp" }] }), /invalid id/);
  assert.throws(() => normalizeRegistry({ servers: [{ id: "same", url: "http://127.0.0.1:1/mcp" }, { id: "same", url: "http://127.0.0.1:2/mcp" }] }), /duplicated/);
});

test("public registry never exposes endpoint URLs or environment variable names", () => {
  const server = normalizeRegistry({ servers: [{ id: "files", url: "http://127.0.0.1:3001/mcp", headersFromEnv: { Authorization: "SECRET_TOKEN" } }] }).servers[0];
  const value = publicMcpServer(server);
  assert.equal("url" in value, false);
  assert.equal(JSON.stringify(value).includes("SECRET_TOKEN"), false);
});

test("same-origin loopback requests are trusted and foreign origins are rejected", () => {
  assert.equal(isTrustedMcpRequest({ headers: { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" } }), true);
  assert.equal(isTrustedMcpRequest({ headers: { host: "127.0.0.1:4173", origin: "https://malicious.example" } }), false);
});

test("registry lists and forwards an MCP JSON-RPC request", async (context) => {
  const upstream = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      response.writeHead(200, { "Content-Type": "application/json", "Mcp-Session-Id": "test-session" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: JSON.parse(body).id, result: { tools: [] } }));
    });
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  context.after(() => upstream.close());
  const address = upstream.address();
  const registry = createMcpRegistry(normalizeRegistry({ servers: [{ id: "test", transport: "streamable-http", url: `http://127.0.0.1:${address.port}/mcp` }] }));
  const gateway = createServer((request, response) => { if (!registry.handle(request, response)) { response.writeHead(404); response.end(); } });
  gateway.listen(0, "127.0.0.1");
  await once(gateway, "listening");
  context.after(() => gateway.close());
  const gatewayAddress = gateway.address();
  const base = `http://127.0.0.1:${gatewayAddress.port}`;
  const listed = await fetch(`${base}/api/mcp/servers`).then((response) => response.json());
  assert.equal(listed.servers[0].id, "test");
  const rpc = await fetch(`${base}/mcp/test`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" }) });
  assert.equal(rpc.status, 200);
  assert.equal(rpc.headers.get("mcp-session-id"), "test-session");
  assert.deepEqual(await rpc.json(), { jsonrpc: "2.0", id: 7, result: { tools: [] } });
});
