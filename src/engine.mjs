const uid = (prefix = "id") => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
// Canonical duration rounding: every stored or compared duration sum passes through this,
// so float dust (e.g. 7 x ~0.57 = 3.9999999999999996) can never desynchronize timing
// authorities that are checked with strict equality.
export const roundSeconds = (value) => Number((Number(value) || 0).toFixed(2));

const failureCatalog = [
  {
    key: "continuity",
    patterns: /identity|continuity|wardrobe|face|character|prop|object.*drift|changes between/i,
    label: "Continuity drift",
    fix: "Lock character identity, wardrobe, hero-object geometry, prop count, and the prior shot's resolved end state with explicit references.",
  },
  {
    key: "temporal",
    patterns: /timing|temporal|missing beat|beat.*missing|final state|skips|order|before|after|too fast|duration/i,
    label: "Temporal collapse",
    fix: "Split the action into observable start, contact, consequence, and held end state; one defining action per generation.",
  },
  {
    key: "text",
    patterns: /text|logo|wordmark|gibberish|spelling|typography|watermark/i,
    label: "Text or mark corruption",
    fix: "Remove exact text from the generative render and route approved copy, logos, and marks to deterministic compositing.",
  },
  {
    key: "physics",
    patterns: /physics|float|slide|wheel|liquid|steam|smoke|hand|contact|material/i,
    label: "Physical behaviour failure",
    fix: "Describe the force source, contact point, material response, direction, and settled end state; forbid floating, sliding, and interpenetration.",
  },
  {
    key: "camera",
    patterns: /camera|framing|lens|crop|aspect|composition|shot size/i,
    label: "Camera contract miss",
    fix: "Lock one shot size, one lens intent, one camera move, horizon position, subject screen position, and delivery aspect.",
  },
  {
    key: "audio",
    patterns: /audio|dialogue|speech|sync|music|sfx|sound/i,
    label: "Audio evidence gap",
    fix: "Bind every sound to a visible source and timecode. Keep content and sync UNKNOWN until playable audio or a transcript is attached.",
  },
];

function mediaUrl(path) {
  const embedded = globalThis.__AUTEUR_MEDIA__;
  return embedded && typeof embedded === "object" && embedded[path] ? embedded[path] : path;
}

export function analyzeCritique(text) {
  const clean = String(text || "").trim();
  if (!clean) return [];
  return failureCatalog
    .filter((item) => item.patterns.test(clean))
    .map((item) => ({ ...item, id: uid("repair"), selected: true }));
}

const routeTerms = {
  automotive: ["automotive", "vehicle", "car", "road", "wheel", "chase", "cockpit"],
  product: ["product", "packshot", "watch", "bottle", "sku", "packaging"],
  food: ["food", "culinary", "drink", "beverage", "chef", "ingredient", "steam"],
  character: ["character", "human", "portrait", "dialogue", "identity", "performance"],
  editorial: ["fashion", "music", "editorial", "beauty", "performer", "dance"],
  vfx: ["vfx", "surreal", "spectacle", "creature", "transformation", "phenomenon"],
  nature: ["nature", "landscape", "wildlife", "mountain", "ocean", "forest", "desert"],
};

const contextStopTerms = new Set([
  "campaign", "cinematic", "clean", "commercial", "content", "frames", "generated", "image", "launch",
  "preserve", "product", "production", "scene", "second", "sequence", "social", "stable", "vertical", "video",
]);

const subjectAnchors = [
  "automotive", "bottle", "car", "chef", "cosmetic", "food", "footwear", "jewelry", "kitchen", "office",
  "perfume", "phone", "restaurant", "shoe", "skincare", "sneaker", "vehicle", "watch",
];

function exampleOf(item) {
  return item?.examples?.[0] || {};
}

function textValues(value) {
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (value && typeof value === "object") return Object.values(value).flatMap(textValues);
  return typeof value === "string" ? [value] : [];
}

function pickIntelligence(items, project, route) {
  const context = `${project.brief} ${project.format} ${project.style} ${project.mood}`.toLowerCase();
  const contextTokens = new Set(context.split(/[^a-z0-9]+/).filter(Boolean));
  const projectTerms = [...contextTokens].filter((word) => word.length > 4 && !contextStopTerms.has(word));
  const ranked = [...(items || [])].map((item) => {
    const haystack = `${item.key || ""} ${textValues(exampleOf(item)).join(" ")}`.toLowerCase();
    // Whole-token matching (with a simple plural) — substring hits let keys like
    // "business-card-layout" count as a "car" hit and contaminate route guidance.
    const haystackTokens = new Set(haystack.split(/[^a-z0-9]+/).filter(Boolean));
    const hasToken = (term) => haystackTokens.has(term) || haystackTokens.has(`${term}s`);
    const routeHits = (routeTerms[route] || []).filter(hasToken).length;
    const conflictingHits = Object.entries(routeTerms)
      .filter(([candidate]) => candidate !== route)
      .reduce((sum, [, terms]) => sum + terms.filter(hasToken).length, 0);
    const projectHits = projectTerms.filter(hasToken).length;
    const routeAnchors = routeTerms[route] || [];
    const anchorConflicts = subjectAnchors.filter((term) => hasToken(term) && !contextTokens.has(term) && !contextTokens.has(`${term}s`) && !routeAnchors.includes(term)).length;
    const score = routeHits * 80 + projectHits * 18 + Math.min(Number(item.count) || 0, 10) - conflictingHits * 40 - anchorConflicts * 140;
    return { item, score, routeHits, projectHits, conflictingHits, anchorConflicts };
  }).sort((left, right) => right.score - left.score || String(left.item.key).localeCompare(String(right.item.key)));
  const best = ranked[0];
  if (!best) return null;
  if (best.score <= 0 || best.anchorConflicts > 0) return null;
  if (best.conflictingHits > best.routeHits && best.projectHits === 0) return null;
  return best.item;
}

const routeGuidanceDefaults = {
  automotive: {
    storyPattern: "environmental promise -> design proof -> performance consequence -> held hero image",
    storyBeats: ["establish road and scale", "prove material or mechanical detail", "show controlled motion", "resolve on stable vehicle identity"],
    domainPlaybook: "environment -> design signature -> contact and load -> performance result -> clean hero frame",
  },
  product: {
    storyPattern: "tactile context -> craftsmanship detail -> product reveal -> emotional consequence -> held product image",
    storyBeats: ["establish material world", "show craft or interaction", "reveal product geometry", "resolve human meaning", "hold a clean end frame"],
    domainPlaybook: "context -> material detail -> controlled reveal -> use or emotional consequence -> clean packshot endpoint",
  },
  food: {
    storyPattern: "ingredient truth -> preparation -> transformation -> appetite payoff -> held serving image",
    storyBeats: ["establish ingredient", "show contact and preparation", "prove heat or texture change", "resolve on serving"],
    domainPlaybook: "ingredient -> hand action -> physical transformation -> sensory detail -> clean serving frame",
  },
  character: {
    storyPattern: "clear setup -> readable choice -> consequence -> held emotional image",
    storyBeats: ["establish person and place", "introduce pressure", "show one defining action", "resolve the emotional state"],
    domainPlaybook: "identity and geography -> motivation -> observable action -> reaction -> stable editorial endpoint",
  },
  editorial: {
    storyPattern: "visual thesis -> performance variation -> signature detail -> iconic resolution",
    storyBeats: ["declare visual world", "vary pose or performance", "isolate signature detail", "resolve on campaign image"],
    domainPlaybook: "world statement -> performance -> styling detail -> rhythmic contrast -> iconic end frame",
  },
  vfx: {
    storyPattern: "normal world -> anomaly -> causal escalation -> consequence -> resolved spectacle",
    storyBeats: ["establish scale", "introduce anomaly", "show physical response", "resolve force and geography"],
    domainPlaybook: "baseline reality -> force source -> material response -> human consequence -> stable spectacle frame",
  },
  nature: {
    storyPattern: "vast establishment -> living detail -> environmental event -> settled grandeur",
    storyBeats: ["establish scale and light", "isolate one living or geological detail", "show weather or behavior in motion", "resolve on the landscape's defining image"],
    domainPlaybook: "scale statement -> intimate natural detail -> atmospheric or behavioral event -> held panoramic resolution",
  },
};

function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function deriveCorpusGuidance(project, intelligence = null) {
  const route = detectProjectRoute(project.brief, { route: project.format, style: project.style });
  const routeDefaults = routeGuidanceDefaults[route] || routeGuidanceDefaults.character;
  const prompt = pickIntelligence(intelligence?.prompt_generation_logic, project, route);
  const story = pickIntelligence(intelligence?.storyboarding_logic, project, route);
  const style = pickIntelligence(intelligence?.style_and_design_systems, project, route);
  const audio = pickIntelligence(intelligence?.sound_audio_frameworks, project, route);
  const playbook = pickIntelligence(intelligence?.content_type_domain_playbooks, project, route);
  const failureItems = [...(intelligence?.failure_rules_and_repairs || [])]
    .sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0))
    .slice(0, 3);
  const promptExample = exampleOf(prompt);
  const storyExample = exampleOf(story);
  const styleExample = exampleOf(style);
  const audioExample = exampleOf(audio);
  const playbookExample = exampleOf(playbook);
  const evidenceGenIds = [...new Set([prompt, story, style, audio, playbook, ...failureItems]
    .flatMap((item) => item?.evidence_gen_ids || []))].slice(0, 24);
  const available = Boolean(prompt || story || style || audio || playbook || failureItems.length);
  return {
    available,
    route,
    promptRule: String(promptExample.rule || prompt?.key || "Use one observable action and one held end state per generation."),
    promptReason: String(promptExample.why_it_matters || "Selected from render evidence relevant to this production route."),
    storyPattern: String(storyExample.pattern || story?.key || routeDefaults.storyPattern),
    storyBeats: strings(storyExample.beats).length ? strings(storyExample.beats) : routeDefaults.storyBeats,
    styleSystem: String(styleExample.style || style?.key || project.style),
    styleTokens: [...strings(styleExample.visual_tokens), ...strings(styleExample.lighting_tokens), ...strings(styleExample.camera_tokens)].slice(0, 9),
    audioFramework: String(audioExample.audio_pattern || audio?.key || "Visible-source audio plan"),
    audioRule: String(audioExample.visual_sync_rule || "Bind sound to visible sources and preserve UNKNOWN until playable evidence exists."),
    domainPlaybook: String(playbookExample.default_framework || playbook?.key || routeDefaults.domainPlaybook),
    failureRepairs: failureItems.map((item) => String(exampleOf(item).repair_prompt_guard || item.key)).filter(Boolean),
    evidenceGenIds,
    provenance: {
      renderRecords: optionalNumber(intelligence?.render_records),
      reviewedRecords: optionalNumber(intelligence?.coverage?.records_reviewed),
      batchDeltas: optionalNumber(intelligence?.batch_delta_files),
      generatedAt: intelligence?.generated_at || null,
    },
  };
}

export function compileShot(project, shot, renderRules = [], intelligence = null) {
  const continuity = (shot.continuityRefs || [])
    .map((id) => project.assets.find((asset) => asset.id === id && asset.locked)?.name)
    .filter(Boolean);
  const repairs = (shot.activeRepairs || []).map((repair) => repair.fix);
  const evidenceRules = renderRules
    .filter((rule) => !rule.contentType || rule.contentType === shot.contentType)
    .slice(0, 3)
    .map((rule) => rule.fix || rule.rule)
    .filter(Boolean);
  const locks = [
    ...continuity,
    ...(shot.continuityLocks || []),
  ];
  const guidance = deriveCorpusGuidance(project, intelligence);
  const intelligenceSignature = JSON.stringify({
    promptRule: guidance.promptRule,
    storyPattern: guidance.storyPattern,
    styleSystem: guidance.styleSystem,
    audioFramework: guidance.audioFramework,
    domainPlaybook: guidance.domainPlaybook,
    failureRepairs: guidance.failureRepairs,
    evidenceGenIds: guidance.evidenceGenIds,
    provenance: guidance.provenance,
  });
  const styleGrammar = guidance.styleTokens.length ? `${guidance.styleSystem}: ${guidance.styleTokens.join(", ")}` : guidance.styleSystem;

  const framePrompt = [
    `${shot.title}. ${shot.description}`,
    `${shot.shotSize}, ${shot.lens}; ${shot.movement}.`,
    `${project.style}; ${project.mood}; ${project.realism}; ${project.quality}. ${project.worldRule}`,
    guidance.available ? `Render-proven style grammar: ${styleGrammar}.` : "",
    `Continuity locks: ${locks.join(", ") || "project references and prior-frame state"}.`,
    "Compose one clean editorial frame with readable silhouette, motivated light, credible materials, and no text or watermark.",
  ].filter(Boolean).join(" ");

  const spokenLines = String(shot.dialogue || "").replace(/\s*\n+\s*/g, " / ").trim();
  const stillFrame = /image/i.test(String(project.format || "")) || /image/i.test(String(shot.provider || project.provider || ""));
  const promptHead = stillFrame ? [
    `Create one ${project.aspect} still campaign frame (a single image, no motion or video): ${shot.description}`,
    `The held moment: ${shot.action}.`,
    `Composition: ${shot.shotSize}, ${shot.lens}; framing intent: ${shot.movement}.`,
  ] : [
    `Create a ${shot.duration}-second ${project.aspect} cinematic shot: ${shot.description}`,
    `Start state: ${shot.startState}.`,
    `Defining action: ${shot.action}.`,
    spokenLines ? `Spoken performance (verbatim, native audio, accurate lip-sync, no rubber-mouth): ${spokenLines}` : "",
    `Resolved end state: ${shot.endState}; hold it for the edit.`,
    `Camera: ${shot.shotSize}, ${shot.lens}, ${shot.movement}.`,
  ];
  const videoPrompt = [
    ...promptHead,
    `Look: ${project.style}; mood: ${project.mood}; realism: ${project.realism}; quality target: ${project.quality}; audience: ${project.audience}. Continuity: ${locks.join(", ") || project.continuity}.`,
    guidance.available ? `Story architecture: ${guidance.storyPattern}${guidance.storyBeats.length ? `; sequence beats: ${guidance.storyBeats.join(" -> ")}` : ""}.` : "",
    guidance.available ? `Domain playbook: ${guidance.domainPlaybook}.` : "",
    guidance.available ? `Corpus prompt rule: ${guidance.promptRule}` : "",
    evidenceRules.length ? `Render-derived guards: ${evidenceRules.join("; ")}.` : "",
    guidance.failureRepairs.length ? `Failure prevention: ${guidance.failureRepairs.join("; ")}.` : "",
    repairs.length ? `Active repairs: ${repairs.join("; ")}.` : "",
    stillFrame
      ? "Avoid identity drift, geometry morphing, extra objects, floating contact, unreadable text, and watermarks."
      : "Avoid identity drift, geometry morphing, extra objects, floating contact, unreadable text, watermarks, and an unheld final frame.",
  ].filter(Boolean).join(" ");

  const audioPrompt = stillFrame
    ? `Still-frame deliverable for ${shot.title}: no audio layer is generated or evaluated.`
    : [
      `Sound plan for ${shot.title}: ${shot.audioIntent}.`,
      spokenLines ? `Authored dialogue (content is canonical; performance and sync remain UNKNOWN until playable evidence): ${spokenLines}` : "",
      `Project requirement: ${project.audio}.`,
      guidance.available ? `Corpus audio framework: ${guidance.audioFramework}. ${guidance.audioRule}` : "",
      "Every sound must be motivated by a visible source and synchronized to the action.",
      spokenLines
        ? "Mix and lip-sync accuracy remain UNKNOWN until a playable render or transcript is attached."
        : "Audio content, mix, and sync remain UNKNOWN until a playable render or transcript is attached.",
    ].filter(Boolean).join(" ");

  const negativePrompt = [
    "No identity drift, face substitution, wardrobe changes, or object-count changes.",
    "No geometry morphing, extra parts, floating contact, sliding, interpenetration, or implausible material response.",
    "No generated typography, logos, pseudo-text, subtitles, provider marks, or watermarks in the render plate.",
    "No unrequested montage, cutaway, camera change, aspect change, or missing held final frame.",
  ].join(" ");

  const qcGates = [
    stillFrame ? `Delivery is exactly ${project.aspect} as a single still frame.` : `Delivery is exactly ${project.aspect} and ${shot.duration} seconds.`,
    `Continuity references match: ${locks.join(", ") || "project references and prior-frame state"}.`,
    stillFrame
      ? "The held moment reads as one decisive, composed instant with a clear subject."
      : "The defining action has a visible start, consequence, and held resolved end state.",
    "Contact, materials, anatomy, reflections, and scale remain physically credible.",
    "Render plate contains no generated copy, logo, provider mark, or watermark.",
    ...(stillFrame ? [] : ["Audio content and synchronization remain UNKNOWN until playable evidence is attached."]),
    ...(guidance.failureRepairs.slice(0, 2).map((repair) => `Corpus risk gate: ${repair}`)),
  ];

  return { framePrompt, videoPrompt, audioPrompt, negativePrompt, qcGates, intelligenceSignature };
}

export function createRepairVersion(project, shot, proposals, renderRules = [], intelligence = null) {
  const accepted = proposals.filter((proposal) => proposal.selected !== false);
  const nextShot = {
    ...shot,
    activeRepairs: [...(shot.activeRepairs || []), ...accepted],
  };
  const packet = compileShot(project, nextShot, renderRules, intelligence);
  return {
    id: uid("version"),
    label: `v${shot.versions.length + 1}`,
    createdAt: new Date().toISOString(),
    source: "reviewed-qc",
    notes: accepted.map((item) => item.label).join(", ") || "Manual repair",
    ...packet,
  };
}

const routePlaybooks = {
  automotive: {
    media: "apex",
    contentType: "automotive",
    scenes: [["Promise", "Establish the world, status, and visual question."], ["Performance", "Prove capability through contact, speed, and material response."], ["Arrival", "Resolve the journey in a stable campaign image."]],
    shots: [
      ["World before hero", "The environment establishes scale before the vehicle is fully revealed", "Measured aerial drift", "24mm environmental wide", "Environmental wide"],
      ["Design signature", "A tactile cabin or body detail makes the promise concrete", "Locked observation", "65mm detail", "Detail close-up"],
      ["Tracking hero", "The vehicle moves with visible purpose through the environment", "Parallel tracking", "40mm tracking", "Medium cinematic"],
      ["Load and response", "Tire contact, suspension load, and surface response prove capability", "Low follow", "50mm low angle", "Medium cinematic"],
      ["Material beauty", "Light reveals paint, glass, metal, and the design signature", "Short parallax slide", "100mm macro", "Detail close-up"],
      ["Earned arrival", "Vehicle and world settle into an aspirational final state", "Slow release backward", "75mm resolved portrait", "Hero wide"],
    ],
    assets: [["Hero vehicle", "object", 1], ["Route and horizon", "location", 2], ["Dawn light", "style", 4]],
    locks: ["vehicle geometry", "paint and trim", "travel direction", "time of day"],
    worldRule: "Natural light remains motivated; wheel, suspension, reflections, and surface contact obey physical cause and effect.",
    audio: "engine and tire mechanics, environmental air, surface contact, and restrained score",
  },
  product: {
    media: "product",
    contentType: "product_ad",
    scenes: [["Desire", "Make the object legible and desirable before explaining it."], ["Proof", "Reveal craft, mechanism, and human-scale function."], ["Signature", "Land the product in an ownable final composition."]],
    shots: [
      ["Silhouette reveal", "A controlled edge light reveals the product shape from darkness", "Slow pedestal rise", "70mm compressed hero", "Hero medium"],
      ["Material truth", "Macro light travels across the primary finish and construction detail", "Precision lateral macro", "100mm macro", "Extreme detail"],
      ["Mechanism proof", "One mechanism performs a complete readable action", "Locked technical observation", "85mm close focus", "Functional close-up"],
      ["Human scale", "A hand or wearer demonstrates scale without obscuring the hero object", "Restrained follow", "65mm intimate", "Medium close-up"],
      ["Signature detail", "The most ownable design cue resolves in clean controlled light", "Micro parallax", "120mm macro", "Extreme detail"],
      ["Final packshot", "The complete product settles into a precise campaign end frame", "Slow release and hold", "80mm hero", "Hero packshot"],
    ],
    assets: [["Hero product", "object", 3], ["Material system", "style", 2], ["Hero lighting", "style", 5]],
    locks: ["product geometry", "material finish", "feature placement", "scale and orientation"],
    worldRule: "Product geometry and feature placement never morph; every highlight describes a real surface and every interaction resolves visibly.",
    audio: "material micro-sounds, mechanism detail, room tone, and a restrained premium score",
  },
  food: {
    media: "food",
    contentType: "food_ad",
    scenes: [["Appetite", "Establish place, freshness, and the sensory promise."], ["Craft", "Show one preparation transformation with credible hands and materials."], ["Reward", "Resolve on an abundant, edible, ownable hero image."]],
    shots: [
      ["Place and ingredient", "The environment and primary ingredient establish freshness and context", "Gentle table drift", "35mm natural wide", "Environmental medium"],
      ["First appetite cue", "Steam, gloss, texture, or colour makes the product immediately desirable", "Locked sensory observation", "85mm close focus", "Beauty close-up"],
      ["Maker action", "Hands complete one clear preparation action with credible contact", "Measured overhead follow", "50mm overhead", "Action medium"],
      ["Transformation", "Heat, pour, cut, or plating produces a visible physical consequence", "Short controlled push", "65mm close focus", "Functional close-up"],
      ["Texture proof", "A macro detail proves freshness, moisture, structure, and finish", "Micro slider", "100mm macro", "Extreme detail"],
      ["Served reward", "The finished dish or drink holds in a clean final table composition", "Slow release and hold", "70mm tabletop hero", "Hero still life"],
    ],
    assets: [["Hero serving", "object", 1], ["Preparation surface", "location", 4], ["Warm appetite light", "style", 3]],
    locks: ["ingredient identity", "portion and vessel", "hand anatomy", "light direction"],
    worldRule: "Food remains edible and materially credible; steam, liquid, cutting, pouring, and hand contact have visible sources and settled outcomes.",
    audio: "motivated preparation sounds, room tone, serving detail, and music that leaves space for texture",
  },
  character: {
    media: "character",
    contentType: "character_scene",
    scenes: [["Context", "Establish the person, world, and unspoken need."], ["Pressure", "Turn the scene through one observable choice or interruption."], ["Consequence", "Hold the emotional result in behaviour, not explanation."]],
    shots: [
      ["World and person", "Place the character inside a legible environment and social context", "Restrained establishing drift", "32mm environmental portrait", "Environmental wide"],
      ["Private behaviour", "A small task or gesture reveals the character before dialogue", "Locked observation", "65mm intimate portrait", "Medium close-up"],
      ["Inciting detail", "One object, look, or sound changes the character's attention", "Motivated rack and settle", "75mm close focus", "Detail to portrait"],
      ["Decision", "The character makes one readable physical choice under pressure", "Slow inward track", "50mm eye-level", "Performance medium"],
      ["Consequence detail", "Hands, breath, posture, or eyeline carries the emotional consequence", "Locked hold", "85mm portrait", "Emotional close-up"],
      ["Resolved image", "The new relationship between character and world holds for the edit", "Slow release backward", "65mm resolved portrait", "Resolved medium"],
    ],
    assets: [["Lead identity", "character", 3], ["Wardrobe and role", "style", 2], ["Primary location", "location", 5]],
    locks: ["face and age", "wardrobe and hair", "eyeline and screen direction", "location geography"],
    worldRule: "Identity, wardrobe, eyeline, and blocking remain stable; performance is carried by one observable action per shot.",
    audio: "location room tone, breath and cloth detail, motivated dialogue, and restrained emotional score",
  },
  editorial: {
    media: "character",
    contentType: "music_fashion",
    scenes: [["Icon", "Introduce performer, silhouette, and visual code."], ["Pulse", "Escalate through movement, rhythm, and editorial variation."], ["Afterimage", "Resolve on the campaign's most ownable pose or gesture."]],
    shots: [
      ["Iconic entrance", "The performer enters as a readable silhouette in the visual world", "Measured frontal drift", "40mm editorial wide", "Full figure"],
      ["Face and styling", "Identity, styling, and attitude land in a controlled portrait", "Locked portrait", "85mm portrait", "Beauty close-up"],
      ["Rhythmic move", "One body action resolves cleanly on a musical beat", "Lateral performance track", "50mm movement", "Performance medium"],
      ["Wardrobe detail", "Fabric, accessory, or beauty detail carries motion without geometry drift", "Short macro orbit", "100mm macro", "Detail close-up"],
      ["World variation", "A second composition expands the visual grammar while preserving identity", "Controlled crane release", "35mm environment", "Environmental wide"],
      ["Campaign pose", "Performer and world hold on the definitive final campaign image", "Slow push then hold", "75mm hero portrait", "Hero portrait"],
    ],
    assets: [["Performer identity", "character", 6], ["Wardrobe code", "style", 2], ["Lighting motif", "style", 5]],
    locks: ["performer identity", "wardrobe and accessories", "movement direction", "lighting motif"],
    worldRule: "Identity and styling remain stable across editorial variation; each movement has a clean start, readable beat, and held pose.",
    audio: "beat map, performance sync, cloth and foot contact, and edit accents tied to visible motion",
  },
  vfx: {
    media: "vfx",
    contentType: "vfx_sequence",
    scenes: [["Normal world", "Establish scale and physical rules before the impossible event."], ["Rupture", "Reveal the impossible through witness, contact, and consequence."], ["Aftermath", "Resolve scale and emotional meaning in one final image."]],
    shots: [
      ["Baseline scale", "Human-scale landmarks establish geography and ordinary physical rules", "Slow environmental drift", "24mm scale wide", "Environmental wide"],
      ["Witness", "A grounded observer detects the first impossible change", "Motivated turn and settle", "65mm witness portrait", "Reaction medium"],
      ["Impossible reveal", "The full phenomenon is revealed against known scale references", "Controlled crane reveal", "28mm spectacle wide", "Extreme wide"],
      ["Physical contact", "The event affects water, dust, light, structures, or bodies with clear force", "Low consequence follow", "40mm action", "Action wide"],
      ["Human consequence", "A close human or material detail makes the scale emotionally legible", "Locked aftermath hold", "85mm intimate", "Consequence close-up"],
      ["Mythic end frame", "The phenomenon and world settle into a single unforgettable final composition", "Slow release and hold", "35mm resolved wide", "Hero wide"],
    ],
    assets: [["Phenomenon design", "object", 1], ["Scale environment", "location", 3], ["Atmosphere rule", "style", 4]],
    locks: ["phenomenon silhouette", "scale ratio", "geography and horizon", "force direction"],
    worldRule: "The impossible event obeys a consistent scale and force model; environment, particles, water, light, and witnesses respond causally.",
    audio: "scale-appropriate low frequency, environmental response, witness perspective, and sparse tension score",
  },
  nature: {
    media: "apex",
    contentType: "nature",
    scenes: [["Scale", "Establish the landscape's geography, light, and vastness."], ["Life", "Reveal living or elemental detail moving inside the world."], ["Grandeur", "Resolve weather, light, and terrain into one defining image."]],
    shots: [
      ["Vast establishment", "The landscape's full scale and light condition are read in one composition", "Slow aerial drift", "24mm environmental wide", "Environmental wide"],
      ["Geological texture", "Rock, water, ice, or sand texture proves the terrain's material truth", "Locked observation", "100mm macro", "Detail close-up"],
      ["Living detail", "One animal, plant, or elemental motion animates the stillness", "Patient tracking follow", "200mm telephoto", "Wildlife medium"],
      ["Weather event", "Light, wind, fog, or water visibly changes the landscape's state", "Measured crane rise", "35mm atmospheric wide", "Environmental wide"],
      ["Intimate consequence", "A close natural detail carries the event's aftermath", "Short parallax slide", "85mm intimate", "Detail close-up"],
      ["Defining panorama", "Terrain, light, and atmosphere settle into the signature final image", "Slow release and hold", "28mm panoramic", "Hero wide"],
    ],
    assets: [["Primary terrain", "location", 1], ["Light condition", "style", 4], ["Living subject", "object", 3]],
    locks: ["geography and horizon", "light direction and weather state", "species or subject identity", "seasonal continuity"],
    worldRule: "Geography, horizon, light direction, weather, and any living subject remain continuous; nature behaves with documentary physical credibility.",
    audio: "wind, water, and habitat ambience bound to visible sources, distant fauna, and restrained score under natural sound",
  },
};

export function detectProjectRoute(brief, options = {}) {
  const requested = String(options.route || "auto").toLowerCase();
  if (requested !== "auto") {
    if (requested.includes("automotive")) return "automotive";
    if (requested.includes("product")) return "product";
    if (requested.includes("food")) return "food";
    if (requested.includes("vfx")) return "vfx";
    if (requested.includes("music") || requested.includes("fashion") || requested.includes("editorial")) return "editorial";
    if (requested.includes("nature") || requested.includes("landscape") || requested.includes("wildlife")) return "nature";
    if (requested.includes("character") || requested.includes("narrative")) return "character";
  }
  // Vocabulary is the union of this router and the Director's detectRoute —
  // keep both in sync so brief nouns land on the same playbook everywhere.
  const text = `${brief || ""} ${options.format || ""} ${options.style || ""}`.toLowerCase();
  if (/\b(car|vehicle|automotive|sedan|suv|motorcycle|supercar|road|drive)\b/.test(text)) return "automotive";
  if (/\b(food|coffee|drink|beverage|restaurant|chef|dish|recipe|kitchen|whisky|cocktail)\b/.test(text)) return "food";
  if (/\b(watch|product|perfume|jewel|appliance|packshot|device|bottle|shoe|sneaker|serum)\b/.test(text)) return "product";
  if (/\b(vfx|giant|surreal|fantasy|creature|spaceship|explosion|transform|morph|supernatural)\b/.test(text)) return "vfx";
  if (/\b(music|fashion|artist|performer|dance|editorial|beauty|runway)\b/.test(text)) return "editorial";
  if (/\b(landscape|mountain|ocean|forest|nature|wildlife|desert)\b/.test(text)) return "nature";
  return "character";
}

export function resolveAutoStrategy(brief, options = {}) {
  const route = detectProjectRoute(brief, options);
  const requestedAspect = String(options.aspect || "Auto");
  const platform = String(options.platform || "Cinema + web").toLowerCase();
  const format = String(options.format || "Commercial film").toLowerCase();
  const aspect = requestedAspect !== "Auto" ? requestedAspect : platform.includes("instagram") || platform.includes("tiktok") ? "9:16" : platform.includes("presentation") ? "16:9" : "2.39:1";
  const requestedProvider = String(options.provider || "Auto route");
  const provider = requestedProvider !== "Auto route" ? requestedProvider : format.includes("image") ? "Image model" : route === "character" || route === "editorial" ? "Runway" : "Veo 3.1 / Flow";
  return { route, aspect, provider };
}

export function createProjectFromBrief(brief, options = {}) {
  const subject = String(brief || "Untitled production").replace(/\s+/g, " ").trim();
  const id = uid("project");
  const strategy = resolveAutoStrategy(subject, options);
  const route = strategy.route;
  const playbook = routePlaybooks[route];
  const sceneSpecs = playbook.scenes;
  const shotSpecs = playbook.shots;
  const isImageSequence = String(options.format || "").toLowerCase().includes("image");
  const projectDuration = isImageSequence ? shotSpecs.length : Math.max(6, Math.round(Number(options.duration) || 24));
  const baseDuration = Math.floor(projectDuration / shotSpecs.length);
  const remainder = projectDuration % shotSpecs.length;
  const scenes = sceneSpecs.map(([title, intent], sceneIndex) => ({
    id: uid("scene"),
    title,
    intent,
    shots: [],
    order: sceneIndex,
  }));
  const assets = playbook.assets.map(([name, type, image]) => ({ id: uid("asset"), name, type, url: mediaUrl(`/media/${playbook.media}/shot-0${image}.jpg`), locked: true }));
  const shots = shotSpecs.map(([title, description, movement, lens, shotSize], index) => {
    const scene = scenes[Math.floor(index / 2)];
    const shot = {
      id: uid("shot"),
      sceneId: scene.id,
      order: index % 2,
      title,
      description,
      intent: description,
      duration: baseDuration + (index < remainder ? 1 : 0),
      image: mediaUrl(`/media/${playbook.media}/shot-0${index + 1}.jpg`),
      shotSize,
      lens,
      movement,
      contentType: playbook.contentType,
      provider: strategy.provider,
      startState: index === 0 ? "Quiet world before the subject is fully revealed" : "Continue from the prior shot's held final state",
      action: description,
      endState: index === shotSpecs.length - 1 ? "Hero and world settle into the campaign's final image" : "Action resolves into a stable cut point",
      audioIntent: playbook.audio,
      continuityRefs: assets.map((asset) => asset.id),
      continuityLocks: playbook.locks,
      activeRepairs: [],
      versions: [],
      activeVersionId: null,
      packetDirty: false,
      review: { renderUrl: "", critique: "", proposals: [], temporalPass: null, continuityPass: null, status: "unreviewed" },
    };
    scene.shots.push(shot.id);
    return shot;
  });
  const project = {
    id,
    title: options.title || subject.split(" ").slice(0, 4).join(" "),
    brief: subject,
    logline: subject,
    format: options.format || "Commercial film",
    aspect: strategy.aspect,
    duration: projectDuration,
    platform: options.platform || "Cinema + web",
    provider: strategy.provider,
    style: options.style || "Cinematic realism, dawn contrast, restrained luxury",
    mood: options.mood || "Restrained confidence",
    realism: options.realism || "Photoreal",
    quality: options.quality || "Campaign master",
    audience: options.audience || "General premium audience",
    continuity: options.continuity || "Strict",
    audio: options.audio || "Sound design + score",
    worldRule: `${playbook.worldRule} No explanatory typography is generated into the frame.`,
    scenes,
    shots,
    assets,
    deliverables: isImageSequence ? [
      { id: uid("deliverable"), name: "Master image sequence", aspect: strategy.aspect, duration: shots.length, unit: "frames", shotIds: shots.map((shot) => shot.id) },
      { id: uid("deliverable"), name: "Editorial selects", aspect: strategy.aspect, duration: 4, unit: "frames", shotIds: [shots[0].id, shots[2].id, shots[3].id, shots[5].id] },
      { id: uid("deliverable"), name: "9:16 crops", aspect: "9:16", duration: 4, unit: "frames", shotIds: [shots[0].id, shots[2].id, shots[4].id, shots[5].id] },
    ] : [
      { id: uid("deliverable"), name: `${projectDuration}s hero film`, aspect: strategy.aspect, duration: projectDuration, unit: "seconds", shotIds: shots.map((shot) => shot.id) },
      { id: uid("deliverable"), name: `${Math.min(15, projectDuration)}s cutdown`, aspect: "16:9", duration: Math.min(15, projectDuration), unit: "seconds", shotIds: [shots[0].id, shots[2].id, shots[3].id, shots[5].id] },
      { id: uid("deliverable"), name: "9:16 social", aspect: "9:16", duration: Math.min(12, projectDuration), unit: "seconds", shotIds: [shots[0].id, shots[2].id, shots[4].id, shots[5].id] },
    ],
    updatedAt: new Date().toISOString(),
  };
  Object.assign(project, syncProjectTiming(project));
  project.shots = project.shots.map((shot) => {
    const packet = compileShot(project, shot);
    const version = { id: uid("version"), label: "v1", createdAt: new Date().toISOString(), source: "director-plan", notes: "Initial compiled packet", ...packet };
    return { ...shot, versions: [version], activeVersionId: version.id };
  });
  return project;
}

export function createProjectFromBlueprint(blueprint, options = {}) {
  const blueprintProject = blueprint?.project && typeof blueprint.project === "object" ? blueprint.project : blueprint;
  const sourceScenes = Array.isArray(blueprint?.scenes) ? blueprint.scenes : [];
  if (!sourceScenes.length || !sourceScenes.some((scene) => Array.isArray(scene.shots) && scene.shots.length)) {
    throw new Error("Production blueprint must contain at least one scene and one shot.");
  }
  const brief = String(options.brief || blueprintProject.logline || blueprintProject.creativeThesis || "Untitled production").trim();
  const route = detectProjectRoute(brief, { route: options.route || "auto", format: blueprintProject.format || options.format || "" });
  const media = routePlaybooks[route]?.media || "character";
  const imageSequence = /image/i.test(String(blueprintProject.format || options.format || ""));
  const provider = String(blueprintProject.provider || options.provider || (imageSequence ? "Image model" : "Veo 3.1 / Flow"));
  const projectId = uid("project");
  // Model-supplied ids can repeat (e.g. every scene numbering its own "shot-1");
  // duplicates break id-addressed editing and export validation, so mint fresh ones.
  const seenSceneIds = new Set();
  const sceneIds = sourceScenes.map((scene, index) => {
    const raw = String(scene.id || "");
    const id = raw && !seenSceneIds.has(raw) ? raw : uid(`scene-${index + 1}`);
    seenSceneIds.add(id);
    return id;
  });
  const scenes = sourceScenes.map((scene, index) => ({
    id: sceneIds[index],
    title: String(scene.title || `Scene ${index + 1}`),
    intent: String(scene.intent || scene.summary || "Advance the story through one readable change."),
    summary: String(scene.summary || scene.intent || ""),
    shots: [],
    order: index,
  }));
  const assetSource = Array.isArray(blueprint.assets) ? blueprint.assets : [];
  const seenAssetIds = new Set();
  const assets = assetSource.map((asset, index) => {
    const rawAssetId = String(asset.id || "");
    const assetId = rawAssetId && !seenAssetIds.has(rawAssetId) ? rawAssetId : uid("asset");
    seenAssetIds.add(assetId);
    return {
      id: assetId,
      name: String(asset.name || `Reference ${index + 1}`),
      type: String(asset.type || "object"),
      role: String(asset.role || asset.type || "reference"),
      description: String(asset.description || ""),
      url: mediaUrl(`/media/${media}/shot-0${(index % 6) + 1}.jpg`),
      locked: true,
    };
  });
  const styleBible = {
    visualTone: String(blueprint.styleBible?.visualTone || blueprintProject.style || options.style || "Cinematic realism"),
    lighting: String(blueprint.styleBible?.lighting || "Motivated practical light with controlled contrast"),
    palette: String(blueprint.styleBible?.palette || "Natural neutrals with one authored accent"),
    texture: String(blueprint.styleBible?.texture || "Credible tactile materials and restrained atmosphere"),
    lensLanguage: String(blueprint.styleBible?.lensLanguage || "Consistent cinematic lens family"),
    mood: String(blueprint.styleBible?.mood || options.mood || "Purposeful and emotionally legible"),
  };
  let visualIndex = 0;
  const seenShotIds = new Set();
  const shots = sourceScenes.flatMap((scene, sceneIndex) => (scene.shots || []).map((shot, shotIndex) => {
    const duration = Math.max(1, Number(shot.duration) || 4);
    const rawId = String(shot.id || "");
    const id = rawId && !seenShotIds.has(rawId) ? rawId : uid("shot");
    seenShotIds.add(id);
    const image = String(shot.image || mediaUrl(`/media/${media}/shot-0${(visualIndex++ % 6) + 1}.jpg`));
    const continuityLocks = Array.isArray(shot.continuityLocks) ? shot.continuityLocks.map(String) : [];
    const referenceNeeds = Array.isArray(shot.referenceNeeds) ? shot.referenceNeeds.map(String) : [];
    const normalized = {
      id,
      sceneId: sceneIds[sceneIndex],
      order: shotIndex,
      title: String(shot.title || `Shot ${sceneIndex + 1}.${shotIndex + 1}`),
      slugline: String(shot.slugline || `SCENE ${sceneIndex + 1} / SHOT ${shotIndex + 1}`),
      description: String(shot.description || shot.action || "One readable action advances the scene."),
      intent: String(shot.intent || shot.description || "Advance the scene."),
      duration,
      image,
      visualSource: "reference-proxy",
      startFrame: "",
      endFrame: "",
      shotSize: String(shot.shotSize || "Medium cinematic"),
      lens: String(shot.lens || styleBible.lensLanguage),
      movement: String(shot.movement || "Motivated controlled movement"),
      contentType: String(shot.contentType || routePlaybooks[route]?.contentType || route),
      provider,
      startState: String(shot.startState || "The prior scene state is clearly established"),
      action: String(shot.action || shot.description || "One defining action occurs"),
      endState: String(shot.endState || "The action resolves into a stable editorial endpoint"),
      dialogue: String(shot.dialogue || ""),
      audioIntent: String(shot.audioIntent || blueprint.audioPlan || options.audio || "Visible-source sound and restrained score"),
      continuityRefs: assets.map((asset) => asset.id),
      continuityLocks,
      referenceNeeds,
      activeRepairs: [],
      versions: [],
      activeVersionId: null,
      packetDirty: false,
      review: { renderUrl: "", critique: "", proposals: [], temporalPass: null, continuityPass: null, status: "unreviewed" },
    };
    scenes[sceneIndex].shots.push(id);
    return normalized;
  }));
  const frameNotes = [];
  if (imageSequence) {
    shots.forEach((shot) => { shot.duration = 1; });
    // Cap matches the director format's frame bound — an unbounded target would pad
    // (and compile a packet for) one shot per frame and can freeze the browser.
    const requestedFrames = Math.min(24, Math.round(Number(blueprintProject.duration || options.duration) || 0));
    if (requestedFrames > 0 && shots.length && requestedFrames !== shots.length) {
      frameNotes.push(`Frame count adjusted to the requested ${requestedFrames} frames (blueprint authored ${shots.length}).`);
      if (shots.length > requestedFrames) {
        const removed = new Set(shots.splice(requestedFrames).map((shot) => shot.id));
        scenes.forEach((scene) => { scene.shots = scene.shots.filter((shotId) => !removed.has(shotId)); });
      } else {
        const originals = [...shots];
        let sourceIndex = 0;
        while (shots.length < requestedFrames) {
          const source = originals[sourceIndex % originals.length];
          const pass = Math.floor(sourceIndex / originals.length) + 2;
          const copy = {
            ...source,
            id: uid("shot"),
            title: `${source.title} / alt ${pass}`,
            continuityRefs: [...source.continuityRefs],
            continuityLocks: [...source.continuityLocks],
            referenceNeeds: [...source.referenceNeeds],
            activeRepairs: [],
            versions: [],
            activeVersionId: null,
            review: { renderUrl: "", critique: "", proposals: [], temporalPass: null, continuityPass: null, status: "unreviewed" },
          };
          shots.push(copy);
          const scene = scenes.find((item) => item.id === source.sceneId);
          if (scene) scene.shots.push(copy.id);
          sourceIndex += 1;
        }
      }
      const shotById = new Map(shots.map((shot) => [shot.id, shot]));
      scenes.forEach((scene) => scene.shots.forEach((shotId, index) => {
        const shot = shotById.get(shotId);
        if (shot) shot.order = index;
      }));
      // Rebuild the flat list in canonical scene order — padded copies were appended,
      // and deliverables built from this list must match the scene graph for export.
      const canonicalShots = scenes.flatMap((scene) => scene.shots).map((shotId) => shotById.get(shotId)).filter(Boolean);
      shots.length = 0;
      shots.push(...canonicalShots);
    }
  }
  let authoredDuration = shots.reduce((sum, shot) => sum + shot.duration, 0);
  const requestedDuration = Number(blueprintProject.duration || options.duration);
  const targetDuration = Number.isFinite(requestedDuration) && requestedDuration > 0 ? requestedDuration : authoredDuration;
  // Runaway blueprints: cap the shot count so every shot keeps >= 0.25s of the target;
  // an unbounded list would push the per-shot floor above the target and go negative.
  let runawayTrimmed = false;
  if (!imageSequence && shots.length && targetDuration > 0 && targetDuration !== authoredDuration) {
    const maxShots = Math.max(1, Math.floor(targetDuration * 4));
    if (shots.length > maxShots) {
      runawayTrimmed = true;
      frameNotes.push(`Shot count trimmed to ${maxShots} so every shot keeps at least 0.25s of the ${targetDuration}s target (blueprint authored ${shots.length}).`);
      const removed = new Set(shots.splice(maxShots).map((shot) => shot.id));
      scenes.forEach((scene) => { scene.shots = scene.shots.filter((shotId) => !removed.has(shotId)); });
      authoredDuration = shots.reduce((sum, shot) => sum + shot.duration, 0);
    }
  }
  if (!imageSequence && shots.length && authoredDuration > 0 && targetDuration !== authoredDuration) {
    // The per-shot floor scales below 1s when the model authors more shots than the target
    // has seconds, so a short requested cut is preserved instead of silently lengthened.
    // Floor rounds DOWN and never exceeds targetDuration / shots.length (post-trim >= 0.25),
    // so the reserved budget can never exceed the target and allocations stay positive.
    const floor = Math.min(1, Math.floor((targetDuration / shots.length) * 100) / 100);
    let remaining = targetDuration;
    shots.forEach((shot, index) => {
      const shotsAfter = shots.length - index - 1;
      if (shotsAfter === 0) {
        shot.duration = Math.max(floor, Number(remaining.toFixed(2)));
      } else {
        const proportional = (shot.duration / authoredDuration) * targetDuration;
        shot.duration = Number(Math.min(Math.max(floor, proportional), remaining - floor * shotsAfter).toFixed(2));
        remaining -= shot.duration;
      }
    });
  }
  const duration = roundSeconds(shots.reduce((sum, shot) => sum + shot.duration, 0));
  const project = {
    id: projectId,
    title: String(blueprintProject.title || options.title || brief.split(" ").slice(0, 6).join(" ")),
    brief,
    logline: String(blueprintProject.logline || brief),
    creativeThesis: String(blueprintProject.creativeThesis || "Build one clear emotional and visual progression."),
    format: String(blueprintProject.format || options.format || "Film sequence"),
    aspect: String(blueprintProject.aspect || options.aspect || "2.39:1"),
    duration,
    platform: String(blueprintProject.platform || options.platform || "Cinema + web"),
    provider,
    style: [styleBible.visualTone, styleBible.lighting, styleBible.palette].filter(Boolean).join("; "),
    mood: styleBible.mood,
    realism: String(blueprint.realism || options.realism || "Photoreal"),
    quality: String(blueprint.quality || options.quality || "Campaign master"),
    audience: String(blueprint.audience || options.audience || "Defined campaign audience"),
    continuity: String(blueprint.continuity || options.continuity || "Strict"),
    audio: String(blueprint.audioPlan || options.audio || "Sound design + score"),
    worldRule: String(blueprint.worldRule || "Identity, geography, material behavior, screen direction, and time remain coherent across the sequence."),
    styleBible,
    storyBeats: (blueprint.storyBeats || []).map((beat, index) => typeof beat === "string"
      ? { id: uid("beat"), title: beat, summary: beat, sceneId: sceneIds[index] }
      : { id: String(beat.id || uid("beat")), title: String(beat.title || `Beat ${index + 1}`), summary: String(beat.summary || ""), sceneId: beat.sceneId ? String(beat.sceneId) : sceneIds[index] }),
    intelligenceSource: blueprint.source || "ollama",
    intelligenceModel: String(blueprint.model || options.model || "local brain"),
    analysisNotes: [...(Array.isArray(blueprint.analysisNotes) ? blueprint.analysisNotes.map(String) : []), ...frameNotes],
    qualityReport: blueprint.qualityReport && typeof blueprint.qualityReport === "object" ? {
      score: Number(blueprint.qualityReport.score) || 0,
      issues: Array.isArray(blueprint.qualityReport.issues) ? blueprint.qualityReport.issues.map(String) : [],
      passed: Boolean(blueprint.qualityReport.passed),
    } : null,
    creativeStatus: blueprint.source === "ollama" && blueprint.qualityReport?.passed !== false ? "developed" : "draft",
    scenes: imageSequence || runawayTrimmed ? scenes.filter((scene) => scene.shots.length) : scenes,
    shots,
    assets,
    deliverables: imageSequence ? [
      { id: uid("deliverable"), name: "Master image sequence", aspect: String(blueprintProject.aspect || options.aspect || "4:5"), duration: shots.length, unit: "frames", shotIds: shots.map((shot) => shot.id) },
      { id: uid("deliverable"), name: "Editorial selects", aspect: String(blueprintProject.aspect || options.aspect || "4:5"), duration: Math.min(4, shots.length), unit: "frames", shotIds: shots.slice(0, Math.min(4, shots.length)).map((shot) => shot.id) },
    ] : [
      { id: uid("deliverable"), name: `${duration}s master sequence`, aspect: String(blueprintProject.aspect || options.aspect || "2.39:1"), duration, unit: "seconds", shotIds: shots.map((shot) => shot.id) },
      { id: uid("deliverable"), name: "Selected social cut", aspect: "9:16", duration: roundSeconds(shots.slice(0, Math.min(4, shots.length)).reduce((sum, shot) => sum + shot.duration, 0)), unit: "seconds", shotIds: shots.slice(0, Math.min(4, shots.length)).map((shot) => shot.id) },
    ],
    updatedAt: new Date().toISOString(),
  };
  project.shots = project.shots.map((shot) => {
    const packet = compileShot(project, shot);
    const version = { id: uid("version"), label: "v1", createdAt: new Date().toISOString(), source: blueprint.source || "ollama-analysis", notes: "Compiled from analyzed production blueprint", ...packet };
    return { ...shot, versions: [version], activeVersionId: version.id };
  });
  return project;
}

export function moveItem(list, from, to) {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function syncProjectTiming(project) {
  // Frame-unit productions measure length in frames: per-shot second edits are
  // normalized back to 1 so project duration can never drift from the frame count.
  const imageSequence = /image/i.test(String(project.format || ""));
  const shots = imageSequence
    ? project.shots.map((shot) => (shot.duration === 1 ? shot : { ...shot, duration: 1 }))
    : project.shots;
  const byId = new Map(shots.map((shot) => [shot.id, shot]));
  const duration = imageSequence ? shots.length : roundSeconds(shots.reduce((sum, shot) => sum + shot.duration, 0));
  const deliverables = project.deliverables.map((deliverable) => {
    const nextDuration = deliverable.unit === "frames"
      ? deliverable.shotIds.length
      : roundSeconds(deliverable.shotIds.reduce((sum, id) => sum + (byId.get(id)?.duration || 0), 0));
    const name = deliverable.unit !== "frames" && /^\d+(?:\.\d+)?s /.test(deliverable.name)
      ? deliverable.name.replace(/^\d+(?:\.\d+)?s /, `${nextDuration}s `)
      : deliverable.name;
    return { ...deliverable, name, duration: nextDuration };
  });
  return { ...project, shots, duration, deliverables };
}

export function deriveReviewStatus(review) {
  if (!review.renderUrl) return "unreviewed";
  if (review.status === "repair" || String(review.critique || "").trim() || review.proposals?.length) return "repair";
  if (review.temporalPass === true && review.continuityPass === true) return "pass";
  return "reviewing";
}

export function formatTimecode(seconds) {
  const rounded = Math.max(0, Math.round((Number(seconds) || 0) * 10) / 10);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded - minutes * 60;
  const whole = Math.floor(remainder);
  const fraction = Math.round((remainder - whole) * 10);
  return `${String(minutes).padStart(2, "0")}:${String(whole).padStart(2, "0")}${fraction ? `.${fraction}` : ""}`;
}

export function validateProjectForExport(project) {
  const errors = [];
  const total = roundSeconds(project.shots.reduce((sum, shot) => sum + shot.duration, 0));
  if (total !== roundSeconds(project.duration)) errors.push(`Project duration ${project.duration} does not match ${total} seconds of shots.`);
  const projectIds = new Set(project.shots.map((shot) => shot.id));
  if (projectIds.size !== project.shots.length) errors.push("Project contains duplicate shot IDs.");
  const sceneShotIds = project.scenes.flatMap((scene) => scene.shots);
  const sceneCounts = sceneShotIds.reduce((counts, id) => counts.set(id, (counts.get(id) || 0) + 1), new Map());
  for (const shot of project.shots) {
    if (shot.packetDirty) errors.push(`${shot.title} has uncompiled changes.`);
    if (!shot.activeVersionId || !shot.versions.some((version) => version.id === shot.activeVersionId)) errors.push(`${shot.title} has no valid active packet version.`);
    if (sceneCounts.get(shot.id) !== 1) errors.push(`${shot.title} must appear exactly once in the scene graph.`);
  }
  for (const id of sceneShotIds) {
    if (!projectIds.has(id)) errors.push(`Scene graph references missing shot ${id}.`);
  }
  const byId = new Map(project.shots.map((shot) => [shot.id, shot]));
  const canonicalOrder = new Map(project.scenes.flatMap((scene) => scene.shots).map((id, index) => [id, index]));
  const covered = new Set(project.deliverables.flatMap((deliverable) => deliverable.shotIds));
  for (const shot of project.shots) {
    if (!covered.has(shot.id)) errors.push(`${shot.title} is missing from every deliverable.`);
  }
  for (const deliverable of project.deliverables) {
    const expected = deliverable.unit === "frames" ? deliverable.shotIds.length : roundSeconds(deliverable.shotIds.reduce((sum, id) => sum + (byId.get(id)?.duration || 0), 0));
    if (roundSeconds(deliverable.duration) !== expected) errors.push(`${deliverable.name} duration is stale.`);
    const durationPrefix = deliverable.unit !== "frames" ? deliverable.name.match(/^(\d+(?:\.\d+)?)s /) : null;
    if (durationPrefix && Number(durationPrefix[1]) !== expected) errors.push(`${deliverable.name} label duration is stale.`);
    if (deliverable.shotIds.some((id) => !byId.has(id))) errors.push(`${deliverable.name} references a missing shot.`);
    const indexes = deliverable.shotIds.map((id) => canonicalOrder.get(id)).filter((index) => index !== undefined);
    if (indexes.some((index, position) => position > 0 && index < indexes[position - 1])) errors.push(`${deliverable.name} shot order is stale.`);
  }
  return errors;
}

export function getDeliveryLayers() {
  return [
    { id: "render_plate", label: "Render plate", state: "planned", evidence: "shot prompts and storyboard references" },
    { id: "text_logo", label: "Text and logo", state: "deterministic-post", evidence: "approved source assets required" },
    { id: "audio", label: "Audio", state: "planned-unknown", evidence: "playable render or transcript required" },
    { id: "edit_motion", label: "Edit and motion", state: "planned", evidence: "timeline and delivery maps" },
  ];
}

export function exportPacket(project, intelligence = null) {
  const errors = validateProjectForExport(project);
  if (errors.length) throw new Error(`Packet is not ready: ${errors.join(" ")}`);
  const shotsById = new Map(project.shots.map((shot) => [shot.id, shot]));
  const orderedShots = project.scenes.flatMap((scene) => scene.shots.map((id) => shotsById.get(id)).filter(Boolean));
  const guidance = deriveCorpusGuidance(project, intelligence);
  const lockedAssetIds = new Set(project.assets.filter((asset) => asset.locked).map((asset) => asset.id));
  return {
    schema: "auteur-generation-packet/v1",
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      title: project.title,
      brief: project.brief,
      format: project.format,
      aspect: project.aspect,
      duration: project.duration,
      platform: project.platform,
      style: project.style,
      mood: project.mood,
      realism: project.realism,
      quality: project.quality,
      audience: project.audience,
      continuity: project.continuity,
      audio: project.audio,
    },
    assets: project.assets.map(({ id, name, type, locked, url }) => ({ id, name, type, locked, url, persistence: url.startsWith("data:") ? "embedded" : "local-path" })),
    scenes: project.scenes.map((scene) => ({ ...scene })),
    shots: orderedShots.map((shot) => {
      const activeReferences = shot.continuityRefs.filter((id) => lockedAssetIds.has(id));
      return ({
      id: shot.id,
      sceneId: shot.sceneId,
      title: shot.title,
      duration: shot.duration,
      provider: shot.provider,
      storyboardImage: shot.image,
      startFrame: shot.startFrame || null,
      endFrame: shot.endFrame || null,
      continuityRefs: activeReferences,
      identityLock: {
        references: activeReferences,
        invariants: shot.continuityLocks,
        allowedChange: shot.action,
        forbid: ["identity substitution", "topology change", "part-count change", "unplanned text or mark"],
      },
      requiredBeat: {
        entryState: shot.startState,
        action: shot.action,
        exitState: shot.endState,
        minimumVisibility: "Hold the resolved exit state long enough to verify and cut.",
      },
      version: shot.versions.find((version) => version.id === shot.activeVersionId),
      qc: {
        status: deriveReviewStatus(shot.review),
        critique: shot.review.critique.trim() || null,
        findings: shot.review.proposals,
        appliedRepairs: shot.activeRepairs,
        evidenceUrl: shot.review.renderUrl || null,
      },
      });
    }),
    deliverables: project.deliverables,
    deliveryLayers: getDeliveryLayers(),
    intelligence: {
      route: guidance.route,
      promptRule: guidance.promptRule,
      storyPattern: guidance.storyPattern,
      storyBeats: guidance.storyBeats,
      styleSystem: guidance.styleSystem,
      styleTokens: guidance.styleTokens,
      audioFramework: guidance.audioFramework,
      domainPlaybook: guidance.domainPlaybook,
      failureRepairs: guidance.failureRepairs,
      evidenceGenIds: guidance.evidenceGenIds,
      provenance: guidance.provenance,
    },
    providerState: "not-mutated",
  };
}

export async function embedPacketMedia(packet, loader) {
  const portable = structuredClone(packet);
  const urls = [...new Set([
    ...portable.assets.map((asset) => asset.url),
    ...portable.shots.map((shot) => shot.storyboardImage),
    ...portable.shots.map((shot) => shot.startFrame),
    ...portable.shots.map((shot) => shot.endFrame),
  ].filter((url) => url && !url.startsWith("data:")))];
  const resolved = new Map();
  for (let index = 0; index < urls.length; index += 4) {
    const chunk = urls.slice(index, index + 4);
    const loaded = await Promise.all(chunk.map(async (url) => [url, await loader(url)]));
    loaded.forEach(([url, value]) => resolved.set(url, value));
  }

  portable.assets = portable.assets.map((asset) => ({
    ...asset,
    url: resolved.get(asset.url) || asset.url,
    persistence: resolved.has(asset.url) ? "embedded" : asset.persistence,
  }));
  portable.shots = portable.shots.map((shot) => ({
    ...shot,
    storyboardImage: resolved.get(shot.storyboardImage) || shot.storyboardImage,
    startFrame: resolved.get(shot.startFrame) || shot.startFrame,
    endFrame: resolved.get(shot.endFrame) || shot.endFrame,
  }));
  return portable;
}
