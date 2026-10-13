// Zubabot strategy engine: trend-biased signals, scored against real prices at expiry, with martingale chains.
// Modes: off -> test (only testers see signals) -> live (everyone). Everything is editable from /admin.

export const DEFAULT_STRATEGY = {
  mode: 'live',                 // ready to use: real-data strategies for every AI. Switch to 'test' to try changes on testers only                 // 'off' | 'test' | 'live'
  everySec: 180,                // how often each pair can fire a new signal
  expiryMin: 1,                 // trade length shown to users
  trendBias: 0.7,               // 0.5 = pure coin flip, 1 = always with the trend
  emaFast: 9, emaSlow: 21,      // trend = fast EMA vs slow EMA on 1-minute closes
  trendMinPct: 0.01,            // % gap between EMAs needed to call it a trend (else "flat")
  skipFlat: false,              // true = no signal when there is no trend
  confMin: 72, confMax: 92,     // range for the "strength" shown in the app
  payout: 0.85,                 // used for simulated P/L
  baseStake: 1,                 // simulated stake for step 1
  martingale: {on: true, steps: 3, mult: 2.2, sameDir: true},
  maxOpenPerPair: 1,
  kind: 'digital',              // option type users trade in Signal Room: 'digital' | 'turbo'
  leadSec: 40,                  // how far ahead the entry time is (users get time to get ready)
  alignMinute: true,            // entry on a full minute (e.g. 14:32:00), like classic signal groups
  testers: [],                  // Telegram user ids that see TEST signals in the app
  // AIs that post signals. Users choose which ones they follow in Signal Room.
  // Each AI has its own strategy:
  //   random = 50/50 direction on a random pair from its list, on its own timer (for testing how everything works)
  //   trend  = the shared trend settings above (fast vs slow average, trend bias)
  //   custom = its own settings (bias, averages, min gap, skip flat, active hours)
  // pairs: [] = any pair that is on; or only its own pairs, e.g. ['EUR/USD OTC']. everySec: its own timer (0 = the shared one).
  ais: [
    {key: 'viza', on: true, expiry: 1, strategy: 'momentum'},       // scalper
    {key: 'luna', on: true, expiry: 5, strategy: 'momentum'},       // Zara, swing
    {key: 'mira', on: true, expiry: 5, strategy: 'momentum'},       // trend
    {key: 'blaze', on: true, expiry: 1, strategy: 'breakout'},   // breakout
    {key: 'remi', on: true, expiry: 15, strategy: 'reversal'},   // reversal
  ],
  // Every other AI trader in the app (not listed above) also posts signals with this default, so every AI is active.
  // Its pairs follow its market (crypto AIs -> crypto pairs, the rest -> forex/OTC pairs that are on).
  others: {on: true, strategy: 'auto', everySec: 600, expiry: 0},
  fallbackRandom: true,         // OTC / no price data: keep the AI active with a 50/50 pick (marked 'random'); false = only real-data setups
  // OTC pairs: priced only inside IQ Option, so results come from real trades (or you mark them)
  pairs: [
    {s: 'EUR/USD OTC', on: true, src: 'manual', trend: 'flat'},
    {s: 'GBP/USD OTC', on: true, src: 'manual', trend: 'flat'},
    {s: 'USD/JPY OTC', on: true, src: 'manual', trend: 'flat'},
    {s: 'AUD/CAD OTC', on: true, src: 'manual', trend: 'flat'},
    {s: 'EUR/JPY OTC', on: false, src: 'manual', trend: 'flat'},
    {s: 'GBP/JPY OTC', on: false, src: 'manual', trend: 'flat'},
    {s: 'NZD/USD OTC', on: false, src: 'manual', trend: 'flat'},
    {s: 'USD/CHF OTC', on: false, src: 'manual', trend: 'flat'},
  ],
};

export const STRATS = ['auto', 'momentum', 'reversal', 'breakout', 'trend', 'custom', 'random'];
// pick a strategy family from how the AI describes itself (used for 'auto')
export function familyOf(ai) {
  const t = `${ai.style || ''} ${ai.desc || ''} ${ai.vibe || ''}`.toLowerCase();
  if (/break|squeeze|take off|box|pattern|news|data days|spike|volatil/.test(t)) return 'breakout';
  if (/rsi|snap ?back|reversal|revers|overstretch|extreme|bounce|fade|fibonacci|61\.8|range|floor|ceiling|pullback|mean/.test(t)) return 'reversal';
  return 'momentum';
}
const rsiOf = (c, n = 14) => { let g = 0, l = 0; for (let i = c.length - n; i < c.length; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; } if (l === 0) return 100; return 100 - 100 / (1 + g / l); };
// the rules: real candles in, a setup (direction + a plain reason) out, or null when nothing is clean
export function setupOf(fam, cs) {
  if (!cs || cs.length < 40) return null;
  const c = cs.map((x) => x.c), last = c[c.length - 1];
  const e9 = ema(c.slice(-30), 9), e21 = ema(c.slice(-40), 21), r = rsiOf(c);
  const prev = cs.slice(-21, -1), hi = Math.max(...prev.map((x) => x.h)), lo = Math.min(...prev.map((x) => x.l));
  if (fam === 'reversal') {
    if (r < 30) return {dir: 'buy', strength: (30 - r) / 30, reason: `RSI is down at ${r.toFixed(0)}, stretched too far. Looking for the snap back up.`};
    if (r > 70) return {dir: 'sell', strength: (r - 70) / 30, reason: `RSI is up at ${r.toFixed(0)}, stretched too far. Looking for the drop back.`};
    return null;
  }
  if (fam === 'breakout') {
    if (last > hi) return {dir: 'buy', strength: 0.6, reason: 'Price just broke above the last 20-minute range.'};
    if (last < lo) return {dir: 'sell', strength: 0.6, reason: 'Price just broke below the last 20-minute range.'};
    return null;
  }
  if (e9 > e21 && last > e9 && r > 52 && r < 70) return {dir: 'buy', strength: Math.min(1, (r - 50) / 20), reason: 'Short-term trend is up and price is holding above it.'};
  if (e9 < e21 && last < e9 && r < 48 && r > 30) return {dir: 'sell', strength: Math.min(1, (50 - r) / 20), reason: 'Short-term trend is down and price is holding below it.'};
  return null;
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function ema(vals, n) { const k = 2 / (n + 1); let e = vals[0]; for (let i = 1; i < vals.length; i++) e = vals[i] * k + e * (1 - k); return e; }

export function createEngine({db, env = process.env, fetchFn = (...a) => fetch(...a), clock = () => Date.now(), random = Math.random, log = () => {}, allAis = () => []}) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS signals(
    id INTEGER PRIMARY KEY AUTOINCREMENT, pair TEXT, dir TEXT, source TEXT, mode TEXT,
    step INTEGER, chain_id INTEGER, stake REAL, conf INTEGER, trend TEXT, strength REAL,
    entry REAL, exit REAL, expiry_min INTEGER, created_at INTEGER, expires_at INTEGER,
    status TEXT, note TEXT);
  CREATE INDEX IF NOT EXISTS sig_open ON signals(status, expires_at);
  CREATE INDEX IF NOT EXISTS sig_mode ON signals(mode, created_at);`);
  const q = (s) => db.prepare(s);
  { const cols = q('PRAGMA table_info(signals)').all().map((c) => c.name);
    for (const [c, t] of [['ai', 'TEXT'], ['kind', 'TEXT'], ['entry_at', 'INTEGER'], ['result_src', 'TEXT']]) if (!cols.includes(c)) db.exec(`ALTER TABLE signals ADD COLUMN ${c} ${t}`); }
  const BIN = (env.BINANCE_BASE || 'https://api.binance.com').replace(/\/$/, '');
  const TD = (env.TWELVEDATA_BASE || 'https://api.twelvedata.com').replace(/\/$/, '');
  const TDKEY = env.TWELVEDATA_KEY || '';
  const nextAt = new Map();
  const cache = new Map();

  /* ---------- settings ---------- */
  const CUSTOM_DEF = {bias: 0.7, emaFast: 9, emaSlow: 21, minPct: 0.01, skipFlat: false, hours: ''};
  const normAi = (a) => ({key: a.key, on: a.on !== false, expiry: a.expiry || 1, strategy: STRATS.includes(a.strategy) ? a.strategy : 'auto', source: a.source === 'external' ? 'external' : 'auto',
    pairs: Array.isArray(a.pairs) ? a.pairs : [], everySec: +a.everySec || 0, custom: {...CUSTOM_DEF, ...(a.custom || {})}, note: a.note || ''});
  function getStrategy() {
    const r = q("SELECT value FROM settings WHERE key='strategy'").get();
    const s = r ? JSON.parse(r.value) : {};
    return {...DEFAULT_STRATEGY, ...s, martingale: {...DEFAULT_STRATEGY.martingale, ...(s.martingale || {})}, pairs: s.pairs || DEFAULT_STRATEGY.pairs, testers: s.testers || [], ais: (s.ais || DEFAULT_STRATEGY.ais).map(normAi), others: {...DEFAULT_STRATEGY.others, ...(s.others || {})}};
  }
  function setStrategy(patch) {
    const cur = getStrategy(), n = {...cur, ...patch, martingale: {...cur.martingale, ...(patch.martingale || {})}};
    // validate
    n.mode = ['off', 'test', 'live'].includes(n.mode) ? n.mode : cur.mode;
    n.everySec = clamp(Math.round(+n.everySec || cur.everySec), 30, 86400);
    n.expiryMin = clamp(Math.round(+n.expiryMin || cur.expiryMin), 1, 15);
    n.trendBias = clamp(+n.trendBias, 0.5, 1);
    n.emaFast = clamp(Math.round(+n.emaFast), 2, 100); n.emaSlow = clamp(Math.round(+n.emaSlow), n.emaFast + 1, 300);
    n.trendMinPct = clamp(+n.trendMinPct, 0, 5); n.skipFlat = !!n.skipFlat;
    n.confMin = clamp(Math.round(+n.confMin), 1, 99); n.confMax = clamp(Math.round(+n.confMax), n.confMin, 99);
    n.payout = clamp(+n.payout, 0.1, 1); n.baseStake = clamp(+n.baseStake, 0.01, 1e6);
    n.martingale.on = !!n.martingale.on; n.martingale.steps = clamp(Math.round(+n.martingale.steps), 1, 8);
    n.martingale.mult = clamp(+n.martingale.mult, 1, 5); n.martingale.sameDir = n.martingale.sameDir !== false;
    n.maxOpenPerPair = clamp(Math.round(+n.maxOpenPerPair || 1), 1, 5);
    n.kind = ['digital', 'turbo'].includes(n.kind) ? n.kind : 'digital';
    n.leadSec = clamp(Math.round(+n.leadSec || 0), 0, 300); n.alignMinute = !!n.alignMinute;
    const pairNames = (n.pairs || cur.pairs).map((p) => String(p.s || '').toUpperCase().trim());
    n.ais = (Array.isArray(n.ais) ? n.ais : cur.ais).filter((a) => a && a.key).map((a) => { const c = a.custom || {};
      const fast = clamp(Math.round(+c.emaFast || 9), 2, 100);
      return {key: String(a.key).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20), on: a.on !== false, expiry: [1, 2, 3, 5, 10, 15].includes(+a.expiry) ? +a.expiry : 1,
        strategy: STRATS.includes(a.strategy) ? a.strategy : 'auto', source: a.source === 'external' ? 'external' : 'auto',
        pairs: [...new Set((Array.isArray(a.pairs) ? a.pairs : String(a.pairs || '').split(',')).map((x) => String(x).toUpperCase().trim()).filter((x) => pairNames.includes(x)))],
        everySec: a.everySec ? clamp(Math.round(+a.everySec), 30, 86400) : 0,
        custom: {bias: clamp(+(c.bias ?? 0.7), 0, 1), emaFast: fast, emaSlow: clamp(Math.round(+c.emaSlow || 21), fast + 1, 300), minPct: clamp(+(c.minPct ?? 0.01), 0, 5), skipFlat: !!c.skipFlat,
          hours: /^\d{1,2}-\d{1,2}$/.test(String(c.hours || '').trim()) ? String(c.hours).trim() : ''},
        note: String(a.note || '').slice(0, 200)}; }).filter((a) => a.key);
    n.testers = [...new Set((Array.isArray(n.testers) ? n.testers : String(n.testers).split(/[\s,;]+/)).map((x) => String(x).replace(/\D/g, '')).filter(Boolean))];
    n.pairs = (n.pairs || []).filter((p) => p && p.s).map((p) => ({s: String(p.s).toUpperCase().trim(), on: !!p.on,
      src: ['binance', 'twelvedata', 'manual'].includes(p.src) ? p.src : 'manual',
      trend: ['auto', 'up', 'down', 'flat'].includes(p.trend) ? p.trend : 'auto'}));
    const o = {...DEFAULT_STRATEGY.others, ...(cur.others || {}), ...(patch.others || {})};
    n.fallbackRandom = n.fallbackRandom !== false;
    n.others = {on: o.on !== false && o.on !== 0, strategy: STRATS.includes(o.strategy) && o.strategy !== 'custom' ? o.strategy : 'auto', everySec: clamp(Math.round(+o.everySec || 900), 60, 86400), expiry: [0, 1, 2, 3, 5, 10, 15].includes(+o.expiry) ? +o.expiry : 0};
    q("INSERT INTO settings(key,value) VALUES('strategy',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(n));
    return n;
  }

  /* ---------- prices ---------- */
  const binSym = (s) => s.replace('/', '').replace(/USD$/, 'USDT');
  async function getJson(url) { const r = await fetchFn(url); if (!r.ok) throw new Error('http_' + r.status); return r.json(); }
  async function candles(p) {
    const key = p.src + p.s, c = cache.get(key); if (c && clock() - c.t < 30e3) return c.v;
    let closes = null;
    if (p.src === 'binance') { const d = await getJson(`${BIN}/api/v3/klines?symbol=${binSym(p.s)}&interval=1m&limit=80`); closes = d.map((k) => +k[4]); }
    else if (p.src === 'twelvedata' && TDKEY) { const d = await getJson(`${TD}/time_series?symbol=${encodeURIComponent(p.s)}&interval=1min&outputsize=80&apikey=${TDKEY}`); if (Array.isArray(d.values)) closes = d.values.map((v) => +v.close).reverse(); }
    if (closes && closes.length) cache.set(key, {t: clock(), v: closes});
    return closes;
  }
  async function price(p) {
    try {
      if (p.src === 'binance') return +(await getJson(`${BIN}/api/v3/ticker/price?symbol=${binSym(p.s)}`)).price || null;
      if (p.src === 'twelvedata' && TDKEY) { const d = await getJson(`${TD}/price?symbol=${encodeURIComponent(p.s)}&apikey=${TDKEY}`); return +d.price || null; }
    } catch (e) { log('price', p.s, e.message); }
    return null;
  }
  // high/low/close candles for the rule families. OTC pairs read the real pair (EUR/USD OTC -> EUR/USD) when Twelve Data is set up.
  async function candlesHL(p) {
    const real = p.src === 'manual' ? (TDKEY && /\bOTC\b/.test(p.s) ? {s: p.s.replace(/\s*OTC\s*/i, '').trim(), src: /BTC|ETH|SOL|XRP/.test(p.s) ? 'binance' : 'twelvedata'} : null) : p;
    if (!real) return null;
    const ttl = real.src === 'twelvedata' ? (+(env.TD_CACHE_SEC || 180)) * 1000 : 55e3;          // Twelve Data counts every call: keep it inside your plan
    const key = 'hl' + real.src + real.s, c0 = cache.get(key); if (c0 && clock() - c0.t < ttl) return c0.v;
    let cs = null;
    try {
      if (real.src === 'binance') { const d = await getJson(`${BIN}/api/v3/klines?symbol=${binSym(real.s)}&interval=1m&limit=60`); cs = d.map((k) => ({h: +k[2], l: +k[3], c: +k[4]})); }
      else if (real.src === 'twelvedata' && TDKEY) { const d = await getJson(`${TD}/time_series?symbol=${encodeURIComponent(real.s)}&interval=1min&outputsize=60&apikey=${TDKEY}`); if (Array.isArray(d.values)) cs = d.values.slice().reverse().map((v) => ({h: +v.high, l: +v.low, c: +v.close})); }
    } catch (e) { log('candles', real.s, e.message); }
    if (cs && cs.length) cache.set(key, {t: clock(), v: cs});
    return cs;
  }
  async function trendOf(p, st) {
    if (p.trend !== 'auto') return {trend: p.trend, strength: p.trend === 'flat' ? 0 : 0.6};
    try {
      const c = await candles(p); if (!c || c.length < st.emaSlow + 2) return {trend: 'flat', strength: 0, nodata: true};
      const f = ema(c, st.emaFast), s = ema(c, st.emaSlow), gapPct = (f - s) / s * 100;
      if (Math.abs(gapPct) < st.trendMinPct) return {trend: 'flat', strength: Math.abs(gapPct) / (st.trendMinPct || 1) * 0.3, gapPct, last: c[c.length - 1]};
      return {trend: gapPct > 0 ? 'up' : 'down', strength: clamp(Math.abs(gapPct) / ((st.trendMinPct || 0.01) * 5), 0.2, 1), gapPct, last: c[c.length - 1]};
    } catch (e) { log('trend', p.s, e.message); return {trend: 'flat', strength: 0, nodata: true}; }
  }

  /* ---------- signals ---------- */
  function entryTime(st, t) { let e = t + st.leadSec * 1000; if (st.alignMinute) e = Math.ceil(e / 60e3) * 60e3; return e; }
  async function create({pair, dir, source, mode, step = 1, chain = null, stake, conf, trend = 'manual', strength = 0, expiryMin, note = '', entry: entryIn = null, ai = null, entryAt = null, kind = null}) {
    const st = getStrategy(); const p = st.pairs.find((x) => x.s === pair) || {s: pair, src: 'manual'};
    const t = clock(); const exp = expiryMin || st.expiryMin; const eAt = entryAt != null ? entryAt : (step > 1 ? t : entryTime(st, t));
    const entry = eAt > t + 2000 ? null : (entryIn != null ? entryIn : await price(p));       // future entry: price captured at entry time
    const r = q(`INSERT INTO signals(pair,dir,source,mode,step,chain_id,stake,conf,trend,strength,entry,expiry_min,created_at,expires_at,status,note,ai,kind,entry_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?)`).run(pair, dir, source, mode, step, chain, stake ?? st.baseStake, conf, trend, strength, entry, exp, t, eAt + exp * 60e3, note, ai, kind || st.kind, eAt);
    const id = Number(r.lastInsertRowid); if (!chain) q('UPDATE signals SET chain_id=? WHERE id=?').run(id, id);
    return q('SELECT * FROM signals WHERE id=?').get(id);
  }
  // one signal from one AI on one pair, using that AI's own strategy
  async function generate(p, st, ai) {
    let how = ai ? ai.strategy : 'trend';
    if (how === 'auto') how = familyOf(ai.meta || ai);
    // rule families on real prices: trend (averages + RSI), reversal (RSI extremes), breakout (20-minute range)
    if (['momentum', 'reversal', 'breakout'].includes(how)) {
      const cs = await candlesHL(p);
      if (cs && cs.length >= 40) {
        const su = setupOf(how, cs); if (!su) return null;           // nothing clean right now: no signal, check again soon
        const conf = Math.round(st.confMin + (st.confMax - st.confMin) * clamp(0.45 + 0.5 * su.strength + (random() - 0.5) * 0.1, 0, 1));
        return create({pair: p.s, dir: su.dir, source: 'auto', mode: st.mode, conf, trend: how, strength: +su.strength.toFixed(3), entry: p.src === 'manual' ? null : cs[cs.length - 1].c, ai: ai.key, expiryMin: ai.expiry || st.expiryMin, note: su.reason});
      }
      if (!st.fallbackRandom) return null;
      how = 'random';                                                // no price data for this pair (OTC without a forex key): stay active
    }
    let tr = {trend: 'flat', strength: 0}, pBuy = 0.5, skipFlat = false;
    if (how === 'random') { tr = {trend: 'random', strength: random() * 0.6}; }
    else {
      const set = how === 'custom' ? {...st, emaFast: ai.custom.emaFast, emaSlow: ai.custom.emaSlow, trendMinPct: ai.custom.minPct} : st;
      const bias = how === 'custom' ? ai.custom.bias : st.trendBias; skipFlat = how === 'custom' ? ai.custom.skipFlat : st.skipFlat;
      tr = await trendOf(p, set);
      // bias above 0.5 trades with the trend, below 0.5 against it (reversal style)
      pBuy = tr.trend === 'up' ? bias : tr.trend === 'down' ? 1 - bias : 0.5;
    }
    if (skipFlat && tr.trend === 'flat') return null;
    const dir = random() < pBuy ? 'buy' : 'sell';
    const withTrend = (tr.trend === 'up' && dir === 'buy') || (tr.trend === 'down' && dir === 'sell');
    const base = withTrend ? 0.45 + 0.55 * tr.strength : 0.15 + 0.3 * random() + (how === 'random' ? 0.3 : 0);
    const conf = Math.round(st.confMin + (st.confMax - st.confMin) * clamp(base + (random() - 0.5) * 0.15, 0, 1));
    return create({pair: p.s, dir, source: 'auto', mode: st.mode, conf, trend: tr.trend, strength: +(+tr.strength || 0).toFixed(3), entry: tr.last ?? null, ai: ai && ai.key, expiryMin: ai ? ai.expiry : st.expiryMin, note: how === 'random' ? 'random' : how === 'custom' ? 'custom' : ''});
  }
  // active hours like "8-22" (WAT); empty = always
  const activeNow = (h) => { if (!h) return true; const [a, b] = h.split('-').map(Number); const x = new Date(clock() + 3600e3).getUTCHours(); return a <= b ? x >= a && x < b : x >= a || x < b; };
  async function resolveOpen() {
    const st = getStrategy();
    for (const s of q("SELECT * FROM signals WHERE status='open' AND entry IS NULL AND entry_at<=?").all(clock())) {   // capture entry price at entry time
      const p = st.pairs.find((x) => x.s === s.pair) || {s: s.pair, src: 'manual'}; if (p.src === 'manual') continue;
      const px = await price(p); if (px != null) q('UPDATE signals SET entry=? WHERE id=?').run(px, s.id);
    }
    const due = q("SELECT * FROM signals WHERE status='open' AND expires_at<=?").all(clock());
    for (const s of due) {
      const p = st.pairs.find((x) => x.s === s.pair) || {s: s.pair, src: 'manual'};
      const px = s.entry != null ? await price(p) : null;
      if (px == null) { if (clock() - s.expires_at > 10 * 60e3) q("UPDATE signals SET status='unresolved' WHERE id=?").run(s.id); continue; }
      const status = px === s.entry ? 'draw' : ((px > s.entry) === (s.dir === 'buy') ? 'win' : 'loss');
      await finish(s, status, px);
    }
  }
  async function finish(s, status, exit = null, src = 'price') {
    q('UPDATE signals SET status=?, exit=?, result_src=? WHERE id=?').run(status, exit, src, s.id);
    const st = getStrategy();
    // martingale: after a loss, open the next step straight away (only for auto/manual chains still within steps)
    if (status === 'loss' && st.martingale.on && s.step < st.martingale.steps && st.mode !== 'off') {
      const dir = st.martingale.sameDir ? s.dir : (s.dir === 'buy' ? 'sell' : 'buy');
      await create({pair: s.pair, dir, source: s.source, mode: s.mode, step: s.step + 1, chain: s.chain_id, stake: +(s.stake * st.martingale.mult).toFixed(2), conf: s.conf, trend: s.trend, strength: s.strength, expiryMin: s.expiry_min, note: 'martingale', ai: s.ai, kind: s.kind, entryAt: Math.max(clock(), s.expires_at || clock())});
    }
  }
  async function resolveManual(id, status) {
    const s = q('SELECT * FROM signals WHERE id=?').get(id); if (!s) throw new Error('not_found');
    if (!['win', 'loss', 'draw'].includes(status)) throw new Error('bad_status');
    if (s.status !== 'open' && s.status !== 'unresolved') throw new Error('already_resolved');
    await finish(s, status, null, 'admin'); return q('SELECT * FROM signals WHERE id=?').get(id);
  }
  // A real trade that copied the signal exactly (same pair, direction, expiry, step) settles signals that have no outside price (OTC).
  async function resolveFromTrade(id, status, {pair, dir, expiryMin} = {}) {
    const s = q('SELECT * FROM signals WHERE id=?').get(id); if (!s || !['win', 'loss', 'draw'].includes(status)) return null;
    if (s.status !== 'open' && s.status !== 'unresolved') return null;
    const p = getStrategy().pairs.find((x) => x.s === s.pair); if (p && p.src !== 'manual') return null;        // priced pairs are scored by price
    if (pair && pair !== s.pair) return null; if (dir && dir !== s.dir) return null; if (expiryMin && +expiryMin !== s.expiry_min) return null;
    if (clock() < s.expires_at - 5000) return null;
    await finish(s, status, null, 'trade'); return q('SELECT * FROM signals WHERE id=?').get(id);
  }
  let busy = false;
  async function tick() {
    if (busy) return; busy = true;
    try {
      await resolveOpen();
      const st = getStrategy(); if (st.mode === 'off') return;
      // one open signal per AI per pair (so many AIs can share the same pairs)
      const openOn = (pair, ai) => ai ? q("SELECT COUNT(*) n FROM signals WHERE pair=? AND ai=? AND status='open'").get(pair, ai).n : q("SELECT COUNT(*) n FROM signals WHERE pair=? AND status='open'").get(pair).n;
      const meta = Object.fromEntries(allAis().map((x) => [x.key, x])); const listed = st.ais.filter((a) => a.on && a.source !== 'external').map((a) => ({...a, meta: meta[a.key] || a}));
      // every other AI in the app gets the default strategy, with pairs that match its market
      const known = new Set(st.ais.map((a) => a.key)); const isCrypto = (p) => /BTC|ETH|SOL|XRP|LTC|DOGE|BNB|ADA/.test(p.s);
      const others = st.others.on ? allAis().filter((x) => x && x.key && !known.has(x.key)).map((x) => ({key: x.key, on: true, meta: x, expiry: st.others.expiry || ({scalp: 1, quick: 1}[x.tf] || [1, 1, 3, 5][x.key.length % 4]), strategy: st.others.strategy, everySec: st.others.everySec, custom: {},
        pairs: st.pairs.filter((p) => p.on && (x.market === 'crypto' ? isCrypto(p) : x.market === 'all' ? true : !isCrypto(p))).map((p) => p.s)})) : [];
      const ais = [...listed, ...others];
      if (!st.ais.filter((a) => a.on).length && !others.length) {                 // no AIs at all: one signal per pair on the shared timer
        for (const p of st.pairs.filter((x) => x.on)) { if (clock() < (nextAt.get(p.s) || 0) || openOn(p.s) >= st.maxOpenPerPair) continue;
          nextAt.set(p.s, clock() + st.everySec * 1000 * (0.85 + random() * 0.3)); try { await generate(p, st, null); } catch (e) { log('gen', p.s, e.message); } }
        return;
      }
      for (const ai of ais) {
        const k = 'ai:' + ai.key;
        if (!nextAt.has(k) && others.includes(ai)) { nextAt.set(k, clock() + (ai.everySec || st.everySec) * 1000 * random()); continue; }   // spread the other AIs' first signals out
        if (clock() < (nextAt.get(k) || 0)) continue;
        if (ai.strategy === 'custom' && !activeNow(ai.custom.hours)) continue;
        // its own pairs only (even if that pair is off for the others), or any pair that is on
        const pool = (ai.pairs.length ? st.pairs.filter((p) => ai.pairs.includes(p.s)) : st.pairs.filter((p) => p.on)).filter((p) => openOn(p.s, ai.key) < st.maxOpenPerPair);
        nextAt.set(k, clock() + (ai.everySec || st.everySec) * 1000 * (0.85 + random() * 0.3));   // small jitter so AIs don't fire together
        if (!pool.length) continue;
        const p = pool[Math.floor(random() * pool.length)];
        try { const made = await generate(p, st, ai); if (!made) nextAt.set(k, clock() + Math.min(120e3, (ai.everySec || st.everySec) * 250)); } catch (e) { log('gen', ai.key, p.s, e.message); }
      }
    } finally { busy = false; }
  }

  /* ---------- results board ---------- */
  function results({mode = 'test', hours = 24} = {}) {
    const st = getStrategy(); const since = clock() - hours * 3600e3;
    const rows = q("SELECT * FROM signals WHERE mode=? AND created_at>=? ORDER BY id").all(mode, since);
    const done = rows.filter((r) => ['win', 'loss', 'draw'].includes(r.status));
    const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
    const by = {}; for (const r of done) { const k = r.pair; by[k] = by[k] || {pair: k, n: 0, win: 0, loss: 0, draw: 0, withTrend: 0, withTrendWin: 0}; const o = by[k]; o.n++; o[r.status]++; const wt = (r.trend === 'up' && r.dir === 'buy') || (r.trend === 'down' && r.dir === 'sell'); if (wt) { o.withTrend++; if (r.status === 'win') o.withTrendWin++; } }
    const pairs = Object.values(by).map((o) => ({...o, winRate: pct(o.win, o.win + o.loss), withTrendWinRate: pct(o.withTrendWin, o.withTrend)}));
    const byAi = {}; for (const r of done) { const k = r.ai || '—'; byAi[k] = byAi[k] || {ai: k, n: 0, win: 0, loss: 0}; byAi[k].n++; if (r.status === 'win') byAi[k].win++; if (r.status === 'loss') byAi[k].loss++; }
    const ais = Object.values(byAi).map((o) => ({...o, winRate: pct(o.win, o.win + o.loss)}));
    const steps = {}; for (const r of done) { steps[r.step] = steps[r.step] || {step: r.step, n: 0, win: 0}; steps[r.step].n++; if (r.status === 'win') steps[r.step].win++; }
    // chains: a chain wins if any step wins; loses if the final allowed step loses
    const chains = {}; for (const r of rows) { (chains[r.chain_id] = chains[r.chain_id] || []).push(r); }
    let chainWon = 0, chainLost = 0, chainOpen = 0; const wonAt = {}; let pl = 0, peak = 0, dd = 0, lossStreak = 0, worstStreak = 0;
    for (const id of Object.keys(chains).sort((a, b) => a - b)) {
      const c = chains[id].sort((a, b) => a.step - b.step), last = c[c.length - 1];
      for (const r of c) { if (r.status === 'win') pl += r.stake * st.payout; else if (r.status === 'loss') pl -= r.stake; peak = Math.max(peak, pl); dd = Math.max(dd, peak - pl); }
      if (last.status === 'win') { chainWon++; wonAt[last.step] = (wonAt[last.step] || 0) + 1; lossStreak = 0; }
      else if (last.status === 'loss' && (last.step >= st.martingale.steps || !st.martingale.on)) { chainLost++; lossStreak++; worstStreak = Math.max(worstStreak, lossStreak); }
      else chainOpen++;
    }
    const w = done.filter((r) => r.status === 'win').length, l = done.filter((r) => r.status === 'loss').length;
    return {mode, hours, signals: rows.length, resolved: done.length, open: rows.filter((r) => r.status === 'open').length, unresolved: rows.filter((r) => r.status === 'unresolved').length,
      wins: w, losses: l, winRate: pct(w, w + l), pairs, ais, steps: Object.values(steps).map((s) => ({...s, winRate: pct(s.win, s.n)})),
      chains: {won: chainWon, lost: chainLost, open: chainOpen, recoveryRate: pct(chainWon, chainWon + chainLost), wonAtStep: wonAt, worstLosingStreak: worstStreak},
      simulated: {stake: st.baseStake, payout: st.payout, pl: Math.round(pl * 100) / 100, maxDrawdown: Math.round(dd * 100) / 100}};
  }
  function recent({mode, limit = 50} = {}) { return mode ? q('SELECT * FROM signals WHERE mode=? ORDER BY id DESC LIMIT ?').all(mode, limit) : q('SELECT * FROM signals ORDER BY id DESC LIMIT ?').all(limit); }
  function forUser(tgId, only) {
    const st0 = getStrategy(); const known = new Set(st0.ais.map((x) => x.key));
    const st = {...st0, ais: [...st0.ais.filter((x) => x.on && x.source !== 'hidden'), ...(st0.others.on ? allAis().filter((x) => x && x.key && !known.has(x.key)).map((x) => ({key: x.key, on: true, expiry: st0.others.expiry || 1})) : [])]}; const modes = st.mode === 'live' ? ['live'] : st.mode === 'test' && st.testers.includes(String(tgId)) ? ['test'] : [];
    if (st.testers.includes(String(tgId)) && !modes.includes('test')) modes.push('test');   // testers also see test runs while live
    if (!modes.length) return {mode: st.mode, now: clock(), kind: st.kind, martingale: st.martingale, ais: st.ais.map((x) => ({key: x.key, on: true, expiry: x.expiry})), pairs: st.pairs.filter((x) => x.on).map((x) => x.s), signals: [], recent: []};
    const ph = modes.map(() => '?').join(',');
    // only the AIs this person follows (the app sends them), so with every AI active they still see their own AIs' signals
    const keys = (Array.isArray(only) ? only : []).map((x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean).slice(0, 60);
    const aiF = keys.length ? ` AND ai IN (${keys.map(() => '?').join(',')})` : '';
    const open = q(`SELECT id,pair,dir,conf,step,chain_id,entry,expiry_min,expires_at,created_at,entry_at,ai,kind,mode,note FROM signals WHERE status='open' AND expires_at>? AND mode IN (${ph})${aiF} ORDER BY id DESC LIMIT 30`).all(clock(), ...modes, ...keys);
    const done = q(`SELECT id,pair,dir,step,chain_id,status,mode,ai,expiry_min,entry_at FROM signals WHERE status IN ('win','loss','draw') AND mode IN (${ph})${aiF} ORDER BY id DESC LIMIT 30`).all(...modes, ...keys);
    return {mode: st.mode, now: clock(), kind: st.kind, martingaleSteps: st.martingale.on ? st.martingale.steps : 1, martingale: st.martingale, ais: st.ais.map((x) => ({key: x.key, on: true, expiry: x.expiry})), pairs: st.pairs.filter((x) => x.on).map((x) => x.s), signals: open, recent: done};
  }
  // "Find me a trade": check this AI's rules on its pairs right now. Returns an open signal (existing or new) or why there is none.
  async function find(aiKey) {
    const st = getStrategy(); if (st.mode === 'off') return {none: 'off'};
    const open = q("SELECT * FROM signals WHERE ai=? AND status='open' AND step=1 AND entry_at>? AND mode=? ORDER BY entry_at LIMIT 1").get(aiKey, clock() + 10e3, st.mode === 'live' ? 'live' : 'test');
    if (open) return {signal: open, existing: true};
    const meta = (allAis().find((x) => x.key === aiKey)) || {key: aiKey};
    const own = st.ais.find((a) => a.key === aiKey);
    const isCrypto = (p) => /BTC|ETH|SOL|XRP|LTC|DOGE|BNB|ADA/.test(p.s);
    const ai = own ? {...own, meta} : {key: aiKey, meta, strategy: st.others.strategy, expiry: st.others.expiry || 1, custom: {}, pairs: st.pairs.filter((p) => p.on && (meta.market === 'crypto' ? isCrypto(p) : meta.market === 'all' ? true : !isCrypto(p))).map((p) => p.s)};
    if (own && own.source === 'external') return {none: 'external'};
    const pool = (ai.pairs && ai.pairs.length ? st.pairs.filter((p) => ai.pairs.includes(p.s)) : st.pairs.filter((p) => p.on)).sort(() => random() - 0.5);
    for (const p of pool) { const s = await generate(p, {...st, mode: st.mode === 'live' ? 'live' : 'test'}, ai); if (s) return {signal: s}; }
    return {none: 'no_setup'};
  }
  function resetTest() { return q("DELETE FROM signals WHERE mode='test'").run().changes; }

  return {getStrategy, setStrategy, tick, find, create, resolveManual, resolveFromTrade, results, recent, forUser, resetTest, _price: price, _trendOf: trendOf};
}
