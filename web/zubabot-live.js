/* ===================== LIVE MODE: connects the Zubabot mini app to the Zubabot server =====================
   Active only when window.ZB_API is set (see the config block at the top of zubabot.html).
   Without it, the app keeps running as the demo. */
(function () {
  const API = window.ZB_API; if (!API) return;
  const DEP_URL = window.ZB_DEPOSIT_URL || 'https://iqoption.com/traderoom';
  const TRADE_URL = window.ZB_TRADE_URL || 'https://iqoption.com/traderoom';
  const TG = window.Telegram && Telegram.WebApp;
  window.ZB_LIVEMODE = true;
  try { TG && TG.ready(); TG && TG.expand(); } catch (e) {}

  async function api(path, body) {
    const r = await fetch(API + path, {method: body === undefined ? 'GET' : 'POST', headers: {'Content-Type': 'application/json', 'X-TG-Init-Data': TG ? TG.initData : ''}, body: body === undefined ? undefined : JSON.stringify(body)});
    const d = await r.json().catch(() => ({})); if (!r.ok || d.ok === false) throw Object.assign(new Error(d.error || ('http_' + r.status)), {status: r.status, data: d}); return d;
  }
  window.ZBAPI = api;
  const openExt = (url) => { try { if (TG && TG.openLink) return TG.openLink(url); } catch (e) {} window.open(url, '_blank'); };
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const tgFirst = () => { try { return TG.initDataUnsafe.user.first_name || ''; } catch (e) { return ''; } };

  /* ---- apply server state to the app ---- */
  function applyMe(m) {
    if (!m || !m.user) return;
    if (m.user.linked) { S.connected = true; S.registered = true; S.codeOk = true; S.iqId = m.user.iq_user_id || S.iqId; }
    if (m.free_until) S.freeUntil = m.free_until;
    const dep = +m.deposits_total || 0;
    if (dep > (S.dep || 0)) { S._srvDep = dep; }
    save();
  }
  async function syncMe() { try { const m = await api('/api/me'); applyMe(m); if (S._srvDep && S._srvDep > (S.dep || 0)) { const d = S._srvDep; delete S._srvDep; depositDetected(d); } return m; } catch (e) { return null; } }
  window.ZBsync = syncMe; window.ZBapplyMe = applyMe;

  /* ---- onboarding step 1: register with our link / claim an existing account ---- */
  const _ob = VIEWS.ob;
  VIEWS.ob = () => {
    if (S.ob === 1 && !S.connected) {
      if (CTX.waitReg) return `<div class="ob">${obHead3(1, 'Finish signing up on IQ Option', 'Create your account on the page that just opened. This screen moves on by itself when it’s done.')}
        <div class="oa-card">${linkArt()}<div class="oa-list"><div><i>1</i>Sign up with your email on IQ Option</div><div><i>2</i>Come back to Telegram</div><div><i>3</i>Zubabot finds your account automatically</div></div></div>
        <div class="oa-steps"><div class="on"><b></b>Waiting for your new account…</div></div>
        <div class="grow"></div>
        <button class="btn sun" style="margin-top:18px" onclick="zbRegister()"><span class="sw"></span>Open IQ Option sign-up again</button>
        <button class="btn" style="height:46px;font-size:14px;margin-top:6px" onclick="CTX.waitReg=0;CTX.claim=1;go('ob')">I already have an account</button></div>`;
      if (CTX.claim) return `<div class="ob">${obHead3(1, 'Find my account', 'Enter your IQ Option ID. You’ll find it in IQ Option under Profile. We check it was registered with Zubabot.')}
        <label for="iqid" class="label" style="display:block;margin-top:22px">IQ Option ID</label>
        <input id="iqid" class="codein" style="margin-top:8px;letter-spacing:.06em" inputmode="numeric" maxlength="12" placeholder="e.g. 196641256" oninput="this.value=this.value.replace(/\\D/g,'');$('cErr').textContent=''">
        <p id="cErr" role="alert" style="font-size:13px;font-weight:700;color:var(--loss);margin-top:8px;min-height:18px"></p>
        <button class="oa-inv" style="text-align:left;padding-left:0" onclick="CTX.claim=0;CTX.inv=1;go('ob')">Have an invite code? <b>Use it</b></button>
        <div class="grow"></div>
        <button class="btn ink" id="clBtn" style="margin-top:16px" onclick="zbClaim()">Find my account</button>
        <button class="btn" style="height:46px;font-size:14px;margin-top:4px" onclick="CTX.claim=0;go('ob')">Back</button></div>`;
    }
    let h = _ob();
    if (S.ob === 1) h = h.replace(/<button class="oa-demo"[^>]*>Demo:[^<]*<\/button>/, '').replace(/<p class="oa-demo"[^>]*>Demo:.*?<\/p>/, '').replace(/Demo preview\. In the live app, IQ Option’s own secure page opens here\./, '');
    return h;
  };
  window.zbRegister = async function () {
    try { const d = await api('/api/register/link', {}); openExt(d.url); CTX.waitReg = 1; CTX.claim = 0; go('ob'); pollLinked(); }
    catch (e) { toast('Couldn’t open sign-up. Try again.'); }
  };
  async function pollLinked() {
    if (pollLinked.on) return; pollLinked.on = true;
    for (let i = 0; i < 180 && CTX.waitReg && !S.connected; i++) {        // up to ~15 min
      const m = await syncMe(); if (m && m.user && m.user.linked) break; await sleep(5000);
    }
    pollLinked.on = false;
    if (S.connected) { CTX.waitReg = 0; S.iqNew = true; SND.win(); confetti(30); go('ob'); }
  }
  window.zbClaim = async function () {
    const v = ($('iqid').value || '').trim(); if (v.length < 5) { $('cErr').textContent = 'Enter your full IQ Option ID.'; return; }
    $('clBtn').disabled = true;
    try {
      const d = await api('/api/account/claim', {iqUserId: v}); applyMe(d.state);
      if (d.linked) { CTX.claim = 0; S.iqNew = false; SND.win(); confetti(30); go('ob'); }
      else { CTX.claim = 0; CTX.oaFail = 1; go('ob'); }
    } catch (e) {
      $('clBtn').disabled = false;
      $('cErr').textContent = e.message === 'id_already_linked_contact_support' ? 'This ID is already linked to another Telegram account. Message support.' : e.message === 'too_many_tries_wait_1h' ? 'Too many tries. Please wait an hour or message support.' : 'Couldn’t check that ID. Try again.';
    }
  };
  // buttons from the v12 screens
  oaStart = function (kind) { if (kind === 'new') return zbRegister(); CTX.oaFail = 0; CTX.claim = 1; go('ob'); };
  checkInvite = async function () {
    const v = ($('inv').value || '').trim(); if (!v) { $('iErr').textContent = 'Enter your invite code.'; return; }
    try { await api('/api/invite/redeem', {code: v}); CTX.inv = 0; CTX.claim = 1; SND.coin(); go('ob'); toast('Code accepted. Now enter your IQ Option ID.'); }
    catch (e) { $('iErr').textContent = e.message === 'code_already_used' ? 'This code was already used.' : 'That code isn’t valid.'; }
  };

  /* ---- server is the source of truth for coins/tokens (avoid adding the deposit bonus twice) ---- */
  const _dd = depositDetected;
  depositDetected = function (amt) {
    const before = {c: S.coins, t: S.tokens}; _dd(amt);
    api('/api/me').then((m) => { if (m && m.rewards) { S.coins = m.rewards.coins; S.tokens = m.rewards.tokens; save(); } }).catch(() => { S.coins = before.c; S.tokens = before.t; save(); });
  };
  function applyRewards(m) { if (m && m.rewards) { S.coins = m.rewards.coins; S.tokens = m.rewards.tokens; } }

  /* ---- deposits: open IQ Option, then wait for Affstore's confirmation ---- */
  depDetect = function () {
    const pk = CTX.depPick || 250; openExt(DEP_URL);
    $('ovl').innerHTML = `<div class="modal2"><div class="m2"><div class="m2spin"><span></span>${coinI(30)}</div><div class="m2t">Waiting for your deposit</div><div class="m2d">Add <b>$${fmt(pk)}</b> on IQ Option. This updates by itself when your deposit is confirmed, usually within a few minutes.</div>
      <div class="m2steps"><div class="ok"><i>${ic('check', 12, 3, '#FFF')}</i>Opened IQ Option</div><div class="run"><i></i>Deposit received</div><div><i></i>Coins and tokens added</div></div>
      <button class="btn sun" style="margin-top:14px" onclick="openExtDep()">Open IQ Option again</button>
      <button class="m2c" onclick="depDetect.stop=1;closeOvl()">Close · I’ll come back</button></div></div>`;
    depDetect.stop = 0; const start = S.dep || 0;
    (async () => { for (let i = 0; i < 240 && !depDetect.stop; i++) { await sleep(5000); try { const m = await api('/api/me'); applyMe(m); const d = +m.deposits_total || 0; if (d > start) { delete S._srvDep; closeOvl(); depositDetected(d); return; } } catch (e) {} } })();
  };
  window.openExtDep = () => openExt(DEP_URL);

  /* ---- signals from the strategy engine ---- */
  const pxOf = (pair) => { const p = PAIRS.find((x) => x[0] === pair || (pair === 'XAU/USD' && x[0] === 'Gold')); return p ? [p[1], p[2]] : [1, 5]; };
  function toOpp(s, now) {
    let [price, dp] = pxOf(s.pair); const noEntry = s.entry == null; if (!noEntry) { price = +s.entry; dp = price > 1000 ? 1 : price > 50 ? 3 : 5; } const takeBy = Math.min(s.expires_at - 10e3, (s.entry_at || s.created_at) + 45e3);
    const life = Math.max(0, Math.round((takeBy - now) / 1000));
    return {id: ++OID, sigId: s.id, chain: s.chain_id, step0: s.step, pair: s.pair === 'XAU/USD' ? 'Gold' : s.pair, price, dp, dir: s.dir, conf: s.conf, life, max: Math.max(life, 45), why: pick(WHY[s.dir]), expiresAt: s.expires_at, srvNow: now, noEntry};
  }
  // the main (Zara) flow places straight away, so it only offers signals that are at their entry time now
  async function loadSignals() { const d = await api('/api/signals?ais=' + encodeURIComponent((window.ROOM && ROOM.myAis ? ROOM.myAis() : (S.owned || [])).join(','))); const n = d.now || Date.now(); return (d.signals || []).filter((s) => s.step === 1 && (s.entry_at || s.created_at) <= n + 5000).map((s) => toOpp(s, n)).filter((o) => o.life > 5); }
  const _scanAfter = AFTER.scan;
  AFTER.scan = () => {
    if (CTX.practice) return _scanAfter && _scanAfter();
    const t0 = Date.now(); let k = 0; const names = ['EUR/USD', 'GBP/USD', 'Gold', 'BTC/USD', 'USD/JPY', 'AUD/CAD'];
    const tk = setInterval(() => { const el = $('scanTx'); if (!el || VIEW !== 'scan') { clearInterval(tk); return; } el.textContent = 'Checking ' + names[k++ % 6] + '…'; SND.tick(); }, 420);
    loadSignals().then(async (list) => {
      await sleep(Math.max(0, 2200 - (Date.now() - t0))); clearInterval(tk); if (VIEW !== 'scan') return;
      if (!list.length) { go('home'); bubble('nosig' + Date.now(), `No clean setup right now. I’ll ping you the moment one appears 👀`); return; }
      OPPS = list.sort((a, b) => b.conf - a.conf).slice(0, 3); SND.coin(); go('opps');
    }).catch(() => { clearInterval(tk); go('home'); toast('Couldn’t reach Zubabot. Check your internet.'); });
  };
  // live list: countdown + new signals from the server (no random top-ups)
  const _oppsAfter = AFTER.opps;
  AFTER.opps = () => {
    if (CTX.practice) return _oppsAfter && _oppsAfter();
    setTimeout(() => { const f = document.querySelector('.op-ai .face'); if (f) f.classList.remove('talk'); }, 3000);
    const draw = () => { if ($('oppList')) $('oppList').innerHTML = OPPS.length ? OPPS.map((o, i) => oppHTML(o, i === 0)).join('') : `<p class="dim" style="text-align:center;padding:30px 0">Waiting for the next setup…</p>`; };
    go.oppT = setInterval(() => {
      OPPS.forEach((o) => { o.life--; const el = $('ch' + o.id); if (el) { el.className = 'op-ring ' + chipOf(o); el.querySelector('.num').textContent = mmss(o.life); el.querySelector('.rf').style.strokeDashoffset = RC * (1 - o.life / o.max); } });
      const n = OPPS.length; OPPS = OPPS.filter((o) => o.life > 0); if (OPPS.length !== n) draw();
    }, 1000);
    go.sigT = setInterval(async () => {
      if (VIEW !== 'opps') { clearInterval(go.sigT); return; }
      try { const list = await loadSignals(); const have = new Set(OPPS.map((o) => o.sigId)); const add = list.filter((o) => !have.has(o.sigId)); if (add.length) { OPPS.push(...add); draw(); SND.coin(); } } catch (e) {}
    }, 8000);
  };

  /* ---- placing: user places it on IQ Option, the app follows the signal's real result ---- */
  const _place = place;
  place = function () {
    const o = CTX.opp; if (!o || CTX.practice || !o.sigId) return _place();
    const st = CTX.stake;
    sheet(`<h2 style="font-size:22px;font-weight:800">Place it on IQ Option</h2>
      <p class="ink2" style="font-size:14.5px;line-height:1.5;margin-top:6px">Open IQ Option and place this exact trade, then come back. ${AI().name} follows it with you here.</p>
      <div class="card" style="margin-top:14px;padding:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center">
        <div><div class="dim" style="font-size:12px">Pair</div><b style="font-size:16px">${o.pair}</b></div>
        <div><div class="dim" style="font-size:12px">Direction</div><b style="font-size:16px;color:${o.dir === 'buy' ? 'var(--money)' : 'var(--loss)'}">${o.dir === 'buy' ? 'BUY ▲' : 'SELL ▼'}</b></div>
        <div><div class="dim" style="font-size:12px">Amount · time</div><b style="font-size:16px">$${st} · 1 min</b></div></div>
      <button class="btn sun" style="margin-top:16px" onclick="zbOpenTrade()"><span class="sw"></span>Open IQ Option</button>
      <button class="btn ink" style="margin-top:8px" onclick="closeOvl();zbFollow()">I’ve placed it</button>`);
  };
  window.zbOpenTrade = () => openExt(TRADE_URL);
  const _toast = toast; toast = function (t) { if (LIVE && LIVE.sigId && !LIVE.practice && /^Martingale step \d+: \$[\d.]+ placed$/.test(t)) return; return _toast(t); };
  window.zbStopChain = () => { if (!LIVE) return; clearInterval(LIVE.iv); LIVE.win = false; LIVE.stake = 0; LIVE.ladder = LIVE.ladder.slice(0, LIVE.step + 1); finishStep(); };
  window.zbFollow = function () { const o = CTX.opp; SND.place(); OPPS = OPPS.filter((x) => x.id !== o.id); runLive({o: {...o}, base: CTX.stake, practice: false, step: 0, lost: [], net: 0, src: 'flow', sigId: o.sigId, chain: o.chain, expiresAt: o.expiresAt, srvNow: o.srvNow}); go('trade'); };

  const _runLive = runLive;
  runLive = function (L) {
    if (L.practice || !L.sigId) return _runLive(L);
    _runLive(L);                                    // keeps the chart + ladder + voice lines
    if (L.step > 0) setTimeout(() => {                // without OAuth the user places each martingale step on IQ Option
      const d = L.o.dir === 'buy' ? 'BUY ▲' : 'SELL ▼';
      sheet(`<h2 style="font-size:22px;font-weight:800">Martingale step ${L.step}: place it now</h2>
        <p class="ink2" style="font-size:14.5px;line-height:1.5;margin-top:6px">The last trade lost. To follow the plan, place this on IQ Option right away.</p>
        <div class="card" style="margin-top:14px;padding:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center">
          <div><div class="dim" style="font-size:12px">Pair</div><b style="font-size:16px">${L.o.pair}</b></div>
          <div><div class="dim" style="font-size:12px">Direction</div><b style="font-size:16px;color:${L.o.dir === 'buy' ? 'var(--money)' : 'var(--loss)'}">${d}</b></div>
          <div><div class="dim" style="font-size:12px">Amount · time</div><b style="font-size:16px">$${L.stake} · 1 min</b></div></div>
        <button class="btn sun" style="margin-top:16px" onclick="zbOpenTrade()"><span class="sw"></span>Open IQ Option</button>
        <button class="btn" style="margin-top:8px;height:46px;font-size:14px" onclick="closeOvl()">Placed · back to the trade</button>
        <button class="btn" style="height:42px;font-size:13px;color:var(--dim)" onclick="closeOvl();zbStopChain()">Skip this step, stop here</button>`);
    }, 300);
    clearInterval(LIVE.iv);
    // neutral price wiggle (the real result comes from the server), timer = time left on the signal
    const left = Math.max(5, Math.round(((L.expiresAt || Date.now() + 60e3) - (L.srvNow || Date.now())) / 1000));
    LIVE.left = left; LIVE.win = null; const vol = L.o.price * 0.00006; let k = 0; const t0 = Date.now(), end = t0 + left * 1000;
    LIVE.iv = setInterval(() => { k++; const last = LIVE.pts[LIVE.pts.length - 1]; LIVE.pts.push(last + (Math.random() - .5) * vol * 2.2 + (L.o.price - last) * 0.01); if (LIVE.pts.length > 240) LIVE.pts.shift();
      const nl = Math.max(0, Math.ceil((end - Date.now()) / 1000)); if (nl !== LIVE.left) { LIVE.left = nl; liveLine(); } updLive();
      if (nl <= 0) { clearInterval(LIVE.iv); settle(LIVE); } }, 250);
  };
  async function settle(L) {
    for (let i = 0; i < 40; i++) {                  // wait up to ~2 min for the server to score it
      try {
        const d = await api('/api/signal?id=' + L.sigId); const s = d.signal;
        if (['win', 'loss', 'draw'].includes(s.status)) {
          L.win = s.status === 'win'; L.draw = s.status === 'draw';
          if (!L.win && d.next) { L.sigId = d.next.id; L.expiresAt = d.next.expires_at; L.srvNow = d.now; }
          else if (!L.win && !d.next) { await sleep(3000); const d2 = await api('/api/signal?id=' + s.id); if (d2.next) { L.sigId = d2.next.id; L.expiresAt = d2.next.expires_at; L.srvNow = d2.now; } else L.ladder = L.ladder.slice(0, L.step + 1); }
          // the app's martingale only continues if the server opened the next step
          finishStep(); return;
        }
      } catch (e) {}
      if (i === 0) toast('Checking the result…'); await sleep(3000);
    }
    toast('Result is taking long. Check it on IQ Option.'); L.win = false; L.ladder = L.ladder.slice(0, L.step + 1); finishStep();
  }

  /* ---- live trades: no demo skip link, no made-up running P/L (the real result comes at expiry) ---- */
  const st = document.createElement('style'); st.textContent = '.zb-live [onclick="LIVE.left=1"]{display:none!important}'; document.head.appendChild(st);
  const _upd = updLive;
  updLive = function () {
    _upd(); const real = LIVE && !LIVE.practice && LIVE.sigId; document.body.classList.toggle('zb-live', !!real);
    if (real && LIVE.o.noEntry) fixEntry();
    if (real) for (const id of ['lpl', 'taP', 'clP']) { const e = $(id); if (e) { e.textContent = 'At 0:00'; e.style.color = ''; } }
  };

  function fixEntry() { const v = $('view'); if (!v) return; const w = document.createTreeWalker(v, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (/entry\s*[0-9][0-9.,]*/i.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/entry\s*[0-9][0-9.,]*/i, 'entry at market'); } }
  const _go2 = go; go = function (v, c) { _go2(v, c); if (v === 'amount' && CTX.opp && CTX.opp.noEntry) { const e = [...document.querySelectorAll('#view .num')].find((x) => x.previousElementSibling && /Entry/.test(x.previousElementSibling.textContent)); if (e) e.textContent = 'Market'; } };

  /* ---- first open: name from Telegram, sync account + deposits ---- */
  if (!S.name && tgFirst()) { S.name = tgFirst(); save(); }
  syncMe();
  setInterval(() => { if (S.ob >= 9 && !activated()) syncMe(); }, 30000);
  // gentle ping when a new live signal appears while on the dashboard
  let lastSig = 0;
  setInterval(async () => { if (VIEW !== 'home' || !activated()) return; try { const d = await api('/api/signals?ais=' + encodeURIComponent((window.ROOM && ROOM.myAis ? ROOM.myAis() : (S.owned || [])).join(','))); const s = (d.signals || []).filter((x) => x.step === 1).sort((a, b) => b.id - a.id)[0]; if (s && s.id > lastSig) { if (lastSig) bubble('sig' + s.id, `New setup: <b>${s.pair} ${s.dir.toUpperCase()}</b>. Tap the Z button to take it.`); lastSig = s.id; } } catch (e) {} }, 20000);
})();
