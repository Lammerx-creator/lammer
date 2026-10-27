import { describe,it,expect,beforeAll,afterAll } from 'vitest';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore,answerKey,schedule } from './store.mjs';
import { parseText,extractPdf,hash,normalize,safeContext } from './importer.mjs';
import { createApp } from './server.mjs';
import { fromCSV,toCSV,validateBackup } from './backup.mjs';
const doc=(id,text,version='questions')=>({id,name:id+'.pdf',version,pages:parseText(text)});
// Valid tiny two-page PDF; integration exercises the actual Poppler executable.
function pdf(){
 const objects=[
 '<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
 stream('BT /F1 12 Tf 50 740 Td (Lesen Teil 1) Tj 0 -30 Td (Die Rechnung ist wichtig.) Tj ET'),
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
 stream('BT /F1 12 Tf 50 740 Td (Sprechen Teil 2) Tj 0 -30 Td (Wir arbeiten zusammen.) Tj ET'),
 '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let out='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(out);
 out+=`xref\n0 8\n0000000000 65535 f \n`+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(out);
}
function stream(s){return `<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream`;}
describe('PDF extraction and provenance',()=>{
 it('extracts actual PDF pages with Poppler',async()=>{const dir=await mkdtemp(join(tmpdir(),'pdf-test-'));try{const path=join(dir,'fixture.pdf');await writeFile(path,pdf());const pages=await extractPdf(path);expect(pages).toHaveLength(2);expect(pages[0].raw).toContain('Rechnung');expect(pages[1].number).toBe(2);expect(pages[1].section).toBe('Sprechen');}finally{await rm(dir,{recursive:true});}});
 it('rejects malformed PDFs',async()=>{const dir=await mkdtemp(join(tmpdir(),'bad-pdf-'));try{const path=join(dir,'bad.pdf');await writeFile(path,'%PDF-invalid');await expect(extractPdf(path)).rejects.toThrow();}finally{await rm(dir,{recursive:true});}});
 it('preserves page numbers, raw forms and line-break hyphenation',()=>{const pages=parseText('Lesen Teil 1\n\nDie Rech-\nnung ist wichtig.\fHören Teil 1\n\nWir arbeiten zusammen.\f');expect(pages).toHaveLength(2);expect(pages[0].raw).toContain('Rech-');expect(pages[0].fragments).toContain('Die Rechnung ist wichtig.');expect(pages[1].section).toBe('Hören');});
 it('does not mistake an arbitrary mention for a heading',()=>{expect(parseText('Wir besprechen Lesen heute.')[0].section).toBe('Unsortiert');});
 it('normalizes whitespace and Unicode without erasing umlauts',()=>{expect(normalize('  A\n B  ')).toBe('A B');expect(normalize('fu\u0308r')).toBe('für');expect(hash('für')).not.toBe(hash('fur'));});
 it('excludes obvious keys and bilingual annotations',()=>{expect(safeContext('Lösungsschlüssel: 1: a')).toBe(false);expect(safeContext('Die Rechnung — счёт')).toBe(false);expect(safeContext('Die Rechnung ist wichtig.')).toBe(true);});
});
describe('deduplication, inflections and source isolation',()=>{
 it('deduplicates identical fragments across documents but preserves all page links',()=>{const s=openStore();try{s.importPages(doc('one','Die Rechnung ist wichtig.\fDie Rechnung ist wichtig.'));s.importPages(doc('two','Die Rechnung ist wichtig.','answers'));expect(s.db.prepare('SELECT count(*) n FROM fragments').get().n).toBe(1);expect(s.contexts('rechnung')).toHaveLength(3);expect(s.db.prepare('SELECT frequency FROM words WHERE id=?').get('rechnung').frequency).toBe(1);expect(s.contexts('rechnung',true)).toHaveLength(2);}finally{s.db.close();}});
 it('merges only curated forms and retains ambiguous tokens for review',()=>{const s=openStore();try{s.importPages(doc('one','Die Rechnungen und Rechnung sind offen.\n\nWir gingen und gehen gemeinsam.'));expect(s.db.prepare('SELECT frequency FROM words WHERE id=?').get('rechnung').frequency).toBe(2);expect(s.contexts('rechnung')[0].forms).toEqual(['Rechnungen','Rechnung']);expect(s.db.prepare('SELECT review FROM words WHERE id=?').get('gingen').review).toBe(1);expect(s.db.prepare('SELECT id FROM words WHERE id=?').get('gehen')).toBeTruthy();}finally{s.db.close();}});
 it('repeat import is idempotent',()=>{const s=openStore();try{const d=doc('same','Die Rechnung ist wichtig.');s.importPages(d);expect(s.importPages(d).duplicate).toBe(true);expect(s.contexts('rechnung')).toHaveLength(1);}finally{s.db.close();}});
 it('never selects answer-only contexts',()=>{const s=openStore();try{s.importPages(doc('answer','Die Rechnung ist wichtig.','answers'));expect(s.contexts('rechnung',true)).toEqual([]);}finally{s.db.close();}});
});
describe('SM-2 and backup validation',()=>{
 it('uses 1, 6 and ease-based intervals and resets after a lapse',()=>{const a=schedule(undefined,4,0),b=schedule(a,4,0),c=schedule(b,4,0);expect([a.interval,b.interval,c.interval]).toEqual([1,6,15]);expect(schedule(c,1,0).reps).toBe(0);expect(schedule(c,1,0).interval).toBe(1);});
 it('checks exact answers without conflating ss or umlauts',()=>{expect(answerKey('  DIE   Rechnung! ')).toBe('die rechnung');expect(answerKey('Maße')).not.toBe(answerKey('Masse'));expect(answerKey('für')).not.toBe(answerKey('fur'));});
 it('round-trips JSON-equivalent CSV with quotes, commas, Unicode and newlines',()=>{const data={version:1,progress:[{word:'rechnung',reps:1,interval:1,ease:2.5,due:123}],attempts:[{id:'a',word:'rechnung',mode:'de-ru',answer:'счёт, "пример"\nстрока',correct:0,created:456}]};expect(fromCSV(toCSV(data))).toEqual(data);});
 it('rejects invalid backups before writes',()=>{const s=openStore();try{s.importPages(doc('one','Die Rechnung ist wichtig.'));expect(()=>validateBackup({version:1,progress:[{word:'rechnung',reps:-1}],attempts:[]},s.db)).toThrow();expect(()=>validateBackup({version:1,progress:[],attempts:[{word:'absent'}]},s.db)).toThrow();}finally{s.db.close();}});
 it('persists progress and attempts through database reopen',async()=>{const dir=await mkdtemp(join(tmpdir(),'persist-'));try{const path=join(dir,'test.db');let s=openStore(path);s.importPages(doc('one','Die Rechnung ist wichtig.'));s.db.prepare('INSERT INTO progress VALUES(?,?,?,?,?)').run('rechnung',2,6,2.5,123);s.db.prepare('INSERT INTO attempts VALUES(?,?,?,?,?,?)').run('persist-attempt','rechnung','cloze','Rechnung',1,123);s.db.close();s=openStore(path);expect(s.db.prepare('SELECT answer FROM attempts WHERE id=?').get('persist-attempt').answer).toBe('Rechnung');expect(s.db.prepare('SELECT reps FROM progress WHERE word=?').get('rechnung').reps).toBe(2);s.db.close();}finally{await rm(dir,{recursive:true});}});
});
describe('backend functional workflow and answer boundaries',()=>{
 let directory,app,store,base;
 beforeAll(async()=>{directory=await mkdtemp(join(tmpdir(),'trainer-api-'));({app,store}=await createApp(directory));await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}/api/`;});
 afterAll(async()=>{await new Promise(r=>app.close(r));await rm(directory,{recursive:true});});
 const post=async(path,data)=>{const r=await fetch(base+path,{method:'POST',headers:{'X-Trainer':'1','Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,data:await r.json()};};
 it('does not generate a quiz from answer-only PDF',async()=>{store.importPages(doc('answers','Die Rechnung ist wichtig.','answers'));const r=await post('quiz',{mode:'cloze'});expect(r.data.empty).toBe(true);});
 it('imports actual PDF bytes via HTTP and deduplicates repeated upload',async()=>{const upload=()=>fetch(base+'documents?version=questions',{method:'POST',headers:{'X-Trainer':'1','X-Filename':'fixture.pdf'},body:pdf()});const first=await upload();expect(first.status).toBe(200);expect((await first.json()).pages).toBe(2);expect((await (await upload()).json()).duplicate).toBe(true);});
 it('rejects relabelling an existing PDF version',async()=>{const r=await fetch(base+'documents?version=answers',{method:'POST',headers:{'X-Trainer':'1'},body:pdf()});expect(r.status).toBe(400);});
 it('rejects non-PDF uploads',async()=>{const r=await fetch(base+'documents?version=questions',{method:'POST',headers:{'X-Trainer':'1'},body:'not a PDF'});expect(r.status).toBe(400);});
 it('hides answers before submit, grades and persists a single attempt on duplicate submit',async()=>{const {data:q}=await post('quiz',{mode:'cloze'});expect(q.id).toBeTruthy();expect(q.expected).toBeUndefined();expect(q.word).toBeUndefined();expect(q.source.doc).toBeUndefined();expect(q.prompt).toContain('_____');const early=await post(`quiz/${q.id}/reveal`,{});expect(early.status).toBe(400);const first=await post(`quiz/${q.id}/answer`,{answer:'definitely wrong'});expect(first.data.correct).toBe(false);expect(first.data.expected).toBeTruthy();expect(first.data.next.due).toBeGreaterThan(Date.now());const again=await post(`quiz/${q.id}/answer`,{answer:'something else'});expect(again.data).toEqual(first.data);expect(store.db.prepare('SELECT count(*) n FROM attempts WHERE id=?').get(q.id).n).toBe(1);});
 it.each(['de-ru','ru-de','input','cloze','sentence','grammar'])('checks a correct answer and saves the %s mode',async mode=>{store.db.exec('DELETE FROM progress');const {data:q}=await post('quiz',{mode});expect(q.id).toBeTruthy();expect(q.expected).toBeUndefined();const expected=store.db.prepare('SELECT expected FROM quizzes WHERE id=?').get(q.id).expected;const result=await post(`quiz/${q.id}/answer`,{answer:mode==='de-ru'?expected.split(';')[0]:expected});expect(result.status).toBe(200);expect(result.data.correct).toBe(true);expect(result.data.recorded).toBe(true);});
 it('card rating requires reveal and cannot record multiple reviews',async()=>{store.db.exec('DELETE FROM progress');const {data:q}=await post('quiz',{mode:'card'});expect(q.id).toBeTruthy();expect((await post(`quiz/${q.id}/rate`,{grade:5})).status).toBe(400);expect((await post(`quiz/${q.id}/reveal`,{})).data.expected).toBeTruthy();expect((await post(`quiz/${q.id}/rate`,{grade:4})).data.recorded).toBe(true);await post(`quiz/${q.id}/rate`,{grade:5});expect(store.db.prepare('SELECT count(*) n FROM attempts WHERE id=?').get(q.id).n).toBe(1);});
 it('validates all imported progress atomically and round-trips exports',async()=>{const before=await (await fetch(base+'progress')).json();const invalid={...before,progress:[...before.progress,{word:'not-there',reps:0,interval:0,ease:2.5,due:0}]};expect((await post('progress',invalid)).status).toBe(400);expect(await (await fetch(base+'progress')).json()).toEqual(before);expect((await post('progress',before)).status).toBe(200);const csv=await(await fetch(base+'progress?format=csv')).text();expect(fromCSV(csv)).toEqual(before);});
 it('requires a same-origin custom header on mutations',async()=>{const r=await fetch(base+'quiz',{method:'POST',body:'{}'});expect(r.status).toBe(403);});
});
