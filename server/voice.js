// Voice calls that work everywhere, including Telegram on Android (whose built-in browser has no phone voice and no voice typing).
// The app records the user while they hold the mic -> our server turns it into text (STT) -> the AI answers -> our server
// turns each sentence into speech (TTS) -> the app plays them one after another while the next ones are still being made.
//
// Providers (tried in the order set in Admin -> AI engine & voice; the next one is used if one fails):
//   self        our own GPU voice server (voice-server/ folder: Kokoro voices + Whisper listening). Cheapest by far.
//   openai      STT gpt-4o-mini-transcribe, TTS gpt-4o-mini-tts           OPENAI_API_KEY
//   deepgram    STT nova-3                                                 DEEPGRAM_API_KEY
//   elevenlabs  TTS eleven_flash_v2_5 (premium voice), STT scribe          ELEVENLABS_API_KEY
//   google      TTS Neural2                                                GOOGLE_TTS_KEY
// Standard voice (1 token / minute) uses the "standard" list, premium voice (4 tokens / minute, Pro $1,000+) the "premium" list.
// The free welcome call before funding (3 minutes) always uses standard voice.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const STT_PROVIDERS = {self: () => !!process.env.VOICE_SERVER_URL, openai: () => !!process.env.OPENAI_API_KEY, deepgram: () => !!process.env.DEEPGRAM_API_KEY, elevenlabs: () => !!process.env.ELEVENLABS_API_KEY};
const TTS_PROVIDERS = {self: () => !!process.env.VOICE_SERVER_URL, openai: () => !!process.env.OPENAI_API_KEY, elevenlabs: () => !!process.env.ELEVENLABS_API_KEY, google: () => !!process.env.GOOGLE_TTS_KEY};
const vsUrl = () => (process.env.VOICE_SERVER_URL || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const vsHead = () => (process.env.VOICE_SERVER_KEY ? {authorization: 'Bearer ' + process.env.VOICE_SERVER_KEY} : {});
let rr = 0; const nextVs = () => { const l = vsUrl(); return l[rr++ % l.length]; };     // several voice servers -> round robin
const withTimeout = (ms) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return {signal: c.signal, done: () => clearTimeout(t)}; };
const extOf = (mime) => /mp4|m4a|aac/.test(mime) ? 'mp4' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : /mpeg|mp3/.test(mime) ? 'mp3' : 'webm';

export function splitSentences(t) {
  const s = String(t || '').replace(/\s+/g, ' ').trim(); if (!s) return [];
  const parts = s.match(/[^.!?…]+[.!?…]+["’”)]*|[^.!?…]+$/g) || [s];
  const out = []; for (const p0 of parts) { const p = p0.trim(); if (!p) continue; if (out.length && (out[out.length - 1].length < 18 || p.length < 8)) out[out.length - 1] += ' ' + p; else out.push(p); }
  return out.slice(0, 8);
}
// words read badly by voices
export const speakable = (t) => String(t || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\*|_|#|\|\|/g, ' ').replace(/\bIQ Option\b/g, 'I Q Option')
  .replace(/\bWAT\b/g, 'West Africa time').replace(/\$(\d+(?:,\d{3})*)(?:\.00)?\b/g, (m, n) => n.replace(/,/g, '') + ' dollars').replace(/\bOTC\b/g, 'O T C').replace(/\s+/g, ' ').trim();

export function makeVoice({db, q, now, C, settings, engine, brain, team, publicState, funnels, i18n}) {
  const langOf = (id) => (funnels ? funnels.langOf(id) : 'en');
  const LANGS = (i18n && i18n.LANGS) || {};
  const env = process.env;
  const CACHE = env.VOICE_CACHE_DIR || path.join(process.cwd(), 'voice-cache');
  try { fs.mkdirSync(CACHE, {recursive: true}); } catch (e) {}
  // remove cached clips older than 30 days (greetings and common lines are re-made when needed)
  try { const old = now() - 30 * 864e5; for (const f of fs.readdirSync(CACHE)) { const p = path.join(CACHE, f); if (fs.statSync(p).mtimeMs < old) fs.unlinkSync(p); } } catch (e) {}
  db.exec(`CREATE TABLE IF NOT EXISTS voice_calls(id TEXT PRIMARY KEY, tg_id TEXT, ai TEXT, kind TEXT, tier TEXT, started_at INTEGER, last_at INTEGER, ended_at INTEGER, end_reason TEXT,
      secs INTEGER DEFAULT 0, tokens INTEGER DEFAULT 0, turns INTEGER DEFAULT 0, stt_sec REAL DEFAULT 0, tts_chars INTEGER DEFAULT 0, usd REAL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS voice_calls_u ON voice_calls(tg_id, started_at);
    CREATE TABLE IF NOT EXISTS voice_turns(id INTEGER PRIMARY KEY AUTOINCREMENT, call_id TEXT, role TEXT, text TEXT, at INTEGER);`);
  if (!q('PRAGMA table_info(voice_calls)').all().some((x) => x.name === 'cap')) db.exec('ALTER TABLE voice_calls ADD COLUMN cap INTEGER');
  const V = () => settings.get('voice');
  const pending = new Map();          // clip id -> Promise (TTS still being made)
  const calls = new Map();            // call id -> {history, profile, ...} while the call is on

  /* ---------------- speech to text ---------------- */
  async function sttOne(p, buf, mime, lang = 'en') {
    const tm = withTimeout(20000);
    try {
      if (p === 'self') { const r = await fetch(nextVs() + '/stt' + (lang !== 'en' && LANGS[lang] && LANGS[lang].stt ? '?lang=' + LANGS[lang].stt : ''), {method: 'POST', signal: tm.signal, headers: {'content-type': mime, ...vsHead()}, body: buf}); const d = await r.json(); if (!r.ok) throw new Error('self ' + r.status); return d.text || ''; }
      if (p === 'openai' || p === 'elevenlabs') {
        const fd = new FormData(); fd.append('file', new Blob([buf], {type: mime}), 'speech.' + extOf(mime));
        if (p === 'openai') { fd.append('model', env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe'); fd.append('prompt', 'Zubabot, IQ Option, Roland, EUR/USD, OTC, signal, deposit, naira, cedis.'); if (lang !== 'en' && LANGS[lang] && LANGS[lang].stt) fd.append('language', LANGS[lang].stt); }
        else fd.append('model_id', 'scribe_v1');
        const r = await fetch(p === 'openai' ? 'https://api.openai.com/v1/audio/transcriptions' : 'https://api.elevenlabs.io/v1/speech-to-text', {method: 'POST', signal: tm.signal,
          headers: p === 'openai' ? {authorization: 'Bearer ' + env.OPENAI_API_KEY} : {'xi-api-key': env.ELEVENLABS_API_KEY}, body: fd});
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(p + ' ' + r.status); return d.text || '';
      }
      if (p === 'deepgram') { const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&detect_language=true', {method: 'POST', signal: tm.signal, headers: {authorization: 'Token ' + env.DEEPGRAM_API_KEY, 'content-type': mime}, body: buf});
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('deepgram ' + r.status); return d.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''; }
      throw new Error('unknown stt ' + p);
    } finally { tm.done(); }
  }
  async function stt(buf, mime, sec, lang = 'en') {
    let err; for (const p of V().stt || []) {
      if (!STT_PROVIDERS[p] || !STT_PROVIDERS[p]()) continue;
      try { const text = (await sttOne(p, buf, mime, lang)).trim(); const pr = V().prices || {}; const usd = p === 'self' ? 0 : sec / 60 * (p === 'openai' ? pr.openaiStt : p === 'deepgram' ? pr.deepgram : pr.elevenlabsSttMin || 0.0067);
        engine.addSpend('voice-stt', p, p === 'self' ? 'whisper' : p, usd || 0, sec); return {text, provider: p, usd: usd || 0}; }
      catch (e) { err = e; team && team.alert('provider_fail', `⚠️ Voice listening (${p}) failed: ${String(e.message).slice(0, 100)}. Trying the next one.`, {key: 'stt' + p, every: 30 * 60e3}); }
    }
    throw Object.assign(err || new Error('no_stt_provider'), {status: 503});
  }

  /* ---------------- text to speech ---------------- */
  // our own voice server speaks English, Spanish, French (female) and Brazilian Portuguese. Thai, Taglish and French male voices use the next provider (OpenAI / ElevenLabs speak every language).
  function voiceFor(provider, aiKey, gender, lang = 'en') {
    const vs = V().voices || {};
    if (lang !== 'en') { const lv = ((vs.lang || {})[lang] || {}); if (lv[gender === 'm' ? 'male' : 'female'] && lv[gender === 'm' ? 'male' : 'female'][provider]) return lv[gender === 'm' ? 'male' : 'female'][provider];
      if (provider === 'self') { const L = LANGS[lang] || {}; return gender === 'm' ? L.voiceM || null : L.voiceF || null; } }
    const per = (vs.perAI || {})[aiKey] || {};
    return per[provider] || (gender === 'm' ? (vs.male || {})[provider] : null) || (vs.default || {})[provider];
  }
  async function ttsOne(p, text, voice) {
    const tm = withTimeout(20000); const speed = +V().speed || 1;
    try {
      if (p === 'self') { const r = await fetch(nextVs() + '/tts', {method: 'POST', signal: tm.signal, headers: {'content-type': 'application/json', ...vsHead()}, body: JSON.stringify({text, voice, speed, format: 'mp3'})});
        if (!r.ok) throw new Error('self ' + r.status); return Buffer.from(await r.arrayBuffer()); }
      if (p === 'openai') { const r = await fetch('https://api.openai.com/v1/audio/speech', {method: 'POST', signal: tm.signal, headers: {'content-type': 'application/json', authorization: 'Bearer ' + env.OPENAI_API_KEY},
        body: JSON.stringify({model: env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', voice, input: text, response_format: 'mp3', speed, instructions: 'Warm, upbeat, energetic and friendly, smiling while talking, natural pace. Like a fun friend who trades.'})});
        if (!r.ok) throw new Error('openai ' + r.status); return Buffer.from(await r.arrayBuffer()); }
      if (p === 'elevenlabs') { const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {method: 'POST', signal: tm.signal,
        headers: {'content-type': 'application/json', 'xi-api-key': env.ELEVENLABS_API_KEY}, body: JSON.stringify({text, model_id: env.ELEVEN_TTS_MODEL || 'eleven_flash_v2_5', voice_settings: {stability: 0.4, similarity_boost: 0.8, style: 0.35, speed}})});
        if (!r.ok) throw new Error('elevenlabs ' + r.status); return Buffer.from(await r.arrayBuffer()); }
      if (p === 'google') { const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + env.GOOGLE_TTS_KEY, {method: 'POST', signal: tm.signal, headers: {'content-type': 'application/json'},
        body: JSON.stringify({input: {text}, voice: {languageCode: String(voice || 'en-US-Neural2-F').slice(0, 5), name: voice || 'en-US-Neural2-F'}, audioConfig: {audioEncoding: 'MP3', speakingRate: speed}})});
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('google ' + r.status); return Buffer.from(d.audioContent || '', 'base64'); }
      throw new Error('unknown tts ' + p);
    } finally { tm.done(); }
  }
  // returns a clip id right away; the audio is made in the background and cached on disk
  function tts(text, {tier = 'standard', ai = '', gender = '', callId = null, lang = 'en'} = {}) {
    const say = speakable(text); if (!say) return null;
    const list = (tier === 'premium' ? V().premium : V().standard) || [];
    let ready = list.filter((p) => TTS_PROVIDERS[p] && TTS_PROVIDERS[p]() && (p !== 'self' || voiceFor('self', ai, gender, lang)));
    if (!ready.length && lang !== 'en') ready = ['openai', 'elevenlabs', 'google'].filter((p) => TTS_PROVIDERS[p] && TTS_PROVIDERS[p]());      // a language our voice server can't speak
    if (!ready.length) return null;
    const first = ready[0], id = crypto.createHash('sha1').update([first, voiceFor(first, ai, gender, lang), V().speed, say].join('|')).digest('hex');
    const file = path.join(CACHE, id + '.mp3');
    if (fs.existsSync(file) || pending.has(id)) return id;
    const job = (async () => {
      let err; for (const p of ready) {
        try { const buf = await ttsOne(p, say, voiceFor(p, ai, gender, lang)); if (!buf.length) throw new Error('empty audio');
          fs.writeFileSync(file, buf); const pr = V().prices || {}; const usd = say.length / 1e6 * (p === 'self' ? 0 : p === 'openai' ? pr.openaiTts : p === 'google' ? pr.google : pr.elevenlabs || 100);
          engine.addSpend('voice-tts', p, p === 'self' ? 'kokoro' : p, usd, say.length);
          if (callId) q('UPDATE voice_calls SET tts_chars=tts_chars+?, usd=usd+? WHERE id=?').run(say.length, usd, callId);
          return true; }
        catch (e) { err = e; team && team.alert('provider_fail', `⚠️ Voice (${p}) failed: ${String(e.message).slice(0, 100)}. Using the next voice.`, {key: 'tts' + p, every: 30 * 60e3}); }
      }
      throw err;
    })().finally(() => setTimeout(() => pending.delete(id), 5000));
    job.catch(() => {}); pending.set(id, job); return id;
  }

  /* ---------------- calls ---------------- */
  // premium = a premium provider other than our own voice server is ready (otherwise it would be standard voice at premium price)
  const premiumReady = () => (V().premium || []).some((p) => p !== 'self' && TTS_PROVIDERS[p] && TTS_PROVIDERS[p]());
  const activeCalls = () => q('SELECT COUNT(*) n FROM voice_calls WHERE ended_at IS NULL AND last_at>?').get(now() - 75e3).n;
  // seconds of trader calls today (WAT day), all tiers or one tier
  const watDay0 = () => { const d = new Date(now() + 3600e3); d.setUTCHours(0, 0, 0, 0); return d.getTime() - 3600e3; };
  const usedToday = (tg, tier) => (q(`SELECT COALESCE(SUM(secs),0) s FROM voice_calls WHERE tg_id=? AND kind='trader' AND started_at>=?${tier ? ' AND tier=?' : ''}`).get(...[String(tg), watDay0(), ...(tier ? [tier] : [])]) || {}).s || 0;
  const dayCap = (dep) => (dep >= (V().maxFrom || 2000) ? V().dayMinMax : V().dayMin) * 60;
  function charge(c) {
    // charge per started minute: standard 1 token, premium 4 tokens. The welcome call before funding is free.
    const secs = Math.round((now() - c.started_at) / 1000); let tokens = c.tokens;
    if (c.kind === 'trader') { const per = c.tier === 'premium' ? V().perMinPremium : V().perMinStd; const due = Math.ceil(Math.max(1, secs) / 60) * per - c.tokens;
      if (due > 0) { const rw = q('SELECT tokens FROM rewards WHERE tg_id=?').get(c.tg_id) || {tokens: 0}; const take = Math.min(due, rw.tokens || 0);
        q('UPDATE rewards SET tokens=MAX(0,tokens-?) WHERE tg_id=?').run(take, c.tg_id); tokens += take; if (take < due) { q('UPDATE voice_calls SET secs=?, tokens=?, last_at=? WHERE id=?').run(secs, tokens, now(), c.id); return {out: true, secs, tokens}; } } }
    q('UPDATE voice_calls SET secs=?, tokens=?, last_at=? WHERE id=?').run(secs, tokens, now(), c.id);
    let max = c.kind === 'welcome' ? 180 : (V().maxCallMin || 30) * 60;
    if (c.kind === 'trader' && c.cap) max = Math.min(max, c.cap);        // what was left of today's minutes when the call started
    return {out: false, secs, tokens, secLeft: Math.max(0, max - secs)};
  }
  function end(id, reason) { const c = q('SELECT * FROM voice_calls WHERE id=?').get(id); if (!c || c.ended_at) return c; const r = charge(c); q('UPDATE voice_calls SET ended_at=?, end_reason=? WHERE id=?').run(now(), reason, id); calls.delete(id); return {...c, ...r}; }
  const tokensOf = (tg) => (q('SELECT tokens FROM rewards WHERE tg_id=?').get(String(tg)) || {}).tokens || 0;
  const own = (id, u) => { const c = id && q('SELECT * FROM voice_calls WHERE id=?').get(String(id)); return c && c.tg_id === String(u.id) && !c.ended_at ? c : null; };

  async function think(c, mem, text) {
    const st = publicState(c.tg_id) || {}; const dep = st.deposits_total || 0;
    const welcome = c.kind === 'welcome';
    const task = 'VOICE CALL (spoken out loud): 1 to 3 short spoken sentences, no emojis, no lists, no "||". React to what they said, then hand it back with a short question. '
      + (welcome ? 'This is the free welcome call before they fund. Answer their question warmly, and guide them to fund their own IQ Option account to start ([CTA:fund:AMOUNT] when they are ready).' : 'You are on a call with a user who unlocked you.');
    const out = await brain.reply({tgId: c.tg_id, kind: 'ai', profile: mem.profile, ctx: {...(mem.ctx || {}), screen: welcome ? 'free welcome call' : 'voice call'}, history: mem.history, text, channel: 'voice', task, area: 'voice'});
    const said = out.messages.join(' ');
    mem.history.push(['me', text], ['ai', said]); if (mem.history.length > 16) mem.history.splice(0, mem.history.length - 16);
    return {said, cta: out.cta};
  }
  function speakOut(c, mem, said) {
    const lang = langOf(c.tg_id); return splitSentences(speakable(said) ? said : '').map((s) => ({text: s, clip: tts(s, {tier: c.tier, ai: mem.profile?.key || c.ai, gender: mem.gender, callId: c.id, lang})}));
  }

  const routes = {
    'GET /api/voice/config': async () => {
      const v = V(); return {ok: true, on: !!v.on, stt: (v.stt || []).some((p) => STT_PROVIDERS[p] && STT_PROVIDERS[p]()), tts: (v.standard || []).some((p) => TTS_PROVIDERS[p] && TTS_PROVIDERS[p]()),
        premium: premiumReady(), voiceFrom: v.voiceFrom, premiumFrom: v.premiumFrom, perMin: {standard: v.perMinStd, premium: v.perMinPremium}, maxTurnSec: v.maxTurnSec};
    },
    // start a call. kind 'welcome' = the free 3-minute call with the main AI before funding; 'trader' = a call with an unlocked AI (tokens)
    'POST /api/voice/start': async (req, b, u) => {
      if (!u) return [401, {ok: false, error: 'telegram_auth'}];
      const v = V(); if (!v.on) return {ok: false, error: 'voice_off'};
      if (!brain.live() || engine.overBudget()) return {ok: false, error: 'no_ai'};
      const st = publicState(u.id) || {}; const dep = st.deposits_total || 0; const kind = b.kind === 'welcome' ? 'welcome' : 'trader';
      const tokens = tokensOf(u.id); let tier = 'standard';
      if (kind === 'trader') {
        if (dep < v.voiceFrom) return {ok: false, error: 'voice_locked', need: v.voiceFrom};
        const left = dayCap(dep) - usedToday(u.id);
        if (left < 30) return {ok: false, error: 'day_limit', minutes: Math.round(dayCap(dep) / 60), msg: `You’ve used today’s ${Math.round(dayCap(dep) / 60)} call minutes. Keep chatting by text, calls are back tomorrow.`};
        if (dep >= v.premiumFrom && tokens >= v.perMinPremium && b.voice !== 'standard' && premiumReady() && usedToday(u.id, 'premium') < (v.premiumDayMin || 20) * 60) tier = 'premium';
        else if (tokens < v.perMinStd) return {ok: false, error: 'no_tokens'};
      } else {
        const today = q('SELECT COUNT(*) n FROM voice_calls WHERE tg_id=? AND kind=? AND started_at>?').get(String(u.id), 'welcome', now() - 864e5).n;
        if (today >= 2) return {ok: false, error: 'welcome_used'};
      }
      // call limit: funded users always get through; leads see "busy, chat by text for a minute"
      const n = activeCalls();
      if (n >= v.maxCalls && dep < C.minDeposit) { team && team.alert('voice_busy', `📞 Voice calls are full (${n}/${v.maxCalls}). New leads are being asked to chat by text. Raise the limit or add a voice server.`, {key: 'busy', every: 30 * 60e3}); return {ok: false, error: 'busy'}; }
      const id = crypto.randomBytes(12).toString('base64url');
      q('INSERT INTO voice_calls(id,tg_id,ai,kind,tier,started_at,last_at,cap) VALUES(?,?,?,?,?,?,?,?)').run(id, String(u.id), String(b.ai || '').slice(0, 30), kind, tier, now(), now(), kind === 'trader' ? Math.max(30, dayCap(dep) - usedToday(u.id)) : null);
      for (const [cid, c] of calls) if (c.tg_id === String(u.id)) end(cid, 'replaced');      // one call per person
      const mem = {tg_id: String(u.id), profile: b.profile || {key: b.ai}, ctx: b.ctx || {}, gender: b.gender === 'm' ? 'm' : '', history: []}; calls.set(id, mem);
      const c = q('SELECT * FROM voice_calls WHERE id=?').get(id);
      let said = b.greeting ? String(b.greeting).slice(0, 300) : '';
      if (!said) { try { said = (await think(c, mem, '(the call just connected: greet them by name, excited and warm, one or two short sentences, then ask a question)')).said; } catch (e) { said = `Hey ${u.first_name || 'there'}! So good to hear you. What are we trading today?`; } }
      else mem.history.push(['ai', said]);
      q('INSERT INTO voice_turns(call_id,role,text,at) VALUES(?,?,?,?)').run(id, 'ai', said, now());
      return {ok: true, callId: id, kind, tier, tokens: tokensOf(u.id), maxSec: kind === 'welcome' ? 180 : (v.maxCallMin || 30) * 60, maxTurnSec: v.maxTurnSec, sentences: b.silent ? [] : speakOut(c, mem, said)};
    },
    // one turn: {callId, audio: base64, mime, sec} (or {text} if they typed)
    'POST /api/voice/turn': async (req, b, u) => {
      if (!u) return [401, {ok: false, error: 'telegram_auth'}];
      const c = own(b.callId, u); if (!c) return {ok: false, error: 'call_ended'};
      const mem = calls.get(c.id) || {tg_id: c.tg_id, profile: {key: c.ai}, ctx: {}, history: []}; calls.set(c.id, mem);
      // one turn at a time, a short gap between turns, and a cap per call (protects the daily AI budget)
      if (mem.busy) return {ok: true, heard: '', sentences: [], retry: 'busy'};
      if (now() - (mem.lastTurn || 0) < 1500) return {ok: true, heard: '', sentences: [], retry: 'busy'};
      if ((c.turns || 0) >= (c.kind === 'welcome' ? 14 : 60)) { end(c.id, 'turns'); return {ok: false, error: 'time_up', ended: true}; }
      mem.busy = true; mem.lastTurn = now();
      try { return await turn(c, mem, b, u); } finally { mem.busy = false; }
    },
    'POST /api/voice/_unused': async () => [404, {ok: false}],
  };
  async function turn(c, mem, b, u) {
    {
      const bill = charge(c); if (bill.out) { end(c.id, 'no_tokens'); return {ok: false, error: 'no_tokens', ended: true}; }
      if (c.kind === 'trader' && c.cap && bill.secs >= c.cap) { end(c.id, 'day_limit'); return {ok: false, error: 'day_limit', ended: true}; }
      if (bill.secLeft <= 0) { end(c.id, 'time'); return {ok: false, error: 'time_up', ended: true}; }
      let text = String(b.text || '').trim().slice(0, 600);
      if (!text && b.audio) {
        const buf = Buffer.from(String(b.audio), 'base64'); if (buf.length < 800) return {ok: true, heard: '', sentences: [], retry: 'too_short'};
        if (buf.length > 3e6) return [413, {ok: false, error: 'too_long'}];
        const sec = Math.min(+b.sec || buf.length / 4000, V().maxTurnSec || 30);
        try { const r = await stt(buf, String(b.mime || 'audio/webm').slice(0, 60), sec, langOf(u.id)); text = r.text; q('UPDATE voice_calls SET stt_sec=stt_sec+?, usd=usd+? WHERE id=?').run(sec, r.usd, c.id); }
        catch (e) { return {ok: true, heard: '', sentences: [], retry: 'stt_failed'}; }
      }
      if (!text || text.length < 2) return {ok: true, heard: '', sentences: [], retry: 'not_heard'};
      q('INSERT INTO voice_turns(call_id,role,text,at) VALUES(?,?,?,?)').run(c.id, 'user', text, now());
      let said, cta = null;
      try { const r = await think(c, mem, text); said = r.said; cta = r.cta; } catch (e) { said = 'Sorry, my line dropped for a second. Can you say that again?'; }
      q('INSERT INTO voice_turns(call_id,role,text,at) VALUES(?,?,?,?)').run(c.id, 'ai', said, now()); q('UPDATE voice_calls SET turns=turns+1 WHERE id=?').run(c.id);
      return {ok: true, heard: text, said, cta, sentences: speakOut(c, mem, said), tokens: tokensOf(u.id), secLeft: bill.secLeft};
    }
  }
  Object.assign(routes, {
    'POST /api/voice/ping': async (req, b, u) => { if (!u) return [401, {ok: false}]; const c = own(b.callId, u); if (!c) return {ok: false, ended: true}; const r = charge(c);
      if (r.out) { end(c.id, 'no_tokens'); return {ok: false, error: 'no_tokens', ended: true}; } if (r.secLeft <= 0) { const day = c.cap && r.secs >= c.cap; end(c.id, day ? 'day_limit' : 'time'); return {ok: false, error: day ? 'day_limit' : 'time_up', ended: true}; } return {ok: true, tokens: tokensOf(u.id), secs: r.secs, secLeft: r.secLeft}; },
    'POST /api/voice/end': async (req, b, u) => { if (!u) return [401, {ok: false}]; const c = own(b.callId, u); if (!c) return {ok: true}; const r = end(c.id, 'user'); return {ok: true, secs: r.secs, tokensUsed: r.tokens, tokens: tokensOf(u.id)}; },
    // a scripted line spoken by an AI (funding-stage Zara). Cached, so the same line costs nothing the second time.
    'POST /api/voice/say': async (req, b, u) => {
      if (!u) return [401, {ok: false}]; const v = V(); if (!v.on) return {ok: false, error: 'voice_off'};
      const day = 'say:' + new Date().toISOString().slice(0, 10); const used = (q('SELECT n FROM ai_usage WHERE tg_id=? AND day=?').get(String(u.id), day) || {}).n || 0;
      if (used >= 60) return {ok: false, error: 'limit'};
      q('INSERT INTO ai_usage(tg_id,day,n) VALUES(?,?,1) ON CONFLICT(tg_id,day) DO UPDATE SET n=n+1').run(String(u.id), day);
      let lines = (Array.isArray(b.lines) ? b.lines : [b.text]).map((x) => String(x || '').slice(0, 300)).filter(Boolean).slice(0, 6);
      const lang = langOf(u.id); if (lang !== 'en' && i18n) lines = await i18n.trAll(lang, lines, {names: [u.first_name].filter(Boolean)});     // the app's scripted lines, said in their language
      return {ok: true, lang, clips: lines.map((t) => ({text: t, clip: tts(t, {tier: 'standard', ai: String(b.ai || ''), gender: b.gender === 'm' ? 'm' : '', lang})}))};
    },
    'GET /api/voice/clip': async (req, b, u, url, who, res) => {
      const id = String(url.searchParams.get('id') || ''); if (!/^[a-f0-9]{40}$/.test(id)) return [400, {ok: false}];
      const file = path.join(CACHE, id + '.mp3');
      if (!fs.existsSync(file) && pending.has(id)) { try { await pending.get(id); } catch (e) {} }
      if (!fs.existsSync(file)) return [404, {ok: false, error: 'voice_failed'}];
      const buf = fs.readFileSync(file);
      res.writeHead(200, {'Content-Type': 'audio/mpeg', 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=2592000, immutable', 'Access-Control-Allow-Origin': C.allowOrigin}); res.end(buf); return null;
    },

    /* ---------- admin ---------- */
    'GET /api/admin/voice': async () => {
      const d = new Date(now() + 3600e3 - 7 * 864e5).toISOString().slice(0, 10);
      let health = []; for (const base of vsUrl()) { const t0 = now(); try { const tm = withTimeout(4000); const r = await fetch(base + '/health', {headers: vsHead(), signal: tm.signal}); tm.done(); health.push({url: base, ok: r.ok, ms: now() - t0, ...(await r.json().catch(() => ({})))}); } catch (e) { health.push({url: base, ok: false, error: e.message}); } }
      return {ok: true, settings: V(), active: activeCalls(), servers: health,
        stt: Object.fromEntries(Object.entries(STT_PROVIDERS).map(([k, f]) => [k, f()])), tts: Object.fromEntries(Object.entries(TTS_PROVIDERS).map(([k, f]) => [k, f()])),
        today: q("SELECT COUNT(*) calls, COALESCE(SUM(secs),0) secs, COALESCE(SUM(tokens),0) tokens, COALESCE(SUM(usd),0) usd FROM voice_calls WHERE started_at>?").get(now() - 864e5),
        recent: q('SELECT v.*, u.first_name FROM voice_calls v LEFT JOIN users u ON u.tg_id=v.tg_id ORDER BY started_at DESC LIMIT 40').all(),
        spend: q("SELECT day, area, provider, SUM(usd) usd, SUM(tin) units FROM ai_spend WHERE area LIKE 'voice-%' AND day>=? GROUP BY day, area, provider ORDER BY day DESC").all(d)};
    },
    'GET /api/admin/voice/call': async (req, b, u, url) => ({ok: true, call: q('SELECT * FROM voice_calls WHERE id=?').get(String(url.searchParams.get('id'))), turns: q('SELECT * FROM voice_turns WHERE call_id=? ORDER BY id').all(String(url.searchParams.get('id')))}),
    // try a voice from the admin: returns a clip id to play
    'POST /api/admin/voice/test': async (req, b) => { const id = tts(String(b.text || 'Heyyy! Zara here. Ready to take the next signal together?'), {tier: b.tier === 'premium' ? 'premium' : 'standard', ai: String(b.ai || '')});
      if (!id) return {ok: false, error: 'no_voice_provider'}; try { if (pending.has(id)) await pending.get(id); } catch (e) { return {ok: false, error: e.message}; } return {ok: true, clip: id}; },
  });
  // calls whose app stopped pinging (closed Telegram, lost signal) are ended after 90 seconds
  const sweep = () => { for (const r of q('SELECT id FROM voice_calls WHERE ended_at IS NULL AND last_at<?').all(now() - 90e3)) end(r.id, 'dropped'); };
  return {routes, stt, tts, splitSentences, sweep, activeCalls, end};
}
