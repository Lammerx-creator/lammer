import type { Exercise } from '../types';

/** Normalize presentation, never grammar: only authored answer variants are accepted. */
export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[‘’‚‛]/gu, "'")
    .replace(/[“”„‟«»]/gu, '"')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.!?]+$/u, '')
    .trim()
    .toLocaleLowerCase('de-DE');
}

export function checkAnswer(answer: string, exercise: Exercise): {
  correct: boolean;
  normalized: string;
  matched?: string;
} {
  const normalized = normalizeAnswer(answer);
  const matched = normalized
    ? exercise.answers.find((variant) => normalizeAnswer(variant) === normalized)
    : undefined;
  return { correct: matched !== undefined, normalized, ...(matched !== undefined ? { matched } : {}) };
}
