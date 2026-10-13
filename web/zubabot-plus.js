/* ===================== v21: mentors, training hub, AI of the week, coins by deposit or crypto, real AI brain =====================
   - Live sessions 4x a day (10 AM, 3 PM, 6 PM, 10 PM WAT) with a live schedule card. Mentors have real-looking photos.
   - Training: 8 short video lessons by three trainers (Jasmine, Sipho, Hannah) with captions and a "try it now" button.
   - Home: AI of the week + Top 5 this week (Pro and MAX mixed). Live mode ranks from real results (/api/ai/leaderboard).
   - Coins and tokens: "Claim with a deposit" (best value) or "Buy with crypto" through Zubabot Pay (our own gateway, /api/pay/*).
   - AI traders and support reply through the server's AI brain (/api/ai/chat) when it's set up, texting in short breaks
     and ending with a call-to-action card. Without it, the scripted replies keep working. */
(function () {
  const LIVEAPI = () => !!(window.ZB_LIVEMODE && window.ZBAPI);
  if (!IC.play) IC.play = '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>';
  if (!IC.pause) IC.pause = '<rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/>';
  if (!IC.grad) IC.grad = '<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4.2c0 1.3 2.5 2.8 5.5 2.8s5.5-1.5 5.5-2.8v-4.2"/><path d="M21.5 9.5v5"/>';
  if (!IC.rew) IC.rew = '<path d="M11 7 6 12l5 5M18 7l-5 5 5 5"/>';
  if (!IC.fwd) IC.fwd = '<path d="m13 7 5 5-5 5M6 7l5 5-5 5"/>';
  if (!IC.trophy) IC.trophy = '<path d="M8 4.5h8v5a4 4 0 0 1-8 0z"/><path d="M8 6.5H5a3 3 0 0 0 3 4M16 6.5h3a3 3 0 0 1-3 4M12 13.5v3.5M8.5 20h7M10 17h4"/>';
  if (!IC.qr) IC.qr = '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>';

  /* =========================== 1. mentors =========================== */
  const M = (k) => ({img: 'mentors/' + k + '.jpg'});
  Object.assign(COACHES.roland, {role: 'Lead mentor', bio: 'Leads the daily lives with our top traders. Trade the market together with the community.'});
  Object.assign(COACHES.drex, {role: 'Coach · Setups', f: M('drex'), when: 'Mon, Wed, Fri · 6 PM WAT'});
  Object.assign(COACHES.xane, {role: 'Coach · Money management', f: M('xane'), when: 'Tue, Thu · 6 PM WAT'});
  Object.assign(COACHES, {
    jasmine: {name: 'Jasmine', role: 'Trainer · Getting started', bio: 'Takes new members from sign-up to their first trade. Patient, funny and very clear.', when: 'Daily · 10 AM WAT', f: M('jasmine')},
    sipho: {name: 'Sipho', role: 'Trainer · Signals and AIs', bio: 'Shows you how to pick an AI and read a signal in seconds.', when: 'Tue, Thu, Sat · 3 PM WAT', f: M('sipho')},
    hannah: {name: 'Hannah', role: 'Trainer · Trade management', bio: 'Keeps your trades tidy: stake size, auto-gale and when to call it a day.', when: 'Mon, Wed · 10 PM WAT', f: M('hannah')},
    otieno: {name: 'Otieno', role: 'Mentor · Risk and mindset', bio: 'The calm voice in the room when the market gets loud.', when: 'Fri · 6 PM WAT', f: M('otieno')},
    lerato: {name: 'Lerato', role: 'Coach · Gold and crypto', bio: 'Loves gold and BTC setups. Explains every move in plain words.', when: 'Sat, Sun · 3 PM WAT', f: M('lerato')},
    diego: {name: 'Diego', role: 'Coach · Fast trades', bio: 'Lives for 30-second and 1-minute OTC setups.', when: 'Daily · 10 PM WAT', f: M('diego')}});

  /* live room: today's 4 sessions */
  const _live = VIEWS.live;
  VIEWS.live = () => {
    let h = _live(); const n = RTnext();
    const sched = `<div class="sech"><h2>Today’s lives</h2><span class="dim" style="font-size:12.5px">West Africa Time</span></div>
      <div class="lv-sched">${RT_SLOTS.map((x) => { const st = RTslot(x); return `<div class="lv-s ${st}"><b>${RTh(x)}</b><small>${st === 'live' ? '<i></i>Live now' : st === 'done' ? 'Ended' : st === 'next' ? 'Next' : 'Later'}</small></div>`; }).join('')}</div>`;
    h = h.replace('<div class="sech"><h2>Coaches</h2></div>', sched + '<div class="sech"><h2>Mentors</h2></div>');
    if (!n.live) h = h.replace(/<span class="livetag"><i><\/i>LIVE<\/span><\/header>/, `<span class="lv-next">${ic('cal', 14, 2.2)}Next: ${RT()}</span></header>`).replace('<div style="position:absolute;left:12px;top:12px;display:flex;gap:8px"><span class="livetag"><i></i>LIVE</span></div>', `<div style="position:absolute;left:12px;top:12px;display:flex;gap:8px"><span class="livetag" style="background:rgba(255,255,255,.14)">${nextLive()}</span></div>`);
    return h;
  };

  /* =========================== 2. training hub =========================== */
  const TR = {jasmine: {n: 'Jasmine', from: 'Getting started', flag: ''}, sipho: {n: 'Sipho', from: 'Signals and AIs', flag: ''}, hannah: {n: 'Hannah', from: 'Trade management', flag: ''}};
  const LESSONS = [
    {id: 'welcome', t: 'jasmine', title: 'Welcome: set up in 1 minute', d: 55, ch: 'Start here', go: ['Next lesson', 'next']},
    {id: 'deposit', t: 'jasmine', title: 'Fund your account on IQ Option', d: 60, ch: 'Start here', go: ['Fund my account', 'fund']},
    {id: 'pickai', t: 'sipho', title: 'Pick your AI trader', d: 44, ch: 'Start here', go: ['Pick my AI', "go('room')"]},
    {id: 'firsttrade', t: 'sipho', title: 'Place your first trade', d: 42, ch: 'Trading', go: ['Open the Signal Room', "go('room')"]},
    {id: 'gale', t: 'sipho', title: 'Auto-gale and your stake', d: 37, ch: 'Trading', go: ['Open My trades', "go('trades')"]},
    {id: 'mytrades', t: 'hannah', title: 'Track trades and withdraw', d: 41, ch: 'Trading', go: ['Open My trades', "go('trades')"]},
    {id: 'coins', t: 'jasmine', title: 'Coins and tokens', d: 41, ch: 'Grow', go: ['Get coins', "getCoins('coins')"]},
    {id: 'talk', t: 'hannah', title: 'Talk to your AI and join the lives', d: 44, ch: 'Grow', go: ['Message my AI', 'chat']}];
  // when screen recordings of IQ Option arrive, add them here: ZB_ACADEMY_VIDEOS = {deposit: 'academy/deposit.mp4', ...} (silent video, our voice plays over it)
  const VIDS = () => window.ZB_ACADEMY_VIDEOS || {};
  const CAPS = __ZB_CAPS__;
  const done = () => (S.acad = S.acad || {});
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const tface = (k, s, cls = '') => `<span class="ac-ph ${cls}" style="width:${s}px;height:${s}px"><img src="mentors/${k}.jpg" alt="" loading="lazy"></span>`;
  VIEWS.academy = () => {
    const n = LESSONS.filter((l) => done()[l.id]).length, nx = LESSONS.find((l) => !done()[l.id]) || LESSONS[0];
    let ch = '';
    return `<div class="scr">
      <div class="top"><button class="icb" aria-label="Back" onclick="go('home')">${ic('back', 18, 2.2)}</button><button class="icb" aria-label="Open menu" onclick="drawer()">${ic('menu', 20, 2.1)}</button></div>
      <header style="padding:14px 4px 0"><h1 style="font-size:30px;font-weight:800">Training</h1><p class="dim" style="font-size:14.5px;margin-top:4px">Learn Zubabot in 8 short videos. Do it with us on your phone.</p></header>
      <button class="ac-hero" onclick="ACAD.play('${nx.id}')">
        <span class="ac-hero-ph"><img src="mentors/${nx.t}_hd.jpg" alt=""><span class="ac-playbig">${ic('play', 30, 2)}</span></span>
        <span class="ac-hero-t"><small>${n ? 'Continue' : 'Start here'} · ${mmss(nx.d)}</small><b>${nx.title}</b><span>with ${TR[nx.t].n}</span></span>
      </button>
      <div class="ac-prog"><div><b>${n} of ${LESSONS.length}</b> watched</div><span><i style="width:${n / LESSONS.length * 100}%"></i></span></div>
      <div class="ac-trs">${Object.entries(TR).map(([k, t]) => `<div>${tface(k, 52)}<b>${t.n}</b><small>${t.from}</small></div>`).join('')}</div>
      ${LESSONS.map((l, i) => { const head = l.ch !== ch ? `<div class="sech"><h2>${(ch = l.ch)}</h2></div>` : ''; return head + `<button class="ac-row ${done()[l.id] ? 'done' : ''}" onclick="ACAD.play('${l.id}')">
        <span class="ac-th"><img src="mentors/${l.t}.jpg" alt="" loading="lazy"><span class="ac-pl">${done()[l.id] ? ic('check', 14, 3) : ic('play', 14, 2)}</span><em>${mmss(l.d)}</em></span>
        <span class="ac-rt"><small>Lesson ${i + 1} · ${TR[l.t].n}</small><b>${l.title}</b></span></button>`; }).join('')}
      <div class="ac-soon">${ic('grad', 20, 2)}<div><b>IQ Option walkthroughs</b><span>Screen-by-screen videos of signing up, depositing and placing trades on IQ Option are coming soon.</span></div></div>
    </div>`;
  };
  const ACAD = window.ACAD = {};
  let AU = null;
  ACAD.play = (id) => {
    const i = LESSONS.findIndex((l) => l.id === id), l = LESSONS[i]; if (!l) return; const t = TR[l.t], vid = VIDS()[id], V2 = window.ZB_ACADEMY_V2 === false ? '' : 'academy/v2/' + id + '.mp4';
    try { AU && AU.pause(); } catch (e) {}
    $('ovl').innerHTML = `<div class="ac-player" role="dialog" aria-label="${l.title}">
      <div class="ac-stage ${V2 ? 'v2' : vid ? 'vid' : ''}">
        ${V2 ? `<video id="acV" class="ac-v2" playsinline webkit-playsinline preload="auto" poster="mentors/${l.t}_hd.jpg"><source src="${V2}" type="video/mp4"><source src="${V2.replace('.mp4', '.webm')}" type="video/webm"></video>` : vid ? `<video id="acV" src="${vid}" muted playsinline preload="auto"></video><span class="ac-pip">${tface(l.t, 64, 'talk')}</span>` : `<img class="ac-kb" src="mentors/${l.t}_hd.jpg" alt="">`}
        <div class="ac-shade"></div>
        <div class="ac-top"><button class="icb glass" aria-label="Close" onclick="ACAD.close()">${ic('close', 18, 2.2)}</button><span class="ac-who">${t.n} · ${t.from}</span><span class="ac-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>${V2 ? `<button class="icb glass ac-fs" aria-label="Full screen" onclick="ACAD.fs()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>` : ''}</div>
        <div class="ac-cap" id="acCap"></div>
        <button class="ac-tap" id="acTap" aria-label="Play" onclick="ACAD.toggle()">${ic('play', 34, 2)}</button>
      </div>
      <div class="ac-ctl">
        <small class="dim">Lesson ${i + 1} of ${LESSONS.length}</small><h2>${l.title}</h2>
        <div class="ac-bar" id="acBar" onclick="ACAD.seek(event)"><i id="acFill"></i></div>
        <div class="ac-tm"><span id="acCur">0:00</span><span>${mmss(l.d)}</span></div>
        <div class="ac-btns"><button class="icb" aria-label="Back 10 seconds" onclick="ACAD.skip(-10)">${ic('rew', 20, 2.2)}</button><button class="ac-main" id="acMain" aria-label="Play or pause" onclick="ACAD.toggle()">${ic('play', 26, 2)}</button><button class="icb" aria-label="Forward 10 seconds" onclick="ACAD.skip(10)">${ic('fwd', 20, 2.2)}</button></div>
        <button class="btn sun" id="acGo" style="margin-top:14px" onclick="ACAD.act('${id}')"><span class="sw"></span>${l.go[0]} ${ic('right', 18, 2.6)}</button>
        ${LESSONS[i + 1] ? `<button class="btn" style="height:44px;font-size:14px;margin-top:4px" onclick="ACAD.play('${LESSONS[i + 1].id}')">Next: ${LESSONS[i + 1].title}</button>` : ''}
        ${CAPS[id] && !V2 ? `<details class="ac-tx"><summary>Read along</summary><p>${esc(CAPS[id].map((x) => x[2]).join(' '))}</p></details>` : ''}
      </div></div>`;
    const au = AU = V2 ? $('acV') : new Audio('academy/v2/' + id + '.mp3'); if (!V2) au.preload = 'auto';
    const V = V2 ? null : $('acV'), caps = V2 ? [] : CAPS[id] || [];
    if (V2) { const fb = () => { if (AU !== au) return; window.ZB_ACADEMY_V2 = false; ACAD.play(id); }; au.onerror = fb; const ls = au.querySelector('source:last-child'); if (ls) ls.onerror = fb; }   // video missing: fall back to voice + photo
    const ui = () => { if (AU !== au) return; const c = au.currentTime, d = au.duration || l.d; const f = $('acFill'); if (!f) return; f.style.width = Math.min(100, c / d * 100) + '%'; $('acCur').textContent = mmss(c);
      const cap = caps.find((x) => c >= x[0] - 0.15 && c <= x[1] + 0.6); $('acCap').innerHTML = cap ? `<span>${esc(cap[2])}</span>` : '';
      if (V && Math.abs(V.currentTime - c) > 0.4) try { V.currentTime = Math.min(c, V.duration || c); } catch (e) {} };
    const playing = (on) => { const m = $('acMain'), tp = $('acTap'); if (!m) return; m.innerHTML = ic(on ? 'pause' : 'play', 26, 2); tp.style.opacity = on ? 0 : 1; tp.style.pointerEvents = on ? 'none' : 'auto'; $('ovl').querySelector('.ac-stage').classList.toggle('on', on); if (V) on ? V.play().catch(() => {}) : V.pause(); };
    au.ontimeupdate = ui; au.onplay = () => AU === au && playing(true); au.onpause = () => AU === au && playing(false);
    au.onended = () => { if (AU !== au) return; playing(false); done()[id] = 1; save(); const g = $('acGo'); if (g) g.classList.add('pulse'); };
    au.play().catch(() => playing(false));
  };
  ACAD.fs = () => { const v = $('acV'); if (!v) return; try { (v.requestFullscreen || v.webkitEnterFullscreen || v.webkitRequestFullscreen).call(v); } catch (e) {} try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} };
  ACAD.toggle = () => { if (!AU) return; AU.paused ? AU.play().catch(() => {}) : AU.pause(); };
  ACAD.skip = (s) => { if (AU) AU.currentTime = Math.max(0, Math.min((AU.duration || 0) - 0.2, AU.currentTime + s)); };
  ACAD.seek = (e) => { if (!AU || !AU.duration) return; const r = $('acBar').getBoundingClientRect(); AU.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * AU.duration; };
  ACAD.close = () => { try { AU && AU.pause(); } catch (e) {} AU = null; closeOvl(); if (VIEW === 'academy') go('academy'); };
  ACAD.act = (id) => {
    const l = LESSONS.find((x) => x.id === id); done()[id] = 1; save(); try { AU && AU.pause(); } catch (e) {} AU = null; closeOvl();
    const a = l.go[1];
    if (a === 'next') { const i = LESSONS.indexOf(l); return ACAD.play(LESSONS[i + 1].id); }
    if (a === 'fund') return activated() ? upgradeSheet() : (window.ZF && ZF.plans ? ZF.plans() : actSheet());
    if (a === 'chat') return AIP.chat(S.ai || 'luna');
    new Function(a)();
  };
  const _co = closeOvl; closeOvl = function () { if (AU && document.querySelector('.ac-player')) { try { AU.pause(); } catch (e) {} AU = null; } return _co.apply(this, arguments); };

  /* =========================== 3. AI of the week + Top 5 =========================== */
  const week = () => { const d = new Date(Date.now() + 3600e3), j = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil(((d - j) / 864e5 + j.getUTCDay() + 1) / 7); };
  const isMax = (a) => a.maxOnly || a.min >= 2000;
  const pool = () => Object.keys(AIS).filter((k) => AIS[k].min >= 1000 || AIS[k].maxOnly);
  let LB = null; // real leaderboard from the server
  function rank() {
    const P = pool(); if (!P.length) return null;
    if (LIVEAPI()) {
      if (!LB) return null;
      const top = (LB.top || []).filter((r) => P.includes(r.key)).slice(0, 5);
      const aw = LB.aiOfWeek && P.includes(LB.aiOfWeek.key) ? LB.aiOfWeek : top[0];
      return aw ? {aw, top, real: true} : null;
    }
    // demo: rotates every Monday, Pro and MAX mixed (numbers are demo placeholders)
    let seed = week() * 9301 + 7; const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const pro = P.filter((k) => !isMax(AIS[k])).sort(() => r() - .5), mx = P.filter((k) => isMax(AIS[k])).sort(() => r() - .5);
    const pick = [pro[0], mx[0], pro[1], mx[1], pro[2]].filter(Boolean);
    const top = pick.map((k, i) => ({key: k, n: 34 + Math.floor(r() * 30), rate: 86 - i * 3 - Math.floor(r() * 2)}));
    return {aw: top[0], top, real: false};
  }
  const tierTag = (a) => isMax(a) ? `<span class="aw-t max">${TMARK('max', 13)}MAX</span>` : `<span class="aw-t pro">${TMARK('pro', 13)}PRO</span>`;
  const own = (k) => (S.owned || []).includes(k);
  function awBlock() {
    const R = rank(); if (!R) return '';
    const a = AIS[R.aw.key]; if (!a) return '';
    const stat = R.aw.n ? `<div class="aw-stats"><div><b class="num">${R.aw.rate}%</b><small>win rate</small></div><div><b class="num">${R.aw.n}</b><small>signals</small></div><div><b>${tfShort(a)}</b><small>trades</small></div></div>` : '';
    return `<section class="aw" id="aiWeek">
      <div class="aw-h"><span class="aw-pill">${ic('trophy', 14, 2.2)}AI of the week</span><span class="dim" style="font-size:12px">Week ${week()}</span></div>
      <button class="aw-main" onclick="AIP.open('${R.aw.key}')">${ZORB(a.f, 86, 0, 'idle')}<span class="aw-mt"><b>${a.name} ${tierTag(a)}</b><span>${a.style}</span></span></button>
      ${stat}
      <button class="btn ${own(R.aw.key) ? 'ink' : 'sun'} aw-go" onclick="${own(R.aw.key) ? `AIP.chat('${R.aw.key}')` : `AIP.open('${R.aw.key}')`}">${own(R.aw.key) ? `${ic('chat', 18, 2.2)}Message ${a.name}` : `<span class="sw"></span>${ic('lock', 16, 2.4)}Unlock ${a.name}`}</button>
      ${R.top.length > 1 ? `<div class="aw-top"><div class="aw-th"><b>Top 5 this week</b><small>Pro and MAX AIs</small></div>${R.top.map((x, i) => { const b = AIS[x.key]; if (!b) return ''; return `<button class="aw-r" onclick="AIP.open('${x.key}')"><span class="aw-n">${i + 1}</span>${face(b.f, 36)}<span class="aw-rn"><b>${b.name} ${tierTag(b)}</b><span class="aw-bar"><i style="width:${x.rate || 0}%"></i></span></span><span class="aw-rr">${x.rate ? `<b class="num">${x.rate}%</b>` : ''}${own(x.key) ? ic('check', 14, 2.8, 'var(--money-d)') : ic('lock', 13, 2.4, 'var(--dim)')}</span></button>`; }).join('')}</div>` : ''}
      ${R.real ? '' : '<p class="aw-demo">Demo numbers. The live app ranks AIs by their real signal results.</p>'}
    </section>`;
  }
  const tfShort = (a) => /scalp|sniper|quick|fast/i.test(a.style) ? '1 min' : /swing|patient|trend|big/i.test(a.style) ? '5–15 min' : '1–5 min';
  function trainCard() {
    const n = LESSONS.filter((l) => done()[l.id]).length; if (n >= 3) return '';
    return `<button class="ac-home" onclick="go('academy')"><span class="ac-hs">${['jasmine', 'sipho', 'hannah'].map((k, i) => tface(k, 34, '')).join('')}</span><span class="ac-ht"><b>${n ? 'Keep learning' : 'New here? Watch the 1-minute intro'}</b><small>8 short videos · ${n}/8 watched</small></span><span class="ac-hp">${ic('play', 14, 2)}</span></button>`;
  }
  const _home = VIEWS.home;
  VIEWS.home = () => {
    let h = _home(); const add = trainCard() + awBlock(); if (!add) return h;
    const i = h.indexOf('<button class="livecard"');
    if (i > 0) return h.slice(0, i) + add + h.slice(i);
    const j = h.lastIndexOf('</div>'); return h.slice(0, j) + add + h.slice(j);
  };
  if (LIVEAPI()) { const load = () => ZBAPI('/api/ai/leaderboard').then((d) => { LB = d; if (VIEW === 'home' && !$('aiWeek') && rank()) rerender(); }).catch(() => {}); setTimeout(load, 1500); setInterval(load, 15 * 60e3); }

  /* drawer: Training */
  const _drawer = drawer;
  window.academy = () => { closeOvl(); go('academy'); };
  drawer = function () { _drawer(); const o = $('ovl');
    o.querySelectorAll('.mi').forEach((m) => { const t = m.textContent.trim(); if (t === 'Academy') m.remove(); if (t === 'Coaches') m.lastChild.textContent = 'Mentors'; if (/^Live room/.test(t)) { const g = m.querySelector('.tag'); if (g && !RTnext().live) { g.textContent = RT(1); g.style.background = 'var(--soft)'; g.style.color = 'var(--ink)'; } } });
    const b = o.querySelector('.mi'); if (!b || o.innerHTML.includes('ACAD-MI')) return;
    const x = document.createElement('div'); x.innerHTML = `<button class="mi" data-k="ACAD-MI" onclick="closeOvl();go('academy')"><span class="mic">${ic('grad', 19, 2)}</span>Training videos<span class="ac-new">New</span></button>`; b.parentNode.insertBefore(x.firstChild, b); };

  /* =========================== 4. coins and tokens: deposit or crypto =========================== */
  const PK = {coins: [{id: 'c80', amount: 80, usd: 10}, {id: 'c220', amount: 220, usd: 25, tag: '+10% extra'}, {id: 'c500', amount: 500, usd: 50, tag: 'Best value'}],
    tokens: [{id: 't200', amount: 200, usd: 10}, {id: 't550', amount: 550, usd: 25, tag: '+10% extra'}, {id: 't1200', amount: 1200, usd: 50, tag: 'Best value'}]};
  if (LIVEAPI()) ZBAPI('/api/pay/packs').then((d) => { if (d && d.packs) Object.assign(PK, d.packs); PAYON = d.coins || {}; }).catch(() => {});
  let PAYON = null;
  window.getCoins = (kind = 'coins', short = 0, forAI) => {
    const tk = kind === 'tokens', depUsd = tk ? 100 : Math.max(activated() ? 10 : 20, Math.ceil((short || 0) / COIN_PER_USD));
    sheet(`<div class="gc">
      <div class="gc-ic">${tk ? ic('token', 34, 1.8, '#FFD21F') : '<span class="coin" style="width:40px;height:40px"><i style="width:18px;height:18px"></i></span>'}</div>
      <h2>${short ? `You need ${fmt(short)} more ${tk ? 'tokens' : 'coins'}` : tk ? 'Get tokens' : 'Get coins'}</h2>
      <p class="dim">${tk ? 'Tokens power voice calls with your AI.' : 'Coins unlock more AI traders in the marketplace.'} Pick how you want them.</p>
      <button class="gc-opt best" onclick="${tk ? 'closeOvl();upgradeSheet()' : `AIP.topup(${depUsd}${forAI ? `,'${forAI}'` : ''})`}">
        <span class="gc-o-ic">${ic('wallet', 20, 2.2, '#5A4400')}</span><span class="gc-o-t"><span class="gc-best">Best value</span><b>Claim with a deposit</b><small>${tk ? 'From $100 deposited: 2.5 tokens per $1. The money stays yours to trade.' : `$1 = ${COIN_PER_USD} coins, and the money stays yours to trade.${ZF && ZF.bonusLeft && !activated() && ZF.bonusLeft() > 0 ? ' +500 bonus coins on your first deposit today.' : ''}`}</small></span>${ic('right', 18, 2.4)}</button>
      <div class="gc-or"><span>or buy with crypto</span></div>
      <div class="gc-packs">${PK[kind].map((p) => `<button class="gc-p ${p.tag === 'Best value' ? 'hot' : ''}" onclick="payPick('${kind}','${p.id}')"><small>${p.tag || '&nbsp;'}</small><b class="num">${fmt(p.amount)}</b><span>${tk ? 'tokens' : 'coins'}</span><em>$${p.usd}</em></button>`).join('')}</div>
      <p class="dim gc-f">${ic('shield', 13, 2.2)}Zubabot Pay · USDT (TRC20) or Bitcoin · arrives automatically</p></div>`);
  };
  window.buyTokens = () => getCoins('tokens');
  window.checkout = (i) => payPick('tokens', (PK.tokens[i] || PK.tokens[0]).id);
  const _buyAI = buyAI;
  buyAI = function (k) { const a = AIS[k]; if (S.dep >= a.min && !(typeof freeLeft === 'function' && freeLeft() > 0) && S.coins < a.price) return getCoins('coins', a.price - S.coins, k); return _buyAI(k); };
  // wallet: a "Get coins" row next to the token packs
  const _wal = VIEWS.wallet;
  VIEWS.wallet = () => _wal().replace('<div class="sech"><h2>Buy tokens</h2><span class="dim" style="font-size:13px">Pay with crypto</span></div>',
    `<div class="sech"><h2>Get coins</h2></div><div class="gc-row"><button class="card" onclick="AIP.topup(${activated() ? 10 : 20})">${ic('wallet', 20, 2.2)}<b>Claim with deposit</b><small>$1 = ${COIN_PER_USD} coins</small></button><button class="card" onclick="getCoins('coins')">${ic('qr', 20, 2.2)}<b>Buy with crypto</b><small>USDT or BTC</small></button></div>
     <div class="sech"><h2>Buy tokens</h2><span class="dim" style="font-size:13px">Crypto, or claim with a deposit</span></div>`);

  window.payPick = (kind, id) => {
    const p = PK[kind].find((x) => x.id === id); CTX.pay = {kind, id};
    const on = PAYON || {usdt: 1, btc: 1};
    sheet(`<div class="gc"><button class="icb gc-back" aria-label="Back" onclick="getCoins('${kind}')">${ic('back', 18, 2.2)}</button>
      <h2>${fmt(p.amount)} ${kind}</h2><p class="dim">$${p.usd} · choose how you pay</p>
      ${[['usdt', 'USDT', 'Tron network (TRC20)', '#26A17B', '₮'], ['btc', 'Bitcoin', 'BTC network', '#F7931A', '₿']].map((c) => `<button class="gc-coin" ${on[c[0]] ? '' : 'disabled'} onclick="payGo('${c[0]}')"><span class="gc-cl" style="background:${c[3]}">${c[4]}</span><span class="gc-o-t"><b>${c[1]}</b><small>${on[c[0]] ? c[2] : 'Coming soon'}</small></span>${ic('right', 18, 2.4)}</button>`).join('')}
      <p class="dim gc-f">${ic('shield', 13, 2.2)}Paid straight to Zubabot’s own wallet. No card details needed.</p></div>`);
  };
  let PT = null;
  window.payGo = async (coin) => {
    const {kind, id} = CTX.pay, p = PK[kind].find((x) => x.id === id);
    sheet(`<div class="gc" style="padding:30px 0;text-align:center"><span class="gc-spin"></span><p class="dim" style="margin-top:14px">Creating your payment…</p></div>`);
    let inv;
    if (LIVEAPI()) { try { inv = (await ZBAPI('/api/pay/create', {kind, pack: id, coin})).payment; } catch (e) { sheet(`<div class="gc"><h2>Couldn’t start the payment</h2><p class="dim">${e.message === 'coin_not_enabled' ? 'This coin isn’t switched on yet. Try the other one.' : 'Please try again in a moment.'}</p><button class="btn sun" style="margin-top:14px" onclick="payPick('${kind}','${id}')"><span class="sw"></span>Try again</button></div>`); return; } }
    else inv = {id: 'demo', kind, qty: p.amount, usd: p.usd, coin, network: coin === 'usdt' ? 'USDT · TRC20' : 'Bitcoin', address: coin === 'usdt' ? 'TDemoAddressShownAfterSetup000000' : 'bc1qdemoaddressshownaftersetup0000', amount: coin === 'usdt' ? (p.usd + .137).toFixed(3) : (p.usd / 100000).toFixed(8), expiresAt: Date.now() + 30 * 60e3, now: Date.now(), demo: true};
    inv.uri = inv.uri || (coin === 'btc' ? `bitcoin:${inv.address}?amount=${inv.amount}` : inv.address);
    payShow(inv);
  };
  function payShow(inv) {
    const unit = inv.coin === 'usdt' ? 'USDT' : 'BTC', off = Date.now() - (inv.now || Date.now());
    sheet(`<div class="gc zp">
      <div class="zp-h"><span class="zp-logo">Z</span><div><b>Zubabot Pay</b><small>${inv.network}</small></div><span class="num zp-t" id="zpT">30:00</span></div>
      <div class="zp-amt"><small>Send exactly</small><button onclick="payCopy('${inv.amount}')"><b class="num">${inv.amount}</b> ${unit} ${ic('copy', 16, 2)}</button><span class="dim">for ${fmt(inv.qty)} ${inv.kind}</span></div>
      <div class="zp-qr" id="zpQR" aria-label="Payment QR code"></div>
      <div class="zp-addr"><div><small>To this ${inv.network} address</small><b class="num">${inv.address}</b></div><button class="icb" aria-label="Copy address" onclick="payCopy('${inv.address}')">${ic('copy', 18, 2)}</button></div>
      <div class="zp-warn">${ic('shield', 15, 2.2, '#5A4400')}<span>Send the <b>exact amount</b> on the <b>${inv.coin === 'usdt' ? 'TRC20 (Tron)' : 'Bitcoin'}</b> network. The last digits tell us it’s you.</span></div>
      <div class="zp-st" id="zpSt"><span class="gc-spin sm"></span>Waiting for your payment…</div>
      ${inv.demo ? `<button class="btn sun" style="margin-top:12px" onclick="payDone({qty:${inv.qty},kind:'${inv.kind}',demo:1})"><span class="sw"></span>Simulate payment (demo)</button>` : ''}
      <p class="dim gc-f">You can close this. ${inv.kind === 'coins' ? 'Coins' : 'Tokens'} arrive by themselves once the network confirms (USDT about 1 min, BTC 10–30 min).</p></div>`);
    qrInto($('zpQR'), inv.uri);
    clearInterval(PT); let k = 0;
    PT = setInterval(async () => {
      const t = $('zpT'); if (!t) { clearInterval(PT); return; }
      const left = Math.max(0, inv.expiresAt - (Date.now() - off)); t.textContent = mmss(left / 1000);
      if (inv.demo || ++k % 5) return;
      try { const r = await ZBAPI('/api/pay/status?id=' + encodeURIComponent(inv.id)); if (r.payment.status === 'paid') { clearInterval(PT); if (r.balance) { S.coins = r.balance.coins; S.tokens = r.balance.tokens; window.ZBW && ZBW.synced(); } payDone({qty: inv.qty, kind: inv.kind}); } } catch (e) {}
    }, 1000);
  }
  window.payCopy = (v) => { try { navigator.clipboard.writeText(v); } catch (e) {} toast('Copied'); };
  window.payDone = (x) => {
    clearInterval(PT); if (x.demo) { if (x.kind === 'tokens') S.tokens += x.qty; else S.coins += x.qty; } save(); try { SND.win(); confetti(30); } catch (e) {}
    sheet(`<div class="gc" style="text-align:center"><span class="pop gc-ok">${x.kind === 'tokens' ? ic('token', 44, 1.8, '#FFD21F') : '<span class="coin" style="width:48px;height:48px"><i style="width:22px;height:22px"></i></span>'}</span>
      <div class="num pop" style="font-weight:800;font-size:40px;margin-top:12px">+${fmt(x.qty)}</div><div style="font-weight:700">${x.kind} added</div>
      <button class="btn sun" style="margin-top:20px" onclick="closeOvl();${x.kind === 'tokens' ? "go('call')" : "go('market')"}"><span class="sw"></span>${x.kind === 'tokens' ? `Call ${voiceAI().name} now` : 'Unlock an AI'}</button>
      <button class="btn" style="margin-top:4px;height:44px;font-size:14px" onclick="closeOvl();rerender()">Done</button></div>`);
  };
  // real QR codes (qrcode-generator from cdnjs, loaded the first time it's needed)
  function qrInto(el, text) {
    if (!el) return; const draw = () => { try { const q = qrcode(0, 'M'); q.addData(text); q.make(); el.innerHTML = q.createSvgTag({cellSize: 4, margin: 0, scalable: true}); } catch (e) { el.innerHTML = ''; } };
    if (window.qrcode) return draw();
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; s.onload = draw; s.onerror = () => { el.style.display = 'none'; }; document.head.appendChild(s);
  }

  /* coins/tokens spent in the app are reported to the server, so its balance stays right */
  if (LIVEAPI()) {
    let base = {c: S.coins, t: S.tokens}; window.ZBW = {synced() { base = {c: S.coins, t: S.tokens}; }};
    setInterval(() => { const dc = base.c - S.coins, dt = base.t - S.tokens; if (dc > 0 || dt > 0) { const sp = {coins: Math.max(0, dc), tokens: Math.max(0, dt)}; base = {c: S.coins, t: S.tokens}; ZBAPI('/api/wallet/spend', sp).catch(() => { S.spendQ = S.spendQ || []; S.spendQ.push(sp); save(); }); } else if (dc < 0 || dt < 0) base = {c: S.coins, t: S.tokens};
      if (S.spendQ && S.spendQ.length) { const sp = S.spendQ.shift(); save(); ZBAPI('/api/wallet/spend', sp).catch(() => { S.spendQ.push(sp); save(); }); } }, 4000);
  }

  /* =========================== 5. AI brain (server) =========================== */
  const BRAIN = window.BRAIN = {fails: 0};
  BRAIN.live = () => LIVEAPI() && BRAIN.fails < 3 && !BRAIN.off;
  BRAIN.ctx = () => ({name: NAME(), country: S.country || '', linked: !!S.connected, deposited: S.dep || 0, plan: S.plan || '', mode: (typeof tierOf === 'function' && S.dep >= 20) ? tierOf(S.dep).n : '',
    coins: S.coins || 0, tokens: S.tokens || 0, owned: S.owned || [], bonusLeft: window.ZF && ZF.bonusLeft && ZF.bonusLeft() > 0 ? ZF.hms(ZF.bonusLeft()) : '', nextLive: RT(), screen: VIEW, balance: S.connected ? +(S.balance || 0) : undefined, lastResult: LASTRES()});
  const LASTRES = () => { const h = (S.history || [])[0]; return h ? `${h.win ? 'won' : 'lost'} ${h.pair} $${Math.abs(+h.pl || 0).toFixed(2)}` : ''; };
  BRAIN.chat = (b) => ZBAPI('/api/ai/chat', {...b, ctx: BRAIN.ctx()}).then((r) => { BRAIN.fails = 0; return r; }, (e) => { if (e.message === 'no_ai') BRAIN.off = true; else BRAIN.fails++; throw e; });

  // the CTA card an AI or support can attach to its reply
  const ctaHTML = (c, who) => {
    if (!c) return '';
    if (c.type === 'fund') { const amt = Math.max(+c.amount || 0, activated() ? 10 : 20);
      return `<div class="ctrade zf-cta"><div class="zf-ct">${ic('wallet', 18, 2.2, '#5A4400')}<div><b>${activated() ? 'Level up your account' : 'Ready when you are'}</b><span>Fund $${fmt(amt)} on IQ Option${!activated() && window.ZF && ZF.bonusLeft && ZF.bonusLeft() > 0 ? ' · +500 bonus coins today' : ''}</span></div></div>
        <button class="btn sun" style="height:50px;margin-top:10px" onclick="BRAIN.fund(${amt}${who ? `,'${who}'` : ''})"><span class="sw"></span>Fund $${fmt(amt)} now ${ic('right', 18, 2.6)}</button><p class="zb-own">${ic('shield', 14, 2.4)}<span>It's <b>your own trading capital</b>. The money stays in your IQ Option account and you trade with it.</span></p></div>`; }
    if (c.type === 'coins') return `<div class="ctrade zf-cta"><button class="btn sun" style="height:50px" onclick="getCoins('coins')"><span class="sw"></span>Get coins</button></div>`;
    if (c.type === 'live') return `<div class="ctrade zf-cta"><div class="zf-ct">${ic('live', 18, 2.2, '#5A4400')}<div><b>Next live: ${RT()}</b><span>Top traders, live with you</span></div></div><button class="btn ink" style="height:48px;margin-top:10px" onclick="closeOvl();go('live')">Open the live room</button></div>`;
    if (c.type === 'room') return `<div class="ctrade zf-cta"><div class="zf-ct">${ic('bolt', 18, 2.2, '#5A4400')}<div><b>Signals from all your AIs</b><span>The Signal Room shows every setup as it comes in</span></div></div><button class="btn sun" style="height:48px;margin-top:10px" onclick="closeOvl();go('room')"><span class="sw"></span>Open the Signal Room</button></div>`;
    if (c.type === 'academy') return `<div class="ctrade zf-cta"><button class="btn ink" style="height:48px" onclick="closeOvl();go('academy')">${ic('play', 16, 2)}Watch the training</button></div>`;
    return '';
  };
  window.actCard = (k, t) => { try { return ctaHTML(JSON.parse(t), k); } catch (e) { return ''; } };
  BRAIN.fund = (amt, k) => { if (activated()) return AIP.topup(amt, k); closeOvl(); CTX.depPick = amt; if (window.ZF && ZF.fundNow) { CTX.depPick = amt; ZF.fundNow(); } else actSheet(); };

  // support chat through the brain
  const _ss = supSend; const SH = [];
  supSend = function () {
    if (!BRAIN.live()) return _ss();
    const i = $('sin'); if (!i) return; const t = i.value.trim(); if (!t) return; i.value = ''; you(t);
    const box = $('sc'); const ty = document.createElement('div'); ty.className = 'typing'; ty.innerHTML = '<i></i><i></i><i></i>'; box && box.appendChild(ty); if (box) box.scrollTop = box.scrollHeight;
    const pre = !activated() && CTX.zfFromFund;
    BRAIN.chat({kind: 'support', agent: duty().n, history: SH.slice(-12), text: t}).then((r) => {
      ty.remove(); SH.push(['me', t]); r.messages.forEach((m) => SH.push(['ai', m]));
      sayS(r.messages, () => {
        const c = r.cta || (pre ? {type: 'fund', amount: +CTX.depPick || 20} : null);
        if (c) { const d = document.createElement('div'); d.innerHTML = ctaHTML(c); if (d.firstChild && $('sc')) { $('sc').appendChild(d.firstChild); $('sc').scrollTop = 1e9; } }
        setTimeout(() => (pre && ZF.faqReplies ? ZF.faqReplies() : openSupportMore()), 300);
      });
    }).catch(() => { ty.remove(); i.value = t; const box2 = $('sc'); if (box2 && box2.lastChild && box2.lastChild.classList.contains('out')) box2.lastChild.remove(); _ss(); });
  };

  // support: send a screenshot (deposit page, error, wrong balance) and the assistant looks at it
  const SUPCAM = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="1.8"/><path d="M21 15l-4.5-4.5L7 20"/></svg>';
  const supShrink = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onerror = no; r.onload = () => { const im = new Image(); im.onerror = no; im.onload = () => { const k = Math.min(1, 1600 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.85)); }; im.src = r.result; }; r.readAsDataURL(file); });
  async function supPhoto(file) {
    if (!file) return; if (!/^image\//.test(file.type)) return toast('Send a picture (screenshot)');
    let img; try { img = await supShrink(file); } catch (e) { return toast('Couldn’t read that picture'); }
    const i = $('sin'); const note = i ? i.value.trim() : ''; if (i) i.value = '';
    const box = $('sc'); if (!box) return;
    box.insertAdjacentHTML('beforeend', `<div class="sup-shot"><img src="${img}" alt="your screenshot"></div>`); if (note) you(note); box.scrollTop = 1e9;
    if (!BRAIN.live()) return setTimeout(() => sayS(['Got your screenshot 👀', 'In the live app I look at it and tell you exactly what to fix.']), 900);
    const ty = document.createElement('div'); ty.className = 'typing'; ty.innerHTML = '<i></i><i></i><i></i>'; box.appendChild(ty); box.scrollTop = 1e9;
    try { const r = await BRAIN.chat({kind: 'support', agent: duty().n, history: SH.slice(-12), text: note, image: img}); ty.remove(); SH.push(['me', '📷 screenshot' + (note ? ': ' + note : '')]); (r.messages || []).forEach((m) => SH.push(['ai', m]));
      if (r.human && !(r.messages || []).length) return sayS(['Got it 🙏', 'A teammate is looking at your picture now.']);
      sayS(r.messages || [], () => { if (r.cta) { const d = document.createElement('div'); d.innerHTML = ctaHTML(r.cta); if (d.firstChild && $('sc')) { $('sc').appendChild(d.firstChild); $('sc').scrollTop = 1e9; } } });
    } catch (e) { ty.remove(); toast('Couldn’t send it right now. Try again'); }
  }
  window.supPhoto = supPhoto;
  const addSupCam = () => { const bar = document.querySelector('#ovl .sup-in'); if (!bar || bar.querySelector('.sup-cam')) return;
    bar.insertAdjacentHTML('afterbegin', `<button class="sup-cam" aria-label="Send a screenshot" onclick="document.getElementById('supFile').click()">${SUPCAM}</button><input type="file" id="supFile" accept="image/*" hidden onchange="supPhoto(this.files[0]);this.value=''">`); };
  const _osCam = openSupport; openSupport = window.openSupport = function () { const r = _osCam.apply(this, arguments); try { addSupCam(); } catch (e) {} return r; };
  const _st = document.createElement('style'); _st.textContent = '.sup-in .sup-cam{flex:none;width:46px;height:46px;border-radius:14px;border:1px solid var(--line,#E6E8EF);background:var(--card,#fff);color:var(--ink,#11131A);display:grid;place-items:center;margin-right:6px;cursor:pointer}.sup-shot{display:flex;justify-content:flex-end;margin:6px 0}.sup-shot img{max-width:62%;max-height:260px;border-radius:16px;border:1px solid var(--line,#E6E8EF);object-fit:cover}';
  document.head.appendChild(_st);

  /* =========================== styles =========================== */

  /* ---------- tell the server the live balance + last result (support follow-ups use it for top-ups), and open deep links from the Telegram chat ---------- */
  let lastSent = '';
  const pushState = () => { if (!LIVEAPI() || !S.connected) return; const k = (+(S.balance || 0)).toFixed(2) + '|' + LASTRES() + '|' + (S.plan || ''); if (k === lastSent) return; lastSent = k;
    ZBAPI('/api/app/state', {balance: +(S.balance || 0), lastResult: LASTRES(), plan: S.plan || ''}).catch(() => { lastSent = ''; }); };
  setInterval(pushState, 60e3); setTimeout(pushState, 8000);
  // let the support assistant message people who opened the mini app straight from an ad (needed for follow-ups)
  setTimeout(() => { try { const W = window.Telegram && Telegram.WebApp; if (W && W.requestWriteAccess && S.ob >= 9 && !S.wa) { S.wa = 1; save(); W.requestWriteAccess(() => {}); } } catch (e) {} }, 20000);
  (function deepLink() {
    let go_ = '', amt = 0; try { const u = new URLSearchParams(location.search); go_ = u.get('go') || ''; amt = +u.get('amt') || 0;
      const sp = window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.start_param; if (!go_ && sp) go_ = String(sp).split('_')[0]; } catch (e) {}
    if (!go_) return;
    const run = () => { if (!S.ob || S.ob < 9) return;                       // onboarding first; links work after sign-up
      try { if (go_ === 'fund') BRAIN.fund(amt || 20); else if (go_ === 'live') go('live'); else if (go_ === 'academy') ACAD.play('welcome'); else if (go_ === 'coins') getCoins('coins'); } catch (e) {} };
    setTimeout(run, 1800);
  })();
  const st = document.createElement('style'); st.textContent = `
  .lv-sched{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
  .lv-s{border:1px solid var(--line);border-radius:16px;padding:12px 6px;text-align:center;background:#FFF}
  .lv-s b{display:block;font-weight:800;font-size:15px}.lv-s small{display:flex;align-items:center;justify-content:center;gap:5px;font-size:11.5px;color:var(--dim);font-weight:700;margin-top:2px}
  .lv-s.done{opacity:.5}.lv-s.next{border-color:#FFD21F;background:#FFF9DF}.lv-s.live{background:#0F1222;color:#FFF;border-color:#0F1222}.lv-s.live small{color:#FF6B74}
  .lv-s.live i{width:7px;height:7px;border-radius:50%;background:#FF4D5A;animation:pulseDot 1.2s infinite}
  @keyframes pulseDot{50%{opacity:.3}}
  .lv-next{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:800;background:#FFF4C2;color:#5A4400;border-radius:999px;padding:7px 11px}
  /* training */
  .ac-hero{display:block;width:100%;margin-top:16px;border-radius:26px;overflow:hidden;background:#0F1222;color:#FFF;text-align:left;position:relative}
  .ac-hero-ph{display:block;position:relative;aspect-ratio:16/10;overflow:hidden}.ac-hero-ph img{width:100%;height:100%;object-fit:cover;object-position:50% 25%;display:block;transform:scale(1.02)}
  .ac-hero-ph::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,18,34,0) 40%,rgba(15,18,34,.92))}
  .ac-playbig{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:66px;height:66px;border-radius:50%;background:rgba(255,210,31,.95);color:#0F1222;display:grid;place-items:center;z-index:2;box-shadow:0 10px 30px -8px rgba(255,190,0,.8);animation:acBeat 2.4s ease-in-out infinite}
  .ac-playbig svg{margin-left:4px}
  @keyframes acBeat{50%{transform:translate(-50%,-50%) scale(1.07)}}
  .ac-hero-t{position:absolute;left:16px;right:16px;bottom:14px;z-index:2;display:flex;flex-direction:column;gap:3px}
  .ac-hero-t small{font-size:12px;font-weight:800;color:#FFD21F;text-transform:uppercase;letter-spacing:.04em}.ac-hero-t b{font-size:20px;font-weight:800;line-height:1.2}.ac-hero-t span{font-size:13px;color:#C9CCD8}
  .ac-prog{display:flex;align-items:center;gap:12px;margin-top:14px;font-size:13.5px}.ac-prog>span{flex:1;height:8px;border-radius:8px;background:var(--soft);overflow:hidden}.ac-prog i{display:block;height:100%;background:linear-gradient(90deg,#FFD21F,#FFB300);border-radius:8px}
  .ac-trs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}
  .ac-trs>div{border:1px solid var(--line);border-radius:18px;padding:12px 6px;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}.ac-trs b{font-size:13.5px;font-weight:800}.ac-trs small{font-size:11.5px;color:var(--dim)}
  .ac-ph{display:inline-block;border-radius:50%;overflow:hidden;flex:none;box-shadow:0 0 0 2px #FFF,0 0 0 3.5px #F1E2A6}.ac-ph img{width:100%;height:100%;object-fit:cover;object-position:50% 25%;display:block}
  .ac-ph.talk{animation:acTalk 1.4s ease-in-out infinite}@keyframes acTalk{50%{box-shadow:0 0 0 2px #FFF,0 0 0 7px rgba(255,210,31,.6)}}
  .ac-row{display:flex;gap:12px;align-items:center;width:100%;text-align:left;padding:8px;border-radius:20px;border:1px solid var(--line);background:#FFF;margin-bottom:8px}
  .ac-th{position:relative;width:104px;height:66px;border-radius:14px;overflow:hidden;flex:none}.ac-th img{width:100%;height:100%;object-fit:cover;object-position:50% 25%}
  .ac-pl{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;background:rgba(15,18,34,.72);color:#FFF;display:grid;place-items:center}
  .ac-row.done .ac-pl{background:#18A957}.ac-th em{position:absolute;right:5px;bottom:5px;font-style:normal;font-size:10.5px;font-weight:800;color:#FFF;background:rgba(15,18,34,.75);border-radius:6px;padding:1px 5px}
  .ac-rt{display:flex;flex-direction:column;gap:3px;min-width:0}.ac-rt small{font-size:11.5px;color:var(--dim);font-weight:700}.ac-rt b{font-size:15px;font-weight:800;line-height:1.25}
  .ac-soon{display:flex;gap:12px;align-items:flex-start;margin-top:14px;padding:14px;border-radius:18px;background:var(--soft);font-size:13px}.ac-soon b{display:block;font-size:14px}.ac-soon span{color:var(--dim);line-height:1.45}
  .ac-home{display:flex;align-items:center;gap:12px;width:100%;margin-top:14px;padding:12px 14px;border-radius:20px;background:#FFF;border:1px solid var(--line);box-shadow:var(--sh);text-align:left}
  .ac-hs{display:flex}.ac-hs .ac-ph+.ac-ph{margin-left:-10px}.ac-ht{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.ac-ht b{font-size:14.5px;font-weight:800}.ac-ht small{font-size:12px;color:var(--dim)}
  .ac-hp{width:34px;height:34px;border-radius:50%;background:#FFD21F;color:#0F1222;display:grid;place-items:center;flex:none}
  .ac-new{margin-left:auto;font-size:10.5px;font-weight:800;background:#FFD21F;color:#0F1222;border-radius:999px;padding:2px 8px}
  .ac-player{position:fixed;inset:0;z-index:80;background:#0F1222;display:flex;flex-direction:column;color:#FFF;animation:acIn .25s ease}
  @keyframes acIn{from{opacity:0;transform:translateY(20px)}}
  .ac-stage{position:relative;flex:none;width:100%;aspect-ratio:1/1;max-height:62vh;overflow:hidden;background:#000;margin:0 auto}
  .ac-player .ac-ctl{flex:1;overflow-y:auto}
  .ac-eq{display:none;align-items:flex-end;gap:3px;height:16px;margin-left:auto;background:rgba(15,18,34,.45);padding:7px 10px;border-radius:999px;backdrop-filter:blur(10px);box-sizing:content-box}.ac-stage.on .ac-eq{display:flex}
  .ac-eq i{width:3px;background:#FFD21F;border-radius:2px;animation:acEq .9s ease-in-out infinite}.ac-eq i:nth-child(2){animation-delay:.2s}.ac-eq i:nth-child(3){animation-delay:.4s}.ac-eq i:nth-child(4){animation-delay:.1s}
  @keyframes acEq{0%,100%{height:4px}50%{height:16px}}
  .ac-kb{width:100%;height:100%;object-fit:cover;object-position:50% 25%;transform:scale(1.04);transition:transform 20s linear}
  .ac-stage.on .ac-kb{transform:scale(1.16) translate(-1.5%,1%)}
  .ac-stage video{width:100%;height:100%;object-fit:contain;background:#000}
  .ac-stage.v2{aspect-ratio:16/9;max-height:none;background:#0B0D18}.ac-stage.v2 .ac-shade,.ac-stage.v2 .ac-cap,.ac-stage.v2 .ac-eq,.ac-stage.v2 .ac-who{display:none!important}
  .ac-stage.v2 .ac-top{padding:8px}.ac-stage.v2 .ac-top .icb{width:34px;height:34px}.ac-fs{margin-left:auto}
  .ac-stage.v2 video{background:#0B0D18}
  .ac-pip{position:absolute;right:12px;top:64px;z-index:3}
  .ac-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,18,34,.55),rgba(15,18,34,0) 22%,rgba(15,18,34,0) 60%,rgba(15,18,34,.85))}
  .ac-top{position:absolute;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top,0px));display:flex;align-items:center;gap:10px;z-index:3}
  .icb.glass{background:rgba(255,255,255,.16);color:#FFF;border:0;backdrop-filter:blur(10px)}
  .ac-who{font-size:13px;font-weight:700;background:rgba(15,18,34,.45);padding:7px 12px;border-radius:999px;backdrop-filter:blur(10px)}
  .ac-cap{position:absolute;left:16px;right:16px;bottom:18px;text-align:center;z-index:3;min-height:30px}
  .ac-cap span{display:inline;font-size:17px;font-weight:700;line-height:1.55;background:rgba(15,18,34,.78);padding:4px 10px;border-radius:10px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
  .ac-tap{position:absolute;left:50%;top:45%;transform:translate(-50%,-50%);width:80px;height:80px;border-radius:50%;background:rgba(255,210,31,.95);color:#0F1222;display:grid;place-items:center;z-index:4;transition:opacity .2s}
  .ac-tap svg{margin-left:5px}
  .ac-ctl{padding:16px 18px calc(16px + env(safe-area-inset-bottom,0px));background:#FFF;color:var(--ink);border-radius:26px 26px 0 0;margin-top:-20px;position:relative;z-index:5}
  .ac-ctl h2{font-size:20px;font-weight:800;margin-top:2px}
  .ac-bar{height:6px;border-radius:6px;background:var(--soft);margin-top:14px;cursor:pointer;position:relative}.ac-bar i{position:absolute;left:0;top:0;bottom:0;background:#0F1222;border-radius:6px;width:0}
  .ac-tm{display:flex;justify-content:space-between;font-size:12px;color:var(--dim);margin-top:6px;font-variant-numeric:tabular-nums}
  .ac-btns{display:flex;align-items:center;justify-content:center;gap:22px;margin-top:4px}
  .ac-tx{margin-top:12px;border-top:1px solid var(--line);padding-top:10px;font-size:14px}.ac-tx summary{font-weight:800;cursor:pointer;color:var(--dim)}.ac-tx p{margin-top:8px;line-height:1.6;color:var(--ink2)}
  .ac-main{width:62px;height:62px;border-radius:50%;background:#0F1222;color:#FFD21F;display:grid;place-items:center}
  /* AI of the week */
  .aw{margin-top:16px;border-radius:26px;padding:16px;background:linear-gradient(165deg,#FFFDF3,#FFF);border:1px solid #F3E6B0;box-shadow:var(--sh)}
  .aw-h{display:flex;justify-content:space-between;align-items:center}
  .aw-pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:#5A4400;background:#FFE57A;border-radius:999px;padding:6px 11px}
  .aw-main{display:flex;align-items:center;gap:14px;width:100%;text-align:left;margin-top:10px}
  .aw-mt{display:flex;flex-direction:column;gap:3px;min-width:0}.aw-mt b{font-size:21px;font-weight:800;display:flex;align-items:center;gap:8px}.aw-mt>span{font-size:13.5px;color:var(--dim)}
  .aw-t{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:800;letter-spacing:.04em;border-radius:7px;padding:2px 7px 2px 3px}.aw-t.pro{background:#0F1222;color:#FFD21F}.aw-t.max{background:linear-gradient(135deg,#FFD21F,#FF9F1C);color:#0F1222}
  .aw-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.aw-stats>div{background:#FFF;border:1px solid var(--line);border-radius:14px;padding:9px;text-align:center}
  .aw-stats b{display:block;font-size:17px;font-weight:800}.aw-stats small{font-size:11px;color:var(--dim);font-weight:700}
  .aw-go{margin-top:12px;height:52px}
  .aw-top{margin-top:14px;border-top:1px solid var(--line);padding-top:10px}.aw-th{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}.aw-th b{font-size:15px;font-weight:800}.aw-th small{font-size:12px;color:var(--dim)}
  .aw-r{display:flex;align-items:center;gap:10px;width:100%;padding:8px 0;text-align:left}.aw-r+.aw-r{border-top:1px solid var(--line)}
  .aw-n{width:20px;font-weight:800;font-size:14px;color:var(--dim);text-align:center}
  .aw-rn{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}.aw-rn b{font-size:14.5px;font-weight:800;display:flex;gap:6px;align-items:center}
  .aw-bar{height:5px;border-radius:5px;background:var(--soft);overflow:hidden}.aw-bar i{display:block;height:100%;background:linear-gradient(90deg,#FFD21F,#FFB300)}
  .aw-rr{display:flex;align-items:center;gap:6px;font-size:13.5px}
  .aw-demo{font-size:11px;color:var(--mute);text-align:center;margin-top:8px}
  /* coins / crypto */
  .gc{position:relative}.gc h2{font-size:22px;font-weight:800;text-align:center;margin-top:8px}.gc>p.dim{text-align:center;font-size:14px;margin-top:4px}
  .gc-ic{display:flex;justify-content:center;margin-top:4px}.gc-back{position:absolute;left:0;top:0}
  .gc-opt,.gc-coin{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:14px;border-radius:20px;border:1px solid var(--line);background:#FFF;margin-top:12px}
  .gc-opt.best{border:2px solid #FFD21F;background:#FFFBEA}.gc-o-ic{width:42px;height:42px;border-radius:14px;background:#FFE57A;display:grid;place-items:center;flex:none}
  .gc-o-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.gc-o-t b{font-size:15.5px;font-weight:800}.gc-o-t small{font-size:12.5px;color:var(--dim);line-height:1.4}
  .gc-best{align-self:flex-start;font-size:10.5px;font-weight:800;background:#0F1222;color:#FFD21F;border-radius:6px;padding:2px 7px;margin-bottom:2px}
  .gc-or{display:flex;align-items:center;gap:10px;margin:16px 0 4px;font-size:12.5px;color:var(--dim);font-weight:700}.gc-or::before,.gc-or::after{content:"";flex:1;height:1px;background:var(--line)}
  .gc-packs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}
  .gc-p{border:1px solid var(--line);border-radius:18px;padding:12px 6px;display:flex;flex-direction:column;align-items:center;gap:2px;background:#FFF}
  .gc-p small{font-size:10.5px;font-weight:800;color:var(--dim);min-height:14px}.gc-p b{font-size:22px;font-weight:800}.gc-p span{font-size:12px;color:var(--dim)}
  .gc-p em{font-style:normal;margin-top:6px;font-weight:800;font-size:14px;background:var(--soft);border-radius:10px;padding:6px 0;width:100%;text-align:center}
  .gc-p.hot{background:#0F1222;color:#FFF;border-color:#0F1222}.gc-p.hot small{color:#FFD21F}.gc-p.hot span{color:#B8BCCB}.gc-p.hot em{background:#FFD21F;color:#0F1222}
  .gc-f{display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;text-align:center;margin-top:14px}
  .gc-cl{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;color:#FFF;font-weight:800;font-size:20px;flex:none}
  .gc-coin[disabled]{opacity:.45}
  .gc-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.gc-row .card{display:flex;flex-direction:column;gap:4px;padding:14px;border-radius:20px;text-align:left}.gc-row b{font-size:14.5px;font-weight:800;margin-top:4px}.gc-row small{font-size:12px;color:var(--dim)}
  .gc-spin{display:inline-block;width:46px;height:46px;border-radius:50%;border:4px solid var(--line2);border-top-color:#0F1222;animation:spin .8s linear infinite}.gc-spin.sm{width:16px;height:16px;border-width:2.5px}
  .gc-ok{display:inline-flex;width:84px;height:84px;border-radius:26px;background:#0F1222;align-items:center;justify-content:center;margin-top:8px}
  .zp-h{display:flex;align-items:center;gap:10px}.zp-h b{display:block;font-weight:800}.zp-h small{font-size:12px;color:var(--dim)}.zp-h>div{flex:1}
  .zp-logo{width:40px;height:40px;border-radius:13px;background:#0F1222;color:#FFD21F;display:grid;place-items:center;font-weight:900;font-size:18px}
  .zp-t{font-weight:800;color:#5A4400;background:#FFF4C2;padding:6px 10px;border-radius:10px}
  .zp-amt{text-align:center;margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:2px}.zp-amt small{font-size:12.5px;color:var(--dim)}
  .zp-amt button{display:inline-flex;align-items:center;gap:8px;font-size:15px;font-weight:700}.zp-amt button b{font-size:32px;font-weight:800;letter-spacing:-.02em}.zp-amt .dim{font-size:13px}
  .zp-qr{width:190px;height:190px;margin:14px auto 0;padding:10px;border-radius:18px;border:1px solid var(--line);background:#FFF}.zp-qr svg{width:100%;height:100%;display:block}
  .zp-addr{display:flex;align-items:center;gap:10px;margin-top:12px;padding:12px 14px;border-radius:16px;border:1px solid var(--line)}.zp-addr>div{flex:1;min-width:0}.zp-addr small{font-size:12px;color:var(--dim)}.zp-addr b{display:block;font-size:13px;word-break:break-all;margin-top:2px}
  .zp-warn{display:flex;gap:8px;align-items:flex-start;margin-top:10px;padding:10px 12px;border-radius:14px;background:#FFF9DF;font-size:12.5px;line-height:1.45;color:#5A4400}
  .zp-st{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px;font-size:13.5px;font-weight:700}
  @media (prefers-reduced-motion:reduce){.ac-kb,.ac-playbig,.ac-ph.talk{animation:none!important;transition:none!important}}
  `; document.head.appendChild(st);
})();
