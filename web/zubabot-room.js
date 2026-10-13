/* ===================== SIGNAL ROOM =====================
   Live signal feed you trade yourself: OTC pairs, digital options, your timeframe and amount,
   auto-gale (martingale) on by default with 3 steps, entry + gale times in your own timezone,
   and you choose which AIs post into your room.
   Works in 3 modes: demo (no server) · manual (server, no OAuth) · auto (server + IQ Option OAuth). */
(function () {
  const RP = window.ROOM = {};
  /* ---------- countries & time ---------- */
  const COUNTRIES = [
    ['NG', 'Nigeria', '🇳🇬', 'Africa/Lagos'], ['GH', 'Ghana', '🇬🇭', 'Africa/Accra'], ['KE', 'Kenya', '🇰🇪', 'Africa/Nairobi'],
    ['ZA', 'South Africa', '🇿🇦', 'Africa/Johannesburg'], ['CM', 'Cameroon', '🇨🇲', 'Africa/Douala'], ['UG', 'Uganda', '🇺🇬', 'Africa/Kampala'],
    ['TZ', 'Tanzania', '🇹🇿', 'Africa/Dar_es_Salaam'], ['ZM', 'Zambia', '🇿🇲', 'Africa/Lusaka'], ['RW', 'Rwanda', '🇷🇼', 'Africa/Kigali'],
    ['CI', 'Côte d’Ivoire', '🇨🇮', 'Africa/Abidjan'], ['SN', 'Senegal', '🇸🇳', 'Africa/Dakar'], ['BJ', 'Benin', '🇧🇯', 'Africa/Porto-Novo'],
    ['TG', 'Togo', '🇹🇬', 'Africa/Lome'], ['ET', 'Ethiopia', '🇪🇹', 'Africa/Addis_Ababa'], ['EG', 'Egypt', '🇪🇬', 'Africa/Cairo'],
    ['MA', 'Morocco', '🇲🇦', 'Africa/Casablanca'], ['ZW', 'Zimbabwe', '🇿🇼', 'Africa/Harare'], ['MW', 'Malawi', '🇲🇼', 'Africa/Blantyre'],
    ['BW', 'Botswana', '🇧🇼', 'Africa/Gaborone'], ['GB', 'United Kingdom', '🇬🇧', 'Europe/London'], ['AE', 'UAE', '🇦🇪', 'Asia/Dubai'],
    ['IN', 'India', '🇮🇳', 'Asia/Kolkata'], ['BR', 'Brazil', '🇧🇷', 'America/Sao_Paulo'], ['US', 'United States (East)', '🇺🇸', 'America/New_York'],
  ].map(([code, name, flag, tz]) => ({code, name, flag, tz}));
  function guessCountry() {
    let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    const exact = COUNTRIES.find((c) => c.tz === tz); if (exact) return exact.code;
    const lang = (() => { try { return (Telegram.WebApp.initDataUnsafe.user.language_code || '').toLowerCase(); } catch (e) { return ''; } })();
    if (lang === 'fr') return 'CM'; if (lang === 'sw') return 'KE';
    return 'NG';
  }
  if (!S.country) { S.country = guessCountry(); save(); }
  const CTRY = () => COUNTRIES.find((c) => c.code === S.country) || COUNTRIES[0];
  const fmtT = (ms, sec) => { try { return new Intl.DateTimeFormat('en-GB', {timeZone: CTRY().tz, hour: '2-digit', minute: '2-digit', second: sec ? '2-digit' : undefined, hour12: false}).format(new Date(ms)); } catch (e) { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); } };
  const cityOf = (c) => (c.tz.split('/')[1] || c.tz).replace(/_/g, ' ');
  const ms2 = (s) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + ':' + String(s % 60).padStart(2, '0'); };

  /* ---------- settings kept per user ---------- */
  const OTC = ['EUR/USD OTC', 'GBP/USD OTC', 'USD/JPY OTC', 'AUD/CAD OTC', 'EUR/JPY OTC', 'GBP/JPY OTC', 'NZD/USD OTC', 'USD/CHF OTC'];
  const EXPIRIES = [0.5, 1, 5, 15];
  const tfL = (m) => (m < 1 ? Math.round(m * 60) + ' sec' : m + ' min');   // 0.5 = 30 sec (placed as a 30-second turbo option)
  const DEFAULT_AIS = [{key: 'viza', expiry: 1}, {key: 'luna', expiry: 5}, {key: 'mira', expiry: 5}, {key: 'blaze', expiry: 1}, {key: 'remi', expiry: 15}];
  S.room = Object.assign({ais: null, pair: 'EUR/USD OTC', minutes: 1, amount: 0, sound: true, seen: 0}, S.room || {});
  const R = {signals: [], recent: [], ais: DEFAULT_AIS, pairs: OTC, kind: 'digital', now: Date.now(), skew: 0, loaded: false, poll: null};
  const now = () => Date.now() + R.skew;
  const aiOf = (k) => AIS[k] || AIS.viza;
  // by default you follow the AIs you've unlocked (every AI posts signals now, so following all of them would flood the room)
  const myAis = () => { const avail = R.ais.map((a) => a.key).filter((k) => AIS[k]); const mine = (S.owned || []).filter((k) => avail.includes(k)); const dflt = mine.length ? mine : avail.slice(0, 5);
    if (!S.room.ais) return dflt; const sel = S.room.ais.filter((k) => avail.includes(k)); return sel.length ? sel : dflt; };
  const galeSteps = () => (S.mg.on ? S.mg.steps : 0);
  const stakeDefault = () => S.room.amount || Math.max(1, Math.min(S.stake || 10, Math.floor((S.balance || 10) * 0.05) || 1));
  const ladderFor = (base, steps) => { const out = []; let a = base; for (let i = 0; i <= steps; i++) { out.push(Math.max(1, Math.round(a * 100) / 100)); a *= S.mg.mult; } return out.map((x) => x >= 10 ? Math.round(x) : x); };

  /* ---------- data: server (live) or local generator (demo) ---------- */
  const LIVEAPI = !!window.ZB_API;
  async function load() {
    if (LIVEAPI && window.ZBAPI) {
      try {
        const d = await window.ZBAPI('/api/signals?ais=' + encodeURIComponent((typeof myAis === 'function' ? myAis() : []).concat(S.owned || []).filter((x, i, a) => a.indexOf(x) === i).join(','))); R.skew = (d.now || Date.now()) - Date.now();
        R.signals = (d.signals || []).filter((s) => s.step === 1).map((s) => ({id: s.id, pair: s.pair, dir: s.dir, ai: s.ai || 'viza', conf: s.conf, minutes: s.expiry_min || 1, entryAt: s.entry_at || s.created_at, expiresAt: s.expires_at, chain: s.chain_id, kind: s.kind || 'digital'}));
        const fin = {}; for (const r of d.recent || []) { const c = r.chain_id || r.id; if (!fin[c] || r.step > fin[c].step) fin[c] = r; }
        R.recent = Object.values(fin).sort((a, b) => b.id - a.id).slice(0, 12).map((r) => ({id: r.id, pair: r.pair, dir: r.dir, ai: r.ai || 'viza', step: r.step, status: r.status, entryAt: r.entry_at}));
        if (d.ais && d.ais.length) R.ais = d.ais; if (d.pairs && d.pairs.length) R.pairs = d.pairs; R.kind = d.kind || 'digital';
        R.loaded = true; return;
      } catch (e) { R.loaded = true; return; }
    }
    demoTick(); R.loaded = true;
  }
  RP.load = load; RP.myAis = () => myAis(); if (!Object.getOwnPropertyDescriptor(RP, 'signals')) Object.defineProperty(RP, 'signals', {get: () => R.signals, configurable: true});   // the AI chat reads its next signal from here
  // demo: a new signal about every 35-70s, entry on the next full minute after 40s, results after expiry
  let demoNext = 0, demoId = 900;
  function demoTick() {
    const t = Date.now();
    R.signals = R.signals.filter((s) => { if (t > s.expiresAt) { const won = Math.random() < 0.62; const step = won ? 1 : (Math.random() < 0.7 ? 2 : 3); R.recent.unshift({id: s.id, pair: s.pair, dir: s.dir, ai: s.ai, step: won ? 1 : step, status: won || step < 3 ? 'win' : 'loss', entryAt: s.entryAt}); R.recent = R.recent.slice(0, 12); return false; } return true; });
    if (!R.recent.length) for (let i = 0; i < 5; i++) { const a = pick(DEFAULT_AIS); R.recent.push({id: ++demoId, pair: pick(OTC.slice(0, 5)), dir: Math.random() < .5 ? 'buy' : 'sell', ai: a.key, step: pick([1, 1, 1, 2, 2, 3]), status: Math.random() < .8 ? 'win' : 'loss', entryAt: t - (i + 1) * 7 * 60e3}); }
    if (t >= demoNext && R.signals.length < 3) {
      demoNext = t + 35e3 + Math.random() * 35e3; const a = pick(DEFAULT_AIS);
      const entryAt = Math.ceil((t + 40e3) / 60e3) * 60e3;
      R.signals.push({id: ++demoId, pair: pick(OTC.slice(0, 6)), dir: Math.random() < .5 ? 'buy' : 'sell', ai: a.key, conf: 74 + Math.floor(Math.random() * 18), minutes: a.expiry, entryAt, expiresAt: entryAt + a.expiry * 60e3, demo: true});
    }
  }
  let visible = () => { const mine = myAis(); return R.signals.filter((s) => mine.includes(s.ai) && now() < s.entryAt + 20e3).sort((a, b) => a.entryAt - b.entryAt); };

  /* ---------- views ---------- */
  function galeStrip(s) {
    const n = galeSteps(), items = [`<div class="e"><small>ENTRY</small><b>${fmtT(s.entryAt)}</b></div>`];
    for (let i = 1; i <= n; i++) items.push(`<div><small>GALE ${i}</small><b>${fmtT(s.entryAt + i * s.minutes * 60e3)}</b></div>`);
    if (!n) items.push(`<div><small>AUTO-GALE</small><b>Off</b></div>`);
    return `<div class="gl">${items.join('')}</div>`;
  }
  function nextCard(s, popped) {
    const ai = aiOf(s.ai), left = (s.entryAt - now()) / 1000, isNow = left <= 0;
    return `<div class="nx ${s.dir} ${popped ? 'pop' : ''}" id="nx${s.id}">
      <div class="nx-h">${face(ai.f, 40, 'float')}<div class="who"><b>${ai.name}</b><span>${ai.style || 'Signals'} · ${tfL(s.minutes)} calls</span></div><span class="nx-k">${isNow ? 'Enter now' : 'Next signal'}</span></div>
      <div class="nx-m"><div class="nx-pair">${s.pair.replace(' OTC', '')}<small>OTC · Digital · ${tfL(s.minutes)} · ${s.conf}% strength</small></div><span class="dirb ${s.dir}">${ic(s.dir === 'buy' ? 'up' : 'dn', 18, 3)}${s.dir === 'buy' ? 'BUY' : 'SELL'}</span></div>
      <div class="nx-t"><div><div class="lbl">Entry time · ${cityOf(CTRY())}</div><div class="big">${fmtT(s.entryAt)}</div></div><div class="cd ${isNow ? 'now' : ''}" id="cd${s.id}"><span class="lbl">${isNow ? 'Window closes in' : 'Starts in'}</span><b>${ms2(isNow ? 20 + left : left)}</b></div></div>
      ${galeStrip(s)}
      <div class="nx-cta"><button class="btn sun" onclick="ROOM.ticket(${s.id})"><span class="sw"></span>Trade this signal</button><button class="btn glass" aria-label="Hide" onclick="ROOM.skip(${s.id})">Skip</button></div></div>`;
  }
  function row(s) {
    const ai = aiOf(s.ai);
    return `<button class="sigrow" onclick="ROOM.ticket(${s.id})">${face(ai.f, 38)}<span class="pr"><b>${s.pair.replace(' OTC', '')} <span style="font-size:11px;color:var(--dim)">OTC</span></b><span>${ai.name} · ${tfL(s.minutes)} · ${s.conf}%</span></span><span class="dd ${s.dir}">${s.dir === 'buy' ? 'BUY' : 'SELL'}</span><span class="tm"><b>${fmtT(s.entryAt)}</b><small id="cr${s.id}">in ${ms2((s.entryAt - now()) / 1000)}</small></span></button>`;
  }
  function todayStats() { const t = S.today || {n: 0, w: 0, l: 0, pl: 0}; return `<div class="today"><div><small>Today</small><b>${t.n || 0} trades</b></div><div><small>Won · lost</small><b><span style="color:var(--money-d)">${t.w || 0}</span> · <span style="color:var(--loss)">${t.l || 0}</span></b></div><div><small>Result</small><b style="color:${(t.pl || 0) >= 0 ? 'var(--money-d)' : 'var(--loss)'}">${sgn(t.pl || 0)}</b></div></div>`; }
  const skipped = new Set();
  VIEWS.room = () => {
    const c = CTRY(), list = visible().filter((s) => !skipped.has(s.id)), mine = myAis();
    const head = list[0], rest = list.slice(1);
    return `<div class="scr" id="roomScr" style="padding-bottom:170px">
      <div class="room-top"><div><h1>Signal Room</h1><span class="lv"><i></i>LIVE</span></div>
        <button class="tzchip" onclick="ROOM.tzSheet()" aria-label="Change country and time"><span class="fl">${c.flag}</span><span><span id="rmClock" class="num">${fmtT(now(), true)}</span><small>${cityOf(c)} time</small></span></button></div>
      <div class="room-sub"><span class="pl">OTC</span><span class="pl">Digital</span><span class="pl">Auto-gale ${galeSteps() ? galeSteps() + ' steps' : 'off'}</span><span>· You place every trade</span></div>
      <div class="aibar">${R.ais.filter((a) => AIS[a.key]).map((a) => { const on = mine.includes(a.key); return `<button class="aich ${on ? 'on' : 'off'}" aria-pressed="${on}" onclick="ROOM.toggleAi('${a.key}')">${face(aiOf(a.key).f, 30)}${aiOf(a.key).name}</button>`; }).join('')}<button class="aich edit" onclick="ROOM.aiSheet()">${ic('cog', 16, 2.2)} Choose</button></div>
      ${!R.loaded ? `<div class="room-empty"><b>Loading signals…</b></div>` : head ? nextCard(head, RP.lastTop !== head.id) : `<div class="room-empty"><b>Waiting for the next signal</b>${mine.length < R.ais.length ? 'You’re following ' + mine.length + ' of ' + R.ais.length + ' AIs. ' : ''}New signals pop up here, usually every few minutes.</div>`}
      ${rest.length ? `<div class="rsec"><h2>Coming up</h2><span>${rest.length} more</span></div>${rest.map(row).join('')}` : ''}
      ${todayStats()}
      <div class="rsec"><h2>Recent results</h2><span>${fmtT(now())} ${cityOf(c)}</span></div>
      <div class="card" style="padding:4px 14px;margin-top:10px">${R.recent.filter((r) => mine.includes(r.ai)).slice(0, 8).map((r) => `<div class="res">${face(aiOf(r.ai).f, 30)}<span class="pr">${r.pair.replace(' OTC', '')} ${r.dir === 'buy' ? 'BUY' : 'SELL'}<small>${aiOf(r.ai).name}${r.entryAt ? ' · ' + fmtT(r.entryAt) : ''}</small></span><span class="rtag ${r.status}">${r.status === 'win' ? (r.step > 1 ? 'Won · gale ' + (r.step - 1) : 'Won') : r.status === 'loss' ? 'Lost' : 'Draw'}</span></div>`).join('') || '<p class="dim" style="padding:14px 0;font-size:13px;text-align:center">Results show here after each signal ends.</p>'}</div>
      <p class="dim" style="font-size:11.5px;text-align:center;margin-top:14px;line-height:1.5">Signals are ideas, not advice. Trading is risky and you can lose money. 18+</p>
    </div><button class="fabnew" onclick="ROOM.ticket()"><i>+</i>New trade</button>`;
  };
  AFTER.room = () => {
    RP.lastTop = (visible().filter((s) => !skipped.has(s.id))[0] || {}).id;
    clearInterval(go.roomT); let k = 0;
    if (LIVEAPI) load().then(() => { if (VIEW === 'room') { const f = visible().filter((x) => !skipped.has(x.id)); if ((f[0] || {}).id !== RP.lastTop || !document.querySelector('.nx')) rerender(); } });
    go.roomT = setInterval(async () => {
      if (VIEW !== 'room') { clearInterval(go.roomT); return; }
      k++; const ck = $('rmClock'); if (ck) ck.textContent = fmtT(now(), true);
      for (const s of visible()) {
        const left = (s.entryAt - now()) / 1000, el = $('cd' + s.id), r = $('cr' + s.id);
        if (el) { const b = el.querySelector('b'); if (left <= 0 && !el.classList.contains('now')) { rerender(); return; } if (b) b.textContent = ms2(left <= 0 ? 20 + left : left); }
        if (r) r.textContent = left > 0 ? 'in ' + ms2(left) : 'now';
      }
      if (k % (LIVEAPI ? 8 : 2) === 0) { const before = visible().map((s) => s.id).join(); await load(); const after = visible().filter((s) => !skipped.has(s.id)); if (after.map((s) => s.id).join() !== before) { if (after[0] && after[0].id !== RP.lastTop) { try { SND.coin(); } catch (e) {} } rerender(); RP.lastTop = (after[0] || {}).id; } }
    }, 1000);
  };
  RP.skip = (id) => { skipped.add(id); rerender(); };
  RP.toggleAi = (k) => { let sel = myAis(); sel = sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]; if (!sel.length) { toast('Keep at least one AI'); return; } S.room.ais = sel; save(); rerender(); };
  RP.aiSheet = () => {
    const mine = myAis();
    sheet(`<h2 style="font-size:22px;font-weight:800">Choose your AIs</h2><p class="dim" style="font-size:13.5px;margin-top:4px">Only the AIs you pick post signals into your room. Fewer AIs = a calmer feed.</p>
      <div class="aisel">${R.ais.filter((a) => AIS[a.key]).map((a) => { const ai = aiOf(a.key), on = mine.includes(a.key); return `<button class="${on ? 'on' : ''}" onclick="ROOM.toggleAi('${a.key}');ROOM.aiSheet()">${face(ai.f, 44)}<span><b>${ai.name}</b><small>${ai.style || 'Signals'} · ${a.expiry} min calls${ai.desc ? ' · ' + esc(ai.desc).slice(0, 60) : ''}</small></span><span class="ck">${on ? ic('check', 14, 3, '#FFD21F') : ''}</span></button>`; }).join('')}</div>
      <button class="btn ink" style="margin-top:14px" onclick="closeOvl();rerender()">Done</button>`);
  };
  RP.tzSheet = () => {
    sheet(`<h2 style="font-size:22px;font-weight:800">Your country</h2><p class="dim" style="font-size:13.5px;margin-top:4px">All entry and gale times show in your local time.</p>
      <div class="tzlist">${COUNTRIES.map((c) => `<button class="${c.code === S.country ? 'on' : ''}" onclick="ROOM.setCountry('${c.code}')"><span class="fl">${c.flag}</span><span><b>${c.name}</b><small>${cityOf(c)} time</small></span><span class="tm">${(() => { try { return new Intl.DateTimeFormat('en-GB', {timeZone: c.tz, hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date()); } catch (e) { return ''; } })()}</span></button>`).join('')}</div>`);
  };
  RP.setCountry = (code) => { S.country = code; save(); closeOvl(); toast('Times now in ' + cityOf(CTRY()) + ' time'); rerender(); };

  /* ---------- trade ticket ---------- */
  let TK = null;
  RP.ticket = (sigId) => {
    const s = sigId ? R.signals.find((x) => x.id === sigId) : null;
    const pairs = R.pairs && R.pairs.length ? R.pairs : OTC;
    TK = {sig: s || null, pair: s ? s.pair : (pairs.includes(S.room.pair) ? S.room.pair : pairs[0]), dir: s ? s.dir : 'buy', minutes: s ? s.minutes : S.room.minutes, amount: stakeDefault(), when: s && s.entryAt > now() + 3000 ? 'entry' : 'now'};
    drawTicket();
  };
  function drawTicket() {
    const t = TK, pairs = R.pairs && R.pairs.length ? R.pairs : OTC, n = galeSteps(), lad = ladderFor(t.amount, n), total = lad.reduce((a, b) => a + b, 0);
    const copied = t.sig && t.pair === t.sig.pair && t.dir === t.sig.dir && t.minutes === t.sig.minutes;
    const entry = t.sig ? t.sig.entryAt : null, left = entry ? (entry - now()) / 1000 : 0;
    const startAt = t.when === 'entry' && entry && left > 0 ? entry : now();
    const ai = t.sig ? aiOf(t.sig.ai) : null;
    sheet(`<div class="tk"><div style="display:flex;align-items:center;gap:10px">${ai ? face(ai.f, 40) : `<span style="width:40px;height:40px;border-radius:13px;background:var(--ink);display:flex;align-items:center;justify-content:center">${ic('bolt', 20, 2.4, '#FFD21F')}</span>`}<div style="flex:1"><h2>${t.sig ? ai.name + '’s signal' : 'New trade'}</h2><div class="dim" style="font-size:12.5px;font-weight:700">OTC · Digital option${copied ? ' · matches the signal' : t.sig ? ' · edited' : ''}</div></div><span class="num" style="font-weight:800;font-size:13px;color:var(--dim)">Bal. $${fmt(S.balance || 0)}</span></div>
      <div class="lbl">Pair</div>
      <div class="pchips">${pairs.map((p) => `<button class="${p === t.pair ? 'on' : ''}" onclick="ROOM.set('pair','${p}')">${p.replace(' OTC', '')}<small>OTC</small></button>`).join('')}</div>
      <div class="lbl">Direction</div>
      <div class="dirsel"><button class="b ${t.dir === 'buy' ? 'on' : ''}" onclick="ROOM.set('dir','buy')">${ic('up', 20, 3)}BUY</button><button class="s ${t.dir === 'sell' ? 'on' : ''}" onclick="ROOM.set('dir','sell')">${ic('dn', 20, 3)}SELL</button></div>
      <div class="lbl">Timeframe</div>
      <div class="optrow">${EXPIRIES.map((m) => `<button class="${m === t.minutes ? 'on' : ''}" onclick="ROOM.set('minutes',${m})">${tfL(m)}</button>`).join('')}</div>
      <div class="lbl">Amount <span class="num">$${fmt(t.amount)}</span></div>
      <div class="optrow five">${[1, 5, 10, 25, 50].map((v) => `<button class="${v === t.amount ? 'on' : ''}" onclick="ROOM.set('amount',${v})">$${v}</button>`).join('')}</div>
      <div class="amtline"><input id="tkAmt" type="number" inputmode="decimal" min="1" placeholder="Other amount" onchange="ROOM.set('amount',Math.max(1,Math.round((+this.value||0)*100)/100))"><small>Tip: 1–2% of your balance</small></div>
      <div class="lbl">Auto-gale <span>${n ? n + ' step' + (n > 1 ? 's' : '') + ' · ×' + S.mg.mult : 'Off'}</span></div>
      <div class="galebox"><div class="top"><div><b>${n ? 'If it loses, the next step goes in by itself' : 'Auto-gale is off'}</b><small>${n ? 'Stops at the first win. You can stop it anytime.' : 'Only this one trade is placed.'}</small></div>
        <div class="stp"><button aria-label="Fewer steps" onclick="ROOM.gale(-1)">−</button><span>${n}</span><button aria-label="More steps" onclick="ROOM.gale(1)">+</button></div></div>
        <div class="lad">${lad.map((v, i) => `<div><small>${i ? 'GALE ' + i : 'TRADE'}</small><b>$${fmt(v)}</b><i>${fmtT(startAt + i * t.minutes * 60e3)}</i></div>`).join('')}</div>
        ${n ? `<div class="risk"><span>Most you can lose on this chain</span><b class="num">−$${fmt(Math.round(total * 100) / 100)}</b></div>` : ''}</div>
      ${entry && left > 3 ? `<div class="lbl">When</div><div class="whenrow"><button class="${t.when === 'entry' ? 'on' : ''}" onclick="ROOM.set('when','entry')"><b>At entry · ${fmtT(entry)}</b><small>Placed for you on time</small></button><button class="${t.when === 'now' ? 'on' : ''}" onclick="ROOM.set('when','now')"><b>Right now</b><small>Ignore the entry time</small></button></div>` : ''}
      <div class="tkfoot">${activated() ? `<button class="btn sun" onclick="ROOM.confirm()"><span class="sw"></span>${t.when === 'entry' && left > 3 ? 'Place at ' + fmtT(entry) : 'Place $' + fmt(t.amount) + ' ' + t.dir.toUpperCase()}<small>${t.pair} · ${tfL(t.minutes)} digital${n ? ' · auto-gale ' + n : ''}</small></button>`
        : `<button class="btn sun" onclick="closeOvl();actSheet()"><span class="sw"></span>Activate to trade<small>Fund from $20 on your IQ Option account</small></button><button class="btn" style="height:46px;font-size:14px;margin-top:6px" onclick="ROOM.confirm(true)">Practice this trade free</button>`}</div></div>`);
    afterDraw();
  }
  function afterDraw() { setTimeout(() => { const on = document.querySelector('.pchips button.on'); if (on) on.scrollIntoView({block: 'nearest', inline: 'center'}); }, 30); }
  RP.set = (k, v) => { TK[k] = v; if (k === 'pair') S.room.pair = v; if (k === 'minutes') S.room.minutes = v; if (k === 'amount') S.room.amount = v; save(); drawTicket(); };
  RP.gale = (d) => { const n = Math.max(0, Math.min(5, galeSteps() + d)); S.mg.on = n > 0; if (n > 0) S.mg.steps = n; save(); drawTicket(); };

  /* ---------- placing ---------- */
  let SCHED = null;
  RP.confirm = (practice) => {
    const t = {...TK}; if (!practice && t.amount > (S.balance || 0) && (S.balance || 0) > 0) { toast('Not enough balance for this amount'); return; }
    const copied = !!(t.sig && t.pair === t.sig.pair && t.dir === t.sig.dir && t.minutes === t.sig.minutes);
    const entry = t.sig ? t.sig.entryAt : null;
    if (!practice && t.when === 'entry' && entry && entry - now() > 3000) return schedule(t, copied);
    closeOvl(); launch(t, copied, practice);
  };
  function schedule(t, copied) {
    clearInterval(SCHED && SCHED.iv); const total = Math.max(1, (t.sig.entryAt - now()) / 1000);
    SCHED = {t, copied, iv: setInterval(() => { const left = (t.sig.entryAt - now()) / 1000; const b = $('schB'), c = $('schC'); if (!b) { clearInterval(SCHED.iv); return; } b.textContent = ms2(left); if (c) c.style.strokeDashoffset = 377 * (1 - Math.max(0, left) / total); if (left <= 0.5) { clearInterval(SCHED.iv); closeOvl(); launch(t, copied, false); } }, 250)};
    sheet(`<div class="sched"><h2 style="font-size:22px;font-weight:800">Placing at ${fmtT(t.sig.entryAt)}</h2><p class="dim" style="font-size:13.5px;margin-top:4px">${t.pair} · ${t.dir.toUpperCase()} · $${fmt(t.amount)} · ${tfL(t.minutes)}. Keep Zubabot open.</p>
      <div class="schring"><svg width="140" height="140" viewBox="0 0 140 140"><circle cx="70" cy="70" r="60" fill="none" stroke="var(--soft)" stroke-width="10"/><circle id="schC" cx="70" cy="70" r="60" fill="none" stroke="var(--sun2)" stroke-width="10" stroke-linecap="round" stroke-dasharray="377" stroke-dashoffset="0"/></svg><b id="schB">${ms2(total)}</b></div>
      <button class="btn ink" style="margin-top:16px" onclick="clearInterval(ROOM.sched().iv);closeOvl();ROOM.go(ROOM.sched())">Place now instead</button>
      <button class="btn" style="height:46px;font-size:14px;margin-top:6px" onclick="clearInterval(ROOM.sched().iv);closeOvl()">Cancel</button></div>`);
  }
  RP.sched = () => SCHED; RP.go = (s) => launch(s.t, s.copied, false);
  function launch(t, copied, practice) {
    if (!practice && needAct()) return;
    if (LIVE && LIVE.active) { toast('Finish the running trade first'); go('trade'); return; }
    const [price, dp] = (() => { const p = PAIRS.find((x) => x[0] === t.pair.replace(' OTC', '')); return p ? [p[1], p[2]] : [1.0 + Math.random() * .2, 5]; })();
    const o = {id: ++OID, sigId: (t.sig && t.pair === t.sig.pair && t.dir === t.sig.dir && t.minutes === t.sig.minutes) ? t.sig.id : null, pair: t.pair, price, dp, dir: t.dir, conf: t.sig ? t.sig.conf : 80, why: pick(WHY[t.dir]), minutes: t.minutes, kind: 'digital', noEntry: true, expiresAt: null};
    S.stake = t.amount; save(); SND.place();
    const L = {o, base: t.amount, practice: !!practice, step: 0, lost: [], net: 0, src: 'room', sigId: window.ZB_AUTO ? o.sigId : null, copied, dur: t.minutes * 60, roomAi: copied ? t.sig.ai : null};
    if (!practice && window.ZB_AUTO) { L.auto = true; runLive(L); go('trade'); return; }
    if (!practice && window.ZB_LIVEMODE) return manualPlace(L, t);
    runLive(L); LIVE.left = LIVE.dur = Math.min(t.minutes * 60, practice ? 60 : t.minutes * 60); go('trade');
  }
  // manual mode (no OAuth yet): user places it on IQ Option; result from the signal if copied, otherwise they tell us
  function manualPlace(L, t) {
    sheet(`<h2 style="font-size:22px;font-weight:800">Place it on IQ Option</h2><p class="ink2" style="font-size:14.5px;line-height:1.5;margin-top:6px">Open IQ Option, choose <b>Digital</b>, then place exactly this:</p>
      <div class="card" style="margin-top:14px;padding:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center"><div><div class="dim" style="font-size:12px">Pair</div><b>${t.pair}</b></div><div><div class="dim" style="font-size:12px">Direction</div><b style="color:${t.dir === 'buy' ? 'var(--money)' : 'var(--loss)'}">${t.dir.toUpperCase()}</b></div><div><div class="dim" style="font-size:12px">Amount · time</div><b>$${fmt(t.amount)} · ${t.minutes}m</b></div></div>
      <button class="btn sun" style="margin-top:16px" onclick="zbOpenTrade()"><span class="sw"></span>Open IQ Option</button>
      <button class="btn ink" style="margin-top:8px" onclick="closeOvl();ROOM.follow()">I’ve placed it</button>`);
    RP._pending = {L, t};
  }
  RP.follow = () => { const {L, t} = RP._pending || {}; if (!L) return; L.askResult = true; L.sigId = null; runLive(L); go('trade'); };
  // manual + edited trade: ask how it went when the timer ends
  const _finishStep0 = finishStep;
  finishStep = function () {
    const L = LIVE;
    if (L && L.askResult && L.win === undefined) {
      sheet(`<h2 style="font-size:22px;font-weight:800">How did it close?</h2><p class="dim" style="font-size:13.5px;margin-top:4px">${L.o.pair} ${L.o.dir.toUpperCase()} $${fmt(L.stake)} on IQ Option</p>
        <div class="dirsel" style="margin-top:14px"><button class="b on" onclick="closeOvl();LIVE.win=true;ROOM.done()">Won</button><button class="s on" onclick="closeOvl();LIVE.win=false;ROOM.done()">Lost</button></div>`);
      return;
    }
    return _finishStep0();
  };
  RP.done = () => { const L = LIVE; const w = L.win; _finishStep0(); if (LIVE === L && L.active && L.askResult) L.win = undefined; };
  // in the demo engine, each new gale step must also clear the asked result
  const _runLive0 = runLive;
  runLive = function (L) { _runLive0(L); if (LIVE && LIVE.askResult) { clearInterval(LIVE.iv); LIVE.win = undefined; const end = Date.now() + (LIVE.dur || 60) * 1000; LIVE.left = LIVE.dur || 60;
      if (LIVE.step > 0) { const G = LIVE; setTimeout(() => sheet(`<h2 style="font-size:22px;font-weight:800">Auto-gale ${G.step}: place it now</h2><p class="ink2" style="font-size:14.5px;line-height:1.5;margin-top:6px">The last trade lost. Place this on IQ Option right away:</p>
        <div class="card" style="margin-top:14px;padding:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center"><div><div class="dim" style="font-size:12px">Pair</div><b>${G.o.pair}</b></div><div><div class="dim" style="font-size:12px">Direction</div><b style="color:${G.o.dir === 'buy' ? 'var(--money)' : 'var(--loss)'}">${G.o.dir.toUpperCase()}</b></div><div><div class="dim" style="font-size:12px">Amount · time</div><b>$${fmt(G.stake)} · ${G.o.minutes}m</b></div></div>
        <button class="btn sun" style="margin-top:16px" onclick="zbOpenTrade()"><span class="sw"></span>Open IQ Option</button><button class="btn" style="margin-top:8px;height:46px;font-size:14px" onclick="closeOvl()">Placed · back to the trade</button>
        <button class="btn" style="height:42px;font-size:13px;color:var(--dim)" onclick="closeOvl();ROOM.abort()">Skip it, stop here</button>`), 300); }
      LIVE.iv = setInterval(() => { const l = Math.max(0, Math.ceil((end - Date.now()) / 1000)); if (l !== LIVE.left) { LIVE.left = l; } const last = LIVE.pts[LIVE.pts.length - 1]; LIVE.pts.push(last + (Math.random() - .5) * LIVE.o.price * 0.00012); if (LIVE.pts.length > 240) LIVE.pts.shift(); updLive(); if (l <= 0) { clearInterval(LIVE.iv); finishStep(); } }, 250); }
    if (LIVE && LIVE.src === 'room' && LIVE.dur && !LIVE.auto && !LIVE.sigId && !LIVE.askResult) { LIVE.left = LIVE.dur; } };

  /* ---------- trade screen: stop auto-gale, real timeframe ---------- */
  const _trade = VIEWS.trade;
  VIEWS.trade = () => {
    let h = _trade(); const L = LIVE; if (!L) return h;
    if (L.src === 'room') {
      h = h.replace(/with [^<]+<\/div>/, `${L.roomAi ? aiOf(L.roomAi).name + '’s signal' : 'Your trade'} · ${tfL(L.o.minutes || 1)}</div>`);
      if (L.roomAi) h = h.replace(face(AI().f, 44, 'float'), face(aiOf(L.roomAi).f, 44, 'float'));
      h = h.replace(/Martingale step (\d+) of (\d+)/, 'Auto-gale $1 of $2').replace(/ · entry [0-9.]+/, ` · ${L.o.minutes || 1} min · digital`);
    }
    if (L.ladder && L.step < L.ladder.length - 1) h = h.replace('<div class="chat" id="chatL"></div>', `<div class="chat" id="chatL"></div><button class="stopgale" onclick="ROOM.stopGale()">Stop auto-gale after this trade</button>`);
    return h;
  };
  const _toastR = toast; toast = function (t) { if (LIVE && LIVE.src === 'room') t = String(t).replace(/^Martingale step (\d+): /, 'Auto-gale $1: '); return _toastR(t); };
  RP.abort = () => { const L = LIVE; if (!L) return; clearInterval(L.iv); L.ladder = L.ladder.slice(0, L.step + 1); L.stake = 0; L.win = false; _finishStep0(); };
  RP.stopGale = () => { if (!LIVE) return; LIVE.ladder = LIVE.ladder.slice(0, LIVE.step + 1); toast('Auto-gale stopped. This is the last trade.'); rerender(); };

  /* ---------- navigation: Signals tab ---------- */
  if (!DOCKED.includes('room')) DOCKED.push('room');
  dock = function () {
    const it = (k, l, i) => `<button class="${VIEW === k ? 'on' : ''}" onclick="go('${k}')" ${VIEW === k ? 'aria-current="page"' : ''}><span class="di">${ic(i, 20, 2)}</span>${l}</button>`;
    return `<nav class="dock" aria-label="Main">${it('home', 'Home', 'home')}${it('room', 'Signals', 'bolt')}<button class="z" id="dockZ" aria-label="Start trading" onclick="startTrade()">${zmark(28)}</button>${it('market', 'AIs', 'store')}${it('live', 'Live', 'live')}</nav>${supFab()}`;
  };

  /* ---------- new-signal pop on other tabs ---------- */
  let popSeen = 0;
  setInterval(async () => {
    if (VIEW === 'room' || VIEW === 'trade' || VIEW === 'ob' || S.ob < 9) return;
    await load(); const s = visible()[0]; if (!s || s.id <= popSeen || s.entryAt - now() < 10e3) return;
    if (!popSeen) { popSeen = s.id; return; }
    popSeen = s.id; const ai = aiOf(s.ai); const old = $('sigpop'); if (old) old.remove();
    const el = document.createElement('div'); el.className = 'sigpop'; el.id = 'sigpop';
    el.innerHTML = `${face(ai.f, 38)}<div class="tx"><b>${s.pair.replace(' OTC', '')} OTC · ${s.dir.toUpperCase()}</b><br>${ai.name} · entry ${fmtT(s.entryAt)} · ${tfL(s.minutes)}</div><button class="go" onclick="this.parentNode.remove();ROOM.myTrades('open')">Open</button>`;
    $('app').appendChild(el); try { SND.coin(); } catch (e) {}
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 6000);
  }, LIVEAPI ? 25000 : 15000);

  /* ---------- home: Signal Room entry card ---------- */
  const _home = VIEWS.home;
  VIEWS.home = () => {
    const h = _home(); if (S.ob < 9) return h; const s = visible()[0];
    const card = `<button class="card" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px;margin-top:12px;text-align:left" onclick="go('room')"><span style="width:46px;height:46px;border-radius:15px;background:var(--night);display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic('bolt', 22, 2.2, '#FFD21F')}</span><span style="flex:1;min-width:0"><b style="display:block;font-size:15.5px">Signal Room</b><span class="dim" style="display:block;font-size:12.5px;margin-top:2px">${s ? `Next: ${s.pair.replace(' OTC', '')} ${s.dir.toUpperCase()} at ${fmtT(s.entryAt)}` : 'Live OTC signals · trade them yourself'}</span></span><span class="chip ok"><span class="bd"></span>Live</span></button>`;
    const i = h.indexOf('<div class="ticker"'); return i > 0 ? h.slice(0, i) + card + h.slice(i) : h;
  };

  /* ===================== v14: PIN · QUICK TICKET · QUICK TRADE · OPEN TRADES (any number) ===================== */

  /* ---------- pin: your main AI ---------- */
  const pinned = () => { const mine = myAis(); if (S.room.pin && mine.includes(S.room.pin)) return S.room.pin; return mine.includes('luna') ? 'luna' : mine[0]; };
  RP.pin = (k) => { const sel = myAis(); if (!sel.includes(k)) { S.room.ais = [...sel, k]; } S.room.pin = k; save(); try { SND.tap(); } catch (e) {} toast(aiOf(k).name + ' is now your main AI'); if ($('ovl').innerHTML) RP.aiSheet(); else rerender(); };
  const _toggle = RP.toggleAi;
  RP.toggleAi = (k) => { if (k === pinned() && myAis().includes(k)) { toast('That’s your main AI. Pin another one first.'); return; } _toggle(k); };
  function orderFeed(list) { const p = pinned(); const head = list.find((s) => s.ai === p) || list[0]; return head ? [head, ...list.filter((s) => s !== head)] : []; }
  RP.aiSheet = () => {
    const mine = myAis(), pin = pinned();
    sheet(`<h2 style="font-size:22px;font-weight:800">Your AIs</h2><p class="dim" style="font-size:13.5px;margin-top:4px"><b style="color:var(--ink)">Follow</b> the AIs you want signals from. <b style="color:var(--ink)">Pin ★</b> one as your main AI: its signals come first, ready to trade in one tap.</p>
      <div class="aisel">${R.ais.filter((a) => AIS[a.key]).map((a) => { const ai = aiOf(a.key), on = mine.includes(a.key), pn = a.key === pin; return `<div class="airow ${on ? 'on' : ''} ${pn ? 'pn' : ''}">${face(ai.f, 44)}<span class="nm"><b>${ai.name}${pn ? ' <i class="mainb">MAIN</i>' : ''}</b><small>${ai.style || 'Signals'} · ${a.expiry} min calls</small></span>
        <button class="pinb ${pn ? 'on' : ''}" aria-label="Pin ${ai.name}" onclick="ROOM.pin('${a.key}')">★</button><button class="fol ${on ? 'on' : ''}" onclick="ROOM.toggleAi('${a.key}');ROOM.aiSheet()">${on ? 'Following' : 'Follow'}</button></div>`; }).join('')}</div>
      <button class="btn ink" style="margin-top:14px" onclick="closeOvl();rerender()">Done</button>`);
  };

  /* ---------- open trades engine (Signal Room) ---------- */
  const POS = RP.positions = []; let PID = 0;
  const MODE = () => window.ZB_AUTO ? 'auto' : window.ZB_LIVEMODE ? 'manual' : 'demo';
  const openPos = () => POS.filter((p) => p.status === 'placing' || p.status === 'open');
  const riskOf = (p) => { if (!(p.status === 'placing' || p.status === 'open')) return 0; let r = p.stake; if (!p.stopGale) for (let i = p.step + 1; i < p.ladder.length; i++) r += p.ladder[i]; return r; };
  const exposure = () => ({n: openPos().length, now: Math.round(openPos().reduce((a, p) => a + p.stake, 0) * 100) / 100, max: Math.round(openPos().reduce((a, p) => a + riskOf(p), 0) * 100) / 100});
  const WAIT = new Map();              // iq order/position id -> position (auto mode)
  let iqHooked = false;
  async function hookIQ() {
    if (iqHooked || !window.IQ) return; iqHooked = true;
    try { await window.IQ.onTradeClosed((r) => { for (const k of [r.id, ...(r.orderIds || [])]) { const p = WAIT.get(String(k)); if (p) { WAIT.delete(String(k)); settle(p, r.win ? 'win' : r.profit === 0 ? 'draw' : 'loss', r.profit, r.closeReason); return; } } }); } catch (e) { iqHooked = false; }
  }
  function newPos(t, practice) {
    const lad = ladderFor(t.amount, galeSteps());
    return {id: ++PID, pair: t.pair, dir: t.dir, minutes: t.minutes, base: t.amount, ladder: lad, step: 0, stake: lad[0], net: 0, ai: (t.sig && t.pair === t.sig.pair && t.dir === t.sig.dir && t.minutes === t.sig.minutes) ? t.sig.ai : null, sigId: (t.sig && t.pair === t.sig.pair && t.dir === t.sig.dir && t.minutes === t.sig.minutes) ? t.sig.id : null, copied: !!t.copied,
      mode: practice ? 'practice' : MODE(), status: 'placing', startedAt: now(), endsAt: 0, stopGale: false, iqId: null, logId: null, steps: []};
  }
  async function placeStep(p) {
    p.stake = p.ladder[p.step]; p.status = 'placing'; draw();
    if (p.mode === 'auto') {
      try {
        await hookIQ();
        const r = await window.IQ.placeTrade({pair: p.pair, direction: p.dir, amount: p.stake, minutes: p.minutes, kind: 'digital'});
        p.iqId = r.id; p.endsAt = r.expiresAt || now() + p.minutes * 60e3; p.status = 'open'; WAIT.set(String(r.id), p); if (r.orderId) WAIT.set(String(r.orderId), p);
        try { p.logId = (await window.ZBAPI('/api/trades', {iqOptionId: r.id, sigId: p.sigId, pair: p.pair, dir: p.dir, amount: p.stake, step: p.step})).id; } catch (e) {}
        // safety net: if IQ Option never reports the close, stop waiting after expiry + 2 min
        setTimeout(() => { if (p.status === 'open' && p.iqId === r.id) { WAIT.delete(String(r.id)); p.status = 'unknown'; pop(p, 'Result not received. Check IQ Option.'); draw(); } }, Math.max(0, p.endsAt - now()) + 120e3);
      } catch (e) {
        p.status = p.step ? 'stopped' : 'failed'; p.err = errText(e); p.doneAt = now();
        try { window.ZBAPI('/api/trades', {pair: p.pair, dir: p.dir, amount: p.stake, step: p.step, error: e.message || String(e)}); } catch (x) {}
        if (p.step) { p.net = +(p.net).toFixed(2); finish(p); }
        sheet(`<h2 style="font-size:22px;font-weight:800">${p.step ? 'Auto-gale stopped' : 'Trade not placed'}</h2><p class="ink2" style="font-size:15px;line-height:1.5;margin-top:8px">${p.err}</p><button class="btn ink" style="margin-top:18px" onclick="closeOvl()">OK</button>`);
      }
    } else {
      p.endsAt = now() + p.minutes * 60e3; p.status = 'open';
      if (p.mode === 'manual') manualPrompt(p);
    }
    draw();
  }
  function errText(e) { const m = String(e && (e.message || e)); return m === 'market_closed' ? 'This pair is closed right now. Try another OTC pair.' : /balance|insufficient|money/i.test(m) ? 'Not enough balance on IQ Option for this amount.' : m === 'no_expiry_available' ? 'That timeframe isn’t available on this pair right now.' : 'IQ Option didn’t accept the trade. Try again.'; }
  function manualPrompt(p) {
    sheet(`<h2 style="font-size:22px;font-weight:800">${p.step ? 'Auto-gale ' + p.step + ': place it now' : 'Place it on IQ Option'}</h2><p class="ink2" style="font-size:14.5px;line-height:1.5;margin-top:6px">${p.step ? 'The last trade lost. ' : ''}Open IQ Option, choose <b>Digital</b>, and place exactly this:</p>
      <div class="card" style="margin-top:14px;padding:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center"><div><div class="dim" style="font-size:12px">Pair</div><b>${p.pair}</b></div><div><div class="dim" style="font-size:12px">Direction</div><b style="color:${p.dir === 'buy' ? 'var(--money)' : 'var(--loss)'}">${p.dir.toUpperCase()}</b></div><div><div class="dim" style="font-size:12px">Amount · time</div><b>$${fmt(p.stake)} · ${p.minutes}m</b></div></div>
      <button class="btn sun" style="margin-top:16px" onclick="zbOpenTrade()"><span class="sw"></span>Open IQ Option</button><button class="btn ink" style="margin-top:8px" onclick="closeOvl()">I’ve placed it</button>
      ${p.step ? `<button class="btn" style="height:42px;font-size:13px;color:var(--dim)" onclick="closeOvl();ROOM.stopNow(${p.id})">Skip it, stop here</button>` : ''}`);
  }
  // results
  function settle(p, status, profit, reason) {
    if (!(p.status === 'open' || p.status === 'placing')) return;
    const pl = typeof profit === 'number' ? profit : status === 'win' ? +(p.stake * 0.85).toFixed(2) : status === 'draw' ? 0 : -p.stake;
    p.net = +(p.net + pl).toFixed(2); p.steps.push({stake: p.stake, status, pl});
    if (p.mode === 'auto' && p.logId) { try { window.ZBAPI('/api/trades', {id: p.logId, status, profit: pl, copied: p.copied && p.step === 0, expiryMin: p.minutes}); } catch (e) {} }
    if (status === 'loss' && !p.closedEarly && !p.stopGale && p.step < p.ladder.length - 1) {
      p.step++; try { SND.loss(); } catch (e) {} pop(p, `Lost $${fmt(p.stake)}. Auto-gale ${p.step}: $${fmt(p.ladder[p.step])} ${p.mode === 'manual' ? 'to place now' : 'placed'}`);
      placeStep(p); return;
    }
    p.status = status === 'win' ? 'won' : status === 'draw' ? 'draw' : 'lost'; finish(p);
  }
  function finish(p) {
    p.doneAt = now();
    if (p.mode !== 'practice') {
      S.today.n++; S.today[p.net > 0 ? 'w' : 'l']++; S.today.pl = +(S.today.pl + p.net).toFixed(2);
      if (p.mode !== 'auto') S.balance = +((S.balance || 0) + p.net).toFixed(2);
      S.history.unshift({pair: p.pair, dir: p.dir, stake: p.base, win: p.net > 0, pl: p.net, ai: p.ai || null, manual: !p.ai, t: 'Today', steps: p.step}); S.history = S.history.slice(0, 40);
      S.winRun = p.net > 0 ? S.winRun + 1 : 0; S.xp += 10;
    } else { S.practiced = true; S.xp += 5; }
    save(); try { (p.net > 0 ? SND.win : SND.loss)(); } catch (e) {}
    pop(p, p.status === 'won' ? `${p.step ? 'Recovered at auto-gale ' + p.step : 'Won'} · ${sgn(p.net)}` : p.status === 'draw' ? 'Draw · money back' : p.status === 'stopped' ? `Stopped · ${sgn(p.net)}` : `Lost · ${sgn(p.net)}`, true);
    if (p.net > 0 && VIEW === 'room') { try { confetti(26); } catch (e) {} }
    draw(); setTimeout(draw, 31000);
  }
  // demo / practice / manual: timer-driven
  setInterval(() => {
    for (const p of openPos()) {
      if (p.status !== 'open' || !p.endsAt || now() < p.endsAt) continue;
      if (p.mode === 'demo' || p.mode === 'practice') settle(p, Math.random() < 0.6 ? 'win' : 'loss');
      else if (p.mode === 'manual' && !p.asking) askResult(p);
    }
    tickUI();
  }, 1000);
  function askResult(p) {
    p.asking = true;
    sheet(`<h2 style="font-size:22px;font-weight:800">How did it close?</h2><p class="dim" style="font-size:13.5px;margin-top:4px">${p.pair} ${p.dir.toUpperCase()} $${fmt(p.stake)}${p.step ? ' · auto-gale ' + p.step : ''} on IQ Option</p>
      <div class="dirsel" style="margin-top:14px"><button class="b on" onclick="closeOvl();ROOM.answer(${p.id},'win')">Won</button><button class="s on" onclick="closeOvl();ROOM.answer(${p.id},'loss')">Lost</button></div>
      <button class="btn" style="height:44px;font-size:13.5px;margin-top:8px" onclick="closeOvl();ROOM.answer(${p.id},'draw')">Draw / refunded</button>`);
  }
  RP.answer = (id, st) => { const p = POS.find((x) => x.id === id); if (!p) return; p.asking = false; settle(p, st); };
  // controls
  RP.add = (id) => { const p = POS.find((x) => x.id === id); if (!p) return; RP.ticket(null, {pair: p.pair, dir: p.dir, minutes: p.minutes, amount: p.base, add: true}); };
  RP.stopGale = (id) => { if (typeof id !== 'number') { if (LIVE) { LIVE.ladder = LIVE.ladder.slice(0, LIVE.step + 1); toast('Auto-gale stopped. This is the last trade.'); rerender(); } return; } const p = POS.find((x) => x.id === id); if (!p) return; p.stopGale = true; toast('Auto-gale off for this trade'); draw(); };
  RP.stopNow = (id) => { const p = POS.find((x) => x.id === id); if (!p) return; p.stopGale = true; p.status = 'stopped'; p.stake = 0; finish(p); };
  RP.closeEarly = async (id) => {
    const p = POS.find((x) => x.id === id); if (!p || p.status !== 'open') return;
    if (p.mode === 'manual') { sheet(`<h2 style="font-size:22px;font-weight:800">Close it on IQ Option</h2><p class="ink2" style="font-size:14.5px;line-height:1.5;margin-top:6px">Close the trade in IQ Option, then tell us how it ended.</p><button class="btn sun" style="margin-top:16px" onclick="zbOpenTrade()"><span class="sw"></span>Open IQ Option</button><button class="btn ink" style="margin-top:8px" onclick="ROOM.closedManual(${p.id})">I closed it</button>`); return; }
    if (p.mode === 'auto') {
      try { const v = await window.IQ.tradeValue(p.iqId); const val = v && typeof v.sellProfit === 'number' ? v.sellProfit : null;
        sheet(`<h2 style="font-size:22px;font-weight:800">Close early?</h2><p class="ink2" style="font-size:14.5px;line-height:1.5;margin-top:6px">${p.pair} ${p.dir.toUpperCase()} $${fmt(p.stake)}${val != null ? `. Closing now returns about <b>$${fmt(val)}</b>` : ''}. Auto-gale won’t continue after an early close.</p><button class="btn ink" style="margin-top:16px" onclick="ROOM.doClose(${p.id})">Close now</button><button class="btn" style="height:46px;font-size:14px;margin-top:6px" onclick="closeOvl()">Keep it open</button>`);
      } catch (e) { toast('Couldn’t get the price. Try again.'); }
      return;
    }
    // demo / practice: simulated close value
    const pl = +((Math.random() - 0.45) * p.stake * 0.9).toFixed(2); p.closedEarly = true; settle(p, pl > 0 ? 'win' : 'loss', pl);
  };
  RP.doClose = async (id) => { const p = POS.find((x) => x.id === id); if (!p) return; closeOvl(); p.closedEarly = true; try { await window.IQ.closeTrade(p.iqId); toast('Closing on IQ Option…'); } catch (e) { p.closedEarly = false; toast('IQ Option couldn’t close it right now.'); } };
  RP.closedManual = (id) => { const p = POS.find((x) => x.id === id); if (!p) return; p.closedEarly = true; closeOvl(); askResult(p); };

  /* ---------- placing: every Signal Room trade becomes an open trade ---------- */
  launch = function (t, copied, practice) {
    if (!practice && needAct()) return;
    if (!practice && MODE() !== 'auto' && (S.balance || 0) > 0) { const need = exposure().now + t.amount; if (need > S.balance) { toast('Not enough balance for this amount'); return; } }
    S.room.amount = t.amount; S.stake = t.amount; save(); try { SND.place(); } catch (e) {}
    const p = newPos({...t, copied}, practice); POS.unshift(p); closeOvl();
    if (!p.ai || VIEW === 'trades') { CTX.tab = 'open'; if (VIEW !== 'trades') { CTX.trFrom = VIEW; go('trades'); } else rerender(); }   // own trade: show it in My trades
    else { if (VIEW !== 'room') go('room'); toast('Trade placed · tap the bar below to see it'); }
    placeStep(p);
    setTimeout(() => { const el = $('pos' + p.id); if (el) el.scrollIntoView({block: 'center', behavior: 'smooth'}); }, 120);
  };

  /* ---------- open trades UI ---------- */
  function posCard(p) {
    const ai = p.ai ? aiOf(p.ai) : null, live = p.status === 'open' || p.status === 'placing';
    const left = p.endsAt ? Math.max(0, (p.endsAt - now()) / 1000) : p.minutes * 60, frac = p.endsAt ? Math.min(1, left / (p.minutes * 60)) : 1;
    const head = `<div class="pc-h">${ai ? face(ai.f, 34) : `<span class="pc-me">${ic('bolt', 18, 2.4, '#FFD21F')}</span>`}<div class="pc-t"><b>${p.pair.replace(' OTC', '')} <span>OTC</span></b><small>${ai ? ai.name + '’s signal' : 'Your trade'} · ${tfL(p.minutes)} digital${p.mode === 'practice' ? ' · practice' : ''}</small></div><span class="dd ${p.dir}">${p.dir === 'buy' ? '▲ BUY' : '▼ SELL'}</span></div>`;
    if (!live) {
      const cls = p.status === 'won' ? 'win' : p.status === 'draw' || p.status === 'unknown' ? 'draw' : 'loss';
      return `<div class="pcard done ${cls}" id="pos${p.id}">${head}<div class="pc-res"><span>${p.status === 'won' ? (p.step ? 'Recovered at auto-gale ' + p.step : 'Won') : p.status === 'draw' ? 'Draw' : p.status === 'unknown' ? 'Check IQ Option' : p.status === 'failed' ? 'Not placed' : p.status === 'stopped' ? 'Stopped' : 'Lost'}</span><b class="num">${p.status === 'failed' ? '' : sgn(p.net)}</b></div></div>`;
    }
    const lad = p.ladder.length > 1 ? `<div class="pc-lad">${p.ladder.map((v, i) => `<i class="${i < p.step ? 'x' : i === p.step ? 'on' : ''} ${p.stopGale && i > p.step ? 'off' : ''}">${i ? 'G' + i : 'T'} $${fmt(v)}</i>`).join('')}</div>` : '';
    return `<div class="pcard" id="pos${p.id}">${head}
      <div class="pc-m"><div><small>${p.step ? 'Auto-gale ' + p.step + ' of ' + (p.ladder.length - 1) : 'Amount'}</small><b class="num">$${fmt(p.stake)}</b></div><div class="pc-cd"><small>${p.status === 'placing' ? 'Placing…' : 'Ends ' + fmtT(p.endsAt, true)}</small><b class="num" id="pt${p.id}">${p.status === 'placing' ? '…' : ms2(left)}</b></div></div>
      <div class="pc-bar"><i id="pb${p.id}" style="width:${frac * 100}%"></i></div>${lad}
      <div class="pc-a"><button onclick="ROOM.add(${p.id})">＋ Add</button><button onclick="ROOM.closeEarly(${p.id})" ${p.status !== 'open' ? 'disabled' : ''}>Close early</button>${p.ladder.length > 1 && p.step < p.ladder.length - 1 && !p.stopGale ? `<button class="sg" onclick="ROOM.stopGale(${p.id})">Stop gale</button>` : ''}</div></div>`;
  }
  function posPanel() {
    const live = openPos(), recent = POS.filter((p) => !(p.status === 'open' || p.status === 'placing') && now() - (p.doneAt || 0) < 30000);
    if (!live.length && !recent.length) return '';
    const e = exposure();
    return `<div class="rsec" style="margin-top:16px"><h2>Open trades${live.length ? ' · ' + live.length : ''}</h2><span>${live.length ? `$${fmt(e.now)} in · up to <b style="color:var(--loss)">$${fmt(e.max)}</b> at risk` : 'Just closed'}</span></div>
      <div class="plist">${[...live, ...recent].map(posCard).join('')}</div>`;
  }
  function tickUI() {
    for (const p of openPos()) { if (!p.endsAt) continue; const l = Math.max(0, (p.endsAt - now()) / 1000), t = $('pt' + p.id), b = $('pb' + p.id); if (t) t.textContent = ms2(l); if (b) b.style.width = Math.min(1, l / (p.minutes * 60)) * 100 + '%'; }
    const pb = $('posbar'); if (pb) { const e = exposure(); if (!e.n) pb.remove(); else { const nx = openPos().filter((p) => p.endsAt).sort((a, b) => a.endsAt - b.endsAt)[0]; const t = pb.querySelector('.t'); if (t) t.textContent = `${e.n} open${nx ? ' · ends ' + ms2((nx.endsAt - now()) / 1000) : ''}`; } }
  }
  function draw() { if ((VIEW === 'room' || VIEW === 'trades') && !$('ovl').innerHTML.includes('class="tk')) { rerender(); } else if (DOCKED.includes(VIEW)) { const d = document.querySelector('.dock'); if (d && !$('posbar') && exposure().n) d.insertAdjacentHTML('beforebegin', posBar()); } }
  const posBar = () => { const e = exposure(); return e.n && VIEW !== 'trades' ? `<button class="posbar" id="posbar" onclick="ROOM.myTrades('open')"><span class="ping" style="background:var(--sun)"></span><span class="t">${e.n} trade${e.n > 1 ? 's' : ''} open</span><span class="num r">$${fmt(e.now)} in</span></button>` : ''; };
  // result pop (top of screen, any tab)
  function pop(p, text, final) {
    const old = $('posPop'); if (old) old.remove(); const ai = p.ai ? aiOf(p.ai) : null;
    const el = document.createElement('div'); el.className = 'sigpop ' + (final ? (p.net > 0 ? 'pwin' : 'ploss') : ''); el.id = 'posPop';
    el.innerHTML = `${ai ? face(ai.f, 36) : `<span class="pc-me" style="width:36px;height:36px">${ic('bolt', 18, 2.4, '#FFD21F')}</span>`}<div class="tx"><b>${p.pair.replace(' OTC', '')} ${p.dir.toUpperCase()}</b><br>${text}</div><button class="go" onclick="this.parentNode.remove();ROOM.myTrades('open')">View</button>`;
    $('app').appendChild(el); setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 4500);
  }

  /* ---------- quick trade bar (trade it yourself) ---------- */
  const QT = {pair: null, minutes: null};
  function quickBar() {
    const pairs = R.pairs && R.pairs.length ? R.pairs : OTC; const pair = pairs.includes(QT.pair || S.room.pair) ? (QT.pair || S.room.pair) : pairs[0];
    const mins = QT.minutes || S.room.minutes || 1, amt = stakeDefault(), n = galeSteps();
    return `<div class="qbar"><div class="qb-h"><b>Trade it yourself</b><button onclick="ROOM.ticket()">More options</button></div>
      <div class="pchips qb-p">${pairs.map((p) => `<button class="${p === pair ? 'on' : ''}" onclick="ROOM.qset('pair','${p}')">${p.replace(' OTC', '')}<small>OTC</small></button>`).join('')}</div>
      <div class="qb-r"><div class="qb-seg">${EXPIRIES.map((m) => `<button class="${m === mins ? 'on' : ''}" onclick="ROOM.qset('minutes',${m})">${m}m</button>`).join('')}</div>
        <button class="qb-amt" onclick="ROOM.qamt()"><small>Amount</small><b class="num">$${fmt(amt)}</b></button>
        <button class="qb-g" onclick="ROOM.aiGale()"><small>Gale</small><b>${n || 'Off'}</b></button></div>
      <div class="dirsel qb-d"><button class="b on" onclick="ROOM.quick('buy')">${ic('up', 20, 3)}BUY</button><button class="s on" onclick="ROOM.quick('sell')">${ic('dn', 20, 3)}SELL</button></div>
      <p class="qb-f">${pair} · ${mins} min digital · $${fmt(amt)}${n ? ' · auto-gale ' + n + ' (up to $' + fmt(ladderFor(amt, n).reduce((a, b) => a + b, 0)) + ')' : ''}</p></div>`;
  }
  RP.qset = (k, v) => { QT[k] = v; if (k === 'pair') S.room.pair = v; if (k === 'minutes') S.room.minutes = v; save(); const q = $('qbar'); if (q) q.innerHTML = quickBar(); };
  RP.qamt = () => { sheet(`<h2 style="font-size:22px;font-weight:800">Amount per trade</h2><div class="optrow five" style="margin-top:14px">${[1, 5, 10, 25, 50].map((v) => `<button class="${v === stakeDefault() ? 'on' : ''}" onclick="S.room.amount=${v};save();closeOvl();ROOM.qset()">$${v}</button>`).join('')}</div>
      <div class="amtline"><input id="qAmt" type="number" inputmode="decimal" min="1" placeholder="Other amount"><button class="btn ink sm" style="width:auto;padding:0 18px" onclick="const v=Math.max(1,Math.round((+$('qAmt').value||0)*100)/100);S.room.amount=v;save();closeOvl();ROOM.qset()">Set</button></div><p class="dim" style="font-size:12.5px;margin-top:10px">Tip: 1–2% of your balance per trade.</p>`); };
  RP.aiGale = () => { sheet(`<h2 style="font-size:22px;font-weight:800">Auto-gale</h2><p class="dim" style="font-size:13.5px;margin-top:4px">If a trade loses, the next step goes in by itself (×${S.mg.mult}). It stops at the first win.</p>
      <div class="optrow" style="grid-template-columns:repeat(6,minmax(0,1fr));margin-top:14px">${[0, 1, 2, 3, 4, 5].map((v) => `<button class="${v === galeSteps() ? 'on' : ''}" onclick="S.mg.on=${v > 0};if(${v})S.mg.steps=${v};save();closeOvl();ROOM.qset()">${v || 'Off'}</button>`).join('')}</div>`); };
  RP.quick = (dir) => {
    const pairs = R.pairs && R.pairs.length ? R.pairs : OTC; const pair = pairs.includes(QT.pair || S.room.pair) ? (QT.pair || S.room.pair) : pairs[0];
    const t = {sig: null, pair, dir, minutes: QT.minutes || S.room.minutes || 1, amount: stakeDefault(), when: 'now'};
    if (!activated()) { sheet(`<h2 style="font-size:22px;font-weight:800">Activate to trade</h2><p class="ink2" style="font-size:14.5px;line-height:1.5;margin-top:6px">Fund your IQ Option account from <b>$20</b> to place real trades. Or try this one as a free practice trade.</p><button class="btn sun" style="margin-top:16px" onclick="closeOvl();actSheet()"><span class="sw"></span>Activate from $20</button><button class="btn" style="height:46px;font-size:14px;margin-top:6px" onclick="ROOM.practiceQuick('${dir}')">Practice it free</button>`); return; }
    launch(t, false, false);
  };
  RP.practiceQuick = (dir) => { const pairs = R.pairs && R.pairs.length ? R.pairs : OTC; launch({sig: null, pair: pairs.includes(S.room.pair) ? S.room.pair : pairs[0], dir, minutes: 1, amount: stakeDefault(), when: 'now'}, false, true); };

  /* ---------- quicker signal ticket: amount → place (edit is optional) ---------- */
  const _ticket = RP.ticket;
  RP.ticket = (sigId, pre) => {
    _ticket(sigId);                                   // sets TK + draws the full ticket
    if (pre) { Object.assign(TK, pre, {sig: null, when: 'now'}); TK.full = true; drawTicket(); return; }
    if (TK.sig) { TK.full = false; drawTicket(); }
  };
  const _draw = drawTicket;
  drawTicket = function () {
    const t = TK; if (!t.sig || t.full) { _draw(); if (t.add) { const h = document.querySelector('.tk h2'); if (h) h.textContent = 'Add to position'; } return; }
    const s = t.sig, ai = aiOf(s.ai), n = galeSteps(), lad = ladderFor(t.amount, n), total = lad.reduce((a, b) => a + b, 0), left = (s.entryAt - now()) / 1000, future = left > 3;
    sheet(`<div class="tk qt"><div class="qt-sig ${s.dir}">${face(ai.f, 44)}<div class="qt-i"><small>${ai.name}${s.ai === pinned() ? ' · ★ main AI' : ''}</small><b>${s.pair.replace(' OTC', '')} <span>OTC</span></b><em>${tfL(s.minutes)} digital · entry ${fmtT(s.entryAt)}</em></div><span class="dirb ${s.dir}">${s.dir === 'buy' ? '▲ BUY' : '▼ SELL'}</span></div>
      <div class="lbl">Amount <span class="num">Balance $${fmt(S.balance || 0)}</span></div>
      <div class="optrow five">${[1, 5, 10, 25, 50].map((v) => `<button class="${v === t.amount ? 'on' : ''}" onclick="ROOM.set('amount',${v})">$${v}</button>`).join('')}</div>
      <div class="amtline"><input id="tkAmt" type="number" inputmode="decimal" min="1" placeholder="Other amount" onchange="ROOM.set('amount',Math.max(1,Math.round((+this.value||0)*100)/100))"></div>
      <div class="qt-g"><div><b>Auto-gale ${n ? n + ' steps' : 'off'}</b><small>${n ? lad.map((v) => '$' + fmt(v)).join(' → ') + ' · up to $' + fmt(Math.round(total * 100) / 100) : 'Only this one trade'}</small></div><div class="stp"><button aria-label="Fewer" onclick="ROOM.gale(-1)">−</button><span>${n}</span><button aria-label="More" onclick="ROOM.gale(1)">+</button></div></div>
      <div class="tkfoot">${activated() ? `<button class="btn sun" onclick="ROOM.set('when','${future ? 'entry' : 'now'}');ROOM.confirm()"><span class="sw"></span>${future ? 'Place $' + fmt(t.amount) + ' at ' + fmtT(s.entryAt) : 'Place $' + fmt(t.amount) + ' ' + s.dir.toUpperCase() + ' now'}<small>${s.pair} · ${tfL(s.minutes)}${n ? ' · auto-gale ' + n : ''}</small></button>
        <div class="qt-l">${future ? `<button onclick="ROOM.set('when','now');ROOM.confirm()">Place now instead</button>` : ''}<button onclick="TK.full=true;ROOM.set('full',true)">Edit pair, direction or time</button></div>`
        : `<button class="btn sun" onclick="closeOvl();actSheet()"><span class="sw"></span>Activate to trade<small>Fund from $20 on your IQ Option account</small></button><button class="btn" style="height:46px;font-size:14px;margin-top:6px" onclick="ROOM.confirm(true)">Practice this trade free</button>`}</div></div>`);
  };

  /* ---------- room view: pinned first, open trades, quick trade bar ---------- */
  const _visible = visible;
  visible = () => orderFeed(_visible());
  const _nextCard = nextCard;
  nextCard = function (s, popped) {
    let h = _nextCard(s, popped); const isPin = s.ai === pinned();
    h = h.replace(/<span class="nx-k">([^<]*)<\/span>/, `<span class="nx-k">${isPin ? '★ Main AI · ' : ''}$1</span>`);
    if (!isPin) h = h.replace('<div class="nx-cta">', `<button class="nx-pin" onclick="ROOM.pin('${s.ai}')">★ Make ${aiOf(s.ai).name} my main AI</button><div class="nx-cta">`);
    return h.replace(/>\s*<span class="sw"><\/span>Trade this signal<\/button>/, `><span class="sw"></span>Trade $${fmt(stakeDefault())} · ${s.dir.toUpperCase()}</button>`);
  };
  const _room = VIEWS.room;
  VIEWS.room = () => {
    let h = _room(); const pin = pinned();
    // AI chips: main AI first with a star
    h = h.replace(/<div class="aibar">[\s\S]*?<button class="aich edit"/, () => {
      const mine = myAis(); const keys = R.ais.filter((a) => AIS[a.key]).map((a) => a.key).sort((a, b) => (a === pin ? -1 : b === pin ? 1 : 0));
      return `<div class="aibar">${keys.map((k) => { const on = mine.includes(k), pn = k === pin; return `<button class="aich ${on ? 'on' : 'off'} ${pn ? 'pin' : ''}" aria-pressed="${on}" onclick="${pn ? 'ROOM.aiSheet()' : `ROOM.toggleAi('${k}')`}">${face(aiOf(k).f, 30)}${aiOf(k).name}${pn ? '<i>★</i>' : ''}</button>`; }).join('')}<button class="aich edit"`;
    });
    h = h.replace(`${ic('cog', 16, 2.2)} Choose`, `${ic('cog', 16, 2.2)} Follow · Pin`);
    // open trades right under the header, quick trade bar after the signals
    // v15: open trades + "trade it yourself" moved to My trades (side menu). The room shows signals only.
    h = h.replace('<div class="today">', `<button class="mt-link" onclick="ROOM.myTrades('new')"><span>${ic('plus', 18, 2.4)}</span><b>Trade it yourself<small>Pick a pair, time and amount</small></b>${ic('right', 18, 2.2)}</button><div class="today">`);
    return h.replace('<button class="fabnew" onclick="ROOM.ticket()"><i>+</i>New trade</button>', '');
  };
  // dock: show open-trades bar on other tabs
  const _dock = dock;
  dock = function () { return posBar() + _dock(); };
  // keep the Zara flow's banner + open trades bar from overlapping
  const st2 = document.createElement('style'); st2.textContent = '#banner:empty+*{}'; document.head.appendChild(st2);

  /* ===================== v15: My trades (side menu) — New trade · Open · History ===================== */
  RP.myTrades = (tab) => { CTX.tab = tab || CTX.tab; if (VIEW !== 'trades') CTX.trFrom = VIEW; closeOvl(); go('trades'); };
  const _trades = VIEWS.trades;
  const tradesInner = (t) => { const keep = CTX.tab; CTX.tab = t; const h = _trades(); CTX.tab = keep; const i = h.indexOf('<div class="tabs"'); const j = h.indexOf('</div>', i) + 6; return h.slice(j, h.lastIndexOf('</div>')); };
  VIEWS.trades = () => {
    const live = openPos(), recent = POS.filter((p) => !(p.status === 'open' || p.status === 'placing') && now() - (p.doneAt || 0) < 30000);
    const zara = !!(typeof LIVE !== 'undefined' && LIVE && LIVE.active), nOpen = live.length + (zara ? 1 : 0);
    const tab = ['new', 'open', 'hist'].includes(CTX.tab) ? CTX.tab : (nOpen ? 'open' : 'new'); CTX.tab = tab;
    const tabs = `<div class="tabs mt-tabs" role="tablist">${[['new', 'New trade'], ['open', 'Open' + (nOpen ? ' · ' + nOpen : '')], ['hist', 'History']].map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" onclick="CTX.tab='${k}';rerender()">${l}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'new') body = `<div id="qbar" class="mt-new">${quickBar()}</div><p class="dim mt-note">Your own trade, no signal needed. It’s placed on your IQ Option account. Trading is risky; only trade what you can afford to lose.</p>`;
    else if (tab === 'open') {
      const e = exposure();
      body = (zara ? tradesInner('active') : '') + (live.length || recent.length
        ? `<div class="mt-sum"><span>${live.length} open${live.length ? ` · <b class="num">$${fmt(e.now)}</b> in trades` : ''}</span><span>${cityOf(CTRY())} time</span></div><div class="plist">${[...live, ...recent].map(posCard).join('')}</div><p class="dim mt-note">Trades close on their own at the end time.</p>`
        : zara ? '' : `<div class="card mt-empty"><div class="mt-ei">${ic('bolt', 30, 2, '#5A4400')}</div><b>No open trades</b><p class="dim">Your running trades show here with a live countdown.</p><div class="mt-eb"><button class="btn sun" onclick="CTX.tab='new';rerender()"><span class="sw"></span>New trade</button><button class="btn ghost2" onclick="go('room')">See signals</button></div></div>`);
    } else body = tradesInner('hist');
    return `<div class="scr">
      <div class="top"><button class="icb" aria-label="Back" onclick="go(CTX.trFrom && CTX.trFrom !== 'trades' ? CTX.trFrom : 'home')">${ic('back', 18, 2.2)}</button><span style="font-weight:800;font-size:16px">My trades</span><button class="icb" aria-label="Signals" onclick="go('room')">${ic('bolt', 18, 2.2)}</button></div>
      ${tabs}${body}</div>`;
  };
  // side menu: own trades get their own entries
  const _drawer = drawer;
  drawer = function () {
    _drawer(); const o = $('ovl'); const n = openPos().length + (typeof LIVE !== 'undefined' && LIVE && LIVE.active ? 1 : 0);
    const it = (i, l, tab, tag = '') => `<button class="mi" onclick="ROOM.myTrades('${tab}')"><span class="mic">${ic(i, 19, 2)}</span>${l}${tag}</button>`;
    o.innerHTML = o.innerHTML.replace(/<button class="mi" onclick="closeOvl\(\);go\('trades'\)">[\s\S]*?Active trades and history<\/button>/, '')
      .replace('<div class="mgrp">Trade</div>', `<div class="mgrp">My trades</div>${it('plus', 'Trade it yourself', 'new')}${it('bolt', 'Open trades', 'open', n ? `<span class="tag mt-badge">${n}</span>` : '')}${it('hist', 'Trade history', 'hist')}<div class="mgrp">Trade</div>`);
  };
  { const st = document.createElement('style'); st.textContent = `
    .mt-tabs{margin-top:16px;grid-template-columns:repeat(3,minmax(0,1fr))}
    .posbar{right:88px}
    .mt-new{margin-top:14px}.mt-new .qbar{margin-top:0}
    .mt-note{font-size:12px;text-align:center;line-height:1.5;margin:12px 8px 0}
    .mt-sum{display:flex;justify-content:space-between;font-size:12.5px;color:var(--mute);margin:16px 2px 10px}.mt-sum b{color:var(--ink)}
    .mt-empty{margin-top:14px;padding:26px 18px;text-align:center}.mt-empty b{display:block;font-size:17px;margin-top:12px}.mt-empty p{font-size:13.5px;margin-top:4px}
    .mt-ei{display:inline-flex;width:64px;height:64px;border-radius:20px;background:var(--sun-t);align-items:center;justify-content:center}
    .mt-eb{display:flex;flex-direction:column;gap:8px;margin-top:16px}.btn.ghost2{background:transparent;border:1px solid var(--line);color:var(--ink)}
    .mt-link{display:flex;align-items:center;gap:12px;width:100%;margin-top:16px;padding:14px;border-radius:20px;background:#FFF;border:1px solid var(--line);text-align:left}
    .mt-link>span{width:40px;height:40px;border-radius:13px;background:var(--sun);display:grid;place-items:center;flex:none}
    .mt-link b{flex:1;font-size:15px}.mt-link small{display:block;font-weight:600;font-size:12.5px;color:var(--mute);margin-top:1px}
    .mt-badge{background:var(--loss);color:#FFF}
  `; document.head.appendChild(st); }

  /* ===================== v16: New trade — 4 clear steps + searchable pairs ===================== */
  const PAIRINFO = {
    'EUR/USD': ['🇪🇺🇺🇸', 'Euro · US Dollar'], 'GBP/USD': ['🇬🇧🇺🇸', 'British Pound · US Dollar'], 'USD/JPY': ['🇺🇸🇯🇵', 'US Dollar · Japanese Yen'],
    'AUD/CAD': ['🇦🇺🇨🇦', 'Australian Dollar · Canadian Dollar'], 'EUR/JPY': ['🇪🇺🇯🇵', 'Euro · Japanese Yen'], 'GBP/JPY': ['🇬🇧🇯🇵', 'British Pound · Japanese Yen'],
    'NZD/USD': ['🇳🇿🇺🇸', 'New Zealand Dollar · US Dollar'], 'USD/CHF': ['🇺🇸🇨🇭', 'US Dollar · Swiss Franc'], 'AUD/USD': ['🇦🇺🇺🇸', 'Australian Dollar · US Dollar'],
    'EUR/GBP': ['🇪🇺🇬🇧', 'Euro · British Pound'], 'USD/CAD': ['🇺🇸🇨🇦', 'US Dollar · Canadian Dollar'], 'AUD/JPY': ['🇦🇺🇯🇵', 'Australian Dollar · Japanese Yen'],
    'EUR/CAD': ['🇪🇺🇨🇦', 'Euro · Canadian Dollar'], 'CAD/JPY': ['🇨🇦🇯🇵', 'Canadian Dollar · Japanese Yen'], 'CHF/JPY': ['🇨🇭🇯🇵', 'Swiss Franc · Japanese Yen'],
    'GBP/CAD': ['🇬🇧🇨🇦', 'British Pound · Canadian Dollar'], 'GBP/AUD': ['🇬🇧🇦🇺', 'British Pound · Australian Dollar'], 'EUR/AUD': ['🇪🇺🇦🇺', 'Euro · Australian Dollar'],
    'NZD/JPY': ['🇳🇿🇯🇵', 'New Zealand Dollar · Japanese Yen'], 'GBP/CHF': ['🇬🇧🇨🇭', 'British Pound · Swiss Franc']
  };
  const POPULAR = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/CAD', 'EUR/JPY', 'GBP/JPY'];
  const allPairs = () => { const srv = (R.pairs && R.pairs.length ? R.pairs : OTC).map((p) => p.replace(' OTC', '')); return [...new Set([...srv, ...Object.keys(PAIRINFO)])].map((p) => p + ' OTC'); };
  const curPair = () => { const L = allPairs(), v = QT.pair || S.room.pair; return L.includes(v) ? v : L[0]; };
  const pinfo = (p) => PAIRINFO[p.replace(' OTC', '')] || ['', 'OTC market'];
  const flags = (p) => { const cp = Array.from(pinfo(p)[0] || ''); return `<span class="nt-fl" aria-hidden="true">${cp.length >= 4 ? `<i>${cp[0] + cp[1]}</i><i>${cp[2] + cp[3]}</i>` : ic('globe', 18, 2)}</span>`; };
  const PAYOUT = 0.85;   // shown as "about"; the real payout is set by IQ Option per pair
  quickBar = function () {
    const pair = curPair(), mins = QT.minutes || S.room.minutes || 1, amt = stakeDefault(), n = galeSteps(), lad = ladderFor(amt, n);
    const recent = (S.room.recentPairs || []).filter((x) => x !== pair).slice(0, 3);
    const step = (k, t, sub) => `<div class="nt-st"><span class="nt-n">${k}</span><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    return `<div class="nt">
      ${step(1, 'Choose a market')}
      <button class="nt-pair" onclick="ROOM.pairSheet()">${flags(pair)}<span class="nt-pn"><b>${pair.replace(' OTC', '')}</b><small>${pinfo(pair)[1]}</small></span><span class="nt-chg">${ic('search', 16, 2.2)} Change</span></button>
      ${recent.length ? `<div class="nt-rec"><small>Recent</small>${recent.map((r) => `<button onclick="ROOM.pickPair('${r}')">${r.replace(' OTC', '')}</button>`).join('')}</div>` : ''}
      ${step(2, 'How long?', 'The trade ends after this time')}
      <div class="nt-seg">${EXPIRIES.map((m) => `<button class="${m === mins ? 'on' : ''}" onclick="ROOM.qset('minutes',${m})"><b>${m < 1 ? 30 : m}</b> ${m < 1 ? 'sec' : 'min'}</button>`).join('')}</div>
      ${step(3, 'How much?', S.balance ? 'Balance $' + fmt(S.balance) : '')}
      <label class="nt-in" for="ntAmt"><button type="button" aria-label="Less" onclick="ROOM.amtStep(-1)">−</button>
        <span class="nt-box"><small>Type your amount</small><span class="nt-iv"><i>$</i><input id="ntAmt" class="num" type="text" inputmode="decimal" autocomplete="off" value="${amt}" style="width:${String(amt).length + 0.6}ch" oninput="this.style.width=(this.value.length+0.6)+'ch';ROOM.amtType(this.value)" onfocus="this.select()" onblur="ROOM.qset()"></span></span>
        <button type="button" aria-label="More" onclick="ROOM.amtStep(1)">+</button></label>
      <div class="nt-chips2">${[1, 5, 10, 25, 50, 100, 200].map((v) => `<button class="${v === amt ? 'on' : ''}" data-v="${v}" onclick="S.room.amount=${v};save();ROOM.qset()">$${v}</button>`).join('')}<button data-v="max" class="${S.balance && amt === Math.floor(S.balance) ? 'on' : ''}" onclick="S.room.amount=Math.max(1,Math.floor(S.balance||1));save();ROOM.qset()">Max</button></div>
      <p class="nt-warn" id="ntWarn" ${S.balance && amt > S.balance ? '' : 'hidden'}>That’s more than your balance ($${fmt(S.balance || 0)}).</p>
      <button class="nt-gale" onclick="ROOM.aiGale()"><span class="nt-gi">${ic('loop', 18, 2.2, '#5A4400')}</span><span class="nt-gt"><b>Auto-gale ${n ? n + ' steps' : 'off'}</b><small id="ntLad">${n ? 'If it loses: ' + lad.slice(1).map((x) => '$' + fmt(x)).join(' → ') : 'One trade only, no retries'}</small></span><span class="nt-chg">Change</span></button>
      <div class="nt-bar">
        <div class="nt-bs"><span><b>${pair.replace(' OTC', '')}</b> · ${tfL(mins)} · <b class="num" id="ntBarAmt">$${fmt(amt)}</b></span><span>Win about <b class="num" id="ntWin" style="color:var(--money-d)">+$${fmt(Math.round(amt * PAYOUT * 100) / 100)}</b></span></div>
        <div class="nt-dir"><button class="b" onclick="ROOM.quick('buy')">${ic('up', 22, 3)}<span><b>BUY</b><small>Price goes up</small></span></button><button class="s" onclick="ROOM.quick('sell')">${ic('dn', 22, 3)}<span><b>SELL</b><small>Price goes down</small></span></button></div>
      </div>
    </div>`;
  };
  // typing an amount updates the screen without redrawing it (the keyboard stays open)
  RP.amtType = (v) => { const x = Math.round(parseFloat(String(v).replace(/[^0-9.]/g, '')) * 100) / 100; if (!(x > 0)) return; S.room.amount = x; save();
    const n = galeSteps(), lad = ladderFor(x, n), set = (id, t) => { const e = $(id); if (e) e.textContent = t; };
    set('ntBarAmt', '$' + fmt(x)); set('ntWin', '+$' + fmt(Math.round(x * PAYOUT * 100) / 100)); if (n) set('ntLad', 'If it loses: ' + lad.slice(1).map((y) => '$' + fmt(y)).join(' → '));
    document.querySelectorAll('.nt-chips2 button').forEach((b) => b.classList.toggle('on', +b.dataset.v === x));
    const w = $('ntWarn'); if (w) w.hidden = !(S.balance && x > S.balance); };
  RP.amtStep = (d) => { const a = stakeDefault(), st = a < 10 ? 1 : a < 50 ? 5 : 10; S.room.amount = Math.max(1, Math.round((a + d * st) / st) * st || 1); save(); RP.qset(); };
  RP.pickPair = (p) => { S.room.recentPairs = [p, ...(S.room.recentPairs || []).filter((x) => x !== p)].slice(0, 5); save(); closeOvl(); RP.qset('pair', p); };
  const pairRow = (p) => `<button class="pk-row ${p === curPair() ? 'on' : ''}" onclick="ROOM.pickPair('${p}')">${flags(p)}<span class="nt-pn"><b>${p.replace(' OTC', '')} <i>OTC</i></b><small>${pinfo(p)[1]}</small></span>${p === curPair() ? ic('check', 18, 2.6, '#0A8F61') : ''}</button>`;
  RP.pairFilter = (q) => {
    q = String(q || '').toLowerCase().replace(/[^a-z]/g, ''); const L = allPairs();
    const hit = (p) => !q || (p + pinfo(p)[1]).toLowerCase().replace(/[^a-z]/g, '').includes(q);
    const pop = POPULAR.map((x) => x + ' OTC').filter((p) => L.includes(p) && hit(p)), rest = L.filter((p) => !POPULAR.includes(p.replace(' OTC', '')) && hit(p));
    $('pkList').innerHTML = (pop.length ? `<div class="pk-h">${q ? 'Results' : 'Popular'}</div>${pop.map(pairRow).join('')}` : '') + (rest.length ? `<div class="pk-h">${q ? '' : 'All markets'}</div>${rest.map(pairRow).join('')}` : '') + (!pop.length && !rest.length ? `<p class="dim pk-none">No market called “${q}”. Try “EUR”, “yen” or “pound”.</p>` : '');
  };
  RP.pairSheet = () => {
    sheet(`<h2 style="font-size:22px;font-weight:800">Choose a market</h2><p class="dim" style="font-size:13.5px;margin-top:2px">OTC markets are open 24/7, weekends too.</p>
      <label class="pk-s">${ic('search', 18, 2.2)}<input id="pkQ" type="search" placeholder="Search: EUR, dollar, yen…" autocomplete="off" oninput="ROOM.pairFilter(this.value)"></label>
      <div id="pkList" class="pk-l"></div>`);
    RP.pairFilter(''); setTimeout(() => { const q = $('pkQ'); if (q) try { q.focus({preventScroll: true}); } catch (e) {} }, 250);
  };
  RP.aiGale = () => { const amt = stakeDefault(); sheet(`<h2 style="font-size:22px;font-weight:800">Auto-gale</h2><p class="dim" style="font-size:13.5px;margin-top:4px;line-height:1.5">If a trade loses, the next one goes in by itself with a bigger amount, so one win covers the losses. It stops at the first win.</p>
      <div class="optrow" style="grid-template-columns:repeat(6,minmax(0,1fr));margin-top:14px">${[0, 1, 2, 3, 4, 5].map((v) => `<button class="${v === galeSteps() ? 'on' : ''}" onclick="S.mg.on=${v > 0};if(${v})S.mg.steps=${v};save();ROOM.aiGale();ROOM.qset()">${v || 'Off'}</button>`).join('')}</div>
      ${galeSteps() ? `<div class="nt-lad">${ladderFor(amt, galeSteps()).map((x, i) => `<div><span>${i ? 'Step ' + i : 'Trade'}</span><b class="num">$${fmt(x)}</b></div>`).join('')}</div><p class="dim" style="font-size:12.5px;margin-top:8px">If every step loses, the total is $${fmt(ladderFor(amt, galeSteps()).reduce((a, b) => a + b, 0))}.</p>` : ''}
      <button class="btn ink" style="margin-top:14px" onclick="closeOvl()">Done</button>`); };
  if (!IC.search) IC.search = '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>';
  if (!IC.loop) IC.loop = '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"/><path d="M4 20v-4.5h4.5"/>';
  if (!IC.globe) IC.globe = '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>';
  // quick() and practice use the searchable list too
  RP.quick = ((orig) => (dir) => { QT.pair = curPair(); if (!R.pairs || !R.pairs.length) R.pairs = [...OTC]; if (!R.pairs.includes(QT.pair)) R.pairs = [...R.pairs, QT.pair]; return orig(dir); })(RP.quick);
  { const st = document.createElement('style'); st.textContent = `
    .nt{background:#FFF;border:1px solid var(--line);border-radius:24px;padding:16px}
    .nt-st{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:18px 0 10px}.nt-st:first-child{margin-top:2px}
    .nt-st b{font-size:16px;font-weight:800}.nt-st small{flex-basis:100%;margin-left:32px;margin-top:-4px;font-size:12.5px;color:var(--mute)}
    .nt-n{width:24px;height:24px;border-radius:8px;background:var(--ink);color:#FFF;font-size:12.5px;font-weight:800;display:inline-grid;place-items:center;flex:none;transform:translateY(-2px)}
    .nt-pair{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border-radius:18px;border:1.5px solid var(--ink);background:#FFF;text-align:left}
    .nt-fl{width:46px;height:40px;display:flex;align-items:center;justify-content:center;flex:none;border-radius:12px;background:var(--soft)}.nt-fl i{font-style:normal;font-size:19px;line-height:1}.nt-fl i+i{margin-left:-5px;transform:translateY(5px)}
    .nt-pn{flex:1;min-width:0}.nt-pn b{display:block;font-size:18px;font-weight:800}.nt-pn small{display:block;font-size:12.5px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nt-pn i{font-style:normal;font-size:11px;color:var(--mute);font-weight:700}
    .nt-chg{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:800;color:var(--ink);background:var(--sun);padding:7px 10px;border-radius:10px;flex:none}
    .nt-rec{display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap}.nt-rec small{font-size:12px;color:var(--mute);font-weight:700;margin-right:2px}
    .nt-rec button{height:30px;padding:0 10px;border-radius:9px;background:var(--soft);font-size:12.5px;font-weight:700}
    .nt-seg{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
    .nt-seg button{height:54px;border-radius:15px;border:1.5px solid var(--line);background:#FFF;font-size:13px;font-weight:700;color:var(--mute)}.nt-seg button b{font-size:19px;color:var(--ink);margin-right:2px}
    .nt-seg button.on{border-color:var(--ink);background:var(--ink);color:#C9CDD8}.nt-seg button.on b{color:#FFF}
    .nt-amt{display:flex;align-items:center;gap:8px}.nt-amt button{width:54px;height:58px;border-radius:16px;background:var(--soft);font-size:26px;font-weight:700;flex:none}
    .nt-amt .v{flex:1;width:auto;background:#FFF;border:1.5px solid var(--line);font-size:28px;font-weight:800;letter-spacing:-.02em}
    .nt-chips{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px}.nt-chips button{height:38px;border-radius:11px;background:var(--soft);font-weight:800;font-size:13.5px}.nt-chips button.on{background:var(--sun)}
    .nt-gale{display:flex;align-items:center;gap:12px;width:100%;margin-top:12px;padding:12px;border-radius:16px;background:var(--sun-t);text-align:left}
    .nt-gi{width:36px;height:36px;border-radius:11px;background:#FFF;display:grid;place-items:center;flex:none}.nt-gt{flex:1;min-width:0}.nt-gt b{display:block;font-size:14.5px}.nt-gt small{display:block;font-size:12.5px;color:var(--sun-ink);line-height:1.35;margin-top:1px}
    .nt-gale .nt-chg{background:#FFF}
    .nt-dir{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .nt-dir button{height:72px;border-radius:18px;color:#FFF;display:flex;align-items:center;justify-content:center;gap:10px;text-align:left}
    .nt-dir .b{background:var(--money);box-shadow:0 8px 18px -10px var(--money)}.nt-dir .s{background:var(--loss);box-shadow:0 8px 18px -10px var(--loss)}
    .nt-dir b{display:block;font-size:20px;font-weight:800;letter-spacing:.02em}.nt-dir small{display:block;font-size:12px;opacity:.9;font-weight:600}
    .nt-dir button:active{transform:scale(.98)}
    .nt-sum{font-size:13px;color:var(--ink2,#4A4E5C);text-align:center;margin-top:12px;line-height:1.45}
    .nt-lad{display:flex;flex-direction:column;gap:6px;margin-top:14px}.nt-lad div{display:flex;justify-content:space-between;padding:10px 12px;border-radius:12px;background:var(--soft);font-size:14px}.nt-lad div:first-child{background:var(--sun-t)}
    .pk-s{display:flex;align-items:center;gap:10px;height:52px;margin-top:14px;padding:0 14px;border-radius:16px;border:1.5px solid var(--ink);background:#FFF}
    .pk-s input{flex:1;min-width:0;border:0;outline:0;font:inherit;font-size:16px;font-weight:600;background:transparent}
    .pk-l{margin-top:6px;max-height:52vh;overflow-y:auto}
    .pk-h{font-size:12px;font-weight:800;color:var(--mute);margin:14px 2px 4px}.pk-h:empty{display:none}
    .pk-row{display:flex;align-items:center;gap:12px;width:100%;padding:10px 4px;border-bottom:1px solid var(--line);text-align:left}.pk-row.on .nt-pn b{color:var(--money-d)}
    .pk-row .nt-pn b{font-size:16px}.pk-none{padding:18px 4px;font-size:14px}
  `; document.head.appendChild(st); }

  /* ===================== v17: Signal Room for beginners — step 1 pick your AI ===================== */
  const SIMPLE = {viza: 'Quick 1 minute trades', luna: 'Calm, steady trades', mira: 'Follows the trend', blaze: 'Catches breakouts', remi: 'Spots turning points', kai: 'EUR/USD specialist'};
  const expOf = (k) => (R.ais.find((a) => a.key === k) || {}).expiry || 5;
  const aiKeys = () => R.ais.map((a) => a.key).filter((k) => AIS[k]);
  const picked = () => !!(S.room.aiPicked || S.room.pin);
  RP.firstPick = (k) => { S.room.pin = k; S.room.ais = [k]; S.room.aiPicked = 1; save(); try { SND.coin(); } catch (e) {} toast(aiOf(k).name + ' is your AI trader 🎉'); rerender(); };
  const pickerView = (hd) => `${hd}
      <div class="bg-step"><span class="nt-n">1</span><div><b>Pick your AI trader</b><p>Your AI watches the market and sends you trades to copy. Pick one to start. You can change anytime.</p></div></div>
      <div class="bg-grid">${aiKeys().map((k) => { const a = aiOf(k), rec = k === 'luna'; return `<button class="bg-ai ${rec ? 'rec' : ''}" onclick="ROOM.firstPick('${k}')">${rec ? '<span class="bg-rec">Best for beginners</span>' : ''}${face(a.f, 58)}<b>${a.name}</b><span class="bg-s">${SIMPLE[k] || a.style}</span><span class="bg-t">${ic('clock', 13, 2.2)} ${expOf(k)} min trades</span><span class="bg-go">Pick ${a.name}</span></button>`; }).join('')}</div>
      <div class="bg-next"><div><span class="nt-n off">2</span><b>Get its next signal</b></div><div><span class="nt-n off">3</span><b>Tap Trade · it’s placed on IQ Option</b></div></div>
      <p class="dim" style="font-size:11.5px;text-align:center;margin-top:16px;line-height:1.5">Signals are ideas, not advice. Trading is risky and you can lose money. 18+</p></div>`;
  const yourAi = () => { const k = pinned(), a = aiOf(k), more = myAis().filter((x) => x !== k).length;
    return `<button class="bg-ya" onclick="ROOM.aiSheet()">${face(a.f, 44)}<span class="bg-yt"><small>Your AI trader</small><b>${a.name} · ${expOf(k)} min trades</b>${more ? `<small>+ ${more} more sending signals</small>` : ''}</span><span class="nt-chg">Change</span></button>`; };
  const howTo = () => `<div class="bg-how"><b>How to trade a signal</b><div><span class="nt-n">1</span><span>Your AI’s signal shows below</span></div><div><span class="nt-n">2</span><span>Check the entry time (your local time)</span></div><div><span class="nt-n">3</span><span>Tap <b>Trade</b>. It’s placed on IQ Option for you</span></div><button onclick="S.room.howDone=1;save();rerender()">Got it</button></div>`;
  const _room3 = VIEWS.room;
  VIEWS.room = () => {
    let h = _room3(); const cut = h.indexOf('<div class="room-sub">');
    if (!picked() && cut > 0) return pickerView(h.slice(0, cut));
    h = h.replace(/<div class="room-sub">[\s\S]*?<\/div>/, '');
    h = h.replace(/<div class="aibar">[\s\S]*?<\/div>/, yourAi() + (!S.room.howDone && !(S.today && S.today.n) ? howTo() : ''));
    return h;
  };
  // simpler AI sheet: one main AI + on/off for the others
  RP.aiSheet = () => {
    const main = pinned(), mine = myAis(), keys = aiKeys();
    sheet(`<h2 style="font-size:22px;font-weight:800">Your AI traders</h2><p class="dim" style="font-size:13.5px;margin-top:2px;line-height:1.45">Your main AI’s signals come first. Turn on others if you want more signals.</p>
      <div class="bg-lbl">Main AI</div>
      <div class="bg-mains">${keys.map((k) => `<button class="${k === main ? 'on' : ''}" onclick="ROOM.setMain('${k}')">${face(aiOf(k).f, 46)}<span>${aiOf(k).name}</span></button>`).join('')}</div>
      <div class="bg-mainbox">${face(aiOf(main).f, 48)}<div><small>★ MAIN AI</small><b>${aiOf(main).name} · ${SIMPLE[main] || aiOf(main).style}</b><span>${AIS[main] && AIS[main].desc ? AIS[main].desc + ' ' : ''}${expOf(main)} min trades.</span></div></div>
      <div class="bg-lbl">Also send me signals from</div>
      ${keys.filter((k) => k !== main).map((k) => { const on = mine.includes(k); return `<div class="bg-row">${face(aiOf(k).f, 42)}<div><b>${aiOf(k).name} <i>${expOf(k)} min</i></b><span>${SIMPLE[k] || aiOf(k).style}</span></div><button class="bg-tg ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="Signals from ${aiOf(k).name}" onclick="ROOM.alsoAi('${k}')"></button></div>`; }).join('')}
      <button class="btn ink" style="margin-top:16px" onclick="closeOvl();rerender()">Done</button>`);
  };
  RP.setMain = (k) => { const sel = myAis(); S.room.pin = k; if (!sel.includes(k)) S.room.ais = [...sel, k]; S.room.aiPicked = 1; save(); RP.aiSheet(); };
  RP.alsoAi = (k) => { let sel = myAis(); sel = sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]; if (!sel.includes(pinned())) sel.push(pinned()); S.room.ais = sel; save(); RP.aiSheet(); };
  if (!IC.clock) IC.clock = '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>';
  { const st = document.createElement('style'); st.textContent = `
    .bg-step{display:flex;gap:12px;align-items:flex-start;margin-top:14px;padding:16px;border-radius:22px;background:var(--night,#141A2E);color:#FFF}
    .bg-step .nt-n{background:var(--sun);color:var(--ink);transform:none;margin-top:1px}.bg-step b{font-size:18px;font-weight:800}.bg-step p{font-size:13.5px;color:#B8BCCB;margin-top:4px;line-height:1.45}
    .bg-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
    .bg-ai{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px 10px 12px;border-radius:20px;background:#FFF;border:1.5px solid var(--line);text-align:center}
    .bg-ai.rec{border-color:var(--sun2,#FFC300);box-shadow:0 0 0 3px var(--sun-t)}
    .bg-rec{position:absolute;top:-9px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:10.5px;font-weight:800;background:var(--sun);padding:3px 8px;border-radius:7px}
    .bg-ai b{font-size:16px;font-weight:800;margin-top:4px}.bg-s{font-size:12.5px;color:var(--ink2,#4A4E5C);line-height:1.3}
    .bg-t{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;color:var(--mute);margin-top:2px}
    .bg-go{margin-top:8px;width:100%;height:36px;border-radius:11px;background:var(--ink);color:#FFF;font-size:13px;font-weight:800;display:grid;place-items:center}
    .bg-ai.rec .bg-go{background:var(--sun);color:var(--ink)}
    .bg-next{margin-top:12px;padding:6px 14px;border-radius:18px;border:1.5px dashed var(--line2,#DEDED6)}.bg-next div{display:flex;align-items:center;gap:10px;padding:8px 0;color:var(--mute)}.bg-next b{font-size:14px}
    .nt-n.off{background:var(--line2,#DEDED6);color:#FFF}
    .bg-ya{display:flex;align-items:center;gap:12px;width:100%;margin-top:12px;padding:10px 12px;border-radius:20px;background:#FFF;border:1px solid var(--line);text-align:left}
    .bg-yt{flex:1;min-width:0}.bg-yt small{display:block;font-size:11.5px;color:var(--mute);font-weight:700}.bg-yt b{display:block;font-size:15.5px;font-weight:800}
    .bg-how{margin-top:10px;padding:14px;border-radius:20px;background:var(--sun-t);position:relative}
    .bg-how>b{display:block;font-size:15px;margin-bottom:6px}.bg-how div{display:flex;align-items:center;gap:10px;font-size:13.5px;padding:4px 0}.bg-how .nt-n{transform:none;width:22px;height:22px;font-size:11.5px}
    .bg-how button{position:absolute;top:12px;right:12px;height:30px;padding:0 12px;border-radius:9px;background:#FFF;font-size:12.5px;font-weight:800}
    .bg-lbl{font-size:12px;font-weight:800;color:var(--mute);margin:18px 0 8px}
    .bg-mains{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px}.bg-mains::-webkit-scrollbar{display:none}
    .bg-mains button{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:74px;padding:10px 6px;border-radius:16px;border:1.5px solid var(--line);background:#FFF;font-size:12.5px;font-weight:800}
    .bg-mains button.on{border-color:var(--ink);box-shadow:0 0 0 2px var(--ink) inset}
    .bg-mainbox{display:flex;gap:12px;align-items:center;margin-top:10px;padding:14px;border-radius:18px;background:var(--night,#141A2E);color:#FFF}
    .bg-mainbox small{display:block;font-size:10.5px;font-weight:800;color:var(--sun);letter-spacing:.06em}.bg-mainbox b{display:block;font-size:15.5px}.bg-mainbox span{display:block;font-size:12.5px;color:#B8BCCB;margin-top:2px;line-height:1.4}
    .bg-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}.bg-row>div{flex:1;min-width:0}.bg-row b{font-size:15px}.bg-row b i{font-style:normal;font-size:11px;font-weight:800;color:var(--ink2,#4A4E5C);background:var(--soft);padding:2px 6px;border-radius:6px;margin-left:4px}.bg-row span{display:block;font-size:12.5px;color:var(--mute)}
    .bg-tg{width:50px;height:30px;border-radius:15px;background:var(--line2,#DEDED6);position:relative;flex:none;transition:.2s}.bg-tg:after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#FFF;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:.2s}
    .bg-tg.on{background:var(--money)}.bg-tg.on:after{left:23px}
  `; document.head.appendChild(st); }

  Object.defineProperty(RP, 'signals', {get: () => R.signals});
  load();
})();
