# AUTEUR Studio Design QA

## Comparison

- Reference: `C:\Users\Shris\.codex\generated_images\019f4871-875b-7b01-aec0-12b32880cc87\exec-5bfc0c74-398b-413b-8e67-c421a8f21682.png`
- First implementation capture: `qa-desktop-1280x720.png` (removed after the corrected comparison)
- Corrected desktop capture: `C:\Users\Shris\AppData\Local\Temp\auteur-studio-native-1504x1059.png`
- Corrected mobile capture: `C:\Users\Shris\AppData\Local\Temp\auteur-studio-latest-mobile-390x844.png`
- Tested state: Board workspace, first shot selected, inspector open
- Browser runtime: `http://127.0.0.1:4173/`

## Pass 1

Result: FAIL.

Independent review found no P0 blank or overlap failure, but identified four P1 issues:

1. The board showed only two large scene cards instead of a dense six-shot sequence.
2. The bottom rail was a filmstrip, not an editorial timeline.
3. Top modes and sidebar destinations duplicated navigation.
4. The supplied capture was mislabeled as 1440px although it was 1280x720.

P2 findings covered form-first inspector hierarchy, vertical board overflow, and secondary text contrast.

## Corrections

- Board now presents the complete six-shot production as compact, contiguous columns with scene-shot numbering.
- Timeline now has play/pause state, a moving playhead, clip durations, scene boundaries, dynamic time ruler, and an explicit planned-audio evidence label.
- Sidebar now owns scene and shot hierarchy only; the top bar is the single workspace navigation.
- Inspector now surfaces camera grammar and continuity references before editable direction fields.
- Secondary contrast and compact-label font sizes were increased.
- Board vertical density was reduced to keep the sequence summary inside the 720px shell.
- The strategy compiler now routes briefs to automotive, product, food, character, editorial, or VFX playbooks with matching corpus-derived storyboard media.
- Prompt packets now include negative prompts, explicit QC gates, delivery layers, and reference-locked creator uploads.
- Story Lab edits feed the shared project graph, and the global Preview control now drives the editorial playhead.
- Independent code review defects were corrected: packet-dirty export gates, canonical timing, resolvable references, truthful persistence state, evidence-bound QC, strict hydration, accessible modal focus management, clip-tracking preview, image-sequence delivery units, and lock-aware compilation.

## Verification

- Production build: PASS
- Strict TypeScript: PASS
- Deterministic engine and store tests: PASS, 24/24
- Dependency audit: PASS, zero known vulnerabilities at the configured audit level
- First-pass real-browser flow: PASS for intake, Story, Board, Prompts, Review, repair version, and Deliverables with zero console errors.
- Corrected visual recapture: PASS through the in-app Browser at 1504x1059 and 390x844.
- Page identity: PASS, `http://127.0.0.1:4173/`, title `AUTEUR Studio`.
- Blank page and framework overlay: PASS after the responsive reload settled.
- Console health: PASS, no warnings or errors in either checked viewport.
- Stale-packet interaction: PASS. A director edit marks the selected shot dirty, disables Copy and Export Shot, exposes Compile Shot, and re-enables packet actions only after recompilation.
- Mobile shell: PASS. The board is the first surface, the page has no horizontal overflow, the timeline stays compact, and Shot controls opens and closes as a deliberate drawer.
- Portable packet export: PASS. The browser produced a parseable `auteur-generation-packet/v1` file with all three assets and all six storyboard images embedded as data URLs; `providerState` remained `not-mutated`.
- Narrow mobile: PASS at 320x720. All five workspace tabs fit within a 320px viewport and Deliverables remains fully visible.
- Keyboard tabs: PASS. Prompt and Inspector tabs expose tab/tabpanel semantics, `aria-selected`, roving focus, and left/right navigation.
- QC truth: PASS. Requirements stay explicitly unverified until evidence-bound review reaches pass.
- Independent final audit: PASS after remediation. Orphaned/duplicate/missing scene graph shots block export; empty render-rule transitions preserve lineage; fractional duration labels resynchronize; malformed hydration is rejected; missing Deliverables lookups cannot crash rendering.

## Fidelity Ledger

1. App skeleton: reference and implementation both use a single production shell with project header, scene rail, storyboard canvas, shot inspector, command bar, and editorial timeline.
2. Board density: both show the complete six-shot sequence in the first desktop viewport; the implementation preserves real corpus-reference frames and explicit evidence labels.
3. Inspector hierarchy: camera grammar and continuity anchors precede editable direction, matching the reference's production-first hierarchy; the implementation adds evidence ceiling and render-derived risk controls.
4. Navigation: the implementation intentionally uses one global Story / Board / Prompts / Review / Deliverables rail instead of duplicating local Board / Timeline / Review tabs.
5. Mobile continuation: the desktop inspector becomes an explicit drawer and the shot board becomes a horizontal production rail without moving the primary workflow into cards.
6. Palette and geometry: dark neutral surfaces, gold command hierarchy, restrained 3-4px radii, thin dividers, compact type, and unframed working regions match the accepted system.
7. Copy difference: the implementation uses the live APEX seed project and corpus-derived risk language rather than the VELOCE placeholder text in the concept. Command hierarchy and production vocabulary are preserved.

Result: PASS for the accepted creator-editor architecture at native desktop size, 390px mobile, and 320px narrow mobile. The generated packet and embedded media were verified from the actual browser download. The final independent audit found no remaining P0-P2 issues in current local source.

## Corpus Synthesis Verification

- Runtime intelligence snapshots were refreshed from 4,822 validated extraction records and 55 accepted batch-delta files covering 2,750 reviewed videos.
- The previous standalone HTML entrypoint forwards to the canonical React studio, preventing the rejected legacy UI from remaining the default file-open experience.
- Story now exposes a project-relevant architecture, playbook, style grammar, and audio rule; the automotive seed selected `Wide -> macro -> hero wide` and `Alpine automotive premium` from the actual aggregate.
- Prompt packets visibly include corpus story architecture, domain playbook, prompt rule, failure prevention, audio framework, and evidence-bound QC gates.
- Export proof: `auteur-generation-packet/v1`, six shots, three embedded assets, six embedded storyboard images, 24 linked evidence IDs, and `providerState: not-mutated`.
- Final deterministic verification: 30/30 tests, strict TypeScript, production build, zero dependency vulnerabilities, zero browser runtime errors.
- Independent synthesis re-review: PASS after project-route conflicts, provenance-only lineage changes, and failed or incomplete corpus coverage were made deterministic and truth-bound.
- Latest QA captures: `C:\Users\Shris\AppData\Local\Temp\auteur-synthesized-desktop.png`, `C:\Users\Shris\AppData\Local\Temp\auteur-synthesized-story.png`, `C:\Users\Shris\AppData\Local\Temp\auteur-synthesized-prompts.png`, and `C:\Users\Shris\AppData\Local\Temp\auteur-synthesized-mobile.png`.

## V3 Founder-Rejection Correction

The preceding PASS applied to implementation fidelity against the earlier editor concept. It did not establish that the information architecture was good. Founder review rejected the result because it opened directly into a dense editor, lacked a proper product home, mixed global and production navigation, and still behaved like a fixed-template demonstration. V3 supersedes the preceding product-acceptance conclusion.

### V3 changes

- Production Home is now the default route and the actual intake surface.
- Global destinations: Home, Projects, Intelligence.
- Contextual production destinations: Story, Scenes, Storyboard, Library, Prompt Packets, Review & Repair.
- One visible Create production action exists in both the global rail and top bar.
- Current production is a clear handoff from Home and Projects; the app does not fabricate cloud projects.
- The creation dialog opens blank and stays disabled until a real brief exists.
- The starter project is a visually coherent timepiece campaign instead of unrelated corpus proxies.
- Workspace labels, navigation, form controls, and prompt text were enlarged for normal desktop reading.

### V3 verification

- Full gate: 38/38 tests, strict TypeScript, Vite production build.
- Live local model: variable 3-scene / 5-shot production and shot-direction v2 compilation proven with `qwen2.5vl:3b`.
- Navigation: Home, Projects, Intelligence, project overview, Storyboard, and New production verified in the browser.
- Clean reload console: zero warnings and zero errors.
- Mobile 390x844: page width contained to 390 CSS pixels; navigation scrolls independently; Home and current production collapse to one column.
- Final desktop Home: `design/qa/auteur-v3-home-final.png`.
- Final mobile Home: `design/qa/auteur-v3-home-mobile-390.png`.

Result: implementation proof is green. Product acceptance remains a founder decision. Dynamic storyboard image generation and provider execution remain explicit future adapters, not completed claims.

## V4 Creator-First Correction

Founder review identified that V3 still optimized for a demo shell and accepted generic JSON as creative authorship. V4 changes both the product contract and the working surface.

### Product contract

- Production Home now starts with one real brief composer and optional format, duration, aspect, delivery, and reference controls.
- Direct development is the default. Concept and screenplay exploration remain optional director controls, not mandatory exposed backend steps.
- A production is marked `developed` only when local-model output passes brief fidelity, cast/dialogue/location/loop constraints, non-genericity, shot differentiation, and generation-field completeness.
- Deterministic fallback output is saved as a `draft`; the UI no longer calls it production-ready.
- Model JSON uses an enforced schema and one creative-QC rewrite pass.
- Duration/format language no longer becomes the subject. Explicit no-dialogue, voice-over, cast-count, and location-count requirements are parsed and regression-tested.

### Working surface

- Global navigation is separate from project navigation.
- Project navigation is Treatment, Script, Storyboard, Assets, Prompt Pack, and Review.
- Storyboard now renders every scene and shot in one board with scene intent, duration, frame, shot size, lens, specific action, and dialogue/sound marker.
- The inspector edits only the selected shot. The full board remains visible as the primary production object.
- The Home canvas uses a warm editorial work surface inside a dark production shell, matching the accepted V4 concept without turning the product into a landing page.

### V4 evidence

- Concepts: `design/auteur-v4-home-concept.png`, `design/auteur-v4-storyboard-concept.png`.
- Browser captures: `output/playwright/auteur-v4-home-desktop.png`, `auteur-v4-storyboard-fullboard.png`, `auteur-v4-storyboard-mobile.png`, and `auteur-v4-intake-dialog.png`.
- Desktop and 390px mobile contain the page with zero horizontal overflow and zero runtime console errors after reload.
- Deterministic gate: 64/64 tests, strict TypeScript, and Vite production build pass.
- Offline package verifier passes with 4,822 render records, 2,750 reviewed records, 55 batch deltas, and 30 embedded visual references.

### Honest intelligence ceiling

- `qwen3.6:latest` returned Ollama HTTP 500 during a real production run.
- `qwen2.5vl:3b` completed a schema-enforced perfume-ad run after about 146 seconds but failed four creative-QC requirements; the app correctly retained it as a draft.
- A detected model is now labelled `available`, not `ready`.
- Model-authored cinematic quality, provider-render quality, accepted-take rate, dynamic storyboard-frame generation, and real audio synchronization remain UNKNOWN.
- The visual storyboard is structurally real, but current images are truthfully labelled visual-direction references until a storyboard image provider is connected.
