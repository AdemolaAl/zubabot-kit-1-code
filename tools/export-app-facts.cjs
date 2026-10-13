// "Train" the AIs on the current app: reads the built app and writes server/knowledge/auto/app-facts.json
// (modes, every AI trader, live times, mentors, trainers). Run after every app change:
//   node tools/export-app-facts.cjs            (needs Playwright: npm i -g playwright && npx playwright install chromium)
// The server picks the new file up by itself on the next message. No restart.
const {chromium} = require('playwright'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'), app = path.join(root, 'web', 'zubabot.html'), out = path.join(root, 'server', 'knowledge', 'auto', 'app-facts.json');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.route(/^https?:\/\//, (r) => r.abort());               // offline: no API, no Telegram script
  await p.goto('file://' + app); await p.waitForTimeout(2500);
  const f = await p.evaluate(() => {
    const ais = Object.entries(AIS).map(([k, a]) => ({key: k, name: a.name, style: a.style, market: a.mk, price: a.price || 0, min: a.min || 0, maxOnly: !!a.maxOnly, desc: a.desc, vibe: a.vibe}));
    const co = Object.entries(COACHES).map(([k, c]) => ({key: k, n: c.name, role: c.role}));
    return {builtAt: new Date().toISOString(), tiers: TIERS, lives: typeof RT_SLOTS !== 'undefined' ? RT_SLOTS : [10, 15, 18, 22], leadMentor: (co.find((c) => /lead/i.test(c.role)) || {}).n || 'Roland',
      mentors: co.filter((c) => !/trainer/i.test(c.role)), trainers: co.filter((c) => /trainer/i.test(c.role)).map((c) => ({n: c.n, from: c.role.replace(/^Trainer · /, '')})), ais};
  });
  fs.mkdirSync(path.dirname(out), {recursive: true}); fs.writeFileSync(out, JSON.stringify(f, null, 1));
  console.log('app facts:', f.ais.length, 'AIs,', f.tiers.length, 'modes ->', path.relative(root, out)); await b.close();
})();
