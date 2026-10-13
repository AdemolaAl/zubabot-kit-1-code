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
        p.status = p.step ? 'stopped' : 'failed'; p.err = errText(e);
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
    if (VIEW !== 'room') go('room'); placeStep(p);
    setTimeout(() => { const el = $('pos' + p.id); if (el) el.scrollIntoView({block: 'center', behavior: 'smooth'}); }, 120);
  };

  /* ---------- open trades UI ---------- */
  function posCard(p) {
    const ai = p.ai ? aiOf(p.ai) : null, live = p.status === 'open' || p.status === 'placing';
    const left = p.endsAt ? Math.max(0, (p.endsAt - now()) / 1000) : p.minutes * 60, frac = p.endsAt ? Math.min(1, left / (p.minutes * 60)) : 1;
    const head = `<div class="pc-h">${ai ? face(ai.f, 34) : `<span class="pc-me">${zmark(18)}</span>`}<div class="pc-t"><b>${p.pair.replace(' OTC', '')} <span>OTC</span></b><small>${ai ? ai.name + '’s signal' : 'Your trade'} · ${p.minutes} min digital${p.mode === 'practice' ? ' · practice' : ''}</small></div><span class="dd ${p.dir}">${p.dir === 'buy' ? '▲ BUY' : '▼ SELL'}</span></div>`;
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
    const pb = $('posbar'); if (pb) { const e = exposure(); if (!e.n) pb.remove(); else { const nx = openPos().filter((p) => p.endsAt).sort((a, b) => a.endsAt - b.endsAt)[0]; const t = pb.querySelector('.t'); if (t) t.textContent = `${e.n} trade${e.n > 1 ? 's' : ''} open${nx ? ' · next ends ' + ms2((nx.endsAt - now()) / 1000) : ''}`; } }
  }
  function draw() { if (VIEW === 'room' && !$('ovl').innerHTML.includes('class="tk"')) { const pp = $('posPanel'); if (pp) pp.innerHTML = posPanel(); else rerender(); } else if (DOCKED.includes(VIEW)) { const d = document.querySelector('.dock'); if (d && !$('posbar') && exposure().n) d.insertAdjacentHTML('beforebegin', posBar()); } }
  const posBar = () => { const e = exposure(); return e.n ? `<button class="posbar" id="posbar" onclick="go('room')"><span class="ping" style="background:var(--sun)"></span><span class="t">${e.n} trade${e.n > 1 ? 's' : ''} open</span><span class="num r">$${fmt(e.now)} in</span></button>` : ''; };
  // result pop (top of screen, any tab)
  function pop(p, text, final) {
    const old = $('posPop'); if (old) old.remove(); const ai = p.ai ? aiOf(p.ai) : null;
    const el = document.createElement('div'); el.className = 'sigpop ' + (final ? (p.net > 0 ? 'pwin' : 'ploss') : ''); el.id = 'posPop';
    el.innerHTML = `${ai ? face(ai.f, 36) : `<span class="pc-me" style="width:36px;height:36px">${zmark(18)}</span>`}<div class="tx"><b>${p.pair.replace(' OTC', '')} ${p.dir.toUpperCase()}</b><br>${text}</div><button class="go" onclick="this.parentNode.remove();go('room')">View</button>`;
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
    sheet(`<div class="tk qt"><div class="qt-sig ${s.dir}">${face(ai.f, 44)}<div class="qt-i"><small>${ai.name}${s.ai === pinned() ? ' · ★ main AI' : ''}</small><b>${s.pair.replace(' OTC', '')} <span>OTC</span></b><em>${s.minutes} min digital · entry ${fmtT(s.entryAt)}</em></div><span class="dirb ${s.dir}">${s.dir === 'buy' ? '▲ BUY' : '▼ SELL'}</span></div>
      <div class="lbl">Amount <span class="num">Balance $${fmt(S.balance || 0)}</span></div>
      <div class="optrow five">${[1, 5, 10, 25, 50].map((v) => `<button class="${v === t.amount ? 'on' : ''}" onclick="ROOM.set('amount',${v})">$${v}</button>`).join('')}</div>
      <div class="amtline"><input id="tkAmt" type="number" inputmode="decimal" min="1" placeholder="Other amount" onchange="ROOM.set('amount',Math.max(1,Math.round((+this.value||0)*100)/100))"></div>
      <div class="qt-g"><div><b>Auto-gale ${n ? n + ' steps' : 'off'}</b><small>${n ? lad.map((v) => '$' + fmt(v)).join(' → ') + ' · up to $' + fmt(Math.round(total * 100) / 100) : 'Only this one trade'}</small></div><div class="stp"><button aria-label="Fewer" onclick="ROOM.gale(-1)">−</button><span>${n}</span><button aria-label="More" onclick="ROOM.gale(1)">+</button></div></div>
      <div class="tkfoot">${activated() ? `<button class="btn sun" onclick="ROOM.set('when','${future ? 'entry' : 'now'}');ROOM.confirm()"><span class="sw"></span>${future ? 'Place $' + fmt(t.amount) + ' at ' + fmtT(s.entryAt) : 'Place $' + fmt(t.amount) + ' ' + s.dir.toUpperCase() + ' now'}<small>${s.pair} · ${s.minutes} min${n ? ' · auto-gale ' + n : ''}</small></button>
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
    h = h.replace('<div class="aibar">', `<div id="posPanel">${posPanel()}</div><div class="aibar">`);
    h = h.replace('<div class="today">', `<div id="qbar">${quickBar()}</div><div class="today">`);
    return h.replace('<button class="fabnew" onclick="ROOM.ticket()"><i>+</i>New trade</button>', '');
  };
  // dock: show open-trades bar on other tabs
  const _dock = dock;
  dock = function () { return posBar() + _dock(); };
  // keep the Zara flow's banner + open trades bar from overlapping
  const st2 = document.createElement('style'); st2.textContent = '#banner:empty+*{}'; document.head.appendChild(st2);
