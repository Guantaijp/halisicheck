import { splitParagraphs, splitSentences, tokenize, type Sentence } from './segmentation.util.js';

export interface StyleSegment {
  index: number;
  start: number;
  end: number;
  /** Distance from the previous segment, 0 for the first. */
  shift: number;
  meanSentenceLength: number;
  lexicalVariety: number;
  preview: string;
}

export interface StyleShiftResult {
  /** 0–100. Higher = the document reads as more than one author. */
  score: number;
  /** The sharpest discontinuity found, if any cleared the threshold. */
  boundary: { atOffset: number; afterSegment: number; magnitude: number } | null;
  segments: StyleSegment[];
  reliable: boolean;
  summary: string;
}

/**
 * Detects a change of hand partway through a document.
 *
 * The common real case is not a wholly generated document but a mixed one:
 * someone writes an introduction, pastes in generated body text, then writes a
 * conclusion. Document-level averages hide that completely — a half-generated
 * document scores like a mildly formulaic one.
 *
 * So this compares consecutive passages against each other rather than against
 * an absolute standard. It says nothing about *which* passage is generated,
 * only that the writing changed, and a change is a reason to look.
 */

/** Below this a document has too few passages for a comparison to mean much. */
const MIN_SEGMENTS = 3;
const MIN_WORDS_PER_SEGMENT = 25;

interface Features {
  meanSentenceLength: number;
  sentenceLengthVariation: number;
  lexicalVariety: number;
  meanWordLength: number;
  punctuationDensity: number;
  commaRate: number;
}

function featuresFor(text: string, sentences: Sentence[]): Features {
  const tokens = tokenize(text);
  const lengths = sentences.map((s) => s.wordCount).filter((n) => n > 0);

  const meanSentenceLength =
    lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const variance =
    lengths.length > 0
      ? lengths.reduce((sum, n) => sum + (n - meanSentenceLength) ** 2, 0) / lengths.length
      : 0;

  const letters = text.replace(/[^A-Za-z]/g, '').length;
  const punctuation = (text.match(/[;:—–()"']/g) ?? []).length;
  const commas = (text.match(/,/g) ?? []).length;

  return {
    meanSentenceLength,
    sentenceLengthVariation:
      meanSentenceLength > 0 ? Math.sqrt(variance) / meanSentenceLength : 0,
    lexicalVariety: tokens.length > 0 ? new Set(tokens).size / tokens.length : 0,
    meanWordLength: tokens.length > 0 ? letters / tokens.length : 0,
    punctuationDensity: tokens.length > 0 ? punctuation / tokens.length : 0,
    commaRate: tokens.length > 0 ? commas / tokens.length : 0,
  };
}

/**
 * Scale factors that put each feature on a comparable footing, so that a
 * five-word swing in sentence length counts about as much as a 0.1 swing in
 * lexical variety rather than swamping it.
 */
const SCALE: Record<keyof Features, number> = {
  meanSentenceLength: 12,
  sentenceLengthVariation: 0.35,
  lexicalVariety: 0.18,
  meanWordLength: 1.1,
  punctuationDensity: 0.06,
  commaRate: 0.06,
};

function distance(a: Features, b: Features): number {
  const keys = Object.keys(SCALE) as (keyof Features)[];
  const sum = keys.reduce(
    (acc, key) => acc + ((a[key] - b[key]) / SCALE[key]) ** 2,
    0,
  );
  return Math.sqrt(sum / keys.length);
}

export function analyseStyleShift(text: string): StyleShiftResult {
  const paragraphs = splitParagraphs(text).filter(
    (p) => tokenize(p.text).length >= MIN_WORDS_PER_SEGMENT,
  );

  if (paragraphs.length < MIN_SEGMENTS) {
    return {
      score: 0,
      boundary: null,
      segments: [],
      reliable: false,
      summary:
        'Too few substantial paragraphs to compare writing style across the document.',
    };
  }

  const profiles = paragraphs.map((paragraph) => ({
    paragraph,
    features: featuresFor(paragraph.text, splitSentences(paragraph.text)),
  }));

  const segments: StyleSegment[] = [];
  let sharpest = { magnitude: 0, index: -1 };

  profiles.forEach((profile, index) => {
    const shift =
      index === 0 ? 0 : distance(profiles[index - 1].features, profile.features);

    if (shift > sharpest.magnitude) sharpest = { magnitude: shift, index };

    segments.push({
      index,
      start: profile.paragraph.start,
      end: profile.paragraph.end,
      shift: Math.round(shift * 100) / 100,
      meanSentenceLength: Math.round(profile.features.meanSentenceLength * 10) / 10,
      lexicalVariety: Math.round(profile.features.lexicalVariety * 100) / 100,
      preview: profile.paragraph.text.trim().slice(0, 60),
    });
  });

  // Typical paragraph-to-paragraph drift within one author's writing sits
  // around 0.3–0.6; a change of hand pushes well past 1.
  const SHIFT_THRESHOLD = 1.0;
  const flagged = sharpest.magnitude >= SHIFT_THRESHOLD && sharpest.index > 0;

  const score = Math.round(
    Math.min(100, Math.max(0, (sharpest.magnitude - 0.45) * 62)),
  );

  return {
    score,
    boundary: flagged
      ? {
          atOffset: profiles[sharpest.index].paragraph.start,
          afterSegment: sharpest.index - 1,
          magnitude: Math.round(sharpest.magnitude * 100) / 100,
        }
      : null,
    segments,
    reliable: paragraphs.length >= MIN_SEGMENTS,
    summary: flagged
      ? `The writing changes noticeably at paragraph ${sharpest.index + 1} — sentence length, vocabulary range and punctuation habits all shift together. That is what a document written by more than one hand looks like. It does not say which part is which.`
      : 'Writing style is consistent across the document. That is equally true of something written entirely by one person and something generated entirely in one pass.',
  };
}
