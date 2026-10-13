/* ===================== Languages: the whole app in the person's language =====================
   How it works
   - The language comes from the link (?l=es from the bot's buttons and the mini app link), then from the server
     (the funnel the person came from). English needs nothing.
   - i18n/<lang>.js (loaded in <head>, before the first paint) holds the translations and the local AI traders.
   - Every text on screen is translated as it appears: numbers, money and names are taken out first
     ("You won $8.70, Tobi" -> "You won {0}, {1}"), so one translation covers every amount and every name.
   - Anything new that has no translation yet is sent to the server; the AI translates it in a few seconds, it is saved,
     and from then on it's instant for everyone (and editable in Admin -> Languages).
   - Chat bubbles (AI replies, your own messages) are never sent for translation: the AI already writes in your language. */
(function () {
  const I = window.ZB_I18N || {};
  const lang = I.lang && I.lang !== 'en' ? I.lang : 'en';
  const API = () => (window.ZB_API || '').replace(/\/$/, '');
  const LIVE = () => !!(window.ZB_LIVEMODE && window.ZBAPI);
  const Z = window.ZBI18N = {lang, t: (x) => x, ready: true};
  try { localStorage.setItem('zb_lang', lang); } catch (e) {}

  // the server knows the person's funnel language: if it differs from this page, reload once in the right language
  function checkServer() {
    if (!LIVE()) return;
    ZBAPI('/api/me').then((m) => {
      const want = m && m.lang ? m.lang : null; if (!want) return;
      const u = new URL(location.href); const preview = u.searchParams.get('preview') === '1';
      if (want !== lang && !preview && !sessionStorage.getItem('zb_lang_reload')) {
        try { sessionStorage.setItem('zb_lang_reload', '1'); localStorage.setItem('zb_lang', want); } catch (e) {}
        u.searchParams.set('l', want); location.replace(u.toString());
      }
    }).catch(() => {});
  }
  setTimeout(checkServer, 1500);

  /* ---------- Region & language (side menu): switch any time, switch back any time ---------- */
  const REGIONS = {en: ['🌍', 'English', 'Global'], pt: ['🇧🇷', 'Português', 'Brasil'], es: ['🌎', 'Español', 'Latinoamérica'], tl: ['🇵🇭', 'Taglish', 'Pilipinas'], fr: ['🇫🇷', 'Français', 'Francophone'], th: ['🇹🇭', 'ไทย', 'ประเทศไทย']};
  let LIVE_LANGS = LIVE() ? ['en'] : Object.keys(REGIONS);
  if (LIVE()) ZBAPI('/api/app/config').then((c) => { if (c && Array.isArray(c.langs)) LIVE_LANGS = ['en', ...c.langs.filter((l) => l !== 'en' && REGIONS[l])]; }).catch(() => {});
  Z.regions = () => LIVE_LANGS;
  window.regionSheet = function () {
    const rows = LIVE_LANGS.map((k) => { const r = REGIONS[k]; return `<button class="zr-row ${k === lang ? 'on' : ''}" onclick="regionPick('${k}')" data-noi18n><span class="zr-fl">${r[0]}</span><span class="zr-t"><b>${r[1]}</b><small>${r[2]}</small></span>${k === lang ? '<span class="zr-ck">✓</span>' : ''}</button>`; }).join('');
    sheet(`<h2 style="font-size:22px;font-weight:800">Region & language</h2><p class="dim" style="font-size:13.5px;margin-top:4px">Pick where you trade from. You can switch back any time.</p><div class="zr-list">${rows}</div>`);
  };
  window.regionPick = function (k) {
    if (k === lang) { try { closeOvl(); } catch (e) {} return; }
    const r = REGIONS[k];
    sheet(`<div style="text-align:center"><div style="font-size:46px">${r[0]}</div><h2 style="font-size:21px;font-weight:800;margin-top:6px">Switch to <span data-noi18n>${r[2]} · ${r[1]}</span>?</h2>
      <p class="dim" style="font-size:14px;margin-top:8px;line-height:1.45">Switching changes your app language, your AI traders and your training videos. Your account, deposits, coins and trades stay the same. You can switch back any time.</p>
      <button class="btn sun" style="margin-top:18px" onclick="regionGo('${k}')"><span class="sw"></span>Switch</button><button class="btn" style="margin-top:8px;height:46px" onclick="regionSheet()">Not now</button></div>`);
  };
  window.regionGo = async function (k) {
    try { if (LIVE()) await ZBAPI('/api/app/lang', {lang: k}); } catch (e) { toast('Could not switch right now. Try again'); return; }
    try { localStorage.setItem('zb_lang', k); sessionStorage.setItem('zb_lang_reload', '1'); } catch (e) {}
    const u = new URL(location.href); u.searchParams.set('l', k); if (!LIVE()) u.hash = k; location.replace(u.toString()); setTimeout(() => location.reload(), 300);
  };
  if (typeof window.drawer === 'function') { const _dr = window.drawer; window.drawer = function () { const r = _dr.apply(this, arguments);
    const pane = document.querySelector('.drawer .pane'); if (pane && !pane.querySelector('.zr-mi')) { const R = REGIONS[lang] || REGIONS.en;
      const b = document.createElement('button'); b.className = 'mi zr-mi'; b.setAttribute('onclick', 'closeOvl();regionSheet()'); b.innerHTML = `<span class="mic" style="font-size:18px">${R[0]}</span>Region & language<span class="tag" style="margin-left:auto" data-noi18n>${R[1]}</span>`;
      const groups = pane.querySelectorAll('.mgrp'); const last = groups[groups.length - 1]; (last ? last : pane.lastElementChild).insertAdjacentElement(last ? 'beforebegin' : 'afterend', b); }
    return r; }; }
  { const st = document.createElement('style'); st.textContent = `.zr-list{margin-top:14px;display:grid;gap:8px}.zr-row{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border-radius:16px;border:1.5px solid #ECEEF3;background:#FFF;text-align:left;font:inherit;color:#0F1222;cursor:pointer}
    .zr-row.on{border-color:#0F1222;background:#FFFBEA}.zr-fl{font-size:26px;line-height:1}.zr-t{flex:1;min-width:0}.zr-t b{display:block;font-size:15.5px}.zr-t small{display:block;font-size:12.5px;color:#8A8FA3;margin-top:1px}.zr-ck{font-weight:900;font-size:18px}`; document.head.appendChild(st); }
  /* ---------- the lead mentor: the region's own (Roland is English only), or a funnel's own mentor ---------- */
  function mentorApply(MT, EN) {
    // never trust text that ends up inside the page: no tags, no quotes, photo only from our places or https
    const cl = (x, n) => String(x || '').replace(/[<>"'`{}]/g, '').slice(0, n);
    MT = {...MT, name: cl(MT.name, 40), role: cl(MT.role, 60), bio: cl(MT.bio, 300), photo: /^(\/api\/mphoto\?n=[a-z0-9-]+|mentors\/[a-z0-9_-]+\.(jpg|png|webp)|https:\/\/[^\s"'<>()`]+)$/i.test(String(MT.photo || '')) ? MT.photo : '',
      link: /^https:\/\/[^\s"'<>`]+$/.test(String(MT.link || '')) ? MT.link : '', times: (MT.times || []).filter((t) => /^\d{1,2}:\d{2}$/.test(String(t)))};
    if (!MT.name) return;
    try { const r = COACHES.roland; if (EN) EN[r.name] = MT.name; Z.mentorWas = r.name; r.name = MT.name; r.role = MT.role || r.role; r.bio = MT.bio || r.bio;
      if (MT.photo) { const ph = /^(https?:|data:)/.test(MT.photo) ? MT.photo : MT.photo.startsWith('/api/') ? API() + MT.photo : MT.photo; Z.photoWas = ROLAND_IMG; r.f = {img: ph}; ROLAND_IMG = ph; } } catch (e) {}
    if (MT.on && MT.times && MT.times.length) { try { RT_SLOTS = MT.times.map((t) => { const [h, m] = String(t).split(':').map(Number); return h + (m || 0) / 60; }).sort((a, b) => a - b); RT_OFF = +MT.offset || 0; RT_TZ = MT.tz || 'UTC';
      const l = RT_SLOTS.map(RTh); RT_ALL = (l.length > 1 ? l.slice(0, -1).join(', ') + ' & ' + l[l.length - 1] : l[0]) + ' ' + RT_TZ; COACHES.roland.when = RT_ALL; } catch (e) {} }
    if (MT.link) window.ZB_LIVE_URL = MT.link;
  }
  // English with a funnel mentor: every "Roland" on screen becomes that mentor, and the old photo becomes the new one
  function mentorSwapEN(MT) {
    const from = [...new Set([Z.mentorWas, 'Roland', MT.base].filter((x) => x && x !== MT.name))]; if (!from.length) return;
    const re = new RegExp('(^|[^\\p{L}])(' + from.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}])', 'gu');
    const fix = (n) => { const p = n.parentElement; if (!p || p.closest('.m.out,[data-noi18n],[contenteditable="true"],script,style,textarea')) return; re.lastIndex = 0; if (re.test(n.data)) { re.lastIndex = 0; n.data = n.data.replace(re, (a, pre) => pre + MT.name); } };
    const imgs = (root) => { if (!Z.photoWas || !root.querySelectorAll) return; root.querySelectorAll('img').forEach((im) => { if (im.getAttribute('src') === Z.photoWas) im.src = ROLAND_IMG; }); };
    const run = (root) => { if (!root) return; if (root.nodeType === 3) return fix(root); if (root.nodeType !== 1) return; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) fix(n);
      for (const a of ['placeholder', 'title', 'alt', 'aria-label']) root.querySelectorAll('[' + a + ']').forEach((el) => { const v = el.getAttribute(a); re.lastIndex = 0; if (re.test(v)) { re.lastIndex = 0; el.setAttribute(a, v.replace(re, (x, pre) => pre + MT.name)); } }); imgs(root); };
    new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'characterData') fix(m.target); else for (const nd of m.addedNodes) run(nd); } }).observe(document.documentElement, {subtree: true, childList: true, characterData: true});
    const go = () => run(document.body); if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }
  /* ---------- no lives (and no mentor) where there's no live mentor ---------- */
  function noLive(walkFn) {
    Z.noLive = true;
    try { window.livePop = function () {}; } catch (e) {}
    try { window.liveCard = function () { return ''; }; } catch (e) {}
    try { if (typeof SLIDES !== 'undefined') for (let i = SLIDES.length - 1; i >= 0; i--) if (/live/.test(String(SLIDES[i].go || ''))) SLIDES.splice(i, 1); } catch (e) {}
    try { if (typeof FQ !== 'undefined') for (let i = FQ.length - 1; i >= 0; i--) if (/Roland|live/i.test(JSON.stringify(FQ[i][2] || '')) && !/safe/i.test(FQ[i][0])) FQ.splice(i, 1); } catch (e) {}
    try { S.liveSeen = true; } catch (e) {}
    const _go = window.go; if (_go) window.go = function (v, ctx) { if (v === 'live') v = 'academy'; return _go.call(this, v, ctx); };
    if (window.ZC) { ZC.mentor = () => { try { closeOvl(); } catch (e) {} AIP && AIP.chat && AIP.chat(S.ai || 'luna'); }; ZC.maxPitch = () => upgradeSheet && upgradeSheet(); }
    const KEEP = Z.keepMentor;           // a funnel mentor with no lives keeps the mentor chat, only the lives go
    const MENTOR = () => { try { return COACHES.roland.name || 'Roland'; } catch (e) { return 'Roland'; } };
    const kill = (root) => {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll('[onclick*="go(\'live\')"],.livepop,.livecard,.act-live,.sl-live' + (KEEP ? '' : ',[onclick*="ZC.mentor"],[onclick*="ZC.maxPitch"],.zc-vip')).forEach((el) => { const b = el.closest('button') || el; b.style.display = 'none'; });
      if (KEEP) return;
      try { root.querySelectorAll('img').forEach((im) => { if (typeof ROLAND_IMG !== 'undefined' && im.src === ROLAND_IMG) { const b = im.closest('button,.row,li') || im; b.style.display = 'none'; } }); } catch (e) {}
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; const re = new RegExp('\\b' + MENTOR() + '\\b');
      while ((n = w.nextNode())) if (re.test(n.data)) { const el = n.parentElement && (n.parentElement.closest('button,li,tr,.row,.zm-row,[class*="perk"]') || n.parentElement); if (el && el !== document.body && el.id !== 'view' && el.id !== 'app') el.style.display = 'none'; }
    };
    if (walkFn) Z.walk = (r) => { walkFn(r); kill(r && r.nodeType === 1 ? r : document.body); };
    new MutationObserver((ms) => { for (const m of ms) for (const nd of m.addedNodes) if (nd.nodeType === 1) kill(nd); }).observe(document.documentElement, {subtree: true, childList: true});
    const go = () => kill(document.body); if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }
  // this person's funnel has its own mentor: remembered on the phone so it shows from the first paint; the server confirms it
  let FMC = null; try { FMC = JSON.parse(localStorage.getItem('zb_fm') || 'null'); } catch (e) {}
  // the bot's buttons carry it (?fm=…), so it's right from the very first open
  try { const fm = new URL(location.href).searchParams.get('fm'); if (fm) { const j = JSON.parse(decodeURIComponent(escape(atob(fm.replace(/-/g, '+').replace(/_/g, '/')))));
    if (j && j.n) { FMC = {custom: true, lang, name: j.n, role: j.r, photo: j.p, lives: j.lv, on: !!j.on, times: j.t || [], tz: j.tz, offset: j.o, link: j.k, base: j.b}; localStorage.setItem('zb_fm', JSON.stringify(FMC)); }
    // used once: a reload or an old button never brings it back (the server's answer below is what counts)
    const u2 = new URL(location.href); u2.searchParams.delete('fm'); history.replaceState(history.state, '', u2.toString()); } } catch (e) {}
  if (FMC && (FMC.lang || 'en') !== lang) FMC = null;
  Z.funnelMentor = FMC;
  if (LIVE()) ZBAPI('/api/app/config').then((c) => {
    if (!c || c.lang !== lang) return;
    const m = c.mentor && c.mentor.custom ? {...c.mentor, lang: c.lang} : null; const K = (x) => (x ? JSON.stringify([x.name, x.photo, !!x.on, x.times || [], x.link || '', x.tz || '']) : 'null'); const a = K(FMC), b = K(m);
    try { if (m) localStorage.setItem('zb_fm', JSON.stringify(m)); else localStorage.removeItem('zb_fm'); } catch (e) {}
    if (a !== b && !sessionStorage.getItem('zb_fm_reload')) { try { sessionStorage.setItem('zb_fm_reload', '1'); } catch (e) {} location.reload(); }
  }).catch(() => {});
  if (lang === 'en' && FMC) { Z.keepMentor = true; mentorApply(FMC); mentorSwapEN(FMC); if (!FMC.on) noLive(null); }
  if (lang === 'en') return;

  document.documentElement.lang = lang === 'tl' ? 'fil' : lang === 'pt' ? 'pt-BR' : lang;
  const D = new Map(Object.entries(I.dict || {}));
  try { const c = JSON.parse(localStorage.getItem('zbi_' + lang) || '{}'); for (const [k, v] of Object.entries(c.dict || {})) D.set(k, v); Z.since = c.v || I.v || 0; } catch (e) { Z.since = I.v || 0; }
  let VALS = new Set(D.values());              // texts that already are translations: leave them alone
  // texts written natively for this language (local AI traders) and plan badges like MAX / PRO / AI / OTC stay as they are
  const NATIVE = new Set(); try { for (const v of Object.values(I.roster || {})) for (const k of ['name', 'style', 'desc', 'vibe', 'he']) if (v && v[k]) { NATIVE.add(String(v[k]).trim()); const nn = String(v[k]).trim().replace(/\d+(?:[.,]\d+)?/g, '{0}'); NATIVE.add(nn); } } catch (e) {}
  for (const x of [I.support, I.mentor && I.mentor.name]) if (x) NATIVE.add(x);
  const KEEP_RE = /^(MAX|PRO|VIP|AI|OTC|IQ|USD|USDT|BTC|ETH|EUR\/USD|[A-Z]{3}\/[A-Z]{3})$/;
  const keepCache = () => { VALS = new Set(D.values()); try { const add = {}; for (const [k, v] of D) if (!(k in (I.dict || {}))) add[k] = v; localStorage.setItem('zbi_' + lang, JSON.stringify({v: Z.since, dict: add})); } catch (e) {} };

  /* ---------- this language's own support assistant (one name per region, never the English team's names) ---------- */
  if (I.support) { try { const f = {img: 'support/' + ({es: 'latina', pt: 'latina', tl: 'asian', th: 'asian', fr: 'aicha'}[lang] || 'emily') + '.jpg'}; AGENTS.splice(0, AGENTS.length, {n: I.support, f}); } catch (e) {} }
  /* ---------- local AI traders (names, style, description, personality written natively) ---------- */
  const EN = {};                                  // English name -> local name (for texts written with English names)
  function applyRoster(r) {
    if (typeof AIS === 'undefined' || !r) return;
    // this region's own local AI traders: added first, so they lead the marketplace. Only in this language.
    const locals = Object.entries(r).filter(([k, v]) => v && v.local && v.on !== false && v.name && !AIS[k]);
    if (locals.length) { const rest = Object.entries(AIS); for (const [k] of rest) delete AIS[k];
      for (const [k, v] of locals) AIS[k] = {name: v.name, tier: v.tier || (+v.min >= 100 ? 'voice' : 'std'), style: v.style || 'Signals', mk: v.mk || 'forex', desc: v.desc || '', he: v.he === 'He' ? 'He' : 'She', price: +v.price || 0, min: +v.min || 20, cat: v.cat || 'trend', vibe: v.vibe || '', local: true, f: {img: v.photo || ('faces/' + k + '.jpg'), real: 1}};
      for (const [k, a] of rest) AIS[k] = a; }
    for (const [k, v] of Object.entries(r)) { const a = AIS[k]; if (!a || !v || v.local) continue; if (v.name && a.name !== v.name) { EN[a._en || a.name] = v.name; a._en = a._en || a.name; a.name = v.name; }
      if (v.style) { a._enStyle = a._enStyle || a.style; a.style = v.style; } if (v.desc) a.desc = v.desc; if (v.vibe) a.vibe = v.vibe; }
  }
  applyRoster(I.roster);

  /* ---------- the shared rule (same as server/i18n.js) ---------- */
  const NUM = /[+\-−]?[$€£₦]?\d(?:[\d,.:]*\d)?(?:%|[kKMx×](?![A-Za-z]))?/g;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let NAMES = [], nameRe = null, namesSig = '';
  function names() {
    const L = new Set(['Zubabot', 'IQ Option']);
    try { for (const a of Object.values(AIS)) { if (a.name) L.add(a.name); if (a._en) L.add(a._en); } } catch (e) {}
    try { for (const c of Object.values(COACHES)) if (c.name) L.add(c.name); } catch (e) {}
    try { const n = typeof NAME === 'function' ? NAME() : ''; if (n && n.length > 1) L.add(n); } catch (e) {}
    const arr = [...L].filter((x) => x && x.length > 1); const sig = arr.length + ':' + arr[arr.length - 1];
    if (sig !== namesSig) { namesSig = sig; NAMES = arr; nameRe = new RegExp('(?<![\\p{L}\\p{N}])(' + arr.sort((a, b) => b.length - a.length).map(esc).join('|') + ')(?![\\p{L}\\p{N}])', 'gu'); }
    return nameRe;
  }
  function norm(text) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!/[A-Za-z]{2}/.test(s)) return null;
    const re = names(); const hits = [];
    for (const m of s.matchAll(NUM)) hits.push([m.index, m[0]]);
    if (re) for (const m of s.matchAll(re)) hits.push([m.index, m[0]]);
    hits.sort((a, b) => a[0] - b[0] || b[1].length - a[1].length);
    let out = '', i = 0, k = 0; const vals = [];
    for (const [at, v] of hits) { if (at < i) continue; out += s.slice(i, at) + '{' + k++ + '}'; vals.push(v); i = at + v.length; }
    out += s.slice(i);
    if (!/[A-Za-z]{2}/.test(out.replace(/\{\d+\}/g, ''))) return null;
    return {key: out, vals};
  }
  Z.norm = norm;
  const fill = (t, vals) => String(t).replace(/\{(\d+)\}/g, (m, n) => (vals[+n] !== undefined ? (EN[vals[+n]] || vals[+n]) : m));
  const MISS = new Set();
  function tr(text, report = true) {
    const raw = String(text); const trim = raw.trim(); if (!trim) return raw;
    if (EN[trim]) return raw.replace(trim, EN[trim]);                       // a name on its own
    if (VALS.has(trim) || NATIVE.has(trim) || KEEP_RE.test(trim)) return raw;
    const n = norm(trim); if (!n || NATIVE.has(n.key)) return raw;
    const t = D.get(n.key);
    if (t === undefined) { if (report && n.key.length <= 600) MISS.add(n.key); return raw; }
    const lead = raw.match(/^\s*/)[0], tail = raw.match(/\s*$/)[0];
    return lead + fill(t, n.vals) + tail;
  }
  Z.t = (s) => tr(s, true); Z._miss = MISS; Z._dict = D;

  /* ---------- translate the screen ---------- */
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT', 'svg', 'SVG']);
  const CONTENT = '.m, .zm-pop, .zm-row, .zv-cap, [data-content], #fcCap, #callCap';      // chat bubbles and live captions: translate only known texts, never report
  const done = new WeakMap();                    // text node -> the text we wrote into it
  function doText(node) {
    const cur = node.data; if (done.get(node) === cur) return;
    const p = node.parentElement; if (!p || SKIP.has(p.tagName) || p.closest('[data-noi18n],[contenteditable="true"]')) return;
    if (p.closest('.m.out')) return;                                      // the person's own messages
    const out = tr(cur, !p.closest(CONTENT));
    if (out !== cur) node.data = out;
    done.set(node, node.data);
  }
  const ATTRS = ['placeholder', 'title'];
  function doEl(el) {
    for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (v && el.__zbA !== v + a) { const o = tr(v); if (o !== v) el.setAttribute(a, o); el.__zbA = el.getAttribute(a) + a; } }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 || SKIP.has(root.tagName)) return;
    doEl(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {acceptNode: (n) => (n.nodeType === 1 && SKIP.has(n.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)});
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
  }
  Z.walk = walk;
  let pend = new Set(), raf = 0;
  const flush = () => { raf = 0; const list = [...pend]; pend = new Set(); for (const n of list) if (n.isConnected) walk(n); };
  const mo = new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') pend.add(m.target);
      else if (m.type === 'attributes') pend.add(m.target);
      else for (const n of m.addedNodes) pend.add(n);
    }
    // translate in the same frame, before the browser paints it
    if (pend.size && !raf) { raf = 1; queueMicrotask(flush); }
  });
  mo.observe(document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS});
  walk(document.body);
  // the browser tab title and Telegram's main button texts
  try { document.title = tr(document.title); } catch (e) {}

  /* ---------- this region's lead mentor, or the funnel's own ---------- */
  const MT = FMC ? FMC : (I.mentor && I.mentor.on && I.mentor.name ? I.mentor : null);
  if (MT) { Z.keepMentor = !!FMC; mentorApply(MT, EN); }
  if (!MT || !MT.on) noLive(walk);
  Z.noLive = !MT || !MT.on;

  /* ---------- texts with no translation yet: the server's AI translates them ---------- */
  async function sendMisses() {
    if (!MISS.size || !API()) return;
    const keys = [...MISS].slice(0, 120); keys.forEach((k) => MISS.delete(k));
    try {
      const r = await fetch(API() + '/api/i18n/miss', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({lang, keys, wait: 1})});
      const d = await r.json(); let n = 0; for (const [k, v] of Object.entries(d.dict || {})) { D.set(k, v); n++; }
      if (n) { keepCache(); walk(document.body); }
      if (d.pending) setTimeout(() => keys.filter((k) => !D.has(k)).forEach((k) => MISS.add(k)), 8000);
    } catch (e) { keys.forEach((k) => MISS.add(k)); }
  }
  setInterval(sendMisses, 3500);
  // edits made in Admin since this file was built
  if (API()) fetch(API() + '/api/i18n/dict?lang=' + lang + '&since=' + (Z.since || 0)).then((r) => r.json()).then((d) => {
    let n = 0; for (const [k, v] of Object.entries(d.dict || {})) { D.set(k, v); n++; }
    if (d.roster && Object.keys(d.roster).length) applyRoster(d.roster);
    if (d.v) Z.since = d.v; if (n) { keepCache(); for (const el of document.querySelectorAll('*')) if (el.childNodes.length) for (const c of el.childNodes) if (c.nodeType === 3) done.delete(c); walk(document.body); }
  }).catch(() => {});

  /* ---------- things that aren't on screen ---------- */
  // toasts and Telegram popups are on screen (covered). Spoken lines go to the server, which says them in the language.
  // training videos: the version in this language when it exists
  Z.video = (id) => (I.videos && I.videos.includes(id) ? 'academy/' + lang + '/' + id + '.mp4' : 'academy/v2/' + id + '.mp4');
  // dates and numbers in the local format
  Z.locale = {pt: 'pt-BR', es: 'es-419', tl: 'fil-PH', fr: 'fr-FR', th: 'th-TH'}[lang] || 'en-GB';
})();
