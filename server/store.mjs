import { DatabaseSync } from 'node:sqlite';
import { known } from './lexicon.mjs';
import { hash, normalize, tokenize, safeContext } from './importer.mjs';
export const answerKey = s => normalize(s).toLocaleLowerCase('de').replace(/[.!?]+$/,'');
export function schedule(old,grade,now=Date.now()) {
 const previous=old||{reps:0,interval:0,ease:2.5};
 const reps=grade<3?0:previous.reps+1;
 const interval=grade<3?1:reps===1?1:reps===2?6:Math.max(1,Math.round(previous.interval*previous.ease));
 const ease=Math.max(1.3,previous.ease+0.1-(5-grade)*(0.08+(5-grade)*0.02));
 return {reps,interval,ease,due:now+interval*86400000};
}
export function openStore(path=':memory:') {
 const db=new DatabaseSync(path);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,name TEXT NOT NULL,version TEXT NOT NULL,pages INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS pages(doc TEXT REFERENCES documents(id),number INTEGER,section TEXT,raw TEXT,PRIMARY KEY(doc,number));
 CREATE TABLE IF NOT EXISTS fragments(id TEXT PRIMARY KEY,text TEXT NOT NULL,safe INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sources(fragment TEXT REFERENCES fragments(id),doc TEXT REFERENCES documents(id),page INTEGER,ordinal INTEGER,section TEXT,PRIMARY KEY(doc,page,ordinal));
 CREATE INDEX IF NOT EXISTS sources_fragment ON sources(fragment);
 CREATE TABLE IF NOT EXISTS words(id TEXT PRIMARY KEY,lemma TEXT,pos TEXT,article TEXT,plural TEXT,verbForms TEXT,translation TEXT,review INTEGER,difficulty TEXT,note TEXT,frequency INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS word_fragments(word TEXT REFERENCES words(id),fragment TEXT REFERENCES fragments(id),forms TEXT,count INTEGER,PRIMARY KEY(word,fragment));
 CREATE TABLE IF NOT EXISTS progress(word TEXT PRIMARY KEY REFERENCES words(id),reps INTEGER,interval REAL,ease REAL,due INTEGER);
 CREATE TABLE IF NOT EXISTS quizzes(id TEXT PRIMARY KEY,word TEXT REFERENCES words(id),mode TEXT,expected TEXT,prompt TEXT,source TEXT,created INTEGER,result TEXT);
 CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,word TEXT REFERENCES words(id),mode TEXT,answer TEXT,correct INTEGER,created INTEGER);
 `);
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try {const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
 function importPages({id,name,version,pages}) {
  if(!['answers','questions'].includes(version)) throw new Error('Укажите версию PDF');
  if(db.prepare('SELECT id FROM documents WHERE id=?').get(id)) return {duplicate:true,id};
  return transaction(()=>{
   db.prepare('INSERT INTO documents VALUES(?,?,?,?)').run(id,name,version,pages.length);
   const insertWord=db.prepare('INSERT OR IGNORE INTO words(id,lemma,pos,article,plural,verbForms,translation,review,difficulty,note) VALUES(?,?,?,?,?,?,?,?,?,?)');
   const insertFragment=db.prepare('INSERT OR IGNORE INTO fragments VALUES(?,?,?)');
   const insertWF=db.prepare('INSERT OR IGNORE INTO word_fragments VALUES(?,?,?,?)');
   for(const page of pages){
    db.prepare('INSERT INTO pages VALUES(?,?,?,?)').run(id,page.number,page.section,page.raw);
    page.fragments.forEach((text,ordinal)=>{
     const fid=hash(normalize(text));
     insertFragment.run(fid,text,Number(safeContext(text)));
     db.prepare('INSERT INTO sources VALUES(?,?,?,?,?)').run(fid,id,page.number,ordinal,page.section);
     const grouped=new Map();
     for(const form of tokenize(text)) {
      const entry=known.get(form.toLocaleLowerCase('de'));
      const lemma=entry?.lemma||form;
      const wid=lemma.toLocaleLowerCase('de');
      if(!grouped.has(wid)) grouped.set(wid,{entry,lemma,forms:[],count:0});
      const item=grouped.get(wid);item.count++;if(!item.forms.includes(form)) item.forms.push(form);
     }
     for(const [wid,w] of grouped) {
      const e=w.entry||{pos:'unknown',article:'',plural:'',verbForms:'',translation:'',review:1,difficulty:'unrated',note:'Кандидат: лемма, часть речи и значение требуют ручной проверки. Формы автоматически не объединены.'};
      insertWord.run(wid,w.lemma,e.pos,e.article,e.plural,e.verbForms,e.translation,e.review,e.difficulty,e.note);
      const result=insertWF.run(wid,fid,JSON.stringify(w.forms),w.count);
      if(result.changes) db.prepare('UPDATE words SET frequency=frequency+? WHERE id=?').run(w.count,wid);
     }
    });
   }
   return {id,pages:pages.length,duplicate:false};
  });
 }
 function contexts(word,safeOnly=false) {
  return db.prepare(`SELECT f.text,wf.forms,d.name,d.version,s.doc,s.page,s.section FROM word_fragments wf JOIN fragments f ON f.id=wf.fragment JOIN sources s ON s.fragment=f.id JOIN documents d ON d.id=s.doc WHERE wf.word=? ${safeOnly?"AND d.version='questions' AND f.safe=1":''} ORDER BY s.page LIMIT 300`).all(word).map(r=>({...r,forms:JSON.parse(r.forms)}));
 }
 return {db,transaction,importPages,contexts};
}
