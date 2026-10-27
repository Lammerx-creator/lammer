import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const digest=value=>createHash('sha256').update(value).digest();
export function authorized(header,credentials){
 if(!credentials)return true;
 if(typeof header!=='string'||!/^Basic [A-Za-z0-9+/]+=*$/i.test(header))return false;
 const supplied=Buffer.from(header.slice(6),'base64').toString('utf8');
 return timingSafeEqual(digest(supplied),digest(`${credentials.user}:${credentials.password}`));
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.woff2':'font/woff2'};
export async function serveWeb(req,res,directory){
 if(!['GET','HEAD'].includes(req.method))return false;
 const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const root=await realpath(directory);
 let file=resolve(root,'.'+path);
 if(file!==root&&!file.startsWith(root+sep))return false;
 if(path==='/'||!extname(path))file=resolve(root,'index.html');
 try{
  const actual=await realpath(file);
  if(!actual.startsWith(root+sep))return false;
  const bytes=await readFile(actual);
  res.writeHead(200,{'Content-Type':types[extname(actual)]||'application/octet-stream','Cache-Control':actual.includes(sep+'assets'+sep)?'private, max-age=31536000, immutable':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?undefined:bytes);return true;
 }catch(e){if(['ENOENT','EISDIR','ENOTDIR'].includes(e.code))return false;throw e;}
}
