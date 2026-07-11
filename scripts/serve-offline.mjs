import { createServer, request as send } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneArtifact = resolve(appRoot, "AUTEUR-Studio.html");
const workspaceArtifact = resolve(appRoot, "..", "AUTEUR-Studio.html");
let artifact = standaloneArtifact;
try { await stat(artifact); } catch { artifact = workspaceArtifact; await stat(artifact); }

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
  if (!process.env.AUTEUR_NO_OPEN) {
    const opener = spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", `Start-Process '${url}'`], { detached: true, stdio: "ignore" });
    opener.unref();
  }
});
