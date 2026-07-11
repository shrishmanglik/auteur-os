import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    product: "AUTEUR Studio",
    runtime: "web",
    persistence: "browser-local",
    providerExecution: "manual-handoff",
    localModelGateway: Boolean(process.env.AUTEUR_OLLAMA_URL) || process.env.NODE_ENV === "development",
  }, { headers: { "Cache-Control": "no-store" } });
}
