import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';const {chromium}=createRequire(process.env.NODE_PATH+'/')('playwright');
const root=path.resolve('.');
const st=http.createServer((q,s)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!fs.existsSync(f)){s.statusCode=404;return s.end()}s.setHeader('Content-Type',f.endsWith('.html')?'text/html':'text/javascript');s.end(fs.readFileSync(f))}).listen(9921);
let calls=[];const api=http.createServer(async(q,s)=>{let b='';for await(const c of q)b+=c;s.setHeader('Access-Control-Allow-Origin','*');s.setHeader('Access-Control-Allow-Headers','*');if(q.method==='OPTIONS'){s.statusCode=204;return s.end()}calls.push([q.url,q.headers['x-tg-init-data'],b]);s.setHeader('Content-Type','application/json');
 if(q.url==='/api/oauth/token')return s.end('{"ok":true,"accessToken":"AT"}');if(q.url==='/api/account/link')return s.end('{"ok":true,"linked":true,"source":"affiliate"}');s.end('{"ok":true}')}).listen(9920);
const b=await chromium.launch();const p=await b.newPage();p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>console.log('C',m.type(),m.text()));p.on('requestfailed',r=>console.log('RF',r.url()));
await p.goto('http://127.0.0.1:9921/test/client.html');await p.waitForFunction(()=>window.__out,null,{timeout:8000});
console.log(JSON.stringify(await p.evaluate(()=>window.__out),null,0));console.log('API',JSON.stringify(calls));await b.close();st.close();api.close();
