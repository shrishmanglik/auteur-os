import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(webRoot, "..", "public");
const target = resolve(webRoot, "public");
await mkdir(target, { recursive: true });
for (const name of ["data", "media"]) {
  await rm(resolve(target, name), { recursive: true, force: true });
  await cp(resolve(source, name), resolve(target, name), { recursive: true });
}
console.log("Synced AUTEUR corpus data and media into the web runtime.");
