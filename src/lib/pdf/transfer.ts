import {modes,type Attempt,type Backup,type Progress} from './model';
const fail=():never=>{throw new Error('Некорректная резервная копия. Сначала импортируйте те же PDF; исходные данные не изменены.');};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validateBackup(input:unknown,ids:Set<string>):asserts input is Backup{
 if(!object(input)||input.version!==1||!Array.isArray(input.progress)||!Array.isArray(input.attempts)||input.progress.length>100000||input.attempts.length>100000)fail();
 const data=input as unknown as Backup;const unique=new Set<string>();
 for(const p of data.progress){
  if(!object(p)||typeof p.word!=='string'||!ids.has(p.word)||unique.has(p.word)||!Number.isInteger(p.reps)||p.reps<0||p.reps>10000||!Number.isFinite(p.interval)||p.interval<0||p.interval>1000000||!Number.isFinite(p.ease)||p.ease<1.3||p.ease>10||!Number.isSafeInteger(p.due)||p.due<0)fail();unique.add(p.word);
 }
 unique.clear();
 for(const a of data.attempts){
  if(!object(a)||typeof a.id!=='string'||a.id.length>100||unique.has(a.id)||typeof a.word!=='string'||!ids.has(a.word)||!modes.includes(a.mode)||typeof a.answer!=='string'||a.answer.length>3000||![0,1].includes(a.correct)||!Number.isSafeInteger(a.created)||a.created<0)fail();unique.add(a.id);
 }
}
const columns=['kind','word','reps','interval','ease','due','id','mode','answer','correct','created'];
export function toCSV(data:Backup):string{
 const escape=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
 const row=(kind:string,item:Progress|Attempt)=>columns.map(c=>c==='kind'?kind:(item as unknown as Record<string,unknown>)[c]??'');
 return '\uFEFF'+[columns,...data.progress.map(p=>row('progress',p)),...data.attempts.map(a=>row('attempt',a))].map(r=>r.map(escape).join(',')).join('\r\n');
}
export function fromCSV(text:string):Backup{
 text=text.replace(/^\uFEFF/,'');const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;
 }
 if(quoted)fail();if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
 if(JSON.stringify(rows.shift())!==JSON.stringify(columns))fail();
 const data:Backup={version:1,progress:[],attempts:[]};
 for(const r of rows){
  if(r.length!==columns.length)fail();const o=Object.fromEntries(columns.map((c,i)=>[c,r[i]]));
  const numeric=(key:string)=>o[key].trim()?Number(o[key]):NaN;
  if(o.kind==='progress')data.progress.push({word:o.word,reps:numeric('reps'),interval:numeric('interval'),ease:numeric('ease'),due:numeric('due')});
  else if(o.kind==='attempt')data.attempts.push({id:o.id,word:o.word,mode:o.mode as Attempt['mode'],answer:o.answer,correct:numeric('correct') as 0|1,created:numeric('created')});else fail();
 }
 return data;
}
export function parseBackup(text:string,format:string):Backup{
 if(new TextEncoder().encode(text).byteLength>5*1024*1024)throw new Error('Размер резервной копии превышает 5 МБ.');
 try{return format==='csv'?fromCSV(text):JSON.parse(text);}catch{throw new Error('Не удалось прочитать JSON/CSV. Данные не изменены.');}
}
