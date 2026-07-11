import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputsRoot = resolve(appRoot, "..");
const distRoot = join(appRoot, "dist");
const publicRoot = join(appRoot, "public");
const target = join(outputsRoot, "AUTEUR-Studio.html");
const standaloneTarget = join(appRoot, "AUTEUR-Studio.html");
const legacy = join(outputsRoot, "AUTEUR-Studio-legacy.html");

function escapeScript(value) {
  return value.replaceAll("</script", "<\\/script");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function walk(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

async function preserveLegacy() {
  try {
    await stat(legacy);
    return;
  } catch {}
  try {
    await stat(target);
  } catch {
    return; // fresh checkout: no prior offline build to preserve
  }
  await copyFile(target, legacy);
}

const distIndex = await readFile(join(distRoot, "index.html"), "utf8");
const scriptMatch = distIndex.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/);
const styleMatch = distIndex.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/);
if (!scriptMatch || !styleMatch) throw new Error("Vite output did not contain the expected script and stylesheet.");

const scriptPath = resolve(distRoot, scriptMatch[1]);
const stylePath = resolve(distRoot, styleMatch[1]);
const [bundle, styles, brainText, deltasText, promptBrainText, mediaFiles] = await Promise.all([
  readFile(scriptPath, "utf8"),
  readFile(stylePath, "utf8"),
  readFile(join(publicRoot, "data", "auteur-render-brain.json"), "utf8"),
  readFile(join(publicRoot, "data", "auteur-render-os-deltas.json"), "utf8"),
  readFile(join(publicRoot, "data", "auteur-prompt-brain.json"), "utf8"),
  walk(join(publicRoot, "media")),
]);

const mimeByExtension = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const mediaEntries = await Promise.all(mediaFiles.map(async (path) => {
  const key = `/media/${relative(join(publicRoot, "media"), path).split(sep).join("/")}`;
  const mime = mimeByExtension[extname(path).toLowerCase()];
  if (!mime) throw new Error(`Unsupported offline media type: ${path}`);
  const bytes = await readFile(path);
  return [key, `data:${mime};base64,${bytes.toString("base64")}`];
}));

const buildTime = new Date().toISOString();
const brainSha256 = sha256(brainText);
const deltasSha256 = sha256(deltasText);
const classicBundle = bundle.replaceAll("import.meta.url", "document.baseURI");
if (/\bimport\s*\(|\bimport\.meta\b|^\s*export\s/m.test(classicBundle)) throw new Error("Production bundle still contains module-only syntax.");
const bootstrap = escapeScript(`
globalThis.__AUTEUR_OFFLINE_DATA__ = { brain: ${brainText}, deltas: ${deltasText}, promptBrain: ${promptBrainText} };
globalThis.__AUTEUR_MEDIA__ = ${JSON.stringify(Object.fromEntries(mediaEntries))};
globalThis.__AUTEUR_OLLAMA_BASE__ = location.protocol === "file:" ? "http://127.0.0.1:11434" : "/ollama";
globalThis.__AUTEUR_OFFLINE_BUILD__ = ${JSON.stringify({ builtAt: buildTime, mediaFiles: mediaEntries.length })};
if (new URLSearchParams(location.search).has("legacy")) location.replace("./AUTEUR-Studio-legacy.html");
`);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#090a0c" />
<meta name="auteur-offline-build" content="${buildTime}" />
<meta name="auteur-render-brain-sha256" content="${brainSha256}" />
<meta name="auteur-render-deltas-sha256" content="${deltasSha256}" />
<meta name="auteur-offline-media-count" content="${mediaEntries.length}" />
<title>AUTEUR Studio - Offline OS</title>
<style>${styles}</style>
<script>${bootstrap}</script>
</head>
<body>
<div id="root"></div>
<script>${escapeScript(classicBundle)}</script>
</body>
</html>`;

await preserveLegacy();
await mkdir(dirname(target), { recursive: true });
await writeFile(target, html, "utf8");
await writeFile(standaloneTarget, html, "utf8");
if (/<script[^>]+src=|<link[^>]+rel=["']stylesheet/i.test(html)) throw new Error("Offline package contains an external script or stylesheet.");
if (html.includes("location.replace(\"http://127.0.0.1:4173/\")")) throw new Error("Offline package still contains the retired localhost redirect.");
console.log(JSON.stringify({ target, standaloneTarget, bytes: Buffer.byteLength(html), buildTime, mediaFiles: mediaEntries.length, brainSha256, deltasSha256 }, null, 2));
