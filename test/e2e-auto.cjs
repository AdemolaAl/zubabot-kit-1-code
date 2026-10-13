const {chromium}=require('playwright');const crypto=require('crypto');const fs=require('fs');
function initData(id,name){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),query_id:'Q',user:JSON.stringify({id,first_name:name})});const dcs=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const sec=crypto.createHmac('sha256','WebAppData').update('111:TEST').digest();p.set('hash',crypto.createHmac('sha256',sec).update(dcs).digest('hex'));return p.toString()}
const A='http://127.0.0.1:9950';const H={'Content-Type':'application/json','X-Admin-Key':'ADM'};
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await ctx.route('https://telegram.org/**',r=>r.abort());
const ID=initData(8001,'Tobi');
await ctx.addInitScript(([d])=>{window.Telegram={WebApp:{initData:d,initDataUnsafe:{user:{id:8001,first_name:'Tobi'}},ready(){},expand(){},openLink(u){location.href=u}}};window.speechSynthesis=undefined},[ID]);
const sh=async n=>p.screenshot({path:`test/x${n}.png`});
await p.goto('http://127.0.0.1:9951/');await p.waitForTimeout(3300);
await p.click('text=Start my 3 months free');await p.waitForTimeout(500);await sh(1);
// Affstore will send the registration postback for this IQ user shortly after sign-up
setTimeout(()=>fetch(A+'/api/postback/affstore?key=PBK&event=registration&user_id=196640999&afftrack=tg8001&tid=reg1'),4000);
await p.click('text=Create my free IQ Option account');
await p.waitForURL(/connected=1|127\.0\.0\.1:9951\/(\?|$)/,{timeout:20000}).catch(()=>{});
await p.waitForTimeout(1500);await sh(2);
console.log('authorize params',fs.readFileSync('/tmp/zbauth.json','utf8'));
await p.waitForSelector('text=Account connected',{timeout:30000});await sh(3);
console.log('after connect',JSON.stringify(await p.evaluate(()=>[S.connected,S.iqId,S.balance,window.__mock.log.slice(0,2)])));
await p.click('text=Continue');await p.waitForTimeout(4500);await p.click('#nmGo');await p.waitForTimeout(500);await p.click('.acc-big',{force:true});await p.waitForTimeout(7000);
// deposit: balance jumps on IQ Option -> instant detection; Affstore confirms -> coins
await p.evaluate(()=>window.__mock.setBalance(350));await p.waitForTimeout(800);
await fetch(A+'/api/postback/affstore?key=PBK&event=ftd&user_id=196640999&amount=250&tid=ftd1');
await p.waitForSelector('text=mode activated',{timeout:30000});await p.waitForTimeout(1200);await sh(4);
console.log('after deposit',await p.evaluate(()=>[S.dep,S.coins,S.tokens,S.balance]));
await p.evaluate(()=>closeOvl());
// signal -> one tap -> placed automatically; loss -> martingale step 1 placed automatically -> win
let r=await fetch(A+'/api/admin/signals',{method:'POST',headers:H,body:JSON.stringify({pair:'EUR/USD',dir:'buy',expiryMin:1,conf:88,now:true})});
await p.evaluate(()=>{window.__mock.results=['loss','win'];go('home');startTrade()});await p.waitForTimeout(3200);await sh(5);
await p.click('.opp2');await p.waitForTimeout(800);await sh(6);
await p.evaluate(()=>place());await p.waitForTimeout(900);await sh(7);
await p.waitForFunction(()=>LIVE&&LIVE.step===1&&LIVE.iqId,null,{timeout:20000});await p.waitForTimeout(600);await sh(8);
await p.waitForSelector('text=Recovered on step 1',{timeout:20000});await p.waitForTimeout(800);await sh(9);
console.log('buys',JSON.stringify(await p.evaluate(()=>window.__mock.log.filter(x=>x[0]==='buy'))));
console.log('balance',JSON.stringify(await p.evaluate(()=>[S.balance,window.__mock.balance,S.history[0]])));
// failure path: insufficient balance
await p.evaluate(()=>closeOvl());await fetch(A+'/api/admin/signals',{method:'POST',headers:H,body:JSON.stringify({pair:'GBP/USD',dir:'sell',now:true})});
await p.evaluate(()=>{window.__mock.fail='market_closed';startTrade()});await p.waitForTimeout(3200);await p.click('.opp2');await p.waitForTimeout(600);await p.evaluate(()=>place());await p.waitForTimeout(1500);await sh(10);
console.log('fail sheet',JSON.stringify(await p.evaluate(()=>document.querySelector('#ovl').innerText.slice(0,140))));
const st=await (await fetch(A+'/api/admin/stats',{headers:H})).json();console.log('admin trades',JSON.stringify(st.trades),st.oauth);
// ===== Signal Room: real signal -> ticket -> digital OTC trade placed automatically, auto-gale, signal scored by the trade
await p.evaluate(()=>closeOvl());
await fetch(A+'/api/admin/strategy',{method:'POST',headers:H,body:JSON.stringify({mode:'live',pairs:[{s:'EUR/USD OTC',on:true,src:'manual',trend:'flat'}],ais:[{key:'luna',on:true,expiry:1}],leadSec:0,alignMinute:false})});
r=await fetch(A+'/api/admin/signals',{method:'POST',headers:H,body:JSON.stringify({pair:'EUR/USD OTC',dir:'sell',expiryMin:1,conf:86,ai:'luna',now:true})});const rs=(await r.json()).signal;
await p.evaluate(()=>{window.__mock.results=['loss','win'];window.__mock.closeAfterMs=1500;go('room')});await p.waitForTimeout(2500);await sh(20);
await p.click('.bg-ai.rec');await p.waitForTimeout(900);await p.click('.nx .btn.sun');await p.waitForTimeout(600);await sh(21);
await p.evaluate(()=>ROOM.set('amount',5));await p.evaluate(()=>{ROOM.set('when','now');ROOM.confirm()});await p.waitForTimeout(1200);await sh(22);
await p.waitForFunction(()=>ROOM.positions[0]&&ROOM.positions[0].step===1&&ROOM.positions[0].status==='open',null,{timeout:20000});await sh(23);
await p.waitForFunction(()=>ROOM.positions[0].status==='won',null,{timeout:20000});await p.waitForTimeout(800);await sh(24);
console.log('signal trade',JSON.stringify(await p.evaluate(()=>{const x=ROOM.positions[0];return [x.pair,x.dir,x.status,x.step,x.net,x.sigId!=null]})));
console.log('room buys',JSON.stringify(await p.evaluate(()=>window.__mock.log.filter(x=>x[0]==='digital'))));
const sg=await (await fetch(A+'/api/admin/signals?limit=10',{headers:H})).json();const scored=sg.signals.find(x=>x.id===rs.id);
console.log('signal scored by trade',scored.status,scored.result_src);
// ===== Open trades: several at once, + Add, auto-gale per trade, close early
await p.evaluate(()=>{closeOvl();window.__mock.log=[];window.__mock.results=['win','loss','win','loss','loss','win'];window.__mock.closeAfterMs=2500;go('room')});await p.waitForTimeout(1500);
await p.evaluate(()=>{ROOM.qset('pair','EUR/USD OTC');ROOM.quick('buy')});await p.waitForTimeout(600);
await p.evaluate(()=>ROOM.quick('sell'));await p.waitForTimeout(600);
await p.evaluate(()=>{ROOM.add(ROOM.positions[0].id)});await p.waitForTimeout(400);await p.evaluate(()=>ROOM.confirm());await p.waitForTimeout(700);
console.log('open now',JSON.stringify(await p.evaluate(()=>ROOM.positions.filter(x=>x.status==='open').map(x=>[x.dir,x.stake,x.iqId]))));
await sh(30);
// close the newest early
await p.evaluate(()=>ROOM.closeEarly(ROOM.positions[0].id));await p.waitForTimeout(600);await sh(31);await p.evaluate(()=>ROOM.doClose(ROOM.positions[0].id));
await p.waitForFunction(()=>ROOM.positions.slice(0,3).every(x=>!['open','placing'].includes(x.status)),null,{timeout:40000});await p.waitForTimeout(800);await sh(32);
console.log('positions',JSON.stringify(await p.evaluate(()=>ROOM.positions.slice(0,3).map(x=>[x.dir,x.status,x.step,x.net,x.closedEarly||false]))));
console.log('mock calls',JSON.stringify(await p.evaluate(()=>window.__mock.log)));
console.log('real balance',await p.evaluate(()=>[S.balance,window.__mock.balance]));
console.log('ERR',JSON.stringify(errs));await b.close()})();
