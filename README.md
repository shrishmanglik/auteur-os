# AUTEUR OS

A local-first AI production workspace for developing an idea into a treatment, screenplay, scene and shot plan, storyboard direction, continuity system, sound plan, and provider-ready prompt packet.

## Run

Requirements: Node.js 20+ and Ollama running locally with at least one supported model.

```powershell
npm install
npm run build:offline
.\Launch-AUTEUR.cmd
```

The launcher serves the self-contained offline application through a loopback-only HTTP server and proxies local Ollama requests. Opening `AUTEUR-Studio.html` directly is not the supported intelligence path because browsers block local-model requests from a `file://` origin.

## Development

```powershell
npm run dev
npm run check
```

## Current Evidence Boundary

- The bundled intelligence data contains corpus-derived prompt and rendered-output findings.
- Provider execution is a manual handoff. The app does not claim that Sora, Veo, Runway, or image-provider jobs were submitted.
- Missing source, audio, provenance, and provider state remains unknown rather than inferred.

## License

Proprietary. Copyright Million Dollar AI Studio. All rights reserved.
