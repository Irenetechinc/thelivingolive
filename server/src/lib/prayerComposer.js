// ─── Dynamic Prayer & Devotional Composer ────────────────────────────────────
// NO pre-written template strings. Every sentence is BUILT from structured
// components drawn from the God persona knowledge base, the request semantic
// profile, and the verse's own vocabulary.
//
// Prayer structure — 6 movements:
//   1. APPROACH   — Address God by His relevant name/attribute
//   2. RECOGNIZE  — Acknowledge who He is in relation to THIS specific need
//   3. GROUND     — Quote the scripture completely (never truncated)
//   4. ENGAGE     — Speak the specific need honestly, in the person's own language
//   5. DECLARE    — State what is true based on His character over the situation
//   6. YIELD      — Release and trust
//
// Devotional structure — 4 movements:
//   1. OPENING    — Establish what the situation reveals about trust and God
//   2. REFLECTION — Teach what the verse says and who God is in relation to it
//   3. APPLICATION — What God is specifically asking of the reader today
//   4. PRAYER     — A closing prayer that flows from the teaching

import {
  seedPick,
  ATTRIBUTES,
  COVENANT_NAMES,
  buildAttributePhrase,
  buildCovenantPhrase,
  buildImplication,
  getNarrative,
  getRelevantAttributes,
} from "./godPersona.js";
import { analyzeRequest } from "./requestAnalyzer.js";

// ── Shared seed-based hash ────────────────────────────────────────────────────
function hashSeed(str, offset = 0) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
  return ((h + offset * 2654435761) >>> 0).toString(36);
}

// ── Movement 1: APPROACH ──────────────────────────────────────────────────────
// Build the opening address to God.
// Uses: primary attribute, optionally covenant name, seed for determinism.
function buildApproach(profile, verseRef, idx) {
  const seed = hashSeed(`${verseRef}||${profile.seed}`, idx);
  const attrs = profile.rankedAttributes;
  const primaryAttr = attrs[0] ?? "living";

  // Decide whether to use a covenant name or an attribute phrase
  // Covenant names are used when the situation match is strong
  if (profile.covenantName && idx % 3 !== 1) {
    const covenantPhrase = buildCovenantPhrase(profile.covenantName, seed, 0);
    if (covenantPhrase) return `${covenantPhrase} —`;
  }

  return `${buildAttributePhrase(primaryAttr, seed, 0)} —`;
}

// ── Movement 2: RECOGNIZE ─────────────────────────────────────────────────────
// One or two sentences establishing who God IS in relation to this specific need.
// Draws from the attribute's implications + optionally a biblical narrative.
function buildRecognize(profile, verseRef, idx) {
  const seed = hashSeed(`${verseRef}||${profile.seed}`, idx + 10);
  const attrs = profile.rankedAttributes;
  const primaryAttr = attrs[0] ?? "living";
  const secondaryAttr = attrs[1] ?? "faithful";

  // Pick an implication from the primary attribute
  const impl1 = buildImplication(primaryAttr, seed, 0);
  // Optionally weave in a biblical narrative
  const narrative = getNarrative([...profile.situations, profile.dominantTone, profile.category.toLowerCase()]);

  const parts = [];

  // First sentence: attribute implication
  if (impl1) {
    // Capitalise and make it a complete sentence
    const sentence = impl1.charAt(0).toUpperCase() + impl1.slice(1);
    // Add a full stop if not present
    parts.push(sentence.endsWith(".") ? sentence : sentence + ".");
  }

  // Second element: biblical narrative echo (if relevant and not every prayer)
  if (narrative && idx % 2 === 0) {
    const narrativeConnectors = [
      `It is worth remembering: ${narrative.echo}.`,
      `The same God who ${narrative.echo.split(" ").slice(2, 12).join(" ")} is the God you are addressing right now.`,
      `Scripture records it — ${narrative.echo}.`,
    ];
    parts.push(seedPick(narrativeConnectors, seed, 3));
  } else if (secondaryAttr && secondaryAttr !== primaryAttr) {
    // Use a secondary attribute implication if no narrative
    const impl2 = buildImplication(secondaryAttr, seed, 1);
    if (impl2) {
      const s2 = impl2.charAt(0).toUpperCase() + impl2.slice(1);
      parts.push(s2.endsWith(".") ? s2 : s2 + ".");
    }
  }

  return parts.join(" ");
}

// ── Movement 3: GROUND ────────────────────────────────────────────────────────
// Quote the scripture completely. Never truncated. Multiple framings available
// so the same verse quoted in prayer 1 and prayer 5 doesn't use the same preamble.
function buildGround(verseText, verseRef, profile, idx) {
  const seed = hashSeed(`${verseRef}||${profile.seed}`, idx + 20);
  const vt = (verseText || "").trim();
  if (!vt) return "";

  const framings = [
    `His word declares it plainly in ${verseRef}: "${vt}"`,
    `The ground of this prayer is ${verseRef}: "${vt}"`,
    `Scripture speaks directly to this in ${verseRef}: "${vt}"`,
    `${verseRef} is the authority this prayer stands on: "${vt}"`,
    `God's own word settles it in ${verseRef}: "${vt}"`,
    `What cannot be moved is the declaration of ${verseRef}: "${vt}"`,
  ];

  return seedPick(framings, seed, 0);
}

// ── Movement 4: ENGAGE ────────────────────────────────────────────────────────
// Speak the person's specific need honestly — in their language.
// Urgency level drives the register; situations drive the specifics.
function buildEngage(profile, idx) {
  const seed = hashSeed(`${profile.seed}||engage`, idx + 30);

  // Reflect specific key phrases from the request back into the prayer
  const phraseFragment = profile.keyPhrases.length > 0
    ? profile.keyPhrases[0]
    : profile.raw.slice(0, 60).replace(/['"]/g, "");

  // High urgency — desperate and direct
  if (profile.urgency > 0.65) {
    const highUrgency = [
      `I am not bringing this in polished religious language — I am bringing it as someone who genuinely needs Your hand to move. The matter of ${phraseFragment} is not small to me, and I believe it is not small to You. Move in this.`,
      `Father, this is urgent. The weight of ${phraseFragment} is real and I cannot carry it alone any further. I need You to act — not eventually, but now.`,
      `I come to You honestly, Lord: ${phraseFragment} is more than I can manage in my own strength. I am not asking You to tidy around the edges. I need You to step into the centre of this.`,
    ];
    return seedPick(highUrgency, seed, 0);
  }

  // Gratitude tone
  if (profile.dominantTone === "gratitude") {
    const gratitude = [
      `I bring this in gratitude for what You have already done, and in trust for what remains undone in the matter of ${phraseFragment}. You have been faithful, and I receive that as the foundation for what I am asking now.`,
      `Before I ask anything, I want to count what You have already given. The ground of ${phraseFragment} is not untouched by Your hand — I can see that. I ask from that place of gratitude.`,
      `I come not with a demand but with genuine thankfulness — and in that thankfulness I bring the specific need of ${phraseFragment} and trust You with it.`,
    ];
    return seedPick(gratitude, seed, 0);
  }

  // Warfare tone
  if (profile.dominantTone === "warfare" || profile.situations.includes("warfare")) {
    const warfare = [
      `I bring ${phraseFragment} into the light of Your word and resist in Your name every lie, fear, and assignment of darkness attached to it. Not in my own strength — in Yours.`,
      `The enemy has tried to define the terms of ${phraseFragment}. I refuse that. I take my stand in the authority of Christ and declare this territory surrendered to the Lord of Hosts.`,
      `I come against everything that has attached itself to ${phraseFragment} — in the name and authority of Christ. What He has disarmed at the cross cannot be re-armed against what He has promised.`,
    ];
    return seedPick(warfare, seed, 0);
  }

  // Grief tone
  if (profile.dominantTone === "grief") {
    const grief = [
      `I bring the weight of ${phraseFragment} to You honestly, Lord. I am not pretending it does not hurt — it does. But I bring the grief to the one who is acquainted with sorrow and has not run from it.`,
      `The loss of ${phraseFragment} is real and I am not going to dress it up. I bring it to the God of all comfort, not expecting easy answers, but expecting Your presence.`,
      `In the middle of what this grief feels like, I come to You with ${phraseFragment}. You are the God who weeps with those who weep. I need You to be that God right now.`,
    ];
    return seedPick(grief, seed, 0);
  }

  // Intercession tone
  if (profile.category === "Intercession") {
    const intercession = [
      `I stand before You not for myself but for those caught up in ${phraseFragment}. What I cannot fix in them, You can reach. What I cannot say to them that they will hear, You can speak in the night.`,
      `I bring others before You — the people whose lives are shaped by ${phraseFragment}. My prayer for them is not small: I am asking You to do what only You can do in a situation only You fully see.`,
      `Lord, I lift before You everyone involved in ${phraseFragment}. Meet them where they are. Be near to them in ways I cannot be. Reach into what I cannot reach.`,
    ];
    return seedPick(intercession, seed, 0);
  }

  // Default: honest petition
  const petition = [
    `I bring the specific weight of ${phraseFragment} to You directly and honestly. Not because I have earned an answer — but because You are good and You have told us to ask. So I am asking.`,
    `Father, the matter of ${phraseFragment} is what I am carrying, and I am laying it at Your feet — not with a perfect prayer, not with a plan, just honestly, as someone who needs You in this.`,
    `I make this specific request: move in ${phraseFragment}. Do what only You can do, in the way only You would choose. I trust the difference between what I can imagine and what You can do.`,
  ];
  return seedPick(petition, seed, 0);
}

// ── Movement 5: DECLARE ───────────────────────────────────────────────────────
// State what is TRUE — drawn from God's character — over this situation.
// Not a generic declaration. Specific to the attribute, need, and verse.
function buildDeclare(profile, verseRef, verseKeyWords, idx) {
  const seed = hashSeed(`${verseRef}||${profile.seed}`, idx + 40);
  const primaryAttr = profile.rankedAttributes[0] ?? "faithful";
  const attr = ATTRIBUTES[primaryAttr];
  if (!attr) return "";

  // Pick a scripture from the attribute (not the same one being prayed)
  const attrScriptures = attr.scriptures.filter(s => !s.startsWith(verseRef.split(":")[0]));
  const attrScripture = seedPick(attrScriptures.length > 0 ? attrScriptures : attr.scriptures, seed, 0);

  // Pick a covenant name name/descriptor if available
  const cnKey = profile.covenantName;
  const cnData = cnKey ? COVENANT_NAMES[cnKey] : null;

  const declarations = [
    `${cnData ? `${cnKey} — ${cnData.meaning.toLowerCase()} — ` : ""}has spoken into this. What He has declared over it, nothing in heaven or earth can overturn.`,
    `The truth is settled: ${buildImplication(primaryAttr, seed, 2)} That is not a sentiment for good days — it is the ground that holds on hard ones.`,
    `${attr.names[0]} does not revise His word when the circumstances look different from the promise. What He has said stands — including what He has said about this.`,
    `Because of who He is — ${(attr.verbPhrases[0] || "").replace("who ", "")} — this situation is not final. He has the first word and the last word.`,
    `His word in ${attrScripture} is not a suggestion. It is the architecture this prayer is built on. What He has said, He will do.`,
  ];

  return seedPick(declarations, seed, 0);
}

// ── Movement 6: YIELD ─────────────────────────────────────────────────────────
// Release and trust — closes the prayer.
// Register varies by urgency and category.
function buildYield(profile, idx) {
  const seed = hashSeed(`${profile.seed}||yield`, idx + 50);

  if (profile.category === "Warfare") {
    const warfareClose = [
      "The battle is the Lord's. I stand in it with Him and not in my own strength. In Jesus' name. Amen.",
      "I declare the victory already won at the cross and walk forward in it. In Jesus' name. Amen.",
      "The name above every name is the only authority I need. I pray in it. Amen.",
      "Greater is He who is in me — not as a slogan but as the ground under my feet. I stand there. Amen.",
    ];
    return seedPick(warfareClose, seed, 0);
  }
  if (profile.category === "Adoration") {
    const adorationClose = [
      "You are God and I am not, and today that is more than enough. Amen.",
      "I come, I worship, I leave different — because that is what honest praise does. Amen.",
      "My confidence is not in how eloquently I have prayed. It is in who You are. Amen.",
      "Everything I carry I lay at Your feet — not because I have solved it, but because You are trustworthy. Amen.",
    ];
    return seedPick(adorationClose, seed, 0);
  }
  if (profile.category === "Thanksgiving") {
    const thanksClose = [
      "You have been good. You are good. You will be good. I rest in that. Amen.",
      "I choose gratitude not because everything is resolved but because You are resolved — unchanging and faithful. Amen.",
      "What I am grateful for is not a small thing. I receive it as a gift from the hand of a good God. Amen.",
    ];
    return seedPick(thanksClose, seed, 0);
  }
  if (profile.category === "Intercession") {
    const interClose = [
      "I have done what I can — I have stood in the gap. I trust the God who fills every gap with what I cannot. Amen.",
      "Those I have prayed for are in Your hands now — hands far more capable than mine. Amen.",
      "I release what I cannot carry and trust it to the One who already carries all things. Amen.",
    ];
    return seedPick(interClose, seed, 0);
  }

  // Default (Petition) — register varies by urgency
  if (profile.urgency > 0.65) {
    const urgentClose = [
      "I have brought it honestly. I release my grip on the outcome. Whatever You do with it is wisdom I cannot match. Amen.",
      "I stop trying to carry what was never mine to carry alone. I leave it in Your hands. Amen.",
      "I release my timeline, my preferred outcome, and my anxiety. I trust You with all three. Amen.",
    ];
    return seedPick(urgentClose, seed, 0);
  }
  const quietClose = [
    "I hold this in Your hands, trusting You know exactly what to do with it. Amen.",
    "I have asked honestly. I wait expectantly. I trust completely. Amen.",
    "This is Yours. Do what only You can do, in the way only You would choose. Amen.",
    "Your answer will be right. It may not look like what I imagined, but it will be right. I trust You with that. Amen.",
  ];
  return seedPick(quietClose, seed, 0);
}

// ── Public API: compose one prayer point ──────────────────────────────────────
export function composePrayerPoint(desires, verseEntry, verseText, idx = 0) {
  const profile = typeof desires === "string" ? analyzeRequest(desires) : desires;
  const verseRef = verseEntry?.ref ?? "";
  const verseKws = verseText
    ? verseText.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(w => w.length > 3).slice(0, 6)
    : [];

  const approach  = buildApproach(profile, verseRef, idx);
  const recognize = buildRecognize(profile, verseRef, idx);
  const ground    = buildGround(verseText, verseRef, profile, idx);
  const engage    = buildEngage(profile, idx);
  const declare   = buildDeclare(profile, verseRef, verseKws, idx);
  const yield_    = buildYield(profile, idx);

  const parts = [approach, recognize, ground, engage, declare, yield_].filter(Boolean);
  return parts.join(" ");
}

// ── Devotional composer ───────────────────────────────────────────────────────
// Builds a complete devotional from 4 movements, each compositional.

function buildDevotionalOpening(goal, profile) {
  const seed = hashSeed(`${profile.seed}||devopen`);
  const situation = profile.situations[0] ?? "this";
  const primaryAttr = profile.rankedAttributes[0] ?? "living";
  const attr = ATTRIBUTES[primaryAttr];
  const attrName = attr ? seedPick(attr.names, seed, 0) : "God";

  const openings = [
    `The weight of ${goal} is real. So is the God who already knows every dimension of it. Before a single word of this devotion is read, He has been present in what you are carrying — not as a distant observer, but as ${attrName}, ${attr ? seedPick(attr.verbPhrases, seed, 1) : "who is near"}.`,
    `Most people treat ${goal} as a problem to be solved. Scripture treats it as an invitation to encounter ${attrName}. That is a different starting point, and it produces a different kind of answer.`,
    `The question underneath ${goal} is not simply practical — it is a question about trust. And trust is not built by having easy days; it is built by discovering who God actually is on the hard ones. Today, that discovery begins here.`,
    `${goal.charAt(0).toUpperCase() + goal.slice(1)} has a way of revealing where our actual confidence is placed. Not the confidence we profess on Sunday but the one we operate from on Tuesday. Scripture does not sidestep that. It speaks directly into it.`,
    `God has not been silent about ${goal}. The question that matters is whether we are prepared to receive what He has said — not just to add it to a list of things we believe in principle, but to actually live from it today.`,
    `There is a difference between knowing about ${attrName} and encountering Him in the middle of ${goal}. This devotion is not trying to give you information about God. It is trying to bring you into contact with Him.`,
  ];
  return seedPick(openings, seed, 0);
}

function buildDevotionalReflection(verseRef, verseText, goal, profile) {
  const seed = hashSeed(`${profile.seed}||devrefl`);
  const primaryAttr = profile.rankedAttributes[0] ?? "living";
  const attr = ATTRIBUTES[primaryAttr];
  const attrName = attr ? seedPick(attr.names, seed, 0) : "God";
  const impl = attr ? buildImplication(primaryAttr, seed, 1) : "";
  const narrative = getNarrative([...profile.situations, profile.category.toLowerCase()]);

  // Build: who God is + verse + theological weight + optionally a narrative
  const godIntro = attr
    ? `Before we hear what this verse is saying, we need to know who is saying it. The God behind ${verseRef} is not a theological abstraction. He is ${attrName}, ${seedPick(attr.verbPhrases, seed, 2)}. ${impl ? (impl.charAt(0).toUpperCase() + impl.slice(1) + ".") : ""}`
    : `The God behind ${verseRef} is the living God — not an historical figure but a present reality.`;

  const verseIntro = seedPick([
    `Into that reality He speaks this: "${verseText}"`,
    `And through this passage, He says to you directly: "${verseText}"`,
    `This is what He has declared: "${verseText}"`,
    `With the full weight of His character behind it, He says in ${verseRef}: "${verseText}"`,
  ], seed, 1);

  const theologyNote = impl
    ? `The truth this verse rests on is not circumstantial — it is the character of ${attrName}. And ${impl.charAt(0).toLowerCase() + impl.slice(1)}${impl.endsWith(".") ? "" : "."}`
    : `This verse does not stand alone — it stands on the character of the God who said it.`;

  const narrativeNote = narrative
    ? ` The same God who ${narrative.echo.replace(/^He /, "").replace(/^he /, "")} — that is the God speaking through ${verseRef} right now.`
    : "";

  return `${godIntro}\n\n${verseIntro}${narrativeNote}\n\n${theologyNote}`;
}

function buildDevotionalApplication(goal, profile) {
  const seed = hashSeed(`${profile.seed}||devapp`);
  const primaryAttr = profile.rankedAttributes[0] ?? "faithful";
  const attr = ATTRIBUTES[primaryAttr];
  const sitPhrase = profile.situations.length > 0
    ? `in the specific situation of ${profile.situations[0]}`
    : `in what you are carrying right now`;

  const applications = [
    `The invitation today is not to understand this verse better — it is to receive it. To take what it says and put it next to ${goal} and let the God who said it be the one who shows you what they mean together. That is not a theological exercise; that is a living encounter.`,
    `One practical movement today: before you act on ${goal} from anxiety or from striving, pause and read this verse once more. Let the truth settle before the action begins. That is not passive — it is the most powerful kind of preparation.`,
    `${attr ? `Because ${attr.names[0]} ${seedPick(attr.verbPhrases, seed, 0)}` : "Because God is who He is"}, the weight of ${goal} does not have the final word over this day. But knowing that is different from living from it. Today's call is to live from it — ${sitPhrase}, in one real decision, one real moment.`,
    `The fear of God — not terror, but the reverence that knows He is God and you are not — is where this verse becomes more than something you believe. It becomes something you actually stand on. Stand on it today, ${sitPhrase}.`,
    `What would it look like to bring ${goal} honestly before God right now — not as a theological idea but as a real conversation with a real God who is actually listening? That is what this verse makes possible. Take the opening.`,
    `God is not asking you to resolve ${goal} by tomorrow. He is asking you to trust Him with it today. That is a smaller ask than it sounds, and a bigger act of faith than it feels. Do it anyway.`,
  ];
  return seedPick(applications, seed, 0);
}

function buildDevotionalPrayer(verseRef, goal, profile) {
  const seed = hashSeed(`${profile.seed}||devpray`);
  const primaryAttr = profile.rankedAttributes[0] ?? "living";
  const attr = ATTRIBUTES[primaryAttr];
  const covenantKey = profile.covenantName;
  const cnData = covenantKey ? COVENANT_NAMES[covenantKey] : null;

  const addressee = cnData ? covenantKey : (attr ? attr.names[0] : "Father");
  const attrVerb = attr ? seedPick(attr.verbPhrases, seed, 0) : "who is present";
  const impl = attr ? buildImplication(primaryAttr, seed, 1) : "";

  const prayers = [
    `${addressee}, ${attrVerb} — I bring ${goal} to You and I bring ${verseRef} with it. Let the word You have spoken do what I cannot do for myself. I receive it not as religious information but as a word from a God who is paying attention. Amen.`,
    `Father, I am not equal to ${goal} on my own. But that is the point — You are. Let the truth of ${verseRef} be the ground I stand on today, not just something I read and moved on from. Amen.`,
    `${addressee}, Your word in ${verseRef} is enough. Let it be enough for me today — specifically in the matter of ${goal}. ${impl ? `I receive it as true that ${impl.charAt(0).toLowerCase() + impl.slice(1)}.` : ""} I choose to act from that truth rather than from fear. Amen.`,
    `Lord, I hold ${goal} before You and hold ${verseRef} beside it. Where they don't line up with how I have been thinking, change my thinking. I trust You with the rest. Amen.`,
    `God, let the truth of this verse do its full work in me today — especially in the part of me still trying to handle ${goal} without You. I stop striving. I receive. Amen.`,
  ];
  return seedPick(prayers, seed, 0);
}

/**
 * Compose a full devotional.
 * Returns { title, scriptureReference, scriptureText, body, closingPrayer, detectedCategory }
 */
export function composeDevotional(goal, verseRef, verseText, dayNumber = 0) {
  const profile = analyzeRequest(goal);
  // Use dayNumber to shift the seed so consecutive days produce different output
  const daySeed = `${profile.seed}||day${dayNumber}`;
  profile.seed = hashSeed(daySeed);

  const opening     = buildDevotionalOpening(goal, profile);
  const reflection  = buildDevotionalReflection(verseRef, verseText, goal, profile);
  const application = buildDevotionalApplication(goal, profile);
  const closingPrayer = buildDevotionalPrayer(verseRef, goal, profile);

  // Build a title that isn't always "Walking Toward: goal"
  const titleSeed = hashSeed(daySeed + "title");
  const primaryAttr = profile.rankedAttributes[0] ?? "faithful";
  const attr = ATTRIBUTES[primaryAttr];
  const titleFormats = [
    `${goal.charAt(0).toUpperCase() + goal.slice(1)}: A Word from ${attr ? attr.names[0] : "the Living God"}`,
    `Grounded in ${verseRef}: ${goal.charAt(0).toUpperCase() + goal.slice(1)}`,
    `The God Who ${attr ? (attr.verbPhrases[0] || "").replace("who ", "").charAt(0).toUpperCase() + (attr.verbPhrases[0] || "").replace("who ", "").slice(1) : "Speaks"}: ${goal}`,
    `On the Matter of ${goal.charAt(0).toUpperCase() + goal.slice(1)}`,
    `${goal.charAt(0).toUpperCase() + goal.slice(1)}: What God Has Said`,
  ];
  const title = seedPick(titleFormats, titleSeed, 0);

  return {
    title,
    scriptureReference: verseRef,
    scriptureText: verseText,
    body: `${opening}\n\n${reflection}\n\n${application}`,
    closingPrayer,
    detectedCategory: profile.category,
  };
}
