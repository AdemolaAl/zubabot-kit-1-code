const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:9940/admin');await p.fill('#key','demo');await p.click('text=Open admin');await p.waitForTimeout(1200);await p.screenshot({path:'test/a1.png',fullPage:true});
for(const [t,n] of [['strategy','a2'],['signals','a3'],['results','a4'],['members','a5']]){await p.click(`#tabs button[data-t=${t}]`);await p.waitForTimeout(900);await p.screenshot({path:`test/${n}.png`,fullPage:true})}
const m=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});await m.goto('http://127.0.0.1:9940/admin');await m.fill('#key','demo');await m.click('text=Open admin');await m.waitForTimeout(1500);await m.click('#tabs button[data-t=results]');await m.waitForTimeout(800);await m.screenshot({path:'test/am.png'});
console.log('ERR',JSON.stringify(errs));await b.close()})()
