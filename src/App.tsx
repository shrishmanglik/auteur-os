import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  CaretDown,
  Check,
  Copy,
  DownloadSimple,
  ImageSquare,
  LockKey,
  MagicWand,
  Package,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
  Sparkle,
  Trash,
  UploadSimple,
  WarningCircle,
  Waveform,
  X,
} from "@phosphor-icons/react";
import { deriveCorpusGuidance, embedPacketMedia, exportPacket, formatTimecode, getDeliveryLayers } from "./engine.mjs";
import { useStudio } from "./store";
import type { Project, Shot, WorkspaceMode } from "./types";

const modes: Array<{ id: WorkspaceMode; label: string }> = [
  { id: "story", label: "Story" },
  { id: "board", label: "Board" },
  { id: "prompts", label: "Prompts" },
  { id: "review", label: "Review" },
  { id: "deliverables", label: "Deliverables" },
];

function handleTabKey<T extends string>(event: ReactKeyboardEvent<HTMLButtonElement>, tabs: readonly T[], current: T, select: (tab: T) => void, prefix: string) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const currentIndex = tabs.indexOf(current);
  const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
    : event.key === "ArrowRight" ? (currentIndex + 1) % tabs.length : (currentIndex - 1 + tabs.length) % tabs.length;
  const next = tabs[nextIndex];
  select(next);
  window.requestAnimationFrame(() => document.getElementById(`${prefix}-${next}`)?.focus());
}

function orderedShots(project: Project): Shot[] {
  const byId = new Map(project.shots.map((shot) => [shot.id, shot]));
  return project.scenes.flatMap((scene) => scene.shots.map((id) => byId.get(id)).filter(Boolean) as Shot[]);
}

function download(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not embed media: ${url}`);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read media: ${url}`));
    reader.readAsDataURL(blob);
  });
}

function TopBar() {
  const { project, osIntelligence, mode, setMode, setNewProjectOpen, previewing, playhead, setPreviewing, setPlayhead, persistenceStatus, setNotice, compileAllShots } = useStudio();
  const dirtyCount = project.shots.filter((shot) => shot.packetDirty).length;
  const exportProject = async () => {
    try {
      const packet = await embedPacketMedia(exportPacket(project, osIntelligence), toDataUrl);
      download(`${project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-packet.json`, JSON.stringify(packet, null, 2));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Packet export failed.");
    }
  };
  const imageSequence = project.format.toLowerCase().includes("image");
  const preview = () => { const total = project.shots.reduce((sum, shot) => sum + shot.duration, 0); setMode("board"); if (imageSequence) { setPreviewing(false); setPlayhead(0); return; } if (playhead >= total) setPlayhead(0); setPreviewing(!previewing); };
  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={() => setNewProjectOpen(true)} aria-label="Open project menu">
        <span className="brand-mark">A</span><span>AUTEUR</span>
      </button>
      <div className="project-switcher">
        <span>Projects</span><strong>{project.title}</strong><CaretDown size={13} />
      </div>
      <div className={persistenceStatus === "saved" && !dirtyCount ? "save-state" : "save-state warning"}>{persistenceStatus === "saved" && !dirtyCount ? <Check size={14} weight="bold" /> : <WarningCircle size={14} weight="fill" />}{dirtyCount ? `${dirtyCount} packet${dirtyCount === 1 ? "" : "s"} need compile` : persistenceStatus === "saved" ? "Saved locally" : persistenceStatus === "metadata-only" ? "Project saved / media session-only" : "Local save unavailable"}</div>
      <nav className="mode-tabs" aria-label="Project workspace">
        {modes.map((item) => (
          <button key={item.id} type="button" className={mode === item.id ? "active" : ""} aria-current={mode === item.id ? "page" : undefined} onClick={() => setMode(item.id)}>{item.label}</button>
        ))}
      </nav>
      <div className="top-actions">
        <div className="avatars" aria-label="Project collaborators"><span>SM</span><span>AD</span><span>+2</span></div>
        {dirtyCount > 0 && <button className="button secondary" type="button" onClick={compileAllShots}><MagicWand size={16} /> Compile {dirtyCount}</button>}
        <button className="button secondary" type="button" onClick={preview}>{imageSequence ? <ImageSquare size={16} /> : previewing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />} {imageSequence ? "Open board" : previewing ? "Pause" : "Preview"}</button>
        <button className="button primary" type="button" onClick={exportProject}><DownloadSimple size={17} /> Export</button>
      </div>
    </header>
  );
}

function ProjectNav() {
  const { project, selectedSceneId, selectedShotId, selectScene, selectShot, setMode } = useStudio();
  return (
    <aside className="project-nav">
      <div className="nav-label">Sequence / {project.scenes.length} scenes / {project.shots.length} shots</div>
      <div className="sequence-list" aria-label="Scenes and shots">
        {project.scenes.map((scene, sceneIndex) => {
          const expanded = selectedSceneId === scene.id;
          const sceneShots = scene.shots.map((id) => project.shots.find((shot) => shot.id === id)).filter(Boolean) as Shot[];
          return (
            <section key={scene.id} className={expanded ? "scene-nav expanded" : "scene-nav"}>
              <button type="button" className="scene-nav-head" onClick={() => selectScene(scene.id)}>
                <CaretDown size={13} className={expanded ? "" : "collapsed"} /><span>{String(sceneIndex + 1).padStart(2, "0")}</span><strong>{scene.title}</strong><small>{sceneShots.length} shots</small>
              </button>
              {expanded && <div className="scene-shot-list">
                {sceneShots.map((shot, shotIndex) => (
                  <button key={shot.id} type="button" className={shot.id === selectedShotId ? "active" : ""} onClick={() => selectShot(shot.id)}>
                    <img src={shot.image} alt="" /><span><b>{sceneIndex + 1}.{shotIndex + 1} {shot.title}</b><small>{shot.duration}s</small></span>
                  </button>
                ))}
              </div>}
            </section>
          );
        })}
      </div>
      <div className="nav-assets">
        <div className="nav-label">Locked references</div>
        <div className="asset-strip">{project.assets.slice(0, 3).map((asset) => <img key={asset.id} src={asset.url} alt={asset.name} title={asset.name} />)}</div>
        <button type="button" onClick={() => setMode("story")}>View project assets <ArrowRight size={14} /></button>
      </div>
    </aside>
  );
}

function ShotCard({ shot, index, numberLabel, imageSequence }: { shot: Shot; index: number; numberLabel: string; imageSequence: boolean }) {
  const { selectedShotId, selectShot, moveShot, duplicateShot } = useStudio();
  const active = selectedShotId === shot.id;
  const riskLabel = shot.contentType === "product_ad" ? "Geometry lock risk" : shot.contentType === "food_ad" ? "Contact physics risk" : shot.contentType === "character_scene" || shot.contentType === "music_fashion" ? "Identity drift risk" : shot.contentType === "vfx_sequence" ? "Scale continuity risk" : "Reflection continuity risk";
  return (
    <article className={active ? "shot-card active" : "shot-card"} onClick={() => selectShot(shot.id)}>
      <div className="shot-meta"><span>{numberLabel}</span><span>{imageSequence ? "Frame" : `${shot.duration}s`}</span></div>
      <div className="shot-image"><img src={shot.image} alt={`${shot.title} storyboard frame`} />
        {shot.image.startsWith("/media/") && <span className="evidence-badge">Corpus reference</span>}
        {index === 0 && <button className="risk-chip" type="button" onClick={(event) => { event.stopPropagation(); selectShot(shot.id); }}><WarningCircle size={13} weight="fill" /> {riskLabel}</button>}
      </div>
      <div className="shot-copy"><strong>{shot.title}</strong><p>{shot.description}</p></div>
      <div className="shot-actions">
        <button type="button" title="Move left" aria-label="Move shot left" onClick={(event) => { event.stopPropagation(); moveShot(shot.id, -1); }}><ArrowLeft size={14} /></button>
        <button type="button" title="Move right" aria-label="Move shot right" onClick={(event) => { event.stopPropagation(); moveShot(shot.id, 1); }}><ArrowRight size={14} /></button>
        <button type="button" title="Create alternate" aria-label="Create shot alternate" onClick={(event) => { event.stopPropagation(); duplicateShot(shot.id); }}><Copy size={14} /></button>
      </div>
    </article>
  );
}

function DirectorComposer() {
  const { command, setCommand, runDirectorCommand } = useStudio();
  return (
    <div className="director-composer">
      <Sparkle size={18} weight="fill" /><input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runDirectorCommand()} placeholder="Direct the selected shot, e.g. make the arrival quieter and hold the final frame" />
      <button type="button" onClick={runDirectorCommand} aria-label="Apply director command"><ArrowRight size={18} weight="bold" /></button>
    </div>
  );
}

function BoardWorkspace() {
  const { project, setNewProjectOpen } = useStudio();
  const shots = orderedShots(project);
  const imageSequence = project.format.toLowerCase().includes("image");
  const total = shots.reduce((sum, shot) => sum + shot.duration, 0);
  return (
    <div className="board-workspace">
      <div className="workspace-heading">
        <div><span className="eyebrow">Sequence board / {project.scenes.length} scenes</span><h1>{project.title}</h1><p>Compare the full dramatic and visual progression before compiling any shot.</p></div>
        <div className="view-tools"><button type="button"><ImageSquare size={16} /> Fit</button><button type="button" onClick={() => setNewProjectOpen(true)}><SlidersHorizontal size={16} /> Strategy</button></div>
      </div>
      <div className="shot-board" style={{ "--shot-count": shots.length } as CSSProperties}>
        {shots.map((shot, index) => {
          const sceneIndex = project.scenes.findIndex((scene) => scene.id === shot.sceneId);
          const sceneShotIndex = project.scenes[sceneIndex].shots.indexOf(shot.id);
          return <ShotCard key={shot.id} shot={shot} index={index} numberLabel={`${sceneIndex + 1}.${sceneShotIndex + 1}`} imageSequence={imageSequence} />;
        })}
        <button type="button" className="add-shot" onClick={() => useStudio.getState().duplicateShot(shots[shots.length - 1].id)}><Plus size={22} /><span>Add shot</span></button>
      </div>
      <DirectorComposer />
      <div className="scene-summary"><span>{shots.length} shots</span><span>{imageSequence ? `${shots.length} frames` : `${total}s sequence`}</span><span>{project.aspect}</span><span>{project.continuity} continuity</span></div>
    </div>
  );
}

function Timeline() {
  const { project, selectedShotId, selectShot, previewing, playhead, setPreviewing, setPlayhead } = useStudio();
  const shots = orderedShots(project);
  const total = shots.reduce((sum, shot) => sum + shot.duration, 0);
  const clips = useMemo(() => {
    let cursor = 0;
    return shots.map((shot, index) => { const start = cursor; cursor += shot.duration; return { shot, index, start }; });
  }, [shots]);
  const sceneBoundaries = useMemo(() => project.scenes.slice(0, -1).map((scene) => scene.shots.reduce((sum, id) => sum + (project.shots.find((shot) => shot.id === id)?.duration || 0), 0)).reduce<number[]>((marks, duration) => [...marks, duration + (marks.at(-1) || 0)], []), [project]);
  useEffect(() => {
    if (!previewing) return;
    const timer = window.setInterval(() => setPlayhead((value) => {
      const next = value + .25;
      if (next >= total) { setPreviewing(false); return total; }
      return next;
    }), 250);
    return () => window.clearInterval(timer);
  }, [previewing, setPlayhead, setPreviewing, total]);
  useEffect(() => { if (playhead > total) setPlayhead(total); }, [playhead, setPlayhead, total]);
  useEffect(() => {
    if (!previewing) return;
    const active = clips.find(({ shot, start }) => playhead >= start && playhead < start + shot.duration) || clips.at(-1);
    if (active && active.shot.id !== selectedShotId) selectShot(active.shot.id);
  }, [clips, playhead, previewing, selectShot, selectedShotId]);
  return (
    <footer className="timeline">
      <div className="timeline-controls"><button type="button" onClick={() => { if (playhead >= total) setPlayhead(0); setPreviewing(!previewing); }} aria-label={previewing ? "Pause sequence" : "Play sequence"}>{previewing ? <Pause size={15} weight="fill" /> : <Play size={15} weight="fill" />}</button><div><strong>{formatTimecode(playhead)} / {formatTimecode(total)}</strong><span>Sound plan / render UNKNOWN</span></div></div>
      <div className="timeline-track">
        <div className="time-ruler">{[0, .25, .5, .75, 1].map((fraction) => <span key={fraction}>{formatTimecode(total * fraction)}</span>)}</div>
        <div className="timeline-shots">
          {clips.map(({ shot, index, start }) => <button key={shot.id} type="button" className={shot.id === selectedShotId ? "active" : ""} style={{ flex: shot.duration }} onClick={() => { selectShot(shot.id); setPlayhead(start); }} title={`${shot.title}, starts at ${start}s`}><img src={shot.image} alt="" /><span>{index + 1}</span><small>{shot.duration}s</small></button>)}
          {sceneBoundaries.map((mark, index) => <i key={mark} className="scene-boundary" style={{ left: `${(mark / total) * 100}%` }}><b>S{index + 2}</b></i>)}
          <i className="playhead" style={{ left: `${Math.min(100, Math.max(0, (playhead / total) * 100))}%` }} />
        </div>
        <div className="waveform" aria-label="Planned audio waveform; rendered audio evidence is unknown">{Array.from({ length: 48 }, (_, index) => <span key={index} style={{ height: `${5 + ((index * 7) % 18)}px` }} />)}</div>
      </div>
    </footer>
  );
}

function Field({ label, value, onChange, options }: { label: string; value: string | number; onChange: (value: string) => void; options?: string[] }) {
  return <label className="field"><span>{label}</span>{options ? <select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select> : <input value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function CorpusBlueprint() {
  const { project, osIntelligence } = useStudio();
  const guidance = deriveCorpusGuidance(project, osIntelligence);
  if (!guidance.available) return null;
  const renderCount = guidance.provenance.renderRecords?.toLocaleString() ?? "UNKNOWN";
  const batchCount = guidance.provenance.batchDeltas ?? "UNKNOWN";
  return <section className="corpus-blueprint" aria-label="Active corpus direction"><header><div><Sparkle size={17} weight="fill" /><span>Corpus direction / {guidance.route}</span></div><b>{renderCount} renders / {batchCount} batch studies</b></header><div><article><small>Story architecture</small><strong>{guidance.storyPattern}</strong><p>{guidance.storyBeats.slice(0, 3).join(" -> ") || "Setup -> defining action -> consequence -> held image"}</p></article><article><small>Domain playbook</small><strong>{guidance.domainPlaybook}</strong></article><article><small>Style grammar</small><strong>{guidance.styleSystem}</strong><p>{guidance.styleTokens.slice(0, 5).join(", ")}</p></article><article><small>Sound logic</small><strong>{guidance.audioFramework}</strong><p>{guidance.audioRule}</p></article></div></section>;
}

function Inspector() {
  const { project, selectedShotId, inspectorOpen, setInspectorOpen, inspectorTab, setInspectorTab, updateShot, toggleAssetLock, compileSelectedShot, deleteShot, osIntelligence } = useStudio();
  const shot = project.shots.find((item) => item.id === selectedShotId)!;
  const frameInputRef = useRef<HTMLInputElement>(null);
  if (!inspectorOpen) return <button className="open-inspector" type="button" title="Shot controls" aria-label="Shot controls" onClick={() => setInspectorOpen(true)}><SlidersHorizontal size={18} /><span>Shot controls</span></button>;
  const tabs: Array<typeof inspectorTab> = ["direction", "camera", "motion", "prompt", "versions"];
  const beatCount = Math.max(1, shot.action.split(/\b(?:then|and then|before|after|while)\b|[.;]/i).filter((beat) => beat.trim()).length);
  const beatBudget = Math.max(1, Math.min(3, Math.ceil(shot.duration / 2)));
  const guidance = deriveCorpusGuidance(project, osIntelligence);
  const primaryGuard = guidance.failureRepairs[0];
  const replaceFrame = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => updateShot(shot.id, { image: String(reader.result) }); reader.readAsDataURL(file); };
  return (
    <aside className="inspector-panel">
      <div className="inspector-head"><div><span>Shot</span><strong>{shot.title}</strong></div><button type="button" onClick={() => setInspectorOpen(false)} aria-label="Close inspector"><X size={18} /></button></div>
      <div className="inspector-tabs" role="tablist" aria-label="Shot controls">{tabs.map((tab) => <button key={tab} id={`inspector-tab-${tab}`} role="tab" aria-selected={inspectorTab === tab} aria-controls={`inspector-panel-${tab}`} tabIndex={inspectorTab === tab ? 0 : -1} type="button" className={inspectorTab === tab ? "active" : ""} onKeyDown={(event) => handleTabKey(event, tabs, inspectorTab, setInspectorTab, "inspector-tab")} onClick={() => setInspectorTab(tab)}>{tab}</button>)}</div>
      <div className="inspector-body">
        <div className="camera-strip"><span><small>Size</small>{shot.shotSize}</span><span><small>Lens</small>{shot.lens}</span><span><small>Move</small>{shot.movement}</span></div>
        <div className="reference-section priority"><div className="section-label">Continuity references</div><div className="reference-grid">{project.assets.map((asset) => <button key={asset.id} type="button" className={asset.locked ? "locked" : ""} onClick={() => toggleAssetLock(asset.id)}><img src={asset.url} alt={asset.name} /><span>{asset.locked && <LockKey size={11} weight="fill" />}{asset.name}</span></button>)}</div></div>
        <div className="evidence-strip"><span className={beatCount > beatBudget ? "warn" : "pass"}><small>Beat budget</small>{beatCount} / {beatBudget}</span><span><small>Endpoint</small>{shot.endState.trim() ? "Locked" : "Missing"}</span><span><small>Evidence ceiling</small>{shot.review.renderUrl ? "Frame attached" : "Storyboard only"}</span></div>
        {primaryGuard && <div className="corpus-guard"><WarningCircle size={15} weight="fill" /><div><strong>Render-proven risk gate</strong><p>{primaryGuard}</p></div><b>{guidance.provenance.batchDeltas ?? "UNKNOWN"}</b></div>}
        <div id={`inspector-panel-${inspectorTab}`} role="tabpanel" aria-labelledby={`inspector-tab-${inspectorTab}`}>
        {inspectorTab === "direction" && <>
          <Field label="Shot name" value={shot.title} onChange={(title) => updateShot(shot.id, { title })} />
          <div className="field-grid"><Field label="Duration" value={shot.duration} onChange={(duration) => updateShot(shot.id, { duration: Math.max(1, Number(duration) || 1) })} /><Field label="Provider" value={shot.provider} options={["Veo 3.1 / Flow", "Sora", "Runway", "Image model"]} onChange={(provider) => updateShot(shot.id, { provider })} /></div>
          <Field label="Defining action" value={shot.action} onChange={(action) => updateShot(shot.id, { action })} />
          <Field label="Resolved end state" value={shot.endState} onChange={(endState) => updateShot(shot.id, { endState })} />
          <Field label="Director notes" value={shot.description} onChange={(description) => updateShot(shot.id, { description })} />
        </>}
        {inspectorTab === "camera" && <>
          <Field label="Shot size" value={shot.shotSize} options={["Environmental wide", "Wide master", "Medium cinematic", "Close-up", "Detail close-up", "Macro"]} onChange={(shotSize) => updateShot(shot.id, { shotSize })} />
          <Field label="Lens / framing" value={shot.lens} onChange={(lens) => updateShot(shot.id, { lens })} />
          <Field label="Camera movement" value={shot.movement} onChange={(movement) => updateShot(shot.id, { movement })} />
          <Field label="Start state" value={shot.startState} onChange={(startState) => updateShot(shot.id, { startState })} />
        </>}
        {inspectorTab === "motion" && <>
          <Field label="Physical action" value={shot.action} onChange={(action) => updateShot(shot.id, { action })} />
          <Field label="Sound intent" value={shot.audioIntent} onChange={(audioIntent) => updateShot(shot.id, { audioIntent })} />
          <div className="intelligence-note"><WarningCircle size={17} weight="fill" /><div><strong>{guidance.promptRule}</strong><p>{guidance.promptReason}</p></div></div>
        </>}
        {inspectorTab === "prompt" && <div className="prompt-mini"><p>{shot.versions.find((version) => version.id === shot.activeVersionId)?.videoPrompt}</p><button type="button" onClick={compileSelectedShot}><ArrowsClockwise size={16} /> Recompile</button></div>}
        {inspectorTab === "versions" && <VersionList shot={shot} />}
        </div>
      </div>
      <div className="inspector-footer"><button className="button primary" type="button" onClick={compileSelectedShot}><MagicWand size={17} /> Build prompts</button><button className="icon-upload" type="button" onClick={() => frameInputRef.current?.click()} aria-label="Replace storyboard frame"><UploadSimple size={17} /></button><input ref={frameInputRef} hidden type="file" accept="image/*" onChange={(event) => replaceFrame(event.target.files?.[0])} /><button className="icon-danger" type="button" onClick={() => deleteShot(shot.id)} aria-label="Delete selected shot"><Trash size={17} /></button></div>
    </aside>
  );
}

function VersionList({ shot }: { shot: Shot }) {
  const { setActiveVersion } = useStudio();
  return <div className="version-list">{shot.versions.map((version) => <button key={version.id} type="button" className={version.id === shot.activeVersionId ? "active" : ""} onClick={() => setActiveVersion(shot.id, version.id)}><span>{version.label}</span><div><strong>{version.source}</strong><small>{new Date(version.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>{version.id === shot.activeVersionId && <Check size={15} />}</button>)}</div>;
}

function StoryRoom() {
  const { project, setMode, selectedSceneId, selectScene, updateProject, updateScene } = useStudio();
  const [editing, setEditing] = useState(false);
  return <div className="story-room"><div className="story-header"><div><span className="eyebrow">Treatment</span><h1>{project.title}</h1><p>{project.logline}</p></div><div className="story-actions"><button className="button secondary" type="button" onClick={() => setEditing(!editing)}><SlidersHorizontal size={16} /> {editing ? "Close edit" : "Edit treatment"}</button><button className="button primary" type="button" onClick={() => setMode("board")}>Go to Board <ArrowRight size={16} /></button></div></div>
    {editing && <div className="story-editor"><div><Field label="Logline" value={project.logline} onChange={(logline) => updateProject({ logline })} /><Field label="Style bible" value={project.style} onChange={(style) => updateProject({ style })} /><Field label="World rule" value={project.worldRule} onChange={(worldRule) => updateProject({ worldRule })} /></div><section>{project.scenes.map((scene, index) => <label key={scene.id}><span>Scene {index + 1}</span><input value={scene.title} onChange={(event) => updateScene(scene.id, { title: event.target.value })} /><textarea value={scene.intent} onChange={(event) => updateScene(scene.id, { intent: event.target.value })} /></label>)}</section></div>}
    <div className="strategy-line"><span>{project.shots[0].contentType.replaceAll("_", " ")}</span><span>{project.format}</span><span>{project.format.toLowerCase().includes("image") ? `${project.shots.length} frames` : `${project.duration}s`}</span><span>{project.aspect}</span><span>{project.platform}</span><span>{project.mood}</span><span>{project.realism}</span><span>{project.quality}</span></div>
    <CorpusBlueprint />
    <div className="story-scenes">{project.scenes.map((scene, sceneIndex) => {
      const shots = scene.shots.map((id) => project.shots.find((shot) => shot.id === id)).filter(Boolean) as Shot[];
      return <section key={scene.id} className={scene.id === selectedSceneId ? "active" : ""} onClick={() => selectScene(scene.id)}><header><span>{sceneIndex + 1}</span><h2>{scene.title}</h2><p>{scene.intent}</p><b>{project.format.toLowerCase().includes("image") ? `${shots.length} frames` : `${shots.reduce((sum, shot) => sum + shot.duration, 0)}s`}</b></header><div>{shots.map((shot) => <button key={shot.id} type="button" onClick={(event) => { event.stopPropagation(); useStudio.getState().selectShot(shot.id); }}><img src={shot.image} alt={shot.title} /><span>{shot.title}</span></button>)}</div>{sceneIndex === 1 && <aside><WarningCircle size={15} weight="fill" /> This scene carries two physical beats. Keep each shot to one visible action.<button type="button" onClick={() => setMode("board")}>Review shots</button></aside>}</section>;
    })}</div>
    <div className="asset-shelf"><div><span className="eyebrow">Project anchors</span><h3>Cast, objects, world, and sound</h3></div>{project.assets.map((asset) => <figure key={asset.id}><img src={asset.url} alt={asset.name} /><figcaption><LockKey size={12} weight="fill" />{asset.name}</figcaption></figure>)}<div className="sound-tile"><Waveform size={21} /><span>Sound architecture</span><small>{project.audio}</small></div></div>
  </div>;
}

function PromptWorkspace() {
  const { project, osIntelligence, selectedShotId, selectShot, promptTab, setPromptTab, setMode, compileSelectedShot, setNotice } = useStudio();
  const shot = project.shots.find((item) => item.id === selectedShotId)!;
  const version = shot.versions.find((item) => item.id === shot.activeVersionId) || shot.versions[0];
  const text = promptTab === "frame" ? version.framePrompt : promptTab === "audio" ? version.audioPrompt : promptTab === "negative" ? version.negativePrompt : version.videoPrompt;
  const copyText = async () => {
    if (shot.packetDirty) { setNotice("Compile this shot before copying its packet."); return; }
    await navigator.clipboard.writeText(text);
    setNotice("Prompt copied.");
  };
  const exportShot = () => {
    if (shot.packetDirty) { setNotice("Compile this shot before exporting its packet."); return; }
    download(`${shot.title}-prompt.txt`, text, "text/plain");
  };
  const shots = orderedShots(project);
  const promptTabs = ["frame", "video", "audio", "negative"] as const;
  const qcPassed = shot.review.status === "pass";
  const guidance = deriveCorpusGuidance(project, osIntelligence);
  return <div className="prompt-workspace"><div className="workspace-heading"><div><span className="eyebrow">Generation packet</span><h1>{shot.title}</h1><p>{shot.provider} / {shot.duration}s / {project.aspect}</p></div><button className="button primary" type="button" onClick={() => setMode("review")}>Review output <ArrowRight size={16} /></button></div>
    <div className="prompt-layout"><aside className="prompt-shot-list">{shots.map((item, index) => <button key={item.id} type="button" className={item.id === shot.id ? "active" : ""} onClick={() => selectShot(item.id)}><img src={item.image} alt="" /><span>{String(index + 1).padStart(2, "0")} {item.title}<small>{item.versions.length} version{item.versions.length === 1 ? "" : "s"}</small></span></button>)}</aside>
      <section className="prompt-editor"><div className="prompt-tabs" role="tablist" aria-label="Prompt layers">{promptTabs.map((tab) => <button key={tab} id={`prompt-tab-${tab}`} role="tab" aria-selected={promptTab === tab} aria-controls={`prompt-panel-${tab}`} tabIndex={promptTab === tab ? 0 : -1} type="button" className={promptTab === tab ? "active" : ""} onKeyDown={(event) => handleTabKey(event, promptTabs, promptTab, setPromptTab, "prompt-tab")} onClick={() => setPromptTab(tab)}>{tab === "frame" ? "Storyboard frame" : tab === "video" ? "Video prompt" : tab === "audio" ? "Audio plan" : "Negative prompt"}</button>)}</div><div className="prompt-tab-panel" id={`prompt-panel-${promptTab}`} role="tabpanel" aria-labelledby={`prompt-tab-${promptTab}`}><pre>{text}</pre><div className="prompt-checks">{shot.packetDirty ? <span><WarningCircle size={14} /> Needs compile</span> : <span><Check size={14} /> Packet current</span>}<span><LockKey size={14} /> {shot.continuityRefs.length} locked references</span><span>{qcPassed ? <Check size={14} /> : <WarningCircle size={14} />}{qcPassed ? "QC passed" : `${version.qcGates.length} QC requirements`}</span><span><WarningCircle size={14} /> Provider not mutated</span></div><div className="prompt-actions">{shot.packetDirty && <button className="button primary" type="button" onClick={compileSelectedShot}><MagicWand size={16} /> Compile shot</button>}<button className="button secondary" type="button" disabled={shot.packetDirty} onClick={copyText}><Copy size={16} /> Copy</button><button className="button primary" type="button" disabled={shot.packetDirty} onClick={exportShot}><DownloadSimple size={16} /> Export shot</button></div></div></section>
      <aside className="packet-summary"><span className="eyebrow">Active packet</span><h3>{version.label}</h3><dl><dt>Source</dt><dd>{version.source}</dd><dt>Continuity</dt><dd>{project.continuity}</dd><dt>Provider</dt><dd>{shot.provider}</dd><dt>Audio proof</dt><dd>UNKNOWN</dd></dl>{guidance.available && <div className="packet-intelligence"><span className="section-label">Corpus recipe</span><strong>{guidance.promptRule}</strong><small>{guidance.storyPattern} / {guidance.styleSystem}</small><b>{guidance.evidenceGenIds.length} linked exemplars</b></div>}<div className={`qc-gate-list${qcPassed ? " passed" : ""}`}><span className="section-label">{qcPassed ? "QC gates / passed" : "QC requirements / unverified"}</span>{version.qcGates.map((gate) => <p key={gate}>{qcPassed ? <Check size={12} /> : <WarningCircle size={12} />}{gate}</p>)}</div><VersionList shot={shot} /></aside>
    </div>
  </div>;
}

function ReviewWorkspace() {
  const { project, osIntelligence, selectedShotId, updateReview, attachRender, analyzeReview, toggleProposal, applyRepairs, setMode } = useStudio();
  const shot = project.shots.find((item) => item.id === selectedShotId)!;
  const inputRef = useRef<HTMLInputElement>(null);
  const attach = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => attachRender(shot.id, String(reader.result)); reader.readAsDataURL(file); };
  const guidance = deriveCorpusGuidance(project, osIntelligence);
  return <div className="review-workspace"><div className="workspace-heading"><div><span className="eyebrow">Review and repair / {shot.review.status}</span><h1>{shot.title}</h1><p>Storyboard intent and provider output stay separate.</p></div><button className="button secondary" type="button" onClick={() => setMode("prompts")}>Open packet</button></div>
    <div className="review-grid"><section className="review-media"><div className="media-label">Storyboard intent</div><img src={shot.image} alt={`${shot.title} storyboard`} /><div className="media-label output">Provider render evidence</div>{shot.review.renderUrl ? <img src={shot.review.renderUrl} alt="Attached provider render evidence" /> : <button className="render-drop" type="button" onClick={() => inputRef.current?.click()}><UploadSimple size={26} /><strong>Attach rendered frame</strong><span>No provider output is inferred from the storyboard.</span></button>}<input ref={inputRef} hidden type="file" accept="image/*" onChange={(event) => attach(event.target.files?.[0])} /></section>
      <section className="review-controls">{guidance.failureRepairs.length > 0 && <div className="corpus-risk-list"><span className="section-label">Render-derived failure watchlist</span>{guidance.failureRepairs.map((repair) => <p key={repair}><WarningCircle size={13} weight="fill" />{repair}</p>)}</div>}<div className="review-gates"><label><input type="checkbox" disabled={!shot.review.renderUrl} checked={shot.review.temporalPass === true} onChange={(event) => updateReview(shot.id, { temporalPass: event.target.checked })} /><span><strong>Temporal state survives</strong><small>Start, action, consequence, and held end state are visible.</small></span></label><label><input type="checkbox" disabled={!shot.review.renderUrl} checked={shot.review.continuityPass === true} onChange={(event) => updateReview(shot.id, { continuityPass: event.target.checked })} /><span><strong>Continuity survives</strong><small>Identity, object geometry, direction, and world remain locked.</small></span></label></div>
        <label className="critique"><span>Frame critique</span><textarea value={shot.review.critique} onChange={(event) => updateReview(shot.id, { critique: event.target.value })} placeholder="Describe only what the attached output proves: identity drifts at contact, wheel motion slides, final state is missing..." /></label><button className="button primary" type="button" disabled={!shot.review.renderUrl || !shot.review.critique.trim()} onClick={() => analyzeReview(shot.id)}><MagicWand size={17} /> Analyze critique</button>
        {shot.review.proposals.length > 0 && <div className="repair-proposals"><span className="eyebrow">Review proposed repairs</span>{shot.review.proposals.map((proposal) => <label key={proposal.id}><input type="checkbox" checked={proposal.selected} onChange={() => toggleProposal(shot.id, proposal.id)} /><span><strong>{proposal.label}</strong><small>{proposal.fix}</small></span></label>)}<button className="button primary" type="button" onClick={() => applyRepairs(shot.id)}><ArrowsClockwise size={17} /> Apply selected and compile next version</button></div>}
      </section></div>
  </div>;
}

function DeliverablesWorkspace() {
  const { project, osIntelligence, intelligenceStatus, setMode } = useStudio();
  const deliveryLayers = getDeliveryLayers();
  const guidance = deriveCorpusGuidance(project, osIntelligence);
  return <div className="deliverables-workspace"><div className="workspace-heading"><div><span className="eyebrow">Output package</span><h1>One production, every required cut</h1><p>Shots remain addressable across deliverables; crops and timing do not fork continuity.</p></div><button className="button primary" type="button" onClick={() => download(`${project.title}-deliverables.json`, JSON.stringify(project.deliverables, null, 2))}><DownloadSimple size={17} /> Export map</button></div>
    <div className="delivery-layers">{deliveryLayers.map((layer) => <section key={layer.id}><span>{layer.label}</span><strong>{layer.state}</strong><small>{layer.evidence}</small></section>)}</div>
        <div className="deliverable-grid">{project.deliverables.map((deliverable) => <section key={deliverable.id}><header><div><span>{deliverable.name}</span><strong>{deliverable.aspect}</strong></div><b>{deliverable.duration}{deliverable.unit === "frames" ? " frames" : "s"}</b></header><div>{deliverable.shotIds.map((id, index) => { const shot = project.shots.find((item) => item.id === id); if (!shot) return null; return <button key={id} type="button" onClick={() => { useStudio.getState().selectShot(id); setMode("board"); }}><img src={shot.image} alt={shot.title} /><span>{String(index + 1).padStart(2, "0")}</span></button>; })}</div><footer><span>{deliverable.shotIds.length} shots</span><span>{deliverable.aspect === "9:16" ? "Reframe review required" : "Edit map ready"}</span></footer></section>)}</div>
    <div className="handoff-note"><Package size={20} /><div><strong>Evidence-bound production handoff</strong><p>{intelligenceStatus === "ready" ? <>Packet intelligence is traced to {guidance.provenance.renderRecords?.toLocaleString() ?? "UNKNOWN"} analyzed renders and {guidance.provenance.batchDeltas ?? "UNKNOWN"} batch studies. </> : <>Corpus intelligence is {intelligenceStatus === "loading" ? "loading" : "unavailable"}; provenance remains UNKNOWN and the packet uses built-in production contracts only. </>}Provider accounts, costs, renders, and delivery state remain outside AUTEUR until connected and verified.</p></div></div>
  </div>;
}

function NewProjectDialog() {
  const { newProjectOpen, setNewProjectOpen, createProject, setNotice } = useStudio();
  const [brief, setBrief] = useState("A premium vehicle leaves the city before dawn and earns the open road.");
  const [options, setOptions] = useState({ title: "Untitled production", route: "Auto", format: "Commercial film", aspect: "Auto", duration: 24, platform: "Cinema + web", provider: "Auto route", style: "Cinematic realism", mood: "Restrained confidence", realism: "Photoreal", quality: "Campaign master", audience: "General premium audience", continuity: "Strict", audio: "Sound design + score" });
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const dialogRef = useRef<HTMLFormElement>(null);
  const briefRef = useRef<HTMLTextAreaElement>(null);
  const readReference = (file: File) => new Promise<{ name: string; url: string }>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, url: String(reader.result) }); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
  useEffect(() => {
    if (!newProjectOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => briefRef.current?.focus());
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setNewProjectOpen(false); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, input:not([disabled]):not([tabindex="-1"]), textarea, select, [tabindex]:not([tabindex="-1"])')).filter((element) => element.offsetParent !== null);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, [newProjectOpen, setNewProjectOpen]);
  if (!newProjectOpen) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={() => setNewProjectOpen(false)}><form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="new-production-title" className="new-project-dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={async (event) => { event.preventDefault(); try { const references = await Promise.all(referenceFiles.map(readReference)); createProject(brief, options, references); setReferenceFiles([]); } catch { setNotice("A visual reference could not be read. Remove it and try again."); } }}><header><div><span className="eyebrow">New production</span><h2 id="new-production-title">Direct the project, not the prompt</h2></div><button type="button" onClick={() => setNewProjectOpen(false)} aria-label="Close"><X size={19} /></button></header><label className="brief-field"><span>Idea, script, treatment, or scene request</span><textarea ref={briefRef} required value={brief} onChange={(event) => setBrief(event.target.value)} /></label><label className="reference-upload"><input type="file" accept="image/*" multiple onChange={(event) => setReferenceFiles(Array.from(event.target.files || []))} /><UploadSimple size={20} /><span><strong>{referenceFiles.length ? `${referenceFiles.length} reference${referenceFiles.length === 1 ? "" : "s"} ready` : "Add visual references"}</strong><small>{referenceFiles.length ? referenceFiles.map((file) => file.name).join(" / ") : "Characters, products, objects, locations, wardrobe, or style"}</small></span></label><div className="intake-grid">
      <Field label="Project name" value={options.title} onChange={(title) => setOptions({ ...options, title })} /><Field label="Creative route" value={options.route} options={["Auto", "Automotive", "Product ad", "Food and beverage", "Character / narrative", "Music / fashion", "VFX sequence"]} onChange={(route) => setOptions({ ...options, route })} /><Field label="Format" value={options.format} options={["Commercial film", "Short film", "Music video", "Social campaign", "Single scene", "Image sequence"]} onChange={(format) => setOptions({ ...options, format })} /><Field label="Aspect" value={options.aspect} options={["Auto", "2.39:1", "16:9", "9:16", "1:1", "4:5"]} onChange={(aspect) => setOptions({ ...options, aspect })} /><Field label="Duration" value={options.duration} onChange={(duration) => setOptions({ ...options, duration: Number(duration) || 24 })} /><Field label="Platform" value={options.platform} options={["Cinema + web", "YouTube", "Instagram / TikTok", "Broadcast", "Presentation"]} onChange={(platform) => setOptions({ ...options, platform })} /><Field label="Provider route" value={options.provider} options={["Auto route", "Veo 3.1 / Flow", "Sora", "Runway", "Image model"]} onChange={(provider) => setOptions({ ...options, provider })} /><Field label="Style" value={options.style} options={["Cinematic realism", "Documentary naturalism", "Luxury editorial", "Graphic animation", "Stylized VFX"]} onChange={(style) => setOptions({ ...options, style })} /><Field label="Mood" value={options.mood} options={["Restrained confidence", "Tense anticipation", "Warm intimacy", "Joyful energy", "Mysterious", "Epic awe"]} onChange={(mood) => setOptions({ ...options, mood })} /><Field label="Realism" value={options.realism} options={["Photoreal", "Naturalistic", "Heightened realism", "Stylized", "Graphic / animated"]} onChange={(realism) => setOptions({ ...options, realism })} /><Field label="Quality target" value={options.quality} options={["Campaign master", "Editorial premium", "Production draft", "Rapid concept"]} onChange={(quality) => setOptions({ ...options, quality })} /><Field label="Audience" value={options.audience} options={["General premium audience", "Luxury buyer", "Gen Z social", "Family", "B2B decision maker", "Festival audience"]} onChange={(audience) => setOptions({ ...options, audience })} /><Field label="Continuity" value={options.continuity} options={["Strict", "Balanced", "Loose / montage"]} onChange={(continuity) => setOptions({ ...options, continuity })} /><Field label="Audio" value={options.audio} options={["Sound design + score", "Native dialogue", "Music-led", "Silent", "Auto"]} onChange={(audio) => setOptions({ ...options, audio })} />
    </div><aside><Sparkle size={18} weight="fill" /><p>AUTEUR will create a treatment, three-scene spine, six-shot board, continuity anchors, and generation packet. You can change every decision afterward.</p></aside><footer><button className="button secondary" type="button" onClick={() => setNewProjectOpen(false)}>Cancel</button><button className="button primary" type="submit"><MagicWand size={17} /> Build production</button></footer></form></div>;
}

function Notice() {
  const { notice, setNotice } = useStudio();
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 3200); return () => window.clearTimeout(timer); }, [notice, setNotice]);
  return notice ? <div className="notice" role="status"><Check size={16} weight="bold" />{notice}</div> : null;
}

export function App() {
  const { mode, inspectorOpen, setInspectorOpen, setCorpusIntelligence, setIntelligenceStatus, project } = useStudio();
  const imageSequence = project.format.toLowerCase().includes("image");
  useEffect(() => {
    if (window.matchMedia("(max-width: 760px)").matches) setInspectorOpen(false);
  }, [setInspectorOpen]);
  useEffect(() => {
    Promise.all([fetch("/data/auteur-render-brain.json"), fetch("/data/auteur-render-os-deltas.json")])
      .then(async ([brainResponse, deltasResponse]) => {
        if (!brainResponse.ok || !deltasResponse.ok) { setIntelligenceStatus("unavailable"); return; }
        const [brain, deltas] = await Promise.all([brainResponse.json(), deltasResponse.json()]);
        const analyzed = brain.coverage?.analyzed;
        const renderCoverage = analyzed !== undefined && analyzed !== null && Number.isFinite(Number(analyzed)) ? { render_records: Number(analyzed) } : {};
        setCorpusIntelligence((brain.failure_rules || []).map((rule: { flag?: string; trigger?: string; fix?: string; count?: number }) => ({ ...rule })), { ...deltas, ...renderCoverage });
      }).catch(() => setIntelligenceStatus("unavailable"));
  }, [setCorpusIntelligence, setIntelligenceStatus]);
  const canvas = useMemo(() => {
    if (mode === "story") return <StoryRoom />;
    if (mode === "prompts") return <PromptWorkspace />;
    if (mode === "review") return <ReviewWorkspace />;
    if (mode === "deliverables") return <DeliverablesWorkspace />;
    return <BoardWorkspace />;
  }, [mode]);
  return <div className={`${inspectorOpen && mode === "board" ? "studio has-inspector" : "studio"}${imageSequence ? " image-project" : ""}`}>
    <TopBar />
    <ProjectNav />
    <main className="workspace-canvas">{canvas}</main>
    {mode === "board" && <Inspector />}
    {mode === "board" && !imageSequence && <Timeline />}
    <NewProjectDialog />
    <Notice />
  </div>;
}
