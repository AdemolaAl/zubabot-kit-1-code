// Browser test: a real call with hold-to-talk (fake microphone), the free welcome call, the phone-voice replacement, and a teammate's reply in the in-app support chat.
const {chromium}=require('playwright');const crypto=require('crypto');const assert=require('assert');
function initData(id,name){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),query_id:'Q',user:JSON.stringify({id,first_name:name})});const dcs=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const sec=crypto.createHmac('sha256','WebAppData').update('111:TEST').digest();p.set('hash',crypto.createHmac('sha256',sec).update(dcs).digest('hex'));return p.toString()}
(async()=>{const b=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:390,height:844},permissions:['microphone']});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await ctx.route('https://telegram.org/**',r=>r.abort());
await ctx.addInitScript(([d])=>{window.Telegram={WebApp:{initData:d,initDataUnsafe:{user:{id:8101,first_name:'Tobi'}},ready(){},expand(){},openLink(u){}}};
  // like Telegram on Android: no phone voice, no voice typing
  try{Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true,writable:true})}catch(e){} window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined},[initData(8101,'Tobi')]);
await p.goto('http://127.0.0.1:9932/');await p.waitForTimeout(3500);
const hasShim=await p.evaluate(()=>!!window.__zbSpeech&&typeof speechSynthesis.speak==='function');console.log('phone voice replaced by our voice:',hasShim);assert(hasShim);
await p.evaluate(()=>{S.ob=9;S.connected=true;S.registered=true;S.name='Tobi';S.dep=150;S.tokens=50;S.owned=['luna','viza'];S.ai='luna';CTX.zfSnooze=1;S.tourDone=1;save();go('call')});await p.waitForTimeout(800);
await p.waitForTimeout(2500);await p.evaluate(()=>{closeOvl();go('call')});await p.waitForTimeout(600);await p.evaluate(()=>startCall());await p.waitForTimeout(3500);
await p.screenshot({path:'test/v0.png'});console.log('el at hold:',await p.evaluate(()=>{const h=$('zvHold');if(!h)return 'none';const r=h.getBoundingClientRect();const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e.outerHTML.slice(0,120)}));const hold=await p.$('#zvHold');console.log('hold-to-talk button:',!!hold);assert(hold);
assert(!(await p.evaluate(()=>[...document.querySelectorAll('a')].some(a=>/elevenlabs/.test(a.href)))),'no external voice link');
const box=await hold.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.waitForTimeout(1600);
console.log('while holding:',await p.evaluate(()=>$('callSt').textContent));await p.mouse.up();
await p.waitForTimeout(6000);console.log('view now:',await p.evaluate(()=>VIEW+' '+(document.getElementById('toast')||{}).textContent));const cap=await p.evaluate(()=>$('callCap').textContent+' | '+$('callSt').textContent);console.log('after reply:',cap);
const vl=await (await fetch('http://127.0.0.1:9931/vlog')).json();const stt=vl.find(x=>x[0]==='stt');console.log('mic audio sent:',stt&&stt[1],stt&&stt[2],'bytes');assert(stt&&stt[2]>1000);
assert(/IQ Option account|approve every trade|Ready to fund/.test(cap),'reply played with captions');
console.log('fund card on call:',await p.evaluate(()=>!!document.querySelector('#callCard .zf-cta')));
await p.screenshot({path:'test/v1-call.png'});
await p.evaluate(()=>endCall());await p.waitForTimeout(800);
// free welcome call before funding
const p2=await ctx.newPage();p2.on('pageerror',e=>errs.push(e.message));await p2.addInitScript(([d])=>{window.Telegram={WebApp:{initData:d,initDataUnsafe:{user:{id:8102,first_name:'Lola'}},ready(){},expand(){},openLink(u){}}};try{Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true,writable:true})}catch(e){}},[initData(8102,'Lola')]);
await p.close();const pp=p2;await pp.goto('http://127.0.0.1:9932/');await pp.waitForTimeout(3500);
await pp.evaluate(()=>{S.ob=9;S.connected=true;S.registered=true;S.name='Lola';S.dep=0;CTX.zfSnooze=1;S.tourDone=1;save();go('home');fundCall()});await pp.waitForTimeout(1500);
assert(!(await pp.$('.fc-real')),'external demo link removed');
await pp.waitForTimeout(9000);console.log('fund ovl:',await pp.evaluate(()=>!!document.querySelector('.fcall')));await pp.screenshot({path:'test/v2a.png'});
const mic=await pp.$('#fcMic');const mb=await mic.boundingBox();await pp.mouse.move(mb.x+mb.width/2,mb.y+mb.height/2);await pp.mouse.down();await pp.waitForTimeout(1500);await pp.mouse.up();await pp.waitForTimeout(7000);
const fc=await pp.evaluate(()=>($('fcYou')||{}).textContent+' | '+($('fcCap')||{}).textContent);console.log('welcome call:',fc);assert(/You: is my money safe/.test(fc));
await pp.screenshot({path:'test/v2-fundcall.png'});
await pp.evaluate(()=>endFundCall());
// in-app support: ask for a human, teammate replies from the admin
await pp.evaluate(()=>{closeOvl();openSupport()});await pp.waitForTimeout(2500);
await pp.fill('#sin','I want to talk to a human');await pp.evaluate(()=>supSend());await pp.waitForTimeout(3000);
const H={'Content-Type':'application/json','X-Admin-Key':'ADM'};
await fetch('http://127.0.0.1:9930/api/admin/inbox/take',{method:'POST',headers:H,body:JSON.stringify({tg_id:'8102'})});
await fetch('http://127.0.0.1:9930/api/admin/inbox/reply',{method:'POST',headers:H,body:JSON.stringify({tg_id:'8102',text:'Hi Tobi, I’m here. What happened?'})});
await pp.waitForTimeout(6000);const sc=await pp.evaluate(()=>$('sc').innerText);console.log('support chat shows teammate:',/I’m here. What happened/.test(sc));assert(/getting a teammate/.test(sc)&&/I’m here. What happened/.test(sc));
console.log('header:',await pp.evaluate(()=>document.querySelector('.sup-head').innerText.replace(/\s+/g,' ')));
await pp.screenshot({path:'test/v3-support.png'});
console.log('ERR',JSON.stringify(errs));assert(!errs.length);console.log('VOICE E2E PASSED');await b.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
