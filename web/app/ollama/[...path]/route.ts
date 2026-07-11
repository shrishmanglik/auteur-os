import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const allowed = new Set(["api/tags", "api/chat"]);

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const route = path.join("/");
  if (!allowed.has(route)) return NextResponse.json({ error: "Unsupported local-model route." }, { status: 404 });
  const base = process.env.AUTEUR_OLLAMA_URL || (process.env.NODE_ENV === "development" ? "http://127.0.0.1:11434" : "");
  if (!base) return NextResponse.json({ error: "No private model gateway is configured for the web runtime." }, { status: 503 });
  try {
    const upstream = await fetch(`${base.replace(/\/$/, "")}/${route}`, {
      method: request.method,
      headers: { Accept: request.headers.get("accept") || "application/json", "Content-Type": request.headers.get("content-type") || "application/json" },
      body: request.method === "GET" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      signal: AbortSignal.timeout(180_000),
    });
    return new NextResponse(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "Local model gateway unavailable.", detail: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
