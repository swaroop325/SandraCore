/**
 * Expands a conversational query into keyword tokens for FTS search.
 * "that book I mentioned last week" → ["book", "mentioned"]
 * Handles English (and falls back gracefully for other languages).
 */

export const STOP_WORDS_EN: Set<string> = new Set([
  "a", "an", "the", "this", "that", "these", "those",
  "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "may", "might", "shall", "must", "can",
  "i", "you", "we", "they", "he", "she", "it",
  "me", "him", "her", "us", "them",
  "my", "your", "our", "their", "his", "its",
  "myself", "yourself", "himself", "herself", "itself", "ourselves", "themselves",
  "what", "which", "who", "whom", "when", "where", "why", "how",
  "all", "each", "every", "both", "few", "more", "most", "other",
  "some", "such", "no", "nor", "not", "only", "own", "same", "so",
  "than", "too", "very", "just", "but", "and", "or", "if", "while",
  "of", "at", "by", "for", "with", "about", "against", "between",
  "into", "through", "during", "before", "after", "above", "below",
  "to", "from", "up", "down", "in", "out", "on", "off", "over", "under",
  "again", "further", "then", "once", "here", "there",
  "am", "been", "get", "got",
  "also", "back", "even", "still", "well",
  "last", "week", "day", "time", "ago",
]);

export const STOP_WORDS_ES: Set<string> = new Set([
  "un", "una", "unos", "unas", "el", "la", "los", "las", "de", "del",
  "en", "es", "ser", "hay", "que", "se", "su", "con", "por", "para",
  "como", "pero", "si", "no", "al", "yo", "tu", "tú", "él", "ella",
  "nos", "vos", "ellos", "ellas", "mi", "mis", "me", "te", "lo", "le",
  "les", "mas", "más", "muy", "ya", "así", "todo", "todos", "esta",
  "esto", "este", "también", "cuando", "donde", "quien", "qué", "cómo",
  "sobre", "hasta", "desde", "entre", "sin", "ante", "bajo", "tras",
]);

export const STOP_WORDS_PT: Set<string> = new Set([
  "um", "uma", "o", "a", "os", "as", "de", "do", "da", "dos", "das",
  "em", "no", "na", "nos", "nas", "por", "para", "com", "que", "se",
  "não", "mais", "mas", "eu", "tu", "ele", "ela", "nós", "vós", "eles",
  "elas", "me", "te", "lhe", "nos", "vos", "lhes", "seu", "sua", "seus",
  "suas", "meu", "minha", "este", "esta", "isso", "aquele", "quando",
  "onde", "quem", "qual", "como", "muito", "bem", "já", "ainda", "só",
]);

export const STOP_WORDS_AR: Set<string> = new Set([
  "في", "من", "إلى", "على", "هذا", "هذه", "هو", "هي", "كان", "كانت",
  "أن", "لا", "ما", "عن", "مع", "أو", "لكن", "كما", "قد", "ثم",
  "حتى", "إذا", "لأن", "منذ", "بعد", "قبل", "بين", "عند", "وهو",
  "وهي", "وكان", "وكانت", "التي", "الذي", "الذين", "اللواتي",
]);

export const STOP_WORDS_KO: Set<string> = new Set([
  "이", "가", "은", "는", "을", "를", "의", "에", "로", "으로",
  "와", "과", "한", "하다", "있다", "없다", "것", "수", "그",
  "저", "제", "내", "우리", "나", "너", "그것", "이것", "저것",
]);

// CJK languages (ZH, JA) — character-level tokenization handles them already
// These are function-word particles common in Japanese but written in hiragana
export const STOP_WORDS_JA_KANA: Set<string> = new Set([
  "の", "に", "は", "を", "が", "で", "と", "て", "も", "や",
  "から", "まで", "より", "けど", "ので", "から", "でも", "など",
]);

/** Detect dominant script of a text (heuristic). */
function detectScript(text: string): "arabic" | "korean" | "latin" | "mixed" {
  const arabicCount = (text.match(/[\u0600-\u06ff]/g) ?? []).length;
  const koreanCount = (text.match(/[\uac00-\ud7af\u1100-\u11ff]/g) ?? []).length;
  const totalChars = text.replace(/\s/g, "").length;
  if (totalChars === 0) return "latin";
  if (arabicCount / totalChars > 0.3) return "arabic";
  if (koreanCount / totalChars > 0.3) return "korean";
  return "latin";
}

/**
 * Pick stop word set based on language code or script detection.
 * Supports: en, es, pt, ar, ko (zh and ja use CJK character tokenization)
 */
export function getStopWordsForLocale(locale?: string): Set<string> {
  const lang = (locale ?? "en").toLowerCase().split("-")[0] ?? "en";
  switch (lang) {
    case "es": return STOP_WORDS_ES;
    case "pt": return STOP_WORDS_PT;
    case "ar": return STOP_WORDS_AR;
    case "ko": return STOP_WORDS_KO;
    default:   return STOP_WORDS_EN;
  }
}

/** CJK Unicode ranges: CJK Unified Ideographs, Hiragana, Katakana, Hangul */
const CJK_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

function isCjkChar(ch: string): boolean {
  return CJK_REGEX.test(ch);
}

/**
 * Expands a conversational query into keyword tokens for FTS search.
 */
export function expandQueryToKeywords(query: string, locale?: string): string[] {
  if (!query || query.trim().length === 0) return [];
  const stopWords = getStopWordsForLocale(locale);

  const tokens: string[] = [];

  // Handle mixed CJK + Latin text
  // We split the string into CJK characters (each is its own token) and non-CJK segments
  let current = "";
  for (const ch of query) {
    if (isCjkChar(ch)) {
      // Flush any accumulated Latin segment
      if (current.length > 0) {
        extractLatinTokens(current, tokens, stopWords);
        current = "";
      }
      // Each CJK character is its own token
      tokens.push(ch);
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    extractLatinTokens(current, tokens, stopWords);
  }

  // Deduplicate while preserving first-seen order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const token of tokens) {
    if (!seen.has(token)) {
      seen.add(token);
      unique.push(token);
    }
  }

  return unique;
}

function extractLatinTokens(segment: string, out: string[], stopWords: Set<string>): void {
  // Strip punctuation, lowercase, split by whitespace/non-alpha
  const words = segment
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const word of words) {
    // Skip stop words and short tokens (< 3 chars)
    if (word.length < 3) continue;
    if (stopWords.has(word)) continue;
    out.push(word);
  }
}
