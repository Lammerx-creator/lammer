import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir,readFile,writeFile,unlink } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { openStore,answerKey,schedule } from './store.mjs';
import { extractPdf,hash } from './importer.mjs';
import { validateBackup,toCSV,fromCSV } from './backup.mjs';
import { authorized,serveWeb } from './web.mjs';
export async function createApp(directory,options={}){
 await mkdir(join(directory,'pdfs'),{recursive:true});
 const store=openStore(join(directory,'trainer.sqlite'));const {db}=store;
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 const body=async(req,max=5*1024*1024)=>{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max) throw new Error('Файл превышает допустимый размер');chunks.push(chunk);}return Buffer.concat(chunks);};
 const readJSON=async req=>JSON.parse((await body(req)).toString());
 const backup=()=>({version:1,progress:db.prepare('SELECT * FROM progress').all(),attempts:db.prepare('SELECT * FROM attempts').all()});
 const app=http.createServer(async(req,res)=>{
  try {
   const url=new URL(req.url,'http://localhost');const path=url.pathname;
   // A minimal public readiness response is needed by the hosting health check.
   if(path==='/api/health'&&req.method==='GET') return json(res,200,{ok:true,storage:'SQLite'});
   if(!authorized(req.headers.authorization,options.auth)){
    res.setHeader('WWW-Authenticate','Basic realm="Deutsch B2 Beruf Trainer", charset="UTF-8"');
    return json(res,401,{error:'Требуется вход'});
   }
   if(!path.startsWith('/api/')){
    if(options.staticDir&&await serveWeb(req,res,options.staticDir))return;
    return json(res,404,{error:'Not found'});
   }
   if(req.method!=='GET'&&(req.headers['x-trainer']!=='1'||req.headers['sec-fetch-site']==='cross-site')) return json(res,403,{error:'Запрос запрещён'});
   if(path==='/api/health') return json(res,200,{ok:true,storage:'SQLite'});
   if(path==='/api/documents'&&req.method==='GET') return json(res,200,db.prepare('SELECT * FROM documents').all());
   if(path==='/api/documents'&&req.method==='POST'){
    const version=url.searchParams.get('version');if(!['answers','questions'].includes(version)) throw new Error('Выберите версию PDF');
    const name=decodeURIComponent(req.headers['x-filename']||'document.pdf').slice(0,250);
    const bytes=await body(req,20*1024*1024);if(bytes.subarray(0,5).toString()!=='%PDF-') throw new Error('Ожидается PDF');
    const id=hash(bytes);const existing=db.prepare('SELECT * FROM documents WHERE id=?').get(id);
    if(existing){if(existing.version!==version) throw new Error('Этот PDF уже импортирован с другой версией. Версия не изменена.');return json(res,200,{id,duplicate:true});}
    const temp=join(tmpdir(),`trainer-${randomUUID()}.pdf`);
    try{
     await writeFile(temp,bytes,{mode:0o600});const pages=await extractPdf(temp);
     await writeFile(join(directory,'pdfs',id+'.pdf'),bytes,{mode:0o600});
     return json(res,200,store.importPages({id,name,version,pages}));
    }finally{await unlink(temp).catch(()=>{});}
   }
   const fileMatch=path.match(/^\/api\/documents\/([a-f0-9]{64})\/file$/);
   if(fileMatch&&req.method==='GET'){
    if(!db.prepare('SELECT id FROM documents WHERE id=?').get(fileMatch[1])) return json(res,404,{error:'Нет документа'});
    const bytes=await readFile(join(directory,'pdfs',fileMatch[1]+'.pdf'));res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="source.pdf"','Cache-Control':'no-store'});return res.end(bytes);
   }
   if(path==='/api/words'&&req.method==='GET'){
    const section=url.searchParams.get('section')||'';const difficulty=url.searchParams.get('difficulty')||'';
    const min=Math.max(1,Number(url.searchParams.get('min'))||1);const search=(url.searchParams.get('q')||'').slice(0,100);
    const where=`WHERE w.frequency>=? AND (w.lemma LIKE ? OR w.translation LIKE ?) AND (?='' OR w.difficulty=?) AND (?='' OR EXISTS(SELECT 1 FROM word_fragments wf JOIN sources s ON s.fragment=wf.fragment WHERE wf.word=w.id AND s.section=?))`;
    const args=[min,`%${search}%`,`%${search}%`,difficulty,difficulty,section,section];
    const total=db.prepare(`SELECT count(*) n FROM words w ${where}`).get(...args).n;
    const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
    const words=db.prepare(`SELECT w.*,p.due,p.reps FROM words w LEFT JOIN progress p ON p.word=w.id ${where} ORDER BY w.frequency DESC,w.id LIMIT 60 OFFSET ?`).all(...args,offset);
    return json(res,200,{total,words});
   }
   if(path.startsWith('/api/words/')&&['GET','PATCH'].includes(req.method)){
    const id=decodeURIComponent(path.slice('/api/words/'.length));const word=db.prepare('SELECT * FROM words WHERE id=?').get(id);if(!word)return json(res,404,{error:'Слово не найдено'});
    if(req.method==='GET') return json(res,200,{...word,contexts:store.contexts(id)});
    const input=await readJSON(req);const fields=['lemma','pos','article','plural','verbForms','translation','difficulty','note'];
    for(const k of fields) if(typeof input[k]!=='string'||input[k].length>2000) throw new Error('Некорректные поля слова');
    if(!['noun','verb','adjective','adverb','other','unknown'].includes(input.pos)||!['','der','die','das'].includes(input.article)||!['A1','A2','B1','B2','C1','C2','unrated'].includes(input.difficulty)) throw new Error('Некорректная категория');
    db.prepare(`UPDATE words SET ${fields.map(k=>`${k}=?`).join(',')},review=? WHERE id=?`).run(...fields.map(k=>input[k]),input.review===false?0:1,id);
    return json(res,200,{ok:true});
   }
   if(path==='/api/quiz'&&req.method==='POST'){
    const input=await readJSON(req);const mode=input.mode||'cloze';if(!['card','de-ru','ru-de','input','cloze','sentence','grammar'].includes(mode)) throw new Error('Неизвестный режим');
    const candidates=db.prepare(`SELECT w.* FROM words w LEFT JOIN progress p ON p.word=w.id WHERE (p.due IS NULL OR p.due<=?) AND w.frequency>=? AND (?='' OR w.difficulty=?) AND (?='' OR EXISTS(SELECT 1 FROM word_fragments wf JOIN sources s ON s.fragment=wf.fragment WHERE wf.word=w.id AND s.section=?)) ${['de-ru','ru-de','card'].includes(mode)?"AND w.translation<>''":''} ORDER BY p.due IS NOT NULL DESC,w.frequency DESC LIMIT 300`).all(Date.now(),Number(input.min)||1,input.difficulty||'',input.difficulty||'',input.section||'',input.section||'');
    // Choose only a no-answers context; never return dictionary IDs or expected answers before submission.
    const available=candidates.map(w=>({w,contexts:store.contexts(w.id,true).filter(c=>(!input.section||c.section===input.section)&&(!['cloze','input','grammar'].includes(mode)||new Set(c.forms.map(answerKey)).size===1))})).filter(x=>x.contexts.length);
    if(!available.length) return json(res,200,{empty:true,message:'Нет доступных карточек. Импортируйте PDF без ответов, проверьте фильтры или добавьте перевод для карточек.'});
    const selected=available[Math.floor(Math.random()*Math.min(30,available.length))];const w=selected.w;
    const c=selected.contexts[Math.floor(Math.random()*selected.contexts.length)];let expected=w.lemma;let prompt=w.lemma;let tokens;
    if(mode==='de-ru') expected=w.translation;
    if(mode==='ru-de') prompt=w.translation;
    if(['cloze','input','grammar'].includes(mode)){
     const forms=new Set(c.forms.map(answerKey));let first='';
     prompt=c.text.replace(/[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*/gu,token=>{if(forms.has(answerKey(token))){first||=token;return '_____';}return token;});
     expected=first;if(!expected) throw new Error('Не удалось подготовить пропуск');
    }
    if(mode==='sentence'){
     // Sentence reconstruction preserves original wording, not an invented grammar answer.
     expected=c.text;prompt='Восстановите фрагмент PDF, используя все слова.';
     tokens=c.text.split(/\s+/);for(let i=tokens.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tokens[i],tokens[j]]=[tokens[j],tokens[i]];}
    }
    if(mode==='card') prompt=w.lemma;
    const source={name:c.name,page:c.page,section:c.section};const id=randomUUID();
    db.prepare('INSERT INTO quizzes VALUES(?,?,?,?,?,?,?,NULL)').run(id,w.id,mode,expected,prompt,JSON.stringify(source),Date.now());
    return json(res,200,{id,mode,prompt,tokens,source,notice:mode==='grammar'?'Лексический пропуск в грамматическом контексте PDF; автоматического разбора грамматики нет.':undefined});
   }
   const quizMatch=path.match(/^\/api\/quiz\/([\w-]+)\/(answer|reveal|rate)$/);
   if(quizMatch&&req.method==='POST'){
    const q=db.prepare('SELECT * FROM quizzes WHERE id=?').get(quizMatch[1]);if(!q) return json(res,404,{error:'Задание не найдено'});
    const input=await readJSON(req);const word=db.prepare('SELECT * FROM words WHERE id=?').get(q.word);
    if(quizMatch[2]==='reveal'){
     if(q.mode!=='card') throw new Error('Раскрытие доступно только для карточек');
     if(!q.result) db.prepare('UPDATE quizzes SET result=? WHERE id=?').run(JSON.stringify({revealed:true}),q.id);
     return json(res,200,{expected:word.translation,word});
    }
    if(q.result&&JSON.parse(q.result).recorded) return json(res,200,JSON.parse(q.result));
    let correct,grade;let answer='';
    if(quizMatch[2]==='rate'){
     if(q.mode!=='card'||!q.result||!Number.isInteger(input.grade)||![1,3,4,5].includes(input.grade)) throw new Error('Сначала раскройте карточку и выберите оценку');
     grade=input.grade;correct=grade>=3;answer='Самооценка';
    }else{
     if(q.mode==='card'||typeof input.answer!=='string'||input.answer.length>3000) throw new Error('Некорректный ответ');
     answer=input.answer;
     const accepted=q.mode==='de-ru'?q.expected.split(';'):[q.expected];correct=accepted.some(a=>answerKey(a)===answerKey(answer));grade=correct?4:1;
    }
    const result=store.transaction(()=>{
     const next=schedule(db.prepare('SELECT * FROM progress WHERE word=?').get(q.word),grade);
     db.prepare('INSERT OR REPLACE INTO progress VALUES(?,?,?,?,?)').run(q.word,next.reps,next.interval,next.ease,next.due);
     db.prepare('INSERT INTO attempts VALUES(?,?,?,?,?,?)').run(q.id,q.word,q.mode,answer,Number(correct),Date.now());
     const value={recorded:true,correct,expected:q.expected,word,next};
     db.prepare('UPDATE quizzes SET result=? WHERE id=?').run(JSON.stringify(value),q.id);return value;
    });return json(res,200,result);
   }
   if(path==='/api/stats'){
    const today=new Date().toISOString().slice(0,10);const start=Date.parse(today+'T00:00:00Z');
    return json(res,200,{
     words:db.prepare('SELECT count(*) n FROM words').get().n,
     reviewed:db.prepare('SELECT count(*) n FROM words WHERE review=0').get().n,
     learned:db.prepare('SELECT count(*) n FROM progress WHERE reps>=3').get().n,
     due:db.prepare('SELECT count(*) n FROM progress WHERE due<=?').get(Date.now()).n,
     today:db.prepare('SELECT count(*) n FROM attempts WHERE created>=?').get(start).n,
     correct:db.prepare('SELECT count(*) n FROM attempts WHERE correct=1').get().n,
     attempts:db.prepare('SELECT count(*) n FROM attempts').get().n,
     fragments:db.prepare('SELECT count(*) n FROM fragments').get().n,
     occurrences:db.prepare('SELECT count(*) n FROM sources').get().n,
     errors:db.prepare('SELECT a.*,w.lemma FROM attempts a JOIN words w ON w.id=a.word WHERE correct=0 ORDER BY created DESC LIMIT 30').all(),
    });
   }
   if(path==='/api/progress'&&req.method==='GET'){
    const data=backup();if(url.searchParams.get('format')==='csv'){res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Cache-Control':'no-store'});return res.end(toCSV(data));}
    return json(res,200,data);
   }
   if(path==='/api/progress'&&req.method==='POST'){
    const raw=(await body(req)).toString();const data=validateBackup(url.searchParams.get('format')==='csv'?fromCSV(raw):JSON.parse(raw),db);
    // Merge instead of deleting current work. Imported schedules replace matching words; attempts deduplicate by UUID.
    store.transaction(()=>{
     for(const p of data.progress) db.prepare('INSERT OR REPLACE INTO progress VALUES(?,?,?,?,?)').run(p.word,p.reps,p.interval,p.ease,p.due);
     for(const a of data.attempts) db.prepare('INSERT OR IGNORE INTO attempts VALUES(?,?,?,?,?,?)').run(a.id,a.word,a.mode,a.answer,a.correct,a.created);
    });return json(res,200,{ok:true,progress:data.progress.length,attempts:data.attempts.length});
   }
   json(res,404,{error:'Маршрут не найден'});
  }catch(e){console.error(e.message);if(!res.headersSent)json(res,400,{error:e.message.includes('ENOENT')?'Не найден pdftotext или файл. Проверьте установку poppler-utils.':e.message});else res.end();}
 });
 app.on('close',()=>db.close());
 return {app,store};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const directory=resolve(process.env.TRAINER_DATA_DIR||'data');
 const {app}=await createApp(directory);app.listen(Number(process.env.API_PORT||3001),'127.0.0.1',()=>console.log(`SQLite backend ready on port ${process.env.API_PORT||3001}; data: ${directory}`));
}
