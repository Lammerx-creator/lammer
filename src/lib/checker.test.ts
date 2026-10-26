import { describe, expect, it } from 'vitest';
import type { Exercise } from '../types';
import { checkAnswer, normalizeAnswer } from './checker';

const exercise: Exercise = {
  id: 'passiv-translation-test',
  topic: 'vorgang',
  level: 'B2',
  type: 'translation',
  prompt: 'Переведите: Счёт проверяется сотрудником.',
  answers: [
    'Die Rechnung wird von dem Mitarbeiter geprüft.',
    'Die Rechnung wird vom Mitarbeiter geprüft.',
    'Von dem Mitarbeiter wird die Rechnung geprüft.',
  ],
  explanation: 'Vorgangspassiv: werden + Partizip II.',
  hint: 'Используйте wird.',
};

describe('answer checking against explicit reference variants', () => {
  it('accepts every supplied grammatical alternative and identifies its reference', () => {
    for (const answer of exercise.answers) {
      const result = checkAnswer(answer, exercise);
      expect(result.correct).toBe(true);
      expect(result.matched).toBe(answer);
    }
  });

  it('tolerates case, nonbreaking spaces, repeated whitespace and terminal punctuation', () => {
    const result = checkAnswer('  DIE\u00a0RECHNUNG  wird vom Mitarbeiter geprüft!  ', exercise);
    expect(result.correct).toBe(true);
    expect(result.normalized).toBe('die rechnung wird vom mitarbeiter geprüft');
  });

  it('normalizes composed and decomposed umlauts with Unicode NFC', () => {
    const decomposed = 'Die Rechnung wird vom Mitarbeiter gepru\u0308ft.';
    expect(checkAnswer(decomposed, exercise).correct).toBe(true);
  });

  it('normalizes typographic quotation marks and apostrophes', () => {
    expect(normalizeAnswer('„Hallo“')).toBe(normalizeAnswer('"Hallo"'));
    expect(normalizeAnswer('“Hallo”')).toBe(normalizeAnswer('"Hallo"'));
    expect(normalizeAnswer('geht’s')).toBe(normalizeAnswer("geht's"));
  });

  it.each([
    '',
    '   ',
    'irgendeine Antwort',
    'Die Rechnung wurde vom Mitarbeiter geprüft.',
    'Die Rechnung wird vom Mitarbeiter prüfen.',
    'Die Rechnung vom Mitarbeiter wird geprüft.',
    'Die Rechnung wird vom Mitarbeiter gepruft.',
    'Die Rechnung wird vom Mitarbeiter geprüft und bezahlt.',
  ])('rejects absent, incorrect or undeclared variants: %j', (answer) => {
    expect(checkAnswer(answer, exercise).correct).toBe(false);
  });

  it('does not remove internal punctuation or rewrite comma placement', () => {
    const subordinate: Exercise = {
      ...exercise,
      answers: ['Ich weiß, dass die Rechnung geprüft wird.'],
    };
    expect(checkAnswer('Ich weiß dass die Rechnung geprüft wird.', subordinate).correct).toBe(false);
    expect(checkAnswer('Ich weiß, dass die Rechnung geprüft wird!', subordinate).correct).toBe(true);
  });

  it('keeps umlauts and ß semantically distinct unless an alternative is explicit', () => {
    expect(normalizeAnswer('Masse')).not.toBe(normalizeAnswer('Maße'));
    expect(normalizeAnswer('schon')).not.toBe(normalizeAnswer('schön'));
    expect(normalizeAnswer('geprüft')).not.toBe(normalizeAnswer('geprueft'));
  });

  it('does not accept an empty response even if a malformed dataset has an empty reference', () => {
    expect(checkAnswer('', { ...exercise, answers: [''] }).correct).toBe(false);
  });
});
