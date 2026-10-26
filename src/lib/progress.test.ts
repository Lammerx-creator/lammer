import { describe, expect, it } from 'vitest';
import type { Attempt, ReviewState, TopicId } from '../types';
import { emptyState, getStats, nextReview } from './progress';

function attempt(id: string, date: Date, correct = true, topic: TopicId = 'vorgang'): Attempt {
  return { id, exerciseId: 'passiv-test', topic, answer: 'Antwort', correct, at: date.toISOString() };
}

function addDays(date: Date, count: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  return result;
}

describe('initial progress state', () => {
  it('starts without invented results or vocabulary and returns independent state objects', () => {
    const first = emptyState();
    expect(first).toEqual({ version: 1, attempts: [], cards: [], reviews: {}, dailyGoal: 10 });
    first.attempts.push(attempt('a', new Date(2026, 9, 26)));
    expect(emptyState().attempts).toEqual([]);
  });
});

describe('SM-2 spaced repetition', () => {
  const now = new Date(2026, 9, 26, 12, 30);

  it('schedules the first success after one calendar day and records the review time', () => {
    const review = nextReview(undefined, 5, now);
    expect(review.repetitions).toBe(1);
    expect(review.interval).toBe(1);
    expect(review.ease).toBeCloseTo(2.6);
    expect(review.lastReviewed).toBe(now.toISOString());
    expect(review.due).toBe(addDays(now, 1).toISOString());
  });

  it('uses six days for the second success and the previous ease for later intervals', () => {
    const first = nextReview(undefined, 5, now);
    const secondDate = addDays(now, 1);
    const second = nextReview(first, 5, secondDate);
    expect(second.repetitions).toBe(2);
    expect(second.interval).toBe(6);
    const thirdDate = addDays(secondDate, 6);
    const third = nextReview(second, 4, thirdDate);
    expect(third.repetitions).toBe(3);
    expect(third.interval).toBe(Math.round(second.interval * second.ease));
    expect(third.due).toBe(addDays(thirdDate, third.interval).toISOString());
  });

  it('resets repetition count and interval after a failure without discarding prior ease', () => {
    const previous: ReviewState = {
      ease: 2.2,
      interval: 30,
      repetitions: 5,
      due: now.toISOString(),
      lastReviewed: addDays(now, -30).toISOString(),
    };
    const failed = nextReview(previous, 1, now);
    expect(failed.repetitions).toBe(0);
    expect(failed.interval).toBe(1);
    expect(failed.ease).toBeLessThan(previous.ease);
    expect(failed.due).toBe(addDays(now, 1).toISOString());
    expect(previous.interval).toBe(30);
    const recovered = nextReview(failed, 4, addDays(now, 1));
    expect(recovered.repetitions).toBe(1);
    expect(recovered.interval).toBe(1);
  });

  it('never decreases the ease factor below 1.3 after repeated failures', () => {
    let previous: ReviewState | undefined;
    for (let day = 0; day < 20; day += 1) {
      previous = nextReview(previous, 0, addDays(now, day));
      expect(previous.ease).toBeGreaterThanOrEqual(1.3);
      expect(previous.interval).toBe(1);
    }
    expect(previous?.ease).toBe(1.3);
  });

  it.each([-1, 6, 2.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid quality %s', (quality) => {
    expect(() => nextReview(undefined, quality, now)).toThrow(RangeError);
  });
});

describe('learning statistics from real attempts', () => {
  const now = new Date(2026, 0, 2, 15);

  it('does not invent streaks, accuracy or activity when history is empty', () => {
    const stats = getStats([], now);
    expect(stats).toMatchObject({ total: 0, correct: 0, accuracy: 0, today: 0, streak: 0, activeDays: 0 });
    expect(Object.keys(stats.byTopic).sort()).toEqual(['beruf', 'modal', 'vorgang', 'zeitformen', 'zustand']);
    expect(stats.byTopic.modal).toEqual({ total: 0, correct: 0, accuracy: 0 });
  });

  it('counts all outcomes and rounds percentage while keeping topic statistics separate', () => {
    const stats = getStats([
      attempt('a', now, true, 'vorgang'),
      attempt('b', now, false, 'vorgang'),
      attempt('c', now, true, 'modal'),
    ], now);
    expect(stats).toMatchObject({ total: 3, correct: 2, accuracy: 67, today: 3, streak: 1, activeDays: 1 });
    expect(stats.byTopic.vorgang).toEqual({ total: 2, correct: 1, accuracy: 50 });
    expect(stats.byTopic.modal).toEqual({ total: 1, correct: 1, accuracy: 100 });
  });

  it('counts a consecutive daily streak across the year boundary and ignores duplicate sessions', () => {
    const stats = getStats([
      attempt('a', new Date(2025, 11, 31, 20)),
      attempt('b', new Date(2026, 0, 1, 8)),
      attempt('c', new Date(2026, 0, 1, 18)),
      attempt('d', new Date(2026, 0, 2, 10)),
    ], now);
    expect(stats.streak).toBe(3);
    expect(stats.activeDays).toBe(3);
    expect(stats.today).toBe(1);
  });

  it('preserves an active streak through yesterday when today has no attempts', () => {
    const stats = getStats([
      attempt('a', new Date(2025, 11, 31, 20)),
      attempt('b', new Date(2026, 0, 1, 12)),
    ], now);
    expect(stats.streak).toBe(2);
    expect(stats.today).toBe(0);
  });

  it('ends a streak after a missed day and does not treat future entries as today', () => {
    const stats = getStats([
      attempt('a', new Date(2025, 11, 30, 12)),
      attempt('b', new Date(2026, 0, 3, 12)),
    ], now);
    expect(stats.streak).toBe(0);
    expect(stats.today).toBe(0);
  });

  it('computes the same results when historical attempts arrive out of order', () => {
    const rows = [
      attempt('a', new Date(2025, 11, 31, 20), false),
      attempt('b', new Date(2026, 0, 1, 10)),
      attempt('c', new Date(2026, 0, 2, 10)),
    ];
    expect(getStats(rows, now)).toEqual(getStats([...rows].reverse(), now));
  });
});
