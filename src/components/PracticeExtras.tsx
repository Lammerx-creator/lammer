import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, ChevronRight, Headphones, Mic, Plus, RotateCcw, Square, Volume2, X } from 'lucide-react';
import type { AppState, WordCard } from '../types';
import { nextReview } from '../lib/progress';
import { vocabulary } from '../data/vocabulary';
import './Extras.css';

function useGermanSpeech() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);
  function speak(text: string) {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setError('');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 0.85;
    const voice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('de') && v.localService)
      ?? window.speechSynthesis.getVoices().find(v => v.lang.startsWith('de'));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = event => {
      setSpeaking(false);
      if (event.error !== 'canceled' && event.error !== 'interrupted') setError('Озвучивание недоступно. Проверьте, установлен ли немецкий голос в настройках устройства.');
    };
    window.speechSynthesis.speak(utterance);
  }
  function stop() { if (supported) window.speechSynthesis.cancel(); setSpeaking(false); }
  return { supported, speaking, error, speak, stop };
}

export function Vocabulary({ state, onChange }: { state: AppState; onChange: (next: AppState) => void }) {
  const speech = useGermanSpeech();
  const [category, setCategory] = useState('Все слова');
  const [revealed, setRevealed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [de, setDe] = useState('');
  const [ru, setRu] = useState('');
  const [example, setExample] = useState('');
  const [notice, setNotice] = useState('');
  const cards = useMemo(() => Array.from(new Map([...vocabulary, ...state.cards].map(card => [card.id, card])).values()), [state.cards]);
  const categories = ['Все слова', ...new Set(cards.map(card => card.category))];
  const filtered = cards.filter(card => category === 'Все слова' || card.category === category);
  const now = Date.now();
  const due = filtered.filter(card => !state.reviews[card.id] || new Date(state.reviews[card.id].due).getTime() <= now);
  const current = due[0];
  const future = filtered.map(card => state.reviews[card.id]?.due).filter((date): date is string => !!date && new Date(date).getTime() > now).sort();
  useEffect(() => { setRevealed(false); speech.stop(); }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  function rate(quality: number) {
    if (!current) return;
    onChange({ ...state, reviews: { ...state.reviews, [current.id]: nextReview(state.reviews[current.id], quality) } });
    setRevealed(false);
    setNotice('Повторение сохранено. Следующая карточка готова.');
  }
  function addWord(event: React.FormEvent) {
    event.preventDefault();
    if (!de.trim() || !ru.trim()) return;
    const card: WordCard = { id: `custom-${crypto.randomUUID()}`, de: de.trim(), ru: ru.trim(), example: example.trim(), category: 'Мои слова', custom: true };
    onChange({ ...state, cards: [...state.cards, card] });
    setDe(''); setRu(''); setExample(''); setAdding(false); setCategory('Мои слова'); setNotice('Слово добавлено в вашу коллекцию.');
  }
  return <div className="extras-page">
    <div className="page-heading extras-heading"><div><p className="eyebrow">Слова, которые пригодятся</p><h1 className="page-title">Ваш профессиональный словарь</h1><p className="page-subtitle">B2 Beruf, бухгалтерия и работа. Повторяйте вовремя — запоминайте надолго.</p></div><button className="secondary-button" onClick={() => setAdding(value => !value)}><Plus size={17} /> Добавить слово</button></div>
    {adding && <form className="panel extras-word-form" onSubmit={addWord}>
      <div className="extras-heading"><h2 className="section-title">Новое слово</h2><button type="button" className="ghost-button" onClick={() => setAdding(false)} aria-label="Закрыть форму"><X size={18} /></button></div>
      <label className="form-label">На немецком<input className="field" value={de} onChange={e => setDe(e.target.value)} maxLength={200} placeholder="die Rechnung, -en" required /></label>
      <label className="form-label">Перевод<input className="field" value={ru} onChange={e => setRu(e.target.value)} maxLength={300} placeholder="счёт" required /></label>
      <label className="form-label">Пример — по желанию<input className="field" value={example} onChange={e => setExample(e.target.value)} maxLength={600} placeholder="Die Rechnung wird heute bezahlt." /></label>
      <button className="primary-button" type="submit"><Check size={17} /> Сохранить слово</button>
    </form>}
    <div className="tabs extras-tabs" role="group" aria-label="Категории слов">{categories.map(item => <button key={item} className={`tab ${category === item ? 'active' : ''}`} onClick={() => { setCategory(item); setNotice(''); }}>{item}</button>)}</div>
    <div className="extras-two-column">
      <section className="panel extras-flashcard">
        <div className="extras-heading"><span className="badge">Интервальное повторение</span><span className="muted">{due.length} к повторению</span></div>
        {current ? <>
          <div className="extras-card-body"><p className="mini-label">ВСПОМНИТЕ ПЕРЕВОД</p><h2 className="extras-word" lang="de">{current.de}</h2><span className="muted">{current.category}</span>
            {speech.supported && <button className="secondary-button" onClick={() => speech.speak(current.de)} aria-label="Озвучить слово"><Volume2 size={17} /> Прослушать</button>}
            {revealed && <div className="extras-answer"><p>{current.ru}</p>{current.example && <p lang="de" className="extras-example">{current.example}</p>}</div>}
          </div>
          {!revealed ? <button className="primary-button extras-wide" onClick={() => setRevealed(true)}>Показать перевод <ChevronRight size={17} /></button> : <div><p className="mini-label">НАСКОЛЬКО ЛЕГКО ВСПОМНИЛИ?</p><div className="extras-rating"><button className="secondary-button" onClick={() => rate(0)}>Не помню</button><button className="secondary-button" onClick={() => rate(3)}>Трудно</button><button className="secondary-button" onClick={() => rate(4)}>Хорошо</button><button className="primary-button" onClick={() => rate(5)}>Легко</button></div></div>}
        </> : <div className="empty-state"><div className="extras-done"><Check size={30} /></div><h2 className="section-title">На сегодня всё!</h2><p className="muted">Все карточки этой категории повторены.{future[0] && ` Следующее повторение: ${new Date(future[0]).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.`}</p><button className="secondary-button" onClick={() => setAdding(true)}><Plus size={17} /> Добавить своё слово</button></div>}
        {notice && <p className="extras-notice" role="status">{notice}</p>}{speech.error && <p className="feedback error" role="alert">{speech.error}</p>}
      </section>
      <aside className="panel extras-srs"><BookOpen size={23} /><h2 className="section-title">Меньше зубрёжки,<br />больше результата</h2><p className="muted">Алгоритм SM-2 планирует следующее повторение по вашей оценке. Знакомые слова возвращаются реже, сложные — уже завтра.</p><div className="extras-srs-stat"><strong>{cards.length}</strong><span>слов в коллекции</span></div><div className="extras-srs-stat"><strong>{Object.keys(state.reviews).filter(id => cards.some(card => card.id === id)).length}</strong><span>слов уже в работе</span></div><p className="muted extras-small">Карточки и интервалы сохраняются на этом устройстве. Резервную копию можно скачать в настройках.</p></aside>
    </div>
    <section className="panel"><div className="extras-heading"><h2 className="section-title">Коллекция слов</h2><span className="muted">{filtered.length} слов</span></div><div className="extras-word-list">{filtered.map(card => <details key={card.id}><summary><strong lang="de">{card.de}</strong><span>{card.category}</span></summary><p>{card.ru}</p>{card.example && <p lang="de" className="muted">{card.example}</p>}</details>)}</div></section>
  </div>;
}

const listeningTasks = [
  { title: 'Новый срок', category: 'Рабочая встреча', text: 'Guten Morgen, Frau Weber. Die Besprechung am Dienstag muss leider verschoben werden. Herr Klein ist bis Mittwoch auf einer Dienstreise. Der neue Termin ist Donnerstag um zehn Uhr im Konferenzraum. Bitte bringen Sie den aktuellen Monatsbericht mit.', question: 'Когда состоится перенесённая встреча?', choices: ['Во вторник в 10:00', 'В среду в 10:00', 'В четверг в 10:00'], correct: 2, explanation: '«Der neue Termin ist Donnerstag um zehn Uhr» — новая встреча в четверг в десять. Dienstreise — командировка, verschieben — переносить.' },
  { title: 'Входящий счёт', category: 'Finanzbuchhaltung', text: 'Die Rechnung der Firma Berger ist heute eingegangen. Leider fehlt die Bestellnummer. Bevor wir die Zahlung freigeben können, müssen wir die Lieferantin um eine korrigierte Rechnung bitten. Das Zahlungsziel beträgt vierzehn Tage nach Erhalt der korrekten Rechnung.', question: 'Почему оплату пока нельзя согласовать?', choices: ['В счёте нет номера заказа', 'У компании недостаточно средств', 'Срок оплаты уже истёк'], correct: 0, explanation: '«Leider fehlt die Bestellnummer» — отсутствует номер заказа. До согласования платежа нужно запросить исправленный счёт. Срок оплаты — 14 дней после его получения.' },
  { title: 'Расчёт зарплаты', category: 'Lohnbuchhaltung', text: 'Liebe Kolleginnen und Kollegen, bitte reichen Sie Ihre Arbeitszeitnachweise bis zum fünften November ein. Die Unterlagen werden für die Lohnabrechnung benötigt. Falls Sie Überstunden gemacht haben, lassen Sie diese vorher von Ihrer Teamleitung bestätigen. Die Gehälter werden wie üblich am letzten Werktag des Monats überwiesen.', question: 'Что нужно сделать со сверхурочными до подачи документов?', choices: ['Передать их внешнему бухгалтеру', 'Подтвердить у руководителя команды', 'Перенести их на следующий месяц'], correct: 1, explanation: '«Lassen Sie diese vorher von Ihrer Teamleitung bestätigen» — сначала подтвердите сверхурочные у руководителя команды. Рабочее время нужно подать до 5 ноября.' },
  { title: 'Годовой отчёт', category: 'Bilanzbuchhaltung', text: 'Für den Jahresabschluss müssen noch zwei Punkte geklärt werden. Erstens ist die Inventur für das Lager in Hamburg noch nicht abgeschlossen. Zweitens wurde eine Forderung als zweifelhaft eingestuft. Die zuständige Abteilung soll bis Freitag prüfen, ob eine Wertberichtigung erforderlich ist.', question: 'Что отдел должен выяснить до пятницы?', choices: ['Нужно ли открыть новый склад', 'Можно ли повысить выручку', 'Нужна ли корректировка стоимости дебиторской задолженности'], correct: 2, explanation: '«Ob eine Wertberichtigung erforderlich ist» — требуется ли корректировка стоимости. Forderung — дебиторская задолженность; zweifelhaft — сомнительная по взысканию.' },
];

export function Listening() {
  const speech = useGermanSpeech();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [transcript, setTranscript] = useState(false);
  const [played, setPlayed] = useState(false);
  const task = listeningTasks[index];
  function changeTask(next: number) { speech.stop(); setIndex(next); setSelected(null); setChecked(false); setTranscript(false); setPlayed(false); }
  return <div className="extras-page"><div className="page-heading"><p className="eyebrow">Немецкий на слух</p><h1 className="page-title">Слушайте. Понимайте. Действуйте.</h1><p className="page-subtitle">Четыре рабочие ситуации B2 Beruf с вопросами и разбором.</p></div>
    <div className="tabs extras-tabs" role="group" aria-label="Аудиозадания">{listeningTasks.map((item, i) => <button className={`tab ${index === i ? 'active' : ''}`} onClick={() => changeTask(i)} key={item.title}>{i + 1}. {item.title}</button>)}</div>
    <section className="panel extras-listening"><span className="badge">{task.category}</span><div className="extras-audio-art"><Headphones size={42} strokeWidth={1.5} /><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><h2 className="section-title">{task.title}</h2>
      {speech.supported ? <button className="primary-button" onClick={() => { if (speech.speaking) speech.stop(); else { speech.speak(task.text); setPlayed(true); } }}>{speech.speaking ? <Square size={17} /> : <Volume2 size={17} />}{speech.speaking ? 'Остановить' : played ? 'Прослушать ещё раз' : 'Прослушать сообщение'}</button> : <p className="feedback error">В этом браузере нет SpeechSynthesis. Можно прочитать текст и выполнить задание; для аудирования откройте приложение в поддерживаемом браузере.</p>}
      <p className="muted extras-small">Браузерная озвучка, скорость 0,85. Для офлайн-аудио нужен установленный немецкий голос.</p>{speech.error && <p className="feedback error" role="alert">{speech.error}</p>}
      <div className="extras-question"><h3>{task.question}</h3><div className="extras-choices">{task.choices.map((choice, i) => <button key={choice} className={`extras-choice ${selected === i ? 'selected' : ''} ${checked && i === task.correct ? 'correct' : ''} ${checked && selected === i && selected !== task.correct ? 'incorrect' : ''}`} onClick={() => setSelected(i)} disabled={checked}><span>{String.fromCharCode(65 + i)}</span>{choice}</button>)}</div>
      {!checked ? <button className="primary-button" disabled={selected === null} onClick={() => setChecked(true)}>Проверить ответ <ChevronRight size={17} /></button> : <div className={`feedback ${selected === task.correct ? 'success' : 'error'}`} role="status"><strong>{selected === task.correct ? 'Верно!' : 'Разберём ответ'}</strong><p>{task.explanation}</p><button className="secondary-button" onClick={() => changeTask((index + 1) % listeningTasks.length)}>Следующая ситуация <ChevronRight size={16} /></button></div>}</div>
      <button className="ghost-button" onClick={() => setTranscript(value => !value)}>{transcript ? 'Скрыть текст' : 'Показать текст сообщения'}</button>{transcript && <div className="extras-transcript" lang="de">{task.text}</div>}
    </section><p className="muted extras-small">Проверка в этом разделе выполняется в текущем сеансе. История грамматических упражнений сохраняется в статистике.</p>
  </div>;
}

interface RecognitionResult { isFinal: boolean; [index: number]: { transcript: string }; }
interface RecognitionEvent { resultIndex: number; results: { length: number; [index: number]: RecognitionResult }; }
interface BrowserRecognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognitionConstructor = new () => BrowserRecognition;
const speakingTasks = [
  { title: 'Представьте свой профессиональный опыт', format: 'Монолог · 2 минуты', prompt: 'Beschreiben Sie Ihre beruflichen Erfahrungen und Ihre wichtigsten Aufgaben.', steps: ['In welchem Bereich haben Sie gearbeitet?', 'Welche Aufgaben haben Sie übernommen?', 'Welche Fähigkeiten möchten Sie weiterentwickeln?'], hint: 'Опирайтесь на конкретный пример: должность → обязанности → достижение. Используйте «Ich war für … verantwortlich» и «Zu meinen Aufgaben gehörte …».', example: 'Ich habe drei Jahre in der Finanzbuchhaltung gearbeitet. Zu meinen Aufgaben gehörten die Prüfung von Eingangsrechnungen und die Abstimmung der Konten. Besonders wichtig war mir eine sorgfältige Arbeitsweise.' },
  { title: 'Решите проблему с поставкой', format: 'Диалог · 3 минуты', prompt: 'Eine wichtige Lieferung ist verspätet. Besprechen Sie mit Ihrer Kollegin oder Ihrem Kollegen, wie Sie vorgehen.', steps: ['Erklären Sie das Problem.', 'Schlagen Sie zwei mögliche Lösungen vor.', 'Einigen Sie sich auf einen nächsten Schritt.'], hint: 'Сыграйте обе роли или попросите собеседника. Предложение: «Wir könnten …»; мягкое возражение: «Das wäre möglich, allerdings …»; договорённость: «Dann halten wir fest, dass …».', example: 'Die Lieferung sollte gestern eintreffen, ist aber noch nicht angekommen. Wir könnten zunächst beim Lieferanten nachfragen. Falls die Ware erst nächste Woche geliefert wird, sollten wir eine Alternative prüfen.' },
  { title: 'Объясните бухгалтерский процесс', format: 'Монолог · 2 минуты', prompt: 'Erklären Sie einer neuen Kollegin, wie eine Eingangsrechnung in Ihrem Unternehmen bearbeitet wird.', steps: ['Beschreiben Sie die Prüfung der Rechnung.', 'Erklären Sie die Freigabe und Buchung.', 'Nennen Sie die Zahlungsfrist.'], hint: 'Используйте Passiv и последовательность действий: «Zunächst wird … geprüft. Anschließend wird … gebucht. Zum Schluss …». Не выдумывайте налоговые правила: описывайте учебную ситуацию.', example: 'Zunächst wird geprüft, ob die Rechnung vollständig ist. Danach wird sie mit der Bestellung abgeglichen. Sobald die Zahlung freigegeben worden ist, wird der Betrag innerhalb der vereinbarten Frist überwiesen.' },
  { title: 'Обсудите гибкий график', format: 'Диалог · 3 минуты', prompt: 'Sie möchten an zwei Tagen pro Woche im Homeoffice arbeiten. Besprechen Sie Ihren Vorschlag mit Ihrer Führungskraft.', steps: ['Begründen Sie Ihren Wunsch.', 'Erklären Sie, wie Sie erreichbar bleiben.', 'Reagieren Sie auf mögliche Bedenken.'], hint: 'Стройте аргумент с «weil» и «dadurch, dass». Вежливая просьба: «Wäre es möglich, …?». Предложите пробный период и способ оценить результат.', example: 'Wäre es möglich, an zwei Tagen pro Woche im Homeoffice zu arbeiten? Ich wäre während der üblichen Arbeitszeiten telefonisch erreichbar. Wir könnten das Modell zunächst vier Wochen lang ausprobieren und danach gemeinsam auswerten.' },
];

export function Speaking() {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordPending, setRecordPending] = useState(false);
  const [recordingName, setRecordingName] = useState('deutschtrainer-answer.webm');
  const [audioUrl, setAudioUrl] = useState('');
  const [error, setError] = useState('');
  const [showExample, setShowExample] = useState(false);
  const [checks, setChecks] = useState<boolean[]>([false, false, false]);
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const recognitionConstructor = typeof window === 'undefined' ? undefined : (window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: RecognitionConstructor }).webkitSpeechRecognition;
  const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const task = speakingTasks[index];
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; recognitionRef.current?.abort(); if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); streamRef.current?.getTracks().forEach(track => track.stop()); }; }, []);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  function startRecognition() {
    if (!recognitionConstructor) return;
    setError('');
    if (listening) { recognitionRef.current?.stop(); return; }
    const recognition = new recognitionConstructor();
    recognition.lang = 'de-DE'; recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = event => {
      let result = '';
      for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) result += event.results[i][0].transcript + ' ';
      if (mounted.current) setText(previous => `${previous}${previous ? ' ' : ''}${result}`.slice(0, 10000));
    };
    recognition.onerror = event => {
      if (!mounted.current) return;
      setListening(false);
      const messages: Record<string, string> = { 'not-allowed': 'Доступ к микрофону запрещён. Разрешите его в настройках браузера или введите ответ вручную.', 'audio-capture': 'Микрофон не найден. Можно ввести ответ вручную.', 'no-speech': 'Речь не обнаружена. Попробуйте ещё раз.', network: 'Сервис распознавания недоступен. Он может требовать интернет; используйте запись или ввод текста.' };
      setError(messages[event.error] ?? 'Не удалось распознать речь. Попробуйте запись или введите ответ вручную.');
    };
    recognition.onend = () => { if (mounted.current) setListening(false); };
    recognitionRef.current = recognition;
    try { recognition.start(); setListening(true); } catch { setError('Не удалось запустить распознавание. Попробуйте ещё раз или введите ответ вручную.'); }
  }
  async function toggleRecording() {
    setError('');
    if (recording) { recorderRef.current?.stop(); return; }
    if (recordPending) return;
    setRecordPending(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      setRecordingName(`deutschtrainer-answer.${recorder.mimeType.includes('mp4') ? 'm4a' : recorder.mimeType.includes('ogg') ? 'ogg' : 'webm'}`);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop()); streamRef.current = null;
        if (mounted.current) { setRecording(false); setAudioUrl(URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }))); }
      };
      recorder.onerror = () => { stream.getTracks().forEach(track => track.stop()); if (mounted.current) { setRecording(false); setError('Не удалось сохранить аудиозапись. Попробуйте ещё раз.'); } };
      recorderRef.current = recorder; recorder.start(); setRecording(true);
    } catch { streamRef.current?.getTracks().forEach(track => track.stop()); if (mounted.current) setError('Микрофон недоступен. Разрешите доступ в браузере или используйте текстовый ответ.'); } finally { if (mounted.current) setRecordPending(false); }
  }
  function changeTask(next: number) { if (listening || recording || recordPending) return; setIndex(next); setText(''); setChecks([false, false, false]); setShowExample(false); setAudioUrl(''); setError(''); }
  return <div className="extras-page"><div className="page-heading"><p className="eyebrow">От знания к свободной речи</p><h1 className="page-title">Скажите это по-немецки</h1><p className="page-subtitle">Практика монологов и диалогов в формате B2 Beruf. Без спешки и страха ошибиться.</p></div>
    <div className="tabs extras-tabs" role="group" aria-label="Темы разговорной практики">{speakingTasks.map((item, i) => <button key={item.title} disabled={listening || recording || recordPending} className={`tab ${index === i ? 'active' : ''}`} onClick={() => changeTask(i)}>{i + 1}. {['Опыт работы', 'Поставка', 'Бухгалтерия', 'Homeoffice'][i]}</button>)}</div>
    <div className="extras-two-column"><section className="panel"><span className="badge">{task.format}</span><h2 className="section-title extras-topic-title">{task.title}</h2><p className="extras-speaking-prompt" lang="de">{task.prompt}</p><ol className="extras-speaking-steps">{task.steps.map(step => <li lang="de" key={step}>{step}</li>)}</ol><div className="extras-hint"><strong>Как построить ответ</strong><p>{task.hint}</p></div>
      <label className="form-label" htmlFor="speaking-answer">Ваш ответ<textarea id="speaking-answer" className="field extras-textarea" lang="de" value={text} onChange={event => setText(event.target.value)} maxLength={10000} placeholder="Ich möchte über … sprechen." /></label>
      <div className="extras-mic-controls">{recognitionConstructor && <button className={listening ? 'primary-button' : 'secondary-button'} disabled={recording || recordPending} onClick={startRecognition}>{listening ? <Square size={17} /> : <Mic size={17} />}{listening ? 'Завершить распознавание' : 'Распознать речь'}</button>}{canRecord && <button className={recording ? 'primary-button' : 'secondary-button'} disabled={listening || recordPending} onClick={() => void toggleRecording()}>{recording ? <Square size={17} /> : <Mic size={17} />}{recordPending ? 'Подключение…' : recording ? 'Завершить запись' : 'Записать голос'}</button>}</div>
      {listening && <p className="extras-notice" role="status">Слушаю… Говорите по-немецки. Текст появится после окончания фразы.</p>}{recording && <p className="extras-notice" role="status">Идёт запись. Нажмите «Завершить запись», когда закончите.</p>}{error && <p className="feedback error" role="alert">{error}</p>}{audioUrl && <div className="extras-recording"><audio controls src={audioUrl} /><a className="ghost-button" href={audioUrl} download={recordingName}>Скачать запись</a></div>}
      {!recognitionConstructor && <p className="muted extras-small">Распознавание речи недоступно в этом браузере. {canRecord ? 'Запишите голос или ' : ''}Введите ответ вручную.</p>}<p className="muted extras-small">Распознавание может использовать сервис браузера и требовать интернет. Запись обрабатывается только на устройстве. Текст и аудио этого раздела не сохраняются после закрытия страницы.</p>
    </section><aside className="panel extras-self-review"><span className="badge">Честная обратная связь</span><h2 className="section-title">Проверьте себя</h2><p className="muted">Свободную речь нельзя надёжно оценить по эталону. Здесь — самооценка, без автоматического балла.</p>{['Я ответил(а) на все пункты задания', 'Привёл(а) конкретный пример', 'Проверил(а) порядок слов и формы глаголов'].map((item, i) => <label className="extras-check" key={item}><input type="checkbox" checked={checks[i]} onChange={() => setChecks(previous => previous.map((value, j) => j === i ? !value : value))} /><span>{item}</span></label>)}<button className="secondary-button extras-wide" onClick={() => setShowExample(value => !value)}><BookOpen size={17} />{showExample ? 'Скрыть пример' : 'Посмотреть пример ответа'}</button>{showExample && <div className="extras-transcript" lang="de">{task.example}<p className="muted extras-small" lang="ru">Это один из возможных вариантов, а не единственный правильный ответ.</p></div>}<button className="ghost-button" onClick={() => { setChecks([false, false, false]); setText(''); setAudioUrl(''); }} disabled={listening || recording || recordPending}><RotateCcw size={16} /> Начать ответ заново</button></aside></div>
  </div>;
}
