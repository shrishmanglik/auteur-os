import { createServer, request as send } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createMcpRegistry, isTrustedMcpRequest, loadMcpRegistry } from "./mcp-registry.mjs";
import { createModelRouter, discoverOllamaModels } from "./model-router.mjs";
import { createStateVault } from "./state-vault.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneArtifact = resolve(appRoot, "AUTEUR-Studio.html");
const workspaceArtifact = resolve(appRoot, "..", "AUTEUR-Studio.html");
let artifact = standaloneArtifact;
try { await stat(artifact); } catch { artifact = workspaceArtifact; await stat(artifact); }
const registryPath = process.env.AUTEUR_MCP_REGISTRY || resolve(appRoot, "mcp-servers.json");
const mcpRegistry = createMcpRegistry(await loadMcpRegistry(registryPath));
const modelRouter = createModelRouter(await discoverOllamaModels());
const stateVault = createStateVault(process.env.AUTEUR_STATE_PATH || resolve(appRoot, ".auteur", "state", "active-session.json"));

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function proxyOllama(request, response) {
  const upstream = new URL(request.url.replace(/^\/ollama/, ""), "http://127.0.0.1:11434");
  const outgoing = send(upstream, {
    method: request.method,
    headers: { ...request.headers, host: "127.0.0.1:11434", origin: "http://127.0.0.1" },
  }, (incoming) => {
    response.writeHead(incoming.statusCode || 502, incoming.headers);
    incoming.pipe(response);
  });
  outgoing.on("error", (error) => {
    response.writeHead(502, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: `Local Ollama is unavailable: ${error.message}` }));
  });
  request.pipe(outgoing);
}

const server = createServer(async (request, response) => {
  if (request.url?.startsWith("/ollama/")) return proxyOllama(request, response);
  if (mcpRegistry.handle(request, response)) return;
  if (await stateVault(request, response)) return;
  if (request.url === "/api/models/roles" && request.method === "GET") return isTrustedMcpRequest(request) ? json(response, 200, modelRouter.get()) : json(response, 403, { error: "Model routing is available only to this AUTEUR runtime." });
  if (request.url === "/api/models/refresh" && request.method === "POST") return isTrustedMcpRequest(request) ? json(response, 200, await modelRouter.refresh()) : json(response, 403, { error: "Model routing is available only to this AUTEUR runtime." });
  if (request.url === "/favicon.ico") { response.writeHead(204); return response.end(); }
  try {
    const html = await readFile(artifact);
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(html);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start AUTEUR offline server.");
  const url = `http://127.0.0.1:${address.port}/`;
  console.log(`AUTEUR is running at ${url}`);
  const routes = modelRouter.get().roles;
  console.log(`Model roles: screenplay=${routes.screenplay.selected || "unavailable"}, promptPacket=${routes.promptPacket.selected || "unavailable"}, vision=${routes.vision.selected || "unavailable"}`);
  if (!process.env.AUTEUR_NO_OPEN) {
    const [command, args] = process.platform === "win32"
      ? ["powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", `Start-Process '${url}'`]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
    const opener = spawn(command, args, { detached: true, stdio: "ignore" });
    // Auto-open is a convenience: if no opener exists, keep serving the printed URL.
    opener.on("error", () => console.log("Could not open a browser automatically - use the URL above."));
    opener.unref();
  }
});
