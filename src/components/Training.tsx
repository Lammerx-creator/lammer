import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, CircleHelp, Headphones, Lightbulb, RotateCcw, Volume2, X } from 'lucide-react';
import { exercises, topics } from '../data/exercises';
import { checkAnswer } from '../lib/checker';
import type { Attempt, ExerciseType, TopicId } from '../types';
const typeNames: Record<ExerciseType, string> = { choice: 'Выберите ответ', gap: 'Заполните пропуски', order: 'Соберите предложение', translation: 'Переведите на немецкий', correction: 'Исправьте ошибку', transform: 'Преобразуйте предложение', audio: 'Слушайте и отвечайте' };
export function Training({ initialId, initialTopic, onAttempt, onFinish }: { initialId?: string; initialTopic?: TopicId; onAttempt: (attempt: Attempt) => void; onFinish: () => void }) {
  const [topic, setTopic] = useState<TopicId | 'all'>(initialTopic ?? 'all');
  const [level, setLevel] = useState('all');
  const queue = useMemo(() => {
    const rank = { B1: 1, B2: 2, C1: 3 };
    const items = exercises.filter(e => (topic === 'all' || e.topic === topic) && (level === 'all' || e.level === level));
    return [...items].sort((a, b) => rank[a.level] - rank[b.level]);
  }, [topic, level]);
  const [index, setIndex] = useState(() => Math.max(0, queue.findIndex(e => e.id === initialId)));
  const [answer, setAnswer] = useState('');
  const [selectedTokens, setSelectedTokens] = useState<number[]>([]);
  const [manual, setManual] = useState(false);
  const [result, setResult] = useState<boolean | null>(null);
  const [hint, setHint] = useState(false);
  const [transcript, setTranscript] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [completed, setCompleted] = useState(false);
  const [sessionResults, setSessionResults] = useState({ total: 0, correct: 0 });
  const exercise = queue[index];
  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);
  const reset = () => { setAnswer(''); setSelectedTokens([]); setResult(null); setHint(false); setTranscript(false); setManual(false); setAudioError(''); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
  const filter = (newTopic: TopicId | 'all', newLevel: string) => { setTopic(newTopic); setLevel(newLevel); setIndex(0); setCompleted(false); setSessionResults({ total: 0, correct: 0 }); reset(); };
  const value = exercise?.type === 'order' && !manual ? selectedTokens.map(i => exercise.tokens![i]).join(' ') : answer;
  const submit = () => {
    if (!value.trim() || result !== null || !exercise) return;
    const checked = checkAnswer(value, exercise);
    setResult(checked.correct);
    setSessionResults(s => ({ total: s.total + 1, correct: s.correct + Number(checked.correct) }));
    onAttempt({ id: crypto.randomUUID(), exerciseId: exercise.id, topic: exercise.topic, answer: value.trim(), correct: checked.correct, at: new Date().toISOString() });
  };
  const next = () => { reset(); if (index + 1 >= queue.length) setCompleted(true); else setIndex(i => i + 1); };
  const speak = () => {
    setAudioError('');
    if (!('speechSynthesis' in window)) { setAudioError('Озвучивание недоступно в этом браузере. Откройте текст задания или используйте браузер с поддержкой SpeechSynthesis.'); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(exercise.audioText);
    utterance.lang = 'de-DE'; utterance.rate = 0.85;
    const voice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('de'));
    if (voice) utterance.voice = voice;
    utterance.onerror = event => { if (!['interrupted', 'canceled'].includes(event.error)) setAudioError('Не удалось воспроизвести немецкую речь. Проверьте установленные голоса или откройте текст задания.'); };
    window.speechSynthesis.speak(utterance);
  };
  return <div className="practice-page"><div className="page-heading"><div><p className="eyebrow">ОТ ПРАВИЛА К ПРИВЫЧКЕ</p><h1 className="page-title">Практика Passiv</h1><p className="page-subtitle">Понимайте конструкцию. Используйте её уверенно.</p></div><span className="badge">50 упражнений · B1–C1</span></div>
    <div className="practice-filters"><label>Тема<select className="field" value={topic} onChange={e => filter(e.target.value as TopicId | 'all', level)}><option value="all">Все темы · по возрастанию сложности</option>{topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label><label>Уровень<select className="field" value={level} onChange={e => filter(topic, e.target.value)}><option value="all">B1 → B2 → C1</option><option>B1</option><option>B2</option><option>C1</option></select></label></div>
    {completed ? <div className="panel session-complete"><span className="large-check"><CheckCircle2 size={42}/></span><p className="eyebrow">ПРАКТИКА ЗАВЕРШЕНА</p><h2>Ещё один шаг вперёд.</h2><p>В этой сессии: {sessionResults.correct} правильных из {sessionResults.total} проверенных ответов.</p><p className="muted">Пропущенные задания не засчитываются. Все проверенные ответы сохранены в вашей статистике.</p><div className="button-row"><button className="primary-button" onClick={onFinish}>Посмотреть результаты <ArrowRight size={17}/></button><button className="secondary-button" onClick={() => filter(topic, level)}>Начать ещё раз</button></div></div> : !exercise ? <div className="panel empty-state">В этой категории пока нет упражнений. Выберите другой фильтр.</div> : <div className="training-layout"><section className="panel exercise-panel"><div className="exercise-topline"><span className="mini-label">УПРАЖНЕНИЕ {index + 1} / {queue.length}</span><div><span className="badge">{exercise.level}</span><span className="muted small">{topics.find(t => t.id === exercise.topic)?.title}</span></div></div><div className="exercise-progress"><span style={{ width: `${index / queue.length * 100}%` }}/></div><span className="exercise-type">{typeNames[exercise.type]}</span><h2 className="exercise-prompt">{exercise.prompt}</h2>
      {exercise.sentence && <div className="source-sentence" lang={exercise.type === 'translation' ? 'ru' : 'de'}>{exercise.sentence}</div>}
      {exercise.type === 'audio' && <div className="audio-box"><button className="secondary-button" onClick={speak}><Volume2 size={19}/> Прослушать по-немецки</button><p className="muted small">Синтез речи браузера · голос может требовать интернет</p><button className="text-link" onClick={() => setTranscript(t => !t)}>{transcript ? 'Скрыть текст' : 'Показать текст, если звук недоступен'}</button>{transcript && <p lang="de">{exercise.audioText}</p>}{audioError && <p role="alert" className="feedback error">{audioError}</p>}</div>}
      <form onSubmit={e => { e.preventDefault(); submit(); }}>
      {exercise.choices ? <fieldset className="answer-choices" disabled={result !== null}><legend className="sr-only">Варианты ответа</legend>{exercise.choices.map((choice, i) => <label key={choice} className={`answer-choice ${answer === choice ? 'selected' : ''} ${result !== null && exercise.answers.includes(choice) ? 'correct-choice' : ''}`}><input type="radio" name="answer" value={choice} checked={answer === choice} onChange={() => setAnswer(choice)}/><span className="choice-letter">{String.fromCharCode(65 + i)}</span><span lang="de">{choice}</span>{answer === choice && <span className="radio-indicator"/>}</label>)}</fieldset> : exercise.type === 'order' && !manual ? <div className="sentence-builder"><span className="form-label">Ваше предложение</span><div className="built-sentence">{selectedTokens.length ? selectedTokens.map((tokenIndex, i) => <button key={`${tokenIndex}-${i}`} type="button" disabled={result !== null} onClick={() => setSelectedTokens(s => s.filter((_, j) => j !== i))}>{exercise.tokens![tokenIndex]} <X size={12}/></button>) : <span className="muted">Нажимайте на слова в нужном порядке</span>}</div><div className="token-bank">{exercise.tokens?.map((token, i) => <button type="button" key={i} disabled={selectedTokens.includes(i) || result !== null} onClick={() => setSelectedTokens(s => [...s, i])}>{token}</button>)}</div><button type="button" className="text-link" disabled={result !== null} onClick={() => { setAnswer(value); setManual(true); }}>Ввести предложение вручную</button></div> : <label className="answer-input-label"><span className="form-label">Ваш ответ на немецком</span><textarea className="field answer-input" autoComplete="off" spellCheck={false} lang="de" maxLength={2000} placeholder="Напишите предложение целиком…" value={answer} onChange={e => setAnswer(e.target.value)} disabled={result !== null}/></label>}
      {result === null && <div className="exercise-actions"><button type="button" className="ghost-button" onClick={() => setHint(h => !h)}><Lightbulb size={17}/> Подсказка</button><button className="primary-button" type="submit" disabled={!value.trim()}>Проверить ответ <ArrowRight size={17}/></button></div>}
      </form>
      {hint && <div className="hint-box"><Lightbulb size={17}/><p>{exercise.hint}</p></div>}
      {result !== null && <div className={`answer-feedback ${result ? 'is-correct' : 'is-incorrect'}`} role="status"><div className="feedback-heading">{result ? <CheckCircle2 size={23}/> : <CircleHelp size={23}/>}<strong>{result ? 'Всё верно. Weiter so!' : 'Разберёмся вместе'}</strong></div>{!result && <><p className="small">Один из допустимых ответов:</p><p className="reference-answer" lang="de">{exercise.answers[0]}</p></>}<p>{exercise.explanation}</p>{!result && exercise.answers.length > 1 && <details><summary>Другие допустимые варианты</summary>{exercise.answers.slice(1).map(a => <p key={a} lang="de">{a}</p>)}</details>}{!result && <p className="small checking-note">Проверка использует заданные эталоны. Свободный перевод может иметь другие верные варианты: при сомнении сравните структуру и смысл с объяснением.</p>}<button className="primary-button" onClick={next}>{index + 1 >= queue.length ? 'Завершить практику' : 'Следующее задание'} <ArrowRight size={17}/></button></div>}
      <div className="exercise-bottom"><span><Check size={13}/> {sessionResults.correct} верных в этой сессии</span>{result === null && <button className="text-link muted" onClick={next}>Пропустить <ChevronRight size={14}/></button>}</div>
    </section><aside className="practice-sidebar"><div className="panel compact-panel"><span className="stat-icon peach"><Lightbulb size={23}/></span><h3>Сначала смысл,<br/>потом форма.</h3><p>В Passiv важно действие или его результат. Кто выполняет действие — часто второстепенно.</p><div className="mini-formula">werden + Partizip II</div><p className="muted small">Не путайте <strong>worden</strong> в Perfekt Passiv и <strong>geworden</strong> у смыслового werden.</p></div><div className="practice-note"><CircleHelp size={17}/><p>Регистр, лишние пробелы и конечная точка не влияют на оценку. Умлауты и грамматика имеют значение.</p></div></aside></div>}
  </div>;
}
