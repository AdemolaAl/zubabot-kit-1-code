// New sign-up goes straight through (no waiting for Affstore), confirmed in the background; in-app deposit + return
const {chromium}=require('playwright');const crypto=require('crypto');
function initData(id,name){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),query_id:'Q',user:JSON.stringify({id,first_name:name})});const dcs=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const sec=crypto.createHmac('sha256','WebAppData').update('111:TEST').digest();p.set('hash',crypto.createHmac('sha256',sec).update(dcs).digest('hex'));return p.toString()}
const A='http://127.0.0.1:9950';
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await ctx.route('https://telegram.org/**',r=>r.abort());
await ctx.route('https://iqoption.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<h1>IQ cashier</h1>'}));
const ID=initData(8101,'Ada');
await ctx.addInitScript(([d])=>{let bal=0;try{bal=+(localStorage.getItem('mockbal')||0)}catch(e){};window.__mock={log:[],results:[],balance:bal,userId:196641500,closeAfterMs:1500,fail:null};window.Telegram={WebApp:{initData:d,initDataUnsafe:{user:{id:8101,first_name:'Ada'}},ready(){},expand(){},openLink(u){location.href=u}}};window.speechSynthesis=undefined},[ID]);
await p.goto('http://127.0.0.1:9951/');await p.waitForTimeout(3300);
await p.click('text=Start my 3 months free');await p.waitForTimeout(500);
const t0=Date.now();await p.click('text=Create my free IQ Option account');
await p.waitForSelector('text=Account connected',{timeout:20000});
console.log('connected without postback in',Math.round((Date.now()-t0)/1000)+'s',JSON.stringify(await p.evaluate(()=>[S.connected,!!S.linkPending,S.iqId])));
await p.screenshot({path:'test/f1.png'});
await fetch(A+'/api/postback/affstore?key=PBK&event=registration&user_id=196641500&afftrack=Zubabot_tg8101&tid=r1');
await p.waitForFunction(()=>!S.linkPending,null,{timeout:15000});console.log('confirmed in background',await p.evaluate(()=>[S.connected,S.linkPending]));
await p.click('text=Continue');await p.waitForTimeout(4500);await p.click('#nmGo');await p.waitForTimeout(500);await p.click('.acc-big',{force:true});await p.waitForTimeout(6000);
await p.evaluate(()=>{CTX.depPick=50;depDetect()});await p.waitForTimeout(400);await p.screenshot({path:'test/f2.png'});
console.log('deposit sheet',JSON.stringify(await p.evaluate(()=>document.querySelector('#ovl').innerText.replace(/\s+/g,' ').slice(0,200))));
await p.evaluate(()=>localStorage.setItem('mockbal','50'));
await p.click('text=Continue to deposit');await p.waitForURL(/iqoption\.com/,{timeout:8000});console.log('opened in same window:',p.url());
await p.goto('http://127.0.0.1:9951/');await p.waitForTimeout(5000);
console.log('after reopen',JSON.stringify(await p.evaluate(()=>[S.balance,S.provDep,activated(),S.depOut])));await p.screenshot({path:'test/f3.png'});
console.log('ERR',errs);await b.close();})().catch(e=>{console.error(e);process.exit(1)});
