import {cp,mkdir} from 'node:fs/promises';
await mkdir('public/pdfjs',{recursive:true});
await cp('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs','public/pdfjs/pdf.worker.min.mjs');
for(const name of ['cmaps','standard_fonts'])await cp('node_modules/pdfjs-dist/'+name,'public/pdfjs/'+name,{recursive:true});

await cp('node_modules/pdfjs-dist/LICENSE','public/pdfjs/LICENSE');
