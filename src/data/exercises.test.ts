import { describe, expect, it } from 'vitest';
import { checkAnswer, normalizeAnswer } from '../lib/checker';
import { exercises, topics } from './exercises';

const topicIds = ['vorgang', 'zustand', 'modal', 'zeitformen', 'beruf'];
const formats = ['choice', 'gap', 'order', 'translation', 'correction', 'transform', 'audio'];

function words(value: string): string[] {
  return normalizeAnswer(value).split(/\s+/u);
}

describe('curated Passiv curriculum', () => {
  it('contains exactly 50 uniquely identified exercises and ten exercises per declared topic', () => {
    expect(exercises).toHaveLength(50);
    expect(new Set(exercises.map((exercise) => exercise.id)).size).toBe(50);
    expect(topics.map((topic) => topic.id).sort()).toEqual([...topicIds].sort());
    for (const topic of topicIds) {
      expect(exercises.filter((exercise) => exercise.topic === topic)).toHaveLength(10);
    }
    expect(exercises.every((exercise) => topicIds.includes(exercise.topic))).toBe(true);
  });

  it('provides all seven exercise formats and all three requested difficulty levels', () => {
    expect([...new Set(exercises.map((exercise) => exercise.type))].sort()).toEqual([...formats].sort());
    expect([...new Set(exercises.map((exercise) => exercise.level))].sort()).toEqual(['B1', 'B2', 'C1']);
  });

  it.each(exercises.map((exercise) => [exercise.id, exercise] as const))(
    '%s has Russian guidance, a usable reference and checker-compatible answers',
    (_id, exercise) => {
      expect(exercise.prompt).toMatch(/[А-Яа-яЁё]/u);
      expect(exercise.explanation).toMatch(/[А-Яа-яЁё]/u);
      expect(exercise.hint.trim().length).toBeGreaterThan(0);
      expect(exercise.answers.length).toBeGreaterThan(0);
      const references = exercise.answers.map(normalizeAnswer);
      expect(new Set(references).size).toBe(references.length);
      for (const reference of exercise.answers) {
        expect(normalizeAnswer(reference)).not.toBe('');
        expect(checkAnswer(reference, exercise)).toMatchObject({ correct: true, matched: reference });
      }
      expect(checkAnswer('Das ist keine Antwort auf diese Aufgabe.', exercise).correct).toBe(false);
      expect(checkAnswer('', exercise).correct).toBe(false);
    },
  );

  it('has unique selectable choices that include every accepted reference and reject every distractor', () => {
    const selectable = exercises.filter((exercise) => exercise.type === 'choice' || exercise.type === 'audio');
    expect(selectable.length).toBeGreaterThan(0);
    for (const exercise of selectable) {
      expect(exercise.choices, exercise.id).toBeDefined();
      const choices = exercise.choices ?? [];
      expect(choices.length, exercise.id).toBeGreaterThanOrEqual(2);
      const normalizedChoices = choices.map(normalizeAnswer);
      expect(new Set(normalizedChoices).size, exercise.id).toBe(choices.length);
      for (const reference of exercise.answers) {
        expect(normalizedChoices, exercise.id).toContain(normalizeAnswer(reference));
      }
      const distractors = choices.filter((choice) => !exercise.answers.some((answer) => normalizeAnswer(answer) === normalizeAnswer(choice)));
      expect(distractors.length, exercise.id).toBeGreaterThan(0);
      for (const distractor of distractors) {
        expect(checkAnswer(distractor, exercise).correct, `${exercise.id}: ${distractor}`).toBe(false);
      }
    }
  });

  it('makes every sentence-building task solvable using each supplied token exactly once', () => {
    const ordering = exercises.filter((exercise) => exercise.type === 'order');
    expect(ordering.length).toBeGreaterThan(0);
    for (const exercise of ordering) {
      expect(exercise.tokens, exercise.id).toBeDefined();
      const tokenWords = (exercise.tokens ?? []).flatMap(words).sort();
      expect(tokenWords.length, exercise.id).toBeGreaterThan(2);
      const buildableReference = exercise.answers.find((answer) => {
        const referenceWords = words(answer).sort();
        return referenceWords.length === tokenWords.length && referenceWords.every((word, index) => word === tokenWords[index]);
      });
      expect(buildableReference, exercise.id).toBeDefined();
    }
  });

  it('provides actual German listening material for at least three audio tasks', () => {
    const listening = exercises.filter((exercise) => exercise.type === 'audio');
    expect(listening.length).toBeGreaterThanOrEqual(3);
    for (const exercise of listening) {
      expect(exercise.audioText?.trim().length, exercise.id).toBeGreaterThan(20);
      expect(exercise.audioText, exercise.id).toMatch(/[A-Za-zÄÖÜäöüß]/u);
    }
  });

  it('supplies a sentence to complete, correct or transform where that format needs one', () => {
    for (const exercise of exercises.filter((item) => ['gap', 'correction', 'transform'].includes(item.type))) {
      expect(exercise.sentence?.trim().length, exercise.id).toBeGreaterThan(0);
      if (exercise.type === 'gap') expect(exercise.sentence, exercise.id).toContain('___');
    }
  });

  it.each([
    ['Präsens', /\bwird bearbeitet\b/u],
    ['Präteritum', /\bwurde gestern bearbeitet\b/u],
    ['Perfekt', /\bist bearbeitet worden\b/u],
    ['Plusquamperfekt', /\bwar .*bearbeitet worden\b/u],
    ['Futur I', /\bwird .*geprüft werden\b/u],
    ['Futur II', /\bwird .*geprüft worden sein\b/u],
  ])('includes an authored Vorgangspassiv reference in %s', (_tense, pattern) => {
    const tenseReferences = exercises.filter((exercise) => exercise.topic === 'zeitformen').flatMap((exercise) => exercise.answers);
    expect(tenseReferences.some((answer) => pattern.test(answer))).toBe(true);
  });
});
