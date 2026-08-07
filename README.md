# AUTEUR OS

> [!IMPORTANT]
> This repository is the preserved historical AUTEUR application prototype and is no longer the current development surface. The canonical, maintained framework is [shrishmanglik/auteur-frameworks](https://github.com/shrishmanglik/auteur-frameworks). The reviewed consolidation landed in canonical merge commit [`50ba5e1`](https://github.com/shrishmanglik/auteur-frameworks/commit/50ba5e1f9d5e7279ee241a070f9d747818726f20), and its [repository consolidation record](https://github.com/shrishmanglik/auteur-frameworks/blob/50ba5e1f9d5e7279ee241a070f9d747818726f20/docs/repository-consolidation.md) classifies every reusable, retired, and private-research surface. Use the canonical repository for new work, issues, and pull requests.

A local-first AI production workspace for developing an idea into a treatment, screenplay, scene and shot plan, storyboard direction, continuity system, sound plan, and provider-ready prompt packet.

## Run

Requirements: Node.js 20+ and Ollama running locally with at least one supported model.

```powershell
npm install
npm run build:offline
.\Launch-AUTEUR.cmd
```

The launcher serves the self-contained offline application through a loopback-only HTTP server and proxies local Ollama requests. Opening `AUTEUR-Studio.html` directly is not the supported intelligence path because browsers block local-model requests from a `file://` origin.

## MCP Server Registry

The launcher also exposes a local MCP registry. Configure servers in `mcp-servers.json`:

```json
{
  "servers": [
    {
      "id": "local-tools",
      "name": "Local creative tools",
      "transport": "streamable-http",
      "url": "http://127.0.0.1:7331/mcp"
    }
  ]
}
```

- `GET /api/mcp/servers` returns sanitized registry metadata.
- `/mcp/{id}` forwards MCP HTTP and Streamable HTTP requests.
- Remote endpoints are rejected unless the entry sets `"allowRemote": true`.
- Secret headers can reference environment variables through `headersFromEnv`; secret values are never returned by the registry.
- Stdio execution is intentionally disabled because arbitrary child-process launch is outside the current security boundary.

## Local Model Routing

At startup the launcher queries Ollama's `/api/tags` endpoint and deterministically maps local models to five roles:

- `fastDraft`: low-latency ideation.
- `screenplay`: treatment, dialogue, and screenplay writing, preferring capable models near 8B parameters.
- `promptPacket`: dense structured packet generation, preferring larger general models and quantized equivalents.
- `creativeDirector`: highest-quality general production reasoning.
- `vision`: reference-image and storyboard-frame analysis.

`GET /api/models/roles` returns discovered metadata and ranked candidates. `POST /api/models/refresh` re-runs discovery. Cloud-backed Ollama entries are excluded from automatic local routing, and creators retain manual model override in the UI.

## Crash-Safe State Recovery

AUTEUR continuously snapshots the project and active workspace into IndexedDB. The snapshot includes selected scene and shot, workspace mode, inspector state, prompt tab, command draft, preview playhead, and storyboard-preview state. On startup, malformed records are ignored and the newest valid snapshot is restored automatically.

The offline launcher additionally mirrors snapshots to `.auteur/state/active-session.json` through a same-origin-only local endpoint. Writes use a temporary file plus atomic rename, so a process crash cannot leave a half-written recovery file. Existing localStorage projects are migrated into IndexedDB on first load.

## Development

```powershell
npm run dev
npm run check
```

## Web Runtime

The same editor and intelligence core also run as a Next.js web application:

```powershell
npm --prefix web install
npm run dev:web
```

Production commands are `npm run build:web` and `npm run start:web`. The web runtime includes App Router metadata, installable PWA support, a health endpoint, corpus/media synchronization, server-side model-role discovery, and a restricted Ollama proxy. Set `AUTEUR_OLLAMA_URL` to a private Ollama-compatible gateway in hosted environments. Without it, the web product remains usable in deterministic/local-persistence mode and reports model execution as unavailable rather than fabricating provider state.

## Current Evidence Boundary

- The bundled intelligence data contains corpus-derived prompt and rendered-output findings.
- Provider execution is a manual handoff. The app does not claim that Sora, Veo, Runway, or image-provider jobs were submitted.
- Missing source, audio, provenance, and provider state remains unknown rather than inferred.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
