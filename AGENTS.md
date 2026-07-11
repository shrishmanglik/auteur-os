# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## AUTEUR Product Direction

- Source visual: `C:/Users/Shris/.codex/generated_images/019f4871-875b-7b01-aec0-12b32880cc87/exec-5bfc0c74-398b-413b-8e67-c421a8f21682.png`.
- Build the Editorial Timeline Studio as the primary architecture.
- Users include film directors, ad directors, music-video teams, serious creators, and solo studios.
- The object model is Project -> Story -> Cast/Objects/World -> Scenes -> Shots -> Versions -> Deliverables -> Review/Repair.
- There must be one navigation system, one central canvas, one selected-shot state, and one contextual inspector.
- Corpus intelligence stays silent until it recommends a choice, blocks a known failure, or proposes a repair.
- Provider execution is an explicit handoff in this local build. Never simulate a completed provider render.
- Preserve `UNKNOWN` for audio, provenance, and provider-owned state when evidence is absent.
