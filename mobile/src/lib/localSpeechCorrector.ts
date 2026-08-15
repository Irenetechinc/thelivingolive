const ACCENT_MAP: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', ö: 'o', õ: 'o', ø: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ç: 'c', ñ: 'n', ß: 'ss',
  ý: 'y', ÿ: 'y',
  æ: 'ae', œ: 'oe',
};

const PHRASE_FIXES: Array<[RegExp, string]> = [
  [/\bteh\b/gi, 'the'],
  [/\bthier\b/gi, 'their'],
  [/\bht e\b/gi, 'the'],
  [/\bht\b/gi, 'the'],
  [/\bwih\b/gi, 'with'],
  [/\bwaht\b/gi, 'what'],
  [/\btehre\b/gi, 'there'],
  [/\bfromm\b/gi, 'from'],
  [/\brecieve\b/gi, 'receive'],
  [/\brecieved\b/gi, 'received'],
  [/\bpraye\b/gi, 'prayer'],
  [/\bprayr\b/gi, 'prayer'],
  [/\bchuch\b/gi, 'church'],
  [/\bchurh\b/gi, 'church'],
  [/\bbibe\b/gi, 'bible'],
  [/\bbibel\b/gi, 'bible'],
  [/\bgospal\b/gi, 'gospel'],
  [/\bserom\b/gi, 'sermon'],
  [/\bsermn\b/gi, 'sermon'],
  [/\bseron\b/gi, 'sermon'],
  [/\bjesu\b/gi, 'Jesus'],
  [/\bchrst\b/gi, 'Christ'],
  [/\bholly\b/gi, 'holy'],
  [/\bsprit\b/gi, 'spirit'],
  [/\bbon\b/gi, 'been'],
  [/\bbecuase\b/gi, 'because'],
  [/\bwhare\b/gi, 'where'],
  [/\bwher\b/gi, 'where'],
  [/\bshoud\b/gi, 'should'],
  [/\bcoud\b/gi, 'could'],
  [/\bevry\b/gi, 'every'],
  [/\beveryty\b/gi, 'every'],
  [/\brelly\b/gi, 'really'],
  [/\bwitout\b/gi, 'without'],
  [/\bthrought\b/gi, 'through'],
  [/\bthru\b/gi, 'through'],
  [/\btogther\b/gi, 'together'],
  [/\bheaar\b/gi, 'hear'],
  [/\bheared\b/gi, 'heard'],
  [/\bheasr\b/gi, 'hear'],
  [/\binthe\b/gi, 'in the'],
  [/\bthe lord jesu\b/gi, 'the Lord Jesus'],
  [/\bthe lord christ\b/gi, 'the Lord Christ'],
  [/\bholy spirit\b/gi, 'Holy Spirit'],
  [/\bthe holy spirit\b/gi, 'the Holy Spirit'],
  [/\bthe bible\b/gi, 'the Bible'],
  [/\bthe church\b/gi, 'the church'],
  [/\bchurch of god\b/gi, 'church of God'],
  [/\bthe lord god\b/gi, 'the Lord God'],
  [/\bthank you lord\b/gi, 'thank You, Lord'],
  [/\bthe lord is good\b/gi, 'the Lord is good'],
  [/\bthe lord is with us\b/gi, 'the Lord is with us'],
  [/\bthe lord is my shepherd\b/gi, 'the Lord is my shepherd'],
  [/\bgrace and mercy\b/gi, 'grace and mercy'],
  [/\bword of god\b/gi, 'Word of God'],
  [/\bword of the lord\b/gi, 'word of the Lord'],
  [/\bfor the lord\b/gi, 'for the Lord'],
  [/\bby the grace of god\b/gi, 'by the grace of God'],
  [/\bthe word of god\b/gi, 'the Word of God'],
  [/\bthe lord has done\b/gi, 'the Lord has done'],
  [/\bwe thank you lord\b/gi, 'we thank You, Lord'],
  [/\bwhat a mighty god\b/gi, 'what a mighty God'],
  [/\bthe lord is my strength\b/gi, 'the Lord is my strength'],
  [/\bthank god\b/gi, 'thank God'],
  [/\bwe bless your holy name\b/gi, 'we bless Your holy name'],
  [/\blet us pray\b/gi, 'let us pray'],
  [/\bwe worship you\b/gi, 'we worship You'],
  [/\bwe praise you lord\b/gi, 'we praise You, Lord'],
  [/\bforgive us lord\b/gi, 'forgive us, Lord'],
];

const BIBLE_WORDS = new Set([
  'bible','church','gospel','sermon','prayer','prayers','holy','spirit','jesus','christ','lord','god','faith','grace','mercy','salvation','word','scripture','truth','heaven','earth','glory','amen','worship','blessing','blessings','kingdom','forgiveness','peace','love','wisdom','guidance','righteousness','sunday','monday','tuesday','wednesday','thursday','friday','saturday'
]);

function removeAccents(value: string): string {
  return value.split('').map((char) => ACCENT_MAP[char] ?? char).join('');
}

function capitalizeSentence(value: string): string {
  if (!value) return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function applyLocalSpeechCorrections(raw: string): string {
  if (!raw || !raw.trim()) return raw;

  let next = removeAccents(raw);
  next = next.replace(/\s+/g, ' ').trim();

  for (const [regex, replacement] of PHRASE_FIXES) {
    next = next.replace(regex, replacement);
  }

  const tokens = next.split(/\s+/).filter(Boolean);
  const corrected: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];
    const lower = token.toLowerCase();

    if (BIBLE_WORDS.has(lower)) {
      if (lower === 'jesus' || lower === 'christ' || lower === 'god' || lower === 'lord' || lower === 'holy' || lower === 'spirit' || lower === 'bible') {
        token = lower === 'god' ? 'God' :
          lower === 'lord' ? 'Lord' :
          lower === 'bible' ? 'Bible' :
          lower === 'holy' ? 'holy' :
          lower === 'spirit' ? 'Spirit' :
          lower === 'jesus' ? 'Jesus' :
          'Christ';
      }
      corrected.push(token);
      continue;
    }

    if (/^[a-z]+$/i.test(token)) {
      const lowered = token.toLowerCase();
      if (lowered === 'thier') token = 'their';
      if (lowered === 'teh') token = 'the';
      if (lowered === 'wih') token = 'with';
      if (lowered === 'waht') token = 'what';
      if (lowered === 'bibe' || lowered === 'bibel') token = 'Bible';
      if (lowered === 'gospal') token = 'gospel';
      if (lowered === 'serom' || lowered === 'sermn' || lowered === 'seron') token = 'sermon';
      if (lowered === 'prayr' || lowered === 'praye') token = 'prayer';
      if (lowered === 'chrst') token = 'Christ';
      if (lowered === 'jesu') token = 'Jesus';
      if (lowered === 'sprit') token = 'spirit';
      if (lowered === 'gdo') token = 'God';
      if (lowered === 'lrd') token = 'Lord';
      if (lowered === 'luv') token = 'love';
      if (lowered === 'holyspirit') token = 'Holy Spirit';
      if (lowered === 'wordofgod') token = 'Word of God';
    }

    corrected.push(token);
  }

  const rebuilt = corrected.join(' ');
  const endTrimmed = rebuilt.replace(/\s+([.,!?;:])/g, '$1').replace(/([,.!?;:])(?=[A-Za-z])/g, '$1 ');
  return capitalizeSentence(endTrimmed.trim());
}

