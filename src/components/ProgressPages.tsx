import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2, Download, Flame, History, RotateCcw, ShieldCheck, Target, Upload, X } from 'lucide-react';
import type { AppState, Attempt } from '../types';
import { exercises, topics } from '../data/exercises';
import { vocabulary } from '../data/vocabulary';
import { getStats } from '../lib/progress';
import { exportState, parseImport } from '../lib/storage';
import './ProgressPages.css';

function localKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function Statistics({ state, onPractice }: { state: AppState; onPractice: (id?: string) => void }) {
  const stats = getStats(state.attempts);
  const [visibleErrors, setVisibleErrors] = useState(8);
  const knownIds = new Set(exercises.map(exercise => exercise.id));
  const learnedIds = new Set(state.attempts.filter(attempt => attempt.correct && knownIds.has(attempt.exerciseId)).map(attempt => attempt.exerciseId));
  const latestByExercise = new Map<string, Attempt>();
  for (const attempt of [...state.attempts].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())) latestByExercise.set(attempt.exerciseId, attempt);
  const errors = state.attempts.filter(attempt => !attempt.correct).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const unresolved = [...latestByExercise.values()].filter(attempt => !attempt.correct && knownIds.has(attempt.exerciseId));
  const weakTopic = [...topics].filter(topic => stats.byTopic[topic.id].total > 0).sort((a, b) => stats.byTopic[a.id].accuracy - stats.byTopic[b.id].accuracy)[0];
  const nextExercise = unresolved[0]?.exerciseId
    ?? exercises.find(exercise => exercise.topic === weakTopic?.id && !learnedIds.has(exercise.id))?.id
    ?? exercises.find(exercise => !learnedIds.has(exercise.id))?.id;
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - 6 + index);
    const total = state.attempts.filter(attempt => localKey(new Date(attempt.at)) === localKey(date) && new Date(attempt.at).getTime() <= today.getTime()).length;
    return { date, total };
  });
  const maxDay = Math.max(state.dailyGoal, ...days.map(day => day.total));
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);
  const cardIds = new Set([...vocabulary, ...state.cards].map(card => card.id));
  const dueTomorrow = Object.entries(state.reviews).filter(([id, review]) => cardIds.has(id) && new Date(review.due).getTime() <= tomorrow.getTime()).length;

  return <div className="progress-pages">
    <div className="page-heading"><div><p className="eyebrow">КАЖДЫЙ ШАГ ИМЕЕТ ЗНАЧЕНИЕ</p><h1 className="page-title">Ваш прогресс</h1><p className="page-subtitle">Результаты практики Passiv, сильные стороны и следующий шаг.</p></div><button className="primary-button" onClick={() => onPractice(nextExercise)}>Продолжить практику <ArrowRight size={17} /></button></div>
    <div className="pstats-metrics">
      <div className="panel pstats-metric"><span className="pstats-metric-icon"><Target size={21} /></span><span className="muted">Правильных ответов</span><strong>{stats.total ? `${stats.accuracy}%` : '—'}</strong><small>{stats.correct} из {stats.total} попыток</small></div>
      <div className="panel pstats-metric"><span className="pstats-metric-icon pstats-warm"><Flame size={21} /></span><span className="muted">Серия занятий</span><strong>{stats.streak}</strong><small>дней подряд · сегодня или до вчера</small></div>
      <div className="panel pstats-metric"><span className="pstats-metric-icon pstats-lilac"><BookOpen size={21} /></span><span className="muted">Упражнений освоено</span><strong>{learnedIds.size}<span> / {exercises.length}</span></strong><small>хотя бы один верный ответ</small></div>
      <div className="panel pstats-metric"><span className="pstats-metric-icon"><CalendarDays size={21} /></span><span className="muted">Активных дней</span><strong>{stats.activeDays}</strong><small>за всё время обучения</small></div>
    </div>
    {!stats.total && <section className="panel pstats-start"><div className="pstats-start-icon"><Target size={25} /></div><div><h2 className="section-title">Здесь начнётся ваша история</h2><p className="muted">Выполните первое упражнение — появятся точность, прогресс по темам и персональные рекомендации.</p></div><button className="secondary-button" onClick={() => onPractice()}>Первое упражнение <ArrowRight size={16} /></button></section>}
    <div className="pstats-columns">
      <section className="panel pstats-topic-panel"><div className="pstats-heading"><h2 className="section-title">Passiv: прогресс по темам</h2><span className="badge">{learnedIds.size}/{exercises.length}</span></div><p className="muted pstats-description">Прогресс — число разных заданий с верным ответом. Точность учитывает все попытки.</p><div className="pstats-topics">{topics.map(topic => {
        const topicExercises = exercises.filter(exercise => exercise.topic === topic.id);
        const done = topicExercises.filter(exercise => learnedIds.has(exercise.id)).length;
        const topicStats = stats.byTopic[topic.id];
        const progress = topicExercises.length ? Math.round(done / topicExercises.length * 100) : 0;
        return <div key={topic.id} className="pstats-topic"><div><strong>{topic.title}</strong><span>{done}/{topicExercises.length}</span></div><div className="progress-track" role="progressbar" aria-label={`Освоено заданий: ${topic.title}`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div><small className="muted">{topicStats.total ? `${topicStats.accuracy}% точность · ${topicStats.total} попыток` : 'Ещё не практиковали'}</small></div>;
      })}</div></section>
      <section className="panel pstats-activity"><div className="pstats-heading"><h2 className="section-title">Ваш ритм</h2><span className="badge">7 дней</span></div><p className="muted pstats-description">Сегодня: {stats.today} из {state.dailyGoal} упражнений.</p><div className="pstats-chart" aria-label="Количество выполненных упражнений за последние семь дней">{days.map(({ date, total }, index) => <div className={`pstats-day ${index === 6 ? 'pstats-day-today' : ''}`} key={date.toISOString()}><span className="pstats-bar-value">{total}</span><div className="pstats-bar-space"><div className="pstats-bar" style={{ height: `${total / maxDay * 100}%` }} /></div><span>{date.toLocaleDateString('ru-RU', { weekday: 'short' })}</span><small>{date.getDate()}</small></div>)}</div><p className="muted pstats-chart-note">Небольшие регулярные занятия полезнее редких марафонов.</p></section>
    </div>
    <section className="panel pstats-plan"><div className="pstats-heading"><h2 className="section-title">План на завтра</h2><span className="badge">{tomorrow.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span></div><div className="pstats-plan-items"><div><span className="pstats-plan-number">01</span><div><strong>{weakTopic ? `Закрепить ${weakTopic.title}` : 'Познакомиться с Vorgangspassiv'}</strong><p className="muted">{weakTopic ? `В этой теме ваша точность ${stats.byTopic[weakTopic.id].accuracy}%. Начните с правила, затем выполните несколько заданий.` : 'Начните с простого: werden + Partizip II. Двигайтесь к сложным временам в своём темпе.'}</p></div></div><div><span className="pstats-plan-number">02</span><div><strong>{unresolved.length ? `Вернуться к ошибкам: ${unresolved.length}` : 'Сохранить ежедневный ритм'}</strong><p className="muted">{unresolved.length ? 'Это задания, в которых последняя попытка была неверной. Разберите объяснение и попробуйте снова.' : `Ваша цель — ${state.dailyGoal} упражнений в день. Её можно изменить в настройках.`}</p></div></div><div><span className="pstats-plan-number">03</span><div><strong>{dueTomorrow ? `Повторить карточки: ${dueTomorrow}` : 'Заглянуть в профессиональный словарь'}</strong><p className="muted">{dueTomorrow ? 'Столько изучаемых слов нужно повторить к концу завтрашнего дня, включая уже просроченные.' : 'Для изученных карточек повторений пока нет. Можно добавить новые слова B2 Beruf.'}</p></div></div></div><button className="secondary-button" onClick={() => onPractice(nextExercise)}>Перейти к практике <ArrowRight size={16} /></button></section>
    <section className="panel pstats-errors"><div className="pstats-heading"><h2 className="section-title"><History size={20} /> История ошибок</h2><span className="badge">{errors.length}</span></div>{errors.length === 0 ? <div className="empty-state"><CheckCircle2 size={30} /><h3>{stats.total ? 'Пока без ошибок' : 'История пока пуста'}</h3><p className="muted">Здесь будут ваши ответы, эталоны и объяснения. Ошибки помогают понять, что повторить.</p></div> : <><div className="pstats-error-list">{errors.slice(0, visibleErrors).map(attempt => {
      const exercise = exercises.find(item => item.id === attempt.exerciseId);
      const resolved = latestByExercise.get(attempt.exerciseId)?.correct;
      return <details className="pstats-error" key={attempt.id}><summary><span><strong>{exercise?.prompt ?? `Задание ${attempt.exerciseId}`}</strong><small>{formatTime(attempt.at)}{resolved ? ' · после этого исправлено' : ''}</small></span><span className={resolved ? 'pstats-error-resolved' : 'pstats-error-mark'}>{resolved ? <Check size={17} /> : <RotateCcw size={17} />}</span></summary><div className="pstats-error-detail">{exercise?.sentence && <p lang="de" className="pstats-error-sentence">{exercise.sentence}</p>}<div className="pstats-answer-block"><span className="mini-label">ВАШ ОТВЕТ</span><p>{attempt.answer || 'Пустой ответ'}</p></div>{exercise ? <><div className="pstats-answer-block pstats-answer-correct"><span className="mini-label">ЭТАЛОННЫЙ ВАРИАНТ</span><p lang="de">{exercise.answers[0]}</p></div><p className="pstats-explanation">{exercise.explanation}</p><button className="secondary-button" onClick={() => onPractice(exercise.id)}><RotateCcw size={15} /> Попробовать ещё раз</button></> : <p className="muted">Это задание из другого набора данных. Его эталон недоступен в текущей версии.</p>}</div></details>;
    })}</div>{visibleErrors < errors.length && <button className="ghost-button pstats-show-more" onClick={() => setVisibleErrors(count => count + 8)}>Показать ещё ({errors.length - visibleErrors})</button>}</>}</section>
  </div>;
}

export function DataSettings({ state, onChange }: { state: AppState; onChange: (next: AppState) => void }) {
  const [goal, setGoal] = useState(String(state.dailyGoal));
  const [pending, setPending] = useState<AppState | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setGoal(String(state.dailyGoal)), [state.dailyGoal]);

  function download() {
    setError('');
    try {
      const json = exportState(state);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `deutschtrainer-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      setNotice('Файл подготовлен к скачиванию. Сохраните его в надёжном месте.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось подготовить резервную копию.');
    }
  }

  async function readFile(file: File | undefined) {
    setError(''); setNotice(''); setPending(null); setFileName('');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Файл превышает ограничение 5 МиБ. Выберите резервную копию DeutschTrainer меньшего размера.'); return; }
    setBusy(true);
    try {
      const parsed = parseImport(await file.text());
      setPending(parsed);
      setFileName(file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось прочитать файл. Текущие данные не изменены.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function confirmImport() {
    if (!pending) return;
    onChange(pending);
    setPending(null); setFileName(''); setError('');
    setNotice('Данные из резервной копии загружены. Статус сохранения на устройстве отображается внизу страницы.');
  }

  function saveGoal(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(goal);
    if (!Number.isInteger(value) || value < 1 || value > 100) { setError('Выберите целую ежедневную цель от 1 до 100 упражнений.'); return; }
    onChange({ ...state, dailyGoal: value });
    setError(''); setNotice('Ежедневная цель обновлена.');
  }

  return <div className="progress-pages data-settings">
    <div className="page-heading"><div><p className="eyebrow">ВАШЕ ОБУЧЕНИЕ — В ВАШИХ РУКАХ</p><h1 className="page-title">Данные и настройки</h1><p className="page-subtitle">Настройте свой темп и позаботьтесь о резервной копии.</p></div></div>
    {error && <p className="feedback error" role="alert">{error}</p>}{notice && <p className="feedback success" role="status">{notice}</p>}
    <div className="data-settings-columns">
      <section className="panel data-goal"><span className="pstats-metric-icon"><Target size={23} /></span><h2 className="section-title">Небольшая цель каждый день</h2><p className="muted">Считаем выполненные упражнения Passiv. Любая попытка — шаг вперёд, даже если ответ оказался неверным.</p><form onSubmit={saveGoal}><label className="form-label" htmlFor="daily-goal">Упражнений в день</label><div className="data-goal-control"><input id="daily-goal" className="field" type="number" min={1} max={100} step={1} inputMode="numeric" value={goal} onChange={event => setGoal(event.target.value)} required /><button className="primary-button" type="submit">Сохранить <Check size={16} /></button></div></form><div className="data-goal-presets" role="group" aria-label="Быстрый выбор ежедневной цели">{[5, 10, 15, 20].map(value => <button key={value} className={`secondary-button ${Number(goal) === value ? 'data-preset-active' : ''}`} onClick={() => setGoal(String(value))}>{value}</button>)}</div></section>
      <aside className="panel data-privacy"><ShieldCheck size={28} /><h2 className="section-title">Личное пространство</h2><p>Прогресс и ваши слова хранятся локально в IndexedDB этого браузера. Учётная запись и платные сервисы не нужны.</p><p className="muted">Очистка данных сайта или смена устройства может удалить прогресс. Скачивайте JSON регулярно и перед переустановкой браузера.</p><div className="data-storage-counts"><span><strong>{state.attempts.length}</strong> попыток</span><span><strong>{state.cards.length}</strong> своих слов</span><span><strong>{Object.keys(state.reviews).length}</strong> интервалов</span></div></aside>
    </div>
    <section className="panel data-backup"><div className="pstats-heading"><h2 className="section-title">Резервная копия</h2><span className="badge">JSON · версия 1</span></div><p className="muted">Один файл содержит историю ответов, ваши слова, расписание повторений и ежедневную цель. Встроенный словарь поставляется вместе с приложением.</p><div className="data-backup-actions"><button className="primary-button" onClick={download}><Download size={18} /> Скачать резервную копию</button><button className="secondary-button" onClick={() => inputRef.current?.click()} disabled={busy}><Upload size={18} /> {busy ? 'Проверяем файл…' : 'Импортировать JSON'}</button><input ref={inputRef} type="file" accept=".json,application/json" onChange={event => void readFile(event.target.files?.[0])} className="data-file-input" aria-label="Выбрать резервную копию JSON" /></div><p className="muted data-small">До 5 МиБ. Файл проверяется целиком; при ошибке текущие данные остаются без изменений.</p>
      {pending && <div className="data-import-preview" role="region" aria-label="Предварительный просмотр импорта"><div className="pstats-heading"><h3>Проверьте перед восстановлением</h3><button className="ghost-button" aria-label="Отменить импорт" onClick={() => { setPending(null); setFileName(''); }}><X size={19} /></button></div><p className="data-import-name">{fileName}</p><div className="data-storage-counts"><span><strong>{pending.attempts.length}</strong> попыток</span><span><strong>{pending.cards.length}</strong> своих слов</span><span><strong>{Object.keys(pending.reviews).length}</strong> интервалов</span><span><strong>{pending.dailyGoal}</strong> цель в день</span></div><p>Импорт полностью заменит текущие локальные данные. Объединение историй не выполняется.</p><p className="muted">Перед заменой рекомендуем скачать резервную копию текущего прогресса.</p><div className="data-backup-actions"><button className="secondary-button" onClick={download}><Download size={16} /> Сначала скачать текущие данные</button><button className="primary-button" onClick={confirmImport}>Заменить данные из файла <Check size={16} /></button><button className="ghost-button" onClick={() => { setPending(null); setFileName(''); }}>Отмена</button></div></div>}
    </section>
    <section className="panel data-offline"><h2 className="section-title">Обучение без интернета</h2><p className="muted">После первой полной загрузки производственной сборки приложение сохраняет интерфейс и материалы для офлайн-работы. На iPhone можно добавить его на экран «Домой» через меню «Поделиться» в Safari.</p><p className="muted">Озвучивание офлайн зависит от установленного немецкого голоса. Распознавание речи может требовать соединения и отправлять звук сервису браузера — перед запуском запрашивается ваше согласие.</p></section>
  </div>;
}
