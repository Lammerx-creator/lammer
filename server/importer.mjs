import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute=promisify(execFile);
export const normalize = text => text.normalize('NFC').replace(/\u00ad/g,'').replace(/\s+/g,' ').trim();
export const hash = text => createHash('sha256').update(text).digest('hex');
export const tokenize = text => [...text.matchAll(/\b[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*\b/gu)].map(m=>m[0]).filter(w=>w.length>2);
export function parseText(text) {
 let section='Unsortiert';
 const pages=text.split('\f');
 if(!pages.at(-1)?.trim()) pages.pop();
 return pages.map((raw,index)=>{
  const lines=raw.split('\n');
  // Only headings near the top of the page, never arbitrary mentions in running text.
  const heading=lines.slice(0,5).find(l=>/^\s*(Lesen|Hören|Schreiben|Sprechen|Sprachbausteine)(?:\s|$)/i.test(l));
  if(heading) section=heading.match(/Lesen|Hören|Schreiben|Sprechen|Sprachbausteine/i)[0];
  const text=raw.normalize('NFC').replace(/([a-zäöüß])-\s*\n\s*([a-zäöüß])/g,'$1$2');
  const paragraphs=text.split(/\n\s*\n/).map(normalize).filter(p=>tokenize(p).length>=3);
  return {number:index+1,section,raw,fragments:paragraphs};
 });
}
export async function extractPdf(path) {
 const {stdout}=await execute('pdftotext',['-layout','-enc','UTF-8',path,'-'],{maxBuffer:30*1024*1024,timeout:60000});
 const pages=parseText(stdout);
 if(!pages.some(p=>p.fragments.length)) throw new Error('PDF не содержит извлекаемого текста. Для скана нужен OCR (пока не включён).');
 return pages;
}
// Fail closed for obvious answer keys, bilingual annotations and long composite paragraphs.
// A no-answers source is mandatory as well; filename alone is not proof of safety.
export const safeContext = text => text.length<900 && !/[А-Яа-яЁё]/u.test(text) && !/(?:Lösungen?|Lösungsschlüssel|richtige\s+Antwort|Antwortschlüssel|\b\d+\s*[:=]\s*[abc]\b)/i.test(text);
