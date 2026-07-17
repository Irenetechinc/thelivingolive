// A curated, fully offline set of well-known verses per translation, used to
// show a fresh scripture quote under each translation option every time the
// Bible home screen is revisited. No network call — all text is bundled.
export type Quote = { reference: string; text: string };

export const bibleQuotes: Record<"KJV" | "WEB" | "ASV", Quote[]> = {
  KJV: [
    { reference: "John 3:16", text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life." },
    { reference: "Psalm 23:1", text: "The LORD is my shepherd; I shall not want." },
    { reference: "Philippians 4:13", text: "I can do all things through Christ which strengtheneth me." },
    { reference: "Romans 8:28", text: "And we know that all things work together for good to them that love God, to them who are the called according to his purpose." },
    { reference: "Joshua 1:9", text: "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest." },
    { reference: "Proverbs 3:5-6", text: "Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths." },
    { reference: "Isaiah 41:10", text: "Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness." },
    { reference: "Matthew 6:33", text: "But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you." },
    { reference: "Jeremiah 29:11", text: "For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end." },
  ],
  WEB: [
    { reference: "John 3:16", text: "For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life." },
    { reference: "Psalms 23:1", text: "Yahweh is my shepherd: I shall lack nothing." },
    { reference: "Philippians 4:13", text: "I can do all things through Christ, who strengthens me." },
    { reference: "Romans 8:28", text: "We know that all things work together for good for those who love God, to those who are called according to his purpose." },
    { reference: "Joshua 1:9", text: "Haven't I commanded you? Be strong and courageous. Don't be afraid. Don't be dismayed, for Yahweh your God is with you wherever you go." },
    { reference: "Proverbs 3:5-6", text: "Trust in Yahweh with all your heart, and don't lean on your own understanding. In all your ways acknowledge him, and he will make your paths straight." },
    { reference: "Isaiah 41:10", text: "Don't you be afraid, for I am with you. Don't be dismayed, for I am your God. I will strengthen you. Yes, I will help you. Yes, I will uphold you with the right hand of my righteousness." },
    { reference: "Matthew 6:33", text: "But seek first God's Kingdom, and his righteousness; and all these things will be given to you as well." },
    { reference: "Jeremiah 29:11", text: "For I know the thoughts that I think toward you, says Yahweh, thoughts of peace, and not of evil, to give you hope and a future." },
  ],
  ASV: [
    { reference: "John 3:16", text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth on him should not perish, but have eternal life." },
    { reference: "Psalms 23:1", text: "Jehovah is my shepherd; I shall not want." },
    { reference: "Philippians 4:13", text: "I can do all things in him that strengtheneth me." },
    { reference: "Romans 8:28", text: "And we know that to them that love God all things work together for good, even to them that are called according to his purpose." },
    { reference: "Joshua 1:9", text: "Have not I commanded thee? Be strong and of good courage; be not affrighted, neither be thou dismayed: for Jehovah thy God is with thee whithersoever thou goest." },
    { reference: "Proverbs 3:5-6", text: "Trust in Jehovah with all thy heart, and lean not upon thine own understanding. In all thy ways acknowledge him, and he will direct thy paths." },
    { reference: "Isaiah 41:10", text: "Fear thou not, for I am with thee; be not dismayed, for I am thy God; I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness." },
    { reference: "Matthew 6:33", text: "But seek ye first his kingdom, and his righteousness; and all these things shall be added unto you." },
    { reference: "Jeremiah 29:11", text: "For I know the thoughts that I think toward you, saith Jehovah, thoughts of peace, and not of evil, to give you hope in your latter end." },
  ],
};

export function randomQuote(version: "KJV" | "WEB" | "ASV"): Quote {
  const list = bibleQuotes[version];
  return list[Math.floor(Math.random() * list.length)];
}

// Returns the same verse index across all three translations — used on the
// Bible home screen so every card shows the *same* scripture passage in its
// own translation style, rather than a completely different random verse per card.
export function randomQuoteIndex(): number {
  // All three arrays have the same length and same reference order.
  return Math.floor(Math.random() * bibleQuotes.KJV.length);
}

export function quoteAtIndex(version: "KJV" | "WEB" | "ASV", index: number): Quote {
  const list = bibleQuotes[version];
  return list[Math.min(index, list.length - 1)];
}
