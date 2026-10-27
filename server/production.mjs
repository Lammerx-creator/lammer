import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { createApp } from './server.mjs';
const user=process.env.TRAINER_AUTH_USER;
const password=process.env.TRAINER_AUTH_PASSWORD;
if(!user||user.includes(':')||!password||password.length<16){
 throw new Error('Set TRAINER_AUTH_USER (without colon) and TRAINER_AUTH_PASSWORD (at least 16 characters) securely in hosting settings.');
}
const staticDir=resolve('dist');await access(resolve(staticDir,'index.html'));
const port=Number(process.env.PORT||8080);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
const {app}=await createApp(resolve(process.env.TRAINER_DATA_DIR||'data'),{staticDir,auth:{user,password}});
app.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`Production server ready on port ${port}; SQLite and PDFs use persistent data storage.`));
let closing=false;
const shutdown=()=>{if(closing)return;closing=true;app.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();};
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
