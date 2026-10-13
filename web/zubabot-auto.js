/* ===================== AUTO MODE: IQ Option OAuth + one-tap trading =====================
   Active when window.ZB_API and window.ZB_IQ_CLIENT_ID are both set. Without the client ID the app
   stays in manual mode (user places trades on IQ Option themselves). */
(function () {
  if (!window.ZB_API || !window.ZB_IQ_CLIENT_ID) return;
  window.ZB_AUTO = true;
  const api = window.ZBAPI, sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  let IQ = window.IQ || null;
  const iq = async () => { for (let i = 0; !IQ && i < 100; i++) { IQ = window.IQ; if (!IQ) await sleep(100); } if (!IQ) throw new Error('sdk_not_loaded'); return IQ; };
  const MIN = +(window.ZB_MIN_DEPOSIT || 20);
  const ERR = {market_closed: 'This market is closed right now. Try another pair.', no_real_balance: 'No real balance found on your IQ Option account.', no_expiry_available: 'No 1-minute trade available on this pair right now.', reconnect: 'Please connect IQ Option again.'};
  const errMsg = (e) => ERR[e && e.message] || (/balance|insufficient|money/i.test(String(e && (e.message || e))) ? 'Not enough balance on IQ Option for this amount.' : 'IQ Option didn’t accept the trade. Try again.');

  /* ---------- 1. Connect: IQ Option login page (sign up or log in), then detect ---------- */
  oaStart = async function (kind) {
    try { CTX.oa = kind; CTX.oaFail = 0; go('ob'); (await iq()).startConnect(kind === 'new' ? 'new' : 'login'); }
    catch (e) { CTX.oa = 0; go('ob'); toast('Couldn’t open IQ Option. Try again.'); }
  };
  zbRegister = () => oaStart('new');
  checkInvite = async function () {
    const v = ($('inv').value || '').trim(); if (!v) { $('iErr').textContent = 'Enter your invite code.'; return; }
    try { await api('/api/invite/redeem', {code: v}); CTX.inv = 0; SND.coin(); toast('Code accepted. Log in with IQ Option.'); oaStart('login'); }
    catch (e) { $('iErr').textContent = e.message === 'code_already_used' ? 'This code was already used.' : 'That code isn’t valid.'; }
  };
  const _ob = VIEWS.ob;
  VIEWS.ob = () => {
    if (S.ob === 1 && !S.connected && CTX.detect) return `<div class="ob">${obHead3(1, 'Finding your account', 'Connected to IQ Option. Checking your account…')}
      <div class="oa-card">${linkArt()}</div>
      <div class="oa-steps"><div class="ok"><b>${ic('check', 15, 2.8, '#0A8F61')}</b>Logged in on IQ Option</div><div class="on"><b></b>${CTX.detect === 'pending' ? 'Waiting for IQ Option to confirm your new account…' : 'Checking it’s a Zubabot account'}</div></div>
      ${CTX.detect === 'pending' ? '<p class="oa-demo">New accounts can take a minute to show up. Keep this open.</p>' : ''}<div class="grow"></div></div>`;
    if (S.ob === 1 && !S.connected && CTX.oa) return `<div class="ob">${obHead3(1, 'Opening IQ Option…', 'Sign up or log in, then tap Allow. You’ll come straight back here.')}<div class="oa-card">${linkArt()}</div><div class="grow"></div></div>`;
    return _ob();
  };
  async function detect() {
    CTX.detect = 'checking'; go('ob');
    try {
      const I = await iq();
      let r = await I.detectAccount({waitForPostbackMs: 0});
      // Brand-new sign-up (no real money yet): don't make them wait for Affstore's postback.
      // Let them straight through to the deposit screen and confirm in the background.
      if (!r.linked && r.pending && !(r.realBalance > 0)) {
        if (r.state) window.ZBapplyMe && window.ZBapplyMe(r.state);
        CTX.detect = 0; S.connected = true; S.registered = true; S.codeOk = true; S.iqId = String(r.iqUserId); S.iqNew = true; S.linkPending = Date.now();
        if (!S.name && r.firstName) S.name = r.firstName; S.balance = 0; save(); SND.win(); confetti(30); go('ob'); startBalance(); confirmLink(); return;
      }
      if (!r.linked && r.pending) { CTX.detect = 'pending'; go('ob'); r = await I.detectAccount({waitForPostbackMs: 60000}); }   // existing money on it: check properly first
      if (r.state) window.ZBapplyMe && window.ZBapplyMe(r.state);
      CTX.detect = 0;
      if (r.linked) { S.connected = true; S.registered = true; S.codeOk = true; S.iqId = String(r.iqUserId); S.iqNew = r.source === 'affiliate'; if (!S.name && r.firstName) S.name = r.firstName; S.balance = +(r.realBalance || 0).toFixed(2); save(); SND.win(); confetti(30); go('ob'); startBalance(); }
      else { CTX.oaFail = 1; go('ob'); }
    } catch (e) { CTX.detect = 0; go('ob'); toast(e.message === 'not_connected' ? 'Login didn’t finish. Tap Connect again.' : 'Couldn’t reach IQ Option. Try again.'); }
  }
  // Background confirmation for brand-new sign-ups (usually seconds; gives up after 15 min)
  let confirming = false;
  async function confirmLink() {
    if (confirming || !S.linkPending || !S.iqId) return; confirming = true;
    try {
      while (S.linkPending && Date.now() - S.linkPending < 15 * 60e3) {
        try { const r = await api('/api/account/link', {iqUserId: S.iqId}); if (r.state) window.ZBapplyMe && window.ZBapplyMe(r.state);
          if (r.linked) { S.linkPending = 0; save(); return; }
          if (!r.pending) break; } catch (e) { if (e.status === 409) break; }
        await sleep(4000);
      }
      if (S.linkPending) { S.linkPending = 0; S.connected = false; S.registered = false; S.ob = 1; CTX.oaFail = 1; save(); go('ob'); }   // not one of ours after all
    } finally { confirming = false; }
  }
  if (S.linkPending) setTimeout(confirmLink, 1200);

  // came back from callback.html
  let sp = ''; try { sp = Telegram.WebApp.initDataUnsafe.start_param || ''; } catch (e) {}
  if (/[?&]connected=1/.test(location.search) || sp === 'connected') { try { history.replaceState(null, '', location.pathname); } catch (e) {} setTimeout(() => { if (S.ob < 9 || !S.connected) { S.ob = Math.max(1, Math.min(S.ob, 1)); save(); } detect(); }, 400); }

  /* ---------- 2. Real balance + instant deposit detection ---------- */
  let balOn = false, lastReal = null;
  const _dd = depositDetected; depositDetected = function (amt) { _dd(amt); if (lastReal != null) { S.balance = lastReal; save(); } };   // balance always = real IQ Option balance
  async function startBalance() {
    if (balOn || !S.connected) return; balOn = true;
    try {
      const I = await iq(); const b = await I.balance();
      if (b) { const before = S.depOut ? +(S.balBeforeDep || 0) : null; lastReal = S.balance = +b.amount.toFixed(2);
        if (before != null) { const up = S.balance - before; S.depOut = 0; if (up >= MIN && !activated()) { S.provDep = up; toast(`Deposit of $${fmt(Math.round(up))} received 🎉`); SND.coin(); } }
        save(); banner(); try { rerender(); } catch (e) {} }
      I.onBalance((x) => { lastReal = S.balance = +x.amount.toFixed(2); save(); banner(); if (VIEW === 'home' || VIEW === 'wallet') try { rerender(); } catch (e) {} });
      I.watchDeposits(async ({amount}) => {
        toast(`Deposit of $${fmt(Math.round(amount))} received. Confirming…`); SND.coin();
        if (depDetect.stop === 0) { /* waiting modal open: it will pick up the server confirmation */ }
        // provisional activation right away; coins/tokens come when Affstore confirms
        if (!activated() && amount >= MIN) { S.provDep = amount; save(); try { rerender(); } catch (e) {} }
        for (let i = 0; i < 60; i++) { const m = await window.ZBsync(); if (m && +m.deposits_total >= (S.claimedDep || 0) + 1) break; await sleep(5000); }
      }, {min: 10});
      I.onTradeClosed(onClosed);
    } catch (e) { balOn = false; if (e.message === 'reconnect' || e.status === 401 || e.status === 404) { S.connected = false; save(); toast('Please connect IQ Option again.'); } }
  }
  window.addEventListener('zb:reconnect-needed', () => { balOn = false; toast('IQ Option session ended. Connect again.'); S.connected = false; save(); S.ob = 1; go('ob'); });
  if (S.connected && S.ob >= 9) setTimeout(startBalance, 800);

  // a deposit seen on the live balance unlocks trading right away; Affstore's postback then credits rewards
  const _act = activated; activated = () => _act() || (S.provDep || 0) >= MIN;

  /* ---------- 3. One-tap trading ---------- */
  const PENDING = new Map();         // iq option id -> resolver
  function onClosed(r) { for (const k of [r.id, ...(r.orderIds || [])]) { const f = PENDING.get(String(k)); if (f) { PENDING.delete(String(k)); f(r); return; } } }
  async function placeReal(L) {
    const I = await iq();
    const t = await I.placeTrade({pair: L.o.pair, direction: L.o.dir, amount: L.stake, minutes: L.o.minutes || 1, kind: L.o.kind || 'turbo'});
    let logId = null; try { logId = (await api('/api/trades', {iqOptionId: t.id, sigId: L.sigId || null, pair: L.o.pair, dir: L.o.dir, amount: L.stake, step: L.step})).id; } catch (e) {}
    return {...t, logId};
  }
  const _placeManual = place;
  place = function () {
    const o = CTX.opp; if (!o || CTX.practice) return _placeManual();
    if (!S.connected) { toast('Connect IQ Option first'); S.ob = 1; go('ob'); return; }
    if (CTX.stake > (S.balance || 0)) { toast('Not enough balance on IQ Option for this amount'); return; }
    SND.place(); OPPS = OPPS.filter((x) => x.id !== o.id);
    runLive({o: {...o}, base: CTX.stake, practice: false, step: 0, lost: [], net: 0, src: 'flow', sigId: o.sigId || null, auto: true}); go('trade');
  };
  const _runLive = runLive;
  runLive = function (L) {
    if (L.practice || !L.auto) return _runLive(L);
    _runLive({...L, sigId: null, auto: false});      // builds LIVE (chart, ladder) with the demo engine…
    const live = LIVE; Object.assign(live, {auto: true, sigId: L.sigId, win: null, placing: true});
    clearInterval(live.iv); live.left = 60; updLive();
    const cap = (t) => { const c = $('chatL'); if (c) { const p = document.createElement('p'); p.textContent = t; c.appendChild(p); } };
    placeReal(live).then((t) => {
      live.placing = false; live.iqId = t.id; live.logId = t.logId; live.o.price = t.openQuote || live.o.price; live.pts = [live.o.price];
      cap(live.step ? `Auto-gale ${live.step} placed on IQ Option: $${live.stake}.` : `Placed on IQ Option: $${live.stake} ${live.o.dir}${live.o.kind === 'digital' ? ' · digital ' + (live.o.minutes || 1) + ' min' : ''}.`);
      const end = t.expiresAt || Date.now() + 60e3, vol = live.o.price * 0.00006;
      const done = new Promise((ok) => PENDING.set(String(t.id), ok));
      live.iv = setInterval(() => { const last = live.pts[live.pts.length - 1]; live.pts.push(last + (Math.random() - .5) * vol * 2.2 + (live.o.price - last) * 0.01); if (live.pts.length > 240) live.pts.shift();
        const nl = Math.max(0, Math.ceil((end - Date.now()) / 1000)); if (nl !== live.left) { live.left = nl; liveLine(); } updLive(); if (nl <= 0) clearInterval(live.iv); }, 250);
      Promise.race([done, sleep(Math.max(0, end - Date.now()) + 90e3).then(() => null)]).then((r) => {
        clearInterval(live.iv); if (LIVE !== live) return;
        if (!r) { toast('Result is taking long. Check IQ Option.'); live.win = false; live.ladder = live.ladder.slice(0, live.step + 1); finishStep(); return; }
        live.win = r.win; live.realProfit = r.profit;
        api('/api/trades', {id: live.logId, status: r.win ? 'win' : r.profit === 0 ? 'draw' : 'loss', profit: r.profit, copied: !!live.copied && live.step === 0, expiryMin: live.o.minutes || 1}).catch(() => {});
        if (!r.win && live.step < live.ladder.length - 1 && (S.balance || 0) < live.ladder[live.step + 1]) { toast('Not enough balance for the next martingale step. Stopping here.'); live.ladder = live.ladder.slice(0, live.step + 1); }
        finishStep();
      });
    }).catch((e) => {
      clearInterval(live.iv); live.placing = false; api('/api/trades', {pair: live.o.pair, dir: live.o.dir, amount: live.stake, step: live.step, error: e.message || String(e)}).catch(() => {});
      live.active = false; LIVE = null; save(); banner(); go('home');
      sheet(`<h2 style="font-size:22px;font-weight:800">Trade not placed</h2><p class="ink2" style="font-size:15px;line-height:1.5;margin-top:8px">${errMsg(e)}</p><button class="btn ink" style="margin-top:18px" onclick="closeOvl()">OK</button>`);
    });
  };
  // use the real profit/loss from IQ Option in the result screens
  const _finish = finishStep;
  finishStep = function () {
    const L = LIVE; if (!L || !L.auto) return _finish();
    if (typeof L.realProfit === 'number') {
      const est = L.win ? +(L.stake * .85).toFixed(2) : -L.stake, d = +(L.realProfit - est).toFixed(2);   // use IQ Option's real payout
      L.net = +(L.net + d).toFixed(2); if (S.today) S.today.pl = +((S.today.pl || 0) + d).toFixed(2);
      const s0 = S.balance; _finish();                  // demo math adjusts S.balance; real balance comes from IQ Option's live update
      S.balance = s0; save();
    } else _finish();
  };
  // the place button label: one tap, placed for real
  const _amount = VIEWS.amount;
  VIEWS.amount = () => _amount().replace(/(Place \$[\d.,]+ (buy|sell))/i, '$1 on IQ Option');

  // hide manual-mode bits
  const st = document.createElement('style'); st.textContent = 'body.zb-live [onclick="LIVE.left=1"]{display:none!important}'; document.head.appendChild(st);

  /* ---------- 4. Deposit inside the mini app ----------
     IQ Option's cashier opens in this same Telegram window, where the user is already logged in from sign-up.
     After paying they close the window and reopen Zubabot: the real balance shows the deposit straight away.
     window.ZB_DEPOSIT_MODE = 'browser' switches back to opening it in a separate browser. */
  const DEP_URL = window.ZB_DEPOSIT_URL || 'https://iqoption.com/traderoom';
  if (window.ZB_DEPOSIT_MODE !== 'browser') {
    const _dep = depDetect;
    depDetect = function () {
      const pk = CTX.depPick || 100;
      $('ovl').innerHTML = `<div class="modal2"><div class="m2"><div class="m2t">Deposit $${fmt(pk)} on IQ Option</div>
        <div class="m2d">IQ Option’s secure payment page opens right here in Zubabot.</div>
        <div class="m2steps"><div class="ok"><i>${ic('check', 12, 3, '#FFF')}</i>Pay on IQ Option</div><div class="ok"><i>${ic('check', 12, 3, '#FFF')}</i>Close the page (✕ at the top)</div><div class="ok"><i>${ic('check', 12, 3, '#FFF')}</i>Open Zubabot again: your account unlocks instantly</div></div>
        <button class="btn sun" style="margin-top:14px" onclick="zbDepGo()">Continue to deposit</button>
        <button class="m2c" onclick="closeOvl();zbDepBrowser()">Open in my browser instead</button></div></div>`;
    };
    window.zbDepGo = () => { S.depOut = Date.now(); S.balBeforeDep = S.balance || 0; save(); try { sessionStorage.setItem('zb_return', location.href); } catch (e) {} location.href = DEP_URL; };
    window.zbDepBrowser = () => _dep();
  }
})();