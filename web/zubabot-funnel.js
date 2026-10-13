/* ===================== v18: beginner funnel =====================
   - Home before deposit shows ONE thing: fund to start (with the plan you chose).
   - New users: dashboard tour (a few seconds) → "How do you want to trade?" → amount → IQ Option.
   - The Z button opens the same three choices (Copy signals · Trade with AI · Trade and talk to AI).
   - Support is an icon in the header, not a floating face over the content. */
(function () {
  const PLANS = {
    copy: {n: 'Copy signals', min: 20, ic: 'bolt', d: 'AI signals pop up with the exact entry time. You tap to copy them.', get: ['Signal Room with 5 AI traders', 'Auto-gale built in', 'Trade it yourself anytime']},
    ai: {n: 'Trade with AI', min: 50, ic: 'spark', d: 'Zara finds the setup, places it and handles auto-gale. You approve every trade.', get: ['Everything in Copy signals', 'Zara picks and places the trades', 'Auto-gale handled for you'], tag: 'Most popular'},
    talk: {n: 'Trade and talk to AI', min: 100, ic: 'mic', d: 'Everything above, plus Zara talks you through each trade by voice.', get: ['Everything in Trade with AI', 'Voice calls with Zara while you trade', 'Voice tokens included']}
  };
  const ORDER = ['copy', 'ai', 'talk'];
  const dep = () => Math.max(+S.dep || 0, +S.provDep || 0);
  const perTrade = (x) => Math.max(1, Math.floor(x / 18.7));            // 3-step auto-gale at ×2.2 needs ≈18.7× the first trade
  const AMTS = [20, 50, 100, 250, 500, 1000];
  if (!IC.spark) IC.spark = '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1-5.1-1.9 5.1-1.9z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>';
  if (!IC.headset) IC.headset = '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3.5" y="13.5" width="4" height="6" rx="2"/><rect x="16.5" y="13.5" width="4" height="6" rx="2"/><path d="M20 18.5c0 1.5-2 2.5-5 2.5"/>';
  if (!IC.lock) IC.lock = '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>';
  const ZF = window.ZF = {};
  let BON = null; const bonusLeft = () => { if (!S.bonusUntil) { S.bonusUntil = Date.now() + 24 * 3600e3; save(); } return Math.max(0, S.bonusUntil - Date.now()); };
  const hms = (ms) => { const s = Math.floor(ms / 1000); return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map((x) => String(x).padStart(2, '0')).join(':'); };
  clearInterval(BON); BON = setInterval(() => document.querySelectorAll('.zf-bon').forEach((e) => { e.textContent = hms(bonusLeft()); }), 1000);

  /* ---------- 5. support: header icon instead of the floating face ---------- */
  supFab = () => '';
  const supBtn = `<button class="icb" aria-label="Support assistant" onclick="openSupport()">${ic('headset', 20, 1.9)}</button>`;

  /* ---------- 1. home: one clear thing ---------- */
  const _home = VIEWS.home;
  VIEWS.home = () => {
    let h = _home();
    h = h.replace('<button class="icb" aria-label="Notifications"', supBtn + '<button class="icb" aria-label="Notifications"');
    if (activated()) {
      h = h.replace(/<button class="pvbar"[\s\S]*?<\/button>/, '');
      // below $50 the main action is the Signal Room (Copy signals); Zara's own flow unlocks at $50
      if (dep() < PLANS.ai.min) h = h.replace(/onclick="startTrade\(\)"><span class="sw"><\/span>[\s\S]*?Start trading/, `onclick="go('room')"><span class="sw"></span>${ic('bolt', 20, 2.2)}See my signals`).replace('Tap to see the setups', 'Copy signals from your AI traders');
      return h;
    }
    const ai = AI(), p = PLANS[S.plan] || PLANS.copy, need = Math.max(p.min, 20), hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    const head = h.slice(0, h.indexOf('</header>') + 9).replace(/<button class="pill" onclick="go\('wallet'\)"[\s\S]*?<\/button>/, '');
    return `${head}
      <div class="zf-hi"><div class="dim">${greet}</div><div class="zf-nm"><span class="serif">${esc(NAME())}</span></div></div>
      <section class="night zf-hero" id="hero">
        <div class="zf-steps">${[['Account', 1], ['Connected', 1], ['Fund', 0], ['Trade', 0]].map((x, i) => `<div class="${x[1] ? 'ok' : i === 2 ? 'now' : ''}"><i>${x[1] ? ic('check', 11, 3, '#0F1222') : i + 1}</i>${x[0]}</div>`).join('<span></span>')}</div>
        <div class="zf-hrow">${face(ai.f, 64, 'float')}<div><h1>One step left, ${esc(NAME())}</h1><p>Fund your IQ Option account and ${ai.name} starts sending you trades.</p></div></div>
        <button class="zf-plan" onclick="ZF.plans()"><span class="zf-pi">${ic(p.ic, 18, 2.2, '#0F1222')}</span><span class="zf-pt"><small>Your plan</small><b>${p.n}</b></span><span class="zf-pc">Change</span></button>
        <button class="btn sun zf-go" onclick="actSheet()"><span class="sw"></span>Fund $${need} to start ${ic('right', 18, 2.6)}</button>
        <div class="zf-bonus">${ic('gift', 15, 2.2, '#FFD21F')}+500 coins if you fund in <b class="zf-bon num">${hms(bonusLeft())}</b></div>
      </section>
      <div class="sech" style="margin-top:20px"><h2>Waiting for you</h2><span class="dim" style="font-size:12.5px">Unlocks with $20</span></div>
      <button class="card zf-locked" onclick="actSheet()">${['EUR/USD', 'GBP/JPY', 'AUD/CAD'].map((x, i) => `<div class="zf-lr">${face(AIS[['luna', 'viza', 'mira'][i]].f, 34)}<b>${x} <small>OTC</small></b><span class="dirb ${i === 1 ? 'sell' : 'buy'}">${i === 1 ? 'SELL' : 'BUY'}</span></div>`).join('')}<div class="zf-lc">${ic('lock', 20, 2.2)}<b>3 signals ready</b><span>Fund $20 to see them</span></div></button>
      ${liveCard()}
      <p class="zf-disc">Zubabot is an independent app built on IQ Option’s platform. It is not run by IQ Option. Trading is risky; only fund what you can afford to lose. 18+</p></div>`;
  };
  const _ah = AFTER.home;
  AFTER.home = () => {
    _ah && _ah();
    if (activated()) { const b = $('bub'); if (b && /Start trading/.test(b.innerHTML)) b.remove(); return; }
    clearTimeout(go.actT); const b = $('bub'); if (b) b.remove();
    if (CTX.zfSnooze) return;
    if (!S.toured) tour(); else go.actT = setTimeout(() => { if (VIEW === 'home' && !activated() && !$('ovl').innerHTML) ZF.plans(); }, 2200);
  };

  /* ---------- the "crazy" first look: dashboard tour, then plans ---------- */
  function tour() {
    const ai = AI(), T = [
      ['hero', `This is your dashboard, ${esc(NAME())}`, 'Everything you need is right here.'],
      ['zf-locked', `${ai.name} already found 3 signals`, 'They unlock the moment you fund.'],
      ['livecard', 'Top traders go live 4 times a day', 'Next one: ' + RT() + '. It’s free to watch.']
    ];
    let i = 0; const old = $('zfTour'); if (old) old.remove();
    document.getElementById('app') && 0;
    const el = document.createElement('div'); el.id = 'zfTour'; el.className = 'zf-tour';
    ($('view').parentNode || document.body).appendChild(el);
    const step = () => {
      document.querySelectorAll('.zf-spot').forEach((x) => x.classList.remove('zf-spot'));
      if (i >= T.length || VIEW !== 'home') { el.remove(); S.toured = 1; save(); if (VIEW === 'home' && !activated()) ZF.plans(); return; }
      const [cls, t, d] = T[i], tgt = document.getElementById(cls) || document.querySelector('.' + cls);
      if (tgt) { tgt.classList.add('zf-spot'); try { tgt.scrollIntoView({block: 'center', behavior: 'smooth'}); } catch (e) {} }
      el.innerHTML = `<div class="zf-tc">${face(ai.f, 40, 'talk')}<div><b>${t}</b><span>${d}</span></div><button onclick="ZF.skipTour()">Skip</button></div><div class="zf-tb">${T.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('')}</div>`;
      i++; ZF._t = setTimeout(step, 2300);
    };
    ZF.skipTour = () => { clearTimeout(ZF._t); i = T.length; step(); };
    setTimeout(step, 400);
  }

  /* ---------- 2. "How do you want to trade?" (onboarding + the Z button) ---------- */
  ZF.plans = (fromZ) => {
    const on = activated(), d = dep(), ai = AI();
    $('ovl').innerHTML = `<div class="sheetbg actbg" onclick="if(event.target===this)ZF.later()"><div class="sheet act zf-sh" id="zfPlans"><div class="grab"></div>
      <div class="zf-say">${face(ai.f, 46, 'talk float')}<div><div class="zf-wave"><i></i><i></i><i></i><i></i><i></i></div><p>${on ? `What do you want to do, ${esc(NAME())}?` : `How do you want to trade, ${esc(NAME())}? Pick one. You can change it anytime.`}</p></div></div>
      <div class="zf-opts">${ORDER.map((k) => { const p = PLANS[k], ok = d >= p.min, cur = S.plan === k; return `<button class="zf-opt ${p.tag && !on ? 'pop' : ''} ${cur && !on ? 'on' : ''}" onclick="ZF.pick('${k}')">
        ${p.tag && !on ? `<span class="zf-tag">${p.tag}</span>` : ''}<span class="zf-oi">${ic(p.ic, 22, 2.2, '#0F1222')}</span>
        <span class="zf-ot"><b>${p.n}</b><span>${p.d}</span></span>
        <span class="zf-om">${on && ok ? `<b class="ok">${ic('right', 18, 2.6)}</b>` : `<small>${on ? 'Add' : 'From'}</small><b class="num">$${on ? fmt(p.min - d) : p.min}</b>`}</span></button>`; }).join('')}</div>
      ${on ? '' : `<p class="zf-fine">${ic('shield', 14, 2.2, '#0FB37A')} Your money goes to your own IQ Option account. We never hold it.</p>`}
      <button class="act-later" onclick="ZF.later()">${on ? 'Close' : 'Look around first'}</button></div></div>`;
  };
  ZF.later = () => { closeOvl(); CTX.zfSnooze = 1; if (!activated()) toast('Tap Fund anytime to start'); };
  ZF.pick = (k) => {
    const p = PLANS[k], d = dep();
    if (activated() && d >= p.min) { closeOvl(); if (k === 'copy') go('room'); else if (k === 'ai') startTrade(); else go('call'); return; }
    S.plan = k; save(); try { SND.tap(); } catch (e) {}
    CTX.depPick = activated() ? Math.max(p.min - d, 10) : (k === 'copy' ? 20 : k === 'ai' ? 50 : 100);
    planFund();
  };
  // Trade with AI needs $50 in total; below that, Copy signals is the way in
  const _st = startTrade;
  startTrade = function (practice) {
    if (practice !== true && activated() && dep() < PLANS.ai.min) { if (!S.plan || S.plan === 'copy') { closeOvl(); go('room'); return; } ZF.need('ai'); return; }   // copy-signals members go to their signals
    return _st.apply(this, arguments);
  };
  ZF.need = (k) => { const p = PLANS[k], d = dep(); sheet(`<h2 style="font-size:22px;font-weight:800">${p.n} needs $${p.min}</h2><p class="ink2" style="font-size:14.5px;line-height:1.5;margin-top:6px">You have $${fmt(d)} on IQ Option. Add <b>$${fmt(p.min - d)}</b> to unlock it, or keep copying signals for now.</p>
    <button class="btn sun" style="margin-top:16px" onclick="ZF.pick('${k}')"><span class="sw"></span>Add $${fmt(p.min - d)}</button><button class="btn" style="height:48px;margin-top:6px" onclick="closeOvl();go('room')">Copy signals instead</button>`); };

  /* ---------- amount: big, clear, with what each amount means ---------- */
  function planFund(keep) {
    const p = PLANS[S.plan] || PLANS.copy, ai = AI(), on = activated(), base = dep();
    const min = on ? 10 : p.min, list = on ? [10, 30, 50, 100, 250, 500] : AMTS.filter((x) => x >= p.min);
    let pk = +CTX.depPick || min; if (pk < min) pk = min; CTX.depPick = pk;
    const total = base + pk, pt = perTrade(total), c = coinsFor(pk), tk = tokensFor(pk, base), rec = on ? null : (p.min === 20 ? 50 : p.min * 2);
    const sc = keep && $('actSheet') ? $('actSheet').scrollTop : 0;
    $('ovl').innerHTML = `<div class="sheetbg actbg" onclick="if(event.target===this)ZF.later()"><div class="sheet act zf-sh" id="actSheet"><div class="grab"></div>
      <div class="zf-fh"><button class="icb" aria-label="Back" onclick="ZF.plans()">${ic('back', 18, 2.2)}</button><span class="zf-chip">${ic(p.ic, 14, 2.4, '#0F1222')}${p.n}</span><span style="width:44px"></span></div>
      <div class="zf-help" id="zfHelp"><span>Questions before you fund?</span><button onclick="ZF.chat()">${ic('chat', 15, 2.2)}Chat</button><button class="call" onclick="fundCall()">${ic('phone', 15, 2.2, '#0F1222')}Call ${ai.name}</button></div>
      <div class="zf-say">${face(ai.f, 46, 'talk float')}<div><div class="zf-wave"><i></i><i></i><i></i><i></i><i></i></div><p>With <b>$${fmt(total)}</b> you can trade about <b>$${pt}</b> per signal with 3-step auto-gale.</p></div></div>
      <div class="zf-big"><small>You’ll fund</small><div class="num">$${fmt(pk)}</div><span>${on ? 'Total on IQ Option: $' + fmt(total) : 'Minimum for ' + p.n + ': $' + p.min}</span></div>
      <div class="zf-amts">${list.map((v) => `<button class="${v === pk ? 'on' : ''}" onclick="CTX.depPick=${v};ZF.refund()">${v === rec ? '<i>Best start</i>' : ''}<b class="num">$${fmt(v)}</b><small>≈ $${perTrade(base + v)}/trade</small></button>`).join('')}</div>
      <label class="zf-own"><span>$</span><input id="zfAmt" type="number" inputmode="decimal" min="${min}" placeholder="Other amount (min $${min})" onchange="const v=Math.round(+this.value||0);if(v>=${min}){CTX.depPick=v;ZF.refund()}else{toast('The minimum is $${min}');this.value=''}"></label>
      <div class="zf-get"><b>You get</b>${p.get.map((g) => `<div>${ic('check', 14, 2.8, '#0A8F61')}${g}</div>`).join('')}<div>${ic('check', 14, 2.8, '#0A8F61')}+${fmt(c)} coins${tk ? ' · +' + fmt(tk) + ' voice tokens' : ''}</div></div>
      ${on ? '' : `<div class="zf-bonus2">${ic('gift', 18, 2.2, '#5A4400')}<span><b>+500 bonus coins</b> if you fund in the next <b class="zf-bon num">${hms(bonusLeft())}</b></span></div>`}
      <p class="zf-fine">${ic('shield', 14, 2.2, '#0FB37A')} Your money goes to your own IQ Option account. Trading is risky; only fund what you can afford to lose. Depositing and withdrawing to farm bonuses gets access banned.</p>
      <div class="zf-bar"><div><small>Fund</small><b class="num">$${fmt(pk)}</b></div><button class="btn sun" onclick="depRedirect()"><span class="sw"></span>Continue to IQ Option ${ic('right', 18, 2.6)}</button></div>
    </div></div>`;
    if (keep) { const s = $('actSheet'); if (s) s.scrollTop = sc; }
    // still deciding after 15 s? Zara pops up with chat / call
    clearTimeout(ZF._nudge); if (!on && !CTX.zfNudged) ZF._nudge = setTimeout(() => { const sh = $('actSheet'); if (!sh || $('zfNudge')) return; CTX.zfNudged = 1; try { SND.msg(); } catch (e) {}
      sh.insertAdjacentHTML('afterbegin', `<div class="zf-nudge" id="zfNudge">${face(ai.f, 40, 'talk')}<div><b>Not sure yet, ${esc(NAME())}?</b><span>Ask me anything. I reply right away.</span><div class="zf-nb"><button onclick="ZF.chat()">${ic('chat', 14, 2.2)}Chat now</button><button class="call" onclick="fundCall()">${ic('phone', 14, 2.2, '#0F1222')}Call me</button></div></div><button class="zf-nx" aria-label="Close" onclick="this.parentNode.remove()">${ic('close', 14, 2.4)}</button></div>`); sh.scrollTo({top: 0, behavior: 'smooth'}); }, 15000);
  }
  ZF.refund = () => planFund(true);
  // every existing "fund" entry point now goes through the new flow
  actSheet = function (keep) { if (keep && $('actSheet')) return planFund(true); if (!S.plan) return ZF.plans(); planFund(); };
  upgradeSheet = function () { closeOvl(); ZF.plans(true); };

  /* ---------- Z button: the three choices ---------- */
  const _dock = dock;
  dock = function () { return _dock().replace(/id="dockZ"([^>]*?)onclick="[^"]*"/, 'id="dockZ"$1onclick="ZF.plans(true)"').replace('aria-label="Start trading"', 'aria-label="How do you want to trade?"'); };

  /* ---------- support chat before deposit: answers, then a "Fund now" button to IQ Option ---------- */
  const FAQ = [
    [/safe|scam|trust|steal|legit|real/i, 'Is my money safe?', ['Yes. Your money goes into your own IQ Option account, in your name.', 'Zubabot can’t touch it or withdraw it. You can withdraw on IQ Option anytime.', 'Trading itself is risky though, so only fund what you can afford to lose.']],
    [/how much|amount|minimum|start with|least/i, 'How much should I start with?', () => { const p = PLANS[S.plan] || PLANS.copy; return [`Copy signals starts at $20, Trade with AI at $50, and Trade and talk to AI at $100.`, `You picked ${p.n}, so $${p.min} gets you in. With $100 you can trade about $5 per signal with auto-gale.`, 'Start with what you’re comfortable with. You can add more later.']; }],
    [/how.*(deposit|fund|pay)|card|bank|transfer|ussd|mobile money|crypto/i, 'How do I deposit?', ['Tap Fund now below. IQ Option’s secure payment page opens right here in Zubabot.', 'Pay with card, bank transfer or mobile money, whichever IQ Option shows for your country.', 'Close the page when you’re done. Zubabot unlocks the moment your money lands.']],
    [/withdraw|cash out|get my money/i, 'Can I withdraw my money?', ['Yes, anytime. Withdrawals are done on IQ Option, straight to you.', 'Just know that withdrawing and depositing again to farm bonuses gets Zubabot access banned.']],
    [/profit|make money|guarantee|win|earn/i, 'Will I make profit?', ['Nobody can promise profit, and we never will.', 'Zara shows you the setup and auto-gale tries to recover a loss, but trades can still lose.', 'You approve every trade and choose the amount.']],
    [/bonus|coin|500/i, 'What’s the welcome bonus?', [() => `Fund $20 or more in the next ${hms(bonusLeft())} and you get +500 bonus coins on top.`, 'Coins unlock extra AI traders and features inside Zubabot.']],
    [/not ready|later|tomorrow|can.?t afford|broke|think/i, 'I’m not ready yet', [`No pressure. Roland goes live tonight at ${ROLAND_TIME.replace(' WAT', '')} and anyone can watch for free.`, 'Watch how members trade, then come back when you’re ready.']]
  ];
  const _openSup = openSupport;
  const lines = (x) => (typeof x === 'function' ? x() : x).map((l) => (typeof l === 'function' ? l() : l));
  function fundCTA() {
    const box = $('sc'); if (!box) return; const pk = Math.max(+CTX.depPick || 0, (PLANS[S.plan] || PLANS.copy).min);
    const d = document.createElement('div'); d.className = 'ctrade zf-cta';
    d.innerHTML = `<div class="zf-ct">${ic('wallet', 18, 2.2, '#5A4400')}<div><b>Ready when you are</b><span>Fund $${fmt(pk)} on IQ Option · +500 bonus coins in <b class="zf-bon num">${hms(bonusLeft())}</b></span></div></div>
      <button class="btn sun" style="height:50px;margin-top:10px" onclick="ZF.fundNow()"><span class="sw"></span>Fund $${fmt(pk)} now ${ic('right', 18, 2.6)}</button><p class="zb-own">${ic('shield', 14, 2.4)}<span>It's <b>your own trading capital</b>. The money stays in your IQ Option account and you trade with it.</span></p>`;
    box.appendChild(d); box.scrollTop = box.scrollHeight;
  }
  const asked = new Set();
  const faqReplies = (more) => { const left = FAQ.filter((f) => !asked.has(f[1])), show = more ? left : left.slice(0, 3);
    replies([...show.map((f) => [f[1], () => { asked.add(f[1]); preAns(f[1], f[2]); }]), ...(!more && left.length > 3 ? [['More questions', () => faqReplies(true)]] : []), ['I’m ready, fund now', () => { you('I’m ready'); sayS(['Let’s go! 🙌', 'Tap Fund now and finish on IQ Option. I’ll be here.'], fundCTA); }]]); };
  function preAns(q, l) { you(q); sayS(lines(l), () => { fundCTA(); setTimeout(faqReplies, 400); }); }
  const preChat = (topic) => { const keep = sayS; sayS = () => {}; try { _openSup(topic); } finally { sayS = keep; }   // draw the chat sheet without its default script
    CTX.zfFromFund = 1; sayS([`Hi ${esc(NAME())} 😊 I’m ${duty().n} from Zubabot support.`, 'Ask me anything before you fund. Tap a question or type your own.'], faqReplies); };
  ZF.chat = () => { clearTimeout(ZF._nudge); preChat(); };
  ZF.faqReplies = faqReplies; ZF.bonusLeft = bonusLeft; ZF.hms = hms; ZF.preChat = preChat;
  ZF.fundNow = () => { closeOvl(); CTX.zfFromFund = 0; if (!activated()) { CTX.depPick = Math.max(+CTX.depPick || 0, (PLANS[S.plan] || PLANS.copy).min); depDetect(); } };
  const _supSend = supSend;
  supSend = function () {
    if (activated() || !CTX.zfFromFund) return _supSend();
    const i = $('sin'); if (!i) return; const t = i.value.trim(); if (!t) return; i.value = ''; you(t);
    const f = FAQ.find((x) => x[0].test(t));
    sayS(f ? lines(f[2]) : ['Good question. A teammate will reply here shortly.', 'Meanwhile: your money goes into your own IQ Option account, and $20 is enough to start copying signals.'], () => { fundCTA(); setTimeout(faqReplies, 400); });
  };
  // the old support entry points also get the funding script before deposit
  openSupport = function (topic) { if (!activated() && !topic) return preChat(); CTX.zfFromFund = 0; return _openSup(topic); };
  if (!IC.wallet) IC.wallet = '<rect x="3.5" y="6" width="17" height="13" rx="3"/><path d="M16 12.5h2M3.5 9.5h17"/>';

  const st = document.createElement('style'); st.textContent = `
  .zf-hi{margin-top:16px;padding:0 2px}.zf-hi .dim{font-size:13px;font-weight:600}.zf-nm .serif{font-size:30px;line-height:1.05}
  .zf-hero{margin-top:12px;padding:16px 16px 14px;text-align:left}
  .zf-steps{display:flex;align-items:center;gap:4px}.zf-steps div{display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;color:#8F95AA;white-space:nowrap}
  .zf-steps i{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:10px;font-weight:800;background:rgba(255,255,255,.1);color:#8F95AA}
  .zf-steps .ok{color:#E9EBF2}.zf-steps .ok i{background:var(--sun)}.zf-steps .now{color:#FFF}.zf-steps .now i{background:#FFF;color:var(--ink);box-shadow:0 0 0 3px rgba(255,210,31,.35);animation:zfp 1.6s infinite}
  .zf-steps span{flex:1;height:2px;background:rgba(255,255,255,.12);min-width:6px}
  @keyframes zfp{50%{box-shadow:0 0 0 6px rgba(255,210,31,.12)}}
  .zf-hrow{display:flex;gap:14px;align-items:center;margin-top:16px}.zf-hrow h1{font-size:22px;font-weight:800;line-height:1.15;letter-spacing:-.02em}.zf-hrow p{font-size:13.5px;color:#B8BCCB;margin-top:4px;line-height:1.4}
  .zf-plan{display:flex;align-items:center;gap:12px;width:100%;margin-top:16px;padding:10px 12px;border-radius:16px;background:rgba(255,255,255,.07);color:#FFF;text-align:left}
  .zf-pi{width:36px;height:36px;border-radius:11px;background:var(--sun);display:grid;place-items:center;flex:none}.zf-pt{flex:1}.zf-pt small{display:block;font-size:11px;color:#8F95AA;font-weight:700}.zf-pt b{font-size:15px}
  .zf-pc{font-size:12.5px;font-weight:800;color:var(--sun)}
  .zf-go{margin-top:12px;height:60px;font-size:17px}
  .zf-bonus{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:10px;font-size:12.5px;color:#B8BCCB}.zf-bonus b{color:#FFF}
  .zf-locked{display:block;width:100%;position:relative;margin-top:10px;padding:8px 14px;text-align:left;overflow:hidden}
  .zf-lr{display:flex;align-items:center;gap:10px;padding:8px 0;filter:blur(4px);opacity:.55}.zf-lr b{flex:1;font-size:15px}.zf-lr small{font-size:10.5px;color:var(--mute)}
  .zf-lc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:rgba(255,255,255,.35)}.zf-lc b{font-size:16px}.zf-lc span{font-size:12.5px;color:var(--ink2,#4A4E5C)}
  .zf-disc{font-size:11.5px;color:var(--mute);text-align:center;margin-top:20px;line-height:1.5}
  .zf-spot{position:relative;z-index:35;box-shadow:0 0 0 3px var(--sun),0 0 0 9999px rgba(15,20,36,.55)!important;transition:box-shadow .3s;border-radius:24px}
  .zf-tour{position:absolute;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top,0px));z-index:45;animation:zfIn .35s ease-out}
  .zf-tc{display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;border-radius:20px;background:var(--ink);color:#FFF;box-shadow:0 14px 34px -14px rgba(0,0,0,.6)}
  .zf-tc>div{flex:1;min-width:0}.zf-tc b{display:block;font-size:15px}.zf-tc span{display:block;font-size:12.5px;color:#B8BCCB;margin-top:1px}
  .zf-tc button{height:30px;padding:0 10px;border-radius:9px;background:rgba(255,255,255,.1);font-size:12px;font-weight:800;color:#FFF}
  .zf-tb{display:flex;gap:4px;margin:8px 6px 0}.zf-tb i{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.35)}.zf-tb i.done{background:var(--sun)}.zf-tb i.on{background:linear-gradient(90deg,var(--sun) 50%,rgba(255,255,255,.35) 50%);background-size:200% 100%;animation:zfbar 2.3s linear forwards}
  @keyframes zfbar{from{background-position:100% 0}to{background-position:0 0}}
  @keyframes zfIn{from{transform:translateY(-20px);opacity:0}}
  .zf-sh{padding-bottom:18px}
  .zf-say{display:flex;gap:12px;align-items:center;margin-top:4px}.zf-say p{font-size:16px;font-weight:700;line-height:1.35;margin-top:4px}
  .zf-wave{display:inline-flex;gap:3px;align-items:center;height:14px}.zf-wave i{width:3px;border-radius:2px;background:var(--money);animation:zfw .9s infinite ease-in-out}.zf-wave i:nth-child(2){animation-delay:.15s}.zf-wave i:nth-child(3){animation-delay:.3s}.zf-wave i:nth-child(4){animation-delay:.45s}.zf-wave i:nth-child(5){animation-delay:.6s}
  @keyframes zfw{0%,100%{height:4px}50%{height:14px}}
  .zf-opts{display:flex;flex-direction:column;gap:10px;margin-top:16px}
  .zf-opt{position:relative;display:flex;align-items:center;gap:12px;width:100%;padding:16px 14px;border-radius:20px;background:#FFF;border:1.5px solid var(--line);text-align:left;animation:zfUp .4s ease-out both}
  .zf-opt:nth-child(2){animation-delay:.07s}.zf-opt:nth-child(3){animation-delay:.14s}
  @keyframes zfUp{from{transform:translateY(14px);opacity:0}}
  .zf-opt.pop{border-color:var(--sun2,#FFC300);box-shadow:0 0 0 3px var(--sun-t)}.zf-opt.on{border-color:var(--ink)}
  .zf-tag{position:absolute;top:-9px;right:14px;font-size:10.5px;font-weight:800;background:var(--sun);padding:3px 8px;border-radius:7px}
  .zf-oi{width:46px;height:46px;border-radius:15px;background:var(--sun-t);display:grid;place-items:center;flex:none}.zf-opt.pop .zf-oi{background:var(--sun)}
  .zf-ot{flex:1;min-width:0}.zf-ot b{display:block;font-size:16px;font-weight:800}.zf-ot span{display:block;font-size:12.5px;color:var(--ink2,#4A4E5C);line-height:1.35;margin-top:2px}
  .zf-om{text-align:right;flex:none}.zf-om small{display:block;font-size:11px;color:var(--mute);font-weight:700}.zf-om b{font-size:18px;font-weight:800}.zf-om b.ok{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:var(--sun)}
  .zf-fine{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--mute);line-height:1.45;margin-top:14px}.zf-fine svg{flex:none;margin-top:1px}
  .zf-fh{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
  .zf-chip{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:10px;background:var(--sun);font-size:13px;font-weight:800}
  .zf-big{text-align:center;margin-top:16px}.zf-big small{font-size:12.5px;font-weight:700;color:var(--mute)}.zf-big div{font-size:52px;font-weight:800;letter-spacing:-.04em;line-height:1.05}.zf-big span{font-size:12.5px;color:var(--mute)}
  .zf-amts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}
  .zf-amts button{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 4px;border-radius:16px;background:#FFF;border:1.5px solid var(--line)}
  .zf-amts b{font-size:18px;font-weight:800}.zf-amts small{font-size:11px;color:var(--mute);font-weight:600}
  .zf-amts button.on{background:var(--ink);border-color:var(--ink);color:#FFF}.zf-amts button.on small{color:#B8BCCB}
  .zf-amts i{position:absolute;top:-8px;left:50%;transform:translateX(-50%);white-space:nowrap;font-style:normal;font-size:10px;font-weight:800;background:var(--money);color:#FFF;padding:2px 7px;border-radius:6px}
  .zf-own{display:flex;align-items:center;gap:6px;height:50px;margin-top:8px;padding:0 14px;border-radius:15px;border:1.5px dashed var(--line2,#DEDED6);background:#FFF;font-weight:800}
  .zf-own input{flex:1;min-width:0;border:0;outline:0;font:inherit;font-size:16px;font-weight:700;background:transparent}
  .zf-get{margin-top:14px;padding:14px;border-radius:18px;background:var(--money-t,#E4F7EF)}.zf-get>b{display:block;font-size:14px;margin-bottom:6px}.zf-get div{display:flex;gap:8px;align-items:center;font-size:13.5px;padding:3px 0}
  .zf-bonus2{display:flex;gap:10px;align-items:center;margin-top:10px;padding:12px 14px;border-radius:16px;background:var(--sun-t);font-size:13px}
  .zf-bar{position:sticky;bottom:-18px;z-index:2;display:flex;gap:10px;align-items:center;margin:14px -20px -18px;padding:12px 20px calc(16px + env(safe-area-inset-bottom,0px));background:var(--bg,#F6F6F2);box-shadow:0 -10px 24px -16px rgba(15,18,34,.35)}
  .zf-bar>div small{display:block;font-size:11px;color:var(--mute);font-weight:700}.zf-bar>div b{font-size:22px;font-weight:800}.zf-bar .btn{flex:1;height:58px;font-size:16px}
  .zf-help{position:sticky;top:-12px;z-index:3;display:flex;align-items:center;gap:6px;margin:0 -18px 4px;padding:8px 18px;background:#FFF;border-bottom:1px solid var(--line)}
  .zf-help span{flex:1;font-size:12.5px;font-weight:700;color:var(--ink2,#454A5E)}
  .zf-help button{display:inline-flex;align-items:center;gap:5px;height:34px;padding:0 11px;border-radius:11px;background:var(--soft);font-size:12.5px;font-weight:800}.zf-help button.call{background:var(--sun)}
  .zf-nudge{position:relative;display:flex;gap:10px;align-items:flex-start;margin:0 0 10px;padding:12px 34px 12px 12px;border-radius:18px;background:var(--ink);color:#FFF;animation:zfIn .4s ease-out}
  .zf-nudge b{display:block;font-size:14.5px}.zf-nudge span{display:block;font-size:12.5px;color:#B8BCCB;margin-top:1px}
  .zf-nb{display:flex;gap:6px;margin-top:8px}.zf-nb button{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 10px;border-radius:10px;background:rgba(255,255,255,.12);color:#FFF;font-size:12.5px;font-weight:800}.zf-nb button.call{background:var(--sun);color:var(--ink)}
  .zf-nx{position:absolute;top:8px;right:8px;width:24px;height:24px;border-radius:8px;display:grid;place-items:center;color:#B8BCCB}
  .zf-cta{border:1.5px solid var(--sun2,#FFC300)}.zf-ct{display:flex;gap:10px;align-items:flex-start;text-align:left}.zf-ct>svg{flex:none;margin-top:2px}.zf-ct b{display:block;font-size:14.5px}.zf-ct span{display:block;font-size:12.5px;color:var(--ink2,#454A5E);margin-top:1px}.zf-ct span b{display:inline;font-size:12.5px}
  @media (prefers-reduced-motion:reduce){.zf-opt,.zf-tour{animation:none}.zf-tb i.on{animation:none;background:var(--sun)}}
  `; document.head.appendChild(st);
})();
