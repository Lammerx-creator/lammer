export type ExerciseType = 'choice' | 'gap' | 'order' | 'translation' | 'correction' | 'transform' | 'audio';
export type TopicId = 'vorgang' | 'zustand' | 'modal' | 'zeitformen' | 'beruf';
export interface Exercise {
  id: string;
  topic: TopicId;
  level: 'B1' | 'B2' | 'C1';
  type: ExerciseType;
  prompt: string;
  sentence?: string;
  answers: string[];
  choices?: string[];
  tokens?: string[];
  audioText?: string;
  explanation: string;
  hint: string;
}
export interface Attempt {
  id: string;
  exerciseId: string;
  topic: TopicId;
  answer: string;
  correct: boolean;
  at: string;
}
export interface WordCard {
  id: string;
  de: string;
  ru: string;
  example: string;
  category: string;
  custom?: boolean;
}
export interface ReviewState {
  ease: number;
  interval: number;
  repetitions: number;
  due: string;
  lastReviewed: string;
}
export interface AppState {
  version: 1;
  attempts: Attempt[];
  cards: WordCard[];
  reviews: Record<string, ReviewState>;
  dailyGoal: number;
}
export interface TopicInfo {
  id: TopicId;
  title: string;
  subtitle: string;
  rule: string;
  formula: string;
  example: string;
  translation: string;
  detail: string;
}
