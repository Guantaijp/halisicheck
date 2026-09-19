import { countWords, tokenize } from '../detection-text/heuristics/segmentation.util.js';

export interface FidelityReport {
  /** Rewritten length as a fraction of the original. 1.0 = same length. */
  lengthRatio: number;
  /** Content words in the rewrite that appear nowhere in the original. */
  introducedTerms: string[];
  /** Digits and numbers in the rewrite that are not in the original. */
  introducedNumbers: string[];
  /** 0–100. Higher = more likely the rewrite drifted from the source. */
  riskScore: number;
  /** Plain-language concerns, or empty when the rewrite looks faithful. */
  warnings: string[];
}

/**
 * Common words carry no content, so their appearance says nothing about
 * whether the rewrite invented anything.
 */
const STOP_WORDS = new Set([
  'the','a','an','and','or','but','of','to','in','on','for','with','is','are',
  'was','were','it','its','this','that','these','those','as','at','by','from',
  'has','have','had','be','been','being','not','no','so','than','then','their',
  'they','them','we','you','your','our','us','all','more','most','much','many',
  'just','about','into','over','across','now','yet','still','less','like','how',
  'what','when','who','whom','which','there','here','if','can','could','would',
  'will','shall','do','does','did','up','down','out','off','one','two','also',
  'some','any','each','every','both','other','such','only','own','same','very',
  'while','because','after','before','between','through','during','above',
  'below','again','further','once','why','where','whether','nor','too','s','t',
]);

/**
 * Crude suffix stripping, enough to treat "transforms", "transformed" and
 * "transforming" as the same word.
 *
 * Both sides are stemmed, so it does not matter which form the original used —
 * comparing an inflected rewrite against an inflected source was the bug this
 * replaced.
 */
function stem(word: string): string {
  // Longest suffixes first, or "transforming" loses only the "g".
  for (const suffix of ['ing', 'ed', 'es', 'ly', 'est', 'er', 's', 'd']) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/**
 * Flags the two ways a rewrite betrays its source: losing content, and
 * inventing it.
 *
 * A whole-passage rewrite is far better at varying sentence rhythm than a
 * sentence-by-sentence one, but that freedom is exactly what lets a model
 * compress away half the substance or add specifics that were never there.
 * This measures both so a reviewer is told where to look.
 *
 * It is a heuristic, not a fact-checker. Paraphrase legitimately introduces
 * words, so `introducedTerms` is a prompt to read the diff — never a verdict.
 */
export function assessFidelity(original: string, rewritten: string): FidelityReport {
  const originalWords = countWords(original);
  const rewrittenWords = countWords(rewritten);
  const lengthRatio =
    originalWords === 0 ? 1 : Math.round((rewrittenWords / originalWords) * 100) / 100;

  const sourceWords = tokenize(original);
  const sourceVocab = new Set(sourceWords);
  const sourceStems = new Set(sourceWords.map(stem));
  const seen = new Set<string>();
  const introducedTerms: string[] = [];

  for (const word of tokenize(rewritten)) {
    if (STOP_WORDS.has(word) || word.length < 4) continue;
    if (sourceVocab.has(word) || seen.has(word)) continue;
    if (sourceStems.has(stem(word))) continue;
    seen.add(word);
    introducedTerms.push(word);
  }

  // Numbers are the highest-risk invention: a fabricated figure reads as fact.
  // Trailing punctuation is stripped, or "2011," fails to match "2011" in the
  // source and every figure near a comma is reported as invented — false
  // alarms that teach a reader to ignore the real ones.
  const numbersIn = (text: string) =>
    new Set(
      (text.match(/\d[\d.,]*/g) ?? [])
        .map((n) => n.replace(/[.,]+$/, ''))
        .filter((n) => n.length > 0),
    );
  const sourceNumbers = numbersIn(original);
  const introducedNumbers = [...numbersIn(rewritten)].filter(
    (n) => !sourceNumbers.has(n),
  );

  const warnings: string[] = [];

  if (lengthRatio < 0.6) {
    warnings.push(
      `The rewrite is ${Math.round((1 - lengthRatio) * 100)}% shorter than the original. Check whether something was dropped rather than tightened.`,
    );
  } else if (lengthRatio > 1.5) {
    warnings.push(
      `The rewrite is ${Math.round((lengthRatio - 1) * 100)}% longer than the original. Check whether anything was added.`,
    );
  }

  if (introducedNumbers.length > 0) {
    warnings.push(
      `Figures appear that are not in the original: ${introducedNumbers.join(', ')}. Verify every one.`,
    );
  }

  // Proportional to length: a long passage naturally reuses more vocabulary.
  const termRatio =
    rewrittenWords === 0 ? 0 : introducedTerms.length / rewrittenWords;
  if (termRatio > 0.2) {
    warnings.push(
      `${introducedTerms.length} content words appear that are not in the original. Some will be ordinary paraphrase, but read the diff for invented specifics.`,
    );
  }

  const riskScore = Math.min(
    100,
    Math.round(
      Math.abs(1 - lengthRatio) * 55 +
        termRatio * 160 +
        introducedNumbers.length * 25,
    ),
  );

  return { lengthRatio, introducedTerms, introducedNumbers, riskScore, warnings };
}
