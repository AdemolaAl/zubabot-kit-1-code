/* ===================== Chats tab in the bottom bar =====================
   One place for every conversation, so replying (and converting) is one tap away:
   - pinned at the top: Support (everyone) and the lead mentor (MAX members text him directly; others see what MAX unlocks)
   - up to 2 AI traders the user pins, then every other AI chat, newest first, with unread dots from their AI's messages
   The Live room moves from the bar into this list (and stays on Home). */
(function () {
  const LIVE = () => !!(window.ZB_LIVEMODE && window.ZBAPI);
  const MAXFROM = () => { try { return (TIERS.find((t) => t.k === 'max') || {min: 2000}).min; } catch (e) { return 2000; } };
  const isMax = () => (S.dep || 0) >= MAXFROM();
  const mentor = () => (typeof COACHES !== 'undefined' && COACHES.roland) || {name: 'Roland', f: {}};
  if (!DOCKED.includes('chats')) DOCKED.push('chats');
  const PIN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-1 5 3 3H7l3-3z"/><path d="M12 15v5"/></svg>';
  const unreadFor = (fn) => (window.ZBMSG ? ZBMSG.list.filter((m) => !m.read_at && fn(m)).length : 0);
  const totalUnread = () => (window.ZBMSG ? ZBMSG.list.filter((m) => !m.read_at).length : 0);

  /* ---------- the bar: Chats takes Live's place ---------- */
  const _dock = dock;
  // keep the red number on the Chats tab fresh as messages arrive (without re-drawing the screen)
  window.ZBDOT = () => { try { const b = document.querySelector('button[aria-label="Chats"] .di'); if (!b) return; const n = totalUnread(); let d = b.querySelector('.zc-dot');
    if (!n) { if (d) d.remove(); return; } if (!d) { d = document.createElement('i'); d.className = 'zc-dot'; b.appendChild(d); } const v = n > 9 ? '9+' : String(n); if (d.textContent !== v) d.textContent = v; } catch (e) {} };
  dock = function () {
    const n = totalUnread();
    return _dock().replace(/<button class="[^"]*" onclick="go\('live'\)"[^>]*>[\s\S]*?<\/button>/, `<button class="${VIEW === 'chats' ? 'on' : ''}" onclick="go('chats')" ${VIEW === 'chats' ? 'aria-current="page"' : ''} aria-label="Chats"><span class="di" style="position:relative">${ic('chat', 20, 2)}${n ? `<i class="zc-dot">${n > 9 ? '9+' : n}</i>` : ''}</span>Chats</button>`);
  };

  /* ---------- the list ---------- */
  const lastOf = (k) => { const h = (S.aichat || {})[k] || []; for (let i = h.length - 1; i >= 0; i--) if (h[i][0] === 'ai' || h[i][0] === 'me') return (h[i][0] === 'me' ? 'You: ' : '') + h[i][1]; return ''; };
  const owned = (k) => (S.owned || []).includes(k);
  const row = (o) => `<div class="zc-row ${o.cls || ''}" role="button" tabindex="0" onclick="${o.go}">${o.face}<div class="zc-m"><b>${esc(o.name)}${o.tag ? `<em>${o.tag}</em>` : ''}</b><span>${esc(o.sub || '')}</span></div>${o.unread ? `<i class="zc-n">${o.unread}</i>` : ''}${o.pin !== undefined ? `<button class="zc-pin ${o.pin ? 'on' : ''}" aria-label="${o.pin ? 'Unpin' : 'Pin'}" onclick="event.stopPropagation();ZC.pin('${o.k}')">${PIN}</button>` : ''}</div>`;
  VIEWS.chats = () => {
    const pins = (S.pins || []).filter((k) => AIS[k]).slice(0, 2);
    const keys = Object.keys(AIS).filter((k) => !pins.includes(k) && (owned(k) || ((S.aichat || {})[k] || []).length));
    keys.sort((a, b) => (((S.aichat || {})[b] || []).length ? 1 : 0) - (((S.aichat || {})[a] || []).length ? 1 : 0) || (b === S.ai) - (a === S.ai));
    const m = mentor(), max = isMax();
    const aiRow = (k, p) => { const a = AIS[k]; return row({k, face: face(a.f, 46), name: a.name, tag: k === S.ai ? 'Main AI' : (owned(k) ? '' : 'Locked'), sub: lastOf(k) || a.desc || a.style, unread: unreadFor((x) => x.sender === 'ai' && x.ai === k), pin: p, go: `AIP.chat('${k}')`}); };
    return `<div class="scr zc">
      <div class="top"><div><h1 class="zc-h">Chats</h1><p class="dim" style="font-size:13px;margin:2px 0 0">Your AIs, support${max ? ' and ' + esc(m.name) : ''}</p></div><button class="icb" aria-label="Find more AI traders" onclick="go('market')">${ic('plus', 20, 2.2)}</button></div>
      <div class="zc-sec">Pinned</div>
      <div class="card zc-card">
        ${row({face: face(duty().f, 46), name: 'Support', tag: '24/7', sub: (window.SUPT && SUPT.status === 'human' && SUPT.agent ? SUPT.agent + ' from the team is with you' : 'Any question, any time. A teammate can join'), unread: unreadFor((x) => x.sender === 'support'), go: 'openSupport()'})}
        ${max ? row({face: face(m.f, 46), name: m.name, tag: 'Your mentor', sub: ZC.mLast || 'Text ' + m.name + ' directly, any time', unread: unreadFor((x) => x.sender === 'mentor'), go: 'ZC.mentor()', cls: 'zc-vip'})
          : row({face: `<span class="zc-lockf">${face(m.f, 46)}<i>${ic('lock', 12, 2.6, '#fff')}</i></span>`, name: m.name, tag: 'MAX', sub: `MAX members text ${m.name} directly. Unlock from $${MAXFROM().toLocaleString()}`, go: 'ZC.maxPitch()', cls: 'zc-locked'})}
        ${row({face: `<span class="zc-live">${ic('live', 20, 2.2, '#fff')}</span>`, name: 'Live room', tag: (typeof RTnext === 'function' && RTnext().live) ? 'LIVE' : '', sub: typeof RT === 'function' ? 'Next live: ' + RT() : 'Daily lives with ' + m.name, go: "go('live')"})}
        ${pins.map((k) => aiRow(k, true)).join('')}
      </div>
      ${pins.length < 2 ? `<p class="zc-tip">${PIN} Pin up to 2 AI traders to keep them here</p>` : ''}
      <div class="zc-sec">AI traders</div>
      <div class="card zc-card">${keys.map((k) => aiRow(k, false)).join('') || '<p class="dim" style="padding:12px">No chats yet.</p>'}</div>
      <button class="btn ghost" style="margin-top:12px;height:50px" onclick="go('market')">${ic('store', 18, 2)}Find more AI traders</button>
      <div style="height:110px"></div></div>`;
  };
  const ZC = window.ZC = {};
  ZC.pin = (k) => { S.pins = (S.pins || []).filter((x) => AIS[x]); if (S.pins.includes(k)) S.pins = S.pins.filter((x) => x !== k); else { if (S.pins.length >= 2) { toast('You can pin 2 AIs. Unpin one first'); return; } S.pins.push(k); } save(); go('chats'); };
  ZC.maxPitch = () => { const m = mentor(); sheet(`<div style="text-align:center">${face(m.f, 84)}<h2 style="font-size:21px;font-weight:800;margin:12px 0 4px">Text ${esc(m.name)} directly</h2>
    <p class="dim" style="font-size:14px;line-height:1.5;margin:0 0 14px">MAX members get a private chat with ${esc(m.name)}, our lead mentor, plus every AI trader, premium voice and the VIP live room.</p>
    <button class="btn sun" style="height:56px" onclick="closeOvl();CTX.depPick=${Math.max(10, MAXFROM() - (S.dep || 0))};typeof actSheet==='function'&&actSheet()"><span class="sw"></span>Fund $${Math.max(10, MAXFROM() - (S.dep || 0)).toLocaleString()} to reach MAX</button>
    <p class="zb-own" style="justify-content:center">${ic('shield', 14, 2.4)}<span>It's <b>your own trading capital</b>. It stays in your IQ Option account.</span></p></div>`); };

  /* ---------- MAX: private chat with the lead mentor (answered by the team in Admin -> Support inbox) ---------- */
  const MZ = {after: 0, t: null, msgs: []};
  const mDraw = () => { const box = $('mzMsgs'); if (!box) return; const m = mentor();
    box.innerHTML = (`<div class="ap-row">${face(m.f, 28)}<div class="m in">Hey ${esc(NAME())} 👋 it’s ${esc(m.name)}. Ask me anything about your trading, I reply personally.</div></div>`)
      + MZ.msgs.map((x) => x.role === 'user' ? `<div class="m out">${esc(x.text)}</div>` : x.role === 'system' ? `<div class="zc-sys">${esc(x.text)}</div>` : `<div class="ap-row">${face(m.f, 28)}<div class="m in">${esc(x.text)}</div></div>`).join('');
    box.scrollTop = 1e9; };
  async function mPoll() { if (!$('mzMsgs')) { clearInterval(MZ.t); MZ.t = null; return; } if (!LIVE()) return;
    try { const r = await ZBAPI('/api/support/thread?ch=mentor&after=' + MZ.after); let n = 0; for (const x of r.msgs) { if (!MZ.msgs.some((y) => y.id === x.id)) { MZ.msgs.push(x); n++; } MZ.after = Math.max(MZ.after, x.id); } if (n) { mDraw(); const l = MZ.msgs[MZ.msgs.length - 1]; ZC.mLast = l.text; } } catch (e) {} }
  ZC.mentor = () => {
    if (!isMax()) return ZC.maxPitch(); const m = mentor();
    $('ovl').innerHTML = `<div class="sheetbg"><div class="sheet ap-chat"><div class="grab"></div>
      <div class="ap-ch ap-top"><button class="icb" aria-label="Back" onclick="closeOvl();go('chats')">${ic('back', 18, 2.2)}</button><div class="ap-who">${face(m.f, 46)}<span><b>${esc(m.name)}</b><small><i></i>Lead mentor · replies personally</small></span></div><span style="width:44px"></span></div>
      <div id="mzMsgs" class="msgs ap-msgs"></div>
      <div class="sup-in"><input id="mzIn" placeholder="Message ${esc(m.name)}" onkeydown="if(event.key==='Enter')ZC.mSend()"><button aria-label="Send" onclick="ZC.mSend()">${ic('send', 18, 2.2)}</button></div></div></div>`;
    if (window.ZBMSG) { const ids = ZBMSG.list.filter((x) => x.sender === 'mentor' && !x.read_at).map((x) => x.id); ids.forEach((id) => { const x = ZBMSG.list.find((y) => y.id === id); if (x) x.read_at = Date.now(); }); if (ids.length && LIVE()) ZBAPI('/api/app/inbox/read', {ids, opened: true}).catch(() => {}); }
    mDraw(); mPoll(); if (!MZ.t) MZ.t = setInterval(mPoll, 5000);
  };
  ZC.mSend = async () => { const i = $('mzIn'); const t = (i.value || '').trim(); if (!t) return; i.value = '';
    const tmp = {id: 'l' + Date.now(), role: 'user', text: t}; MZ.msgs.push(tmp); ZC.mLast = 'You: ' + t; mDraw();
    if (!LIVE()) { setTimeout(() => { MZ.msgs.push({id: 'd' + Date.now(), role: 'system', text: mentor().name + ' gets your messages here and replies personally, usually within a few hours 🙌'}); mDraw(); }, 900); return; }
    try { await ZBAPI('/api/mentor/send', {text: t}); MZ.msgs = MZ.msgs.filter((x) => x !== tmp); await mPoll(); } catch (e) { toast(e.message === 'max_only' ? 'Mentor chat is for MAX members' : 'Couldn’t send. Try again'); } };
  // previews from the mentor open the mentor chat
  if (window.ZBMSG) { const _open = ZBMSG.openId; ZBMSG.openId = (id) => { const m = ZBMSG.list.find((x) => x.id === id); if (m && m.sender === 'mentor') return ZC.mentor(); return _open(id); }; }

  const st = document.createElement('style'); st.textContent = `
  .zc .top{align-items:flex-end}.zc-h{font-size:28px;font-weight:800;letter-spacing:-.02em;margin:0}
  .zc-sec{font-size:12px;font-weight:800;color:var(--dim);text-transform:uppercase;letter-spacing:.07em;margin:18px 4px 8px}
  .zc-card{padding:4px 6px}
  .zc-row{display:flex;align-items:center;gap:12px;padding:10px 8px;border-radius:16px;cursor:pointer;position:relative}.zc-row:active{background:var(--soft)}
  .zc-row+.zc-row{border-top:1px solid var(--line)}
  .zc-m{flex:1;min-width:0}.zc-m b{display:flex;align-items:center;gap:6px;font-size:15px;font-weight:800}.zc-m b em{font-style:normal;font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:7px;background:var(--soft);color:var(--dim)}
  .zc-m span{display:block;font-size:13px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
  .zc-vip .zc-m b em{background:linear-gradient(90deg,#FFE680,#FFD21F);color:#5A4400}
  .zc-locked .zc-m b em{background:#15131F;color:#FFD21F}
  .zc-lockf{position:relative;display:inline-flex;filter:saturate(.6)}.zc-lockf i{position:absolute;right:-2px;bottom:-2px;width:20px;height:20px;border-radius:50%;background:#15131F;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #fff}
  .zc-live{width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#FF5A64,#E2324A);display:flex;align-items:center;justify-content:center;flex:none}
  .zc-n{font-style:normal;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#FF4D5E;color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}
  .zc-pin{width:34px;height:34px;border-radius:12px;border:0;background:none;color:#B7BBC9;display:flex;align-items:center;justify-content:center;flex:none}.zc-pin.on{color:#C99A00;background:#FFF6CC}
  .zc-tip{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--dim);margin:8px 6px 0;font-weight:600}
  .zc-dot{position:absolute;top:-4px;right:2px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#FF4D5E;color:#fff;font-style:normal;font-size:10.5px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #fff}
  .zc-sys{align-self:center;text-align:center;font-size:12.5px;color:var(--dim);padding:4px 16px}`;
  document.head.appendChild(st);
})();

/* ===================== "I already have IQ Option": two clear choices ===================== */
(function () {
  window.iqHave = function () {
    sheet(`<h2 style="font-size:22px;font-weight:800;margin:0">You already have IQ Option?</h2><p class="dim" style="font-size:14px;margin:4px 0 14px">Pick the one that fits you.</p>
      <button class="iqh" onclick="closeOvl();oaStart('new')"><span class="iqh-n">1</span><span><b>I opened it myself</b><small>Not through Zubabot. Create a new IQ Option account with a <u>different email</u>. It takes 1 minute and your old account stays yours.</small><em>Create my new account →</em></span></button>
      <button class="iqh" onclick="closeOvl();CTX.inv=1;go('ob')"><span class="iqh-n">2</span><span><b>I joined through Zubabot before</b><small>You registered with our link before this app. Enter the invite code from the Zubabot team.</small><em>Enter my invite code →</em></span></button>
      <button class="btn ghost" style="height:46px;margin-top:6px;font-size:14px" onclick="closeOvl();openSupport()">No code? Message support</button>`);
  };
  const st = document.createElement('style'); st.textContent = `
  .iqh{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;padding:14px;border-radius:18px;border:1.5px solid var(--line);background:#fff;margin-bottom:10px;font:inherit;color:var(--ink);cursor:pointer}
  .iqh:active{border-color:#FFD21F;background:#FFFBEA}.iqh-n{flex:none;width:30px;height:30px;border-radius:50%;background:#FFD21F;color:#0F1222;font-weight:800;display:flex;align-items:center;justify-content:center}
  .iqh b{display:block;font-size:15.5px;font-weight:800}.iqh small{display:block;font-size:13px;color:var(--dim);line-height:1.45;margin-top:3px}.iqh small u{color:var(--ink);text-decoration-thickness:2px;text-decoration-color:#FFD21F}
  .iqh em{display:block;font-style:normal;font-weight:800;font-size:13.5px;margin-top:8px;color:#0F1222}`;
  document.head.appendChild(st);
})();

/* ===================== "Find me a trade" checks the AI's real strategy right now (live app) ===================== */
(function () {
  if (!(window.ZB_LIVEMODE && window.ZBAPI) || !window.AIP) return;
  const _ask = AIP.ask;
  AIP.ask = async (k, q) => {
    const want = /find me a trade|find (me )?a setup|next signal|give me a (trade|signal)|send me a signal/i.test(q || '');
    const has = () => (window.ROOM && ROOM.signals || []).some((s) => s.ai === k && Date.now() < s.entryAt);
    if (want && (S.owned || []).includes(k) && !has()) {
      try { const r = await ZBAPI('/api/signals/find', {ai: k});
        window.ZB_LASTSETUP = r.signal ? {ai: k, ...r.signal} : {ai: k, none: r.none || 'no_setup'};
        if (r.signal && ROOM.load) { await ROOM.load(); try { const sel = ROOM.myAis ? ROOM.myAis() : (S.room.ais || []); if (!sel.includes(k)) { S.room.ais = [...sel, k]; save(); } } catch (e) {} }
      } catch (e) {}
    }
    return _ask(k, q);
  };
  if (window.BRAIN && BRAIN.ctx) { const _ctx = BRAIN.ctx; BRAIN.ctx = () => ({..._ctx(), setup: window.ZB_LASTSETUP && Date.now() - (window.ZB_LASTSETUP.t || (window.ZB_LASTSETUP.t = Date.now())) < 300e3 ? window.ZB_LASTSETUP : undefined}); }
})();

/* ===================== proof pictures in chats (e.g. "Is IQ Option legit?") ===================== */
(function () {
  const API = (window.ZB_API || '').replace(/\/$/, '');
  const img = (n) => `<div class="zp-proof"><img src="${API}/api/proof?n=${encodeURIComponent(n || 'iqoption')}" alt="IQ Option at a glance" loading="lazy" onclick="window.open && window.open(this.src)"></div>`;
  if (window.actCard) { const _a = window.actCard; window.actCard = (k, t) => { try { const c = JSON.parse(t); if (c && c.type === 'proof') return img(c.name); } catch (e) {} return _a(k, t); }; }
  if (window.BRAIN && BRAIN.chat && window.ZB_LIVEMODE) {
    const _chat = BRAIN.chat;
    BRAIN.chat = (b) => _chat(b).then((r) => {
      if (r && r.cta && r.cta.type === 'proof') { const c = r.cta; r.cta = null; const wait = 900 + (r.messages || []).reduce((a, m) => a + 1000 + Math.min(1400, m.length * 22), 0);
        setTimeout(() => { const box = document.getElementById(b.kind === 'support' ? 'sc' : 'apMsgs'); if (!box) return;
          if (b.kind !== 'support' && b.profile && S.aichat) { (S.aichat[b.profile.key] = S.aichat[b.profile.key] || []).push(['act', JSON.stringify(c)]); save(); }
          box.insertAdjacentHTML('beforeend', img(c.name)); box.scrollTop = 1e9; }, wait); }
      return r; });
  }
  const st = document.createElement('style'); st.textContent = '.zp-proof{align-self:flex-start;max-width:78%;margin:4px 0 4px 36px}.zp-proof img{width:100%;border-radius:16px;display:block;box-shadow:0 8px 24px -12px rgba(15,18,34,.4);cursor:zoom-in}';
  document.head.appendChild(st);
})();

/* ===================== charts (MAX) and voice notes (Pro: 10 a day, MAX) in AI trader chats ===================== */
(function () {
  if (!window.AIP || !AIP.chat) return;
  const LIVE = () => !!(window.ZB_LIVEMODE && window.ZBAPI);
  const lvl = (k, d) => { try { return (TIERS.find((t) => t.k === k) || {min: d}).min; } catch (e) { return d; } };
  const MAXM = () => lvl('max', 2000), PROM = () => lvl('pro', 1000);
  const canChart = (k) => (S.dep || 0) >= MAXM() || (S.chartAis || []).includes(k), canVoice = () => (S.dep || 0) >= PROM();
  const UNLOCK = () => (window.ZB_CHART_COINS || 1500);
  const ZBMED = window.ZBMED = {};
  const CAM = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  const H = (k) => ((S.aichat = S.aichat || {})[k] = S.aichat[k] || []);
  const prof = (k) => { const a = AIS[k] || {}; return {key: k, name: a.name, style: a.style, desc: a.desc, owned: true, voice: a.vibe}; };
  const hist = (k) => H(k).filter((x) => x[0] === 'me' || x[0] === 'ai').slice(-12).map((x) => [x[0], x[1]]);
  const typingOn = (k) => { const box = document.getElementById('apMsgs'); if (!box) return; const a = AIS[k]; box.insertAdjacentHTML('beforeend', `<div class="ap-row zm-typing">${face(a.f, 28)}<div class="typing"><i></i><i></i><i></i></div></div>`); box.scrollTop = 1e9; };
  const landed = (k, r) => { (r.messages || []).forEach((m) => H(k).push(['ai', m])); if (r.cta && r.cta.type === 'signal') H(k).push(['sig', '']); else if (r.cta && ['fund', 'coins', 'live', 'academy'].includes(r.cta.type)) H(k).push(['act', JSON.stringify(r.cta)]); save(); AIP.chat(k); };
  ZBMED.unlock = async (k) => { const price = UNLOCK(); if ((S.coins || 0) < price) { closeOvl(); toast('You need ' + price.toLocaleString() + ' coins'); return typeof getCoins === 'function' && getCoins('coins'); }
    if (LIVE()) { try { const r = await ZBAPI('/api/ai/unlock-chart', {ai: k}); if (!r.ok) return toast(r.error === 'not_enough_coins' ? 'Not enough coins yet' : 'Try again'); if (r.coins != null) S.coins = r.coins; } catch (e) { return toast('Try again'); } } else S.coins -= price;
    S.chartAis = [...new Set([...(S.chartAis || []), k])]; save(); closeOvl(); try { SND.coin(); } catch (e) {} toast(AIS[k].name + ' can read your charts now 📈'); AIP.chat(k); };
  const pitch = (what, k) => { const max = what === 'chart'; const need = Math.max(10, (max ? MAXM() : PROM()) - (S.dep || 0));
    sheet(`<div style="text-align:center"><div style="font-size:42px">${max ? '📈' : '🎙'}</div><h2 style="font-size:21px;font-weight:800;margin:8px 0 4px">${max ? 'Send your charts to your AI' : 'Talk to your AI with voice notes'}</h2>
      <p class="dim" style="font-size:14px;line-height:1.5;margin:0 0 14px">${max ? 'Share a chart screenshot and your AI reads it: trend, key levels and what to wait for. Unlock it for this AI with coins, or go MAX and every AI reads your charts, plus 30 voice notes a day, premium voice and texting Roland.' : 'Pro members send voice notes to their AI (10 a day) and it answers like it listened. MAX gets 30 a day, voice replies and chart reading.'}</p>
      ${max && k ? `<button class="btn ink" style="height:56px;margin-bottom:8px" onclick="ZBMED.unlock('${k}')">${ic('coin', 18, 2.2)}Unlock for ${esc(AIS[k].name)} · ${UNLOCK().toLocaleString()} coins</button><p class="dim" style="font-size:12.5px;margin:-2px 0 10px">You have ${(S.coins || 0).toLocaleString()} coins · up to 10 charts a day</p>` : ''}
      <button class="btn sun" style="height:56px" onclick="closeOvl();CTX.depPick=${need};typeof actSheet==='function'&&actSheet()"><span class="sw"></span>${max ? `Go MAX: every AI reads charts · fund $${need.toLocaleString()}` : `Fund $${need.toLocaleString()} to unlock Pro`}</button>
      <p class="zb-own" style="justify-content:center">${ic('shield', 14, 2.4)}<span>It's <b>your own trading capital</b>. It stays in your IQ Option account.</span></p></div>`); };
  const shrink = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onerror = no; r.onload = () => { const im = new Image(); im.onerror = no; im.onload = () => { const s = Math.min(1, 1400 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.85)); }; im.src = r.result; }; r.readAsDataURL(file); });
  async function sendChart(k, file) {
    let img; try { img = await shrink(file); } catch (e) { return toast('Couldn’t read that picture'); }
    const note = (document.getElementById('apIn') || {}).value || ''; H(k).push(['me', '📈 Chart' + (note ? ': ' + note : '')]); save(); AIP.chat(k);
    const box = document.getElementById('apMsgs'); if (box) { box.insertAdjacentHTML('beforeend', `<div class="zm-shot"><img src="${img}" alt="your chart"></div>`); }
    typingOn(k);
    if (!LIVE()) return setTimeout(() => landed(k, {messages: ['Nice chart 👀 In the live app I read it properly: trend, key levels and what I’d wait for.', 'Then I point you to my next real signal.']}), 1400);
    try { const r = await ZBAPI('/api/ai/chart', {ai: k, profile: prof(k), image: img, text: note, history: hist(k), ctx: window.BRAIN && BRAIN.ctx ? BRAIN.ctx() : {}});
      if (!r.ok) { toast(r.error === 'limit' ? `That’s ${r.per} charts today. More tomorrow 🙌` : r.error === 'max_only' ? 'Chart reading is for MAX members' : 'Try again'); AIP.chat(k); return; } landed(k, r); }
    catch (e) { toast('Couldn’t read it right now. Try again'); AIP.chat(k); }
  }
  function bindVoice(k, btn) {
    if (!window.VC || !VC.holdToTalk || !VC.canTalk()) { btn.onclick = () => toast(LIVE() ? 'Allow the microphone for Telegram to send voice notes' : 'Voice notes work in the live app'); return; }
    VC.holdToTalk(btn, {onStart: () => { const i = document.getElementById('apIn'); if (i) i.placeholder = 'Recording… let go to send'; },
      onError: () => toast('Allow the microphone for Telegram to send voice notes'),
      onSend: async (rec) => { if (!rec) return toast('Hold the mic a bit longer');
        H(k).push(['me', '🎙 Voice note…']); save(); AIP.chat(k); typingOn(k);
        try { const r = await ZBAPI('/api/ai/voice-note', {ai: k, profile: prof(k), ...rec, history: hist(k), ctx: window.BRAIN && BRAIN.ctx ? BRAIN.ctx() : {}});
          const h = H(k); const i = h.map((x) => x[1]).lastIndexOf('🎙 Voice note…');
          if (!r.ok) { if (i >= 0) h.splice(i, 1); save(); AIP.chat(k); return toast(r.error === 'limit' ? `That’s ${r.per} voice notes today. More tomorrow 🙌` : r.error === 'not_heard' || r.error === 'too_short' ? 'I couldn’t hear that, try again' : r.error === 'pro_only' ? 'Voice notes are for Pro and MAX' : 'Try again'); }
          if (i >= 0) h[i] = ['me', '🎙 “' + r.heard + '”']; landed(k, r);
          if (r.clips && r.clips.length && VC.playAll) VC.playAll(r.clips); }
        catch (e) { toast('Couldn’t send it. Try again'); AIP.chat(k); } }});
  }
  let synced = 0; const sync = () => { if (!LIVE() || Date.now() - synced < 60e3) return; synced = Date.now(); ZBAPI('/api/ai/media').then((r) => { S.chartAis = r.unlocked || []; window.ZB_CHART_COINS = r.unlockCoins; save(); }).catch(() => {}); };
  const _chat = AIP.chat;
  AIP.chat = function (k) {
    sync(); if (window.ZBMSG && ZBMSG.markAi) ZBMSG.markAi(k);
    const out = _chat.apply(this, arguments);
    const bar = document.querySelector('.ap-chat .sup-in'); if (!bar || bar.querySelector('.zm-tools') || !(S.owned || []).includes(k)) return out;
    bar.insertAdjacentHTML('afterbegin', `<span class="zm-tools"><button class="zm-tool ${canChart(k) ? '' : 'lk'}" id="zmCam" aria-label="Send a chart">${CAM}${canChart(k) ? '' : '<i>🔒</i>'}</button><button class="zm-tool ${canVoice() ? '' : 'lk'}" id="zmMic" aria-label="Hold to send a voice note">${ic('mic', 19, 2.2)}${canVoice() ? '' : '<i>PRO</i>'}</button><input type="file" id="zmFile" accept="image/*" hidden></span>`);
    const cam = document.getElementById('zmCam'), mic = document.getElementById('zmMic'), file = document.getElementById('zmFile');
    cam.onclick = () => canChart(k) ? file.click() : pitch('chart', k);
    file.onchange = () => { if (file.files[0]) sendChart(k, file.files[0]); };
    if (canVoice()) bindVoice(k, mic); else mic.onclick = () => pitch('voice');
    return out;
  };
  const st = document.createElement('style'); st.textContent = `
  .ap-chat .sup-in{gap:6px}.ap-chat .sup-in input{min-width:0;flex:1}.zm-tools{display:flex;gap:4px;flex:none}.zm-tool{position:relative;width:38px;height:38px;border-radius:13px;border:1px solid #E6E8EE;background:#F4F5F8!important;color:#0F1222!important;opacity:1!important;display:flex;align-items:center;justify-content:center;flex:none;touch-action:none;-webkit-user-select:none;user-select:none}
  .zm-tool.lk{color:#8A90A3!important}.zm-tool i{position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);font-style:normal;font-size:8.5px;font-weight:900;background:#15131F;color:#FFD21F;border-radius:5px;padding:1px 4px;letter-spacing:.04em}
  .zm-tool.rec{background:#FF5A64;color:#fff;animation:zvPulse 1s ease-in-out infinite}
  .zm-shot{align-self:flex-end;max-width:62%;margin:2px 0}.zm-shot img{width:100%;border-radius:14px;display:block}`;
  document.head.appendChild(st);
})();
