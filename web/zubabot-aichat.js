/* ===================== v20: AI profiles + chat with every AI =====================
   - Every AI trader has a profile (photo in its cloud, style, timeframe, markets, how it trades).
   - Anyone can message any AI. Unlocked AIs chat normally. Locked AIs answer, then say "Unlock me",
     explain how to get coins and show one clear button.
   - Calls are only for AIs you've unlocked. */
(function () {
  const AIP = window.AIP = {};
  const owned = (k) => (S.owned || []).includes(k);
  const tfOf = (k, a) => ({viza: '1 min', luna: '5 min', mira: '5 min', blaze: '1 min', remi: '15 min'})[k] || (/scalp|sniper|quick|intraday/i.test(a.style) ? '1–3 min' : /swing|big|patient|trend/i.test(a.style) ? '5–15 min' : '1–5 min');
  const mkOf = (a) => /gold/i.test(a.style) && /EUR/.test(a.style) ? 'Gold and EUR/USD' : /gold/i.test(a.style) ? 'Gold' : a.mk === 'crypto' ? 'BTC · ETH · crypto' : a.mk === 'all' ? 'Forex, gold and crypto' : a.maxOnly && /EUR/.test(a.style) ? 'EUR/USD only' : 'Forex OTC pairs';
  const HOW = (a) => [
    /trend|rider/i.test(a.style) ? 'I find the strongest trend of the hour.' : /break/i.test(a.style) ? 'I mark the edges of a range.' : /revers|turn/i.test(a.style) ? 'I watch key levels where moves run out.' : /news|data/i.test(a.style) ? 'I wait for the big news release.' : /scalp|sniper|quick|signals/i.test(a.style) ? 'I watch the busiest pairs second by second.' : 'I wait for a clean, calm setup.',
    /trend|rider/i.test(a.style) ? 'I wait for a small pullback.' : /break/i.test(a.style) ? 'I wait for price to break out with strength.' : /revers|turn/i.test(a.style) ? 'I wait for the turn to confirm.' : /news|data/i.test(a.style) ? 'I let the first spike settle.' : 'I wait for the exact entry moment.',
    'Then I send you the pair, BUY or SELL, and the entry time. You decide.'];
  // what it costs to get this AI
  function need(k) {
    const a = AIS[k]; if (owned(k)) return {ok: true};
    if ((S.dep || 0) < a.min) return {ok: false, kind: 'fund', amount: a.min - (S.dep || 0), label: a.maxOnly ? 'MAX mode' : tierOf(a.min).n + ' mode'};
    if (typeof freeLeft === 'function' && freeLeft() > 0) return {ok: false, kind: 'free'};
    if ((S.coins || 0) < a.price) return {ok: false, kind: 'coins', short: a.price - (S.coins || 0)};
    return {ok: false, kind: 'buy'};
  }
  const ctaFor = (k) => {
    const a = AIS[k], n = need(k);
    if (n.kind === 'fund') return `<button class="btn sun" onclick="AIP.topup(${n.amount},'${k}')"><span class="sw"></span>Fund $${fmt(n.amount)} to unlock me</button><p class="zb-own">${ic('shield', 14, 2.4)}<span>It's <b>your own trading capital</b>. The money stays in your IQ Option account and you trade with it.</span></p>`;
    if (n.kind === 'free') return `<button class="btn sun" onclick="buyAI('${k}')"><span class="sw"></span>${ic('gift', 18, 2.2)}Unlock me free</button>`;
    if (n.kind === 'coins') return `<button class="btn sun" onclick="getCoins('coins',${n.short},'${k}')"><span class="sw"></span>Get ${fmt(n.short)} more coins</button>`;
    return `<button class="btn sun" onclick="buyAI('${k}')"><span class="sw"></span>Unlock me · ${fmt(a.price)} coins</button>`;
  };
  const coinWays = (k) => { const a = AIS[k], n = need(k), usd = Math.ceil((n.short || a.price) / COIN_PER_USD);
    return `<div class="ap-ways"><b>How to get coins</b>
      <div><span>${ic('wallet', 16, 2.2, '#5A4400')}</span><p>${n.kind === 'fund' ? `<b>Deposit $${fmt(n.amount)} more</b> · it's your own trading money, it stays in your IQ Option account. It takes you to ${n.label}, where I live, and adds ${fmt(n.amount * COIN_PER_USD)} bonus coins.` : `<b>Deposit</b> · every $1 = ${COIN_PER_USD} coins. $${fmt(usd)} gets you ${n.short ? 'the rest' : 'me'}.`}</p></div>
      <div><span>${ic('gift', 16, 2.2, '#5A4400')}</span><p><b>Daily gift</b> · take 3 trades a day and open your gift.</p></div>
      <div><span>${ic('crown', 16, 2.2, '#5A4400')}</span><p><b>Star Trader</b> · light up your AI team for free unlocks.</p></div></div>`; };

  /* ---------- profile ---------- */
  AIP.open = (k) => {
    const a = AIS[k]; if (!a) return; const own = owned(k), main = S.ai === k, n = need(k), t = aiTag(a);
    sheet(`<div class="ap">
      <div class="ap-hero">${ZORB(a.f, 132, 0, 'idle')}<div class="ap-st ${own ? 'on' : ''}">${own ? `<i></i>${main ? 'Your active AI' : 'Unlocked'}` : `${ic('lock', 12, 2.6)}Locked`}</div></div>
      <h2 class="ap-n">${a.name}</h2><div class="ap-s">${a.style}${t ? ` · <span class="aitag ${t[1]}">${t[0]}</span>` : ''}</div>
      <p class="ap-d">${a.desc}</p>
      <div class="ap-facts"><div><small>Trades</small><b>${tfOf(k, a)}</b></div><div><small>Markets</small><b>${mkOf(a)}</b></div><div><small>${own ? 'Status' : 'Unlock'}</small><b>${own ? 'Ready' : n.kind === 'fund' ? n.label : fmt(a.price) + ' coins'}</b></div></div>
      <div class="ap-how"><b>How I trade</b>${HOW(a).map((x, i) => `<div><span class="nt-n">${i + 1}</span><span>${x}</span></div>`).join('')}</div>
      <div class="ap-acts"><button class="btn ink" onclick="AIP.chat('${k}')">${ic('chat', 18, 2.2)}Message</button><button class="btn ${own ? 'ghost' : 'ghost ap-lock'}" onclick="AIP.call('${k}')">${own ? ic('phone', 18, 2.2) : ic('lock', 16, 2.4)}Call</button></div>
      ${own ? (main ? '' : `<button class="btn sun" style="margin-top:10px" onclick="setAI('${k}');AIP.open('${k}')"><span class="sw"></span>Make ${a.name} my active AI</button>`) : `<div style="margin-top:10px">${ctaFor(k)}</div>`}
      <p class="dim" style="font-size:11.5px;text-align:center;margin-top:12px">${a.name} is an AI trader. Signals are ideas, you decide every trade.</p></div>`);
  };
  AIP.call = (k) => {
    const a = AIS[k];
    if (!owned(k)) { sheet(`<div class="ap" style="text-align:center">${ZORB(a.f, 96, 0, 'idle')}<h2 class="ap-n" style="margin-top:12px">Calls are for unlocked AIs</h2><p class="ap-d">Unlock ${a.name} to talk live while you trade. You can still send ${a.he === 'He' ? 'him' : 'her'} a message for free.</p>${coinWays(k)}<div style="margin-top:12px">${ctaFor(k)}</div><button class="btn" style="height:46px;margin-top:6px" onclick="AIP.chat('${k}')">Message ${a.name} instead</button></div>`); return; }
    closeOvl(); if (S.ai !== k) { S.ai = k; save(); toast(a.name + ' is now your active AI'); } go('call');
  };

  /* ---------- calls go to the AI you called ----------
     Every unlocked AI can be called (Viza included). The call screen shows that AI. The real-voice demo link
     only appears for Zara, because she is the one with a live voice agent today. */
  for (const k in AIS) if (AIS[k].tier === 'std') AIS[k].tier = 'voice';
  const _call = VIEWS.call;
  VIEWS.call = () => { let h = _call(); if (voiceAI() !== AIS.luna) h = h.replace(/<a href="https:\/\/elevenlabs\.io[^"]*agent_3401[^"]*"[\s\S]*?<\/a>/, ''); return h; };

  /* ---------- chat ---------- */
  const H = () => (S.aichat = S.aichat || {});
  const hist = (k) => (H()[k] = H()[k] || []);
  const push = (k, who, t) => { const h = hist(k); h.push([who, t]); if (h.length > 40) h.splice(0, h.length - 40); save(); };
  const nextSig = (k) => { try { return (ROOM.signals || []).find((s) => s.ai === k); } catch (e) { return null; } };
  function reply(k, q) {
    const a = AIS[k], own = owned(k), nm = esc(NAME()), t = String(q || '').toLowerCase();
    let out;
    if (/find me a trade|find (me )?a setup/.test(t)) out = own ? (nextSig(k) ? [`On it 👀`, `Here’s my next setup. Check the entry time and tap to open it.`] : [`Scanning the market for you now…`, `Nothing clean yet. I’ll ping you the second I see one 🔔`]) : [`I’ve got one lined up 👀`];
    else if (/^(hi|hello|hey|yo|hiya|good (morning|evening|afternoon))\b/.test(t.trim()) && t.length < 25) out = [`Hey ${nm} 👋 ${a.name} here.`, `I trade ${a.style.toLowerCase()}. ${a.desc}`];
    else if (/\b(watch\w*|looking|market\w*|now)\b/.test(t)) out = [`Right now I’m watching ${mkOf(a)}.`, `My trades last about ${tfOf(k, a)}. When the setup is clean, I call it.`];
    else if (/unlock|price|cost|coin|buy you/.test(t)) out = own ? [`You’ve already unlocked me ✅`, `I’m ready when you are. Ask for my next signal, or tap the phone to call me.`] : need(k).kind === 'fund' ? [`I’m part of ${need(k).label}. Fund $${fmt(need(k).amount)} more and I’m yours, with calls too.`] : [`I cost ${fmt(a.price)} coins, and I’m yours for good once you unlock me.`];
    else if (/\b(how|strategy|work|trade)\b/.test(t) && !/lose/.test(t)) out = HOW(a);
    else if (/signal|trade me|give me|send/.test(t)) out = own ? (nextSig(k) ? [`I’ve got one coming 👀`] : [`Nothing clean yet. I’ll ping you the second I see one.`]) : [`I’d love to send you my next one.`];
    else if (/\b(lose|loss|losing|guarantee\w*)\b/.test(t)) out = [`Any single trade can lose, that’s trading.`, `That’s why you pick the amount and the auto-gale steps. I keep my setups clean and my entries tight 💪`];
    else if (/profit|win rate|rich|earn|make money/.test(t)) out = [`I don’t promise numbers, I show you my setups.`, `Follow me for a few signals and judge me by my trades 😉`, own ? `Want my next one?` : `Unlock me and see for yourself.`];
    else if (/call|talk|voice/.test(t)) out = own ? [`Sure, tap the phone at the top and let’s talk.`] : [`I’d love to talk you through my trades live.`];
    else if (/who|you|real|human|bot/.test(t)) out = [`I’m ${a.name}, one of Zubabot’s AI traders. Not a human, but I never sleep 😄`, `I watch the market for you and send setups you can copy.`];
    else out = [`Good question, ${nm}.`, `I focus on ${a.style.toLowerCase()}. Ask me how I trade, what I’m watching, or for my next signal.`];
    return out;
  }
  function render(k) {
    const box = $('apMsgs'); if (!box) return; const a = AIS[k];
    box.innerHTML = hist(k).map(([w, t]) => w === 'me' ? `<div class="m out">${esc(t)}</div>` : w === 'cta' ? lockCard(k) : w === 'sig' ? sigCard(k) : w === 'act' ? (window.actCard ? actCard(k, t) : '') : `<div class="ap-row">${face(a.f, 28)}<div class="m in">${esc(t)}</div></div>`).join('');
    box.scrollTop = box.scrollHeight;
  }
  const lockCard = (k) => { const a = AIS[k]; return `<div class="ctrade ap-cta">${owned(k) ? `<b>${a.name} is unlocked 🎉</b>` : `<div class="ap-ch">${face(a.f, 40)}<div><b>Unlock me to trade with me</b><span>${need(k).kind === 'fund' ? `I’m part of ${need(k).label}.` : `${fmt(a.price)} coins · yours forever.`} Calls unlock too.</span></div></div>${coinWays(k)}<div style="margin-top:10px">${ctaFor(k)}</div>`}</div>`; };
  const sigCard = (k) => { const s = nextSig(k); if (!s) return ''; return `<div class="ctrade ap-sig"><div class="ap-ch"><b>${s.pair.replace(' OTC', '')} <small>OTC</small></b><span class="dirb ${s.dir}">${s.dir.toUpperCase()}</span></div><span class="dim" style="font-size:12.5px">${s.minutes} min · entry ${typeof s.entryAt === 'number' ? new Date(s.entryAt).toTimeString().slice(0, 5) : 'soon'}</span><button class="btn sun" style="height:46px;margin-top:8px" onclick="closeOvl();go('room')">Open in Signal Room</button></div>`; };
  function typing(k, lines, then) {
    const box = $('apMsgs'); if (!box) return; const a = AIS[k]; let i = 0;
    const step = () => { if (i >= lines.length) { then && then(); return; }
      const t = document.createElement('div'); t.className = 'ap-row'; t.innerHTML = `${face(a.f, 28)}<div class="typing"><i></i><i></i><i></i></div>`; box.appendChild(t); box.scrollTop = box.scrollHeight;
      setTimeout(() => { t.remove(); push(k, 'ai', lines[i]); render(k); try { SND.msg(); } catch (e) {} i++; setTimeout(step, 300); }, 650 + Math.min(1200, lines[i].length * 18)); };
    step();
  }
  // real AI replies from the server (brain.js) when it's set up; otherwise the scripted replies below
  function brainAsk(k, q) {
    const a = AIS[k], own = owned(k), box = $('apMsgs'), n = need(k);
    const t = document.createElement('div'); t.className = 'ap-row'; t.innerHTML = `${face(a.f, 28)}<div class="typing"><i></i><i></i><i></i></div>`; box && box.appendChild(t); if (box) box.scrollTop = box.scrollHeight;
    const prof = {key: k, name: a.name, style: a.style, desc: a.desc, tf: tfOf(k, a), markets: mkOf(a), owned: own, voice: a.vibe,
      unlock: own ? '' : n.kind === 'fund' ? `part of ${n.label}: the user needs to fund $${n.amount} more` : n.kind === 'free' ? 'the user can unlock you FREE with a Star Trader perk' : n.kind === 'coins' ? `costs ${a.price} coins, the user needs ${n.short} more` : `costs ${a.price} coins and the user has enough`};
    const history = hist(k).filter((x) => x[0] === 'me' || x[0] === 'ai').slice(-13, -1);
    return BRAIN.chat({kind: 'ai', profile: prof, history, text: q}).then((r) => {
      t.remove();
      typing(k, r.messages, () => {
        const c = r.cta;
        if (c && c.type === 'unlock' && !own) push(k, 'cta', '');
        else if (((c && c.type === 'signal') || /find me/i.test(q)) && own && nextSig(k)) push(k, 'sig', '');
        else if (c && ['fund', 'coins', 'live', 'academy'].includes(c.type)) push(k, 'act', JSON.stringify(c));
        render(k); quick(k);
      });
    }).catch(() => { t.remove(); return false; });
  }
  function ask(k, q) {
    push(k, 'me', q); render(k); quick(k, true);
    if (window.BRAIN && BRAIN.live()) { brainAsk(k, q).then((ok) => { if (ok === false) scripted(k, q); }); return; }
    scripted(k, q);
  }
  function scripted(k, q) {
    const own = owned(k), lines = reply(k, q), t = q.toLowerCase();
    typing(k, lines, () => {
      if (!own && !hist(k).some((x) => x[0] === 'cta') || (!own && /signal|trade|call|unlock|price|coin|cost|find me/.test(t))) {
        typing(k, [`Unlock me and I’ll start sending you my trades today. Here’s how 👇`], () => { push(k, 'cta', ''); render(k); quick(k); });
      } else { if (own && /signal|trade me|give me|send|find me/.test(t) && nextSig(k)) { push(k, 'sig', ''); render(k); } else if (own && /find me/.test(t)) { push(k, 'act', JSON.stringify({type: 'room'})); render(k); } quick(k); }
    });
  }
  function quick(k, hide) {
    const q = $('apQ'); if (!q) return; if (hide) { q.innerHTML = ''; return; }
    if (!hist(k).some((x) => x[0] === 'me')) { q.innerHTML = `<button class="ap-find" onclick="AIP.ask('${k}','Find me a trade')"><span class="sw"></span>${ic('bolt', 20, 2.4)}Find me a trade</button>`; return; }
    const own = owned(k), list = own ? ['What are you watching?', 'Send me a signal', 'How do you trade?', 'How much should I start with?'] : ['How do you trade?', 'Send me a signal', 'How do I unlock you?', 'Why should I pick you?'];
    q.innerHTML = list.map((x) => `<button onclick="AIP.ask('${k}',this.textContent)">${x}</button>`).join('');
  }
  AIP.ask = (k, q) => ask(k, q);
  // straight to the deposit amount screen, pre-filled with what this AI needs
  AIP.topup = (usd, k) => { closeOvl(); if (!S.plan) S.plan = 'copy'; CTX.depPick = Math.max(activated() ? 10 : 20, usd); CTX.zfFor = k; save(); actSheet(); };
  AIP.send = (k) => { const i = $('apIn'); const v = (i.value || '').trim(); if (!v) return; i.value = ''; ask(k, v); };
  AIP.chat = (k) => {
    const a = AIS[k], own = owned(k);
    $('ovl').innerHTML = `<div class="sheetbg"><div class="sheet ap-chat"><div class="grab"></div>
      <div class="ap-ch ap-top"><button class="icb" aria-label="Back" onclick="AIP.open('${k}')">${ic('back', 18, 2.2)}</button><button class="ap-who" onclick="AIP.open('${k}')">${ZORB(a.f, 46, 0, 'idle')}<span><b>${a.name}</b><small><i></i>Online · replies instantly</small></span></button><button class="icb ${own ? '' : 'ap-lock'}" aria-label="Call ${a.name}" onclick="AIP.call('${k}')">${own ? ic('phone', 18, 2.2) : ic('lock', 16, 2.4)}</button></div>
      <div id="apMsgs" class="msgs ap-msgs"></div><div id="apQ" class="qr ap-q"></div>
      <div class="sup-in"><input id="apIn" placeholder="Message ${a.name}" onkeydown="if(event.key==='Enter')AIP.send('${k}')"><button aria-label="Send" onclick="AIP.send('${k}')">${ic('send', 18, 2.2)}</button></div></div></div>`;
    render(k);
    if (!hist(k).length) typing(k, [`Hey ${esc(NAME())} 👋 I’m ${a.name}.`, `${a.desc}`, own ? `Ask me anything, or tap below.` : `You haven’t unlocked me yet, but ask me anything.`], () => quick(k)); else quick(k);
  };

  /* ---------- all chats list ---------- */
  AIP.list = () => {
    const keys = Object.keys(AIS).sort((x, y) => (owned(y) - owned(x)) || (S.ai === y) - (S.ai === x));
    sheet(`<h2 style="font-size:22px;font-weight:800">Message your AI traders</h2><p class="dim" style="font-size:13.5px;margin-top:2px">Every AI replies. Unlock one to trade and call.</p>
      <div class="ap-list">${keys.map((k) => { const a = AIS[k], h = hist(k), last = h.filter((x) => x[0] === 'ai' || x[0] === 'me').slice(-1)[0];
        return `<button class="ap-li" onclick="AIP.chat('${k}')">${face(a.f, 46)}<span class="ap-lt"><b>${a.name}${owned(k) ? '' : ` <i>${ic('lock', 11, 2.6)}</i>`}</b><small>${last ? esc(last[1]).slice(0, 48) : a.style}</small></span>${S.ai === k ? '<em>Active</em>' : ''}</button>`; }).join('')}</div>`);
  };

  /* ---------- entry points ---------- */
  // marketplace: tap any AI card to see its profile, plus a Message button
  const _am = AFTER.market;
  AFTER.market = () => { _am && _am();
    document.querySelectorAll('.aicard').forEach((c) => { const nm = (c.querySelector('span[style*="font-size:17px"]') || {}).textContent; const k = Object.keys(AIS).find((x) => AIS[x].name === nm); if (!k) return;
      c.style.cursor = 'pointer'; c.addEventListener('click', (e) => { if (!e.target.closest('button')) AIP.open(k); });
      const b = c.querySelector('button, span[style*="Active"]'); const m = document.createElement('button'); m.className = 'ap-msgb'; m.setAttribute('aria-label', 'Message ' + AIS[k].name); m.innerHTML = ic('chat', 16, 2.2); m.onclick = (e) => { e.stopPropagation(); AIP.chat(k); }; c.appendChild(m); });
    // the MAX flagship (Kai) is its own card: make it tappable and give it a Message button
    const fl = document.querySelector('.flagship');
    if (fl && !fl.querySelector('.ap-flmsg')) { const kk = 'kai'; fl.style.cursor = 'pointer'; fl.addEventListener('click', (e) => { if (!e.target.closest('button')) AIP.open(kk); });
      const fix = fl.querySelector('button.btn.sun'); if (fix && /\$5,000/.test(fix.textContent)) fix.innerHTML = fix.innerHTML.replace('$5,000', '$' + fmt(AIS.kai.min));
      fl.insertAdjacentHTML('beforeend', `<div class="ap-flrow"><button class="ap-flmsg" onclick="event.stopPropagation();AIP.chat('kai')">${ic('chat', 17, 2.2)}Message Kai</button><button class="ap-flmsg" onclick="event.stopPropagation();AIP.open('kai')">${ic('right', 17, 2.2)}See profile</button></div>`); }
    const hd = document.querySelector('.scr header'); if (hd && !document.getElementById('apAll')) hd.insertAdjacentHTML('afterend', `<button id="apAll" class="card ap-allb" onclick="AIP.list()"><span>${ic('chat', 18, 2.2, '#0F1222')}</span><b>Message any AI trader<small>Ask how they trade before you unlock them</small></b>${ic('right', 18, 2.2)}</button>`);
  };
  // side menu
  const _drawer = drawer;
  drawer = function () { _drawer(); const o = $('ovl'); o.innerHTML = o.innerHTML.replace('<div class="mgrp">My trades</div>', `<div class="mgrp">AI traders</div><button class="mi" onclick="closeOvl();AIP.list()"><span class="mic">${ic('chat', 19, 2)}</span>Message your AIs</button><div class="mgrp">My trades</div>`); };
  // Signal Room "Your AI trader" bar and pick cards: tap the face to open the profile
  document.addEventListener('click', (e) => { const f = e.target.closest('.bg-ya .face, .bg-ya .zorb, .bg-row .face, .zf-lr .face'); if (!f) return; const row = f.closest('.bg-ya,.bg-row'); if (!row) return; const nm = (row.querySelector('b') || {}).textContent || ''; const k = Object.keys(AIS).find((x) => nm.startsWith(AIS[x].name)); if (k) { e.stopPropagation(); e.preventDefault(); AIP.open(k); } }, true);
  if (!IC.chat) IC.chat = '<path d="M4.5 6.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H10l-4.5 4v-4h0a1.5 1.5 0 0 1-1-1.4z"/>';

  const st = document.createElement('style'); st.textContent = `
  .ap{padding-bottom:4px}
  .ap-hero{position:relative;display:flex;flex-direction:column;align-items:center;margin-top:4px}
  .ap-st{display:inline-flex;align-items:center;gap:5px;margin-top:-6px;position:relative;height:26px;padding:0 10px;border-radius:9px;background:var(--ink);color:#FFF;font-size:11.5px;font-weight:800}
  .ap-st.on{background:#FFF;color:var(--money-d);box-shadow:0 0 0 1.5px var(--money-t)}.ap-st i{width:7px;height:7px;border-radius:50%;background:var(--money)}
  .ap-n{text-align:center;font-size:26px;font-weight:800;margin-top:10px}.ap-s{text-align:center;font-size:13.5px;font-weight:700;color:var(--ink2);margin-top:2px}
  .ap-d{text-align:center;font-size:14px;color:var(--ink2);line-height:1.5;margin:8px 8px 0}
  .ap-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}.ap-facts div{padding:10px;border-radius:14px;background:var(--soft)}
  .ap-facts small{display:block;font-size:11px;font-weight:700;color:var(--dim)}.ap-facts b{font-size:13px;font-weight:800;line-height:1.25;display:block;margin-top:2px}
  .ap-how{margin-top:12px;padding:12px 14px;border-radius:16px;border:1px solid var(--line)}.ap-how>b{display:block;font-size:14px;margin-bottom:4px}
  .ap-how div{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;padding:4px 0}.ap-how .nt-n{transform:none;width:22px;height:22px;font-size:11px;flex:none}
  .ap-acts{display:grid;grid-template-columns:1.4fr 1fr;gap:8px;margin-top:14px}.ap-acts .btn{height:52px}
  .btn.ap-lock,.icb.ap-lock{color:var(--dim)}
  .ap-chat{height:92%;display:flex;flex-direction:column;padding-bottom:12px}
  .ap-ch{display:flex;align-items:center;gap:10px}.ap-top{padding-bottom:10px;border-bottom:1px solid var(--line)}
  .ap-who{flex:1;display:flex;align-items:center;gap:10px;text-align:left;min-width:0}.ap-who b{display:block;font-size:16px;font-weight:800}
  .ap-who small{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--money-d);font-weight:700}.ap-who small i{width:7px;height:7px;border-radius:50%;background:var(--money)}
  .ap-msgs{flex:1;overflow-y:auto;padding:14px 2px}
  .ap-row{display:flex;gap:8px;align-items:flex-end}.ap-row .face{flex:none}.ap-row .m{max-width:78%}
  .ap-q{padding-top:8px}
  .ap-cta{margin:4px 0 4px 36px;border:1.5px solid var(--sun2)}.ap-cta .ap-ch b{display:block;font-size:15px}.ap-cta .ap-ch span{display:block;font-size:12.5px;color:var(--ink2);margin-top:1px}
  .ap-ways{text-align:left;margin-top:10px;padding:10px 12px;border-radius:14px;background:var(--sun-t)}.ap-ways>b{display:block;font-size:13px;margin-bottom:4px}
  .ap-ways div{display:flex;gap:10px;align-items:flex-start;padding:4px 0}.ap-ways div>span{width:28px;height:28px;border-radius:9px;background:#FFF;display:grid;place-items:center;flex:none}
  .ap-ways p{font-size:12.5px;line-height:1.4;margin:0;color:var(--ink2)}.ap-ways p b{color:var(--ink)}
  .ap-sig{margin:4px 0 4px 36px}.ap-sig .ap-ch{justify-content:space-between}.ap-sig b{font-size:17px}.ap-sig small{font-size:11px;color:var(--dim)}
  .ap-list{display:flex;flex-direction:column;margin-top:12px}
  .ap-li{display:flex;align-items:center;gap:12px;padding:10px 2px;border-bottom:1px solid var(--line);text-align:left;width:100%}
  .ap-lt{flex:1;min-width:0}.ap-lt b{display:flex;align-items:center;gap:5px;font-size:15px}.ap-lt b i{color:var(--dim);display:inline-flex}
  .ap-lt small{display:block;font-size:12.5px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ap-li em{font-style:normal;font-size:11px;font-weight:800;padding:4px 8px;border-radius:8px;background:var(--sun)}
  .aicard{position:relative}
  .ap-msgb{position:absolute;top:10px;right:10px;width:34px;height:34px;border-radius:11px;background:var(--soft);display:grid;place-items:center;z-index:1}
  .aicard>div{padding-right:28px}
  .ap-flrow{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
  .ap-flmsg{display:flex;align-items:center;justify-content:center;gap:6px;height:46px;border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,210,31,.3);color:#FFF;font-weight:800;font-size:14px}
  .ap-allb{display:flex;align-items:center;gap:12px;width:100%;margin-top:14px;padding:12px 14px;text-align:left}
  .ap-allb>span{width:40px;height:40px;border-radius:13px;background:var(--sun);display:grid;place-items:center;flex:none}
  .ap-allb b{flex:1;font-size:15px}.ap-allb small{display:block;font-size:12.5px;color:var(--dim);font-weight:600;margin-top:1px}
  `; document.head.appendChild(st);
})();
