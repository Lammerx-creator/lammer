import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../types';
import { emptyState, nextReview } from './progress';
import { exportState, loadState, parseImport, saveState } from './storage';

function exampleState(): AppState {
  const state = emptyState();
  state.attempts = [
    { id: 'attempt-1', exerciseId: 'vorgang-01', topic: 'vorgang', answer: 'Die Rechnung wird geprüft.', correct: true, at: '2026-10-26T10:00:00.000Z' },
    { id: 'attempt-2', exerciseId: 'zustand-02', topic: 'zustand', answer: 'Die Tür wird geschlossen.', correct: false, at: '2026-10-26T10:01:00.000Z' },
  ];
  state.cards = [{ id: 'custom-1', de: 'die Abrechnung', ru: 'расчёт', example: 'Die Abrechnung wird geprüft.', category: 'Lohnbuchhaltung', custom: true }];
  state.reviews['custom-1'] = nextReview(undefined, 5, new Date('2026-10-26T10:00:00.000Z'));
  state.dailyGoal = 15;
  return state;
}

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('deutschtrainer');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

describe('versioned JSON backups', () => {
  it('exports and imports every progress, vocabulary and review field without losing Unicode', () => {
    const state = exampleState();
    expect(parseImport(exportState(state))).toEqual(state);
    expect(exportState(state)).toContain('расчёт');
  });

  it('accepts an empty valid backup without inventing results', () => {
    expect(parseImport(exportState(emptyState()))).toEqual(emptyState());
  });

  it('rejects malformed JSON, scalar input and unknown format versions', () => {
    expect(() => parseImport('{ broken')).toThrow('JSON');
    expect(() => parseImport('null')).toThrow();
    expect(() => parseImport('[]')).toThrow();
    expect(() => parseImport(JSON.stringify({ ...emptyState(), version: 2 }))).toThrow('версия');
  });

  it('rejects a UTF-8 file exceeding five MiB, including multibyte input', () => {
    expect(() => parseImport('ä'.repeat(3 * 1024 * 1024))).toThrow('5 МиБ');
  });

  it('rejects prototype names as review keys and unknown object fields', () => {
    const baseline = exportState(emptyState());
    expect(() => parseImport(baseline.replace('"reviews": {}', '"reviews": {"__proto__": {}}'))).toThrow();
    expect(() => parseImport(baseline.replace('"reviews": {}', '"reviews": {"constructor": {}}'))).toThrow();
    expect(() => parseImport(JSON.stringify({ ...emptyState(), __unexpected: true }))).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps user HTML as plain text data instead of evaluating it', () => {
    const state = exampleState();
    state.cards[0].ru = '<img src=x onerror=alert(1)>';
    expect(parseImport(exportState(state)).cards[0].ru).toBe('<img src=x onerror=alert(1)>');
  });

  it.each([
    ['invalid topic', (state: AppState) => { state.attempts[0].topic = 'other' as never; }],
    ['invalid boolean', (state: AppState) => { state.attempts[0].correct = 'true' as never; }],
    ['invalid date', (state: AppState) => { state.attempts[0].at = '2026-02-30T10:00:00.000Z'; }],
    ['missing date', (state: AppState) => { delete (state.attempts[0] as Partial<AppState['attempts'][number]>).at; }],
    ['duplicate attempts', (state: AppState) => { state.attempts.push({ ...state.attempts[0] }); }],
    ['duplicate cards', (state: AppState) => { state.cards.push({ ...state.cards[0] }); }],
    ['out of range ease', (state: AppState) => { state.reviews['custom-1'].ease = 0; }],
    ['negative interval', (state: AppState) => { state.reviews['custom-1'].interval = -1; }],
    ['fractional repetitions', (state: AppState) => { state.reviews['custom-1'].repetitions = 1.5; }],
    ['NaN ease', (state: AppState) => { state.reviews['custom-1'].ease = Number.NaN; }],
    ['invalid custom flag', (state: AppState) => { state.cards[0].custom = 'yes' as never; }],
    ['invalid daily goal', (state: AppState) => { state.dailyGoal = 0; }],
  ])('rejects %s without silently discarding malformed records', (_, mutate) => {
    const state = exampleState();
    mutate(state);
    expect(() => parseImport(JSON.stringify(state))).toThrow();
  });

  it('rejects oversized field values and refuses to export an invalid state', () => {
    const state = exampleState();
    state.cards[0].de = 'a'.repeat(501);
    expect(() => exportState(state)).toThrow();
  });
});

describe('real IndexedDB persistence', () => {
  it('loads a new database as an empty state', async () => {
    expect(await loadState()).toEqual(emptyState());
  });

  it('round-trips all state through IndexedDB after reopening the database', async () => {
    const state = exampleState();
    await saveState(state);
    expect(await loadState()).toEqual(state);
    state.attempts[0].answer = 'changed only in memory';
    expect((await loadState()).attempts[0].answer).toBe('Die Rechnung wird geprüft.');
  });

  it('replaces a previous snapshot atomically while preserving all included records', async () => {
    const state = exampleState();
    await saveState(emptyState());
    await saveState(state);
    state.attempts.push({ ...state.attempts[0], id: 'attempt-3' });
    await saveState(state);
    expect((await loadState()).attempts).toHaveLength(3);
  });

  it('rejects an invalid save before touching an existing valid snapshot', async () => {
    const original = exampleState();
    await saveState(original);
    await expect(saveState({ ...original, dailyGoal: -1 })).rejects.toThrow();
    expect(await loadState()).toEqual(original);
  });

  it('reports unavailable storage instead of falsely claiming persistence', async () => {
    vi.stubGlobal('indexedDB', undefined);
    try {
      await expect(loadState()).rejects.toThrow('IndexedDB');
      await expect(saveState(emptyState())).rejects.toThrow('IndexedDB');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
