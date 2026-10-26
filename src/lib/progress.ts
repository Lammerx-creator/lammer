import type { AppState, Attempt, ReviewState, TopicId } from '../types';

export const TOPIC_IDS: TopicId[] = ['vorgang', 'zustand', 'modal', 'zeitformen', 'beruf'];

export function emptyState(): AppState {
  return { version: 1, attempts: [], cards: [], reviews: {}, dailyGoal: 10 };
}

/** SM-2 with one-day recovery after a failed recall. Intervals are calendar days. */
export function nextReview(previous: ReviewState | undefined, quality: number, now = new Date()): ReviewState {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new RangeError('Оценка повторения должна быть целым числом от 0 до 5.');
  }
  if (!Number.isFinite(now.getTime())) throw new RangeError('Некорректная дата повторения.');
  const ease = previous?.ease ?? 2.5;
  let repetitions = 0;
  let interval = 1;
  if (quality >= 3) {
    repetitions = (previous?.repetitions ?? 0) + 1;
    interval = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(1, Math.round((previous?.interval ?? 1) * ease));
  }
  const nextEase = Math.max(1.3, ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  const due = new Date(now);
  due.setDate(due.getDate() + interval);
  return {
    ease: Number(nextEase.toFixed(4)),
    interval,
    repetitions,
    due: due.toISOString(),
    lastReviewed: now.toISOString(),
  };
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function percent(correct: number, total: number): number {
  return total ? Math.round((correct / total) * 100) : 0;
}

export function getStats(attempts: Attempt[], now = new Date()) {
  const byTopic = Object.fromEntries(
    TOPIC_IDS.map((topic) => [topic, { total: 0, correct: 0, accuracy: 0 }]),
  ) as Record<TopicId, { total: number; correct: number; accuracy: number }>;
  const days = new Set<string>();
  const todayKey = dateKey(now);
  let correct = 0;
  let today = 0;
  for (const attempt of attempts) {
    const at = new Date(attempt.at);
    if (Number.isFinite(at.getTime()) && at.getTime() <= now.getTime()) {
      const key = dateKey(at);
      days.add(key);
      if (key === todayKey) today += 1;
    }
    if (attempt.correct) correct += 1;
    if (byTopic[attempt.topic]) {
      byTopic[attempt.topic].total += 1;
      if (attempt.correct) byTopic[attempt.topic].correct += 1;
    }
  }
  for (const stat of Object.values(byTopic)) stat.accuracy = percent(stat.correct, stat.total);
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { total: attempts.length, correct, accuracy: percent(correct, attempts.length), today, streak, activeDays: days.size, byTopic };
}
