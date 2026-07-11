import { request as sendHttp } from "node:http";
import { request as sendHttps } from "node:https";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function isLoopbackHost(hostname) {
  if (LOOPBACK_NAMES.has(hostname.toLowerCase())) return true;
  if (isIP(hostname) === 4) return hostname.startsWith("127.");
  return false;
}

export function normalizeRegistry(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.servers)) throw new Error("MCP registry must contain a servers array.");
  const seen = new Set();
  const servers = value.servers.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`MCP server ${index + 1} must be an object.`);
    const id = String(entry.id || "").trim();
    if (!ID_PATTERN.test(id)) throw new Error(`MCP server ${index + 1} has an invalid id.`);
    if (seen.has(id)) throw new Error(`MCP server id '${id}' is duplicated.`);
    seen.add(id);
    const transport = String(entry.transport || "http").toLowerCase();
    if (!["http", "streamable-http", "stdio"].includes(transport)) throw new Error(`MCP server '${id}' has an unsupported transport.`);
    let url = null;
    if (transport !== "stdio") {
      url = new URL(String(entry.url || ""));
      if (!["http:", "https:"].includes(url.protocol)) throw new Error(`MCP server '${id}' must use http or https.`);
      if (!isLoopbackHost(url.hostname) && entry.allowRemote !== true) throw new Error(`MCP server '${id}' is remote and requires allowRemote: true.`);
    }
    const headersFromEnv = entry.headersFromEnv && typeof entry.headersFromEnv === "object" ? entry.headersFromEnv : {};
    return {
      id,
      name: String(entry.name || id),
      description: String(entry.description || ""),
      transport,
      url: url?.toString() || null,
      enabled: entry.enabled !== false,
      allowRemote: entry.allowRemote === true,
      headersFromEnv: Object.fromEntries(Object.entries(headersFromEnv).map(([header, variable]) => [String(header), String(variable)])),
    };
  });
  return { version: 1, servers };
}

export async function loadMcpRegistry(path) {
  try {
    return normalizeRegistry(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 1, servers: [] };
    throw error;
  }
}

export function publicMcpServer(server, runtime = {}) {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    transport: server.transport,
    enabled: server.enabled,
    executable: server.enabled && server.transport !== "stdio",
    location: server.url ? (server.allowRemote ? "remote" : "loopback") : "local-process",
    status: runtime.status || (server.transport === "stdio" ? "unsupported" : server.enabled ? "configured" : "disabled"),
    lastRequestAt: runtime.lastRequestAt || null,
    lastError: runtime.lastError || null,
  };
}

export function isTrustedMcpRequest(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = String(request.headers.host || "");
    return parsed.protocol === "http:" && parsed.host === host && isLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function createMcpRegistry(registry, { env = process.env } = {}) {
  const byId = new Map(registry.servers.map((server) => [server.id, server]));
  const runtime = new Map();

  function list() {
    return registry.servers.map((server) => publicMcpServer(server, runtime.get(server.id)));
  }

  function proxy(request, response, server) {
    if (!server.enabled) return json(response, 409, { error: "MCP server is disabled." });
    if (server.transport === "stdio") return json(response, 501, { error: "Stdio MCP execution is intentionally disabled in this runtime." });
    const headers = { ...request.headers, host: new URL(server.url).host };
    delete headers.origin;
    delete headers.referer;
    delete headers.cookie;
    for (const [header, variable] of Object.entries(server.headersFromEnv)) {
      if (env[variable]) headers[header] = env[variable];
    }
    const transport = server.url.startsWith("https:") ? sendHttps : sendHttp;
    const outgoing = transport(server.url, { method: request.method, headers }, (incoming) => {
      const responseHeaders = { ...incoming.headers, "cache-control": "no-store" };
      response.writeHead(incoming.statusCode || 502, responseHeaders);
      incoming.pipe(response);
      runtime.set(server.id, { status: incoming.statusCode && incoming.statusCode < 500 ? "reachable" : "error", lastRequestAt: new Date().toISOString(), lastError: incoming.statusCode && incoming.statusCode >= 500 ? `HTTP ${incoming.statusCode}` : null });
    });
    outgoing.setTimeout(120_000, () => outgoing.destroy(new Error("MCP request timed out.")));
    outgoing.on("error", (error) => {
      runtime.set(server.id, { status: "unreachable", lastRequestAt: new Date().toISOString(), lastError: error.message });
      if (!response.headersSent) json(response, 502, { error: `MCP server '${server.id}' is unavailable.`, detail: error.message });
      else response.destroy(error);
    });
    request.pipe(outgoing);
  }

  function handle(request, response) {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname === "/api/mcp/servers" && request.method === "GET") {
      if (!isTrustedMcpRequest(request)) return json(response, 403, { error: "MCP registry requests must originate from this AUTEUR runtime." });
      json(response, 200, { protocolVersion: "2025-03-26", servers: list() });
      return true;
    }
    const match = url.pathname.match(/^\/mcp\/([a-z0-9-]+)$/);
    if (!match) return false;
    if (!isTrustedMcpRequest(request)) { json(response, 403, { error: "MCP requests must originate from this AUTEUR runtime." }); return true; }
    const server = byId.get(match[1]);
    if (!server) { json(response, 404, { error: "Unknown MCP server." }); return true; }
    proxy(request, response, server);
    return true;
  }

  return { handle, list };
}
