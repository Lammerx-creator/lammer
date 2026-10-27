export function validateBackup(input,db) {
 if(input?.version!==1||!Array.isArray(input.progress)||!Array.isArray(input.attempts)||input.progress.length>100000||input.attempts.length>100000) throw new Error('Неверный формат резервной копии');
 const ids=new Set(db.prepare('SELECT id FROM words').all().map(w=>w.id));
 const unique=new Set();
 for(const p of input.progress){
  if(!ids.has(p.word)||unique.has(p.word)||!Number.isInteger(p.reps)||p.reps<0||p.reps>10000||!Number.isFinite(p.interval)||p.interval<0||p.interval>1000000||!Number.isFinite(p.ease)||p.ease<1.3||p.ease>10||!Number.isSafeInteger(p.due)||p.due<0) throw new Error('Некорректное расписание или отсутствующее слово: сначала импортируйте исходные PDF');
  unique.add(p.word);
 }
 unique.clear();
 for(const a of input.attempts){
  if(typeof a.id!=='string'||a.id.length>100||unique.has(a.id)||!ids.has(a.word)||!['card','de-ru','ru-de','input','cloze','sentence','grammar'].includes(a.mode)||typeof a.answer!=='string'||a.answer.length>3000||![0,1].includes(a.correct)||!Number.isSafeInteger(a.created)||a.created<0) throw new Error('Некорректная история попыток');
  unique.add(a.id);
 }
 return input;
}
const columns=['kind','word','reps','interval','ease','due','id','mode','answer','correct','created'];
export function toCSV(data){
 const escape=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 return '\uFEFF'+[columns,...data.progress.map(p=>columns.map(c=>c==='kind'?'progress':p[c]??'')),...data.attempts.map(a=>columns.map(c=>c==='kind'?'attempt':a[c]??''))].map(r=>r.map(escape).join(',')).join('\r\n');
}
export function fromCSV(text){
 text=text.replace(/^\uFEFF/,'');
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(quoted) throw new Error('Незакрытая кавычка CSV');
 if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
 if(JSON.stringify(rows.shift())!==JSON.stringify(columns)) throw new Error('CSV должен быть экспортирован этим приложением');
 const data={version:1,progress:[],attempts:[]};
 for(const r of rows){if(r.length!==columns.length) throw new Error('Неверная строка CSV');const o=Object.fromEntries(columns.map((c,i)=>[c,r[i]]));
  if(o.kind==='progress') data.progress.push({word:o.word,reps:+o.reps,interval:+o.interval,ease:+o.ease,due:+o.due});
  else if(o.kind==='attempt') data.attempts.push({id:o.id,word:o.word,mode:o.mode,answer:o.answer,correct:+o.correct,created:+o.created});
  else throw new Error('Неизвестная строка CSV');
 }
 return data;
}
