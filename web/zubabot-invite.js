/* ===================== Invite friends (own page: go('invite')) =====================
   Live mode: GET /api/ref/me (code, links, stats, friends, milestones). Demo: sample data, clearly labelled.
   Friends are tracked by Telegram's signed start_param (t.me/<bot>/app?startapp=ref_CODE), coins land on REAL deposits only. */
(function () {
  const LIVEAPI = () => !!(window.ZB_LIVEMODE && window.ZBAPI);
  let REFD = null, loading = false;
  const DEMO = () => ({demo: true, code: 'ZB7K4Q', links: {app: 'https://t.me/zubabot/app?startapp=ref_ZB7K4Q', chat: 'https://t.me/zubabot?start=ref_ZB7K4Q'},
    rules: {minTrades: 5, ftd: 200, friend: 100, share: 0.03, min: 20, milestones: [[5, 1000], [15, 3000], [30, 8000]], big: 100, per: 5, cap: 2500, fper: 2, fcap: 1000, windowH: 24},
    stats: {invited: 5, joined: 3, funded: 2, trading: 1, earned: 1500, held: 200, pending: 800}, next: {friends: 5, coins: 1000, left: 4},
    friends: [{name: 'Tobi', status: 'trading', coins: 1500, firstDay: 300, hoursLeft: 9, at: Date.now() - 20 * 3600e3}, {name: 'Amaka', status: 'funded', coins: 0, held: 200, trades: 2, firstDay: 50, hoursLeft: 0, at: Date.now() - 4 * 864e5},
      {name: 'Kwame', status: 'joined', coins: 0, at: Date.now() - 6 * 3600e3}, {name: 'Zainab', status: 'opened', coins: 0, at: Date.now() - 50 * 60e3}, {name: 'Sipho', status: 'opened', coins: 0, at: Date.now() - 20 * 60e3}], invitedBy: null});
  const load = () => { if (loading) return; if (!LIVEAPI()) { REFD = DEMO(); return; } loading = true;
    ZBAPI('/api/ref/me').then((d) => { REFD = d; loading = false; if (VIEW === 'invite' || VIEW === 'home') rerender(); }).catch(() => { loading = false; }); };
  const D = () => REFD || (load(), REFD) || DEMO();
  const shareText = (d) => `I trade with an AI trader on Zubabot 🔥 3 months free. Join with my link and get up to +${fmt(d.rules.fcap || d.rules.friend)} bonus coins on your first day:`;
  const tgOpen = (u) => { try { if (window.Telegram && Telegram.WebApp && Telegram.WebApp.openTelegramLink) return Telegram.WebApp.openTelegramLink(u); } catch (e) {} window.open(u, '_blank'); };
  const extOpen = (u) => { try { if (window.Telegram && Telegram.WebApp && Telegram.WebApp.openLink) return Telegram.WebApp.openLink(u); } catch (e) {} window.open(u, '_blank'); };
  const INV = window.INV = {
    share() { const d = D(); try { SND.coin(); } catch (e) {} tgOpen('https://t.me/share/url?url=' + encodeURIComponent(d.links.app) + '&text=' + encodeURIComponent(shareText(d))); },
    wa() { const d = D(); extOpen('https://wa.me/?text=' + encodeURIComponent(shareText(d) + ' ' + d.links.app)); },
    copy(what) { const d = D(), t = what === 'msg' ? shareText(d) + ' ' + d.links.app : d.links.app;
      const ok = () => { toast(what === 'msg' ? 'Message copied' : 'Link copied'); const b = $('invCopy'); if (b && what !== 'msg') { b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 1600); } };
      try { navigator.clipboard.writeText(t).then(ok, () => { fallback(t); ok(); }); } catch (e) { fallback(t); ok(); } },
    refresh() { REFD = null; load(); },
  };
  function fallback(t) { const a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) {} a.remove(); }
  const ago = (t) => { const m = Math.round((Date.now() - t) / 6e4); return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  const ST = {opened: ['Opened Zubabot', 'iv-s1'], joined: ['Account connected', 'iv-s2'], funded: ['Funded', 'iv-s4'], trading: ['Trading ✓', 'iv-s3']};
  const init = (n) => (n || '?').trim().charAt(0).toUpperCase();
  const HUES = ['#FFD21F', '#14B871', '#5B8DEF', '#FF8A00', '#9A7BEF', '#F0525E'];

  VIEWS.invite = () => {
    const d = D(), r = d.rules, s = d.stats, M = r.milestones || [], last = M.length ? M[M.length - 1][0] : 10;
    const nx = d.next, prevN = nx ? (M.filter(([n]) => n < nx.friends).pop() || [0])[0] : last;
    const pct = nx ? Math.round((((s.trading ?? s.funded) - prevN) / (nx.friends - prevN)) * 100) : 100;
    const faces = ['avatars/w2.jpg', 'avatars/m4.jpg', 'avatars/w7.jpg', 'avatars/m9.jpg'];
    return `<div class="scr iv">
      <div class="top"><button class="icb" aria-label="Back" onclick="go('home')">${ic('back', 18, 2.2)}</button><button class="icb" aria-label="Open menu" onclick="drawer()">${ic('menu', 20, 2.1)}</button></div>
      ${d.invitedBy ? `<div class="iv-by">${ic('gift', 18, 2.2)}<span><b>${esc(d.invitedBy.name)}</b> invited you · your first day of deposits gets you <b>up to +${fmt(d.invitedBy.cap || d.invitedBy.bonus)} bonus coins</b></span></div>` : ''}
      <section class="iv-hero">
        <div class="iv-ht"><small>INVITE FRIENDS</small><h1>Earn up to <span class="num">+${fmt(r.cap || r.ftd)}</span><br>coins per friend</h1><p>+${fmt(r.ftd)} when a friend funds $${r.min}+. If they put in $${r.big || 100}+ in their first ${r.windowH || 24} hours, you get ${r.per || 5} coins per $1. Spend them on AI traders.</p></div>
        <div class="iv-orbit" aria-hidden="true"><span class="iv-me"><img src="${(document.querySelector('.me-av img') || {}).src || 'avatars/m0.jpg'}" alt=""></span>
          ${faces.map((f, i) => `<span class="iv-f iv-f${i}"><img src="${f}" alt=""></span>`).join('')}
          <i class="iv-c iv-c0"></i><i class="iv-c iv-c1"></i><i class="iv-c iv-c2"></i>
          <svg class="iv-ring" viewBox="0 0 160 160"><circle cx="80" cy="80" r="62"/></svg></div>
      </section>
      <section class="card iv-link">
        <div class="iv-lt"><small>Your invite link</small><code>${esc(d.links.app.replace('https://', ''))}</code></div>
        <button class="iv-copy" id="invCopy" onclick="INV.copy()" aria-label="Copy link">${ic('copy', 18, 2.2)}<span>Copy</span></button>
      </section>
      <button class="btn sun iv-go" onclick="INV.share()"><span class="sw"></span>${ic('send', 20, 2.2)}Share on Telegram</button>
      <div class="iv-alt"><button onclick="INV.wa()">${ic('chat', 16, 2.2)}WhatsApp</button><button onclick="INV.copy('msg')">${ic('copy', 16, 2.2)}Copy message</button></div>
      ${d.demo ? '<p class="iv-demo">Demo numbers. In the live app this shows your real friends.</p>' : ''}
      <div class="iv-stats">
        <div><b class="num">${fmt(s.invited)}</b><small>Invited</small></div><div><b class="num">${fmt(s.joined)}</b><small>Connected</small></div>
        <div><b class="num">${fmt(s.trading ?? s.funded)}</b><small>Trading</small></div><div class="iv-earn"><b class="num">${fmt(s.earned)}</b><small>Coins earned</small></div>
      </div>
      ${s.held ? `<div class="iv-heldbar">${ic('lock', 16, 2.4)}<span><b class="num">${fmt(s.held)} coins reserved</b> for you. They land when your friends take ${r.minTrades || 5} trades each.</span></div>` : ''}
      <section class="card iv-mile">
        <div class="iv-mh"><b>${nx ? `${nx.left} more trading friend${nx.left === 1 ? '' : 's'} → +${fmt(nx.coins)} bonus` : 'All bonuses unlocked 🏆'}</b><span class="num">${fmt(s.trading ?? s.funded)}/${fmt(nx ? nx.friends : last)}</span></div>
        <div class="iv-bar"><i style="width:${Math.max(4, Math.min(100, pct))}%"></i></div>
        <div class="iv-steps">${M.map(([n, c]) => `<span class="${(s.trading ?? s.funded) >= n ? 'on' : ''}"><b>${n}</b> friends<em>+${fmt(c)}</em></span>`).join('')}</div>
      </section>
      <div class="sech"><h2>How it works</h2></div>
      <section class="card iv-how">
        <div><i>1</i><span><b>Share your link</b><small>On Telegram, WhatsApp, your status, anywhere.</small></span></div>
        <div><i>2</i><span><b>Your friend opens Zubabot</b><small>New people only. They start their 3 months free and connect IQ Option.</small></span></div>
        <div><i>3</i><span><b>They fund and take ${r.minTrades || 5} trades, you both win</b><small>$${r.min}–$${(r.big || 100) - 1} in their first ${r.windowH || 24} hours: +${fmt(r.ftd)} for you, +${fmt(r.friend)} for them. $${r.big || 100}+: ${r.per || 5} coins per $1 for you (up to ${fmt(r.cap || 0)}) and ${r.fper || 2} per $1 for them (up to ${fmt(r.fcap || 0)}). After that, ${Math.round(r.share * 100)}% of the coins they earn on every deposit, for life.</small></span></div>
      </section>
      <div class="sech"><h2>Your friends</h2>${s.invited ? `<span class="dim" style="font-size:13px">${fmt(s.pending)} coins waiting</span>` : ''}</div>
      <section class="card iv-list">${d.friends.length ? d.friends.map((f, i) => `<div class="iv-fr"><span class="iv-av" style="background:${HUES[i % HUES.length]}">${esc(init(f.name))}</span>
          <span class="iv-fn"><b>${esc(f.name)}</b><small>${f.status === 'funded' && f.firstDay ? `$${fmt(f.firstDay)} first day${f.hoursLeft ? ` · ${f.hoursLeft}h left to earn more` : ''}` : ago(f.at)}</small></span><span class="iv-st ${ST[f.status][1]}">${f.status === 'funded' ? `Funded · ${f.trades || 0}/${r.minTrades || 5} trades` : ST[f.status][0]}</span>${f.coins ? `<span class="iv-fc num">+${fmt(f.coins)}</span>` : f.held ? `<span class="iv-fc iv-held num" title="Reserved until ${r.minTrades || 5} trades">${fmt(f.held)}</span>` : ''}</div>`).join('')
        : `<div class="iv-empty">${ic('user', 26, 2)}<b>No friends yet</b><small>Share your link. Every friend who funds earns you up to +${fmt(r.cap || r.ftd)} coins.</small></div>`}</section>
      <p class="iv-fine">Coins are reserved when IQ Option confirms each deposit and land in your wallet once your friend has taken ${r.minTrades || 5} real trades. The first 24 hours start at your friend's first deposit. Your friend must be new to Zubabot and open your link first. Withdrawing and re-depositing doesn't count. Coins can't be withdrawn or swapped for cash: you spend them to unlock AI traders in the marketplace.</p>
    </div>`;
  };

  /* entry points: side menu, home card, wallet row, deep link ?go=invite */
  const _dr = drawer;
  drawer = function () { _dr(); const o = $('ovl'); if (!o) return;
    o.querySelectorAll('.mi').forEach((m) => { if (/Invite friends/.test(m.textContent)) { m.setAttribute('onclick', "closeOvl();go('invite')"); if (!m.querySelector('.iv-tag')) m.insertAdjacentHTML('beforeend', `<span class="iv-tag">up to +${fmt(D().rules.cap || D().rules.ftd)}</span>`); } }); };
  const card = () => { const d = D(); return `<button class="iv-home" onclick="go('invite')"><span class="iv-hi">${ic('gift', 22, 2.2)}</span><span class="iv-htx"><b>Invite friends, earn up to ${fmt(d.rules.cap || d.rules.ftd)} coins each</b><small>${d.stats.funded ? `${fmt(d.stats.earned)} coins earned so far` : 'They get bonus coins too'}</small></span>${ic('right', 18, 2.4)}</button>`; };
  const _h = VIEWS.home;
  VIEWS.home = () => { let h = _h(); if (!activated || !activated()) return h; const i = h.indexOf('<button class="livecard"'); const c = card();
    return i > 0 ? h.slice(0, i) + c + h.slice(i) : h; };
  const _w = VIEWS.wallet;
  VIEWS.wallet = () => { const h = _w(); const i = h.indexOf('<section class="card"'); return i > 0 ? h.slice(0, i) + card() + h.slice(i) : h + card(); };
  try { const g = new URLSearchParams(location.search).get('go'); if (g === 'invite') setTimeout(() => { if (S.ob >= 9) go('invite'); }, 2000); } catch (e) {}
  setTimeout(load, 2500);

  const st = document.createElement('style'); st.textContent = `
  .iv-by{display:flex;gap:10px;align-items:center;margin-top:10px;padding:12px 14px;border-radius:16px;background:#FFF6CC;color:#5A4400;font-size:13.5px;line-height:1.4}
  .iv-hero{position:relative;margin-top:14px;border-radius:28px;padding:22px 20px;min-height:200px;overflow:hidden;background:radial-gradient(120% 90% at 100% 0%,#FFE97A 0%,#FFD21F 42%,#FFB300 100%);box-shadow:0 22px 44px -22px rgba(255,170,0,.95);display:flex;gap:6px}
  .iv-ht{position:relative;z-index:2;flex:1;min-width:0}
  .iv-ht small{font:800 11px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.14em;color:#5A4400}
  .iv-ht h1{font-size:28px;line-height:1.02;font-weight:800;letter-spacing:-.04em;margin-top:10px;color:#0F1222}
  .iv-ht h1 .num{font-size:40px;display:inline-block;margin-bottom:2px}
  .iv-ht p{font-size:13px;line-height:1.45;color:#3E2F00;margin-top:10px;max-width:220px}
  .iv-orbit{position:relative;flex:none;width:132px;height:160px;margin-right:-8px}
  .iv-orbit img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}
  .iv-ring{position:absolute;left:-14px;top:0;width:160px;height:160px;animation:ivSpin 18s linear infinite}
  .iv-ring circle{fill:none;stroke:rgba(15,18,34,.28);stroke-width:1.6;stroke-dasharray:4 7}
  .iv-me{position:absolute;left:36px;top:50px;width:60px;height:60px;border-radius:50%;box-shadow:0 0 0 3px #0F1222,0 10px 22px rgba(0,0,0,.25);z-index:2;background:#FFF}
  .iv-f{position:absolute;width:38px;height:38px;border-radius:50%;box-shadow:0 0 0 2.5px #FFF,0 6px 14px rgba(0,0,0,.2);animation:ivBob 3.2s ease-in-out infinite}
  .iv-f0{left:52px;top:-2px}.iv-f1{left:98px;top:60px;animation-delay:-.8s}.iv-f2{left:52px;top:124px;animation-delay:-1.6s}.iv-f3{left:-6px;top:62px;animation-delay:-2.4s}
  .iv-c{position:absolute;width:20px;height:20px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFF6B0,#FFC300 55%,#C88A00);box-shadow:0 0 0 2px rgba(90,68,0,.25);animation:ivCoin 2.6s ease-in infinite;opacity:0}
  .iv-c0{left:84px;top:40px}.iv-c1{left:30px;top:44px;animation-delay:-.9s}.iv-c2{left:70px;top:108px;animation-delay:-1.7s}
  @keyframes ivSpin{to{transform:rotate(360deg)}}
  @keyframes ivBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
  @keyframes ivCoin{0%{opacity:0;transform:translateY(8px) scale(.6)}20%{opacity:1}100%{opacity:0;transform:translateY(-34px) scale(1)}}
  .iv-link{display:flex;align-items:center;gap:10px;margin-top:14px;padding:12px 12px 12px 16px}
  .iv-lt{flex:1;min-width:0}.iv-lt small{display:block;font-size:12px;color:var(--dim);font-weight:700}
  .iv-lt code{display:block;font:600 13.5px/1.4 'JetBrains Mono',ui-monospace,monospace;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}
  .iv-copy{flex:none;display:flex;align-items:center;gap:6px;height:44px;padding:0 14px;border-radius:14px;background:#0F1222;color:#FFD21F;font-weight:800;font-size:14px;transition:transform .15s}
  .iv-copy:active{transform:scale(.96)}.iv-copy.done{background:#14B871;color:#FFF}.iv-copy.done span{font-size:0}.iv-copy.done span::after{content:'Copied';font-size:14px}
  .btn.iv-go{margin-top:10px;height:60px;font-size:17px;display:flex;align-items:center;justify-content:center;gap:10px}
  .iv-alt{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
  .iv-alt button{height:46px;border-radius:15px;background:#FFF;border:1px solid var(--line);font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;gap:7px;color:var(--ink)}
  .iv-demo{margin-top:10px;font-size:12px;color:var(--dim);text-align:center}
  .iv-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:14px}
  .iv-stats>div{background:#FFF;border:1px solid var(--line);border-radius:18px;padding:12px 6px;text-align:center}
  .iv-stats b{display:block;font-size:22px;font-weight:800;letter-spacing:-.03em}.iv-stats small{display:block;font-size:11px;color:var(--dim);font-weight:700;margin-top:2px}
  .iv-stats .iv-earn{background:#0F1222;border-color:#0F1222}.iv-earn b{color:#FFD21F}.iv-earn small{color:#B8BCCB}
  .iv-mile{margin-top:12px;padding:16px}
  .iv-mh{display:flex;justify-content:space-between;gap:10px;align-items:baseline;font-size:14px}.iv-mh span{font-weight:800;color:var(--dim)}
  .iv-bar{height:10px;border-radius:99px;background:#F1F1EC;margin-top:10px;overflow:hidden}.iv-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#FFC300,#FF8A00)}
  .iv-steps{display:flex;gap:6px;margin-top:12px}
  .iv-steps span{flex:1;border-radius:14px;padding:8px 6px;background:#F7F7F2;text-align:center;font-size:11.5px;color:var(--dim);font-weight:700}
  .iv-steps b{font-size:15px;color:var(--ink)}.iv-steps em{display:block;font-style:normal;font-weight:800;color:#5A4400;margin-top:2px}
  .iv-steps span.on{background:#FFF1B3}.iv-steps span.on em::after{content:' ✓'}
  .iv-how{padding:6px 16px}
  .iv-how>div{display:flex;gap:12px;padding:12px 0;border-top:1px solid var(--line)}.iv-how>div:first-child{border-top:0}
  .iv-how i{flex:none;width:30px;height:30px;border-radius:10px;background:#0F1222;color:#FFD21F;font:800 14px/30px 'JetBrains Mono',monospace;text-align:center;font-style:normal}
  .iv-how b{display:block;font-size:14.5px}.iv-how small{display:block;font-size:13px;line-height:1.45;color:var(--dim);margin-top:2px}
  .iv-list{padding:4px 14px}
  .iv-fr{display:flex;align-items:center;gap:10px;padding:11px 0;border-top:1px solid var(--line)}.iv-fr:first-child{border-top:0}
  .iv-av{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#0F1222}
  .iv-fn{flex:1;min-width:0}.iv-fn b{display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.iv-fn small{font-size:12px;color:var(--dim)}
  .iv-st{flex:none;font-size:11.5px;font-weight:800;padding:5px 9px;border-radius:99px}
  .iv-s1{background:#F1F1EC;color:#6B6F80}.iv-s4{background:#FFF1B3;color:#5A4400}.iv-held{color:var(--dim)!important}.iv-held::before{content:'🔒 '}
  .iv-heldbar{display:flex;gap:10px;align-items:center;margin-top:10px;padding:12px 14px;border-radius:16px;background:#F7F7F2;font-size:13px;line-height:1.4;color:var(--ink)}.iv-s2{background:#E5EEFF;color:#2D5BD8}.iv-s3{background:#DDF7EA;color:#0D8A52}
  .iv-fc{flex:none;font-weight:800;font-size:14px;color:#5A4400}
  .iv-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:22px 10px;color:var(--dim)}.iv-empty b{color:var(--ink)}.iv-empty small{font-size:13px;max-width:260px}
  .iv-fine{font-size:12px;line-height:1.5;color:var(--dim);margin:14px 4px 0}
  .iv-tag{margin-left:auto;font-size:11.5px;font-weight:800;padding:3px 8px;border-radius:99px;background:#FFF1B3;color:#5A4400}
  .iv-home{display:flex;align-items:center;gap:12px;width:100%;margin-top:14px;padding:12px 14px;border-radius:20px;background:#FFF;border:1px solid var(--line);box-shadow:var(--sh);text-align:left;color:var(--ink)}
  .iv-hi{flex:none;width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(160deg,#FFDF4D,#FFC300);color:#0F1222}
  .iv-htx{flex:1;min-width:0}.iv-htx b{display:block;font-size:14.5px}.iv-htx small{font-size:12.5px;color:var(--dim)}
  @media (max-width:370px){.iv-orbit{transform:scale(.85);transform-origin:right top;margin-left:-16px}.iv-ht h1{font-size:25px}.iv-stats b{font-size:19px}}
  @media (prefers-reduced-motion:reduce){.iv-ring,.iv-f,.iv-c{animation:none!important}.iv-c{opacity:0}}
  `; document.head.appendChild(st);
})();
