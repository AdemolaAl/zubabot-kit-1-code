const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('console',m=>m.type()==='error'&&e.push(m.text()));
await p.route('https://telegram.org/**',r=>r.abort());await p.addInitScript(()=>{window.Telegram={WebApp:{initData:'',initDataUnsafe:{},ready(){},expand(){},openLink(){}}}});
await p.goto('http://127.0.0.1:9951/');await p.waitForTimeout(3500);await p.screenshot({path:'test/peek.png'});console.log(JSON.stringify(e));await b.close()})()
