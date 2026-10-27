import {browserStore} from './store';
import {parseBackup,toCSV} from './transfer';
import type {Filter,Mode,Word} from './model';
/** Local adapter for the trainer UI. It never sends a PDF or a learning record over HTTP. */
export async function localApi<T>(path:string,init?:RequestInit):Promise<T>{
 const url=new URL(path,'https://local.invalid/');const route=url.pathname.slice(1);const method=init?.method||'GET';
 const read=()=>JSON.parse(String(init?.body||'{}'));
 let result:unknown;
 if(route==='documents'&&method==='GET')result=await browserStore.documents();
 else if(route==='stats')result=await browserStore.stats();
 else if(route==='words'){
  const filter:Filter={q:url.searchParams.get('q')||'',section:url.searchParams.get('section')||'',difficulty:url.searchParams.get('difficulty')||'',min:Number(url.searchParams.get('min'))||1,offset:Number(url.searchParams.get('offset'))||0};result=await browserStore.listWords(filter);
 }else if(route.startsWith('words/'))result=method==='PATCH'?await browserStore.saveWord({...read(),id:decodeURIComponent(route.slice(6))} as Word):await browserStore.detail(decodeURIComponent(route.slice(6)));
 else if(route==='quiz')result=await browserStore.newQuiz(read() as Filter&{mode:Mode});
 else if(/^quiz\/[\w-]+\/(answer|rate|reveal)$/.test(route)){const [,id,action]=route.split('/');result=await browserStore.answerQuiz(id,action,read());}
 else if(route==='progress'&&method==='POST')result=await browserStore.mergeProgress(parseBackup(String(init?.body||''),url.searchParams.get('format')||'json'));
 else throw new Error('Неизвестная локальная операция.');
 return result as T;
}
export async function downloadProgress(format:'json'|'csv'){
 const data=await browserStore.exportProgress();const blob=new Blob([format==='csv'?toCSV(data):JSON.stringify(data,null,2)],{type:format==='csv'?'text/csv;charset=utf-8':'application/json'});
 const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='deutsch-b2-progress.'+format;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
const urls=new Map<string,string>();
export async function openDocument(id:string,page=1){
 // Open synchronously from the user's click to avoid mobile popup blockers after the IDB read.
 const win=window.open('','_blank');if(!win)throw new Error('Разрешите открытие PDF в новой вкладке.');win.opener=null;
 try{
  let url=urls.get(id);if(!url){url=URL.createObjectURL(await browserStore.documentBlob(id));urls.set(id,url);}
  win.location.replace(url+'#page='+page);
 }catch(e){win.close();throw e;}
}
