import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { mkdtemp,mkdir,writeFile,symlink,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createApp } from './server.mjs';

describe('production hosting',()=>{
 let directory,app,base,headers;
 beforeAll(async()=>{
  directory=await mkdtemp(join(tmpdir(),'trainer-deploy-'));
  const web=join(directory,'web');await mkdir(join(web,'assets'),{recursive:true});
  await writeFile(join(web,'index.html'),'<!doctype html><html lang="ru"><body>Deutsch B2</body></html>');
  await writeFile(join(web,'assets','app.js'),'console.log("ready")');
  await writeFile(join(directory,'private.txt'),'not a public file');
  await symlink(join(directory,'private.txt'),join(web,'private.txt'));
  const credentials={user:'student',password:randomUUID()};
  headers={Authorization:'Basic '+Buffer.from(credentials.user+':'+credentials.password).toString('base64')};
  ({app}=await createApp(join(directory,'data'),{staticDir:web,auth:credentials}));
  await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;
 });
 afterAll(async()=>{await new Promise(r=>app.close(r));await rm(directory,{recursive:true});});
 it('has a minimal public health check',async()=>{const r=await fetch(base+'/api/health');expect(r.status).toBe(200);expect(await r.json()).toEqual({ok:true,storage:'SQLite'});});
 it.each(['/','/assets/app.js','/api/documents','/api/progress','/api/words'])('protects %s before returning private content',async path=>{const r=await fetch(base+path);expect(r.status).toBe(401);expect(r.headers.get('www-authenticate')).toContain('Basic');});
 it('rejects invalid authorization without accepting a prefix',async()=>{const r=await fetch(base+'/api/documents',{headers:{Authorization:headers.Authorization+'extra'}});expect(r.status).toBe(401);});
 it('serves the production HTML after login',async()=>{const r=await fetch(base+'/',{headers});expect(r.status).toBe(200);expect(r.headers.get('content-type')).toContain('text/html');expect(await r.text()).toContain('Deutsch B2');});
 it('serves JS with the proper MIME and supports HEAD',async()=>{const r=await fetch(base+'/assets/app.js',{method:'HEAD',headers});expect(r.status).toBe(200);expect(r.headers.get('content-type')).toContain('text/javascript');expect(await r.text()).toBe('');});
 it('serves API under the same authenticated origin',async()=>{const r=await fetch(base+'/api/documents',{headers});expect(r.status).toBe(200);expect(await r.json()).toEqual([]);});
 it('retains the mutation header requirement after login',async()=>{const r=await fetch(base+'/api/quiz',{method:'POST',headers,body:'{}'});expect(r.status).toBe(403);});
 it('does not fall back to the SPA for missing API routes',async()=>{const r=await fetch(base+'/api/unknown',{headers});expect(r.status).toBe(404);expect(r.headers.get('content-type')).toContain('application/json');});
 it.each(['/private.txt','/%2e%2e/private.txt','/assets/missing.js'])('does not disclose private files or missing assets at %s',async path=>{const r=await fetch(base+path,{headers});expect(r.status).toBe(404);expect(await r.text()).not.toContain('not a public file');});
 it('fails to start production without configured credentials',()=>{const r=spawnSync(process.execPath,['server/production.mjs'],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000});expect(r.status).not.toBe(0);expect(r.stderr).toContain('Set TRAINER_AUTH_USER');});
});
