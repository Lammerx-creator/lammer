import type { Page } from './model';
export const normalize = (text:string) => text.normalize('NFC').replace(/\u00ad/g,'').replace(/\s+/g,' ').trim();
export const tokenize = (text:string) => [...text.matchAll(/[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*/gu)].map(m=>m[0]).filter(w=>w.length>2);
export async function digest(bytes:BufferSource):Promise<string>{
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
export const textHash=(text:string)=>digest(new TextEncoder().encode(text));
export const safeContext = (text:string) => text.length<900 && !/[А-Яа-яЁё]/u.test(text) && !/(?:Lösungen?|Lösungsschlüssel|richtige\s+Antwort|Antwortschlüssel|\b\d+\s*[:=]\s*[abc]\b)/i.test(text);
export function parsePages(rawPages:string[]):Page[]{
 let section='Unsortiert';
 return rawPages.map((raw,index)=>{
  const heading=raw.split('\n').filter(l=>l.trim()).slice(0,5).find(l=>/^\s*(Lesen|Hören|Schreiben|Sprechen|Sprachbausteine)(?:\s|$)/i.test(l));
  if(heading)section=heading.match(/Lesen|Hören|Schreiben|Sprechen|Sprachbausteine/i)![0];
  const text=raw.normalize('NFC').replace(/([a-zäöüß])-\s*\n\s*([a-zäöüß])/g,'$1$2');
  return {number:index+1,section,raw,fragments:text.split(/\n\s*\n/).map(normalize).filter(p=>tokenize(p).length>=3)};
 });
}
export type TextItem = {str:string;transform:number[];width:number;height:number;hasEOL:boolean};
/** Retain reading order and separate physical lines/paragraphs using PDF coordinates. */
export function pageText(items:TextItem[]):string{
 let output='',last:TextItem|undefined;
 for(const item of items){
  if(!item.str.trim())continue;
  if(last){
   const dy=Math.abs(item.transform[5]-last.transform[5]);
   const lineHeight=Math.max(Math.abs(last.height)||Math.abs(last.transform[3]),8);
   if(dy>Math.max(2,lineHeight*.3)) output+=dy>lineHeight*1.65?'\n\n':'\n';
   else if(last.hasEOL)output+='\n';
   else if(!output.endsWith(' ')&&!item.str.startsWith(' '))output+=' ';
  }
  output+=item.str;last=item;
 }
 return output;
}
export async function extractPdf(file:Blob,onProgress?:(message:string)=>void):Promise<Page[]>{
 if(file.size>20*1024*1024)throw new Error('PDF превышает 20 МБ.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw new Error('Выберите корректный PDF.');
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const base=new URL(import.meta.env.BASE_URL,location.origin);
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs/pdf.worker.min.mjs',base).href;
 const task=pdfjs.getDocument({data:bytes,cMapUrl:new URL('pdfjs/cmaps/',base).href,cMapPacked:true,standardFontDataUrl:new URL('pdfjs/standard_fonts/',base).href,useWasm:false});
 try{
  const pdf=await task.promise;
  if(pdf.numPages>1000)throw new Error('В MVP поддерживаются PDF до 1000 страниц.');
  const raw:string[]=[];let chars=0;
  for(let number=1;number<=pdf.numPages;number++){
   onProgress?.(`Извлекаем страницу ${number} из ${pdf.numPages}…`);
   const page=await pdf.getPage(number);const content=await page.getTextContent();
   const text=pageText(content.items.filter(i=>'str' in i));chars+=text.length;
   if(chars>15*1024*1024)throw new Error('Извлечённый текст превышает 15 млн символов. Разделите PDF на части.');
   raw.push(text);
   page.cleanup();
  }
  const pages=parsePages(raw);
  if(!pages.some(p=>p.fragments.length))throw new Error('В PDF нет извлекаемого текста. OCR сканов пока не поддерживается.');
  return pages;
 }catch(e){
  if(e instanceof Error&&e.name==='PasswordException')throw new Error('PDF защищён паролем. Выберите незашифрованную копию.');
  throw e;
 }finally{await task.destroy();}
}
