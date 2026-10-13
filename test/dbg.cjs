const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844}});const e=[];p.on('pageerror',x=>e.push('PE '+x.message));p.on('console',m=>m.type()==='error'&&e.push('CE '+m.text()));
await p.route('https://telegram.org/**',r=>r.abort());await p.addInitScript(()=>{window.Telegram={WebApp:{initData:'x',initDataUnsafe:{user:{id:1,first_name:'A'}},ready(){},expand(){},openLink(u){window.__o=u}}}});
await p.goto('http://127.0.0.1:9951/');await p.waitForTimeout(3300);await p.click('text=Start my 3 months free');await p.waitForTimeout(500);
console.log(await p.evaluate(()=>[typeof oaStart, String(oaStart).slice(0,80), window.ZB_LIVEMODE, window.ZB_AUTO]));
await p.click('text=Create my free IQ Option account');await p.waitForTimeout(1500);console.log('opened',await p.evaluate(()=>window.__o));console.log(JSON.stringify(e));await b.close()})()
