// Cross-item similarity detection on the exam bank (ISO 17024 exam-validity
// protection — flag questions too similar to each other before they ship).
// Deliberately a self-contained lexical approach (word-shingling + Jaccard),
// not embeddings/an LLM call: question banks here run to the tens/low-
// hundreds per paper (AI-assisted generation is capped at 50/call), so an
// O(n^2) pairwise comparison is entirely tractable without new external
// infrastructure or an API key. Semantic near-duplicates that reword a
// question without reusing its vocabulary (which this approach cannot catch)
// are an explicitly deferred enhancement — see the Tier 4 plan for why.

const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "and", "or", "is", "are", "was", "were",
  "be", "been", "being", "for", "on", "with", "as", "by", "at", "from", "that",
  "this", "which", "it", "its", "these", "those", "will", "would", "should",
  "can", "could", "not", "no",
]);

function normalise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

// Bigrams, not trigrams: tested against realistic near-duplicates (the same
// question with one word swapped, e.g. "addresses" -> "covers") — trigrams
// were too strict (a single word edit poisons 3 overlapping trigrams,
// dropping a genuine near-duplicate pair below any reasonable threshold),
// while unigrams (plain bag-of-words) were too loose (two unrelated
// questions sharing domain vocabulary would falsely trigger). Bigrams
// require actual phrase-level overlap while tolerating single-word edits.
/** Word n-gram shingles of normalised text (default bigrams). */
export function shingle(text: string, n = 2): Set<string> {
  const words = normalise(text);
  if (words.length < n) return new Set(words.length ? [words.join(" ")] : []);
  const shingles = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    shingles.add(words.slice(i, i + n).join(" "));
  }
  return shingles;
}

/** Jaccard similarity: |A ∩ B| / |A ∪ B|, in [0, 1]. Empty/empty is defined as 0 (no basis for comparison). */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const s of a) {
    if (b.has(s)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export type SimilarPair = {
  questionAId: string;
  questionBId: string;
  score: number;
};

/**
 * Pairwise-compare every question's text against every other in the same
 * set and return pairs at or above `threshold`, highest score first.
 * O(n^2) — fine at the scale a single exam paper's question bank runs to.
 */
export function findSimilarPairs(
  questions: { id: string; text: string }[],
  threshold = 0.6,
): SimilarPair[] {
  const shingled = questions.map((q) => ({ id: q.id, shingles: shingle(q.text) }));
  const pairs: SimilarPair[] = [];
  for (let i = 0; i < shingled.length; i++) {
    for (let j = i + 1; j < shingled.length; j++) {
      const score = jaccardSimilarity(shingled[i].shingles, shingled[j].shingles);
      if (score >= threshold) {
        pairs.push({ questionAId: shingled[i].id, questionBId: shingled[j].id, score });
      }
    }
  }
  return pairs.sort((a, b) => b.score - a.score);
}
