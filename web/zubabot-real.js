/* ===================== v19: white app + realistic AI traders + living AI cloud =====================
   - Every AI trader gets a photoreal studio portrait (warm gold rim light, white background).
   - ZORB(): a soft gold "cloud" that breathes behind the AI's face and shakes while the AI talks.
   - Page background is white; cards sit on white with hairline borders and soft shadows. */
(function () {
  __ZB_NEWAIS__
  const PHOTOS = window.ZB_PHOTOS = __ZB_PHOTOS__;
  for (const k in PHOTOS) if (AIS[k]) AIS[k].f = Object.assign({}, AIS[k].f, {img: PHOTOS[k]});
  if (AIS.zara) AIS.zara.name = 'Zuri';                          // avoid two "Zara"s (Zara is the main AI, key luna)

  /* the AI cloud */
  window.ZORB = (f, size, talk, cls = '') => `<span class="zorb ${talk ? 'talk' : ''} ${cls}" style="width:${size}px;height:${size}px"><span class="zo-w"><i class="zo1"></i><i class="zo2"></i><i class="zo3"></i></span><span class="zo-ph" style="width:${Math.round(size * .74)}px;height:${Math.round(size * .74)}px">${face(f, Math.round(size * .74))}</span></span>`;
  // the cloud "speaks" every few seconds wherever it's on screen
  setInterval(() => { document.querySelectorAll('.zorb.idle').forEach((o) => { o.classList.add('talk'); setTimeout(() => o.classList.remove('talk'), 2600); }); }, 9000);

  /* home hero: Zara inside her cloud instead of the flat halo */
  const _home = VIEWS.home;
  VIEWS.home = () => {
    let h = _home(); const ai = AI();
    h = h.replace(/<div class="halo"[\s\S]*?<\/div>/, `<div class="zf-orbwrap">${ZORB(ai.f, 168, 0, 'idle')}</div>`);
    h = h.replace(/<div class="zf-hrow">\s*<span class="face[\s\S]*?<\/span>/, `<div class="zf-hrow">${ZORB(ai.f, 84, 0, 'idle')}`);
    return h;
  };
  /* funnel: Zara speaks from her cloud */
  const swapSay = () => { document.querySelectorAll('.zf-say').forEach((b) => { const f = b.querySelector(':scope > .face'); if (f) f.outerHTML = ZORB(AI().f, 60, 1); }); };
  new MutationObserver(swapSay).observe(document.body, {childList: true, subtree: true});

  const st = document.createElement('style'); st.textContent = `
  :root{--bg:#FFFFFF;--soft:#F4F5F7;--line:#ECEDF1;--line2:#E1E3E8;--sh:0 1px 2px rgba(15,18,34,.04),0 8px 24px -14px rgba(15,18,34,.14)}
  html,body,.app{background:#FFFFFF}
  .card{background:#FFFFFF}
  .dock{background:rgba(255,255,255,.94)}
  .sheet,.zf-sh{background:#FFFFFF}
  .face img{object-fit:cover;object-position:50% 30%}
  .face:has(> img){box-shadow:0 0 0 1.5px #F1E2A6,0 6px 16px -10px rgba(120,90,0,.5)}
  .zo-ph .face{box-shadow:none!important}
  .face.ai::after{display:none}
  /* AI cloud */
  .zorb{position:relative;display:inline-grid;place-items:center;flex:none;vertical-align:middle}
  .zo-w{position:absolute;inset:-6%;animation:zoWob 5s ease-in-out infinite}
  .zo-w i{position:absolute;inset:0;border-radius:50%}
  .zo1{background:conic-gradient(from 0deg,#FFD21F,#FFF4C2,#FFB300,#FFE57A,#FFC94D,#FFD21F);filter:blur(7px);opacity:1;animation:zoSpin 8s linear infinite;box-shadow:0 0 40px 6px rgba(255,200,30,.45)}
  .zo2{inset:7%!important;background:conic-gradient(from 120deg,rgba(255,255,255,0),rgba(255,255,255,.95) 18%,rgba(255,255,255,0) 40%,rgba(255,190,40,.9) 62%,rgba(255,255,255,0) 80%);filter:blur(7px);mix-blend-mode:screen;animation:zoSpin 5s linear infinite reverse}
  .zo3{inset:-18%!important;background:radial-gradient(circle,rgba(255,210,31,.5),rgba(255,210,31,0) 66%);animation:zoBreath 3.2s ease-in-out infinite}
  .zo-ph{position:relative;border-radius:50%;overflow:hidden;box-shadow:0 0 0 3px #FFFFFF,0 14px 30px -12px rgba(150,100,0,.55)}
  .zo-ph .face{width:100%!important;height:100%!important}
  .zorb.talk .zo-w{animation:zoShake .26s ease-in-out infinite alternate}
  .zorb.talk .zo1{animation-duration:2.2s;filter:blur(8px)}
  .zorb.talk .zo3{animation:zoPulse .5s ease-out infinite}
  @keyframes zoSpin{to{transform:rotate(360deg)}}
  @keyframes zoWob{0%,100%{transform:scale(1);border-radius:50%}30%{transform:scale(1.05) translate(1.5%,-1%)}60%{transform:scale(.97) translate(-1%,1.5%)}}
  @keyframes zoShake{0%{transform:scale(.96) translate(-1.5%,1%) rotate(-3deg)}100%{transform:scale(1.13) translate(1.5%,-1%) rotate(4deg)}}
  @keyframes zoBreath{0%,100%{transform:scale(.95);opacity:.7}50%{transform:scale(1.08);opacity:1}}
  @keyframes zoPulse{0%{transform:scale(.9);opacity:1}100%{transform:scale(1.3);opacity:0}}
  .zf-orbwrap{display:flex;justify-content:center;margin-top:14px}
  .zf-hrow .zorb{margin:-6px}
  @media (prefers-reduced-motion:reduce){.zo-w,.zo1,.zo2,.zo3{animation:none!important}}
  `; document.head.appendChild(st);
})();
