/* ── Roman Urdu ↔ Urdu transliteration utility ────────────────────────────
 * Provides bi-directional matching so "tarteebaat", "ترتیبات", and
 * "settings" all match the Settings page in the search index.
 * ─────────────────────────────────────────────────────────────────────── */

/* Levenshtein distance (fast, iterative) */
export function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i;
    for (let j = 1; j <= n; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1]! : 1 + Math.min(row[j]!, prev, row[j - 1]!);
      row[j - 1] = prev;
      prev = val;
    }
    row[n] = prev;
  }
  return row[n]!;
}

/* Phoneme map: Roman Urdu → approximate Urdu script fragments
 * Applied sequentially to transliterate Roman Urdu into script.
 * Order matters — longer patterns come first. */
const ROMAN_TO_SCRIPT: [string, string][] = [
  /* digraphs first */
  ["kh", "خ"],
  ["gh", "غ"],
  ["sh", "ش"],
  ["ch", "چ"],
  ["ph", "ف"],
  ["th", "ث"],
  ["dh", "دھ"],
  ["bh", "بھ"],
  ["aa", "آ"],
  ["ee", "ی"],
  ["oo", "و"],
  ["ai", "ے"],
  ["ou", "او"],
  ["au", "او"],
  /* monographs */
  ["a", "ا"],
  ["b", "ب"],
  ["p", "پ"],
  ["t", "ت"],
  ["s", "س"],
  ["j", "ج"],
  ["d", "د"],
  ["r", "ر"],
  ["z", "ز"],
  ["k", "ک"],
  ["g", "گ"],
  ["f", "ف"],
  ["q", "ق"],
  ["l", "ل"],
  ["m", "م"],
  ["n", "ن"],
  ["w", "و"],
  ["h", "ہ"],
  ["y", "ی"],
  ["v", "و"],
  ["x", "کس"],
  ["c", "ک"],
  ["i", "ی"],
  ["u", "ا"],
  ["o", "و"],
  ["e", "ی"],
];

/* Build a single regex-based replacer */
const ROMAN_REGEX = new RegExp(
  ROMAN_TO_SCRIPT.map(([r]) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "gi"
);
const ROMAN_MAP = new Map(ROMAN_TO_SCRIPT.map(([r, u]) => [r.toLowerCase(), u]));

/** Transliterate Roman Urdu string → approximate Urdu script */
export function romanToUrdu(input: string): string {
  return input.replace(ROMAN_REGEX, (m) => ROMAN_MAP.get(m.toLowerCase()) ?? m);
}

/* ── Well-known exact word mappings (bidirectional) ─────────────────────
 * Each entry maps a canonical Roman Urdu keyword to: its Urdu script form
 * and English equivalents (so ANY of the three searches matches). */
const BIDIRECTIONAL: Array<{ roman: string; urdu: string; english: string[] }> = [
  { roman: "tarteebaat", urdu: "ترتیبات", english: ["settings", "configuration"] },
  { roman: "tartibaat", urdu: "ترتیبات", english: ["settings", "configuration"] },
  { roman: "adaigi", urdu: "ادائیگی", english: ["payment", "pay"] },
  { roman: "adaigiyaan", urdu: "ادائیگیاں", english: ["payments"] },
  { roman: "sawari", urdu: "سواری", english: ["ride"] },
  { roman: "sawariyan", urdu: "سواریاں", english: ["rides"] },
  { roman: "gaari", urdu: "گاڑی", english: ["car"] },
  { roman: "riksha", urdu: "رکشہ", english: ["rickshaw"] },
  { roman: "moltol", urdu: "مول تول", english: ["bargaining"] },
  { roman: "mansookh", urdu: "منسوخ", english: ["cancelled", "canceled"] },
  { roman: "mukammal", urdu: "مکمل", english: ["completed"] },
  { roman: "sarifeen", urdu: "صارفین", english: ["users", "customers"] },
  { roman: "gaahak", urdu: "گاہک", english: ["customer"] },
  { roman: "dukaan", urdu: "دکان", english: ["store", "shop"] },
  { roman: "dawayein", urdu: "دوائیں", english: ["medicines", "drugs"] },
  { roman: "dawai", urdu: "دوا", english: ["medicine"] },
  { roman: "maaliyaat", urdu: "مالیات", english: ["finance"] },
  { roman: "ittilaat", urdu: "اطلاعات", english: ["notifications"] },
  { roman: "ailaan", urdu: "اعلان", english: ["announcement", "broadcast"] },
  { roman: "tasdeeq", urdu: "تصدیق", english: ["verification", "kyc"] },
  { roman: "lain den", urdu: "لین دین", english: ["transactions"] },
  { roman: "nikaalna", urdu: "نکالنا", english: ["withdrawal"] },
  { roman: "hangami", urdu: "ہنگامی", english: ["emergency", "sos"] },
  { roman: "khatrah", urdu: "خطرہ", english: ["danger"] },
  { roman: "zamray", urdu: "زمرے", english: ["categories"] },
  { roman: "jaizay", urdu: "جائزے", english: ["reviews"] },
  { roman: "darjabandi", urdu: "درجہ بندی", english: ["ratings"] },
  { roman: "tabsray", urdu: "تبصرے", english: ["comments", "reviews"] },
  { roman: "jaiza", urdu: "جائزہ", english: ["overview"] },
  { roman: "aamadni", urdu: "آمدنی", english: ["revenue"] },
  { roman: "naqsha", urdu: "نقشہ", english: ["map"] },
  { roman: "choot", urdu: "چھوٹ", english: ["discount"] },
  { roman: "zer-e-iltawa", urdu: "زیر التواء", english: ["pending"] },
  { roman: "intizar", urdu: "انتظار", english: ["waiting", "pending"] },
  { roman: "riyaayat", urdu: "رعایت", english: ["discount", "voucher"] },
];

/* Build fast lookup sets */
const _ROMAN_WORDS = new Set(BIDIRECTIONAL.map((b) => b.roman.toLowerCase()));
const URDU_TO_ROMAN = new Map(BIDIRECTIONAL.map((b) => [b.urdu, b.roman]));

/** Expand a raw query into all equivalent search variants */
export function expandQuery(raw: string): string[] {
  const q = raw.trim().toLowerCase();
  if (!q) return [];

  const variants = new Set<string>([q]);

  /* 1. Check bidirectional exact word mappings */
  for (const entry of BIDIRECTIONAL) {
    if (
      q === entry.roman ||
      q === entry.urdu ||
      entry.english.some((e) => q === e) ||
      entry.roman.includes(q) ||
      q.includes(entry.roman)
    ) {
      variants.add(entry.roman);
      variants.add(entry.urdu);
      entry.english.forEach((e) => variants.add(e));
    }
  }

  /* 2. Urdu script → Roman and English */
  const urduMatch = URDU_TO_ROMAN.get(q);
  if (urduMatch) {
    variants.add(urduMatch);
    const entry = BIDIRECTIONAL.find((b) => b.roman === urduMatch);
    entry?.english.forEach((e) => variants.add(e));
  }

  /* 3. Apply phonemic Roman→script transliteration */
  const scriptized = romanToUrdu(q);
  if (scriptized !== q) variants.add(scriptized);

  return Array.from(variants);
}

/** Check if a query matches against keyword lists (all three languages) */
export function matchesKeywords(
  query: string,
  keywords: string[],
  urduKeywords: string[],
  romanUrduKeywords: string[],
  maxLevenshtein = 2
): boolean {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 2) return false;

  const all = [
    ...keywords.map((k) => k.toLowerCase()),
    ...urduKeywords.map((k) => k.toLowerCase()),
    ...romanUrduKeywords.map((k) => k.toLowerCase()),
  ];

  /* Direct substring match */
  for (const kw of all) {
    if (kw.includes(q) || q.includes(kw)) return true;
  }

  /* Expanded variants via bidirectional map + phoneme transliteration */
  const expanded = expandQuery(q);
  for (const variant of expanded) {
    if (variant === q) continue;
    for (const kw of all) {
      if (kw.includes(variant) || variant.includes(kw)) return true;
    }
  }

  /* Phonemic transliteration: transliterate query and compare */
  const scriptized = romanToUrdu(q);
  if (scriptized !== q) {
    for (const kw of all) {
      if (kw.includes(scriptized) || scriptized.includes(kw)) return true;
    }
  }

  /* Fuzzy Levenshtein match (only for long enough words to avoid false positives) */
  if (q.length >= 4) {
    for (const kw of all) {
      if (Math.abs(kw.length - q.length) <= maxLevenshtein + 1) {
        if (levenshtein(q, kw) <= maxLevenshtein) return true;
      }
      /* Check each word in a multi-word keyword */
      for (const word of kw.split(/\s+/)) {
        if (word.length >= 4 && Math.abs(word.length - q.length) <= maxLevenshtein + 1) {
          if (levenshtein(q, word) <= maxLevenshtein) return true;
        }
      }
    }
  }

  return false;
}
