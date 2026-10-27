import {openDB,type DBSchema,type IDBPDatabase} from 'idb';
import {known} from './lexicon';
import {validateBackup} from './transfer';
import {normalize,tokenize,textHash,safeContext,digest,extractPdf} from './extraction';
import {modes,type Attempt,type Backup,type Context,type Document,type Filter,type Fragment,type Mode,type Page,type Progress,type Quiz,type Result,type Source,type Stats,type StoredDocument,type StoredQuiz,type Version,type Word,type WordFragment} from './model';
interface TrainerDB extends DBSchema {
 documents:{key:string;value:StoredDocument};
 pages:{key:string;value:Page&{id:string;doc:string}};
 fragments:{key:string;value:Fragment};
 sources:{key:string;value:Source;indexes:{fragment:string;doc:string}};
 words:{key:string;value:Word};
 wordFragments:{key:string;value:WordFragment;indexes:{word:string}};
 progress:{key:string;value:Progress};
 attempts:{key:string;value:Attempt};
 quizzes:{key:string;value:StoredQuiz};
}
export const answerKey=(s:string)=>normalize(s).toLocaleLowerCase('de').replace(/[.!?]+$/,'');
export function schedule(previous:Progress|undefined,grade:number,word:string,now=Date.now()):Progress{
 const old=previous||{reps:0,interval:0,ease:2.5};
 const reps=grade<3?0:Math.min(10000,old.reps+1);
 const interval=grade<3?1:reps===1?1:reps===2?6:Math.min(1000000,Math.max(1,Math.round(old.interval*old.ease)));
 const ease=Math.max(1.3,Math.min(10,old.ease+.1-(5-grade)*(.08+(5-grade)*.02)));
 return {word,reps,interval,ease,due:now+interval*86400000};
}
export function createBrowserStore(name='deutschtrainer-pdf-v1'){
 let pending:Promise<IDBPDatabase<TrainerDB>>|undefined;
 const database=()=>{
  if(typeof indexedDB==='undefined')return Promise.reject(new Error('Локальное хранилище недоступно. Разрешите хранение данных сайта в браузере.'));
  pending??=openDB<TrainerDB>(name,1,{upgrade(db){
   for(const store of ['documents','pages','fragments','words','quizzes'] as const)db.createObjectStore(store,{keyPath:'id'});
   const sources=db.createObjectStore('sources',{keyPath:'id'});sources.createIndex('fragment','fragment');sources.createIndex('doc','doc');
   const links=db.createObjectStore('wordFragments',{keyPath:'id'});links.createIndex('word','word');
   db.createObjectStore('progress',{keyPath:'word'});db.createObjectStore('attempts',{keyPath:'id'});
  },blocking(){void pending?.then(db=>db.close());pending=undefined;}}).catch(e=>{pending=undefined;throw e;});
  return pending;
 };
 async function documents():Promise<Document[]>{return (await(await database()).getAll('documents')).map(({blob:_,...doc})=>doc);}
 async function importPages(id:string,name:string,version:Version,pages:Page[],blob:Blob){
  if(!['questions','answers'].includes(version))throw new Error('Выберите версию PDF.');
  const uniqueTexts=[...new Set(pages.flatMap(p=>p.fragments).map(normalize))];
  const ids=new Map(await Promise.all(uniqueTexts.map(async text=>[text,await textHash(text)] as const)));
  const db=await database();
  const tx=db.transaction(['documents','pages','fragments','sources','words','wordFragments'],'readwrite');
  try{
   const old=await tx.objectStore('documents').get(id);
   if(old){if(old.version!==version)throw new Error('Этот PDF уже импортирован с другой версией. Метка сохранена без изменений.');await tx.done;return {id,duplicate:true,pages:old.pages};}
   const [keys,existingWords]=await Promise.all([tx.objectStore('fragments').getAllKeys(),tx.objectStore('words').getAll()]);
   const fragments=new Set(keys);const words=new Map(existingWords.map(w=>[w.id,w]));const changed=new Set<string>();
   await tx.objectStore('documents').add({id,name,version,pages:pages.length,blob});
   const writes:Promise<unknown>[]=[];
   for(const page of pages){
    writes.push(tx.objectStore('pages').put({...page,id:`${id}:${page.number}`,doc:id}));
    for(const [ordinal,raw] of page.fragments.entries()){
     const text=normalize(raw),fragment=ids.get(text)!;
     writes.push(tx.objectStore('sources').put({id:`${id}:${page.number}:${ordinal}`,fragment,doc:id,page:page.number,ordinal,section:page.section}));
     if(fragments.has(fragment))continue;
     fragments.add(fragment);writes.push(tx.objectStore('fragments').put({id:fragment,text,safe:safeContext(text)}));
     const grouped=new Map<string,{lemma:string;entry:Omit<Word,'id'|'frequency'>|undefined;forms:string[];count:number}>();
     for(const form of tokenize(text)){
      const entry=known.get(form.toLocaleLowerCase('de'));const lemma=entry?.lemma||form;const key=lemma.toLocaleLowerCase('de');
      if(!grouped.has(key))grouped.set(key,{lemma,entry,forms:[],count:0});
      const group=grouped.get(key)!;group.count++;if(!group.forms.includes(form))group.forms.push(form);
     }
     for(const [word,g] of grouped){
      if(!words.has(word))words.set(word,{id:word,lemma:g.lemma,pos:'unknown',article:'',plural:'',verbForms:'',translation:'',review:1,difficulty:'unrated',note:'Кандидат: лемма, грамматика и перевод требуют проверки. Формы автоматически не объединены.',...g.entry,frequency:0});
      const value=words.get(word)!;value.frequency+=g.count;changed.add(word);
      writes.push(tx.objectStore('wordFragments').put({id:word+'\u0000'+fragment,word,fragment,forms:g.forms,count:g.count}));
     }
    }
   }
   for(const key of changed)writes.push(tx.objectStore('words').put(words.get(key)!));
   await Promise.all(writes);await tx.done;
   return {id,duplicate:false,pages:pages.length};
  }catch(e){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw e;}
 }
 async function importPdf(file:File,version:Version,onProgress?:(message:string)=>void){
  if(file.size>20*1024*1024)throw new Error('PDF превышает 20 МБ.');
  const id=await digest(await file.arrayBuffer());const old=await(await database()).get('documents',id);
  if(old){if(old.version!==version)throw new Error('Этот PDF уже импортирован с другой версией.');return {id,duplicate:true,pages:old.pages};}
  const pages=await extractPdf(file,onProgress);onProgress?.('Сохраняем словарь и источники на устройстве…');
  const result=await importPages(id,file.name,version,pages,file);
  // Storage persistence is a browser decision, not a prerequisite to a successful atomic import.
  if(typeof navigator!=='undefined')void navigator.storage?.persist?.().catch(()=>{});
  return result;
 }
 async function contexts(word:string,safeOnly=false):Promise<Context[]>{
  const db=await database();const links=await db.getAllFromIndex('wordFragments','word',word);
  const result:Context[]=[];
  for(const link of links){
   const fragment=await db.get('fragments',link.fragment);if(!fragment||(safeOnly&&!fragment.safe))continue;
   const sources=await db.getAllFromIndex('sources','fragment',link.fragment);
   for(const source of sources){
    const doc=await db.get('documents',source.doc);if(!doc||(safeOnly&&doc.version!=='questions'))continue;
    result.push({text:fragment.text,forms:link.forms,name:doc.name,version:doc.version,doc:doc.id,page:source.page,section:source.section});
   }
  }
  return result.sort((a,b)=>a.page-b.page).slice(0,300);
 }
 async function listWords(filter:Filter={}){
  const db=await database();const [all,progress,links,sources]=await Promise.all([db.getAll('words'),db.getAll('progress'),filter.section?db.getAll('wordFragments'):[],filter.section?db.getAll('sources'):[]]);
  const fragments=new Set(sources.filter(s=>s.section===filter.section).map(s=>s.fragment));
  const included=new Set(links.filter(l=>fragments.has(l.fragment)).map(l=>l.word));
  const query=(filter.q||'').toLocaleLowerCase('de');
  const filtered=all.filter(w=>w.frequency>=(filter.min||1)&&(!filter.difficulty||w.difficulty===filter.difficulty)&&(!filter.section||included.has(w.id))&&(!query||w.lemma.toLocaleLowerCase('de').includes(query)||w.translation.toLocaleLowerCase('ru').includes(query))).sort((a,b)=>b.frequency-a.frequency||a.id.localeCompare(b.id,'de'));
  const reviews=new Map(progress.map(p=>[p.word,p]));const start=filter.offset||0;
  return {total:filtered.length,words:filtered.slice(start,start+60).map(w=>({...w,reps:reviews.get(w.id)?.reps,due:reviews.get(w.id)?.due}))};
 }
 async function detail(id:string){const word=await(await database()).get('words',id);if(!word)throw new Error('Слово не найдено.');return {...word,contexts:await contexts(id)};}
 async function saveWord(input:Word){
  const fields=['lemma','pos','article','plural','verbForms','translation','difficulty','note'] as const;
  for(const field of fields)if(typeof input[field]!=='string'||input[field].length>2000)throw new Error('Некорректные поля словарной статьи.');
  if(!['noun','verb','adjective','adverb','other','unknown'].includes(input.pos)||!['','der','die','das'].includes(input.article)||!['A1','A2','B1','B2','C1','C2','unrated'].includes(input.difficulty))throw new Error('Некорректная грамматическая категория.');
  const tx=(await database()).transaction('words','readwrite');const word=await tx.store.get(input.id);
  if(!word){tx.abort();await tx.done.catch(()=>{});throw new Error('Слово не найдено.');}
  for(const field of fields)word[field]=input[field];word.review=input.review?1:0;
  await tx.store.put(word);await tx.done;return {ok:true};
 }
 async function newQuiz(filter:Filter&{mode?:Mode}):Promise<Quiz|{empty:true;message:string}>{
  const mode=filter.mode||'cloze';if(!modes.includes(mode))throw new Error('Неизвестный режим.');
  const db=await database();const tx=db.transaction(['words','progress','fragments','sources','wordFragments','documents']);
  const [words,progress,fragments,sources,links,docs]=await Promise.all([tx.objectStore('words').getAll(),tx.objectStore('progress').getAll(),tx.objectStore('fragments').getAll(),tx.objectStore('sources').getAll(),tx.objectStore('wordFragments').getAll(),tx.objectStore('documents').getAll()]);await tx.done;
  const reviews=new Map(progress.map(p=>[p.word,p]));const fs=new Map(fragments.filter(f=>f.safe).map(f=>[f.id,f]));const ds=new Map(docs.map(d=>[d.id,d]));
  const safeSources=new Map<string,Source[]>();
  for(const s of sources)if(ds.get(s.doc)?.version==='questions'&&(!filter.section||s.section===filter.section)&&fs.has(s.fragment)){if(!safeSources.has(s.fragment))safeSources.set(s.fragment,[]);safeSources.get(s.fragment)!.push(s);}
  const available=new Map<string,WordFragment[]>();
  for(const link of links)if(safeSources.has(link.fragment)&&(!['input','cloze','grammar'].includes(mode)||new Set(link.forms.map(answerKey)).size===1)){if(!available.has(link.word))available.set(link.word,[]);available.get(link.word)!.push(link);}
  const candidates=words.filter(w=>(!reviews.has(w.id)||reviews.get(w.id)!.due<=Date.now())&&w.frequency>=(filter.min||1)&&(!filter.difficulty||w.difficulty===filter.difficulty)&&available.has(w.id)&&(!['card','de-ru','ru-de'].includes(mode)||!!w.translation)).sort((a,b)=>Number(reviews.has(b.id))-Number(reviews.has(a.id))||a.frequency*-1+b.frequency).slice(0,30);
  if(!candidates.length)return {empty:true,message:'Нет доступных заданий. Импортируйте PDF без ответов, проверьте фильтры или добавьте перевод для карточек. Все изученные слова могут быть запланированы на следующие дни.'};
  const word=candidates[Math.floor(Math.random()*candidates.length)];const choices=available.get(word.id)!;const link=choices[Math.floor(Math.random()*choices.length)];const fragment=fs.get(link.fragment)!;const possible=safeSources.get(link.fragment)!;const source=possible[Math.floor(Math.random()*possible.length)];const doc=ds.get(source.doc)!;
  let prompt=word.lemma,expected=word.lemma;let tokens:string[]|undefined;
  if(mode==='de-ru')expected=word.translation;
  if(mode==='ru-de')prompt=word.translation;
  if(['cloze','input','grammar'].includes(mode)){
   const forms=new Set(link.forms.map(answerKey));expected='';
   prompt=fragment.text.replace(/[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*/gu,token=>{if(forms.has(answerKey(token))){expected||=token;return '_____';}return token;});
   if(!expected)throw new Error('Не удалось подготовить пропуск.');
  }
  if(mode==='sentence'){
   expected=fragment.text;prompt='Восстановите фрагмент PDF, используя все слова.';tokens=fragment.text.split(/\s+/);
   for(let i=tokens.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tokens[i],tokens[j]]=[tokens[j],tokens[i]];}
  }
  const quiz:Quiz={id:crypto.randomUUID(),mode,prompt,tokens,source:{name:doc.name,page:source.page,section:source.section},notice:mode==='grammar'?'Лексический пропуск в контексте PDF; автоматического разбора грамматики нет.':undefined};
  await db.put('quizzes',{...quiz,word:word.id,expected,created:Date.now()});return quiz;
 }
 async function answerQuiz(id:string,action:string,input:{answer?:string;grade?:number}):Promise<Result>{
  const db=await database();const tx=db.transaction(['quizzes','words','attempts','progress'],'readwrite');
  try{
   const quiz=await tx.objectStore('quizzes').get(id);if(!quiz)throw new Error('Задание не найдено.');
   const word=await tx.objectStore('words').get(quiz.word);if(!word)throw new Error('Слово не найдено.');
   if(action==='reveal'){
    if(quiz.mode!=='card')throw new Error('Раскрытие доступно только для карточек.');
    quiz.revealed=true;await tx.objectStore('quizzes').put(quiz);await tx.done;return {expected:word.translation,word};
   }
   if(quiz.result){await tx.done;return quiz.result;}
   let correct:boolean,grade:number,answer:string;
   if(action==='rate'){
    if(quiz.mode!=='card'||!quiz.revealed||!Number.isInteger(input.grade)||![1,3,4,5].includes(input.grade!))throw new Error('Сначала раскройте карточку и выберите оценку.');
    grade=input.grade!;correct=grade>=3;answer='Самооценка';
   }else{
    if(action!=='answer'||quiz.mode==='card'||typeof input.answer!=='string'||input.answer.length>3000)throw new Error('Некорректный ответ.');
    answer=input.answer;const accepted=quiz.mode==='de-ru'?quiz.expected.split(';'):[quiz.expected];correct=accepted.some(a=>answerKey(a)===answerKey(answer));grade=correct?4:1;
   }
   const previous=await tx.objectStore('progress').get(word.id);const next=schedule(previous,grade,word.id);
   const result:Result={recorded:true,correct,expected:quiz.expected,word,next};quiz.result=result;
   await Promise.all([tx.objectStore('quizzes').put(quiz),tx.objectStore('progress').put(next),tx.objectStore('attempts').put({id:quiz.id,word:word.id,mode:quiz.mode,answer,correct:correct?1:0,created:Date.now()})]);await tx.done;return result;
  }catch(e){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw e;}
 }
 async function stats():Promise<Stats>{
  const db=await database();const [words,progress,attempts,fragments,occurrences]=await Promise.all([db.getAll('words'),db.getAll('progress'),db.getAll('attempts'),db.count('fragments'),db.count('sources')]);
  const start=Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z');const names=new Map(words.map(w=>[w.id,w.lemma]));
  return {words:words.length,reviewed:words.filter(w=>!w.review).length,learned:progress.filter(p=>p.reps>=3).length,due:progress.filter(p=>p.due<=Date.now()).length,today:attempts.filter(a=>a.created>=start).length,correct:attempts.filter(a=>a.correct).length,attempts:attempts.length,fragments,occurrences,errors:attempts.filter(a=>!a.correct).sort((a,b)=>b.created-a.created).slice(0,30).map(a=>({...a,lemma:names.get(a.word)||a.word}))};
 }
 async function exportProgress():Promise<Backup>{const db=await database();const tx=db.transaction(['progress','attempts']);const [progress,attempts]=await Promise.all([tx.objectStore('progress').getAll(),tx.objectStore('attempts').getAll()]);await tx.done;return {version:1,progress,attempts};}
 async function mergeProgress(data:Backup){
  const db=await database();const ids=new Set(await db.getAllKeys('words'));validateBackup(data,ids);
  const tx=db.transaction(['progress','attempts'],'readwrite');
  for(const item of data.progress)await tx.objectStore('progress').put(item);
  for(const item of data.attempts)if(!await tx.objectStore('attempts').get(item.id))await tx.objectStore('attempts').put(item);
  await tx.done;return {ok:true};
 }
 async function documentBlob(id:string){const doc=await(await database()).get('documents',id);if(!doc)throw new Error('PDF не найден в этом браузере. Импортируйте его заново.');return doc.blob;}
 async function close(){const db=await pending;db?.close();pending=undefined;}
 return {database,documents,importPages,importPdf,contexts,listWords,detail,saveWord,newQuiz,answerQuiz,stats,exportProgress,mergeProgress,documentBlob,close};
}
export const browserStore=createBrowserStore();
