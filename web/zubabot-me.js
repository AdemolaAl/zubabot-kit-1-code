/* ===================== v22: real-looking 3D avatars, Star Trader look, Zubabot "market pulse" mark =====================
   - 24 semi-realistic 3D avatars (12 men, 12 women): hijab, gele, cap, glasses, suit, kaftan and fila, braids, locs...
   - Star Traders get a gold animated ring + crown on their own avatar, and a gold name with a star.
   - The generic green "online" dot is replaced by Zubabot's own mark: three tiny gold bars pulsing like live candles. */
(function () {
  const A = (p, n) => Array.from({length: n}, (_, i) => ({img: `avatars/${p}${i}.jpg`}));
  USERS.man.length = 0; USERS.man.push(...A('m', 12));
  USERS.woman.length = 0; USERS.woman.push(...A('w', 12));
  if (!(S.face < 12)) S.face = 0;
  // mark the user's own avatar (so only it gets the Star Trader look)
  const markMe = () => { for (const g of ['man', 'woman']) USERS[g].forEach((f, i) => { f.img = f.img.replace('#me', '') + (g === S.gender && i === S.face ? '#me' : ''); }); };
  markMe();
  const star = () => { if (window.ZB_FORCE_STAR) return true; try { return isStar(); } catch (e) { return false; } };
  let busy = false;
  const deco = () => {
    if (busy) return; busy = true;
    try {
      markMe(); const on = star(); document.body.classList.toggle('zb-star', on);
      document.querySelectorAll('img[src$="#me"]').forEach((im) => { const f = im.closest('.face'); if (f && !f.classList.contains('me-av')) f.classList.add('me-av'); });
      if (on) { const nm = String(NAME()).trim();
        document.querySelectorAll('#view .serif, #ovl .serif, .zf-nm span, .me-name').forEach((el) => { if (el.textContent.trim() === nm && !el.classList.contains('star-name')) { el.classList.add('star-name'); el.insertAdjacentHTML('beforeend', '<i class="star-ic" aria-label="Star Trader">★</i>'); } }); }
    } finally { busy = false; }
  };
  new MutationObserver(() => { clearTimeout(deco.t); deco.t = setTimeout(deco, 30); }).observe(document.body, {childList: true, subtree: true});
  // New trade: the BUY/SELL bar lives at the bottom of the screen (where the menu bar is), never over the form
  const pinBar = () => {
    const app = document.getElementById('app'), inView = document.querySelector('#view .nt-bar'), old = document.getElementById('ntBarFixed');
    if (inView) { if (old) old.remove(); inView.id = 'ntBarFixed'; app.appendChild(inView); document.body.classList.add('nt-on'); }
    else if (!document.querySelector('#view .nt')) { if (old) old.remove(); document.body.classList.remove('nt-on'); }
  };
  new MutationObserver(pinBar).observe(document.getElementById('view') || document.body, {childList: true, subtree: true});
  setInterval(deco, 3000);

  const st = document.createElement('style'); st.textContent = `
  /* avatar: the 3D faces fill the circle */
  .face img[src*="avatars/"]{object-fit:cover;object-position:50% 30%}
  /* Star Trader: gold ring that slowly turns + a crown */
  .zb-star .face.me-av{overflow:visible!important;background:transparent}
  .zb-star .face.me-av img{border-radius:50%;position:relative;z-index:1;box-shadow:0 0 0 2px #FFF}
  .zb-star .face.me-av::before{content:"";position:absolute;inset:-4px;border-radius:50%;background:conic-gradient(from 0deg,#FFF3B0,#FFC300,#FF9F1C,#FFE57A,#FFC300,#FFF3B0);animation:meSpin 4s linear infinite;z-index:0;box-shadow:0 0 18px rgba(255,195,0,.55)}
  .zb-star .face.me-av::after{content:"";position:absolute;right:-8%;top:-14%;width:42%;height:42%;min-width:14px;min-height:14px;z-index:2;border-radius:50%;
    background:#0F1222 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23FFD21F' d='M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 11H5z'/%3E%3C/svg%3E") center/62% no-repeat;box-shadow:0 0 0 2px #FFF}
  @keyframes meSpin{to{transform:rotate(360deg)}}
  .star-name{background:linear-gradient(100deg,#B88400,#FFC300 40%,#FF9F1C 60%,#B88400);-webkit-background-clip:text;background-clip:text;color:transparent!important;background-size:200% 100%;animation:meShine 3.5s linear infinite}
  .star-name .star-ic{font-style:normal;-webkit-text-fill-color:#FFC300;color:#FFC300;font-size:.55em;margin-left:6px;vertical-align:super;font-family:system-ui}
  @keyframes meShine{to{background-position:-200% 0}}
  /* Zubabot market-pulse mark (replaces the generic green dot) */
  .ping,.ap-st i,.ap-who small i{width:13px!important;height:11px!important;border-radius:0!important;flex:none;display:inline-block;
    background:linear-gradient(#FFC300,#FFC300) 0 100%/3px 45% no-repeat,linear-gradient(#FFC300,#FFC300) 5px 100%/3px 100% no-repeat,linear-gradient(#FFC300,#FFC300) 10px 100%/3px 65% no-repeat!important;
    animation:zbPulse 1.3s ease-in-out infinite;filter:drop-shadow(0 0 4px rgba(255,195,0,.45))}
  .ping::after{display:none!important}
  @keyframes zbPulse{0%,100%{background-size:3px 45%,3px 100%,3px 65%}33%{background-size:3px 100%,3px 55%,3px 85%}66%{background-size:3px 70%,3px 80%,3px 40%}}

  /* ---- New trade: cleaner type, easy amount, BUY/SELL always on screen ---- */
  .mt-tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;flex-wrap:nowrap!important}
  .mt-tabs button{white-space:nowrap;font-size:14px;font-weight:800;letter-spacing:-.01em}
  .nt{font-feature-settings:"ss01","cv11";padding-bottom:6px}
  .nt .nt-st{margin:16px 0 8px;align-items:center;gap:9px}
  .nt .nt-st b{font-size:16px;font-weight:800;letter-spacing:-.025em}
  .nt .nt-st small{flex-basis:100%;margin-left:31px;margin-top:-2px;font-size:12.5px;font-weight:600;color:var(--dim);letter-spacing:0}
  .nt .nt-pn b{font-size:18px;font-weight:800;letter-spacing:-.03em}.nt .nt-pn small{font-size:12.5px;font-weight:600;color:var(--dim)}
  .nt .nt-seg button{font-size:13px;font-weight:700;color:var(--dim);letter-spacing:-.01em}.nt .nt-seg button b{font-size:19px;font-weight:800;color:var(--ink);letter-spacing:-.03em}
  .nt .nt-seg button.on,.nt .nt-seg button.on b{color:#FFF}
  .num,.nt input{font-variant-numeric:tabular-nums}
  .nt-in{display:flex;align-items:stretch;gap:8px;cursor:text}
  .nt-in>button{width:54px;flex:none;border-radius:18px;background:var(--soft);font-size:24px;font-weight:700;color:var(--ink)}
  .nt-box{flex:1;min-width:0;border:2px solid var(--ink);border-radius:18px;padding:8px 14px 6px;background:#FFF;display:flex;flex-direction:column;align-items:center;box-shadow:0 6px 18px -12px rgba(15,18,34,.4);transition:box-shadow .2s,border-color .2s}
  .nt-box:focus-within{border-color:#FFC300;box-shadow:0 0 0 4px rgba(255,210,31,.35)}
  .nt-box small{font-size:11px;font-weight:800;color:var(--dim);text-transform:uppercase;letter-spacing:.06em}
  .nt-iv{display:flex;align-items:baseline;justify-content:center;gap:1px;width:100%}
  .nt-iv i{font-style:normal;font-size:24px;font-weight:800;color:var(--dim)}
  .nt-iv input{min-width:1.6ch;max-width:200px;border:0;outline:0;background:transparent;text-align:center;font:inherit;font-size:34px;font-weight:800;letter-spacing:-.04em;color:var(--ink);padding:0}
  .nt-chips2{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:9px}
  .nt-chips2 button{height:42px;border-radius:13px;background:var(--soft);font-weight:800;font-size:15px;letter-spacing:-.02em;color:var(--ink)}
  .nt-chips2 button.on{background:#FFD21F;box-shadow:0 6px 14px -8px rgba(255,180,0,.9)}
  .nt-chips2 button[data-v="max"]{background:#0F1222;color:#FFD21F}
  .nt-warn{font-size:12.5px;font-weight:700;color:#C7323C;margin-top:6px;text-align:center}
  .nt .nt-gale{padding:10px 12px}.nt .nt-gt b{font-size:14.5px;font-weight:800}.nt .nt-gt small{font-size:12px}
  body.nt-on .dock{display:none}
  .nt{padding-bottom:150px!important}
  #ntBarFixed{position:absolute;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:31;margin:0;padding:10px;border-radius:24px;background:rgba(255,255,255,.96);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid var(--line);box-shadow:0 -6px 30px -14px rgba(15,18,34,.35)}
  .nt-bs{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;color:var(--dim);font-weight:600;padding:0 4px 8px}
  .nt-bs b{color:var(--ink);font-weight:800}
  .nt-bar .nt-dir button{min-height:62px;border-radius:18px}
  .nt-bar .nt-dir b{font-size:20px;letter-spacing:-.02em}.nt-bar .nt-dir small{font-size:12px;opacity:.92}
    .ap-q:has(.ap-find){display:block!important}
  .ap-q button.ap-find{border:0!important;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;height:58px;border-radius:20px;background:linear-gradient(135deg,#FFE45C,#FFC300)!important;color:#0F1222!important;font-weight:800;font-size:17px;letter-spacing:-.02em;position:relative;overflow:hidden;box-shadow:0 14px 30px -14px rgba(255,180,0,.95);animation:apFind 2.6s ease-in-out infinite}
  @keyframes apFind{50%{transform:scale(1.02);box-shadow:0 18px 36px -12px rgba(255,180,0,1)}}
  .ap-who small{color:var(--ink2,#4A4E5C)!important}
  .tmark{flex:none;display:inline-block;vertical-align:middle;filter:drop-shadow(0 1px 1.5px rgba(15,18,34,.25))}
  .tm-max{animation:tmGlow 2.8s ease-in-out infinite}@keyframes tmGlow{50%{filter:drop-shadow(0 0 5px rgba(255,180,0,.85))}}
  .mode{gap:6px!important}
  /* mode pills: cream (Standard), emerald (Advanced), black + gold (Pro), solid gold with a moving shine (MAX) */
  .mode.standard{background:#FFF4CC!important;color:#5A4400!important;box-shadow:inset 0 0 0 1px #F0D77A}
  .mode.ondark.standard{background:rgba(255,228,92,.14)!important;color:#FFE57A!important;box-shadow:inset 0 0 0 1px rgba(255,210,31,.35)}
  .mode.max{background:linear-gradient(110deg,#FFC300 0%,#FFE57A 35%,#FFC300 50%,#FF9F1C 100%)!important;background-size:250% 100%!important;color:#0F1222!important;box-shadow:inset 0 0 0 1px rgba(154,106,0,.55),0 6px 16px -8px rgba(255,160,0,.9);animation:maxShine 3.2s linear infinite!important}
  @keyframes maxShine{to{background-position:-250% 0}}.aitag{display:inline-flex;align-items:center;gap:4px}
  /* small phones: keep the whole home header on screen */
  @media (max-width:389px){header.top{gap:4px}header.top>div{gap:5px!important}header.top .icb{width:37px!important;height:37px!important;border-radius:13px!important}
    header.top .me-av{width:36px!important;height:36px!important}header.top .pill{padding:0 7px!important;gap:4px!important;font-size:12.5px!important;height:38px!important;letter-spacing:-.02em}header.top .pill svg,header.top .pill img,header.top .pill .coin,header.top .pill span[class*=tok]{width:18px!important;height:18px!important}header.top .pill i,header.top .pill .sep{margin:0 2px!important}header.top>div+div{gap:5px!important}}
  @media (max-width:340px){header.top .pill>*:nth-child(n+3){display:none!important}}
  .zb-own{display:flex;gap:7px;align-items:flex-start;margin-top:9px;font-size:12.5px;line-height:1.45;color:#3E4256;text-align:left}.zb-own svg{flex:none;margin-top:2px;color:#14B871}.zb-own b{color:var(--ink)}
  /* accept button: big, bold, with a hand telling them to tap */
  .acc-wrap{position:relative;margin-top:18px;padding-bottom:30px}
  .btn.acc-big{height:84px!important;border-radius:26px!important;font-size:0!important;display:flex;align-items:center;justify-content:center;gap:16px;padding:0 22px!important;
    box-shadow:0 18px 40px -14px rgba(255,170,0,.95),0 0 0 4px rgba(255,210,31,.28)!important;animation:accPulse 1.8s ease-in-out infinite}
  .acc-t{display:flex;flex-direction:column;align-items:flex-start;line-height:1;font:900 30px/1 'Plus Jakarta Sans',system-ui,sans-serif;letter-spacing:-.03em;color:#0F1222}
  .acc-t small{font-size:14px;font-weight:700;letter-spacing:0;margin-top:5px;opacity:.75}
  .acc-go{width:50px;height:50px;border-radius:50%;background:#0F1222;color:#FFD21F;display:grid;place-items:center;margin-left:auto}
  .acc-hand{position:absolute;right:34px;bottom:-6px;font-size:46px;line-height:1;pointer-events:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.25));animation:accHand 1.8s ease-in-out infinite;transform-origin:50% 10%}
  .acc-tip{position:absolute;right:88px;bottom:6px;font:800 12px 'Plus Jakarta Sans',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#0F1222;background:#FFD21F;padding:5px 9px;border-radius:8px;animation:accTip 1.8s ease-in-out infinite}
  @keyframes accPulse{0%,100%{transform:scale(1)}45%{transform:scale(1.035)}55%{transform:scale(.985)}}
  @keyframes accHand{0%,100%{transform:translate(0,0) rotate(-8deg)}45%{transform:translate(-8px,-26px) rotate(-14deg)}55%{transform:translate(-8px,-20px) rotate(-14deg) scale(.92)}}
  @keyframes accTip{0%,100%{opacity:1}50%{opacity:.6}}
  @media (prefers-reduced-motion:reduce){.tm-max{animation:none}.ap-find{animation:none}.acc-big,.acc-hand,.acc-tip{animation:none!important}.ping,.ap-st i,.ap-who small i,.zb-star .face.me-av::before,.star-name{animation:none!important}}
  `; document.head.appendChild(st);
})();
