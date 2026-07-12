import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isTrustedMcpRequest } from "./mcp-registry.mjs";

const MAX_BYTES = 25 * 1024 * 1024;

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Auteur-State-Vault": "1" });
  response.end(JSON.stringify(body));
}

async function body(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error("Snapshot exceeds the 25 MB local vault limit.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createStateVault(path) {
  return async function handle(request, response) {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/api/state/snapshot") return false;
    if (!isTrustedMcpRequest(request)) { json(response, 403, { error: "State snapshots are available only to this AUTEUR runtime." }); return true; }
    if (request.method === "GET") {
      try { json(response, 200, JSON.parse(await readFile(path, "utf8"))); }
      catch (error) { json(response, error?.code === "ENOENT" ? 200 : 500, error?.code === "ENOENT" ? null : { error: "Local snapshot could not be read." }); }
      return true;
    }
    if (request.method === "PUT") {
      try {
        const value = await body(request);
        if (!value || value.version !== 1 || typeof value.savedAt !== "string" || !value.project || !value.workspace) throw new Error("Snapshot schema is invalid.");
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.${process.pid}.tmp`;
        await writeFile(temporary, JSON.stringify(value), "utf8");
        await rename(temporary, path);
        json(response, 200, { saved: true, savedAt: value.savedAt });
      } catch (error) { json(response, 400, { error: error instanceof Error ? error.message : String(error) }); }
      return true;
    }
    json(response, 405, { error: "Method not allowed." });
    return true;
  };
}
