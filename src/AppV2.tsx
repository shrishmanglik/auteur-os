import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Aperture, ArrowRight, Brain, CaretRight, Check, Copy, DownloadSimple,
  FilmSlate, Folder, House, ImageSquare, Info, LockKey, MagicWand, Package, Plus,
  Quotes, Sparkle, Stack, UploadSimple, Users, WarningCircle, X,
} from "@phosphor-icons/react";
import { compileShot, deriveCorpusGuidance, embedPacketMedia, exportPacket } from "./engine.mjs";
import { DIRECTOR_FORMATS, developBlueprint, ideateConcepts, writeScreenplay } from "./director.mjs";
import type { DirectorConcept, DirectorInput, ScreenplayScene } from "./director.mjs";
import { analyzeProductionBrief, discoverLocalModelRoles, ideateProductionConcepts, refineShotDirection } from "./intelligence";
import { classifyIntakeFiles, elevationInputForProject, preserveAuthoredScriptInBlueprint } from "./intake";
import { candidateImperfectionAnchors, compatibleImperfectionAnchorOverrides, resolveImperfectionAnchors, toggleImperfectionAnchorOverride } from "./imperfection-anchors.mjs";
import { productionActionFor } from "./production-flow";
import { noticePresentation } from "./ui-language";
import { useStudio } from "./store";
import { normalizeUniversalShotV2, opticsToProse } from "./universal-packet.mjs";
import type { Project, Shot, WorkspaceMode } from "./types";
import "./styles-v2.css";

const globalNav: Array<{ id: WorkspaceMode; label: string; icon: typeof Aperture }> = [
  { id: "home", label: "Create", icon: House },
  { id: "projects", label: "Productions", icon: Folder },
  { id: "intelligence", label: "Production Intelligence", icon: Brain },
];

const productionNav: Array<{ id: WorkspaceMode; label: string; icon: typeof Aperture }> = [
  { id: "story", label: "Treatment", icon: Quotes },
  { id: "scenes", label: "Script", icon: Stack },
  { id: "storyboard", label: "Storyboard", icon: FilmSlate },
  { id: "assets", label: "Assets", icon: Users },
  { id: "prompts", label: "Prompt Package", icon: Package },
  { id: "review", label: "Review", icon: Aperture },
];

function orderedShots(project: Project): Shot[] {
  const byId = new Map(project.shots.map((shot) => [shot.id, shot]));
  return project.scenes.flatMap((scene) => scene.shots.map((id) => byId.get(id)).filter(Boolean) as Shot[]);
}

function shotOpticsLabel(shot: Shot): string {
  const optics = normalizeUniversalShotV2(shot).optics;
  return `${optics.focalLengthMm}mm ${optics.lensModel}`;
}

function HelpTooltip({ label, children }: { label: string; children: string }) {
  const tooltipId = useId();
  return <span className="v2-help"><button type="button" aria-label={`About ${label}`} aria-describedby={tooltipId}><Info size={13} /></button><span id={tooltipId} role="tooltip"><strong>{label}</strong>{children}</span></span>;
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

async function exportProjectPacket(project: Project, osIntelligence: ReturnType<typeof useStudio.getState>["osIntelligence"]) {
  const portable = await embedPacketMedia(exportPacket(project, osIntelligence), toDataUrl);
  download(`${project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-auteur-packet.json`, JSON.stringify(portable, null, 2));
}

async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not embed ${url}`);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function BrainStatus() {
  const { brainStatus, brainModel, analysisStage, setBrainState, setNotice } = useStudio();
  const ready = brainStatus === "ready";
  const refreshModel = async () => {
    setBrainState({ brainStatus: "checking", analysisStage: "Checking the local model host" });
    const probe = await discoverLocalModelRoles({ timeoutMs: 12_000 });
    const preferred = probe.roles.creativeDirector?.selected || probe.roles.screenplay?.selected || probe.model || "";
    setBrainState({ brainStatus: probe.available ? "ready" : "offline", brainModel: preferred, brainModels: probe.models, analysisStage: probe.available ? "Local creative intelligence ready" : probe.error || "Ollama is not reachable" });
    setNotice(probe.available ? `Local model ready: ${preferred}.` : "Ollama is still offline. Start Ollama, then check the connection again.");
  };
  const label = ready ? (brainModel || "Local model") : brainStatus === "analyzing" ? "Local model working" : brainStatus === "checking" ? "Checking model" : brainStatus === "error" ? "Model needs attention" : "Corpus mode";
  const retry = <button type="button" onClick={() => void refreshModel()}>Check connection</button>;
  const content = ready
    ? <><strong>Local model connected</strong><p>{brainModel || "A compatible Ollama model is active."}</p><small>{analysisStage}</small></>
    : brainStatus === "analyzing"
      ? <><strong>Local model is working</strong><p>{analysisStage || "Developing the production with local creative intelligence."}</p><small>The workspace remains available while this completes.</small></>
      : brainStatus === "checking"
        ? <><strong>Checking local model</strong><p>AUTEUR is checking Ollama and selecting the strongest available creative role.</p><small>No production feature is gated by this check.</small></>
        : brainStatus === "error"
          ? <><strong>Local model needs attention</strong><p>{analysisStage || "The last local-model request did not complete."}</p><small>Your local project is unchanged. Check Ollama, then retry.</small>{retry}</>
          : <><strong>Local model host is offline</strong><p>Local model host is offline. AUTEUR switches to corpus-grounded deterministic compilation. No features are disabled.</p><small>Start Ollama, confirm a model is installed with <code>ollama list</code>, then check again.</small>{retry}</>;
  return <details className={`v2-brain ${ready ? "ready" : brainStatus}`}>
    <summary title={analysisStage}><Brain size={14} weight="fill" /><span>{label}</span></summary>
    <div className="v2-brain-popover">{content}</div>
  </details>;
}

function TopBar() {
  const { project, mode, setMode, setNewProjectOpen } = useStudio();
  const atHome = mode === "home" || mode === "projects" || mode === "intelligence";
  return <header className="v2-topbar"><button className="v2-brand" type="button" onClick={() => setMode("home")}><span>A</span><strong>AUTEUR</strong></button>{atHome ? <div className="v2-breadcrumb"><strong>{mode === "home" ? "Create" : mode === "projects" ? "Productions" : "Production Intelligence"}</strong></div> : <div className="v2-breadcrumb"><button type="button" onClick={() => setMode("projects")}>Productions</button><CaretRight size={12} /><strong>{project.title}</strong><CaretRight size={12} /><span>{project.format}</span></div>}<BrainStatus /><div className="v2-top-actions"><button type="button" className="v2-create-top" onClick={() => setNewProjectOpen(true)}><Plus size={17} /> New production</button></div></header>;
}

function SideNav() {
  const { mode, setMode, setNewProjectOpen } = useStudio();
  return <aside className="v2-sidebar"><button className="v2-new-production" type="button" onClick={() => setNewProjectOpen(true)}><Plus size={17} /> Create</button><nav className="v2-global-nav">{globalNav.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={mode === id ? "active" : ""} onClick={() => setMode(id)}><Icon size={18} /><span>{label}</span></button>)}</nav><div className="v2-nav-label">Production tools</div><nav className="v2-global-nav"><button type="button" className={mode === "assets" ? "active" : ""} onClick={() => setMode("assets")}><Users size={18} /><span>Asset library</span></button><button type="button" className={mode === "storyboard" ? "active" : ""} onClick={() => setMode("storyboard")}><FilmSlate size={18} /><span>Shot List & Camera Angles</span></button><button type="button" className={mode === "prompts" ? "active" : ""} onClick={() => setMode("prompts")}><Package size={18} /><span>Prompt Package</span></button></nav><div className="v2-sidebar-foot"><div className="v2-avatar">SM</div><span><strong>Shrish</strong><small>Offline director workspace</small></span></div></aside>;
}

function ProjectTabs() {
  const { project, mode, setMode } = useStudio();
  const developed = project.creativeStatus === "developed";
  return <section className="v4-project-head"><div><button type="button" onClick={() => setMode("overview")}>{project.title}</button><span>{project.scenes.length} scenes / {project.shots.length} shots / {project.duration}s</span><em className={developed ? "developed" : "draft"}>{developed ? "Developed" : "Corpus Draft"}</em></div><nav aria-label="Production workspace">{productionNav.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={mode === id ? "active" : ""} onClick={() => setMode(id)}><Icon size={15} /><span>{label}</span></button>)}</nav></section>;
}

function ProductionActionBar() {
  const { mode, osIntelligence, setMode, compileAllShots, setNotice } = useStudio();
  const action = productionActionFor(mode);
  if (!action) return null;
  const run = async () => {
    try {
      if (action.kind === "navigate" && action.target) return setMode(action.target);
      if (action.kind === "preflight") {
        compileAllShots();
        setNotice("Pre-flight complete. Every shot Prompt Package is current and ready for inspection.");
        if (action.target) setMode(action.target);
        return;
      }
      compileAllShots();
      const state = useStudio.getState();
      await exportProjectPacket(state.project, state.osIntelligence || osIntelligence);
      setNotice("Prompt Package exported. No provider job was submitted.");
    } catch (error) {
      setNotice(`${error instanceof Error ? error.message : "Export failed."} Compile the affected shot, then try again.`);
    }
  };
  return <aside className="v4-next-action" aria-label="Production next step"><span><small>Next step{action.kind === "preflight" ? <HelpTooltip label="Pre-flight">Compiles every current shot, checks package readiness, and opens the Prompt Package for inspection.</HelpTooltip> : null}</small><strong>{action.detail}</strong></span><button type="button" onClick={() => void run()}>{action.label}{action.kind === "export" ? <DownloadSimple size={17} /> : <ArrowRight size={17} />}</button></aside>;
}

function DraftModelAssist() {
  const { project, osIntelligence, brainStatus, brainModel, setBrainState, setProjectFromBlueprint, setNotice } = useStudio();
  const [elevating, setElevating] = useState(false);
  if (project.creativeStatus === "developed") return null;
  const refreshModel = async () => {
    setBrainState({ brainStatus: "checking", analysisStage: "Checking the local model host" });
    const probe = await discoverLocalModelRoles({ timeoutMs: 12_000 });
    const preferred = probe.roles.creativeDirector?.selected || probe.roles.screenplay?.selected || probe.model || "";
    setBrainState({ brainStatus: probe.available ? "ready" : "offline", brainModel: preferred, brainModels: probe.models, analysisStage: probe.available ? "Local creative intelligence ready" : probe.error || "Ollama is not reachable" });
    setNotice(probe.available ? `Local model ready: ${preferred}.` : "Ollama is still offline. Start Ollama, then check the connection again.");
  };
  const elevate = async () => {
    if (brainStatus !== "ready" || elevating) return;
    setElevating(true);
    setBrainState({ brainStatus: "analyzing", analysisStage: "Elevating the corpus draft with the local model" });
    try {
      const input = elevationInputForProject(project, brainModel, osIntelligence?.prompt_brain || null);
      const brief = input.brief;
      const guidance = deriveCorpusGuidance(project, osIntelligence);
      const blueprint = await analyzeProductionBrief(input, guidance, { timeoutMs: 180_000, onStatus: (_status, detail) => setBrainState({ analysisStage: detail }) });
      if (blueprint.source !== "ollama") {
        setBrainState({ brainStatus: "offline", analysisStage: "Local model disconnected during elevation" });
        setNotice("The local model stopped responding. Your Corpus Draft is unchanged; start Ollama and try elevation again.");
        return;
      }
      const protectedBlueprint = preserveAuthoredScriptInBlueprint({ ...blueprint, model: brainModel }, project);
      setProjectFromBlueprint(protectedBlueprint, brief);
      setNotice("Draft elevated and creative QC checked. Review the treatment before export.");
    } catch (error) {
      setBrainState({ brainStatus: "error", analysisStage: "Draft elevation failed" });
      setNotice(`${error instanceof Error ? error.message : "Draft elevation failed."} Your Corpus Draft is unchanged; check Ollama and try again.`);
    } finally {
      setElevating(false);
    }
  };
  return brainStatus === "ready"
    ? <section className="v4-elevate"><span><Brain size={18} weight="fill" /><span><strong>Elevate with local model</strong><small>Rewrite and creative-QC the current draft against the same corpus rules.</small></span></span><button type="button" disabled={elevating} onClick={() => void elevate()}>{elevating ? "Elevating..." : `Elevate with ${brainModel || "local model"}`}</button></section>
    : <section className="v4-model-remedy" role="status"><WarningCircle size={18} weight="fill" /><span><strong>Local model is offline. Your full Corpus Draft remains available.</strong><small>Start Ollama, confirm a model is installed with <code>ollama list</code>, then check the connection. No production tab is disabled.</small></span><button type="button" onClick={() => void refreshModel()}>Check connection</button></section>;
}

function StorySpine() {
  const { project, selectedSceneId, selectScene } = useStudio();
  const beats = project.storyBeats?.length ? project.storyBeats : project.scenes.map((scene) => ({ id: scene.id, title: scene.title, summary: scene.intent, sceneId: scene.id }));
  return <section className="v2-spine"><header><span>Story Spine</span><b>{project.scenes.length} scenes / {project.shots.length} shots</b></header><div>{beats.map((beat, index) => <button key={beat.id} type="button" className={beat.sceneId === selectedSceneId ? "active" : ""} onClick={() => beat.sceneId && selectScene(beat.sceneId)}><small>{String(index + 1).padStart(2, "0")}</small><strong>{beat.title}</strong>{beat.summary && beat.summary !== beat.title && <span>{beat.summary}</span>}</button>)}</div></section>;
}

function StyleBibleStrip() {
  const { project, setMode } = useStudio();
  const bible = project.styleBible || { visualTone: project.style, lighting: "Motivated light", palette: "Authored palette", texture: "Credible materials", lensLanguage: "Cinematic lens family", mood: project.mood };
  const items = [
    ["Visual tone", bible.visualTone], ["Lighting", bible.lighting], ["Palette", String(bible.palette)],
    ["Texture", bible.texture], ["Lens & look", bible.lensLanguage], ["Mood", bible.mood],
  ];
  return <section className="v2-style"><header><span>Style Bible</span><button type="button" onClick={() => setMode("world")}>View all <CaretRight size={12} /></button></header><div>{items.map(([label, value], index) => <article key={label}><img src={project.shots[index % project.shots.length]?.image} alt="" /><span><small>{label}</small><strong>{value}</strong></span></article>)}</div></section>;
}

function StoryboardWorkspace() {
  const { project, selectedShotId, selectShot } = useStudio();
  const byId = new Map(project.shots.map((shot) => [shot.id, shot]));
  return <div className="v4-storyboard"><header className="v4-board-title"><div><small>Storyboard</small><h1>{project.title}</h1><p>{project.logline}</p></div><span>{project.scenes.length} scenes / {project.shots.length} shots / {project.duration}s</span></header><section className="v4-board-sheet">{project.scenes.map((scene, sceneIndex) => <div className="v4-board-scene" key={scene.id}><header><b>Scene {sceneIndex + 1}</b><strong>{scene.title}</strong><span>{scene.intent}</span><em>{scene.shots.reduce((sum, id) => sum + (byId.get(id)?.duration || 0), 0)}s</em></header><div>{scene.shots.map((id, shotIndex) => { const shot = byId.get(id); if (!shot) return null; const selected = shot.id === selectedShotId; return <button type="button" key={shot.id} className={selected ? "active" : ""} onClick={() => selectShot(shot.id)}><span className="v4-shot-number">{sceneIndex + 1}.{shotIndex + 1}<small>{shot.duration}s</small></span><figure><img src={shot.image} alt={`${shot.title} storyboard direction`} /><figcaption>{shot.visualSource === "uploaded" ? "Uploaded frame" : "Visual direction"}</figcaption></figure><span className="v4-shot-direction"><small>{shot.shotSize} / {shotOpticsLabel(shot)}</small><strong>{shot.title}</strong><p>{shot.action}</p>{shot.dialogue ? <em>{shot.dialogue}</em> : <em>Sound / {shot.audioIntent}</em>}</span><CaretRight size={15} /></button>; })}</div></div>)}</section><StyleBibleStrip /><DirectorDock /></div>;
}

function DirectorDock() {
  const { project, selectedShotId, brainModel, brainStatus, setBrainState, updateShot, setNotice } = useStudio();
  const [command, setCommand] = useState("");
  const [working, setWorking] = useState(false);
  const shot = project.shots.find((item) => item.id === selectedShotId)!;
  const direct = async () => {
    if (!command.trim() || working) return;
    setWorking(true);
    setBrainState({ brainStatus: "analyzing", analysisStage: "Re-directing selected shot" });
    try {
      const result = await refineShotDirection(project, shot, command, { model: brainModel || undefined, timeoutMs: 120_000, onStatus: (_stage, detail) => setBrainState({ analysisStage: detail }) });
      updateShot(shot.id, result.patch);
      useStudio.getState().compileSelectedShot();
      setBrainState({ brainStatus: result.source === "ollama" ? "ready" : "offline", brainModel: result.model || brainModel, analysisStage: result.source === "ollama" ? "Shot revision compiled" : "Deterministic direction fallback" });
      setNotice(result.source === "ollama" ? "Local brain re-directed and compiled the selected shot." : "Local brain unavailable; command preserved as a fallback draft.");
      setCommand("");
    } catch (error) {
      setBrainState({ brainStatus: "error", analysisStage: "Shot direction failed" });
      setNotice(`${error instanceof Error ? error.message : "Shot direction failed."} Review the selected shot, then direct it again.`);
    } finally {
      setWorking(false);
    }
  };
  return <section className="v2-director-dock"><div className="v2-agent-toggle"><Brain size={16} /><span><small>Agent</small><strong>{brainStatus === "ready" ? "ON" : brainStatus.toUpperCase()}</strong></span></div><div className="v2-ingredients"><small>Ingredients</small>{project.assets.slice(0, 3).map((asset) => <span key={asset.id}>@ {asset.name}</span>)}</div><div className="v2-command"><input aria-label="Direct the selected shot" value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void direct(); }} placeholder="Change camera, performance, rhythm, or ending while preserving named continuity..." /><button type="button" disabled={!command.trim() || working} onClick={() => void direct()}><MagicWand size={17} />{working ? "Directing" : "Analyze direction"}</button></div></section>;
}

function ImperfectionAnchorControl({ project, shot, updateShot }: {
  project: Project;
  shot: Shot;
  updateShot: (shotId: string, patch: Partial<Shot>) => void;
}) {
  const route = deriveCorpusGuidance(project).route;
  const candidates = candidateImperfectionAnchors(project, shot, route);
  const resolved = resolveImperfectionAnchors(project, shot, route);
  const manual = compatibleImperfectionAnchorOverrides(project, shot, route);
  const isManual = manual.length >= 2;
  const toggle = (anchorText: string) => {
    updateShot(shot.id, { imperfectionAnchors: toggleImperfectionAnchorOverride(project, shot, route, anchorText) });
  };
  return <section className="v2-anchor-control" aria-label="Physical imperfection anchors">
    <header><span>Physical imperfection anchors</span><button type="button" className={!isManual ? "active" : ""} onClick={() => updateShot(shot.id, { imperfectionAnchors: [] })}>Auto</button></header>
    <small>{isManual ? "Shot override · select 2–4" : "Corpus-matched · select a chip to override"}</small>
    <div className="v2-anchor-chips">{candidates.map((entry) => {
      const selected = resolved.some((value) => value.toLowerCase() === entry.anchorText.toLowerCase());
      const evidence = entry.evidence[0];
      return <button
        key={entry.id}
        type="button"
        className={selected ? "selected" : ""}
        aria-pressed={selected}
        aria-label={`${selected ? "Remove" : "Add"} realism anchor: ${entry.anchorText}`}
        title={`${evidence.class} · ${evidence.jsonPath}`}
        onClick={() => toggle(entry.anchorText)}
      >{entry.anchorText}</button>;
    })}</div>
  </section>;
}

function Inspector() {
  const { project, selectedShotId, updateShot, toggleAssetLock, compileSelectedShot, renderRules, osIntelligence } = useStudio();
  const [tab, setTab] = useState<"creative" | "camera" | "continuity" | "generation">("creative");
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLInputElement>(null);
  const shot = project.shots.find((item) => item.id === selectedShotId)!;
  const optics = normalizeUniversalShotV2(shot).optics;
  const livePacket = useMemo(
    () => compileShot(project, shot, renderRules, osIntelligence),
    [osIntelligence, project, renderRules, shot],
  );
  const updateOptics = (patch: Partial<Shot["optics"]>) => updateShot(shot.id, { optics: { ...optics, ...patch } });
  const readImage = (file: File | undefined, field: "image" | "startFrame" | "endFrame") => { if (!file) return; const reader = new FileReader(); reader.onload = () => updateShot(shot.id, { [field]: String(reader.result), ...(field === "image" ? { visualSource: "uploaded" } : {}) }); reader.readAsDataURL(file); };
  return <aside className="v2-inspector"><div className="v2-inspector-tabs">{(["creative", "camera", "continuity", "generation"] as const).map((item) => <button key={item} className={tab === item ? "active" : ""} type="button" onClick={() => setTab(item)}>{item}</button>)}</div><div className="v2-inspector-body">{tab === "creative" && <><label><span>Shot title</span><input value={shot.title} onChange={(event) => updateShot(shot.id, { title: event.target.value })} /></label><label><span>Purpose</span><textarea value={shot.intent} onChange={(event) => updateShot(shot.id, { intent: event.target.value })} /></label><label><span>Defining action</span><textarea value={shot.action} onChange={(event) => updateShot(shot.id, { action: event.target.value })} /></label><label><span>Resolved end state</span><textarea value={shot.endState} onChange={(event) => updateShot(shot.id, { endState: event.target.value })} /></label><ImperfectionAnchorControl project={project} shot={shot} updateShot={updateShot} /><button type="button" className="v2-replace" onClick={() => frameRef.current?.click()}><UploadSimple size={15} /> Replace reference proxy</button><input hidden ref={frameRef} type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0], "image")} /></>}{tab === "camera" && <><label><span>Shot size</span><input value={shot.shotSize} onChange={(event) => updateShot(shot.id, { shotSize: event.target.value })} /></label><label><span>Lens model</span><input aria-label="Lens model" value={optics.lensModel || ""} onChange={(event) => updateOptics({ lensModel: event.target.value })} /></label><label className="v2-optics-control"><span>Focal length <output>{optics.focalLengthMm}mm</output></span><input aria-label="Focal length" type="range" min="12" max="200" step="1" value={optics.focalLengthMm} onChange={(event) => updateOptics({ focalLengthMm: Number(event.target.value) })} /></label><label className="v2-optics-control"><span>T-stop <output>T{optics.tStop}</output></span><input aria-label="T-stop" type="range" min="1.2" max="16" step="0.1" value={optics.tStop} onChange={(event) => updateOptics({ tStop: Number(event.target.value) })} /></label><label className="v2-optics-control"><span>Subject distance <output>{optics.subjectDistanceMeters}m</output></span><input aria-label="Subject distance" type="range" min="0.3" max="20" step="0.05" value={optics.subjectDistanceMeters} onChange={(event) => updateOptics({ subjectDistanceMeters: Number(event.target.value) })} /></label><div className="v2-optics-preview" aria-live="polite"><small>Live packet camera clause</small><p>{opticsToProse(optics)}</p></div><label><span>Movement</span><input value={shot.movement} onChange={(event) => updateShot(shot.id, { movement: event.target.value })} /></label><label><span>Duration</span><input type="number" min="1" step="0.5" value={shot.duration} onChange={(event) => updateShot(shot.id, { duration: Number(event.target.value) || 1 })} /></label></>}{tab === "continuity" && <><div className="v2-frame-slots"><button type="button" onClick={() => startRef.current?.click()}>{shot.startFrame ? <img src={shot.startFrame} alt="Start frame" /> : <><ImageSquare size={21} /><span>Add start frame</span></>}</button><button type="button" onClick={() => endRef.current?.click()}>{shot.endFrame ? <img src={shot.endFrame} alt="End frame" /> : <><ImageSquare size={21} /><span>Add end frame</span></>}</button></div><input hidden ref={startRef} type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0], "startFrame")} /><input hidden ref={endRef} type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0], "endFrame")} /><span className="v2-section-label">Ingredients & references</span><div className="v2-reference-list">{project.assets.map((asset) => <button type="button" key={asset.id} className={asset.locked ? "locked" : ""} onClick={() => toggleAssetLock(asset.id)}><img src={asset.url} alt="" /><span><strong>{asset.name}</strong><small>{asset.role || asset.type}</small></span>{asset.locked && <LockKey size={12} weight="fill" />}</button>)}</div><span className="v2-section-label">Continuity locks</span><div className="v2-locks">{shot.continuityLocks.map((lock) => <span key={lock}>{lock}</span>)}</div></>}{tab === "generation" && <><div className="v2-route"><small>Provider route</small><strong>{shot.provider}</strong><span>Manual handoff</span></div><div className="v2-compat"><p><Check size={13} /> Prompt Package</p><p><Check size={13} /> Reference list</p><p className={shot.startFrame ? "" : "warn"}><WarningCircle size={13} /> Start frame {shot.startFrame ? "ready" : "optional"}</p><p className={shot.endFrame ? "" : "warn"}><WarningCircle size={13} /> End frame {shot.endFrame ? "ready" : "optional"}</p></div><pre className="v2-prompt-preview" aria-label="Live video prompt">{livePacket.videoPrompt}</pre>{shot.packetDirty && <small className="v2-live-note">Live preview includes uncompiled camera edits.</small>}</>}</div><footer><button type="button" onClick={compileSelectedShot}><Sparkle size={17} /> Generate packet</button><small>Creates a versioned provider handoff. No provider job is submitted.</small></footer></aside>;
}

function HomeWorkspace() {
  const { project, osIntelligence, brainModel, setMode, openNewProject, setBrainState, setProjectFromBlueprint, setNotice } = useStudio();
  const [brief, setBrief] = useState("");
  const [format, setFormat] = useState("Auto");
  const [duration, setDuration] = useState("Auto");
  const [aspect, setAspect] = useState("Auto");
  const [provider, setProvider] = useState("Auto");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("Auto");
  const [humor, setHumor] = useState("Auto");
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [working, setWorking] = useState(false);
  const [stage, setStage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const shortcuts: Record<string, { format: string; aspect: string }> = {
    Commercial: { format: "Commercial film", aspect: "16:9" },
    "Short film": { format: "Short film sequence", aspect: "2.39:1" },
    "Music video": { format: "Music video", aspect: "16:9" },
    Social: { format: "Social campaign", aspect: "9:16" },
    "Image campaign": { format: "Image campaign", aspect: "4:5" },
  };
  const inferStrategy = () => {
    const text = brief.toLowerCase();
    const inferredFormat = /\b(monologue|talking head|a-roll|founder speaks)\b/.test(text) ? "A-roll monologue"
      : /\b(reel|tiktok|instagram|social)\b/.test(text) ? "Social campaign"
      : /\b(music video|song|track|artist)\b/.test(text) ? "Music video"
      : /\b(short film|narrative|thriller|drama|comedy)\b/.test(text) ? "Short film sequence"
      : /\b(still|image|poster|key art|campaign image)\b/.test(text) ? "Image campaign"
      : /\b(single scene|one scene)\b/.test(text) ? "Single scene" : "Commercial film";
    const formatValue = format === "Auto" ? inferredFormat : format;
    const seconds = text.match(/\b(\d{1,4})\s*(?:s|sec|secs|second|seconds)\b/);
    const durationValue = duration === "Auto" ? Math.max(4, Math.min(1800, Number(seconds?.[1]) || (formatValue === "Social campaign" ? 15 : formatValue === "A-roll monologue" ? 60 : 30))) : Number(duration);
    const aspectValue = aspect === "Auto" ? (/\b(vertical|portrait|reel|tiktok)\b/.test(text) || formatValue === "Social campaign" ? "9:16" : formatValue === "Short film sequence" ? "2.39:1" : formatValue === "Image campaign" ? "4:5" : "16:9") : aspect;
    const platform = aspectValue === "9:16" ? "Instagram / TikTok" : formatValue === "Short film sequence" ? "Cinema + web" : "Web + social";
    const inferredHumor = /\b(darkly funny|dark comedy|deadpan|dry humor|dryly funny)\b/.test(text) ? "dry" : /\b(absurd|surreal comedy)\b/.test(text) ? "absurd" : /\b(funny|humorous|comedy|playful)\b/.test(text) ? "playful" : "none";
    const resolvedHumor = humor === "Auto" ? inferredHumor : humor;
    const inferredTone = resolvedHumor === "dry" ? "Deadpan" : /\b(luxury|premium|elegant)\b/.test(text) ? "Luxury restraint" : /\b(intimate|personal|vulnerable)\b/.test(text) ? "Intimate" : "Cinematic";
    return { format: formatValue, aspect: aspectValue, duration: durationValue, platform, provider: provider === "Auto" ? (formatValue === "Image campaign" ? "Image model" : "Veo 3.1 / Flow") : provider, audience: audience.trim() || undefined, humor: resolvedHumor, tone: tone === "Auto" ? inferredTone : tone };
  };
  const readFile = (file: File) => new Promise<{ name: string; url: string }>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, url: String(reader.result) }); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
  const develop = async () => {
    if (!brief.trim() || working) return;
    const strategy = inferStrategy();
    const controller = new AbortController();
    abortRef.current = controller;
    setWorking(true);
    setStage(`Auto strategy: ${strategy.format} / ${strategy.duration}s / ${strategy.aspect}`);
    try {
      const references = await Promise.all(files.map(readFile));
      const guidance = deriveCorpusGuidance({ ...project, brief, format: strategy.format, style: "", mood: strategy.tone }, osIntelligence);
      setBrainState({ brainStatus: "analyzing", analysisStage: "Developing story, screenplay, shots, and production packets" });
      const blueprint = await analyzeProductionBrief({ brief, title: "Untitled production", ...strategy, model: brainModel || undefined, promptBrain: osIntelligence?.prompt_brain || null }, guidance, { timeoutMs: 180_000, signal: controller.signal, onStatus: (_status, detail) => { setStage(detail); setBrainState({ analysisStage: detail }); } });
      if (controller.signal.aborted) return;
      // Re-apply the resolved home strategy — the model may emit a conflicting
      // format/duration/aspect/provider, and retiming/export read blueprint.project.
      const typedBlueprint = blueprint as unknown as Record<string, unknown> & { project: Record<string, unknown> };
      setProjectFromBlueprint({ ...typedBlueprint, project: { ...typedBlueprint.project, format: strategy.format, aspect: strategy.aspect, duration: strategy.duration, platform: strategy.platform, provider: strategy.provider }, ...(typedBlueprint.source === "ollama" && brainModel ? { model: brainModel } : {}) }, brief, references);
      setBrief("");
      setFiles([]);
    } catch (error) {
      if (!controller.signal.aborted) {
        setNotice(`Production development failed: ${error instanceof Error ? error.message : "the production could not be built."} Review the brief, then try again.`);
        setBrainState({ brainStatus: "error", analysisStage: "Production development failed" });
      }
    } finally {
      abortRef.current = null;
      setWorking(false);
      setStage("");
    }
  };
  const cancel = () => { abortRef.current?.abort(); setWorking(false); setStage(""); setBrainState({ brainStatus: brainModel ? "ready" : "offline", analysisStage: "Production development cancelled" }); };
  const ingest = async (incoming: Iterable<File>) => {
    const routed = classifyIntakeFiles(incoming);
    const readable = routed.text.filter((file) => file.size <= 2 * 1024 * 1024);
    const imageFiles = routed.images.filter((file) => file.size <= 10 * 1024 * 1024);
    const text = (await Promise.all(readable.map((file) => file.text()))).filter(Boolean).join("\n\n");
    if (text) setBrief((current) => [current.trim(), text.trim()].filter(Boolean).join("\n\n"));
    if (imageFiles.length) setFiles((current) => [...current, ...imageFiles].slice(0, 12));
    const skipped = routed.rejected.length + (routed.text.length - readable.length) + (routed.images.length - imageFiles.length);
    if (skipped) setNotice(`${skipped} unsupported or oversized file${skipped === 1 ? " was" : "s were"} skipped. Use text up to 2 MB or images up to 10 MB.`);
  };
  return <div className="v2-home v4-home">
    <section
      className={`v4-create-surface ${dragActive ? "is-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragActive(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
      onDrop={(event) => { event.preventDefault(); setDragActive(false); void ingest(event.dataTransfer.files); }}
    >
      {dragActive && <div className="v4-drop-overlay" aria-hidden="true"><UploadSimple size={28} /><strong>Drop brief or references</strong><span>Text becomes the brief. Images become visual references.</span></div>}
      <h1>Turn an idea into a production.</h1>
      <p>Describe your world, story, or objective. AUTEUR develops the treatment, script, storyboard, continuity system, sound plan, and generation-ready Prompt Package.</p>
      <div className="v4-brief-composer">
        <textarea aria-label="Production brief" disabled={working} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Describe the film, ad, reel, monologue, music video, scene, or campaign you want to make..." />
        <div className="v4-format-picker" role="group" aria-label="Production format">
          <button type="button" className={format === "Auto" ? "active" : ""} aria-pressed={format === "Auto"} disabled={working} onClick={() => setFormat("Auto")}>Auto</button>
          {DIRECTOR_FORMATS.map((item) => <button type="button" key={item.key} data-format-key={item.key} className={format === item.key ? "active" : ""} aria-pressed={format === item.key} disabled={working} onClick={() => setFormat(item.key)}>{item.label}</button>)}
        </div>
        <div className="v4-composer-controls">
          <details className="v4-fine-tune">
            <summary>Fine-tune <span>{[aspect, duration, provider, tone, humor].filter((value) => value !== "Auto").length || "Optional"}</span></summary>
            <div>
              <label>Aspect<select disabled={working} value={aspect} onChange={(event) => setAspect(event.target.value)}><option>Auto</option><option>2.39:1</option><option>16:9</option><option>9:16</option><option>4:5</option><option>1:1</option></select></label>
              <label>Duration<select disabled={working} value={duration} onChange={(event) => setDuration(event.target.value)}><option>Auto</option><option value="15">15 sec</option><option value="30">30 sec</option><option value="60">60 sec</option><option value="90">90 sec</option></select></label>
              <label>Provider<select disabled={working} value={provider} onChange={(event) => setProvider(event.target.value)}><option>Auto</option><option>Veo 3.1 / Flow</option><option>Sora</option><option>Runway</option><option>Image model</option></select></label>
              <label>Audience<input disabled={working} value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Who must care?" /></label>
              <label>Tone<select disabled={working} value={tone} onChange={(event) => setTone(event.target.value)}><option>Auto</option><option>Cinematic</option><option>Playful</option><option>Deadpan</option><option>Epic</option><option>Intimate</option><option>Luxury restraint</option></select></label>
              <label>Humor<select disabled={working} value={humor} onChange={(event) => setHumor(event.target.value)}><option>Auto</option><option value="none">Played straight</option><option value="dry">Dry / deadpan</option><option value="playful">Playful</option><option value="absurd">Absurdist</option></select></label>
            </div>
          </details>
          <input ref={fileRef} hidden type="file" accept=".txt,.md,.markdown,.fountain,.fdx,text/plain,text/markdown,image/*" multiple onChange={(event) => { void ingest(event.target.files || []); event.currentTarget.value = ""; }} />
          <button type="button" className="v4-add-reference" title="Attach brief or visual references" aria-label="Attach brief or visual references" disabled={working} onClick={() => fileRef.current?.click()}><UploadSimple size={17} />{files.length ? <span>{files.length}</span> : null}</button>
          {working ? <button type="button" className="v4-cancel" onClick={cancel}><X size={16} /> Cancel</button> : <button type="button" className="v4-develop" disabled={!brief.trim()} onClick={() => void develop()}>Develop production <ArrowRight size={17} /></button>}
        </div>
        {(files.length > 0 || brief) && <div className="v4-intake-meta"><span>{brief.length.toLocaleString()} characters</span><span>{files.length} visual reference{files.length === 1 ? "" : "s"}</span><small>Drop .txt, .md, .fountain, .fdx, or images anywhere above.</small></div>}
        {working && <div className="v4-development-status" role="status"><Brain size={17} weight="fill" /><span><strong>Developing production</strong><small>{stage}</small></span></div>}
      </div>
    </section>
    <section className="v2-home-section v4-recent"><header><div><h2>Recent production</h2></div><button type="button" onClick={() => setMode("projects")}>View all <ArrowRight size={15} /></button></header><button type="button" className="v2-current-production v4-current-production" onClick={() => setMode("overview")}><img src={project.shots[0]?.image} alt={project.title} /><span><small>{project.format}</small><strong>{project.title}</strong><p>{project.logline}</p><em>{project.scenes.length} scenes / {project.shots.length} shots / {project.duration}s</em></span><div className="v4-shot-preview">{project.shots.slice(0, 5).map((shot, index) => <figure key={shot.id}><img src={shot.image} alt="" /><figcaption>{index + 1} / {shot.shotSize}</figcaption></figure>)}</div></button></section>
    <section className="v4-templates"><h2>Start from a production type</h2><div>{Object.entries(shortcuts).map(([label, preset]) => <button type="button" key={label} onClick={() => openNewProject(preset)}><FilmSlate size={18} /><strong>{label}</strong><span>Develop treatment, storyboard, and Prompt Package</span></button>)}</div></section>
  </div>;
}

function ProjectsWorkspace() {
  const { project, setMode, setNewProjectOpen } = useStudio();
  return <div className="v2-page v2-projects-page"><header><small>Projects</small><h1>Your productions</h1><p>Local production workspaces stay editable and exportable. Start a new production or continue the current one.</p></header><div className="v2-projects-grid"><button type="button" className="v2-project-tile" onClick={() => setMode("overview")}><img src={project.shots[0]?.image} alt={project.title} /><span><small>{project.format}</small><strong>{project.title}</strong><p>{project.logline}</p><em>{project.scenes.length} scenes / {project.shots.length} shots</em></span><ArrowRight size={20} /></button><button type="button" className="v2-new-project-tile" onClick={() => setNewProjectOpen(true)}><Plus size={28} /><strong>New production</strong><span>Build from an idea, script, treatment, or references</span></button></div></div>;
}

function IntelligenceWorkspace() {
  const { osIntelligence } = useStudio();
  const groups = [
    ["Prompt logic", osIntelligence?.prompt_generation_logic],
    ["Story patterns", osIntelligence?.storyboarding_logic],
    ["Style systems", osIntelligence?.style_and_design_systems],
    ["Failure repairs", osIntelligence?.failure_rules_and_repairs],
  ] as const;
  return <div className="v2-page v2-intelligence-page"><header><small>Intelligence</small><h1>What the render corpus taught AUTEUR</h1><p>Evidence is routed into production planning, prompts, continuity, and repair. Unavailable evidence remains UNKNOWN.</p></header><section className="v2-intelligence-summary"><article><strong>{osIntelligence?.render_records?.toLocaleString() || "UNKNOWN"}</strong><span>render studies loaded</span></article><article><strong>{osIntelligence?.coverage?.records_reviewed?.toLocaleString() || "UNKNOWN"}</strong><span>records reviewed</span></article><article><strong>{osIntelligence?.batch_delta_files?.toLocaleString() || "UNKNOWN"}</strong><span>batch syntheses</span></article></section><div className="v2-intelligence-groups">{groups.map(([label, items]) => <section key={label}><header><h2>{label}</h2><span>{items?.length || 0}</span></header>{(items || []).slice(0, 5).map((item) => <article key={item.key}><strong>{item.key.replace(/[-_]/g, " ")}</strong><small>{item.count || item.evidence_gen_ids?.length || 0} evidence signals</small></article>)}</section>)}</div></div>;
}

function OverviewWorkspace() {
  const { project, setMode } = useStudio();
  const developed = project.creativeStatus === "developed";
  return <div className="v2-page"><header><small>Production overview</small><h1>{project.title}</h1><p>{project.logline}</p></header><section className={`v4-creative-gate ${developed ? "passed" : "draft"}`}>{developed ? <Check size={17} weight="bold" /> : <WarningCircle size={17} weight="fill" />}<div><small>{developed ? "Developed" : "Corpus Draft"}</small><strong>{developed ? `${project.qualityReport?.score ?? 100}/100 brief fidelity and production completeness` : "Complete offline production package, ready to review, edit, pre-flight, and export"}</strong>{project.qualityReport?.issues?.length ? <p>{project.qualityReport.issues.join(" ")}</p> : null}</div></section><section className="v2-thesis"><Sparkle size={18} weight="fill" /><div><small>Creative thesis</small><strong>{project.creativeThesis}</strong></div></section><div className="v2-overview-grid"><article><small>Treatment</small><strong>{project.scenes.length} dramatic movements</strong><p>{project.shots.length} authored shots / {project.duration}s</p><button type="button" onClick={() => setMode("story")}>Open treatment <ArrowRight size={13} /></button></article><article><small>Visual system</small><strong>{project.styleBible?.visualTone || project.style}</strong><p>{project.styleBible?.mood || project.mood}</p><button type="button" onClick={() => setMode("world")}>Open style bible <ArrowRight size={13} /></button></article><article><small>Production intelligence</small><strong>{developed ? "AI-developed and QC-checked" : "Corpus-grounded draft"}</strong><p>{project.intelligenceModel || "No model provenance"}</p></article><article><small>Provider handoff</small><strong>{project.provider}</strong><p>{project.aspect} / {project.platform}</p></article></div><StorySpine /></div>;
}

function StoryWorkspace() {
  const { project, selectScene, setMode } = useStudio();
  return <div className="v2-page"><header><small>Story</small><h1>{project.logline}</h1><p>{project.creativeThesis}</p></header><div className="v2-story-list">{project.scenes.map((scene, index) => <button type="button" key={scene.id} onClick={() => { selectScene(scene.id); setMode("storyboard"); }}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{scene.title}</strong><p>{scene.intent}</p></span><em>{scene.shots.length} shots</em><CaretRight size={16} /></button>)}</div></div>;
}

function AssetsWorkspace({ world = false }: { world?: boolean }) {
  const { project, toggleAssetLock, compileAllShots } = useStudio();
  if (world) return <div className="v2-page"><header><small>World & style bible</small><h1>{project.styleBible?.visualTone || project.style}</h1><p>{project.worldRule}</p></header><StyleBibleStrip /><div className="v2-world-grid">{Object.entries(project.styleBible || {}).map(([key, value]) => <article key={key}><small>{key.replace(/([A-Z])/g, " $1")}</small><strong>{String(value)}</strong></article>)}</div></div>;
  const dirtyCount = project.shots.filter((shot) => shot.packetDirty).length;
  return <div className="v2-page"><header className="v2-page-actions"><div><small>Cast, objects, locations & references</small><h1>Production assets</h1><p>Named references persist across shots. Corpus imagery remains a proxy until replaced or generated externally.</p></div>{dirtyCount > 0 && <button type="button" onClick={compileAllShots}><MagicWand size={15} /> Compile {dirtyCount} affected packets</button>}</header><div className="v2-asset-grid">{project.assets.map((asset) => <button type="button" key={asset.id} className={asset.locked ? "locked" : ""} onClick={() => toggleAssetLock(asset.id)}><img src={asset.url} alt={asset.name} /><span><small>{asset.role || asset.type}</small><strong>{asset.name}</strong><p>{asset.description}</p></span>{asset.locked && <LockKey size={14} weight="fill" />}</button>)}</div></div>;
}

function PromptsWorkspace() {
  const { project, selectedShotId, selectShot, compileSelectedShot } = useStudio();
  const shot = project.shots.find((item) => item.id === selectedShotId)!;
  const version = shot.versions.find((item) => item.id === shot.activeVersionId) || shot.versions[0];
  const [layer, setLayer] = useState<"frame" | "video" | "audio" | "negative">("video");
  const prompt = layer === "frame" ? version.framePrompt : layer === "audio" ? version.audioPrompt : layer === "negative" ? version.negativePrompt : version.videoPrompt;
  return <div className="v2-page v2-prompts"><header><small>Prompt Package <HelpTooltip label="Prompt Package">The versioned image, video, audio, negative, reference, and QC instructions prepared for a generation engine.</HelpTooltip> · Continuity <HelpTooltip label="Continuity">Locks identity, wardrobe, objects, geography, and frame state across connected shots.</HelpTooltip></small><h1>{shot.title}</h1><p>{shot.provider} / version {version.label} / {shot.packetDirty ? "needs compile" : "current"}</p></header><div className="v2-prompt-layout"><aside>{orderedShots(project).map((item) => <button key={item.id} type="button" className={item.id === shot.id ? "active" : ""} onClick={() => selectShot(item.id)}><img src={item.image} alt="" /><span>{item.title}<small>{item.versions.length} versions</small></span></button>)}</aside><section><nav>{(["frame", "video", "audio", "negative"] as const).map((item) => <button type="button" key={item} className={item === layer ? "active" : ""} onClick={() => setLayer(item)}>{item}</button>)}</nav><pre>{prompt}</pre><footer>{shot.packetDirty && <button type="button" onClick={compileSelectedShot}><MagicWand size={15} /> Compile current edits</button>}<button type="button" onClick={() => navigator.clipboard.writeText(prompt)}><Copy size={15} /> Copy layer</button></footer></section></div></div>;
}

function ReviewWorkspace() {
  const { project, selectedShotId, updateReview, attachRender, analyzeReview, toggleProposal, applyRepairs } = useStudio();
  const shot = project.shots.find((item) => item.id === selectedShotId)!;
  const input = useRef<HTMLInputElement>(null);
  const attach = (file?: File) => {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) return useStudio.getState().setNotice("Provider evidence exceeds the 100 MB review limit.");
    const reader = new FileReader();
    reader.onload = () => attachRender(shot.id, String(reader.result));
    reader.readAsDataURL(file);
  };
  const evidence = shot.review.renderUrl;
  const evidenceMedia = evidence?.startsWith("data:video/")
    ? <video src={evidence} controls preload="metadata" aria-label="Provider video evidence" />
    : evidence ? <img src={evidence} alt="Provider evidence" /> : null;
  return <div className="v2-page"><header><small>Review & repair</small><h1>{shot.title}</h1><p>Compare storyboard intent with attached provider evidence. Nothing is inferred from the proxy frame.</p></header><div className="v2-review"><section><div><small>Storyboard intent / reference proxy</small><img src={shot.image} alt="Storyboard reference" /></div><div><small>Provider render evidence</small>{evidenceMedia || <button type="button" onClick={() => input.current?.click()}><UploadSimple size={24} /><strong>Attach provider render</strong><span>Image or video, required before QC can pass</span></button>}<input hidden ref={input} type="file" accept="image/*,video/*" onChange={(event) => attach(event.target.files?.[0])} /></div></section><aside><div className={`v2-review-status ${shot.review.status}`}>QC status: {shot.review.status}</div><div className="v2-qc-gates"><label><input type="checkbox" checked={shot.review.temporalPass === true} onChange={(event) => updateReview(shot.id, { temporalPass: event.target.checked })} /><span><strong>Temporal coherence verified</strong><small>Motion, timing, and physical behavior hold across the render.</small></span></label><label><input type="checkbox" checked={shot.review.continuityPass === true} onChange={(event) => updateReview(shot.id, { continuityPass: event.target.checked })} /><span><strong>Continuity verified</strong><small>Identity, wardrobe, object state, geography, and final frame match the locks.</small></span></label></div><label><span>Evidence-based critique</span><textarea value={shot.review.critique} onChange={(event) => updateReview(shot.id, { critique: event.target.value })} placeholder="Identity changes after contact; final frame loses the product; wheel motion slides..." /></label><button type="button" disabled={!shot.review.renderUrl || !shot.review.critique.trim()} onClick={() => analyzeReview(shot.id)}><Brain size={16} /> Analyze failure classes</button>{shot.review.proposals.map((proposal) => <label className="v2-proposal" key={proposal.id}><input type="checkbox" checked={proposal.selected} onChange={() => toggleProposal(shot.id, proposal.id)} /><span><strong>{proposal.label}</strong><small>{proposal.fix}</small></span></label>)}{shot.review.proposals.length > 0 && <button type="button" onClick={() => applyRepairs(shot.id)}><Sparkle size={16} /> Create selected repair packet</button>}</aside></div></div>;
}

function ScenesWorkspace() {
  const { project, selectScene, setMode } = useStudio();
  return <div className="v2-page"><header><small>Scenes</small><h1>{project.scenes.length} authored story movements</h1><p>Scene length follows the brief. AUTEUR does not force a fixed template.</p></header><div className="v2-scene-grid">{project.scenes.map((scene, index) => <button type="button" key={scene.id} onClick={() => { selectScene(scene.id); setMode("storyboard"); }}><img src={project.shots.find((shot) => shot.sceneId === scene.id)?.image} alt="" /><span><small>Scene {String(index + 1).padStart(2, "0")}</small><strong>{scene.title}</strong><p>{scene.intent}</p><em>{scene.shots.length} shots</em></span></button>)}</div></div>;
}

function Workspace() {
  const { mode } = useStudio();
  if (mode === "home") return <HomeWorkspace />;
  if (mode === "projects") return <ProjectsWorkspace />;
  if (mode === "intelligence") return <IntelligenceWorkspace />;
  const content = mode === "overview" ? <OverviewWorkspace />
    : mode === "story" ? <StoryWorkspace />
    : mode === "cast" || mode === "assets" ? <AssetsWorkspace />
    : mode === "world" ? <AssetsWorkspace world />
    : mode === "scenes" ? <ScenesWorkspace />
    : mode === "prompts" ? <PromptsWorkspace />
    : mode === "review" ? <ReviewWorkspace />
    : <StoryboardWorkspace />;
  return <div className="v4-production-workspace"><ProjectTabs /><DraftModelAssist />{content}<ProductionActionBar /></div>;
}

function NewProductionDialog() {
  const { newProjectOpen, newProjectPreset, setNewProjectOpen, project, osIntelligence, brainStatus, brainModel, brainModels, setBrainState, setProjectFromBlueprint, setNotice } = useStudio();
  const [step, setStep] = useState<"brief" | "concepts" | "script">("brief");
  const [brief, setBrief] = useState("");
  const [title, setTitle] = useState("Untitled production");
  const [format, setFormat] = useState("Commercial film");
  const [aspect, setAspect] = useState("16:9");
  const [duration, setDuration] = useState(30);
  const [provider, setProvider] = useState("Veo 3.1 / Flow");
  const [model, setModel] = useState(brainModel || "gemma4:latest");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("Cinematic");
  const [humor, setHumor] = useState("none");
  const [useBrain, setUseBrain] = useState(true);
  const [conceptSeed, setConceptSeed] = useState(0);
  const [concepts, setConcepts] = useState<DirectorConcept[]>([]);
  const [conceptSource, setConceptSource] = useState<"ollama" | "deterministic-fallback">("deterministic-fallback");
  const [conceptFallbackReason, setConceptFallbackReason] = useState("");
  const [ideaOverrides, setIdeaOverrides] = useState({ hero: "", setting: "", object: "" });
  const [chosen, setChosen] = useState<DirectorConcept | null>(null);
  const [scenes, setScenes] = useState<ScreenplayScene[]>([]);
  const [screenplayMeta, setScreenplayMeta] = useState<{ dialogueMode: string; cast: string[]; duration: number } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [working, setWorking] = useState(false);
  const [stage, setStage] = useState("The Director is ready");
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);
  const promptBrain = osIntelligence?.prompt_brain || null;
  const platform = format === "Social campaign" || format === "A-roll monologue" ? "Instagram / TikTok" : format === "Image campaign" ? "Digital + social" : "Cinema + web";
  const directorInput = (): DirectorInput => ({ idea: brief, title, format, aspect, duration, platform, provider, audience, tone, humor, ideaOverrides });
  const applyFormat = (next: string) => {
    setFormat(next);
    const preset = DIRECTOR_FORMATS.find((item) => item.key === next);
    if (preset) { setAspect(preset.defaultAspect); setDuration(preset.defaultDuration); }
    if (next === "Image campaign") setProvider("Image model");
    else setProvider((current) => (current === "Image model" ? "Veo 3.1 / Flow" : current));
    invalidateStory();
  };
  // Any change to the creative inputs makes an already-written concept/screenplay stale;
  // clearing it forces the next build to re-ideate and re-write from the current draft.
  const invalidateStory = () => {
    setChosen(null);
    setScenes([]);
    setScreenplayMeta(null);
  };
  const resetDraft = () => {
    setBrief("");
    setTitle("Untitled production");
    setFiles([]);
    setConcepts([]);
    setConceptSource("deterministic-fallback");
    setConceptFallbackReason("");
    setIdeaOverrides({ hero: "", setting: "", object: "" });
    setChosen(null);
    setScenes([]);
    setScreenplayMeta(null);
    setConceptSeed(0);
    setAudience("");
    setTone("Cinematic");
    setHumor("none");
    applyFormat("Commercial film");
    setStep("brief");
  };
  const closeDialog = () => {
    const wasWorking = Boolean(abortRef.current);
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setWorking(false);
    setStage("The Director is ready");
    resetDraft();
    if (wasWorking) setBrainState({ brainStatus: brainModel ? "ready" : "offline", analysisStage: "Production development cancelled" });
    setNewProjectOpen(false);
  };
  useEffect(() => { if (brainModel) setModel(brainModel); }, [brainModel]);
  useEffect(() => {
    if (!newProjectOpen || !newProjectPreset) return;
    if (newProjectPreset.brief) setBrief(newProjectPreset.brief);
    if (newProjectPreset.platform) {
      // Platform is derived again at build time for preset formats; this value keeps the home intake intent visible.
      setStage(`Delivery target: ${newProjectPreset.platform}`);
    }
    if (newProjectPreset.format) {
      setFormat(newProjectPreset.format);
      const preset = DIRECTOR_FORMATS.find((item) => item.key === newProjectPreset.format);
      if (preset) { setAspect(preset.defaultAspect); setDuration(preset.defaultDuration); }
      if (newProjectPreset.format === "Image campaign") setProvider("Image model");
      else setProvider((current) => (current === "Image model" ? "Veo 3.1 / Flow" : current));
    }
    if (newProjectPreset.aspect) setAspect(newProjectPreset.aspect);
    if (newProjectPreset.duration) setDuration(newProjectPreset.duration);
  }, [newProjectOpen, newProjectPreset]);
  useEffect(() => {
    if (!newProjectOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeDialog(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newProjectOpen]);
  if (!newProjectOpen) return null;
  const readFile = (file: File) => new Promise<{ name: string; url: string }>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, url: String(reader.result) }); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
  const selectFiles = (incoming: File[]) => {
    const oversized = incoming.filter((file) => file.size > 10 * 1024 * 1024);
    const accepted = incoming.filter((file) => file.size <= 10 * 1024 * 1024).slice(0, 12);
    setFiles(accepted);
    if (incoming.length > 12 || oversized.length) setNotice(`Reference limits applied: maximum 12 images and 10 MB per image. ${accepted.length} accepted.`);
  };
  const ideate = async (seed = conceptSeed) => {
    if (!brief.trim()) return;
    setStep("concepts");
    if (brainStatus !== "ready") {
      setConcepts(ideateConcepts(directorInput(), seed) as DirectorConcept[]);
      setConceptSource("deterministic-fallback");
      setConceptFallbackReason("Local model host is offline.");
      return;
    }
    const runId = ++runRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setWorking(true);
    setConcepts([]);
    setConceptFallbackReason("");
    setStage("The writer's room is developing three directions");
    setBrainState({ brainStatus: "analyzing", brainModel: model, analysisStage: "Developing three original concepts" });
    try {
      const result = await ideateProductionConcepts({ ...directorInput(), model }, { seed, timeoutMs: 60_000, signal: controller.signal, onStatus: (_status, detail) => { if (runRef.current === runId) setStage(detail); } });
      if (controller.signal.aborted || runRef.current !== runId) return;
      setConcepts(result.concepts);
      setConceptSource(result.source);
      setConceptFallbackReason(result.fallbackReason || "");
      setBrainState({ brainStatus: result.model ? "ready" : "offline", brainModel: result.model || brainModel, analysisStage: result.source === "ollama" ? "Three local-model concepts ready" : "Corpus Blueprints ready after local-model response fallback" });
      if (result.fallbackReason) setNotice(`The local writer's room could not finish (${result.fallbackReason}). Three Corpus Blueprints are ready instead; your brief was preserved.`);
    } finally {
      if (runRef.current === runId) { abortRef.current = null; setWorking(false); setStage("The Director is ready"); }
    }
  };
  const reroll = () => { const seed = conceptSeed + 1; setConceptSeed(seed); void ideate(seed); };
  const customizeBlueprints = (field: "hero" | "setting" | "object", value: string) => {
    const next = { ...ideaOverrides, [field]: value };
    setIdeaOverrides(next);
    setConcepts(ideateConcepts({ ...directorInput(), ideaOverrides: next }, conceptSeed) as DirectorConcept[]);
  };
  const choose = (concept: DirectorConcept) => {
    const screenplay = writeScreenplay(directorInput(), concept, conceptSeed);
    setChosen(concept);
    setScenes(screenplay.scenes.map((scene) => ({ ...scene })));
    setScreenplayMeta({ dialogueMode: screenplay.dialogueMode, cast: screenplay.cast, duration: screenplay.duration });
    setStep("script");
  };
  const editScene = (index: number, patch: Partial<ScreenplayScene>) => setScenes((current) => current.map((scene, sceneIndex) => sceneIndex === index ? { ...scene, ...patch } : scene));
  const build = async () => {
    if (!brief.trim() || working) return;
    const selectedConcept = chosen || (ideateConcepts(directorInput(), conceptSeed) as DirectorConcept[])[0];
    const authoredScreenplay = scenes.length ? null : writeScreenplay(directorInput(), selectedConcept, conceptSeed);
    const scaffold = authoredScreenplay || { concept: selectedConcept, dialogueMode: screenplayMeta?.dialogueMode || "vo", cast: screenplayMeta?.cast || [], duration: screenplayMeta?.duration || duration, scenes };
    const runId = ++runRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setWorking(true);
    try {
      const references = await Promise.all(files.map(readFile));
      if (useBrain && brainStatus === "ready") {
        setBrainState({ brainStatus: "analyzing", brainModel: model, analysisStage: "The writer's room is elevating your screenplay" });
        const guidance = deriveCorpusGuidance({ ...project, brief, format, style: "", mood: "" }, osIntelligence);
        const blueprint = await analyzeProductionBrief({ brief, title, format, aspect, duration, platform, provider, model, audience, tone, humor, ...(chosen ? { concept: selectedConcept, screenplay: scaffold } : {}), promptBrain }, guidance, { timeoutMs: 180_000, signal: controller.signal, onStatus: (_status, detail) => { if (runRef.current !== runId) return; setStage(detail); setBrainState({ analysisStage: detail }); } });
        if (controller.signal.aborted || runRef.current !== runId) return;
        setProjectFromBlueprint({ ...blueprint, project: { ...blueprint.project, title: title !== "Untitled production" ? title : blueprint.project.title, format, aspect, duration, platform, provider }, ...(blueprint.source === "ollama" ? { model } : {}) }, brief, references);
      } else {
        const blueprint = developBlueprint({ ...directorInput(), screenplay: scaffold }, selectedConcept, promptBrain, conceptSeed) as Record<string, unknown> & { project: Record<string, unknown> };
        if (controller.signal.aborted || runRef.current !== runId) return;
        setProjectFromBlueprint({ ...blueprint, project: { ...blueprint.project, format, aspect, platform, provider } }, brief, references);
      }
      resetDraft();
    } catch (error) {
      if (controller.signal.aborted || runRef.current !== runId) return;
      setNotice(`Production development failed: ${error instanceof Error ? error.message : "the production could not be built."} Review the screenplay, then try again.`);
      setBrainState({ brainStatus: "error", analysisStage: "Production development failed" });
    } finally {
      if (runRef.current === runId) { abortRef.current = null; setWorking(false); }
    }
  };
  const totalScripted = scenes.reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0);
  return <div className="v2-modal-backdrop" onMouseDown={closeDialog}><section className="v2-new-dialog v2-wizard" role="dialog" aria-modal="true" aria-label="Create a production" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><small>New production - AUTEUR Director</small><h2>{step === "brief" ? "What are we making?" : step === "concepts" ? "Pick the angle" : "The screenplay"}</h2><p>{step === "brief" ? "Develop the full production directly, or explore creative directions before AUTEUR writes the treatment, script, storyboard, continuity system, sound plan, and Prompt Package." : step === "concepts" ? "Three ways to tell it, each with its own twist. Reroll for different lenses." : "Edit anything. Dialogue is spoken verbatim by the cast. Then AUTEUR builds scenes, shots, continuity, and provider packets."}</p></div><button type="button" aria-label="Close new production" onClick={closeDialog}><X size={20} /></button></header>
    <div className="v2-wizard-steps">{(["brief", "concepts", "script"] as const).map((item, index) => <span key={item} className={step === item ? "active" : (["brief", "concepts", "script"] as const).indexOf(step) > index ? "done" : ""}>{index + 1}. {item === "brief" ? "Idea" : item === "concepts" ? "Concepts" : "Script"}</span>)}</div>
    {step === "brief" && <>
      <label className="v2-brief"><span>Idea, script, treatment, or shot list</span><textarea autoFocus maxLength={12000} value={brief} onChange={(event) => { setBrief(event.target.value); invalidateStory(); }} placeholder="A sommelier who can identify the exact vineyard... a watch ad where time literally slows... a founder monologue about why slow is fast..." /><small>{brief.length.toLocaleString()} / 12,000 characters</small></label>
      <div className="v2-intake-grid">
        <label><span>Project name</span><input maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label><span>Format</span><select value={format} onChange={(event) => applyFormat(event.target.value)}><option>Commercial film</option><option>Short film sequence</option><option value="A-roll monologue">A-roll monologue</option><option>Social campaign</option><option>Music video</option><option>Trailer</option><option>Single scene</option><option>Image campaign</option></select></label>
        <label><span>Audience</span><input maxLength={120} value={audience} onChange={(event) => { setAudience(event.target.value); invalidateStory(); }} placeholder="Who has to feel this?" /></label>
        <label><span>Tone</span><select value={tone} onChange={(event) => { setTone(event.target.value); invalidateStory(); }}><option>Cinematic</option><option>Playful</option><option>Deadpan</option><option>Epic</option><option>Intimate</option><option>Luxury restraint</option></select></label>
        <label><span>Humor</span><select value={humor} onChange={(event) => { setHumor(event.target.value); invalidateStory(); }}><option value="none">Played straight</option><option value="dry">Dry / deadpan</option><option value="playful">Playful</option><option value="absurd">Absurdist</option></select></label>
        <label><span>{format === "Image campaign" ? "Frames" : "Duration target (s)"}</span><input type="number" min={format === "Image campaign" ? 1 : 4} max="1800" value={duration} onChange={(event) => { setDuration(Number(event.target.value) || (format === "Image campaign" ? 6 : 24)); invalidateStory(); }} /></label>
        <label><span>Aspect</span><select value={aspect} onChange={(event) => setAspect(event.target.value)}><option>2.39:1</option><option>16:9</option><option>9:16</option><option>4:5</option><option>1:1</option></select></label>
        <label><span>Provider target</span><select value={provider} onChange={(event) => setProvider(event.target.value)}><option>Veo 3.1 / Flow</option><option>Sora</option><option>Runway</option><option>Image model</option></select></label>
        <label><span>Creative intelligence</span><select value={model} onChange={(event) => setModel(event.target.value)}>{(brainModels.length ? brainModels : [model]).map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <label className="v2-upload"><input type="file" accept="image/*" multiple onChange={(event) => selectFiles(Array.from(event.target.files || []))} /><UploadSimple size={20} /><span><strong>{files.length ? `${files.length} references ready` : "Add characters, products, locations, or style references"}</strong><small>{files.length ? files.map((file) => file.name).join(" / ") : "Up to 12 images, 10 MB each. Images become named ingredients."}</small></span></label>
      <footer><div aria-live="polite"><Brain size={17} weight="fill" /><span>{working ? stage : brainStatus === "ready" ? `Writer's room ready / ${brainModel}` : "Local brain offline - output will remain a draft"}</span></div><button type="button" className="v2-ghost" disabled={!brief.trim() || working} onClick={() => void ideate()}><MagicWand size={16} /> Explore directions</button><button type="button" disabled={!brief.trim() || working} onClick={() => void build()}><Sparkle size={18} /> {working ? "Developing production" : "Develop production"}</button></footer>
    </>}
    {step === "concepts" && <>
      {working && !concepts.length ? <div className="v2-concept-loading" role="status"><Brain size={22} weight="fill" /><strong>Developing three directions</strong><span>{stage}</span></div> : <>
        {conceptSource === "deterministic-fallback" && <section className="v2-blueprint-customizer"><header><span><strong>Customize the Corpus Blueprints</strong><small>{conceptFallbackReason || "Grounded in AUTEUR's deterministic story frameworks."}</small></span></header><div><label>Hero name<input aria-label="Blueprint hero name" value={ideaOverrides.hero} onChange={(event) => customizeBlueprints("hero", event.target.value)} placeholder="Mara, the founder..." /></label><label>Setting<input aria-label="Blueprint setting" value={ideaOverrides.setting} onChange={(event) => customizeBlueprints("setting", event.target.value)} placeholder="After-hours museum..." /></label><label>Key object<input aria-label="Blueprint key object" value={ideaOverrides.object} onChange={(event) => customizeBlueprints("object", event.target.value)} placeholder="A cracked stopwatch..." /></label></div></section>}
        <div className="v2-concept-grid">{concepts.map((concept) => <button type="button" key={concept.id} className={`v2-concept-card ${conceptSource === "deterministic-fallback" ? "blueprint" : ""}`} onClick={() => choose(concept)}>{conceptSource === "deterministic-fallback" ? <span className="v2-blueprint-label">Corpus Blueprint</span> : null}<small>{concept.name}</small>{conceptSource === "deterministic-fallback" && <span className="v2-framework">{concept.groundingFramework || `Corpus lens / ${concept.lens}`}</span>}<strong>{concept.logline}</strong><p><b>The twist:</b> {concept.twist}</p><p><b>Comedy:</b> {concept.humor}</p><em>{concept.thesis}</em><span className="v2-concept-cta">Write this one <ArrowRight size={14} /></span></button>)}</div>
      </>}
      <footer><button type="button" className="v2-ghost" disabled={working} onClick={() => setStep("brief")}>Back to idea</button><button type="button" className="v2-ghost" disabled={working} onClick={reroll}><MagicWand size={16} /> Pitch 3 different concepts</button></footer>
    </>}
    {step === "script" && chosen && <>
      <div className="v2-script-head"><strong>{chosen.name}</strong><span>{scenes.length} scenes / {totalScripted}s scripted{screenplayMeta?.cast.length ? ` / cast: ${screenplayMeta.cast.join(", ")}` : ""}</span></div>
      <div className="v2-script-list">{scenes.map((scene, index) => <article key={`${scene.beat}-${index}`}><header><b>{String(index + 1).padStart(2, "0")}</b><input aria-label={`Scene ${index + 1} slugline`} value={scene.slugline} onChange={(event) => editScene(index, { slugline: event.target.value })} /><span>{scene.beat} / {scene.duration}s</span></header><label><span>Action</span><textarea value={scene.action} onChange={(event) => editScene(index, { action: event.target.value })} /></label><label><span>Dialogue / VO {screenplayMeta?.dialogueMode === "monologue" ? "(spoken to camera, verbatim)" : "(verbatim, lip-synced)"}</span><textarea className="v2-dialogue" value={scene.dialogue} placeholder="No spoken lines in this scene" onChange={(event) => editScene(index, { dialogue: event.target.value })} /></label></article>)}</div>
      <label className="v2-usebrain"><input type="checkbox" checked={useBrain && brainStatus === "ready"} disabled={brainStatus !== "ready"} onChange={(event) => setUseBrain(event.target.checked)} /><span><strong>Elevate with the local writer's room ({brainModel || "no model"})</strong><small>{brainStatus === "ready" ? "The local model rewrites language and dialogue against the corpus gold standard. Structure and timing stay yours." : "Local brain offline - the deterministic Director builds it as written."}</small></span></label>
      <footer><button type="button" className="v2-ghost" onClick={() => setStep("concepts")}>Back to concepts</button><div className={working ? "working" : ""} aria-live="polite"><Brain size={17} weight="fill" /><span>{working ? stage : "Ready to build"}</span></div><button type="button" disabled={working} onClick={() => void build()}><FilmSlate size={18} />{working ? "Building production" : "Build the production"}</button></footer>
    </>}
  </section></div>;
}

function Notice() {
  const { notice, setNotice, setMode } = useStudio();
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 4200); return () => window.clearTimeout(timer); }, [notice, setNotice]);
  const presentation = noticePresentation(notice);
  const recover = () => {
    if (presentation.recovery === "prompts") setMode("prompts");
    if (presentation.recovery === "review-upload") {
      setMode("review");
      window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*,video/*"]')?.click());
    }
    if (presentation.recovery === "model") {
      const modelStatus = document.querySelector<HTMLDetailsElement>(".v2-brain");
      if (modelStatus) modelStatus.open = true;
    }
    setNotice("");
  };
  return notice ? <div className={`v2-notice ${presentation.kind === "error" ? "warning" : ""}`} role={presentation.kind === "error" ? "alert" : "status"}>{presentation.kind === "error" ? <WarningCircle size={15} weight="fill" /> : <Check size={15} weight="bold" />}<span>{presentation.message}</span>{presentation.actionLabel ? <button type="button" onClick={recover}>{presentation.actionLabel}</button> : null}</div> : null;
}

export function AppV2() {
  const { mode, project, setCorpusIntelligence, setIntelligenceStatus, setBrainState } = useStudio();
  useEffect(() => {
    const runtime = globalThis as typeof globalThis & { __AUTEUR_OFFLINE_DATA__?: { brain?: Record<string, any>; deltas?: Record<string, any>; promptBrain?: Record<string, any> } };
    const offlineBrain = runtime.__AUTEUR_OFFLINE_DATA__?.brain;
    const offlineDeltas = runtime.__AUTEUR_OFFLINE_DATA__?.deltas;
    const offlinePromptBrain = runtime.__AUTEUR_OFFLINE_DATA__?.promptBrain;
    if (offlineBrain && offlineDeltas) {
      setCorpusIntelligence(offlineBrain.failure_rules || [], { ...offlineDeltas, render_records: offlineBrain.coverage?.analyzed, prompt_brain: offlinePromptBrain });
    } else {
      Promise.all([fetch("/data/auteur-render-brain.json"), fetch("/data/auteur-render-os-deltas.json"), fetch("/data/auteur-prompt-brain.json")]).then(async ([brainResponse, deltaResponse, promptResponse]) => {
        if (!brainResponse.ok || !deltaResponse.ok) { setIntelligenceStatus("unavailable"); return; }
        const [brain, deltas] = await Promise.all([brainResponse.json(), deltaResponse.json()]);
        const promptBrain = promptResponse.ok ? await promptResponse.json() : undefined;
        setCorpusIntelligence(brain.failure_rules || [], { ...deltas, render_records: brain.coverage?.analyzed, prompt_brain: promptBrain });
      }).catch(() => setIntelligenceStatus("unavailable"));
    }
    discoverLocalModelRoles({ timeoutMs: 12_000 }).then((probe) => {
      const preferred = probe.roles.creativeDirector?.selected || probe.roles.screenplay?.selected || probe.model || "";
      const routeSummary = probe.roles.screenplay?.selected && probe.roles.promptPacket?.selected
        ? `Auto-routed: screenplay ${probe.roles.screenplay.selected}; Prompt Packages ${probe.roles.promptPacket.selected}`
        : "Local creative intelligence ready";
      setBrainState({ brainStatus: probe.available ? "ready" : "offline", brainModel: preferred, brainModels: probe.models, analysisStage: probe.available ? routeSummary : probe.error || "Local brain unavailable" });
    });
  }, [setBrainState, setCorpusIntelligence, setIntelligenceStatus]);
  return <div className={`v2-shell mode-${mode}`}><TopBar /><SideNav /><main className="v2-main"><Workspace /></main>{mode === "storyboard" && <Inspector />}<NewProductionDialog /><Notice /><div className="v2-source-truth"><strong>Local-First Processing Active</strong><span>{project.intelligenceSource === "ollama" ? `AI-authored locally / ${project.intelligenceModel}` : "Corpus-grounded deterministic draft / no model used"}</span></div></div>;
}
