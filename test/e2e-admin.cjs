// Admin in a browser: loads with no script errors, every tab opens on a phone (390px) and a laptop without page errors
// or sideways scrolling, funnels are grouped by language. Needs: node test/admin-demo-server.mjs running on :9990.
// node test/e2e-admin.cjs [shotsDir]
const {chromium} = require('playwright'); const fs = require('fs');
const SHOTS = process.argv[2]; const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok -', m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[390, 844], [1366, 860]]) {
    const ctx = await b.newContext({viewport: {width: w, height: h}, deviceScaleFactor: SHOTS ? 2 : 1}); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.dismiss().catch(() => {}));
    await p.goto('http://127.0.0.1:9990/admin#key=OWNERKEY'); await p.waitForTimeout(1500);
    ok(await p.evaluate(() => typeof show === 'function'), `${w}px: admin script loads`);
    const tabs = await p.evaluate(() => [...document.querySelectorAll('section[id^="t-"]')].map((s) => s.id.slice(2))); const wide = [];
    for (const t of tabs) { await p.evaluate((t) => { try { closeDrw(); } catch (e) {} show(t); }, t); await p.waitForTimeout(700);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > w + 2) wide.push(`${t}:${sw}`);
      if (SHOTS && w < 500) { fs.mkdirSync(SHOTS, {recursive: true}); await p.screenshot({path: `${SHOTS}/${t}.png`}); } }
    ok(tabs.length >= 15, `${w}px: ${tabs.length} tabs`); ok(!wide.length, `${w}px: no sideways scrolling ${wide.join(' ')}`);
    await p.evaluate(() => show('funnels')); await p.waitForTimeout(700);
    const groups = await p.evaluate(() => [...document.querySelectorAll('.fn-lgh b')].map((x) => x.textContent));
    ok(groups.length >= 4 && groups[0] === 'English', `${w}px: funnels grouped by language: ${groups.join(', ')}`);
    await p.evaluate(() => fnNewClassic()); await p.waitForTimeout(400); ok(await p.evaluate(() => !!document.getElementById('fMOn')), `${w}px: funnel settings form with mentor card`);
    if (SHOTS && w < 500) await p.screenshot({path: `${SHOTS}/funnel-new.png`});
    // funnel builder: 3 steps with a live Telegram preview, creates the flow + funnel in one go
    await p.evaluate(() => { closeDrw(); show('funnels'); }); await p.waitForTimeout(600);
    await p.evaluate(() => fbOpen()); await p.waitForTimeout(700);
    await p.click('.fb-type:has-text("Auto-accept channel")'); await p.click('#fb .fb-foot .btn.sun'); await p.waitForTimeout(300);
    await p.fill('#fbName', 'Builder test ' + w); await p.fill('#fbCh', '@buildertest'); await p.click('#fb .fb-foot .btn.sun'); await p.waitForTimeout(300);
    await p.click('#fb .chip:has-text("Short & direct")'); await p.fill('.fbT[data-i="0"]', 'Hi {name}, preview me'); await p.waitForTimeout(300);
    ok(/Hi Tobi, preview me/.test(await p.evaluate(() => document.getElementById('tgc').innerText)), `${w}px: preview updates as you type`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth) <= w + 2, `${w}px: builder fits the screen`);
    ok(await p.evaluate(() => !!document.getElementById('fbFOn')), `${w}px: follow-ups option in the builder`);
    await p.click('#fbFEv .chip:has-text("3 h")'); await p.click('#fbFStg .chip:has-text("Funded but not trading")');
    await p.click('#fbSave'); await p.waitForTimeout(1500);
    const made = await p.evaluate((w) => FN.funnels.find((f) => f.name === 'Builder test ' + w), w);
    ok(made && made.type === 'join' && made.channel_id === '@buildertest' && made.flow, `${w}px: builder created the funnel with its own flow`);
    ok(made && made.follow && made.follow.on && made.follow.every === 180 && made.follow.style === 'ai' && !made.follow.stages.includes('funded') && made.follow.stages.includes('no_deposit'), `${w}px: follow-up settings saved with the funnel ${JSON.stringify(made && made.follow)}`);
    await p.evaluate((s) => fnEdit(s), made.slug); await p.waitForTimeout(400); ok(await p.evaluate(() => $('fEOn').classList.contains('on') && document.querySelector('#fEEv .chip.on').dataset.k === '180'), `${w}px: Edit shows the funnel's follow-ups`);
    await p.evaluate(() => closeDrw());
    ok(!errs.length, `${w}px: no page errors ${errs.slice(0, 3).join(' | ')}`); await ctx.close();
  }
  await b.close(); console.log(process.exitCode ? 'ADMIN E2E FAILED' : 'ADMIN E2E PASSED');
})();
