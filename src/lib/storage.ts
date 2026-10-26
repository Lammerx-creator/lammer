import type { AppState, Attempt, ReviewState, TopicId, WordCard } from '../types';
import { emptyState, TOPIC_IDS } from './progress';

const MAX_BYTES = 5 * 1024 * 1024;
const DB_NAME = 'deutschtrainer';
const STORE_NAME = 'local-state';
const STATE_KEY = 'current';

function invalid(detail: string): never {
  throw new Error(`Невозможно импортировать данные: ${detail}`);
}

function object(value: unknown, path: string, keys?: string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(`${path} должен быть объектом.`);
  const result = value as Record<string, unknown>;
  if (keys && Object.keys(result).some((key) => !keys.includes(key))) invalid(`${path} содержит неизвестные поля.`);
  return result;
}

function text(value: unknown, path: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) invalid(`некорректное поле ${path}.`);
  return value;
}

function identifier(value: unknown, path: string): string {
  const id = text(value, path, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(id) || ['__proto__', 'prototype', 'constructor'].includes(id)) {
    invalid(`недопустимый идентификатор ${path}.`);
  }
  return id;
}

function numeric(value: unknown, path: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    invalid(`некорректное число ${path}.`);
  }
  return value;
}

function date(value: unknown, path: string): string {
  const iso = text(value, path, 24);
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== iso) invalid(`некорректная дата ${path}; нужен ISO-формат UTC.`);
  return iso;
}

function list(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid(`некорректный список ${path}.`);
  return value;
}

function unique<T extends { id: string }>(items: T[], path: string): T[] {
  if (new Set(items.map((item) => item.id)).size !== items.length) invalid(`${path} содержит повторяющиеся идентификаторы.`);
  return items;
}

/** Strict versioned import: malformed records are rejected as a whole, never silently dropped. */
export function parseImport(json: string): AppState {
  if (typeof json !== 'string' || new TextEncoder().encode(json).byteLength > MAX_BYTES) {
    invalid('размер файла превышает 5 МиБ.');
  }
  let source: unknown;
  try {
    source = JSON.parse(json);
  } catch {
    invalid('файл не является корректным JSON.');
  }
  const root = object(source, 'корень', ['version', 'attempts', 'cards', 'reviews', 'dailyGoal']);
  if (root.version !== 1) invalid('эта версия формата не поддерживается.');
  const attempts = unique(list(root.attempts, 'attempts', 100000).map((value, index): Attempt => {
    const item = object(value, `attempts[${index}]`, ['id', 'exerciseId', 'topic', 'answer', 'correct', 'at']);
    if (!TOPIC_IDS.includes(item.topic as TopicId)) invalid(`неизвестная тема attempts[${index}].`);
    if (typeof item.correct !== 'boolean') invalid(`некорректный результат attempts[${index}].`);
    return {
      id: identifier(item.id, 'attempt.id'),
      exerciseId: identifier(item.exerciseId, 'attempt.exerciseId'),
      topic: item.topic as TopicId,
      answer: text(item.answer, 'attempt.answer', 10000, true),
      correct: item.correct,
      at: date(item.at, 'attempt.at'),
    };
  }), 'attempts');
  const cards = unique(list(root.cards, 'cards', 10000).map((value, index): WordCard => {
    const item = object(value, `cards[${index}]`, ['id', 'de', 'ru', 'example', 'category', 'custom']);
    if (item.custom !== undefined && typeof item.custom !== 'boolean') invalid(`некорректный признак custom у cards[${index}].`);
    return {
      id: identifier(item.id, 'card.id'),
      de: text(item.de, 'card.de', 500),
      ru: text(item.ru, 'card.ru', 1000),
      example: text(item.example, 'card.example', 2000, true),
      category: text(item.category, 'card.category', 200),
      ...(typeof item.custom === 'boolean' ? { custom: item.custom } : {}),
    };
  }), 'cards');
  const reviewEntries = Object.entries(object(root.reviews, 'reviews'));
  if (reviewEntries.length > 50000) invalid('слишком много записей повторения.');
  const reviews: Record<string, ReviewState> = {};
  for (const [key, value] of reviewEntries) {
    const id = identifier(key, 'reviews.id');
    const item = object(value, `reviews.${id}`, ['ease', 'interval', 'repetitions', 'due', 'lastReviewed']);
    reviews[id] = {
      ease: numeric(item.ease, 'review.ease', 1.3, 100),
      interval: numeric(item.interval, 'review.interval', 1, 365000, true),
      repetitions: numeric(item.repetitions, 'review.repetitions', 0, 10000, true),
      due: date(item.due, 'review.due'),
      lastReviewed: date(item.lastReviewed, 'review.lastReviewed'),
    };
  }
  return {
    version: 1,
    attempts,
    cards,
    reviews,
    dailyGoal: numeric(root.dailyGoal, 'dailyGoal', 1, 1000, true),
  };
}

export function exportState(state: AppState): string {
  const json = JSON.stringify(state, null, 2);
  parseImport(json);
  return json;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB недоступна. Разрешите локальное хранилище в браузере; прогресс пока хранится только в памяти.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Не удалось открыть локальное хранилище. Проверьте настройки браузера.'));
    request.onblocked = () => reject(new Error('Обновление хранилища заблокировано другой вкладкой. Закройте её и повторите попытку.'));
  });
}

export async function loadState(): Promise<AppState> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
    let state: AppState;
    request.onsuccess = () => {
      try {
        state = request.result === undefined ? emptyState() : parseImport(JSON.stringify(request.result));
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };
    transaction.oncomplete = () => { db.close(); resolve(state); };
    transaction.onerror = () => { db.close(); reject(new Error('Не удалось прочитать сохранённый прогресс.')); };
    transaction.onabort = () => { db.close(); reject(new Error('Чтение прогресса прервано; существующие данные не изменены.')); };
  });
}

export async function saveState(state: AppState): Promise<void> {
  const checked = parseImport(JSON.stringify(state));
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(checked, STATE_KEY);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(new Error('Не удалось сохранить прогресс. Проверьте свободное место или экспортируйте данные.')); };
    transaction.onabort = () => { db.close(); reject(new Error('Сохранение прогресса прервано. Экспортируйте данные, чтобы не потерять изменения.')); };
  });
}
