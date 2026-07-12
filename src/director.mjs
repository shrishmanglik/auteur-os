// AUTEUR Director — the deterministic writer's room.
// Takes an idea + intent and produces: 3 creative concepts -> a screenplay with real
// dialogue -> a full ProductionBlueprint (scenes, shots, continuity, style, assets).
// Grounded in the distilled prompt corpus (per-type conventions, verbiage, gold craft).
// Always works offline; the local Ollama brain can punch it up but never replaces it.

// ---------- seeded randomness (stable per idea, reroll via seed offset) ----------
function hashText(text) {
  let value = 2166136261;
  for (const character of String(text)) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}
function makeRng(seedText) {
  let state = hashText(seedText) || 88675123;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}
const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];
const pickN = (rng, list, count) => {
  const pool = [...list];
  const out = [];
  while (pool.length && out.length < count) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
};

// ---------- idea parsing ----------
const STOPWORDS = new Set("a,an,the,and,or,but,of,for,to,in,on,at,with,about,from,into,over,after,before,under,is,are,was,were,be,being,been,it,its,this,that,these,those,i,we,you,they,he,she,my,our,your,their,make,making,want,need,video,film,ad,commercial,reel,short,story,scene,shot,who,whom,whose,now,one,last,first,can,could,should,would,will,just,very,really,when,where,then,than,there,here,what,which,how,why,his,her,him,hers,them,through,while,against,between,because,so,too,also,only,ever,never,once,by,as,up,down,out,off,not,no,yes,do,does,did,has,have,had,get,gets,got,go,goes,went,second,seconds,minute,minutes,vertical,horizontal,direct,camera,called,format,create,cinematic".split(","));
const FORMAT_NOISE = /\b(?:\d+(?:\.\d+)?\s*(?:s|sec|secs|second|seconds|min|mins|minute|minutes)|short\s+film|commercial\s+film|music\s+video|social\s+campaign|image\s+campaign|a-?roll\s+monologue|direct-to-camera|vertical\s+reel|ad\s+video|reel|trailer|teaser|video|film|commercial|scene|shot)\b/gi;

function titleCase(value) {
  return String(value).replace(/\b\w/g, (character) => character.toUpperCase());
}

function namedSubject(clean) {
  const called = clean.match(/\b(?:called|named|for)\s+["']?([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,4})["']?/);
  if (called?.[1]) return called[1].replace(/[.,;:!?]+$/, "");
  const quoted = clean.match(/["']([^"']{2,60})["']/);
  return quoted?.[1] || "";
}
export function parseIdea(idea, overrides = {}) {
  const clean = String(idea || "").replace(/\s+/g, " ").trim();
  const semantic = clean.replace(FORMAT_NOISE, " ").replace(/\s+/g, " ").trim();
  const words = semantic.split(/[^a-zA-Z0-9'-]+/).filter(Boolean);
  const content = words.filter((word) => word.length > 2 && !STOPWORDS.has(word.toLowerCase()));
  const explicitName = namedSubject(clean);
  const subject = String(overrides.hero || "").trim() || explicitName || content.slice(0, 4).join(" ") || semantic.split(" ").slice(0, 4).join(" ") || "the subject";
  const anchor = String(overrides.object || "").trim() || (explicitName ? explicitName.split(/\s+/)[0] : content[0] || "subject");
  const location = clean.match(/\b(?:in|inside|at|on)\s+(?:an?\s+|the\s+)?([^.,;]{3,80})/i)?.[1];
  const world = String(overrides.setting || "").trim() || location || content.slice(4, 8).join(" ") || "its world";
  return { clean: clean || "an untitled idea", subject: titleCase(subject), anchor, world, keywords: content.slice(0, 14) };
}

export function extractBriefConstraints(idea) {
  const text = String(idea || "");
  const lower = text.toLowerCase();
  const actorMatch = lower.match(/\b(one|1|two|2|three|3)\s+(?:visible\s+)?(?:actor|character|person|performer)s?\b/);
  const actorWords = { one: 1, "1": 1, two: 2, "2": 2, three: 3, "3": 3 };
  const actorCount = actorMatch ? actorWords[actorMatch[1]] : null;
  return {
    // A voice-over ban ("no/without voiceover/narration") bans narration only —
    // diegetic dialogue stays legal unless the brief is explicitly silent/dialogue-free.
    noDialogue: /\b(?:no|without)\s+(?:any\s+)?(?:dialog(?:ue)?s?|talking|spoken words)\b|\b(?:dialog(?:ue)?-free|silent film|completely silent)\b/.test(lower),
    noVoiceover: /\b(?:no|without)\s+(?:any\s+)?(?:voice[- ]?overs?|vo|narration|spoken words)\b|\bnarration-free\b|\b(?:no|without)\s+dialog(?:ue)?s?\s+(?:or|and)\s+voice[- ]?over|\b(?:silent film|completely silent)\b/.test(lower),
    actorCount,
    oneLocation: /\b(?:one|single|1)\s+location\b/.test(lower),
    loopable: /\b(?:loopable|seamless loop|loops? back)\b/.test(lower),
    notSalesy: /\b(?:not salesy|no sales pitch|not an ad|no ad-speak)\b/.test(lower),
    mustBeFunny: /\b(?:funny|humorous|comedic|comedy|witty|deadpan|absurd)\b/.test(lower),
  };
}

export function detectRoute(text) {
  const lower = String(text).toLowerCase();
  if (/\b(car|vehicle|automotive|sedan|suv|motorcycle|supercar|road|drive)\b/.test(lower)) return "automotive";
  if (/\b(food|coffee|drink|beverage|restaurant|chef|dish|recipe|kitchen|whisky|cocktail)\b/.test(lower)) return "food";
  if (/\b(watch|product|perfume|jewel|appliance|packshot|device|bottle|shoe|sneaker|serum)\b/.test(lower)) return "product";
  if (/\b(vfx|giant|surreal|fantasy|creature|spaceship|explosion|transform|morph|supernatural)\b/.test(lower)) return "vfx";
  if (/\b(music|fashion|artist|performer|dance|editorial|beauty|runway)\b/.test(lower)) return "editorial";
  if (/\b(landscape|mountain|ocean|forest|nature|wildlife|desert)\b/.test(lower)) return "nature";
  return "character";
}
export const routeToContentType = { automotive: "automotive", food: "food", product: "product", vfx: "vfx", editorial: "fashion", nature: "nature", character: "human" };

// ---------- creative lenses (the ideation engine) ----------
const LENSES = [
  {
    key: "literal-metaphor",
    name: "The Literal Metaphor",
    groundingFramework: "Literal Metaphor / deadpan physical truth",
    pitch: (idea) => `Take the promise of ${idea.subject} literally and build a physical world where it is simply true.`,
    twist: (idea) => `The metaphor is never explained — the world just obeys it, and ${idea.anchor} is the only thing that behaves normally.`,
    humorDevice: "Deadpan physics: everyone treats the impossible as paperwork.",
    thesis: "Meaning lands harder when the image does the arguing and nobody in frame acknowledges the miracle.",
    style: { tone: "Hyper-real with one impossible rule", mood: "Confident wonder" },
  },
  {
    key: "pov-flip",
    name: "The POV Flip",
    groundingFramework: "POV Reversal / unexpected witness",
    pitch: (idea) => `Tell ${idea.subject} from the least expected witness — the object, the obstacle, or the rival watching it happen.`,
    twist: (idea) => `We only cut to the human story in the final shot, recontextualizing everything the witness misread.`,
    humorDevice: "The witness narrates with total misplaced authority.",
    thesis: "A familiar promise becomes new when the camera is loyal to the wrong character.",
    style: { tone: "Intimate, observational, slightly conspiratorial", mood: "Playful tension" },
  },
  {
    key: "escalation-engine",
    name: "The Escalation Engine",
    groundingFramework: "Escalation Engine / compounding consequence",
    pitch: (idea) => `One small action involving ${idea.anchor} compounds shot over shot until the scale becomes absurd — then lands exactly where the brief needs it.`,
    twist: (idea) => `The final beat reveals the escalation was contained inside one ordinary moment of ${idea.world}.`,
    humorDevice: "Comedy of scale: each cut raises the stakes by an order of magnitude, straight-faced.",
    thesis: "Momentum is the joke; discipline is the punchline.",
    style: { tone: "Kinetic, rhythmic, precisely choreographed", mood: "Barely contained mischief" },
  },
  {
    key: "contrast-cut",
    name: "The Contrast Cut",
    groundingFramework: "Contrast Cut / visual proof by opposition",
    pitch: (idea) => `Two opposing worlds — one starved of ${idea.anchor}, one saturated with it — intercut until they collide in a single frame.`,
    twist: (idea) => `The collision shot reveals the two worlds were the same place, seconds apart.`,
    humorDevice: "Mirror gags: identical blocking, opposite outcomes.",
    thesis: "Difference is the fastest proof; the cut is the argument.",
    style: { tone: "Graphic, symmetrical, color-coded worlds", mood: "Cool authority" },
  },
  {
    key: "one-take-dare",
    name: "The One-Take Dare",
    groundingFramework: "One-Take Dare / continuous-time payoff",
    pitch: (idea) => `${idea.subject} staged as one continuous, impossibly choreographed take where the camera never blinks.`,
    twist: (idea) => `Everything the take passes changes state behind the camera's back — visible only on the return pass.`,
    humorDevice: "Background choreography does the comedy while the foreground stays earnest.",
    thesis: "Unbroken time creates trust; trust makes the payoff land as fact.",
    style: { tone: "Flowing steadicam realism with staged perfection", mood: "Held-breath momentum" },
  },
  {
    key: "deadpan-documentary",
    name: "The Deadpan Documentary",
    groundingFramework: "Deadpan Documentary / sincere absurdity",
    pitch: (idea) => `A gravely serious documentary crew treats ${idea.subject} as the most consequential event of the decade.`,
    twist: (idea) => `The experts are sincere, credentialed, and completely right — the world around them is what's absurd.`,
    humorDevice: "Mockumentary gravity: talking heads, archival gravitas, one rogue detail per frame.",
    thesis: "Scale the reverence up and the smallness of the subject becomes the charm.",
    style: { tone: "Documentary naturalism, tripod discipline", mood: "Solemn absurdity" },
  },
  {
    key: "time-fracture",
    name: "The Time Fracture",
    groundingFramework: "Time Fracture / continuity-keyed revelation",
    pitch: (idea) => `Open on the final second of ${idea.subject} — then earn it, assembling the timeline out of order until the opening image means the opposite.`,
    twist: (idea) => `A single continuity detail (${idea.anchor}) is the key that re-sorts every scene on second viewing.`,
    humorDevice: "Ironic pre-echoes: early shots quote later ones before they exist.",
    thesis: "Structure is suspense; the audience assembles the story and owns it.",
    style: { tone: "Precise, chaptered, clock-like", mood: "Inevitable revelation" },
  },
  {
    key: "tarantino-table",
    name: "The Long Table",
    groundingFramework: "Long Table / subtext and loaded props",
    pitch: (idea) => `Two people at a mundane surface talk about everything except ${idea.subject} — while it sits between them, loaded.`,
    twist: (idea) => `The conversation was the demonstration all along; the final line detonates the subtext.`,
    humorDevice: "Digressions with teeth: trivia that turns out to be the argument.",
    thesis: "Tension lives in the unsaid; the product is the third character.",
    style: { tone: "Locked frames, patient coverage, loaded props", mood: "Simmering charm" },
  },
];

// ---------- format library (narrative arcs + shot grammar + dialogue mode) ----------
const SIZE = { wide: "Wide establishing", medium: "Medium shot", close: "Close-up", macro: "Extreme macro detail", hero: "Hero frame", two: "Two-shot", insert: "Insert detail", track: "Tracking medium" };
export const DIRECTOR_FORMATS = [
  { key: "Commercial film", label: "Ad / commercial", dialogueMode: "vo", defaultDuration: 30, defaultAspect: "16:9" },
  { key: "Short film sequence", label: "Short film", dialogueMode: "dialogue", defaultDuration: 60, defaultAspect: "2.39:1" },
  { key: "Social campaign", label: "Reel / social", dialogueMode: "vo", defaultDuration: 18, defaultAspect: "9:16" },
  { key: "A-roll monologue", label: "A-roll monologue", dialogueMode: "monologue", defaultDuration: 45, defaultAspect: "9:16" },
  { key: "Music video", label: "Music video", dialogueMode: "none", defaultDuration: 45, defaultAspect: "16:9" },
  { key: "Trailer", label: "Trailer / teaser", dialogueMode: "vo", defaultDuration: 40, defaultAspect: "2.39:1" },
  { key: "Single scene", label: "Single scene", dialogueMode: "dialogue", defaultDuration: 20, defaultAspect: "2.39:1" },
  { key: "Image campaign", label: "Image campaign", dialogueMode: "none", defaultDuration: 6, defaultAspect: "4:5", unit: "frames" },
];
export const isImageFormat = (format) => /image/i.test(String(format || ""));

const ARCS = {
  "Commercial film": [
    { name: "Hook", share: 0.18, intent: "Interrupt with the strangest true image of the idea", shots: [{ size: SIZE.wide, movement: "Slow push-in" }, { size: SIZE.insert, movement: "Locked frame" }] },
    { name: "Friction", share: 0.2, intent: "Show the world straining without the promise", shots: [{ size: SIZE.medium, movement: "Handheld drift" }] },
    { name: "The Turn", share: 0.24, intent: "The subject enters and the rule of the world changes", shots: [{ size: SIZE.track, movement: "Tracking reveal" }, { size: SIZE.close, movement: "Measured push" }] },
    { name: "Proof", share: 0.22, intent: "Hero behavior rendered as physical fact, close enough to touch", shots: [{ size: SIZE.macro, movement: "Micro parallax" }] },
    { name: "Button", share: 0.16, intent: "One held image that owns the promise; title reserved for post", shots: [{ size: SIZE.hero, movement: "Slow release and hold" }] },
  ],
  "Short film sequence": [
    { name: "Cold open", share: 0.15, intent: "Start inside a moment already in motion", shots: [{ size: SIZE.close, movement: "Handheld discovery" }] },
    { name: "Setup", share: 0.2, intent: "Establish the character, the want, and the loaded object", shots: [{ size: SIZE.wide, movement: "Establishing settle" }, { size: SIZE.two, movement: "Locked frame" }] },
    { name: "Escalation", share: 0.25, intent: "Complication compounds; the want gets expensive", shots: [{ size: SIZE.medium, movement: "Tracking follow" }, { size: SIZE.insert, movement: "Snap insert" }] },
    { name: "Climax", share: 0.25, intent: "The decisive action lands with real physical consequence", shots: [{ size: SIZE.track, movement: "Unbroken move" }, { size: SIZE.close, movement: "Held close" }] },
    { name: "Resolution", share: 0.15, intent: "The sting: what changed, said with one image", shots: [{ size: SIZE.hero, movement: "Slow pull-back and hold" }] },
  ],
  "Social campaign": [
    { name: "Pattern interrupt", share: 0.22, intent: "First frame earns the thumb-stop inside one second", shots: [{ size: SIZE.close, movement: "Whip-settle" }] },
    { name: "Promise", share: 0.2, intent: "State the payoff visually before explaining anything", shots: [{ size: SIZE.medium, movement: "Punch-in" }] },
    { name: "Payoff run", share: 0.38, intent: "Deliver the satisfying loop of the idea, rhythmically", shots: [{ size: SIZE.macro, movement: "Locked macro" }, { size: SIZE.track, movement: "Speed-ramped follow" }] },
    { name: "Button", share: 0.2, intent: "Loopable final beat that rewinds cleanly into the hook", shots: [{ size: SIZE.hero, movement: "Snap to hold" }] },
  ],
  "A-roll monologue": [
    { name: "Hook", share: 0.16, intent: "The single most contrarian line, straight to lens", shots: [{ size: SIZE.close, movement: "Locked frame" }] },
    { name: "Credibility", share: 0.14, intent: "Why this speaker has the right to say it", shots: [{ size: SIZE.medium, movement: "Slow push-in" }] },
    { name: "The argument", share: 0.42, intent: "Three concrete beats, each with a physical gesture", shots: [{ size: SIZE.medium, movement: "Locked frame" }, { size: SIZE.close, movement: "Micro push" }] },
    { name: "The turn", share: 0.12, intent: "Concede the cost; flip it into the reason", shots: [{ size: SIZE.close, movement: "Held close" }] },
    { name: "Call", share: 0.16, intent: "One imperative, then silence held to the cut", shots: [{ size: SIZE.medium, movement: "Slow release" }] },
  ],
  "Music video": [
    { name: "Motif", share: 0.2, intent: "Establish the repeating visual figure", shots: [{ size: SIZE.wide, movement: "Slow orbit" }] },
    { name: "Verse world", share: 0.25, intent: "Performance inside the first world", shots: [{ size: SIZE.medium, movement: "Tracking follow" }, { size: SIZE.close, movement: "Handheld pulse" }] },
    { name: "Chorus lift", share: 0.25, intent: "The motif transforms; scale and light jump", shots: [{ size: SIZE.wide, movement: "Rising crane" }, { size: SIZE.track, movement: "Speed-ramped orbit" }] },
    { name: "Bridge fracture", share: 0.15, intent: "Break the pattern once, hard", shots: [{ size: SIZE.macro, movement: "Locked macro" }] },
    { name: "Final chorus", share: 0.15, intent: "Motif at full scale, held to blackout", shots: [{ size: SIZE.hero, movement: "Push through to hold" }] },
  ],
  "Trailer": [
    { name: "Whisper", share: 0.2, intent: "Fragments: three loaded images, no context", shots: [{ size: SIZE.insert, movement: "Locked frame" }, { size: SIZE.close, movement: "Slow push" }] },
    { name: "Premise", share: 0.25, intent: "The world and its broken rule in two moves", shots: [{ size: SIZE.wide, movement: "Establishing drift" }] },
    { name: "Escalation", share: 0.3, intent: "Accelerating cuts; stakes compound to a hard cut to silence", shots: [{ size: SIZE.track, movement: "Accelerating follow" }, { size: SIZE.medium, movement: "Snap moves" }] },
    { name: "Signature", share: 0.25, intent: "The one image the audience will carry out; title held for post", shots: [{ size: SIZE.hero, movement: "Slow reveal and hold" }] },
  ],
  "Single scene": [
    { name: "The scene", share: 1, intent: "One continuous dramatic unit: enter late, turn once, leave early", shots: [{ size: SIZE.two, movement: "Locked frame" }, { size: SIZE.close, movement: "Slow push-in" }, { size: SIZE.insert, movement: "Snap insert" }, { size: SIZE.track, movement: "Unbroken move" }] },
  ],
  "Image campaign": [
    { name: "Hero frame", share: 1, intent: "The defining campaign image — subject at full authority", shots: [{ size: SIZE.hero, movement: "Still frame — composed hold" }] },
    { name: "Detail study", share: 1, intent: "The material truth of the subject, close enough to touch", shots: [{ size: SIZE.macro, movement: "Still frame — macro study" }] },
    { name: "World context", share: 1, intent: "The subject placed inside the world whose rule it bends", shots: [{ size: SIZE.wide, movement: "Still frame — environmental" }] },
    { name: "Human proof", share: 1, intent: "The idea in use; a person mid-consequence, not posing", shots: [{ size: SIZE.medium, movement: "Still frame — candid" }] },
    { name: "Alternate hero", share: 1, intent: "A second campaign-lead composition from the opposing angle", shots: [{ size: SIZE.hero, movement: "Still frame — reverse composition" }] },
    { name: "Texture close", share: 1, intent: "The signature surface or light that brands the set", shots: [{ size: SIZE.close, movement: "Still frame — texture field" }] },
  ],
};

// ---------- concepts ----------
export function ideateConcepts(input, seed = 0) {
  const idea = parseIdea(input.idea, input.ideaOverrides);
  const rng = makeRng(`${idea.clean}::${input.format}::${seed}`);
  const humorWanted = input.humor && input.humor !== "none";
  const pool = humorWanted ? LENSES : LENSES.filter((lens) => !["escalation-engine", "deadpan-documentary"].includes(lens.key)).concat(LENSES.filter((lens) => ["escalation-engine"].includes(lens.key)));
  const lenses = pickN(rng, pool, 3);
  return lenses.map((lens, index) => ({
    id: `concept-${lens.key}-${seed}-${index}`,
    lens: lens.key,
    groundingFramework: lens.groundingFramework,
    name: lens.name,
    logline: lens.pitch(idea),
    twist: lens.twist(idea),
    humor: humorWanted ? lens.humorDevice : "Played straight — wit lives in the staging, not gags.",
    thesis: lens.thesis,
    tone: lens.style.tone,
    mood: lens.style.mood,
  }));
}

// ---------- screenplay ----------
const CAST_NAMES = ["MARA", "DEV", "JUNE", "OKafor".toUpperCase(), "LENA", "SAUL", "PRIYA", "COLE"];
const wordsFor = (seconds) => Math.max(6, Math.round(seconds * 2.4));
const trimWords = (text, budget) => {
  const words = String(text).split(/\s+/).filter(Boolean);
  return words.length <= budget ? text : words.slice(0, budget).join(" ").replace(/[,;:]?$/, ".");
};

function monologueFor(idea, input, beats, rng) {
  const audience = input.audience || "people who almost care";
  const hooks = [
    `Everyone tells ${audience} that ${idea.subject} is complicated. It isn't. It's just told badly.`,
    `I used to think ${idea.subject} was a luxury. Then I watched what happens without it.`,
    `Nobody wants to hear this about ${idea.subject}, so I'll say it slowly.`,
  ];
  const credibility = [
    `I've spent enough time with ${idea.world} to know where the bodies are buried — mine included.`,
    `This isn't theory. I broke this three times before it worked once.`,
  ];
  const points = [
    `First: ${idea.anchor} only matters when it costs you something. If it's free, it's decoration.`,
    `Second: the moment it works is quiet. If you're waiting for fireworks, you'll walk right past it.`,
    `Third: everyone measures the wrong thing. Measure what you stopped doing.`,
  ];
  const turns = [
    `And yes — there's a catch. It's slower than you want. That's not the bug. That's the filter.`,
    `Is it for everyone? No. That's exactly why it works.`,
  ];
  const calls = [
    `So try it once, properly, this week. Then come back and tell me I was wrong. You won't.`,
    `Do one thing today: start. The rest is just noise wearing a suit.`,
  ];
  return {
    Hook: pick(rng, hooks),
    Credibility: pick(rng, credibility),
    "The argument": points.join(" "),
    "The turn": pick(rng, turns),
    Call: pick(rng, calls),
  };
}

function dialogueFor(idea, cast, beatName, rng) {
  const [a, b] = cast;
  const banks = {
    setup: [
      [`${a}: You brought it. Here.`, `${b}: You said neutral ground. This is a kitchen.`, `${a}: Kitchens are honest. Sit.`],
      [`${a}: Say it out loud and it stops being scary.`, `${b}: Fine. ${idea.subject}. Happy?`, `${a}: Terrified. Keep going.`],
    ],
    escalation: [
      [`${b}: You're not hearing me. It moved.`, `${a}: Things don't move.`, `${b}: Then explain the chair.`],
      [`${a}: Rule one — nobody touches it before noon.`, `${b}: It's 11:58.`, `${a}: Then we have a problem.`],
    ],
    climax: [
      [`${a}: Last chance to walk away.`, `${b}: You always say that.`, `${a}: This time I mean the door.`],
      [`${b}: If this works, you owe me.`, `${a}: If this works, nobody owes anybody anything ever again.`],
    ],
    resolution: [
      [`${b}: So that's it?`, `${a}: That's it. That was always it.`],
      [`${a}: Told you kitchens are honest.`],
    ],
  };
  const key = /open|setup|premise|motif/i.test(beatName) ? "setup" : /climax|signature|chorus/i.test(beatName) ? "climax" : /resolution|button|call|sting/i.test(beatName) ? "resolution" : "escalation";
  return pick(rng, banks[key]).join("\n");
}

function voFor(idea, input, beatName, rng) {
  const banks = {
    early: [
      `V.O.: Some ideas knock. ${idea.subject} lets itself in.`,
      `V.O.: This is the part everyone skips. Watch it anyway.`,
    ],
    middle: [
      `V.O.: No tricks. Just ${idea.anchor}, doing what it says.`,
      `V.O.: You can't fake this part. That's the point.`,
    ],
    late: [
      `V.O.: ${idea.subject}. You already knew. Now you've seen it.`,
      `V.O.: One decision. It was always one decision.`,
    ],
  };
  const key = /hook|whisper|interrupt|motif|open/i.test(beatName) ? "early" : /button|call|signature|final|resolution/i.test(beatName) ? "late" : "middle";
  return pick(rng, banks[key]);
}

export function writeScreenplay(input, concept, seed = 0) {
  const idea = parseIdea(input.idea, input.ideaOverrides);
  const constraints = extractBriefConstraints(input.idea);
  const rng = makeRng(`${idea.clean}::${concept.lens}::${seed}`);
  const formatKey = ARCS[input.format] ? input.format : "Commercial film";
  const arc = ARCS[formatKey];
  const dialogueMode = (DIRECTOR_FORMATS.find((item) => item.key === formatKey) || {}).dialogueMode || "vo";
  const imageSequence = isImageFormat(formatKey);
  const requestedFrames = Math.round(Number(input.duration));
  const beats = imageSequence
    ? Array.from({ length: Math.min(24, Math.max(1, requestedFrames > 0 ? requestedFrames : arc.length)) }, (_, index) => {
        const beat = arc[index % arc.length];
        const pass = Math.floor(index / arc.length);
        return pass ? { ...beat, name: `${beat.name} ${pass + 1}` } : beat;
      })
    : arc;
  const duration = imageSequence ? beats.length : Math.max(4, Math.round(Number(input.duration) || 30));
  // Short targets keep the highest-share beats (in arc order) so every kept beat gets >= 2s.
  let effectiveBeats = beats;
  if (!imageSequence) {
    const maxBeats = Math.max(1, Math.floor(duration / 2));
    if (beats.length > maxBeats) {
      const kept = new Set([...beats].sort((a, b) => b.share - a.share).slice(0, maxBeats));
      effectiveBeats = beats.filter((beat) => kept.has(beat));
    }
  }
  const shareSum = effectiveBeats.reduce((sum, beat) => sum + beat.share, 0) || 1;
  const requestedCast = constraints.actorCount || (dialogueMode === "dialogue" ? 2 : dialogueMode === "monologue" ? 1 : 0);
  const heroName = String(input.ideaOverrides?.hero || "").trim().toUpperCase();
  const cast = heroName && requestedCast > 0
    ? [heroName, ...pickN(rng, CAST_NAMES.filter((name) => name !== heroName), Math.max(0, requestedCast - 1))]
    : pickN(rng, CAST_NAMES, Math.max(0, requestedCast));
  const monologue = dialogueMode === "monologue" ? monologueFor(idea, input, effectiveBeats, rng) : null;
  const explicitSetting = String(input.ideaOverrides?.setting || "").trim();
  const primarySetting = `${explicitSetting ? `INT./EXT. ${explicitSetting.toUpperCase()} - CONTROLLED LIGHT` : /parking/i.test(idea.clean) ? "INT. PARKING GARAGE - NIGHT" : /restaurant|kitchen/i.test(idea.clean) ? "INT. RESTAURANT KITCHEN - NIGHT" : `INT./EXT. ${idea.world.toUpperCase() || "THE WORLD"} - CONTROLLED LIGHT`}`;
  const settings = constraints.oneLocation || explicitSetting
    ? [primarySetting, primarySetting, primarySetting]
    : [primarySetting, `INT. ${(idea.keywords[1] || "THE ROOM").toUpperCase()} - CONTROLLED LIGHT`, `INT./EXT. ${idea.anchor.toUpperCase()} SPACE - CONTINUOUS`];
  let remainingSeconds = duration;
  const scenes = effectiveBeats.map((beat, index) => {
    const beatsAfter = effectiveBeats.length - index - 1;
    const seconds = imageSequence
      ? 1
      : beatsAfter === 0
        ? Math.max(2, remainingSeconds)
        : Math.min(Math.max(2, Math.round((duration * beat.share) / shareSum)), remainingSeconds - 2 * beatsAfter);
    remainingSeconds -= seconds;
    let dialogue = "";
    if (!constraints.noDialogue && dialogueMode === "monologue" && monologue) dialogue = `TO CAMERA: "${trimWords(monologue[beat.name] || "", wordsFor(seconds))}"`;
    else if (!constraints.noDialogue && dialogueMode === "dialogue" && cast.length >= 2 && (index > 0 || effectiveBeats.length === 1)) dialogue = dialogueFor(idea, cast, beat.name, rng);
    else if (!constraints.noDialogue && dialogueMode === "dialogue" && cast.length === 1 && /voice note|voicemail|message/i.test(idea.clean)) {
      dialogue = index === 1 ? `VOICE NOTE (O.S.): "I found your tickets. You keep losing the same night."` : index === effectiveBeats.length - 1 ? `${cast[0]}: "Same time tomorrow?"` : "";
    }
    else if (!constraints.noDialogue && !constraints.noVoiceover && dialogueMode === "vo" && (index === 0 || beatsAfter === 0 || rng() > 0.5)) dialogue = voFor(idea, input, beat.name, rng);
    const action = `${beat.intent}. ${concept.name === "The Long Table" ? `The ${idea.anchor} sits in frame, loaded and unexplained.` : `${concept.twist.split("—")[0].trim()}.`} ${beatsAfter === 0 ? "The final state holds, composed, until the cut." : "The beat resolves into a stable handoff."}`;
    return {
      beat: beat.name,
      slugline: settings[index % settings.length],
      intent: beat.intent,
      action,
      dialogue,
      duration: seconds,
      shots: beat.shots,
    };
  });
  const productionCast = constraints.actorCount ? cast.slice(0, constraints.actorCount) : dialogueMode === "dialogue" ? cast : dialogueMode === "monologue" ? cast.slice(0, 1) : [];
  return { concept, dialogueMode: constraints.noDialogue ? "none" : dialogueMode, cast: productionCast, duration, scenes };
}

// ---------- blueprint ----------
export function developBlueprint(input, concept, promptBrain = null, seed = 0) {
  const idea = parseIdea(input.idea, input.ideaOverrides);
  const screenplay = input.screenplay && Array.isArray(input.screenplay.scenes) ? input.screenplay : writeScreenplay(input, concept, seed);
  const route = detectRoute(idea.clean);
  const contentType = routeToContentType[route] || "human";
  const conventions = promptBrain?.content_types?.[contentType] || null;
  const lensLanguage = conventions?.camera?.length ? conventions.camera.slice(0, 2).join("; ") : "Cinema prime set, natural perspective";
  const lighting = conventions?.lighting?.length ? conventions.lighting[0] : "Single motivated key with deep, directional falloff";
  const verbiage = conventions?.verbiage?.slice(0, 3) || [];
  const rng = makeRng(`${idea.clean}::assets::${seed}`);
  const formatKey = ARCS[input.format] ? input.format : "Commercial film";
  const imageSequence = isImageFormat(formatKey);

  const scenes = screenplay.scenes.map((scene, sceneIndex) => {
    const shotSpecs = scene.shots.slice(0, Math.max(1, Math.min(3, Math.round(scene.duration / 4) || 1)));
    const perShot = imageSequence ? 1 : Math.max(2, Math.round(scene.duration / shotSpecs.length));
    const shots = shotSpecs.map((spec, shotIndex) => {
      const finalShot = shotIndex === shotSpecs.length - 1;
      const carriesDialogue = Boolean(scene.dialogue) && shotIndex === 0;
      return {
        id: `shot-${sceneIndex + 1}-${shotIndex + 1}`,
        title: `${scene.beat}${shotSpecs.length > 1 ? ` / ${shotIndex + 1}` : ""}`,
        slugline: scene.slugline,
        description: `${scene.action.split(". ")[Math.min(shotIndex, 1)] || scene.action}`,
        intent: scene.intent,
        duration: perShot,
        shotSize: spec.size,
        lens: lensLanguage,
        movement: spec.movement,
        startState: shotIndex === 0 ? (sceneIndex === 0 ? "The world is composed and readable before the idea lands." : "The prior scene's resolved state carries in.") : "Continues the scene's held state.",
        action: scene.action,
        endState: finalShot ? `${scene.beat} resolves and holds for the edit.` : "The action reaches a stable handoff.",
        audioIntent: carriesDialogue ? (screenplay.dialogueMode === "monologue" ? "Sync monologue to lens; room tone under; no score over the words." : "Sync dialogue; motivated room tone; foley bound to visible contact.") : (conventions?.audio?.[0] || "Motivated diegetic sound bound to visible sources."),
        dialogue: carriesDialogue ? scene.dialogue : "",
        continuityLocks: [
          ...(screenplay.cast.length ? screenplay.cast.map((name) => `${name} identity and wardrobe`) : []),
          `${idea.anchor} geometry and finish`,
          "location geography and light direction",
          "screen direction and prior resolved state",
        ],
        referenceNeeds: verbiage,
      };
    });
    return {
      id: `scene-${sceneIndex + 1}`,
      title: scene.beat,
      slugline: scene.slugline,
      description: scene.action,
      intent: scene.intent,
      duration: scene.duration,
      shots,
    };
  });

  const assets = [
    ...screenplay.cast.map((name) => ({ id: `asset-cast-${name.toLowerCase()}`, name, type: "character", description: `${name} — cast in ${concept.name}; identity, wardrobe, and manner locked across scenes.`, continuityLocks: ["face identity", "wardrobe", "manner"], referenceNeeds: ["reference portrait"] })),
    { id: "asset-hero", name: `Hero ${idea.anchor}`, type: "object", description: `${idea.subject} — the loaded object of the piece; geometry and material read must not drift.`, continuityLocks: ["geometry", "material finish", "scale"], referenceNeeds: ["hero reference"] },
    { id: "asset-world", name: "Primary world", type: "location", description: `${idea.world} — the world whose one rule the concept bends.`, continuityLocks: ["geography", "light direction"], referenceNeeds: [] },
  ];

  return {
    source: "director-deterministic",
    model: "AUTEUR Director (corpus-grounded)",
    concept,
    screenplay,
    project: {
      title: input.title && input.title !== "Untitled production" ? input.title : `${idea.subject.split(" ").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ")}: ${concept.name}`,
      logline: concept.logline,
      creativeThesis: `${concept.thesis} ${concept.twist}`,
      format: input.format || "Commercial film",
      aspect: input.aspect || (DIRECTOR_FORMATS.find((item) => item.key === formatKey) || {}).defaultAspect || "16:9",
      duration: screenplay.duration,
      platform: input.platform || "Cinema + web",
      provider: input.provider || (imageSequence ? "Image model" : "Veo 3.1 / Flow"),
    },
    styleBible: {
      visualTone: concept.tone,
      lighting,
      palette: ["disciplined neutrals", "one signature accent", "true blacks"],
      texture: conventions?.physics?.[0] || "Physically credible materials resolved to the grain",
      lensLanguage,
      mood: concept.mood,
    },
    storyBeats: screenplay.scenes.map((scene) => `${scene.beat}: ${scene.intent}`),
    scenes,
    assets,
  };
}
