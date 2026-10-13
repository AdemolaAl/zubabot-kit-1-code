/* ===================== Real voice everywhere (incl. Telegram on Android) + live support thread =====================
   Telegram's built-in browser on Android has no phone voice and no voice typing, so:
   - Every spoken line comes from our server (/api/voice/say, /api/voice/turn -> audio clips), on every phone.
   - Calls are "hold to talk": the app records while the mic is held, the server hears it, the AI answers,
     and the reply plays sentence by sentence while the next sentences are still being made.
   - Live times come from Admin -> Lives. Replies from a teammate show up in the in-app support chat.
   Active only in the live app (window.ZB_API set); the demo keeps its built-in scripted calls. */
(function () {
  const LIVE = () => !!(window.ZB_LIVEMODE && window.ZBAPI);
  if (!LIVE()) return;
  const API = (window.ZB_API || '').replace(/\/$/, '');
  const VC = window.VC = {cfg: null, call: null, busy: false, rec: null, stream: null, speaking: false};
  const clipUrl = (id) => API + '/api/voice/clip?id=' + id;
  const ready = () => !!(VC.cfg && VC.cfg.on && VC.cfg.tts);
  const canTalk = () => ready() && VC.cfg.stt && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  const gender = (a) => (a && (a.he === 'He' || (a.f && a.f.g === 'm'))) ? 'm' : '';

  /* ---------- settings from the server: live times + voice ---------- */
  ZBAPI('/api/app/config').then((c) => {
    if (c.lives && Array.isArray(c.lives.times) && c.lives.times.length) {
      try { RT_SLOTS = c.lives.times.map((t) => { const [h, m] = String(t).split(':').map(Number); return h + (m || 0) / 60; }).sort((a, b) => a - b);
        if (c.lives.offset != null) RT_OFF = +c.lives.offset; if (c.lives.tz) RT_TZ = c.lives.tz;
        const l = RT_SLOTS.map(RTh); RT_ALL = (l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l[0]) + ' ' + RT_TZ; } catch (e) {}
    }
    if (c.lives && c.lives.link) window.ZB_LIVE_URL = c.lives.link;
  }).catch(() => {});
  // VC.ready resolves once the voice settings are in (or after 2.5 s), so a call tapped early still uses the real voice
  VC.ready = new Promise((ok) => { setTimeout(ok, 2500); ZBAPI('/api/voice/config').then((c) => { VC.cfg = c; if (ready()) installSpeech(); }).catch(() => {}).finally(ok); });

  /* ---------- one audio player for everything (unlocked on the first tap, so iPhone lets it play later) ---------- */
  const A = new Audio(); A.preload = 'auto'; A.setAttribute('playsinline', '');
  const SILENT = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA//////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAASDs90hvAAAAAAAAAAAAAAAAAAAA//sQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
  const unlock = () => { document.removeEventListener('pointerdown', unlock, true); try { A.src = SILENT; A.play().catch(() => {}); } catch (e) {} };
  document.addEventListener('pointerdown', unlock, true);
  let playId = 0;
  // play [{text, clip}] one after another; onLine(text) when each starts. Resolves when done (or stopped).
  function playAll(items, onLine) {
    const my = ++playId;
    return new Promise((done) => {
      let i = 0;
      const next = () => {
        if (my !== playId) return done(false);
        if (i >= items.length) { VC.speaking = false; return done(true); }
        const it = items[i++]; VC.speaking = true; onLine && onLine(it.text, i - 1);
        if (!it.clip) return setTimeout(next, 600 + it.text.length * 55);          // no voice for this line: show it, wait, go on
        let fallback = setTimeout(() => { A.pause(); next(); }, 25000);
        A.onended = () => { clearTimeout(fallback); setTimeout(next, 160); };
        A.onerror = () => { clearTimeout(fallback); setTimeout(next, 500 + it.text.length * 45); };
        A.src = clipUrl(it.clip); A.play().catch(() => { clearTimeout(fallback); setTimeout(next, 500 + it.text.length * 45); });
      };
      next();
    });
  }
  const stopAudio = () => { playId++; try { A.pause(); } catch (e) {} VC.speaking = false; };

  /* ---------- the phone's own speech is replaced by our voices (Android's Telegram has none; iPhone sounds better too) ---------- */
  function installSpeech() {
    if (window.__zbSpeech) return; window.__zbSpeech = true;
    if (typeof window.SpeechSynthesisUtterance !== 'function') window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    const shim = {speaking: false, pending: false, paused: false, getVoices: () => [], onvoiceschanged: null, pause() {}, resume() {},
      cancel() { stopAudio(); shim.speaking = false; },
      speak(u) {
        const a = (typeof AI === 'function' && AI()) || {}; shim.speaking = true;
        const lines = String(u.text || '').match(/[^.!?]+[.!?]*/g) || [u.text];
        ZBAPI('/api/voice/say', {lines: lines.map((x) => x.trim()).filter(Boolean).slice(0, 6), ai: a.key || (typeof S !== 'undefined' ? S.ai : ''), gender: gender(a)})
          .then((r) => playAll(r.clips)).catch(() => {}).finally(() => { shim.speaking = false; try { u.onend && u.onend(); } catch (e) {} });
      }};
    try { Object.defineProperty(window, 'speechSynthesis', {value: shim, configurable: true, writable: true}); } catch (e) {}
  }

  /* ---------- the microphone ---------- */
  const pickMime = () => ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || '';
  async function micOn() {
    if (VC.stream && VC.stream.active) return VC.stream;
    VC.stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}});
    try { const ac = VC.ac = VC.ac || new (window.AudioContext || window.webkitAudioContext)(); const an = VC.an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(VC.stream).connect(an); } catch (e) {}
    return VC.stream;
  }
  function micOff() { try { VC.stream && VC.stream.getTracks().forEach((t) => t.stop()); } catch (e) {} VC.stream = null; }
  const level = () => { if (!VC.an) return 0; const d = new Uint8Array(VC.an.fftSize); VC.an.getByteTimeDomainData(d); let s = 0; for (const x of d) s += Math.abs(x - 128); return s / d.length / 40; };
  async function recStart(onAuto) {
    stopAudio();
    if (VC.rec) { const o = VC.rec; VC.rec = null; clearTimeout(o.auto); try { o.onstop = null; o.stop(); } catch (e) {} }    // never two recorders at once
    clearInterval(VC.meter);
    const st = await micOn(); const mime = pickMime();
    const r = VC.rec = new MediaRecorder(st, mime ? {mimeType: mime} : undefined); r.chunks = []; r.t0 = Date.now();
    r.ondataavailable = (e) => e.data && e.data.size && r.chunks.push(e.data); r.start(250);
    const max = ((VC.cfg && VC.cfg.maxTurnSec) || 30) * 1000; r.auto = setTimeout(() => { if (VC.rec === r) (onAuto || VC.onAutoStop || (() => {}))(); }, max);
    VC.meter = setInterval(() => { if (typeof ORB !== 'undefined') ORB.target = .05 + Math.min(.16, level() * .5); }, 80);
  }
  function recStop() {
    const r = VC.rec; VC.rec = null; clearInterval(VC.meter); if (typeof ORB !== 'undefined') ORB.target = .05;
    if (!r) return Promise.resolve(null); clearTimeout(r.auto);
    return new Promise((ok) => { r.onstop = async () => { const blob = new Blob(r.chunks, {type: r.mimeType || 'audio/webm'}); const sec = (Date.now() - r.t0) / 1000;
      if (sec < 0.5 || blob.size < 1200) return ok(null);
      const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(blob); }); ok({audio: b64, mime: blob.type, sec}); };
      try { r.stop(); } catch (e) { ok(null); } });
  }
  // hold-to-talk on a button. Hold = talk while held. A quick tap = tap to start, tap again to send.
  function holdToTalk(btn, {onStart, onSend, onError}) {
    if (!btn || btn.__htt) return; btn.__htt = true; let down = 0, active = false, toggled = false, startP = null;
    const auto = () => { if (active) { toggled = false; down = 0; finish(); } };                 // this button's own 30-second stop
    const start = async (e) => { e.preventDefault(); if (VC.busy) return; if (active && toggled) return finish(); if (active) return; down = Date.now();
      active = true; btn.classList.add('rec'); onStart && onStart();
      startP = recStart(auto).catch((err) => { active = false; toggled = false; btn.classList.remove('rec'); onError && onError(err); throw err; });
      try { await startP; } catch (err) {} };
    const finish = async () => { if (!active) return; if (!toggled && Date.now() - down < 300) { toggled = true; return; }   // short tap -> keep recording until next tap
      active = false; toggled = false; btn.classList.remove('rec');
      try { await startP; } catch (e) { return; }                                                // let go while the mic permission was still open
      const r = await recStop(); onSend && onSend(r); };
    VC.onAutoStop = auto;
    btn.addEventListener('pointerdown', start); btn.addEventListener('pointerup', finish); btn.addEventListener('pointercancel', finish);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  Object.assign(VC, {holdToTalk, playAll, recStart, recStop, micOn, canTalk: () => canTalk()});   // shared with the chat voice notes (zubabot-chats.js)
  const micError = (e) => toast(/denied|not ?allowed|permission/i.test(String(e && (e.name || e.message))) ? 'Allow the microphone for Telegram to talk, or type instead' : 'Mic not available here. Tap a question or chat by text');

  /* ---------- calls with an AI trader ---------- */
  const keyOf = (a) => Object.keys(AIS).find((k) => AIS[k] === a) || S.ai;
  const profile = (a) => ({key: keyOf(a), name: a.name, style: a.style || '', desc: a.desc || '', tf: a.tf || '', markets: a.mk || '', owned: true, voice: a.vibe || ''});
  const _startCall = window.startCall, _endCall = window.endCall, _callLoop = window.callLoop, _viewCall = VIEWS.call;
  VIEWS.call = () => {
    let h = _viewCall();
    h = h.replace(/<a href="https:\/\/elevenlabs\.io[^"]*"[\s\S]*?<\/a>/, '');                                     // no "open the real voice" link: the call itself is real now
    if (CALL.on && canTalk()) h = h.replace(/<button class="cbtn" aria-label="Mute"[^>]*>[\s\S]*?<\/button>/, `<button class="cbtn zv-hold" id="zvHold" aria-label="Hold to talk">${ic('mic', 26, 2.2, '#0F1222')}</button>`)
      .replace('<div style="display:flex;justify-content:center;gap:22px">', '<p class="zv-hint" id="zvHint">Hold the mic and talk. Let go to send.</p><div style="display:flex;justify-content:center;align-items:center;gap:22px">');
    return h;
  };
  window.startCall = function () { const args = arguments; if (!VC.cfg && !VC._waited) { VC._waited = true; return VC.ready.then(() => window.startCall.apply(this, args)); }
    if (!canTalk()) return _startCall(); CALL.real = true; return _startCall(); };
  window.callLoop = function () {
    if (!CALL.real || !canTalk()) return _callLoop();
    clearInterval(go.callT); const a = voiceAI(); document.body.classList.add('zv-oncall');
    const st = (t) => { const e = $('callSt'); if (e) e.textContent = t; }, cap = (t) => { const e = $('callCap'); if (e) e.textContent = t; };
    const talk = (on) => { CALL.talk = on; ORB.target = on ? .14 : .05; const f = document.querySelector('.orbwrap .face'); if (f) f.classList.toggle('talk', on); };
    const say = async (r) => { if (!r.sentences || !r.sentences.length) return; talk(true); st(a.name + ' is talking'); await playAll(r.sentences, (t) => cap(t)); talk(false); if (!VC.rec) st('Your turn · hold the mic'); if (r.cta) showCta(r.cta); };
    const bind = () => holdToTalk($('zvHold'), {
      onStart: () => { st('Listening… let go to send'); cap(''); const hn = $('zvHint'); if (hn) hn.textContent = 'Listening… let go to send'; },
      onError: (e) => { micError(e); st('Your turn'); },
      onSend: async (rec) => {
        const hn = $('zvHint'); if (hn) hn.textContent = 'Hold the mic and talk. Let go to send.';
        if (!rec) { st('I didn’t catch that · hold a bit longer'); return; }
        VC.busy = true; st(a.name + ' is thinking…'); ORB.target = .09;
        try { const r = await ZBAPI('/api/voice/turn', {callId: VC.call.callId, ...rec}); VC.busy = false;
          if (r.tokens != null) { S.tokens = r.tokens; save(); const t = $('callTok'); if (t) t.textContent = fmt(S.tokens); }
          if (!r.heard) { st(r.retry === 'stt_failed' ? 'Line was noisy · try again' : 'I didn’t catch that · try again'); ORB.target = .05; return; }
          cap('You: ' + r.heard); await new Promise((z) => setTimeout(z, 350)); await say(r);
        } catch (e) { VC.busy = false; ORB.target = .05; if (e.data && e.data.ended) return callOver(e.message); st('Line dropped · try again'); }
      }});
    st('Connecting…'); cap('');
    ZBAPI('/api/voice/start', {ai: keyOf(a), profile: profile(a), gender: gender(a), ctx: window.BRAIN && BRAIN.ctx ? BRAIN.ctx() : {}}).then(async (r) => {
      if (!r.ok) throw Object.assign(new Error(r.error), {data: r});
      VC.call = r; S.tokens = r.tokens; save(); const t = $('callTok'); if (t) t.textContent = fmt(S.tokens);
      const m = $('callMeta'); if (m) m.textContent = '0:00 · ' + (r.tier === 'premium' ? 'Premium voice' : 'Standard voice');
      go.callT = setInterval(() => { if (!$('orb')) { clearInterval(go.callT); return; } CALL.sec++; const m = $('callMeta'); if (m) m.textContent = mmss(CALL.sec) + ' · ' + (r.tier === 'premium' ? 'Premium voice' : 'Standard voice');
        if (CALL.sec % 20 === 0) ZBAPI('/api/voice/ping', {callId: r.callId}).then((p) => { if (p.tokens != null) { S.tokens = p.tokens; save(); const t = $('callTok'); if (t) t.textContent = fmt(S.tokens); } }).catch((e) => { if (e.data && e.data.ended) callOver(e.message); }); }, 1000);
      bind(); await say(r);
    }).catch((e) => {
      const err = (e.data && e.data.error) || e.message;
      CALL.on = false; CALL.real = false;
      if (err === 'busy') { toast('Lots of people are on calls right now. Chat with ' + a.name + ' by text for a minute 💬'); go('chat'); }
      else if (err === 'day_limit') { toast('You’ve used today’s call minutes. Keep chatting by text, calls are back tomorrow 📞'); }
      else if (err === 'no_tokens') { toast('You’re out of tokens'); go('call'); setTimeout(() => window.buyTokens && buyTokens(), 300); }
      else if (err === 'voice_locked') { go('call'); setTimeout(() => window.upgradeSheet && upgradeSheet(), 300); }
      else { toast('Calls are busy. Try again in a minute, or chat by text'); go('call'); }
    });
  };
  function callOver(why) { endReal(); CALL.on = false; toast(why === 'no_tokens' ? 'Your tokens ran out, so the call ended. Top up to keep talking.' : why === 'time_up' ? 'Call time is up. Call again any time 📞' : why === 'day_limit' ? 'That’s today’s call minutes used. Keep chatting by text, calls are back tomorrow 📞' : 'Call ended'); go('call'); }
  function endReal() { document.body.classList.remove('zv-oncall'); stopAudio(); recStop(); micOff(); if (VC.call) { ZBAPI('/api/voice/end', {callId: VC.call.callId}).then((r) => { if (r.tokens != null) { S.tokens = r.tokens; save(); } }).catch(() => {}); VC.call = null; } CALL.real = false; VC.busy = false; }
  window.endCall = function (silent) { if (CALL.real || VC.call) endReal(); return _endCall(silent); };
  const showCta = (c) => { const el = $('callCard'); if (!el || !window.actCard) return; el.innerHTML = actCard(S.ai, JSON.stringify(c)); };

  /* ---------- the free welcome call with Zara before funding ---------- */
  const _fundCall = window.fundCall, _fcSay = window.fcSay, _endFund = window.endFundCall;
  window.fcSay = function (lines, done) {
    if (!ready()) return _fcSay(lines, done);
    const cap = $('fcCap'); if (!cap) return; FC.busy = true; CALL.talk = true; ORB.target = .12; const a = AI();
    $('fcSt').textContent = a.name + ' is talking'; $('fcQs').innerHTML = '';
    const f = document.querySelector('.fcall .face'); if (f) f.classList.add('talk');
    const fin = () => { FC.busy = false; CALL.talk = false; ORB.target = .035; const s = $('fcSt'); if (s) s.textContent = canTalk() ? 'Your turn · hold the mic or tap a question' : 'Listening…'; const f = document.querySelector('.fcall .face'); if (f) f.classList.remove('talk'); done && done(); };
    const show = (t) => { const c = $('fcCap'); if (c) c.innerHTML = t.split(' ').map((w, j) => `<span style="animation-delay:${(j * .06).toFixed(2)}s">${esc(w)}</span>`).join(' '); };
    ZBAPI('/api/voice/say', {lines, ai: a.key || S.ai, gender: gender(a)}).then((r) => playAll(r.clips, show)).catch(() => playAll(lines.map((t) => ({text: t})), show)).then(fin);
  };
  window.fundCall = function () {
    const args = arguments; if (!VC.cfg && !VC._fwaited) { VC._fwaited = true; return VC.ready.then(() => window.fundCall.apply(this, args)); }
    const out = _fundCall.apply(this, args); document.body.classList.add('zv-oncall');
    const real = document.querySelector('.fc-real'); if (real) real.remove();                                 // the call itself has the real voice now
    const mic = $('fcMic');
    if (mic && canTalk()) {
      mic.onclick = null; mic.insertAdjacentHTML('afterend', ''); const bot = document.querySelector('.fc-bot');
      if (bot && !$('fcHint')) bot.insertAdjacentHTML('afterend', '<p class="zv-hint" id="fcHint">Hold the mic to ask Zara anything</p>');
      holdToTalk(mic, {
        onStart: () => { const s = $('fcSt'); if (s) s.textContent = 'Listening… let go to send'; const h = $('fcHint'); if (h) h.textContent = 'Let go to send'; $('fcQs').innerHTML = ''; },
        onError: (e) => { micError(e); fcOffer(); },
        onSend: async (rec) => {
          const h = $('fcHint'); if (h) h.textContent = 'Hold the mic to ask Zara anything';
          if (!rec) { const s = $('fcSt'); if (s) s.textContent = 'I didn’t catch that · hold a bit longer'; fcOffer(); return; }
          VC.busy = true; const s = $('fcSt'); if (s) s.textContent = AI().name + ' is thinking…';
          try {
            if (!VC.call) { const st = await ZBAPI('/api/voice/start', {kind: 'welcome', ai: S.ai, silent: true, greeting: 'Hey! ' + AI().name + ' here. Before we take these setups your account needs funding. Anything you want to ask me first?', profile: profile(AI()), gender: gender(AI())}); if (!st.ok) throw Object.assign(new Error(st.error), {data: st}); VC.call = st; }
            const r = await ZBAPI('/api/voice/turn', {callId: VC.call.callId, ...rec}); VC.busy = false;
            if (!r.heard) { if (s) s.textContent = 'I didn’t catch that · try again'; fcOffer(); return; }
            const y = $('fcYou'); if (y) { y.textContent = 'You: ' + r.heard; y.classList.remove('in'); void y.offsetWidth; y.classList.add('in'); }
            FC.busy = true; CALL.talk = true; ORB.target = .12; if (s) s.textContent = AI().name + ' is talking';
            await playAll(r.sentences, (t) => { const c = $('fcCap'); if (c) c.innerHTML = t.split(' ').map((w) => `<span>${esc(w)}</span>`).join(' '); });
            FC.busy = false; CALL.talk = false; ORB.target = .035; const s2 = $('fcSt'); if (s2) s2.textContent = 'Your turn · hold the mic or tap a question';
            if (r.cta && r.cta.type === 'fund') { const b = document.querySelector('.fc-bot .btn'); if (b) b.classList.add('pulse'); }
            fcOffer();
          } catch (e) { VC.busy = false; FC.busy = false; const err = (e.data && e.data.error) || e.message;
            if (s) s.textContent = err === 'busy' ? 'Lines are busy · tap a question' : err === 'welcome_used' ? 'Tap a question below' : 'Line dropped · tap a question'; fcOffer(); }
        }});
    }
    return out;
  };
  window.endFundCall = function () { document.body.classList.remove('zv-oncall'); stopAudio(); recStop(); micOff(); if (VC.call && VC.call.kind === 'welcome') { ZBAPI('/api/voice/end', {callId: VC.call.callId}).catch(() => {}); VC.call = null; } return _endFund.apply(this, arguments); };

  /* ---------- in-app support: teammates' replies appear in the chat ---------- */
  const SUP = window.SUPT = {after: 0, t: null, status: 'ai', agent: null, seen: new Set()};
  function supBubble(m) {
    const box = $('sc'); if (!box || SUP.seen.has(m.id)) return; SUP.seen.add(m.id);
    const d = document.createElement('div'); d.className = 'm in' + (m.role === 'human' ? ' zv-hum' : '');
    d.innerHTML = (m.role === 'human' ? `<small>${esc(m.who || 'Support')} · Zubabot team</small>` : '') + esc(m.text);
    box.appendChild(d); box.scrollTop = box.scrollHeight; try { SND.msg(); } catch (e) {}
  }
  function supHead() {
    const h = document.querySelector('.sup-head div[style*="money-d"]'); if (!h) return;
    if (SUP.status === 'human' && SUP.agent) h.innerHTML = `<span class="ping"></span>${esc(SUP.agent)} from the team is with you`;
    else if (SUP.status === 'waiting') h.innerHTML = '<span class="ping"></span>A teammate is joining…';
  }
  async function supPoll(first) {
    if (!$('sc')) { clearInterval(SUP.t); SUP.t = null; return; }
    try { const r = await ZBAPI('/api/support/thread?after=' + SUP.after); SUP.status = r.status; SUP.agent = r.agent;
      for (const m of r.msgs) { SUP.after = Math.max(SUP.after, m.id); if (!first || r.status !== 'ai') supBubble(m); else SUP.seen.add(m.id); }
      supHead(); if (r.status === 'ai' && !first && SUP.t && SUP.idle++ > 40) { clearInterval(SUP.t); SUP.t = null; } } catch (e) {}
  }
  const supWatch = () => { SUP.idle = 0; if (!SUP.t) SUP.t = setInterval(supPoll, 4000); };
  const _openSupport = window.openSupport;
  window.openSupport = function () { const out = _openSupport.apply(this, arguments); SUP.seen = new Set(); SUP.after = 0; supPoll(true).then(() => { if (SUP.status !== 'ai') supWatch(); }); return out; };
  if (window.BRAIN && BRAIN.chat) { const _chat = BRAIN.chat; BRAIN.chat = (b) => _chat(b).then((r) => { if (b.kind === 'support' && r.human) { supWatch(); setTimeout(supPoll, 600); } return r; }); }

  const st = document.createElement('style'); st.textContent = `
  .zv-hold{width:84px!important;height:84px!important;background:#FFD21F!important;border:0!important;box-shadow:0 0 0 6px rgba(255,210,31,.18),0 10px 30px -8px rgba(255,210,31,.6);touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
  .zv-hold.rec,.fc-mic.rec{background:#FF5A64!important;box-shadow:0 0 0 10px rgba(255,90,100,.22),0 0 0 22px rgba(255,90,100,.10);animation:zvPulse 1s ease-in-out infinite}
  .fc-mic{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
  .fc-mic.rec svg path,.zv-hold.rec svg path{stroke:#FFF}
  @keyframes zvPulse{50%{transform:scale(1.06)}}
  body.zv-oncall .livepop{display:none!important}
  .zv-hint{text-align:center;font-size:12.5px;color:#8F95AA;font-weight:700;margin:0 0 12px}
  .fcall .zv-hint{margin:10px 0 0}
  .m.zv-hum{background:#FFF7D1;border:1px solid #F2DF8A}.m.zv-hum small{display:block;font-size:11px;font-weight:800;color:#8A6A00;margin-bottom:2px}`;
  document.head.appendChild(st);
})();
