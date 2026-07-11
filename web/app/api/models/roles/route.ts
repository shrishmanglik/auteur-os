import { NextResponse } from "next/server";
import { discoverOllamaModels } from "../../../../../scripts/model-router.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = process.env.AUTEUR_OLLAMA_URL || (process.env.NODE_ENV === "development" ? "http://127.0.0.1:11434" : "");
  if (!base) return NextResponse.json({ available: false, models: [], roles: {}, error: "No private model gateway is configured for the web runtime." }, { status: 503 });
  const result = await discoverOllamaModels({ endpoint: `${base.replace(/\/$/, "")}/api/tags`, timeoutMs: 8_000 });
  return NextResponse.json(result, { status: result.available ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
