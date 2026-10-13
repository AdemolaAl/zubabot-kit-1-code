const {chromium}=require('playwright');const crypto=require('crypto');
function initData(id,name){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),query_id:'Q',user:JSON.stringify({id,first_name:name})});const dcs=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const sec=crypto.createHmac('sha256','WebAppData').update('111:TEST').digest();p.set('hash',crypto.createHmac('sha256',sec).update(dcs).digest('hex'));return p.toString()}
const A='http://127.0.0.1:9950';const H={'Content-Type':'application/json','X-Admin-Key':'ADM'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://telegram.org/**',r=>r.abort());
const ID=initData(7001,'Tobi');
await p.addInitScript(([d])=>{window.Telegram={WebApp:{initData:d,initDataUnsafe:{user:{id:7001,first_name:'Tobi'}},ready(){},expand(){},openLink(u){window.__opened=(window.__opened||[]).concat(u)}}};window.speechSynthesis=undefined},[ID]);
const sh=async n=>p.screenshot({path:`test/e${n}.png`});
await p.goto('http://127.0.0.1:9951/');await p.waitForTimeout(3300);
await p.click('text=Start my 3 months free');await p.waitForTimeout(600);await sh(0);
await p.click('text=Create my free IQ Option account');await p.waitForTimeout(1200);await sh(1);
console.log('opened',await p.evaluate(()=>window.__opened));
// Affstore registration postback arrives
await fetch(A+'/api/postback/affstore?key=PBK&event=registration&user_id=196640777&afftrack=Zubabot_tg7001&tid=reg1');
await p.waitForSelector('text=Account connected',{timeout:15000});await sh(2);
await p.click('text=Continue');await p.waitForTimeout(4500);
await p.click('#nmGo');await p.waitForTimeout(500);await p.click('.acc-big',{force:true});await p.waitForTimeout(7500);await sh(3);
// deposit: user taps continue, Affstore FTD postback arrives
await p.evaluate(()=>{CTX.depPick=100;depDetect()});await p.waitForTimeout(800);await sh(4);
await fetch(A+'/api/postback/affstore?key=PBK&event=ftd&user_id=196640777&amount=100&tid=ftd1');
await p.waitForSelector('text=mode activated',{timeout:20000});await p.waitForTimeout(1500);await sh(5);
console.log('coins/tokens',await p.evaluate(()=>[S.coins,S.tokens,S.dep]));
await p.evaluate(()=>closeOvl());
// team posts a live signal
let r=await fetch(A+'/api/admin/signals',{method:'POST',headers:H,body:JSON.stringify({pair:'EUR/USD',dir:'buy',expiryMin:1,conf:87,note:'Roland',now:true})});const sig=(await r.json()).signal;
await p.evaluate(()=>{go('home');startTrade()});await p.waitForTimeout(3200);await sh(6);
await p.click('.opp2');await p.waitForTimeout(800);await sh(7);
await p.evaluate(()=>place());await p.waitForTimeout(500);await sh(8);
await p.click('text=I’ve placed it');await p.waitForTimeout(1500);await sh(9);
// admin scores it (manual pair). Shorten: resolve now, app settles when its timer ends -> force expiry
await fetch(A+'/api/admin/signals/resolve',{method:'POST',headers:H,body:JSON.stringify({id:sig.id,status:'win'})});
await p.waitForSelector('text=Trade won',{timeout:90000});await p.waitForTimeout(1200);await sh(10);
console.log('history',await p.evaluate(()=>JSON.stringify(S.history[0])));
// martingale: step 1 loses, server opens step 2, app follows it, step 2 wins
await p.evaluate(()=>closeOvl());
r=await fetch(A+'/api/admin/signals',{method:'POST',headers:H,body:JSON.stringify({pair:'EUR/USD',dir:'sell',expiryMin:1,conf:84,now:true})});const s2=(await r.json()).signal;
await p.evaluate(()=>{go('home');startTrade()});await p.waitForTimeout(3200);await p.click('.opp2');await p.waitForTimeout(700);
await p.evaluate(()=>place());await p.waitForTimeout(400);await p.click('text=I’ve placed it');await p.waitForTimeout(1500);await sh(11);
await fetch(A+'/api/admin/signals/resolve',{method:'POST',headers:H,body:JSON.stringify({id:s2.id,status:'loss'})});
await p.waitForFunction(()=>LIVE&&LIVE.step===1,null,{timeout:90000});await p.waitForTimeout(800);await sh(12);
const sg=await (await fetch(A+'/api/admin/signals?limit=5',{headers:H})).json();const st2=sg.signals.find(x=>x.chain_id===s2.id&&x.step===2);
console.log('step2',st2&&st2.id,st2&&st2.stake,await p.evaluate(()=>LIVE.sigId));
await fetch(A+'/api/admin/signals/resolve',{method:'POST',headers:H,body:JSON.stringify({id:st2.id,status:'win'})});
await p.waitForSelector('text=Recovered on step 1',{timeout:90000});await p.waitForTimeout(1000);await sh(13);
console.log('history2',await p.evaluate(()=>JSON.stringify(S.history.slice(0,2))));
console.log('ERR',JSON.stringify(errs));await b.close()})();
