import {writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
await import('./pdf-assets.mjs');
for(const args of [['node_modules/typescript/bin/tsc','-b'],['node_modules/vite/bin/vite.js','build',...process.argv.slice(2)]]){
 const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}
await import('./offline-assets.mjs');

const sha=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});
await writeFile('dist/release.json',JSON.stringify({app:'deutsch-b2-browser',storage:'indexeddb',sourceCommit:sha.status===0?sha.stdout.trim():null,builtAt:new Date().toISOString()},null,2)+'\n');
