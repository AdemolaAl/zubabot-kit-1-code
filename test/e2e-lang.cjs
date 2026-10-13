// Browser checks for languages and mentors (demo app, no server):
//  A English with a funnel mentor (James): no "Roland" anywhere, James's name and photo instead
//  B English funnel mentor with no lives: no live screen, no live buttons
//  C Spanish: no English left on screen, no Roland, local AI traders present
//  D plain English: Roland as usual (sanity)
//  E Region & language switcher in the side menu
// node test/e2e-lang.cjs <demo.html>
const {chromium} = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const DEMO = process.argv[2]; const WEB = path.join(__dirname, '..', 'web');
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); const f = u === '/' ? DEMO : path.join(WEB, u);
  if (!f.startsWith(WEB) && f !== DEMO || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.jpg') ? 'image/jpeg' : f.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8'); fs.createReadStream(f).pipe(s); }).listen(9961);
const STATE = "S.ob=9;S.connected=true;S.registered=true;S.name='Alex';S.gender='man';S.face=1;S.dep=2500;S.claimedDep=2500;S.balance=2400;S.coins=9000;S.tokens=900;S.tourDone=1;S.coach=true";
const SHEETS = ['drawer()', 'upgradeSheet()', 'openSupport()', 'AIP.list()', "AIP.open('luna')", 'actSheet()', 'notifs()', "getCoins('coins')"];
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok -', m); };
async function open(b, {query = '', init = null, arg = null, state = STATE} = {}) {
  const ctx = await b.newContext({viewport: {width: 390, height: 844}});
  if (init) await ctx.addInitScript(init, arg);
  await ctx.addInitScript(() => { window.open = () => null; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.dismiss().catch(() => {}));
  await p.goto('http://127.0.0.1:9961/' + query); await p.waitForTimeout(2200);
  if (state) { await p.evaluate((s) => { eval(s); save(); }, state); await p.reload(); await p.waitForTimeout(2200); }
  return {ctx, p, errs};
}
// every screen and the main sheets: all visible text + image sources
async function sweep(p) {
  const views = await p.evaluate(() => Object.keys(VIEWS)); const texts = []; const imgs = new Set();
  const grab = async () => { const r = await p.evaluate(() => [document.body.innerText, [...document.querySelectorAll('img')].filter((i) => i.offsetParent).map((i) => i.src.slice(0, 80))]); texts.push(r[0]); r[1].forEach((x) => imgs.add(x)); };
  for (const v of views) { await p.evaluate((v) => { try { closeOvl(); } catch (e) {} try { go(v); } catch (e) {} }, v); await p.waitForTimeout(450); await grab(); }
  for (const f of SHEETS) { await p.evaluate((f) => { try { closeOvl(); } catch (e) {} try { eval(f); } catch (e) {} }, f); await p.waitForTimeout(500); await grab(); }
  return {text: texts.join('\n'), imgs: [...imgs], views};
}
(async () => {
  const b = await chromium.launch();
  const JAMES = {custom: true, lang: 'en', name: 'James', role: 'Head trader', bio: 'Ten years on forex.', photo: 'mentors/lead-es.jpg', lives: 'main', on: true, times: ['19:00'], tz: 'GMT', offset: 0, link: 'https://example.com/live', base: 'Roland'};

  // A
  const setFM = (m) => { try { localStorage.setItem('zb_fm', JSON.stringify(m)); } catch (e) {} };
  let {ctx, p, errs} = await open(b, {init: setFM, arg: JAMES});
  let s = await sweep(p);
  const rol = (s.text.match(/.{0,40}\bRoland\b.{0,40}/g) || []);
  ok(rol.length === 0, 'A: no "Roland" on any screen' + (rol.length ? ' -> ' + rol.slice(0, 4).join(' | ') : ''));
  ok(/James/.test(s.text), 'A: James shown');
  ok(s.imgs.some((x) => /mentors\/lead-es\.jpg/.test(x)), 'A: James\'s photo shown');
  ok(await p.evaluate(() => COACHES.roland.name === 'James' && RT_TZ === 'GMT'), 'A: live times from the funnel mentor');
  ok(errs.length === 0, 'A: no page errors ' + errs.slice(0, 3).join(' | ')); await ctx.close();

  // B
  ({ctx, p, errs} = await open(b, {init: setFM, arg: {...JAMES, name: 'Grace', lives: 'off', on: false, times: [], link: ''}}));
  s = await sweep(p);
  ok(!/\bRoland\b/.test(s.text), 'B: no Roland'); ok(/Grace/.test(s.text), 'B: Grace shown (mentor chat kept)');
  await p.evaluate(() => go('live')); await p.waitForTimeout(400); ok(await p.evaluate(() => (window.CUR || window.cur || '') !== 'live' && !document.querySelector('.livecard:not([style*="none"])')), 'B: live screen redirected');
  ok(errs.length === 0, 'B: no page errors ' + errs.slice(0, 3).join(' | ')); await ctx.close();

  // C — every language
  const LOC = {es: ['Sofía', /Valentina|Santiago|Daniela|Alejandro/], pt: ['Bia', /Camila|Lucas|Júlia|Julia|Thiago/], tl: ['Joy', /Bea|Carlo|Trisha|Jomar/], fr: ['Aïcha', /Awa|Yannick|Fatou|Cédric|Cedric/], th: ['Mint', /พลอย|แบงก์|เฟิร์น|ตี๋|Ploy|Bank|Fern|Tee/]};
  for (const [L, [sup, ais]] of Object.entries(LOC)) {
    ({ctx, p, errs} = await open(b, {query: '?l=' + L, state: STATE}));
    ok(await p.evaluate(() => ZBI18N.lang) === L, `C ${L}: loaded`);
    s = await sweep(p);
    const miss = await p.evaluate(() => [...ZBI18N._miss].filter((k) => !/live|WAT/i.test(k)));
    ok(!/\bRoland\b/.test(s.text), `C ${L}: no Roland`); ok(!/\bWAT\b/.test(s.text), `C ${L}: no Nigerian live times`);
    ok(!/\b(Emily|Noah|Olivia|Jake|Leah|Amara|Daniel|Zainab|Kelvin|Grace) · /.test(s.text) && s.text.includes(sup + ' · '), `C ${L}: support is ${sup}`);
    ok(ais.test(s.text), `C ${L}: local AI traders listed`);
    const EN = /\b(the|your|and|with|you|Fund|Deposit|Trade now|Signals?|Open|Close|Start|Withdraw|Settings|Today|Wins?|Loss)\b/g;
    const lines = s.text.split('\n').map((x) => x.trim()).filter((x) => x && (x.match(EN) || []).length >= 2 && !/IQ Option|Zubabot/.test(x));
    if (miss.length || lines.length) console.log(`   ${L} untranslated:`, miss.slice(0, 6), 'English-looking:', lines.slice(0, 4));
    ok(miss.length <= (L === 'tl' ? 25 : 5), `C ${L}: texts still waiting for translation: ${miss.length}`);
    ok(lines.length <= (L === 'tl' ? 40 : 2), `C ${L}: English left on screen: ${lines.length}`);
    ok(errs.length === 0, `C ${L}: no page errors ` + errs.slice(0, 3).join(' | ')); await ctx.close();
  }

  // D
  ({ctx, p, errs} = await open(b, {state: STATE}));
  s = await sweep(p); ok(/\bRoland\b/.test(s.text), 'D: English shows Roland'); ok(errs.length === 0, 'D: no page errors ' + errs.slice(0, 3).join(' | '));
  // E
  await p.evaluate(() => { try { closeOvl(); } catch (e) {} drawer(); }); await p.waitForTimeout(400);
  ok(await p.evaluate(() => !!document.querySelector('.zr-mi')), 'E: Region & language in the side menu');
  await p.evaluate(() => { closeOvl(); regionSheet(); }); await p.waitForTimeout(300);
  const regions = await p.evaluate(() => [...document.querySelectorAll('.zr-row b')].map((x) => x.textContent));
  ok(regions.length === 6, 'E: 6 regions ' + regions.join(', '));
  await p.evaluate(() => regionPick('pt')); await p.waitForTimeout(300); ok(/AI traders/.test(await p.evaluate(() => document.getElementById('ovl') ? document.getElementById('ovl').innerText : document.body.innerText)), 'E: warning about AI + language before switching');
  // F: a trade you placed yourself shows as yours, not an AI's
  await p.evaluate(() => { closeOvl(); S.history = [{pair: 'EUR/USD OTC', dir: 'buy', stake: 100, win: true, pl: 85, ai: null, manual: true, t: 'Today', steps: 0}, {pair: 'GBP/USD', dir: 'sell', stake: 10, win: true, pl: 8.5, ai: 'viza', t: 'Today', steps: 0}]; save(); CTX.tab = 'history'; go('trades', {tab: 'history'}); });
  await p.waitForTimeout(500); await p.evaluate(() => { const b = [...document.querySelectorAll('button,div')].find((x) => x.textContent.trim() === 'History'); if (b) b.click(); }); await p.waitForTimeout(400);
  const ht = await p.evaluate(() => document.body.innerText);
  ok(/\$100 · your trade/.test(ht), 'F: manual trade says "your trade"'); ok(/\$10 with Viza/.test(ht), 'F: AI trade still names the AI');
  await ctx.close();
  await b.close(); srv.close(); console.log(process.exitCode ? 'LANG E2E FAILED' : 'LANG E2E PASSED');
})();
