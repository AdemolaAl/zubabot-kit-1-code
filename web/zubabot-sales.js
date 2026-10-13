/* ===================== Messages from your AI + support: preview pop-up, bell, and the chat =====================
   The server's sales engine (and support) sends messages: win streaks, great days, "almost at the next level",
   check-ins, a stronger AI introducing itself, and teammates' replies. They arrive on Telegram as a normal phone
   notification, and in the app as a preview that slides in at the top. Tapping it opens that chat.
   The demo shows the same preview after 3 wins in a row, so it can be seen without a server. */
(function () {
  const LIVE = () => !!(window.ZB_LIVEMODE && window.ZBAPI);
  const M = window.ZBMSG = {after: 0, unread: 0, list: [], shown: new Set()};
  try { const s = JSON.parse(localStorage.getItem('zbmsg') || '{}'); M.after = +s.after || 0; } catch (e) {}
  const keep = () => { try { localStorage.setItem('zbmsg', JSON.stringify({after: M.after})); } catch (e) {} };
  const aiOf = (k) => (typeof AIS !== 'undefined' && (AIS[k] || AIS.luna)) || {name: 'Zara', f: {}};

  function preview(m) {
    if (M.shown.has(m.id)) return; M.shown.add(m.id);
    if (document.querySelector('.ap-chat') && m.sender === 'ai') { addToChat(m); markRead([m.id], false); return; }   // already in a chat: just add it
    document.querySelectorAll('.zm-pop').forEach((x) => x.remove());
    const isAi = m.sender === 'ai', a = isAi ? aiOf(m.ai) : null;
    const el = document.createElement('button'); el.className = 'zm-pop'; el.setAttribute('aria-label', 'Open message');
    const ment = m.sender === 'mentor' && typeof COACHES !== 'undefined' ? COACHES.roland : null;
    el.innerHTML = `<span class="zm-f">${isAi ? (window.ZORB ? ZORB(a.f, 44, 1) : face(a.f, 40)) : face((ment || duty()).f, 40)}</span><span class="zm-t"><b>${esc(isAi ? a.name : (m.who || 'Support'))}<small>${isAi ? 'your AI trader' : ment ? 'your mentor' : 'Zubabot support'} · now</small></b><span>${esc(String(m.text).split('\n')[0])}</span></span>`;
    el.onclick = () => { el.remove(); open(m); };
    let y0 = null; el.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, {passive: true});
    el.addEventListener('touchmove', (e) => { if (y0 != null && e.touches[0].clientY - y0 < -25) { el.classList.add('out'); setTimeout(() => el.remove(), 250); } }, {passive: true});
    (document.getElementById('app') || document.body).appendChild(el);
    try { SND.msg(); } catch (e) {} try { Telegram.WebApp.HapticFeedback.notificationOccurred('success'); } catch (e) {}
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 9000);
  }
  function addToChat(m) {
    if (!S.aichat) S.aichat = {}; const k = m.ai || 'luna'; const h = S.aichat[k] = S.aichat[k] || [];
    if (h.some((x) => x[2] === 'm' + m.id)) return;
    String(m.text).split('\n').filter(Boolean).forEach((t) => h.push(['ai', t, 'm' + m.id]));
    if (m.cta) h.push(['act', JSON.stringify(m.cta), 'm' + m.id]);
    if (h.length > 40) h.splice(0, h.length - 40); save();
    if (document.querySelector('.ap-chat') && window.AIP && AIP.chat) { try { AIP.chat(k); } catch (e) {} }
  }
  function open(m) {
    markRead([m.id], true);
    if (m.sender === 'mentor' && window.ZC) { try { closeOvl(); } catch (e) {} return ZC.mentor(); }
    if (m.sender === 'ai') { addToChat(m); try { closeOvl(); } catch (e) {} AIP.chat(m.ai || 'luna'); }
    else { try { closeOvl(); } catch (e) {} openSupport(); }
  }
  function markRead(ids, opened) { M.list.forEach((m) => { if (ids.includes(m.id)) m.read_at = Date.now(); }); badge(); if (LIVE()) ZBAPI('/api/app/inbox/read', {ids, opened}).catch(() => {}); }
  function badge() {
    M.unread = M.list.filter((m) => !m.read_at).length; if (window.ZBDOT) ZBDOT();
    document.querySelectorAll('button[aria-label="Notifications"]').forEach((b) => { let n = b.querySelector('.zm-n'); if (!M.unread) { if (n) n.remove(); return; }
      if (!n) { n = document.createElement('span'); n.className = 'zm-n'; b.appendChild(n); } const v = M.unread > 9 ? '9+' : String(M.unread); if (n.textContent !== v) n.textContent = v; });
  }
  let bq = 0; new MutationObserver(() => { if (M.unread && !bq) bq = requestAnimationFrame(() => { bq = 0; const b = document.querySelector('button[aria-label="Notifications"]'); if (b && !b.querySelector('.zm-n')) badge(); }); }).observe(document.body, {childList: true, subtree: true});

  async function poll() {
    if (!LIVE() || document.hidden) return;
    try { const r = await ZBAPI('/api/app/inbox?after=' + M.after);
      for (const m of r.msgs) { if (!M.list.some((x) => x.id === m.id)) M.list.push(m); M.after = Math.max(M.after, m.id); if (!m.read_at && Date.now() - m.at < 3 * 864e5) preview(m); }
      keep(); badge(); } catch (e) {}
  }
  if (LIVE()) { setTimeout(poll, 4000); setInterval(poll, 30000); document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
    // the server needs to know your main AI (it's the one that messages you)
    let lastAi = ''; setInterval(() => { if (S.ai && S.ai !== lastAi) { lastAi = S.ai; ZBAPI('/api/app/state', {ai: S.ai}).catch(() => {}); } }, 5000); }

  // messages show at the top of the bell sheet too
  const _notifs = window.notifs;
  window.notifs = function () {
    const r = _notifs ? _notifs.apply(this, arguments) : null;
    const box = document.querySelector('.sheet'); if (!box || !M.list.length) return r;
    const items = M.list.slice(-6).reverse().map((m) => { const a = m.sender === 'ai' ? aiOf(m.ai) : null;
      return `<button class="zm-row ${m.read_at ? '' : 'new'}" onclick="ZBMSG.openId(${m.id})">${a ? face(a.f, 38) : face(duty().f, 38)}<span><b>${esc(a ? a.name : (m.who || 'Support'))}</b><span>${esc(String(m.text).split('\n')[0])}</span></span></button>`; }).join('');
    const h2 = box.querySelector('h2'); (h2 || box.firstChild).insertAdjacentHTML('afterend', `<div class="zm-list"><div class="zm-h">Messages</div>${items}</div>`);
    return r;
  };
  M.markRead = markRead;
  M.markAi = (k) => { const ids = M.list.filter((m) => !m.read_at && m.sender === 'ai' && m.ai === k).map((m) => m.id); if (ids.length) markRead(ids, true); };
  M.markSupport = () => { const ids = M.list.filter((m) => !m.read_at && m.sender === 'support').map((m) => m.id); if (ids.length) markRead(ids, true); };
  { const _os = window.openSupport; if (_os) window.openSupport = function () { M.markSupport(); return _os.apply(this, arguments); }; }
  M.openId = (id) => { const m = M.list.find((x) => x.id === id); if (m) open(m); };
  // ?go=ai&k=luna from the Telegram button opens that AI's chat
  try { const u = new URLSearchParams(location.search); if (u.get('go') === 'ai') setTimeout(() => { if (S.ob >= 9 && window.AIP) AIP.chat(u.get('k') || 'luna'); }, 3500); } catch (e) {}

  /* ---------- demo: the same moment after 3 wins in a row ---------- */
  if (!LIVE()) {
    let seen = 0; setInterval(() => {
      const h = S.history || []; if (h.length === seen) return; seen = h.length; if (!S.dep) return;
      let st = 0; for (const x of h) { if (x.win) st++; else break; }
      if (st === 3 || st === 5) { const a = aiOf(S.ai); const lv = [50, 100, 500, 1000, 2000].find((v) => v > S.dep); const add = lv ? Math.max(10, lv - S.dep) : 100;
        const won = h.slice(0, st).reduce((s, x) => s + (+x.pl || 0), 0);
        const m = {id: 'd' + Date.now(), sender: 'ai', ai: S.ai, at: Date.now(), cta: {type: 'fund', amount: add},
          text: `${st} wins back to back 🔥 +$${won.toFixed(2)}, you’re trading like a pro ${NAME()}!\n${lv ? `Add $${add} and you reach the $${lv} level${lv === 100 ? ': we can do voice calls together' : lv === 50 ? ': I trade the setups with you' : ': stronger AIs join us'}. It’s your own trading capital, it stays in your IQ Option account.` : 'Want to size up? More capital, bigger trades, all the gale steps covered.'}`};
        M.list.push(m); preview(m); badge(); }
    }, 2500);
  }

  const st = document.createElement('style'); st.textContent = `
  .zm-pop{position:absolute;left:10px;right:10px;top:calc(10px + env(safe-area-inset-top,0px));z-index:120;display:flex;gap:11px;align-items:center;text-align:left;padding:10px 14px 10px 10px;border-radius:20px;border:1px solid rgba(15,18,34,.06);
    background:rgba(255,255,255,.97);box-shadow:0 18px 40px -14px rgba(15,18,34,.35),0 2px 6px rgba(15,18,34,.06);backdrop-filter:blur(10px);animation:zmIn .45s cubic-bezier(.2,.9,.25,1.2);cursor:pointer;font:inherit;color:#0F1222}
  .zm-pop.out{transition:.3s;transform:translateY(-130%);opacity:0}
  .zm-f{flex:none;display:flex}.zm-t{min-width:0;flex:1}.zm-t b{display:flex;align-items:baseline;gap:6px;font-size:14px;font-weight:800}.zm-t b small{font-size:11.5px;color:#8A8FA3;font-weight:600}
  .zm-t>span{display:block;font-size:13.5px;color:#3A3F55;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  @keyframes zmIn{from{transform:translateY(-120%);opacity:.3}to{transform:none;opacity:1}}
  button[aria-label="Notifications"]{position:relative}
  .zm-n{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#FF4D5E;color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #fff}
  .zm-list{margin:8px 0 14px}.zm-h{font-size:12px;font-weight:800;color:#8A8FA3;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
  .zm-row{display:flex;gap:10px;align-items:center;width:100%;text-align:left;padding:9px 10px;border-radius:14px;border:0;background:#F6F7F9;margin-bottom:6px;font:inherit;color:#0F1222;cursor:pointer}
  .zm-row.new{background:#FFF7D6;box-shadow:inset 3px 0 0 #FFD21F}.zm-row span{min-width:0}.zm-row b{display:block;font-size:13.5px}.zm-row span span{display:block;font-size:12.5px;color:#55596B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;
  document.head.appendChild(st);
})();
