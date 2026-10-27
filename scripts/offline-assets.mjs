import {readdir,writeFile} from 'node:fs/promises';
async function files(path){const entries=await readdir('dist/'+path,{withFileTypes:true});const nested=await Promise.all(entries.map(e=>e.isDirectory()?files(path+e.name+'/'):path+e.name));return nested.flat();}
const paths=[...await files('assets/'),...await files('pdfjs/')];
await writeFile('dist/offline-assets.json',JSON.stringify(paths));
console.log(`Offline manifest: ${paths.length} bundled application and PDF assets.`);
