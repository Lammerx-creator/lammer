import {spawnSync} from 'node:child_process';
import {mkdtemp,readdir,rm,cp,writeFile,access,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const root=process.cwd();
function git(args,cwd=root){const r=spawnSync('git',args,{cwd,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||'Git command failed');return r.stdout.trim();}
await access('dist/index.html');const release=JSON.parse(await readFile('dist/release.json','utf8'));
if(release.app!=='deutsch-b2-browser'||release.storage!=='indexeddb')throw new Error('Build the browser version first.');
const html=await readFile('dist/index.html','utf8');if(!html.includes('/lammer/assets/'))throw new Error('Build with npm run build -- --base=/lammer/ before publishing.');
const remote=git(['remote','get-url','origin']);const name=git(['config','user.name']),email=git(['config','user.email']);
const temp=await mkdtemp(join(tmpdir(),'deutschtrainer-pages-'));const target=join(temp,'checkout');
try{
 git(['clone','--single-branch','--branch','gh-pages',remote,target]);
 for(const entry of await readdir(target))if(!['.git','CNAME'].includes(entry))await rm(join(target,entry),{recursive:true,force:true});
 await cp(resolve('dist'),target,{recursive:true});await writeFile(join(target,'.nojekyll'),'');
 git(['config','user.name',name],target);git(['config','user.email',email],target);git(['add','--all'],target);
 if(git(['status','--porcelain'],target))git(['commit','-m','Publish browser PDF trainer '+String(release.sourceCommit||'').slice(0,7)],target);
 git(['push','origin','HEAD:gh-pages'],target);
 console.log('Pages branch updated: '+git(['rev-parse','HEAD'],target));
 console.log('Check https://lammerx-creator.github.io/lammer/release.json after GitHub Pages finishes.');
 await rm(temp,{recursive:true,force:true});
}catch(e){console.error('Publication failed. Prepared checkout retained at '+target);throw e;}
