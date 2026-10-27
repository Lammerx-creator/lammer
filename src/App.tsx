import { PdfTrainer } from './components/PdfTrainer';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, LayoutDashboard, GraduationCap, ListChecks, Headphones, Mic, ChartNoAxesCombined, Settings2, ArrowUpRight, ArrowRight, Flame, Target, Check, Menu, X, WifiOff, CircleHelp, Leaf, ChevronRight, LoaderCircle } from 'lucide-react';
import type { AppState, Attempt, TopicId } from './types';
import { emptyState, getStats } from './lib/progress';
import { loadState, saveState } from './lib/storage';
import { exercises, topics } from './data/exercises';
import { Training } from './components/Training';
import { Grammar } from './components/Grammar';
import { Vocabulary, Listening, Speaking } from './components/PracticeExtras';
import { Statistics, DataSettings } from './components/ProgressPages';

type Page = 'pdf' | 'overview' | 'grammar' | 'practice' | 'vocabulary' | 'listening' | 'speaking' | 'stats' | 'settings';
const navigation: { id: Page; label: string; icon: typeof BookOpen; tag?: string }[] = [
  { id: 'pdf', label: 'B2 Beruf · PDF', icon: BookOpen, tag: 'NEW' },
  { id: 'overview', label: 'Обзор', icon: LayoutDashboard },
  { id: 'grammar', label: 'Грамматика', icon: BookOpen },
  { id: 'practice', label: 'Упражнения', icon: ListChecks, tag: '50' },
  { id: 'vocabulary', label: 'Мой словарь', icon: GraduationCap },
  { id: 'listening', label: 'Аудирование', icon: Headphones },
  { id: 'speaking', label: 'Разговорная практика', icon: Mic },
  { id: 'stats', label: 'Статистика', icon: ChartNoAxesCombined },
];

export default function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [page, setPage] = useState<Page>('pdf');
  const [mobileNav, setMobileNav] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState(0);
  const [initialExercise, setInitialExercise] = useState<string>();
  const [initialTopic, setInitialTopic] = useState<TopicId>();
  const saveQueue = useRef(Promise.resolve());
  const saveRevision = useRef(0);
  useEffect(() => {
    let active = true;
    loadState().then(value => { if (active) { setState(value); setLoaded(true); } })
      .catch(() => { if (active) setStorageError('Не удалось открыть локальные данные. Сейчас результаты не сохраняются. Разрешите хранение данных в браузере и перезагрузите страницу.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const revision = ++saveRevision.current;
    setSaving(true);
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => saveState(state)).then(() => {
      if (revision === saveRevision.current) { setSaving(false); setStorageError(''); }
    }).catch(() => { if (revision === saveRevision.current) { setSaving(false); setStorageError('Браузер не смог сохранить изменения. Результаты пока в памяти: экспортируйте JSON перед закрытием и проверьте свободное место.'); } });
  }, [state, loaded]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const navigate = (target: Page) => { setPage(target); setMobileNav(false); window.scrollTo({ top: 0 }); };
  const practice = (id?: string, topic?: TopicId) => { setInitialExercise(id); setInitialTopic(topic); setSession(v => v + 1); navigate('practice'); };
  const record = (attempt: Attempt) => setState(current => ({ ...current, attempts: [...current.attempts, attempt] }));
  const title = page === 'settings' ? 'Данные и настройки' : navigation.find(n => n.id === page)?.label;
  return <div className="app-shell">
    {mobileNav && <button className="nav-scrim" aria-label="Закрыть меню" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}>
      <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('overview'); }}><span className="brand-symbol">d<span>.</span></span><span>Deutsch<span className="brand-light">Trainer</span><small>DEUTSCH FÜR DEINEN WEG</small></span></a>
      <button className="icon-button nav-close" aria-label="Закрыть меню" onClick={() => setMobileNav(false)}><X size={22}/></button>
      <div className="workspace-label">ЛИЧНЫЙ КАБИНЕТ <span>PERSONAL</span></div>
      <nav aria-label="Основная навигация">{navigation.map(({ id, label, icon: Icon, tag }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => id === 'practice' ? practice() : navigate(id)} aria-current={page === id ? 'page' : undefined}><Icon size={19} strokeWidth={1.7}/><span>{label}</span>{tag && <small>{tag}</small>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="level-note"><span className="level-icon"><Leaf size={21}/></span><div><strong>Шаг за шагом к B2</strong><p>Немецкий для вашей карьеры</p></div><span className="tiny-dot"/></div><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings2 size={19}/><span>Данные и настройки</span></button><div className="local-note"><span className="tiny-dot"/> PDF и прогресс — в браузере</div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Открыть меню" onClick={() => setMobileNav(true)}><Menu size={22}/></button><span>Моё обучение</span><ChevronRight size={14}/><strong>{title}</strong></div><div className="topbar-right">{!online ? <span className="connection"><WifiOff size={14}/> Офлайн</span> : <span className="connection"><span className="tiny-dot"/> Личное пространство</span>}<span className="level-pill">B1 <span>→</span> C1</span><div className="avatar" aria-label="Личный профиль">Я</div></div></header>
      <main id="main-content">{storageError && <div className="storage-warning" role="alert">{storageError} <button onClick={() => navigate('settings')}>Экспортировать данные <ArrowUpRight size={13}/></button></div>}
        {!loaded && !storageError ? <div className="loading-state"><LoaderCircle className="spin"/> Открываем ваше пространство…</div> : <>
          {page === 'pdf' && <PdfTrainer/>}
          {page === 'overview' && <Dashboard state={state} onPractice={practice} onNavigate={navigate}/>}
          {page === 'grammar' && <Grammar onPractice={topic => practice(undefined, topic)}/>}
          {page === 'practice' && <Training key={session} initialId={initialExercise} initialTopic={initialTopic} onAttempt={record} onFinish={() => navigate('stats')}/>}
          {page === 'vocabulary' && <Vocabulary state={state} onChange={setState}/>}
          {page === 'listening' && <Listening/>}
          {page === 'speaking' && <Speaking/>}
          {page === 'stats' && <Statistics state={state} onPractice={id => practice(id)}/>}
          {page === 'settings' && <DataSettings state={state} onChange={setState}/>}
        </>}
        <footer className="page-footer"><span>DeutschTrainer <span className="footer-dot">·</span> Маленькие шаги. Большие возможности.</span><span>{page === 'pdf' ? 'PDF: локальное хранение в браузере' : storageError ? 'Хранение недоступно' : saving ? 'Сохраняем…' : loaded ? <><Check size={13}/> Сохранено на устройстве</> : 'Загрузка…'}</span></footer>
      </main>
    </div>
  </div>;
}

function Dashboard({ state, onPractice, onNavigate }: { state: AppState; onPractice: (id?: string, topic?: TopicId) => void; onNavigate: (page: Page) => void }) {
  const stats = getStats(state.attempts);
  const learned = new Set(state.attempts.filter(a => a.correct).map(a => a.exerciseId)).size;
  const goal = Math.min(100, Math.round(stats.today / state.dailyGoal * 100));
  const next = exercises.find(ex => !state.attempts.some(a => a.exerciseId === ex.id && a.correct));
  return <div className="dashboard">
    <div className="page-heading dashboard-heading"><div><p className="eyebrow">ВАШЕ ЛИЧНОЕ ПРОСТРАНСТВО ДЛЯ РОСТА</p><h1 className="page-title">Guten Tag! <span className="greeting-mark">✳</span></h1><p className="page-subtitle">Каждое занятие — ещё один шаг к уверенному немецкому.</p></div><span className="date-label">{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date())}</span></div>
    <div className="hero"><div className="hero-content"><span className="hero-eyebrow"><span/> DEUTSCH IM BERUF</span><h2>Немецкий, который<br/><em>работает на вас.</em></h2><p>От первого уверенного предложения<br className="desktop-break"/> до свободного общения в профессии.</p><button className="hero-button" onClick={() => onPractice(next?.id)}>Начать практику <ArrowUpRight size={19}/></button><div className="hero-meta"><span><Check size={13}/> В вашем темпе</span><span><Check size={13}/> Без лишней теории</span></div></div><HeroArt/></div>
    <div className="stats-row"><div className="stat-card"><span className="stat-icon green"><Target size={21}/></span><div><span className="stat-label">Точность ответов</span><strong>{stats.total ? `${stats.accuracy}%` : '—'}<small>{stats.total ? `из ${stats.total} ответов` : 'начните практику'}</small></strong></div></div><div className="stat-card"><span className="stat-icon peach"><Flame size={21}/></span><div><span className="stat-label">Серия занятий</span><strong>{stats.streak}<small>{dayWord(stats.streak)} подряд</small></strong></div></div><div className="stat-card"><span className="stat-icon lilac"><BookOpen size={21}/></span><div><span className="stat-label">Упражнений освоено</span><strong>{learned}<small>из 50 по Passiv</small></strong></div></div><div className="stat-card goal-card"><div className="goal-ring" style={{ background: `conic-gradient(var(--green) ${goal}%, #e8eeea ${goal}% 100%)` }}><span>{stats.today}/{state.dailyGoal}</span></div><div><span className="stat-label">Цель на сегодня</span><strong className="goal-text">{goal >= 100 ? 'Отличная работа!' : 'Немного каждый день'}</strong></div></div></div>
    <div className="dashboard-columns"><section className="learning-section"><div className="section-heading"><div><p className="eyebrow">ФОКУС ОБУЧЕНИЯ</p><h2 className="section-title">Разобраться с Passiv</h2></div><span className="badge">B1 — C1</span></div><p className="section-description">Пять тем, которые превратят правило в навык.</p><div className="topic-list">{topics.map((topic, i) => {
      const count = exercises.filter(e => e.topic === topic.id).length;
      const completed = new Set(state.attempts.filter(a => a.topic === topic.id && a.correct).map(a => a.exerciseId)).size;
      return <button className="topic-row" key={topic.id} onClick={() => onPractice(undefined, topic.id)}><span className={`topic-number ${completed === count ? 'complete' : ''}`}>{completed === count ? <Check size={19}/> : `0${i + 1}`}</span><span className="topic-copy"><strong>{topic.title}</strong><small>{topic.subtitle}</small></span><span className="topic-progress"><span>{completed}/{count}</span><i><b style={{ width: `${completed / count * 100}%` }}/></i></span><ChevronRight size={17}/></button>;
    })}</div><button className="text-link" onClick={() => onNavigate('grammar')}>Сначала познакомиться с правилом <ArrowRight size={15}/></button></section>
    <aside className="daily-column"><div className="word-of-day"><div className="section-heading"><span className="eyebrow">DEUTSCHER GEDANKE</span><span className="quote-icon">“</span></div><p className="german-quote">Übung macht<br/>den Meister.</p><p className="quote-translation">Мастерство приходит с практикой.</p><div className="word-divider"/><p className="word-note">Не нужно знать всё, чтобы начать.<br/>Достаточно сделать следующий шаг.</p><span className="little-flower">✳</span></div><div className="profession-card"><span className="profession-icon"><GraduationCap size={24}/></span><span className="mini-label">ЛЕКСИКА ДЛЯ РАБОТЫ</span><h3>Ваш следующий<br/>профессиональный шаг</h3><p>Финансы, собеседования и общение с коллегами.</p><button className="text-link" onClick={() => onNavigate('vocabulary')}>Открыть словарь <ArrowUpRight size={16}/></button></div></aside></div>
    <section className="skills-section"><div className="section-heading"><h2 className="section-title">Развивайте все навыки</h2><span className="muted small">Ваш немецкий — в реальных ситуациях</span></div><div className="skill-grid"><button className="skill-card" onClick={() => onNavigate('listening')}><span className="skill-icon peach"><Headphones size={24}/></span><div><h3>Слушать и понимать</h3><p>Рабочие ситуации на немецком</p></div><ArrowUpRight size={20}/></button><button className="skill-card" onClick={() => onNavigate('speaking')}><span className="skill-icon lilac"><Mic size={24}/></span><div><h3>Говорить увереннее</h3><p>Темы и монологи B2 Beruf</p></div><ArrowUpRight size={20}/></button></div></section>
  </div>;
}
function dayWord(value: number) { return value % 10 === 1 && value % 100 !== 11 ? 'день' : value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 12 || value % 100 > 14) ? 'дня' : 'дней'; }
function HeroArt() { return <div className="hero-art" aria-hidden="true"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><span className="art-star star-one">✳</span><span className="art-star star-two">✧</span><div className="floating-chip chip-top"><span>✓</span> Schritt für Schritt</div><div className="art-paper paper-back"/><div className="art-paper paper-front"><div className="paper-top"><span>DEUTSCH</span><span>B2</span></div><div className="paper-title">Dein nächstes<br/>Kapitel.</div><div className="paper-line long"/><div className="paper-line"/><div className="paper-line short"/><div className="paper-sticker">Du<br/>schaffst<br/>das! <ArrowUpRight size={20}/></div><div className="paper-bottom"><span>BERUF & ALLTAG</span><Leaf size={21}/></div></div><div className="floating-chip chip-bottom"><span className="chip-flag">🇩🇪</span> Mehr als nur Worte.</div><div className="art-dot dot-one"/><div className="art-dot dot-two"/></div>; }
