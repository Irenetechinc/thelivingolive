const COMMON_ASR_FIXES = Object.freeze({
  teh: "the",
  thier: "their",
  hte: "the",
  wih: "with",
  wit: "with",
  waht: "what",
  tehre: "there",
  tthe: "the",
  form: "from",
  recieve: "receive",
  recieved: "received",
  recive: "receive",
  peac: "peace",
  praye: "prayer",
  prayr: "prayer",
  chuch: "church",
  churh: "church",
  bibe: "bible",
  bibel: "bible",
  gospal: "gospel",
  misd: "missed",
  falth: "faith",
  fauth: "faith",
  helth: "health",
  thier: "their",
  htey: "they",
  ye: "the",
  yhe: "the",
  messaage: "message",
  messge: "message",
  toaday: "today",
  tomorow: "tomorrow",
  lords: "lord's",
  prayes: "prayers",
  worshipping: "worshiping",
  worshiping: "worshipping",
  listen: "listen",
  obe: "be",
  al: "all",
  gud: "god",
  gdo: "god",
  lordd: "lord",
  jesu: "jesus",
  chrst: "christ",
  holly: "holy",
  sprit: "spirit",
  bon: "been",
  becuase: "because",
  whare: "where",
  wher: "where",
  shoud: "should",
  coud: "could",
  evry: "every",
  everty: "every",
  foward: "forward",
  realy: "really",
  neccessary: "necessary",
  accross: "across",
  acount: "account",
  serom: "sermon",
  sermn: "sermon",
  seron: "sermon",
  relly: "really",
  witout: "without",
  throught: "through",
  thru: "through",
  toghter: "together",
  near: "hear",
  heaar: "hear",
  heared: "heard",
  heasr: "hear",
  inthe: "in the",
});

const DICT = new Set([
  "the","and","with","for","from","your","our","their","them","that","this","have","will","gospel","faith","grace","mercy","church","bible","sermon","prayer","prayers","worship","holy","spirit","jesus","christ","lord","god","love","peace","strength","truth","word","heart","mind","today","tomorrow","people","children","family","joy","hope","praise","heaven","earth","salvation","message","listen","hearing","heard","again","always","through","glory","amen","power","thanks","thanksgiving","deliverance","guidance","forgiveness","life","light","truth","kindness","humility","patience","wisdom","obedience","restoration","blessing","blessings"
]);

function normalizeToken(token = "") {
  return token.toLowerCase().replace(/[^a-z0-9']/g, "").trim();
}

function preserveCase(original, replacement) {
  if (!replacement) return original;
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function isLikelyDictionaryMatch(token, candidate) {
  if (!token || !candidate || token.length < 3 || candidate.length < 3) return false;
  const tokenNorm = normalizeToken(token);
  const candidateNorm = normalizeToken(candidate);
  if (!tokenNorm || !candidateNorm) return false;
  if (DICT.has(candidateNorm)) return true;
  if (candidateNorm.includes(tokenNorm) || tokenNorm.includes(candidateNorm)) return true;
  const distance = levenshtein(tokenNorm, candidateNorm);
  return distance <= 2 && Math.abs(tokenNorm.length - candidateNorm.length) <= 2;
}

function safeCorrection(token, candidate) {
  const raw = normalizeToken(token);
  const target = normalizeToken(candidate);
  if (!raw || !target || raw === target) return null;

  if (COMMON_ASR_FIXES[raw] && COMMON_ASR_FIXES[raw] === target) return target;
  if (COMMON_ASR_FIXES[raw] && COMMON_ASR_FIXES[raw] !== target) return COMMON_ASR_FIXES[raw];

  if (raw.length <= 2 || target.length <= 2) return null;
  if (isLikelyDictionaryMatch(raw, target)) return target;
  return null;
}

export function buildLocalTranscriptCorrections(originalText, freshText) {
  if (!originalText || !freshText) {
    return { corrections: [], verifiedText: originalText || freshText || "" };
  }

  const originalTokens = originalText.split(/\s+/).filter(Boolean);
  const freshTokens = freshText.split(/\s+/).filter(Boolean);
  const corrections = [];
  const seen = new Set();

  for (let i = 0; i < originalTokens.length; i++) {
    const originalToken = originalTokens[i];
    const freshToken = freshTokens[i] ?? originalToken;
    const originalNorm = normalizeToken(originalToken);
    const freshNorm = normalizeToken(freshToken);

    if (!originalNorm || !freshNorm || originalNorm === freshNorm) continue;

    const corrected = safeCorrection(originalToken, freshToken);
    if (!corrected) continue;

    const key = `${originalNorm}|${freshNorm}`;
    if (seen.has(key)) continue;
    seen.add(key);

    corrections.push({
      original: originalToken,
      corrected: preserveCase(originalToken, corrected),
      confidence: 0.92,
    });
  }

  let verifiedText = originalText;
  for (const correction of corrections) {
    const regex = new RegExp(`\\b${correction.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    verifiedText = verifiedText.replace(regex, correction.corrected);
  }

  verifiedText = verifiedText.replace(/\s+([.,!?;:])/g, "$1").replace(/([.,!?;:])(?=[A-Za-z])/g, "$1 ");
  verifiedText = verifiedText.replace(/\s{2,}/g, " ").trim();

  return {
    corrections,
    verifiedText,
  };
}
