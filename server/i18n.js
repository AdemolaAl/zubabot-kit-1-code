// Languages: the whole app, the bot and every message in the user's own language.
// - LANGS: the languages we support. English is the source; the others are switched on in Admin -> Languages.
// - Dictionary: English text -> translation. Seeds ship in server/i18n/<lang>.json (made before launch); anything new
//   (a new screen, a new flow, a new nudge) is translated by the AI the first time it shows up, saved, and can be edited.
// - Numbers, money and names are taken out before looking a text up ("You won $8.70, Tobi" -> "You won {0}, {1}"),
//   so one translation covers every amount and every name. The app uses the exact same rule (web/zubabot-i18n.js).
// - Local AI traders: each language has its own roster (local names, descriptions and personalities written natively),
//   stored in server/i18n/roster-<lang>.json + edits in the database. They only appear in that language's app and funnels.
import fs from 'node:fs';
import path from 'node:path';

export const LANGS = {
  en: {n: 'English', flag: '🇬🇧', ai: 'English'},
  pt: {n: 'Português (Brasil)', flag: '🇧🇷', ai: 'Brazilian Portuguese (casual, "você", natural Brazilian chat style)', kokoro: 'pt-br', voiceF: 'pf_dora', voiceM: 'pm_alex', stt: 'pt'},
  es: {n: 'Español', flag: '🇪🇸', ai: 'Latin American Spanish (neutral, casual, "tú", no Spain-only slang)', kokoro: 'es', voiceF: 'ef_dora', voiceM: 'em_alex', stt: 'es'},
  tl: {n: 'Taglish', flag: '🇵🇭', ai: 'Taglish: the natural Filipino mix of Tagalog and English that Filipinos use when they chat (mostly Tagalog grammar, English words where Filipinos naturally use them: trade, deposit, signal, account, app). Friendly, light "po" only where respectful', stt: 'tl'},
  fr: {n: 'Français', flag: '🇫🇷', ai: 'French (friendly, "tu", natural for French-speaking Africa and France)', kokoro: 'fr-fr', voiceF: 'ff_siwis', stt: 'fr'},
  th: {n: 'ไทย', flag: '🇹🇭', ai: 'Thai (friendly and natural, neutral politeness; in UI text avoid gendered particles ครับ/ค่ะ, in chat replies the AI may use the one matching its own gender)', stt: 'th'},
};
export const isLang = (l) => Object.prototype.hasOwnProperty.call(LANGS, l);

/* ---------- the shared rule: take numbers and names out of a text ---------- */
const NUM = /[+\-−]?[$€£₦]?\d(?:[\d,.:]*\d)?(?:%|[kKMx×](?![A-Za-z]))?/g;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// returns {key, vals} or null when there is nothing to translate (no letters)
export function norm(text, names = []) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!/[A-Za-z]{2}/.test(s)) return null;
  const nameRe = names.length ? new RegExp('(?<![\\p{L}\\p{N}])(' + names.filter((n) => n && n.length > 1).sort((a, b) => b.length - a.length).map(esc).join('|') + ')(?![\\p{L}\\p{N}])', 'gu') : null;
  const hits = [];
  for (const m of s.matchAll(NUM)) hits.push([m.index, m[0]]);
  if (nameRe) for (const m of s.matchAll(nameRe)) hits.push([m.index, m[0]]);
  hits.sort((a, b) => a[0] - b[0] || b[1].length - a[1].length);
  let out = '', i = 0, k = 0; const vals = [];
  for (const [at, v] of hits) { if (at < i) continue; out += s.slice(i, at) + '{' + k++ + '}'; vals.push(v); i = at + v.length; }
  out += s.slice(i);
  if (!/[A-Za-z]{2}/.test(out.replace(/\{\d+\}/g, ''))) return null;
  return {key: out, vals};
}
export const fill = (t, vals) => String(t).replace(/\{(\d+)\}/g, (m, n) => (vals[+n] !== undefined ? vals[+n] : m));

export function makeI18n({db, q, now, engine, settings}) {
  let SEC = null;
  db.exec(`CREATE TABLE IF NOT EXISTS i18n(lang TEXT, key TEXT, text TEXT, src TEXT, at INTEGER, PRIMARY KEY(lang, key));
    CREATE TABLE IF NOT EXISTS i18n_miss(lang TEXT, key TEXT, n INTEGER DEFAULT 1, at INTEGER, PRIMARY KEY(lang, key));
    CREATE TABLE IF NOT EXISTS ai_roster(lang TEXT, ai TEXT, data TEXT, at INTEGER, PRIMARY KEY(lang, ai));
    CREATE TABLE IF NOT EXISTS languages(code TEXT PRIMARY KEY, live INTEGER DEFAULT 0, at INTEGER);`);
  const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'i18n');
  const seedCache = {};
  const seed = (lang) => { if (seedCache[lang]) return seedCache[lang]; let d = {}; try { d = JSON.parse(fs.readFileSync(path.join(DIR, lang + '.json'), 'utf8')); } catch (e) {} return (seedCache[lang] = d); };
  const rosterSeed = (lang) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'roster-' + lang + '.json'), 'utf8')); } catch (e) { return {}; } };
  // the dictionary in memory: seed + database (AI-filled and team edits win over the seed)
  const mem = {};
  function dict(lang) {
    if (mem[lang]) return mem[lang];
    const m = new Map(Object.entries(seed(lang)));
    for (const r of q('SELECT key, text FROM i18n WHERE lang=?').all(lang)) m.set(r.key, r.text);
    return (mem[lang] = m);
  }
  const version = (lang) => (q('SELECT COALESCE(MAX(at),0) v, COUNT(*) n FROM i18n WHERE lang=?').get(lang) || {});
  function put(lang, key, text, src) {
    q('INSERT INTO i18n(lang,key,text,src,at) VALUES(?,?,?,?,?) ON CONFLICT(lang,key) DO UPDATE SET text=excluded.text, src=excluded.src, at=excluded.at').run(lang, key, String(text), src, now());
    dict(lang).set(key, String(text)); q('DELETE FROM i18n_miss WHERE lang=? AND key=?').run(lang, key); soon(lang);
  }
  /* ---------- web/i18n/<lang>.js: what the app loads before its first paint (rewritten a few seconds after any change) ---------- */
  const WEB = process.env.WEB_DIR || path.join(DIR, '..', '..', 'web');
  const timers = {};
  const soon = (lang) => { clearTimeout(timers[lang]); timers[lang] = setTimeout(() => { try { writeStatic(lang); } catch (e) { console.warn('[i18n] write', lang, e.message); } }, 3000); timers[lang].unref?.(); };
  function writeStatic(lang) {
    if (!isLang(lang) || lang === 'en') return false;
    const m = ((settings.get('mentors') || {})[lang]) || {};
    let videos = []; try { videos = fs.readdirSync(path.join(WEB, 'academy', lang)).filter((f) => f.endsWith('.mp4')).map((f) => f.replace(/\.mp4$/, '')); } catch (e) {}
    const data = {lang, v: version(lang).v || 0, dict: Object.fromEntries(dict(lang)), roster: roster(lang), videos, support: ((settings.get('i18n') || {}).support || {})[lang] || '',
      mentor: m.name ? {name: m.name, role: m.role, bio: m.bio, photo: m.photo, times: m.times, tz: m.tz, offset: m.offset, link: m.link, on: !!(m.on && m.name)} : null};
    try { fs.mkdirSync(path.join(WEB, 'i18n'), {recursive: true}); } catch (e) { return false; }
    const tmp = path.join(WEB, 'i18n', lang + '.js.tmp'); fs.writeFileSync(tmp, 'window.ZB_I18N=' + JSON.stringify(data) + ';\n'); fs.renameSync(tmp, path.join(WEB, 'i18n', lang + '.js'));
    return true;
  }
  const writeAll = () => { for (const l of Object.keys(LANGS)) if (l !== 'en') { try { writeStatic(l); } catch (e) {} } };

  /* ---------- AI translation (batches, JSON in / JSON out) ---------- */
  const STYLE = `You translate text for Zubabot, a Telegram mini app where friendly AI traders help people trade with their own IQ Option account.
Rules:
- Keep every placeholder like {0} {1} {name} {mentor} exactly as it is (they are numbers, money or names). You may move them to where the grammar needs them.
- Keep emojis, line breaks, and these names exactly: Zubabot, IQ Option, Affstore, Telegram, USDT, BTC, OTC, MAX, Pro, AI trader names.
- Short and natural, like a real app in that language: same meaning and energy, never longer than needed. Buttons stay short.
- Trading words: use what traders in that country really say (many keep English words like "trade", "signal", "stop loss").
- Never add promises of profit. Money stays "their own trading capital in their IQ Option account".
- Some texts are pieces of a sentence (UI fragments). Translate each piece on its own, keeping a leading/trailing space meaning.
Return ONLY a JSON array of strings, same order and same count as the input.`;
  async function aiTranslate(lang, keys) {
    if (!keys.length || !isLang(lang) || lang === 'en') return [];
    const out = [];
    for (let i = 0; i < keys.length; i += 60) {
      const part = keys.slice(i, i + 60);
      const txt = await engine.call('translate', [{type: 'text', text: STYLE}], [{role: 'user', content: `Target language: ${LANGS[lang].ai}\n\nTranslate these ${part.length} texts:\n${JSON.stringify(part)}`}], 4000);
      const m = String(txt).match(/\[[\s\S]*\]/); let arr = []; try { arr = JSON.parse(m ? m[0] : '[]'); } catch (e) {}
      if (!Array.isArray(arr) || arr.length !== part.length) throw new Error('translate_bad_reply');
      part.forEach((k, j) => { const t = String(arr[j] || ''); const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
        if (t && ph(t) === ph(k)) { put(lang, k, t, 'ai'); out.push([k, t]); } });
    }
    return out;
  }
  // texts waiting for the AI: grouped and sent every few seconds
  const queue = {}; let running = false;
  function want(lang, keys) {
    if (!isLang(lang) || lang === 'en') return;
    const d = dict(lang); const set = (queue[lang] = queue[lang] || new Set());
    for (const k of keys) if (k && k.length <= 600 && !d.has(k)) { set.add(k); q('INSERT INTO i18n_miss(lang,key,n,at) VALUES(?,?,1,?) ON CONFLICT(lang,key) DO UPDATE SET n=n+1, at=excluded.at').run(lang, k, now()); }
  }
  async function flush() {
    if (running) return; running = true;
    try { for (const lang of Object.keys(queue)) { const keys = [...queue[lang]].slice(0, 240); keys.forEach((k) => queue[lang].delete(k)); if (keys.length && engine.live() && !engine.overBudget()) { try { await aiTranslate(lang, keys); } catch (e) { console.warn('[i18n]', lang, e.message); } } } }
    finally { running = false; }
  }
  setInterval(() => flush().catch(() => {}), 4000).unref?.();

  /* ---------- server texts (bot messages, nudges, flows, sales) ---------- */
  const lv = () => settings.get('lives') || {};
  // English AI names -> this language's local names, so "Zara here" becomes "Camila aquí" in Spanish
  let AIS_EN = () => [];
  const setAis = (fn) => { AIS_EN = fn; };
  const nameMap = (lang) => { const r = roster(lang); const m = new Map(); for (const a of AIS_EN()) { const loc = r[a.key] && r[a.key].name; if (loc && a.name) m.set(a.name, loc); }
    const mt = (settings.get('mentors') || {})[lang]; if (mt && mt.name) m.set(lv().mentor || 'Roland', mt.name);
    const sp = ((settings.get('i18n') || {}).support || {})[lang]; if (sp) m.set((settings.get('support') || {}).name || 'Emily', sp);
    return m; };
  const namesFor = (lang, extra = []) => [...extra, lv().mentor || 'Roland', (settings.get('support') || {}).name || 'Emily', 'Zubabot', 'IQ Option', ...rosterNames(lang), ...AIS_EN().map((a) => a.name)];
  // translate one text now (waits for the AI up to `wait` ms the first time; then it's instant forever)
  async function tr(lang, text, {names = [], wait = 9000} = {}) {
    if (!lang || lang === 'en' || !isLang(lang) || !text) return text;
    return String(text).split('\n').length > 1 ? (await Promise.all(String(text).split('\n').map((l) => tr(lang, l, {names, wait})))).join('\n') : (async () => {
      const n = norm(text, namesFor(lang, names)); if (!n) return text;
      const d = dict(lang); let t = d.get(n.key);
      if (t === undefined && engine.live() && !engine.overBudget()) { try { await Promise.race([aiTranslate(lang, [n.key]), new Promise((r) => setTimeout(r, wait))]); } catch (e) {} t = d.get(n.key); }
      if (t === undefined) { want(lang, [n.key]); return text; }
      const lead = String(text).match(/^\s*/)[0], tail = String(text).match(/\s*$/)[0]; const nm = nameMap(lang);
      return lead + fill(t, n.vals.map((v) => nm.get(v) || v)) + tail;
    })();
  }
  const trAll = (lang, texts, o) => Promise.all((texts || []).map((t) => tr(lang, t, o)));
  // free text (a teammate's reply, a user's message for the team): translated once, not saved in the dictionary
  async function free(lang, text) {
    if (!text || !isLang(lang) || !engine.live() || engine.overBudget()) return null;
    const out = await engine.call('translate', [{type: 'text', text: `Translate the user's message into ${LANGS[lang].ai}. It is a chat message between Zubabot support and a customer. Keep the tone, emojis, names, numbers and links. If it is already in that language, return it unchanged. Return ONLY the translation.`}], [{role: 'user', content: String(text).slice(0, 3000)}], 1200);
    return String(out || '').trim() || null;
  }

  /* ---------- local AI rosters ---------- */
  const rosterMem = {};
  function roster(lang) {
    if (!lang || lang === 'en') return {};
    if (rosterMem[lang]) return rosterMem[lang];
    const r = {...rosterSeed(lang)};
    for (const row of q('SELECT ai, data FROM ai_roster WHERE lang=?').all(lang)) { try { r[row.ai] = {...(r[row.ai] || {}), ...JSON.parse(row.data)}; } catch (e) {} }
    return (rosterMem[lang] = r);
  }
  // every region's local AI traders (they post signals like the others, and only show in their own region)
  const localAis = () => { const out = []; for (const l of Object.keys(LANGS)) { if (l === 'en') continue; for (const [k, a] of Object.entries(roster(l))) if (a && a.local && a.on !== false && a.name) out.push({key: k, name: a.name, style: a.style, market: a.mk || 'forex', price: +a.price || 0, min: +a.min || 20, desc: a.desc, vibe: a.vibe, lang: l}); } return out; };
  const rosterNames = (lang) => Object.values(roster(lang)).map((a) => a && a.name).filter(Boolean);
  const aiName = (lang, key, fallback) => (roster(lang)[key] || {}).name || fallback;
  function setRoster(lang, ai, data) {
    const cur = (roster(lang)[ai]) || {}; const next = {...cur};
    for (const k of ['name', 'style', 'desc', 'vibe', 'on', 'he', 'mk', 'tier', 'photo', 'cat', 'local', 'price', 'min']) if (data[k] !== undefined)
      next[k] = k === 'on' || k === 'local' ? !!data[k] : k === 'price' || k === 'min' ? Math.max(0, Math.min(100000, +data[k] || 0)) : String(data[k]).slice(0, k === 'vibe' ? 300 : 160);
    q('INSERT INTO ai_roster(lang,ai,data,at) VALUES(?,?,?,?) ON CONFLICT(lang,ai) DO UPDATE SET data=excluded.data, at=excluded.at').run(lang, ai, JSON.stringify(next), now());
    delete rosterMem[lang]; soon(lang); return next;
  }
  // one click: write local AI traders for a language from the English roster (names that fit each face's gender)
  async function makeRoster(lang, ais, {only} = {}) {
    const list = ais.filter((a) => !only || only.includes(a.key)); let done = 0;
    for (let i = 0; i < list.length; i += 18) {
      const part = list.slice(i, i + 18).map((a) => ({key: a.key, name: a.name, gender: a.gender || '', style: a.style, desc: a.desc, vibe: a.vibe || ''}));
      const txt = await engine.call('translate', [{type: 'text', text: `You create local versions of AI trader characters for Zubabot in ${LANGS[lang].ai}.
For each trader: a first name that people in that country really use and that fits the gender ("She" = woman, "He" = man; keep it short, 1 word), the style label translated, the one-line description rewritten natively (not word for word), and the personality ("vibe") rewritten natively so the AI sounds like a local person of that energy.
Names must all be different from each other. No famous people. Return ONLY a JSON array: [{"key","name","style","desc","vibe"}] in the same order.`}],
      [{role: 'user', content: JSON.stringify(part)}], 6000);
      const m = String(txt).match(/\[[\s\S]*\]/); let arr = []; try { arr = JSON.parse(m ? m[0] : '[]'); } catch (e) {}
      for (const a of arr) if (a && a.key && part.some((p) => p.key === a.key) && a.name) { setRoster(lang, a.key, a); done++; }
    }
    return done;
  }

  /* ---------- languages on/off ---------- */
  function isLive(lang) { if (lang === 'en') return true; const r = q('SELECT live FROM languages WHERE code=?').get(lang); return !!(r && r.live); }
  const setLive = (lang, on) => q('INSERT INTO languages(code,live,at) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET live=excluded.live, at=excluded.at').run(lang, on ? 1 : 0, now());

  function stats(lang) {
    const d = dict(lang); const src = q('SELECT src, COUNT(*) n FROM i18n WHERE lang=? GROUP BY src').all(lang);
    return {code: lang, ...LANGS[lang], live: isLive(lang), strings: d.size, seed: Object.keys(seed(lang)).length, ai: (src.find((x) => x.src === 'ai') || {}).n || 0, edited: (src.find((x) => x.src === 'edit') || {}).n || 0,
      missing: (q('SELECT COUNT(*) n FROM i18n_miss WHERE lang=?').get(lang) || {}).n || 0, roster: Object.keys(roster(lang)).length,
      support: ((settings.get('i18n') || {}).support || {})[lang] || '', mentor: (((settings.get('mentors') || {})[lang]) || {}).name || '', mentorOn: !!((((settings.get('mentors') || {})[lang]) || {}).on)};
  }

  const routes = {
    // the app: everything added after the shipped seed (AI-filled + edits), plus the local AI traders
    'GET /api/i18n/dict': async (req, b, u, url) => {
      const lang = String(url.searchParams.get('lang') || ''); if (!isLang(lang) || lang === 'en') return {ok: true, lang: 'en', dict: {}, roster: {}};
      const since = +url.searchParams.get('since') || 0; const full = url.searchParams.get('full') === '1';
      const dict_ = full ? Object.fromEntries(dict(lang)) : Object.fromEntries(q('SELECT key, text FROM i18n WHERE lang=? AND at>?').all(lang, since).map((r) => [r.key, r.text]));
      return {ok: true, lang, v: version(lang).v || 0, dict: dict_, roster: roster(lang)};
    },
    // the app found texts it has no translation for: answer what we have, the AI does the rest in a few seconds
    'POST /api/i18n/miss': async (req, b) => {
      const lang = String(b.lang || ''); if (!isLang(lang) || lang === 'en') return {ok: true, dict: {}};
      const keys = (Array.isArray(b.keys) ? b.keys : []).slice(0, 150).map((k) => String(k).slice(0, 600)).filter((k) => /[A-Za-z]{2}/.test(k));
      const d = dict(lang); const have = {}; const need = [];
      for (const k of keys) { const t = d.get(k); if (t !== undefined) have[k] = t; else need.push(k); }
      if (need.length) { want(lang, need); if (b.wait) { await Promise.race([flush(), new Promise((r) => setTimeout(r, 12000))]); for (const k of need) { const t = d.get(k); if (t !== undefined) have[k] = t; } } }
      return {ok: true, dict: have, pending: need.filter((k) => !(k in have)).length};
    },
    'GET /api/admin/languages': async () => ({ok: true, langs: Object.keys(LANGS).filter((l) => l !== 'en').map(stats)}),
    'POST /api/admin/languages/live': async (req, b) => { const l = String(b.lang); if (!isLang(l) || l === 'en') return [400, {ok: false}]; setLive(l, !!b.on); soon(l); return {ok: true, ...stats(l)}; },
    // one click: translate everything that's still missing (texts the app and bot reported) with the AI
    'POST /api/admin/languages/fill': async (req, b) => {
      const l = String(b.lang); if (!isLang(l) || l === 'en') return [400, {ok: false}];
      const keys = q('SELECT key FROM i18n_miss WHERE lang=? ORDER BY n DESC LIMIT 600').all(l).map((r) => r.key).filter((k) => !dict(l).has(k));
      if (!engine.live()) return {ok: false, error: 'no_ai_key'};
      let n = 0; try { n = (await aiTranslate(l, keys)).length; } catch (e) { return {ok: false, error: e.message, done: n}; }
      return {ok: true, done: n, ...stats(l)};
    },
    'GET /api/admin/languages/strings': async (req, b, u, url) => {
      const l = String(url.searchParams.get('lang')); if (!isLang(l)) return [400, {ok: false}]; const s = String(url.searchParams.get('q') || '').toLowerCase();
      const only = url.searchParams.get('only') || ''; const rows = [];
      const edited = new Map(q('SELECT key, src FROM i18n WHERE lang=?').all(l).map((r) => [r.key, r.src]));
      for (const [k, t] of dict(l)) { if (s && !k.toLowerCase().includes(s) && !String(t).toLowerCase().includes(s)) continue; const src = edited.get(k) || 'seed'; if (only && src !== only) continue; rows.push({key: k, text: t, src}); if (rows.length >= 200) break; }
      const miss = only === 'missing' || !only ? q('SELECT key, n FROM i18n_miss WHERE lang=? ORDER BY n DESC LIMIT 50').all(l).filter((r) => !s || r.key.toLowerCase().includes(s)) : [];
      return {ok: true, rows, missing: miss};
    },
    'POST /api/admin/languages/string': async (req, b, u, url, who) => { const l = String(b.lang); if (!isLang(l) || l === 'en' || !b.key) return [400, {ok: false}];
      b.text = String(b.text || '').replace(/[<>]/g, ''); if (SEC) { const g = await SEC.check(b.text, {source: 'translation edit (' + l + ')', who: who ? who.name : ''}); if (!g.ok) return [400, {ok: false, error: 'Blocked for security review (#' + g.id + ')'}]; }
      const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(); if (ph(b.text) !== ph(b.key)) return [400, {ok: false, error: 'keep_the_placeholders', need: ph(b.key)}];
      put(l, String(b.key), String(b.text || '').slice(0, 1200), 'edit'); return {ok: true}; },
    // the region's lead mentor and support name
    'POST /api/admin/languages/region': async (req, b, u, url, who) => {
      const l = String(b.lang); if (!isLang(l) || l === 'en') return [400, {ok: false}];
      if (b.mentor && typeof b.mentor === 'object') { const m = b.mentor; const cur = (settings.get('mentors') || {})[l] || {};
        const times = Array.isArray(m.times) ? m.times.map(String).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).slice(0, 8) : cur.times;
        if (m.on && !(m.link || cur.link)) return [400, {ok: false, error: 'add the live link first (Telegram or YouTube live), then switch the lives on'}];
        const clean = (x, n) => String(x ?? '').replace(/[<>{}"]/g, '').trim().slice(0, n); const photo = String(m.photo ?? cur.photo ?? '').trim().slice(0, 300); const link = String(m.link ?? cur.link ?? '').trim().slice(0, 300);
        if (photo && !/^(\/api\/mphoto\?n=[a-z0-9-]+|mentors\/[a-z0-9_-]+\.(jpg|png|webp)|https:\/\/[^\s\"'<>()]+)$/i.test(photo)) return [400, {ok: false, error: 'photo: upload it, or use an https:// image link'}];
        if (link && !/^https:\/\/[^\s"'<>]+$/.test(link)) return [400, {ok: false, error: 'the live link must start with https://'}];
        if (link && SEC) { const g = await SEC.check(link, {source: 'region live link (' + l + ')', who: who ? who.name : ''}); if (!g.ok) return [400, {ok: false, error: 'Blocked for security review (#' + g.id + ')'}]; }
        if (SEC && SEC.notify && (link !== (cur.link || '') || clean(m.name ?? cur.name, 30) !== (cur.name || ''))) SEC.notify(`🔐 ${LANGS[l].n} lead mentor changed by ${who ? who.name : 'someone'}\nName: ${cur.name || '—'} → ${clean(m.name ?? cur.name, 30) || '—'}\nLive link: ${cur.link || '—'} → ${link || '—'}`, 'rm' + l + now());
        settings.set('mentors', {[l]: {name: clean(m.name ?? cur.name, 30), role: clean(m.role ?? cur.role ?? 'Lead mentor', 40), bio: clean(m.bio ?? cur.bio, 300),
          photo, times, tz: String(m.tz ?? cur.tz ?? '').slice(0, 10), offset: Math.max(-12, Math.min(14, +(m.offset ?? cur.offset ?? 0))), link, on: !!(m.on ?? cur.on)}}, who && who.name); }
      if (b.support !== undefined) settings.set('i18n', {support: {[l]: String(b.support).replace(/[<>{}"]/g, '').trim().slice(0, 30)}}, who && who.name);
      soon(l); return {ok: true, mentor: (settings.get('mentors') || {})[l], support: ((settings.get('i18n') || {}).support || {})[l]};
    },
    'GET /api/admin/languages/region': async (req, b, u, url) => { const l = String(url.searchParams.get('lang')); return {ok: true, mentor: (settings.get('mentors') || {})[l] || null, support: ((settings.get('i18n') || {}).support || {})[l] || ''}; },
    'GET /api/admin/languages/roster': async (req, b, u, url) => { const l = String(url.searchParams.get('lang')); if (!isLang(l)) return [400, {ok: false}]; return {ok: true, roster: roster(l)}; },
    'POST /api/admin/languages/roster': async (req, b, u, url, who) => { const l = String(b.lang); if (!isLang(l) || l === 'en' || !b.ai) return [400, {ok: false}]; const k = String(b.ai).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30); if (!k) return [400, {ok: false}];
      const d = b.data || {}; for (const f of ['name', 'style', 'desc', 'vibe', 'he', 'cat', 'mk', 'tier']) if (d[f] !== undefined) d[f] = String(d[f]).replace(/[<>{}"]/g, '').slice(0, f === 'desc' || f === 'vibe' ? 400 : 60);
      if (d.photo !== undefined && d.photo && !/^(faces\/[a-z0-9_-]+\.(jpg|png|webp)|\/api\/mphoto\?n=[a-z0-9-]+|https:\/\/[^\s"'<>()]+)$/i.test(String(d.photo))) return [400, {ok: false, error: 'bad photo'}];
      if (SEC) { const g = await SEC.check([d.name, d.desc, d.vibe].filter(Boolean).join('\n'), {source: 'local AI edit (' + l + ')', who: who ? who.name : ''}); if (!g.ok) return [400, {ok: false, error: 'Blocked for security review (#' + g.id + ')'}]; } return {ok: true, ai: setRoster(l, k, b.data || {})}; },
  };
  return {setSecurity: (x) => { SEC = x; }, LANGS, localAis, writeStatic, writeAll, setAis, nameMap, norm, fill, tr, trAll, free, dict, want, flush, roster, aiName, rosterNames, setRoster, makeRoster, isLive, setLive, stats, routes, aiTranslate, put};
}
