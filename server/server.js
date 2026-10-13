// Zubabot backend: IQ Option OAuth (PKCE + offline access), Telegram auth, affiliate link check,
// invite codes, Affstore postbacks (registrations + deposits), rewards, AI chat (brain.js), crypto checkout (pay.js).
// Zero dependencies. Needs Node 22.13+ (uses built-in fetch and node:sqlite).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createEngine} from './strategy.js';
import {makeBrain} from './brain.js';
import {supportBot} from './support-bot.js';
import {referralRoutes} from './referral.js';
import {payRoutes} from './pay.js';
import {makeSettings} from './settings.js';
import {makeTeam} from './team.js';
import {makeEngine} from './ai-engine.js';
import {makeInbox} from './inbox.js';
import {makeVoice} from './voice.js';
import {makeAdminApi} from './admin-api.js';
import {makeSales} from './sales.js';
import {makeI18n} from './i18n.js';
import {makeFunnels} from './funnels.js';
import {makeSecurity} from './security.js';
import {makeNews} from './news.js';

/* ---------------- config ---------------- */
loadEnv(path.join(process.cwd(), '.env'));
const C = {
  port: +(process.env.PORT || 8080),
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  iqApi: (process.env.IQ_API_BASE || 'https://api.iqoption.com').replace(/\/$/, ''),
  clientId: process.env.IQ_CLIENT_ID || '',
  clientSecret: process.env.IQ_CLIENT_SECRET || '',
  redirectUri: process.env.IQ_REDIRECT_URI || '',
  scope: process.env.IQ_SCOPE || 'full offline_access',
  affId: process.env.AFF_ID || '',            // your IQ Option / Affstore affiliate ID  -> sent as ?aff=
  affModel: process.env.AFF_MODEL || '',
  trackPrefix: process.env.AFF_TRACK_PREFIX ?? 'Zubabot_',   // afftrack = Zubabot_tg<TelegramID>: shows as Zubabot in Affstore, still tells us the user      // optional, e.g. revshare / cpa         -> sent as ?aff_model=
  postbackKey: process.env.POSTBACK_KEY || '',
  adminKey: process.env.ADMIN_KEY || '',
  requireLink: process.env.REQUIRE_LINK !== '0',   // 0 = let any account in (testing only)
  allowOrigin: process.env.ALLOW_ORIGIN || '*',
  dbFile: process.env.DB_FILE || 'zubabot.db',
  devFakeTg: process.env.DEV_FAKE_TG === '1',      // never in production
  minDeposit: +(process.env.MIN_DEPOSIT || 20),     // = CPA qualifying FTD
  affLink: process.env.AFF_LINK || '',      // your IQ Option affiliate sign-up link, with {afftrack} where the sub-ID goes
};

/* ---------------- database ---------------- */
const db = new DatabaseSync(C.dbFile);
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(
  tg_id TEXT PRIMARY KEY, first_name TEXT, username TEXT,
  iq_user_id TEXT UNIQUE, linked INTEGER DEFAULT 0, link_source TEXT,
  refresh_token TEXT, access_token TEXT, access_expires INTEGER,
  created_at INTEGER, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS oauth_states(
  state TEXT PRIMARY KEY, tg_id TEXT, verifier TEXT, kind TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS aff_accounts(
  iq_user_id TEXT PRIMARY KEY, afftrack TEXT, source TEXT, registered_at INTEGER,
  ftd_at INTEGER, deposits_total REAL DEFAULT 0, withdrawals_total REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS invites(
  code TEXT PRIMARY KEY, iq_user_id TEXT, tg_id TEXT, note TEXT, created_at INTEGER, used_at INTEGER);
CREATE TABLE IF NOT EXISTS events(
  ext_id TEXT PRIMARY KEY, iq_user_id TEXT, afftrack TEXT, type TEXT, amount REAL, currency TEXT,
  raw TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS rewards(
  tg_id TEXT PRIMARY KEY, coins INTEGER DEFAULT 0, tokens INTEGER DEFAULT 0, credited_deposits REAL DEFAULT 0, flagged INTEGER DEFAULT 0);
`);
const q = (sql) => db.prepare(sql);
const now = () => Date.now();
// Safe database upgrades: new tables use CREATE TABLE IF NOT EXISTS; new columns go through addColumn(). Never drop or rename,
// so every update keeps all users, deposits, coins and chats exactly as they were.
export function addColumn(table, col, type) { if (!q(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); }
for (const [c, t] of [['free_until', 'INTEGER'], ['free_n', 'INTEGER DEFAULT 0'], ['seen_at', 'INTEGER']]) addColumn('users', c, t);
// every AI trader in the app (from the app build) posts signals; the ones set up in Admin -> Strategy use their own settings
let AI_LIST = {at: 0, v: []};
const allAis = () => { if (now() - AI_LIST.at > 600e3) { AI_LIST.at = now(); try { AI_LIST.v = JSON.parse(fs.readFileSync(new URL('./knowledge/auto/app-facts.json', import.meta.url), 'utf8')).ais || []; } catch (e) {} } let loc = []; try { loc = I18N.localAis(); } catch (e) {} return loc.length ? [...AI_LIST.v, ...loc] : AI_LIST.v; };
export const engine = createEngine({db, log: (...a) => console.warn('[strategy]', ...a), allAis});
db.exec('CREATE TABLE IF NOT EXISTS claim_tries(tg_id TEXT, at INTEGER)');
db.exec('CREATE TABLE IF NOT EXISTS trades(id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id TEXT, iq_user_id TEXT, iq_option_id TEXT, sig_id INTEGER, pair TEXT, dir TEXT, amount REAL, step INTEGER, status TEXT, profit REAL, error TEXT, created_at INTEGER, closed_at INTEGER)');

/* ---------------- rewards (same rules as the app) ---------------- */
const bonusPct = (v) => v >= 5000 ? 1 : v >= 1000 ? .5 : v >= 500 ? .3 : v >= 250 ? .15 : 0;
const coinsFor = (v) => Math.round(v * 10 * (1 + bonusPct(v)));
const tokensFor = (v, totalAfter) => totalAfter >= 100 ? Math.floor(v * 2.5) : 0;

/* ---------------- helpers ---------------- */
function loadEnv(f) { try { for (const l of fs.readFileSync(f, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/(^|\s+)#.*$/, '').trim().replace(/^["']|["']$/g, ''); } } catch {} }
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rnd = (n) => b64url(crypto.randomBytes(n));
function send(res, code, obj) { res.writeHead(code, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': C.allowOrigin, 'Access-Control-Allow-Headers': 'Content-Type, X-TG-Init-Data, X-Admin-Key, X-Dev-User', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'}); res.end(JSON.stringify(obj)); }
const fail = (res, code, error, extra = {}) => send(res, code, {ok: false, error, ...extra});
async function body(req, max = 1e6) { const chunks = []; let n = 0; for await (const c of req) { chunks.push(c); n += c.length; if (n > max) throw Object.assign(new Error('too big'), {status: 400}); } const s = Buffer.concat(chunks).toString(); if (!s) return {}; const ct = req.headers['content-type'] || ''; if (ct.includes('json')) return JSON.parse(s); if (ct.includes('x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(s)); try { return JSON.parse(s) } catch { return {raw: s} } }
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/* Telegram Mini App initData check: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
function tgUser(req) {
  if (C.devFakeTg && req.headers['x-dev-user']) return {id: String(req.headers['x-dev-user']), first_name: 'Dev'};
  const init = req.headers['x-tg-init-data']; if (!init) return null;
  const p = new URLSearchParams(init); const hash = p.get('hash'); if (!hash) return null; p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  // the mini app of ANY of our bots (main bot + bots added in Admin -> Funnels); we learn which bot it was
  const list = FUN.tokens();
  let botId = null;
  for (const [id, tok] of list) { const secret = crypto.createHmac('sha256', 'WebAppData').update(tok).digest(); if (safeEq(crypto.createHmac('sha256', secret).update(dcs).digest('hex'), hash)) { botId = id; break; } }
  if (botId === null) return null;
  if (now() / 1000 - +(p.get('auth_date') || 0) > 86400) return null;      // older than 24h
  try { const u = JSON.parse(p.get('user')); u.id = String(u.id); u.start_param = p.get('start_param') || ''; u.bot = botId; return u; } catch { return null; }
}
function ensureUser(u) {
  q(`INSERT INTO users(tg_id,first_name,username,created_at,updated_at) VALUES(?,?,?,?,?)
     ON CONFLICT(tg_id) DO UPDATE SET first_name=excluded.first_name, username=excluded.username, updated_at=excluded.updated_at`)
    .run(u.id, u.first_name || '', u.username || '', now(), now());
  q('INSERT OR IGNORE INTO rewards(tg_id) VALUES(?)').run(u.id);
  q('UPDATE users SET seen_at=? WHERE tg_id=?').run(now(), u.id);
  freeCheck(u.id);
  return q('SELECT * FROM users WHERE tg_id=?').get(u.id);
}
/* Free period. Everyone starts with 3 months free. When it ends we say nothing and quietly add 6 more months.
   When those end, anyone active (opened the app in the last 30 days) gets another 6 months, again with no message.
   Someone who went quiet keeps the old date, and the moment they open the app again they're active, so they get the 6 months then.
   All the numbers are in Admin -> Settings -> Free period. */
function freeCheck(tgId) {
  const F = SETTINGS.get('free'); if (!F.on) return; const day = 864e5;
  const r = q('SELECT created_at, free_until, free_n, seen_at FROM users WHERE tg_id=?').get(tgId); if (!r) return;
  if (!r.free_until) { q('UPDATE users SET free_until=?, free_n=0 WHERE tg_id=?').run((r.created_at || now()) + F.firstDays * day, tgId); return; }
  if (r.free_until > now()) return;
  const active = (r.free_n || 0) === 0 || (r.seen_at && now() - r.seen_at < F.activeDays * day);
  if (!active) return;
  let until = r.free_until; while (until <= now()) until += F.extendDays * day;    // whole 6-month blocks, so the date never looks odd
  q('UPDATE users SET free_until=?, free_n=COALESCE(free_n,0)+1 WHERE tg_id=?').run(until, tgId);
}
function freeTick() { for (const r of q('SELECT tg_id FROM users WHERE free_until IS NULL OR free_until<=?').all(now())) { try { freeCheck(r.tg_id); } catch (e) {} } }

/* ---------------- IQ Option token calls (same requests the official SDK makes) ---------------- */
async function iqToken(payload) {
  const r = await fetch(C.iqApi + '/auth/oauth.v5/token', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
  let d = {}; try { d = await r.json(); } catch {}
  if (r.status !== 200 || !d.access_token) throw Object.assign(new Error('iq_token_failed'), {status: r.status, detail: d});
  return d;
}
function saveTokens(tgId, d) {
  q('UPDATE users SET access_token=?, access_expires=?, refresh_token=COALESCE(?,refresh_token), updated_at=? WHERE tg_id=?')
    .run(d.access_token, now() + (d.expires_in || 3600) * 1000, d.refresh_token || null, now(), tgId);
}

/* ---------------- account link decision ---------------- */
// The afftrack in Affstore's postback says which Telegram user signed up this IQ Option account (Zubabot_tg<ID>).
// If it names someone else, nobody else may link it (stops people typing or sending other traders' IDs).
function ownerOf(acc) { const m = acc && acc.afftrack && String(acc.afftrack).match(/(?:^|[_-])tg(\d+)$/i); return m ? m[1] : null; }
function tooManyTries(tgId) { const n = q('SELECT COUNT(*) n FROM claim_tries WHERE tg_id=? AND at>?').get(String(tgId), now() - 3600e3).n; if (n >= 6) return true; q('INSERT INTO claim_tries(tg_id,at) VALUES(?,?)').run(String(tgId), now()); return false; }
function linkDecision(user, iqId) {
  const acc = q('SELECT * FROM aff_accounts WHERE iq_user_id=?').get(iqId);
  const owner = ownerOf(acc);
  if (owner && owner !== String(user.tg_id)) return {linked: false, error: 'registered_by_other_telegram'};
  if (acc) return {linked: true, source: acc.source === 'postback' ? 'affiliate' : 'imported'};
  const inv = q('SELECT * FROM invites WHERE tg_id=? AND (iq_user_id IS NULL OR iq_user_id=?)').get(user.tg_id, iqId);
  if (inv) { q('UPDATE invites SET iq_user_id=?, used_at=COALESCE(used_at,?) WHERE code=?').run(iqId, now(), inv.code); return {linked: true, source: 'invite'}; }
  if (!C.requireLink) return {linked: true, source: 'open'};
  // Signed up through our OAuth link a moment ago: the registration postback can take a little while.
  const recent = q("SELECT * FROM oauth_states WHERE tg_id=? AND kind='new' AND created_at>?").get(user.tg_id, now() - 30 * 60e3);
  if (recent) return {linked: false, pending: true};
  return {linked: false};
}
function publicState(tgId) {
  const u = q('SELECT tg_id,first_name,iq_user_id,linked,link_source,free_until FROM users WHERE tg_id=?').get(tgId);
  const acc = u && u.iq_user_id ? q('SELECT deposits_total,withdrawals_total,ftd_at FROM aff_accounts WHERE iq_user_id=?').get(u.iq_user_id) : null;
  const rw = q('SELECT coins,tokens,credited_deposits,flagged FROM rewards WHERE tg_id=?').get(tgId) || {};
  const dep = acc ? acc.deposits_total : 0;
  return {user: u, deposits_total: dep, activated: dep >= C.minDeposit, rewards: rw, free_until: u ? u.free_until : null};
}

/* credit coins/tokens for confirmed deposits, once.
   Rewards follow NET new money (deposits - withdrawals) above the best level already rewarded,
   so withdrawing and re-depositing earns nothing and is flagged for review (ban rule). */
function creditRewards(iqId) {
  const u = q('SELECT tg_id, created_at FROM users WHERE iq_user_id=?').get(iqId); if (!u) return null;
  const acc = q('SELECT deposits_total, withdrawals_total FROM aff_accounts WHERE iq_user_id=?').get(iqId);
  if (!acc) return null;                              // no deposit postbacks yet for this account
  q('INSERT OR IGNORE INTO rewards(tg_id) VALUES(?)').run(u.tg_id);
  const rw = q('SELECT * FROM rewards WHERE tg_id=?').get(u.tg_id);
  const net = acc.deposits_total - acc.withdrawals_total;
  const add = net - rw.credited_deposits;
  const redeposit = acc.withdrawals_total > 0 && acc.withdrawals_total >= rw.credited_deposits * 0.5;
  if (add <= 0) { if (redeposit) q('UPDATE rewards SET flagged=1 WHERE tg_id=?').run(u.tg_id); return {tg_id: u.tg_id, coins: 0, tokens: 0, flagged: redeposit}; }
  // welcome bonus: first deposit of MIN_DEPOSIT+ within 24 h of first opening the app (the app shows the countdown; 2 h grace)
  const welcome = rw.credited_deposits === 0 && add >= C.minDeposit && now() - (u.created_at || 0) <= 26 * 3600e3 ? +(process.env.WELCOME_BONUS || 500) : 0;
  const coins = coinsFor(add) + welcome, tokens = tokensFor(add, net);
  q('UPDATE rewards SET coins=coins+?, tokens=tokens+?, credited_deposits=?, flagged=MAX(flagged,?) WHERE tg_id=?').run(coins, tokens, net, redeposit ? 1 : 0, u.tg_id);
  try { REF.onDeposit(u.tg_id, add, net, redeposit || !!rw.flagged); } catch (e) { console.warn('[ref]', e.message); }
  return {tg_id: u.tg_id, coins, tokens, flagged: redeposit};
}

/* Affstore postback. Field names vary by network setup, so common aliases are accepted. */
const pick = (o, ...k) => { for (const x of k) if (o[x] !== undefined && o[x] !== '') return String(o[x]); return ''; };
function handlePostback(p) {
  const iqId = pick(p, 'user_id', 'trader_id', 'uid', 'client_id', 'player_id');
  const afftrack = pick(p, 'afftrack', 'sub_id', 'subid', 'sub1', 'aff_sub', 'click_id');
  let type = pick(p, 'event', 'type', 'status', 'goal', 'action').toLowerCase();
  const amount = +pick(p, 'amount', 'sum', 'deposit', 'deposit_amount', 'ftd_amount', 'value') || 0;
  const currency = pick(p, 'currency', 'cur') || 'USD';
  if (!iqId) return {ok: false, error: 'missing_user_id'};
  if (/^(reg|registration|signup|lead)/.test(type)) type = 'registration';
  else if (/^(ftd|first)/.test(type)) type = 'ftd';
  else if (/^(dep|deposit|redeposit|qftd)/.test(type)) type = 'deposit';
  else if (/^(wd|withdraw)/.test(type)) type = 'withdrawal';
  // Registration and FTD happen once per trader, so they are keyed by trader (safe even if Affstore's event_id is reused)
  const ext = (type === 'registration' || type === 'ftd') ? type + ':' + iqId
    : type + ':' + iqId + ':' + (pick(p, 'transaction_id', 'tid', 'id', 'event_id') || crypto.createHash('sha1').update(JSON.stringify(p)).digest('hex'));
  const ins = q('INSERT OR IGNORE INTO events(ext_id,iq_user_id,afftrack,type,amount,currency,raw,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(ext, iqId, afftrack, type, amount, currency, JSON.stringify(p), now());
  if (!ins.changes) return {ok: true, duplicate: true};
  q(`INSERT INTO aff_accounts(iq_user_id,afftrack,source,registered_at) VALUES(?,?,'postback',?)
     ON CONFLICT(iq_user_id) DO UPDATE SET afftrack=COALESCE(NULLIF(excluded.afftrack,''),aff_accounts.afftrack), source='postback'`).run(iqId, afftrack, now());
  if (type === 'ftd' || type === 'deposit') q('UPDATE aff_accounts SET deposits_total=deposits_total+?, ftd_at=COALESCE(ftd_at,?) WHERE iq_user_id=?').run(amount, now(), iqId);
  if (type === 'withdrawal') q('UPDATE aff_accounts SET withdrawals_total=withdrawals_total+? WHERE iq_user_id=?').run(amount, iqId);
  // afftrack carries the Telegram user id we sent in the OAuth link -> auto-link a brand new sign-up
  const tgm = afftrack && String(afftrack).match(/(?:^|[_-])tg(\d+)$/i);
  if (tgm) {
    const tg = tgm[1];
    const u = q('SELECT * FROM users WHERE tg_id=?').get(tg);
    if (u && !u.iq_user_id) { q("UPDATE users SET iq_user_id=?, linked=1, link_source='affiliate', updated_at=? WHERE tg_id=?").run(iqId, now(), tg);
      // they may still be on IQ Option's website: bring them straight back with a Telegram message + button
      try { BOT.comeBack(tg, 'registered').catch(() => {}); } catch (e) {} }
  }
  const credited = (type === 'ftd' || type === 'deposit') ? creditRewards(iqId) : null;
  try { alertEvent(type, iqId, amount); } catch (e) { console.warn('[alert]', e.message); }
  return {ok: true, type, credited};
}

/* ---------------- routes ---------------- */
const FIND_AT = new Map(), MENTOR_AT = new Map();
// "proof" pictures the AIs can attach (e.g. "Is IQ Option legit?" -> knowledge/proof/iqoption.jpg). Upload/replace them in Admin -> Train the AI.
const PROOF_DIR = new URL('./knowledge/proof/', import.meta.url);
const proofFile = (n) => { const b = String(n || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40); for (const e of ['jpg', 'png', 'webp']) { const f = new URL(b + '.' + e, PROOF_DIR); if (fs.existsSync(f)) return {f, e}; } return null; };
const routes = {
  'GET /api/health': async () => ({ok: true, time: now()}),

  // 1) Start login: server keeps the PKCE verifier, so it also works if the page opens in the phone's browser
  'POST /api/oauth/start': async (req, b, u) => {
    if (!u) return [401, {ok: false, error: 'telegram_auth'}];
    ensureUser(u);
    const verifier = rnd(72), challenge = b64url(crypto.createHash('sha256').update(verifier).digest()), state = rnd(16);
    const kind = b.kind === 'new' ? 'new' : 'login';
    q('INSERT INTO oauth_states(state,tg_id,verifier,kind,created_at) VALUES(?,?,?,?,?)').run(state, u.id, verifier, kind, now());
    const p = new URLSearchParams({response_type: 'code', redirect_uri: C.redirectUri, client_id: String(C.clientId), scope: C.scope, code_challenge: challenge, code_challenge_method: 'S256', state});
    const AF = FUN.affFor(u.id);                                     // the person's funnel decides the affiliate ID + tracking name
    if (AF.affId) p.set('aff', AF.affId);
    p.set('afftrack', AF.afftrack);              // comes back in Affstore postbacks -> we know which Telegram user registered
    if (C.affModel) p.set('aff_model', C.affModel);
    return {ok: true, url: `${C.iqApi}/auth/oauth.v5/authorize?${p}`};
  },

  // 2) Callback page posts code+state here. No Telegram header needed: the state identifies the user.
  'POST /api/oauth/exchange': async (req, b) => {
    const st = b.state && q('SELECT * FROM oauth_states WHERE state=?').get(b.state);
    if (!st || now() - st.created_at > 20 * 60e3) return [400, {ok: false, error: 'bad_state'}];
    if (!b.code) return [400, {ok: false, error: 'missing_code'}];
    const d = await iqToken({grant_type: 'authorization_code', code: b.code, redirect_uri: C.redirectUri, client_id: Number(C.clientId), code_verifier: st.verifier});
    saveTokens(st.tg_id, d);
    q('UPDATE oauth_states SET verifier=NULL WHERE state=?').run(b.state);
    return {ok: true};
  },

  // 3) App asks for a fresh short-lived access token (refresh token never leaves the server)
  'POST /api/oauth/token': async (req, b, u) => {
    if (!u) return [401, {ok: false, error: 'telegram_auth'}];
    const row = q('SELECT * FROM users WHERE tg_id=?').get(u.id);
    if (!row || (!row.access_token && !row.refresh_token)) return [404, {ok: false, error: 'not_connected'}];
    if (row.access_token && row.access_expires - now() > 120e3) return {ok: true, accessToken: row.access_token, expiresIn: Math.round((row.access_expires - now()) / 1000)};
    if (!row.refresh_token || !C.clientSecret) return [401, {ok: false, error: 'reconnect'}];
    try { const d = await iqToken({grant_type: 'refresh_token', refresh_token: row.refresh_token, client_id: Number(C.clientId), client_secret: C.clientSecret}); saveTokens(u.id, d); return {ok: true, accessToken: d.access_token, expiresIn: d.expires_in}; }
    catch (e) { q('UPDATE users SET access_token=NULL, refresh_token=NULL WHERE tg_id=?').run(u.id); return [401, {ok: false, error: 'reconnect'}]; }
  },

  // 4) After the SDK connects in the app, it reports the IQ Option user id. We decide if it's our account.
  'POST /api/account/link': async (req, b, u) => {
    if (!u) return [401, {ok: false, error: 'telegram_auth'}];
    const user = ensureUser(u); const iqId = String(b.iqUserId || '').replace(/\D/g, '');
    if (!iqId) return [400, {ok: false, error: 'missing_iq_user_id'}];
    const other = q('SELECT tg_id FROM users WHERE iq_user_id=? AND tg_id<>?').get(iqId, u.id);
    if (other) return [409, {ok: false, error: 'iq_account_used_by_other_telegram'}];
    // already linked to a different IQ Option account -> only support can move it
    if (user.iq_user_id && user.linked && user.iq_user_id !== iqId) return [409, {ok: false, error: 'already_linked_contact_support'}];
    if (user.iq_user_id !== iqId && tooManyTries(u.id)) return [429, {ok: false, error: 'too_many_tries_wait_1h'}];
    const d = linkDecision(user, iqId);
    if (d.error) return [409, {ok: false, error: d.error}];
    if (d.linked) q('UPDATE users SET iq_user_id=?, linked=1, link_source=?, updated_at=? WHERE tg_id=?').run(iqId, d.source, now(), u.id);
    if (d.linked) creditRewards(iqId);
    return {ok: true, ...d, state: publicState(u.id)};
  },

  // 5) Earlier members: redeem an invite code (single use, optionally pre-bound to one IQ Option id)
  'POST /api/invite/redeem': async (req, b, u) => {
    if (!u) return [401, {ok: false, error: 'telegram_auth'}];
    ensureUser(u); const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const inv = code && q('SELECT * FROM invites WHERE code=?').get(code);
    if (!inv) return [404, {ok: false, error: 'invalid_code'}];
    if (inv.tg_id && inv.tg_id !== u.id) return [409, {ok: false, error: 'code_already_used'}];
    q('UPDATE invites SET tg_id=? WHERE code=?').run(u.id, code);
    return {ok: true, boundTo: inv.iq_user_id || null};
  },

  'GET /api/me': async (req, b, u) => { if (!u) return [401, {ok: false, error: 'telegram_auth'}]; ensureUser(u); if (/^ref_/i.test(u.start_param || '')) { try { REF.attach(u, u.start_param, 'app'); } catch (e) {} }
    try { FUN.fromStart(u.id, /^ref_/i.test(u.start_param || '') ? '' : u.start_param, u.bot || 0, 'app'); } catch (e) {}
    return {ok: true, ...publicState(u.id), lang: FUN.langOf(u.id)}; },

  // Affstore postback URL: /api/postback/affstore?key=POSTBACK_KEY&event={event}&user_id={trader_id}&afftrack={afftrack}&amount={amount}&tid={id}
  'GET /api/postback/affstore': async (req, b, u, url) => postback(url, b),
  'POST /api/postback/affstore': async (req, b, u, url) => postback(url, b),

  // Admin: import IQ Option ids of members who registered with your link before (from Affstore stats export)
  'POST /api/admin/import-accounts': async (req, b) => {
    const ids = (Array.isArray(b.ids) ? b.ids : String(b.raw || b.csv || '').split(/[\s,;]+/)).map((x) => String(x).replace(/\D/g, '')).filter(Boolean);
    const st = q("INSERT INTO aff_accounts(iq_user_id,source,registered_at) VALUES(?,'import',?) ON CONFLICT(iq_user_id) DO NOTHING");
    let n = 0; for (const id of ids) n += st.run(id, now()).changes;
    return {ok: true, received: ids.length, added: n};
  },
  // Admin: create invite codes. Body {count:10} or {iqUserIds:[...]} (one code per id), optional note
  'POST /api/admin/invites': async (req, b) => {
    const list = Array.isArray(b.iqUserIds) && b.iqUserIds.length ? b.iqUserIds.map(String) : Array.from({length: Math.min(+b.count || 1, 500)}, () => null);
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', mk = () => 'ZB' + Array.from(crypto.randomBytes(6), (x) => A[x % A.length]).join('');
    const out = []; for (const id of list) { let c; do c = mk(); while (q('SELECT 1 FROM invites WHERE code=?').get(c)); q('INSERT INTO invites(code,iq_user_id,note,created_at) VALUES(?,?,?,?)').run(c, id, b.note || '', now()); out.push({code: `${c.slice(0, 2)}-${c.slice(2, 6)}-${c.slice(6)}`, iqUserId: id}); }
    return {ok: true, invites: out};
  },

  /* ---------- launch flow without OAuth ---------- */
  // Registration link with this user's Telegram id as sub-ID. Affstore's registration postback then links the account by itself.
  'POST /api/register/link': async (req, b, u) => {
    if (!u) return [401, {ok: false, error: 'telegram_auth'}];
    ensureUser(u); const AF = FUN.affFor(u.id); if (!AF.link) return [500, {ok: false, error: 'AFF_LINK not set'}];
    q("INSERT INTO oauth_states(state,tg_id,verifier,kind,created_at) VALUES(?,?,NULL,'new',?)").run('reg_' + rnd(12), u.id, now());   // so the bot can bring them back if they get lost on IQ Option
    const sub = AF.afftrack, L = AF.link;
    const url = L.includes('{afftrack}') ? L.replace('{afftrack}', encodeURIComponent(sub)) : L + (L.includes('?') ? '&' : '?') + 'afftrack=' + encodeURIComponent(sub);
    return {ok: true, url};
  },
  // Earlier members (or anyone who registered with our link) type their IQ Option ID. Checked against postbacks/imported list or an invite.
  'POST /api/account/claim': async (req, b, u) => {
    if (!u) return [401, {ok: false, error: 'telegram_auth'}];
    const user = ensureUser(u); const iqId = String(b.iqUserId || '').replace(/\D/g, '');
    if (iqId.length < 5) return [400, {ok: false, error: 'enter_your_iq_option_id'}];
    const tries = q('SELECT COUNT(*) n FROM claim_tries WHERE tg_id=? AND at>?').get(u.id, now() - 3600e3).n;
    if (tries >= 6) return [429, {ok: false, error: 'too_many_tries_wait_1h'}];
    q('INSERT INTO claim_tries(tg_id,at) VALUES(?,?)').run(u.id, now());
    const other = q('SELECT tg_id FROM users WHERE iq_user_id=? AND tg_id<>?').get(iqId, u.id);
    if (other) return [409, {ok: false, error: 'id_already_linked_contact_support'}];
    if (user.iq_user_id && user.linked && user.iq_user_id !== iqId) return [409, {ok: false, error: 'already_linked_contact_support'}];
    const acc = q('SELECT * FROM aff_accounts WHERE iq_user_id=?').get(iqId);
    const ow = ownerOf(acc); if (ow && ow !== String(u.id)) return [409, {ok: false, error: 'id_already_linked_contact_support'}];
    const inv = q('SELECT * FROM invites WHERE tg_id=? AND (iq_user_id IS NULL OR iq_user_id=?)').get(u.id, iqId);
    if (!acc && !inv && C.requireLink) return {ok: true, linked: false, state: publicState(u.id)};
    if (inv) q('UPDATE invites SET iq_user_id=?, used_at=COALESCE(used_at,?) WHERE code=?').run(iqId, now(), inv.code);
    q('UPDATE users SET iq_user_id=?, linked=1, link_source=?, updated_at=? WHERE tg_id=?').run(iqId, acc ? (acc.source === 'postback' ? 'affiliate' : 'imported') : inv ? 'invite' : 'open', now(), u.id);
    creditRewards(iqId);
    return {ok: true, linked: true, state: publicState(u.id)};
  },

  /* ---------- real trades placed by the app through the SDK (log for admin) ---------- */
  'POST /api/trades': async (req, b, u) => {
    if (!u) return [401, {ok: false, error: 'telegram_auth'}];
    const row = q('SELECT iq_user_id FROM users WHERE tg_id=?').get(u.id) || {};
    if (b.id) {
      q('UPDATE trades SET status=?, profit=?, closed_at=? WHERE id=? AND tg_id=?').run(String(b.status || ''), +b.profit || 0, now(), +b.id, u.id);
      const t = q('SELECT * FROM trades WHERE id=? AND tg_id=?').get(+b.id, u.id);
      // trades that copied a signal exactly also score that signal (OTC pairs have no outside price)
      const st = publicState(u.id);
      if (t && t.sig_id && b.copied && t.iq_option_id && st.activated && st.user && st.user.linked) await engine.resolveFromTrade(t.sig_id, String(b.status || ''), {pair: t.pair, dir: t.dir, expiryMin: +b.expiryMin || null});
      if (t && t.iq_option_id && /^(win|loss)$/.test(String(b.status))) SALES.onResult(u.id).catch((e) => console.warn('[sales]', e.message));   // win streaks -> the AI celebrates and upsells
      return {ok: true};
    }
    const r = q('INSERT INTO trades(tg_id,iq_user_id,iq_option_id,sig_id,pair,dir,amount,step,status,error,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(u.id, row.iq_user_id || null, String(b.iqOptionId || ''), +b.sigId || null, String(b.pair || ''), b.dir === 'sell' ? 'sell' : 'buy', +b.amount || 0, +b.step || 0, b.error ? 'failed' : 'open', b.error ? String(b.error).slice(0, 200) : null, now());
    if (!b.error && b.iqOptionId) REF.onTrade(u.id);                     // 5 real trades unlock the invite coins
    return {ok: true, id: Number(r.lastInsertRowid)};
  },

  /* ---------- signals for the app ---------- */
  'GET /api/signals': async (req, b, u, url) => { if (!u) return [401, {ok: false, error: 'telegram_auth'}]; return {ok: true, ...engine.forUser(u.id, (url.searchParams.get('ais') || '').split(',').filter(Boolean))}; },
  // "Find me a trade": the AI checks its own rules on real prices right now (at most once every 20 s per person)
  'POST /api/signals/find': async (req, b, u) => {
    if (!u) return [401, {ok: false, error: 'telegram_auth'}];
    const k = String(b.ai || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20); if (!k || !(allAis().some((a) => a.key === k) || engine.getStrategy().ais.some((a) => a.key === k))) return [400, {ok: false, error: 'unknown_ai'}];
    const last = FIND_AT.get(u.id) || 0; if (now() - last < 20e3) return {ok: true, none: 'wait'}; FIND_AT.set(u.id, now());
    const st = engine.getStrategy(); if (st.mode === 'test' && !st.testers.includes(String(u.id))) return {ok: true, none: 'test_mode'};
    const r = await engine.find(k); return {ok: true, ...(r.signal ? {signal: {id: r.signal.id, pair: r.signal.pair, dir: r.signal.dir, expiry_min: r.signal.expiry_min, entry_at: r.signal.entry_at, reason: r.signal.note === 'random' ? '' : r.signal.note}} : {none: r.none})};
  },
  // One signal's result (+ the next martingale step if it opened). Used by the app's trade screen.
  'GET /api/signal': async (req, b, u, url) => {
    if (!u) return [401, {ok: false, error: 'telegram_auth'}];
    const sig = q('SELECT id,pair,dir,step,chain_id,status,mode,expires_at,entry,exit FROM signals WHERE id=?').get(+url.searchParams.get('id'));
    if (!sig) return [404, {ok: false, error: 'not_found'}];
    const st = engine.getStrategy(); const canSee = sig.mode === 'live' || st.testers.includes(String(u.id));
    if (!canSee) return [403, {ok: false, error: 'hidden'}];
    const next = q("SELECT id,step,dir,expires_at FROM signals WHERE chain_id=? AND step=? LIMIT 1").get(sig.chain_id, sig.step + 1) || null;
    return {ok: true, signal: sig, next, now: now()};
  },

  /* ---------- strategy lab (admin) ---------- */
  'GET /api/admin/strategy': async () => { let aiList = []; try { aiList = JSON.parse(fs.readFileSync(new URL('./knowledge/auto/app-facts.json', import.meta.url), 'utf8')).ais.map((a) => ({key: a.key, name: a.name, style: a.style})); } catch (e) {}
    return {ok: true, strategy: {...engine.getStrategy(), aiList}}; },
  'POST /api/admin/strategy': async (req, b) => ({ok: true, strategy: engine.setStrategy(b)}),
  'GET /api/admin/signals': async (req, b, u, url) => ({ok: true, signals: engine.recent({mode: url.searchParams.get('mode') || undefined, limit: Math.min(+url.searchParams.get('limit') || 60, 500)})}),
  'POST /api/admin/signals': async (req, b) => {
    const st = engine.getStrategy(); const pair = String(b.pair || '').toUpperCase(); const dir = b.dir === 'sell' ? 'sell' : 'buy';
    if (!pair) return [400, {ok: false, error: 'pair'}];
    const mode = ['test', 'live'].includes(b.mode) ? b.mode : (st.mode === 'live' ? 'live' : 'test');
    const ai = b.ai ? String(b.ai).toLowerCase().replace(/[^a-z0-9]/g, '') : (st.ais.find((x) => x.on) || {}).key || null;
    const entryAt = b.now ? now() : undefined;          // default: next full minute after the lead time (same as auto signals)
    const s = await engine.create({pair, dir, source: 'manual', mode, conf: Math.round(+b.conf || 80), trend: 'manual', expiryMin: +b.expiryMin || st.expiryMin, note: String(b.note || '').slice(0, 140), ai, entryAt});
    return {ok: true, signal: s};
  },
  // Signals from outside (another signal provider, TradingView alerts, a script). Set SIGNAL_WEBHOOK_KEY in .env.
  // POST /api/signals/webhook?key=KEY  {"ai":"kai","pair":"EUR/USD OTC","dir":"buy","expiry":1}   dir also accepts call/put/long/short
  'POST /api/signals/webhook': async (req, b, u, url) => {
    const key = process.env.SIGNAL_WEBHOOK_KEY || ''; if (!key || !safeEq(url.searchParams.get('key') || b.key || '', key)) return [403, {ok: false, error: 'bad_key'}];
    const st = engine.getStrategy(); const pair = String(b.pair || b.symbol || b.ticker || '').toUpperCase().trim(); const d = String(b.dir || b.direction || b.side || b.action || '').toLowerCase();
    const dir = /^(buy|call|long|up)/.test(d) ? 'buy' : /^(sell|put|short|down)/.test(d) ? 'sell' : '';
    if (!pair || !dir) return [400, {ok: false, error: 'need_pair_and_dir'}];
    const ai = String(b.ai || '').toLowerCase().replace(/[^a-z0-9]/g, '') || null;
    const mode = ['test', 'live'].includes(b.mode) ? b.mode : (st.mode === 'live' ? 'live' : 'test');
    const s = await engine.create({pair, dir, source: 'webhook', mode, conf: Math.round(+b.conf || 80), trend: 'external', expiryMin: [1, 2, 3, 5, 10, 15].includes(+b.expiry) ? +b.expiry : st.expiryMin, note: String(b.note || 'external').slice(0, 140), ai});
    return {ok: true, signal: {id: s.id, pair: s.pair, dir: s.dir, ai: s.ai, entry_at: s.entry_at}};
  },
  'POST /api/admin/signals/resolve': async (req, b) => ({ok: true, signal: await engine.resolveManual(+b.id, b.status)}),
  'GET /api/admin/results': async (req, b, u, url) => ({ok: true, results: engine.results({mode: url.searchParams.get('mode') || 'test', hours: Math.min(+url.searchParams.get('hours') || 24, 24 * 90)})}),
  'POST /api/admin/reset-test': async () => ({ok: true, deleted: engine.resetTest()}),
  'GET /api/admin/users': async (req, b, u, url) => ({ok: true, users: q(`SELECT u.tg_id,u.first_name,u.username,u.iq_user_id,u.linked,u.link_source,u.created_at,COALESCE(a.deposits_total,0) deposits,COALESCE(r.coins,0) coins,COALESCE(r.flagged,0) flagged
     FROM users u LEFT JOIN aff_accounts a ON a.iq_user_id=u.iq_user_id LEFT JOIN rewards r ON r.tg_id=u.tg_id ORDER BY u.created_at DESC LIMIT ?`).all(Math.min(+url.searchParams.get('limit') || 100, 1000))}),
  'GET /api/admin/stats': async () => ({ok: true,
    users: q('SELECT COUNT(*) n FROM users').get().n, linked: q('SELECT COUNT(*) n FROM users WHERE linked=1').get().n,
    activated: q(`SELECT COUNT(*) n FROM users u JOIN aff_accounts a ON a.iq_user_id=u.iq_user_id WHERE a.deposits_total>=${C.minDeposit}`).get().n,
    deposits: q("SELECT COALESCE(SUM(amount),0) s FROM events WHERE type IN ('ftd','deposit')").get().s,
    invites_free: q('SELECT COUNT(*) n FROM invites WHERE tg_id IS NULL').get().n,
    trades: q("SELECT COUNT(*) n, COALESCE(SUM(amount),0) vol, COALESCE(SUM(CASE WHEN status='win' THEN 1 ELSE 0 END),0) w, COALESCE(SUM(CASE WHEN status='loss' THEN 1 ELSE 0 END),0) l FROM trades WHERE status<>'failed'").get(),
    oauth: !!(C.clientId && C.redirectUri)})
};
/* coins/tokens the user spent in the app (unlocking AIs, voice minutes). The app reports each spend right away,
   so the balance the server sends back already has it taken off. */
routes['POST /api/wallet/spend'] = async (req, b, u) => {
  if (!u) return [401, {ok: false, error: 'telegram_auth'}];
  ensureUser(u); const c = Math.max(0, Math.min(1e6, Math.floor(+b.coins || 0))), t = Math.max(0, Math.min(1e6, Math.floor(+b.tokens || 0)));
  q('UPDATE rewards SET coins=MAX(0,coins-?), tokens=MAX(0,tokens-?) WHERE tg_id=?').run(c, t, u.id);
  return {ok: true, rewards: q('SELECT coins,tokens FROM rewards WHERE tg_id=?').get(u.id)};
};
const SETTINGS = makeSettings({db, q, now});
const TEAM = makeTeam({db, q, now, C}); Object.assign(routes, TEAM.routes);
const ENGINE = makeEngine({db, q, now, settings: SETTINGS, team: TEAM}); Object.assign(routes, ENGINE.routes);
const INBOX = makeInbox({db, q, now, settings: SETTINGS, team: TEAM}); Object.assign(routes, INBOX.routes);
const REF = referralRoutes({db, q, now, C}); Object.assign(routes, REF.routes);
const BRAIN = makeBrain({db, q, now, C, publicState, engine: ENGINE, settings: SETTINGS, inbox: INBOX}); Object.assign(routes, BRAIN.routes);
const I18N = makeI18n({db, q, now, engine: ENGINE, settings: SETTINGS}); Object.assign(routes, I18N.routes); I18N.setAis(() => allAis().map((a) => ({key: a.key, name: a.name})));
const FUN = makeFunnels({db, q, now, C, i18n: I18N, settings: SETTINGS}); Object.assign(routes, FUN.routes);
const SEC = makeSecurity({db, q, now, settings: SETTINGS, team: TEAM, C}); Object.assign(routes, SEC.routes); FUN.setSecurity(SEC); I18N.setSecurity(SEC);
INBOX.hooks.security = (text, ctx) => SEC.check(text, ctx); BRAIN.hooks.security = (text, ctx) => SEC.check(text, ctx);
// Zubabot Pay wallets changed in .env since the last start -> every admin is told
try { const sig = crypto.createHash('sha256').update([process.env.PAY_USDT_TRC20_ADDRESS || '', process.env.PAY_BTC_ADDRESS || ''].join('|')).digest('hex').slice(0, 16); const k = q("SELECT v FROM app_settings WHERE k='_walletsig'").get();
  if (k && JSON.parse(k.v) !== sig) setTimeout(() => TEAM.alert('security', `🔐 The Zubabot Pay wallet addresses changed on the server (.env).\nUSDT: ${process.env.PAY_USDT_TRC20_ADDRESS || '—'}\nBTC: ${process.env.PAY_BTC_ADDRESS || '—'}\nIf you didn't do this, check the server now.`, {key: 'wallet' + sig, every: 1, all: true, email: true}).catch(() => {}), 5000);
  q("INSERT INTO app_settings(k,v,updated_at,by) VALUES('_walletsig',?,?,'system') ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(JSON.stringify(sig), now()); } catch (e) {}
const NEWS = makeNews({now}); BRAIN.hooks.news = () => NEWS.block(); Object.assign(routes, NEWS.routes);
BRAIN.hooks.langOf = (id) => FUN.langOf(id); INBOX.hooks.mentorOf = (id) => { const F = FUN.mentorFor(id); return F ? F.name : null; }; BRAIN.hooks.funnelMentor = (id, lang) => FUN.mentorFor(id, lang); BRAIN.hooks.swapMentor = (id, t, lang) => FUN.swapMentor(id, t, lang); BRAIN.hooks.aiName = (lang, key, n) => I18N.aiName(lang, key, n); BRAIN.hooks.tr = (lang, texts) => I18N.trAll(lang, texts);
const BOT = supportBot({db, q, now, C, publicState, brain: BRAIN, referral: REF, settings: SETTINGS, inbox: INBOX, team: TEAM, funnels: FUN, i18n: I18N, security: SEC}); Object.assign(routes, BOT.routes);
const VOICE = makeVoice({db, q, now, C, settings: SETTINGS, engine: ENGINE, brain: BRAIN, team: TEAM, publicState, funnels: FUN, i18n: I18N}); Object.assign(routes, VOICE.routes);
BOT.hooks.stt = (buf, mime, sec, lang) => VOICE.stt(buf, mime, sec, lang);
const ADMIN = makeAdminApi({db, q, now, C, settings: SETTINGS, team: TEAM, engine: ENGINE, getBot: () => BOT, publicState, creditRewards, i18n: I18N, security: SEC}); Object.assign(routes, ADMIN.routes);
BRAIN.hooks.onHuman = (u, text, why, fromAi) => BOT.handoffFromApp(u, text, why, fromAi);
const SALES = makeSales({db, q, now, C, settings: SETTINGS, brain: BRAIN, publicState, team: TEAM, getBot: () => BOT, inbox: INBOX, i18n: I18N, funnels: FUN}); Object.assign(routes, SALES.routes);
BOT.hooks.aiWrite = (tgId, aiKey, task, fallback, cta, opts) => SALES.write(tgId, aiKey, task, fallback, cta, opts);
INBOX.hooks.appMsg = (tgId, who, text, cta) => { const ch = (q("SELECT channel FROM bot_msgs WHERE tg_id=? AND role='user' ORDER BY id DESC LIMIT 1").get(String(tgId)) || {}).channel; const mentor = ch === 'mentor';
  q('INSERT INTO app_msgs(tg_id,sender,who,text,cta,kind,ref,at) VALUES(?,?,?,?,?,?,?,?)').run(String(tgId), mentor ? 'mentor' : 'support', mentor ? mentorName(tgId) : /^owner$/i.test(who.name) ? 'Support' : String(who.name).split(' ')[0], text, cta ? JSON.stringify(cta) : null, mentor ? 'mentor' : 'support', 'sup:' + now() + Math.random(), now()); };
// team alerts for money events
function alertEvent(type, iqId, amount) {
  const u = q('SELECT tg_id, first_name, username FROM users WHERE iq_user_id=?').get(iqId); const who = u ? `${u.first_name || 'User'}${u.username ? ' @' + u.username : ''}` : 'IQ ' + iqId;
  const big = +SETTINGS.get('alerts').bigDeposit || 0;
  if (type === 'ftd') TEAM.alert('ftd', `💰 New funded user: ${who} deposited $${amount}`);
  if ((type === 'ftd' || type === 'deposit') && big && amount >= big) TEAM.alert('big_deposit', `🔥 Big deposit: ${who} put in $${amount}`);
  if (type === 'registration') TEAM.alert('registration', `🆕 New IQ Option registration: ${who}`);
}
/* MAX members text the lead mentor directly. It lands in Admin -> Support inbox (marked "mentor"); whoever answers, the user sees it as the mentor's reply. */
const mentorName = (id) => { const l = FUN.langOf(id); const F = FUN.mentorFor(id, l); return F ? F.name : (FUN.baseMentor(l).name || 'Mentor'); };
routes['POST /api/mentor/send'] = async (req, b, u) => {
  if (!u) return [401, {ok: false, error: 'telegram_auth'}];
  const st = publicState(u.id) || {}; const need = +(process.env.MENTOR_CHAT_FROM || 2000);
  const ml = FUN.langOf(u.id); if (ml !== 'en' && !FUN.mentorFor(u.id, ml) && !(((SETTINGS.get('mentors') || {})[ml] || {}).on)) return [403, {ok: false, error: 'no_mentor_in_this_region'}];
  if ((st.deposits_total || 0) < need) return [403, {ok: false, error: 'max_only', need}];
  const text = String(b.text || '').trim().slice(0, 1500); if (!text) return [400, {ok: false, error: 'empty'}];
  const first = !q("SELECT 1 FROM bot_msgs WHERE tg_id=? AND channel='mentor' LIMIT 1").get(String(u.id));
  q(`INSERT INTO bot_users(tg_id,chat_id,first_name,username,started_at,last_in,fu_step,fu_next_at) VALUES(?,?,?,?,?,?,0,NULL) ON CONFLICT(tg_id) DO NOTHING`).run(String(u.id), String(u.id), u.first_name || '', u.username || '', now(), now());
  const last = MENTOR_AT.get(u.id) || 0; if (now() - last < 3000) return [429, {ok: false, error: 'slow_down'}]; MENTOR_AT.set(u.id, now());
  INBOX.record(u.id, 'user', text, 'mentor');
  if (INBOX.open(u.id)) await INBOX.userWhileHuman(String(u.id), text, 'mentor');
  else await INBOX.requestHuman(String(u.id), {reason: `MAX member texting ${mentorName(u.id)}${FUN.mentorFor(u.id) ? ' (funnel mentor)' : ''}`, text, channel: 'mentor', notifyUser: false});
  if (first) INBOX.record(u.id, 'system', `${mentorName(u.id)} gets your messages here and replies personally, usually within a few hours 🙌`, 'mentor', 'system');
  return {ok: true};
};
/* ---------- AI trader chats: read a chart screenshot (MAX) and listen to voice notes (Pro: 10 a day, MAX) ---------- */
const mediaDay = () => new Date(now() + 3600e3).toISOString().slice(0, 10);
db.exec('CREATE TABLE IF NOT EXISTS media_unlocks(tg_id TEXT, ai TEXT, kind TEXT, coins INTEGER, at INTEGER, PRIMARY KEY(tg_id, ai, kind))');
const chartUnlocked = (tgId, ai) => !!q("SELECT 1 FROM media_unlocks WHERE tg_id=? AND ai=? AND kind='chart'").get(String(tgId), String(ai || ''));
function mediaGate(tgId, kind, ai) {
  const M = SETTINGS.get('media'); const dep = (publicState(tgId) || {}).deposits_total || 0;
  // charts: MAX = every AI; everyone else can unlock chart reading for one AI with coins
  if (kind === 'chart' && dep < M.chartsFrom && chartUnlocked(tgId, ai)) { const used = (q('SELECT n FROM ai_usage WHERE tg_id=? AND day=?').get(String(tgId), 'chart:' + mediaDay()) || {}).n || 0;
    return {allowed: true, need: M.chartsFrom, left: Math.max(0, M.chartsPerDayUnlocked - used), per: M.chartsPerDayUnlocked, dep, via: 'coins'}; }
  const from = kind === 'chart' ? M.chartsFrom : M.voiceFrom; const per = kind === 'chart' ? M.chartsPerDay : dep >= M.maxFrom ? M.voicePerDayMax : M.voicePerDayPro;
  const used = (q('SELECT n FROM ai_usage WHERE tg_id=? AND day=?').get(String(tgId), kind + ':' + mediaDay()) || {}).n || 0;
  return {allowed: dep >= from, need: from, left: Math.max(0, per - used), per, dep};
}
const mediaUse = (tgId, kind) => q('INSERT INTO ai_usage(tg_id,day,n) VALUES(?,?,1) ON CONFLICT(tg_id,day) DO UPDATE SET n=n+1').run(String(tgId), kind + ':' + mediaDay());
routes['GET /api/ai/media'] = async (req, b, u, url) => { if (!u) return [401, {ok: false}]; const ai = url.searchParams.get('ai') || '';
  return {ok: true, chart: mediaGate(u.id, 'chart', ai), voice: mediaGate(u.id, 'voice'), unlockCoins: SETTINGS.get('media').chartUnlockCoins, unlocked: q("SELECT ai FROM media_unlocks WHERE tg_id=? AND kind='chart'").all(String(u.id)).map((r) => r.ai)}; };
// unlock chart reading for one AI with coins (MAX has it for every AI already)
routes['POST /api/ai/unlock-chart'] = async (req, b, u) => {
  if (!u) return [401, {ok: false}]; const ai = String(b.ai || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20); if (!ai) return [400, {ok: false}];
  const M = SETTINGS.get('media'); if (chartUnlocked(u.id, ai)) return {ok: true, already: true};
  q('INSERT OR IGNORE INTO rewards(tg_id) VALUES(?)').run(String(u.id)); const rw = q('SELECT coins FROM rewards WHERE tg_id=?').get(String(u.id));
  if ((rw.coins || 0) < M.chartUnlockCoins) return {ok: false, error: 'not_enough_coins', need: M.chartUnlockCoins, coins: rw.coins || 0};
  q('UPDATE rewards SET coins=coins-? WHERE tg_id=?').run(M.chartUnlockCoins, String(u.id)); q("INSERT INTO media_unlocks(tg_id,ai,kind,coins,at) VALUES(?,?,'chart',?,?)").run(String(u.id), ai, M.chartUnlockCoins, now());
  return {ok: true, coins: rw.coins - M.chartUnlockCoins};
};
const mediaProfile = (b) => ({...(b.profile || {}), key: String((b.profile || {}).key || b.ai || 'luna').slice(0, 30)});
routes['POST /api/ai/chart'] = async (req, b, u) => {
  if (!u) return [401, {ok: false, error: 'telegram_auth'}];
  const g = mediaGate(u.id, 'chart', mediaProfile(b).key); if (!g.allowed) return {ok: false, error: 'max_only', need: g.need}; if (!g.left) return {ok: false, error: 'limit', per: g.per};
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(b.image || '')); if (!m || m[2].length > 6e6) return [400, {ok: false, error: 'bad_image'}];
  if (!BRAIN.live()) return [503, {ok: false, error: 'no_ai'}];
  mediaUse(u.id, 'chart');
  const out = await BRAIN.reply({tgId: u.id, kind: 'ai', profile: mediaProfile(b), ctx: b.ctx || {}, history: b.history || [], text: String(b.text || 'Read my chart').slice(0, 300), images: [{media_type: m[1], data: m[2]}], channel: 'app', area: 'funded',
    task: 'CHART: the user shared a chart screenshot with you. Read it like a pro, in your own style and energy: which market and timeframe if you can see them, the trend, the key levels, what you would wait for, and the risk. If it is not a chart, say so kindly. Never promise a result. End by pointing to your next real signal ([CTA:signal]).'});
  BRAIN.logAI(u.id, 'chart', mediaProfile(b).key, 'user', '(chart) ' + String(b.text || '')); BRAIN.logAI(u.id, 'chart', mediaProfile(b).key, 'ai', out.messages.join(' || '), out.cta);
  return {ok: true, ...out, left: g.left - 1};
};
routes['POST /api/ai/voice-note'] = async (req, b, u) => {
  if (!u) return [401, {ok: false, error: 'telegram_auth'}];
  const g = mediaGate(u.id, 'voice'); if (!g.allowed) return {ok: false, error: 'pro_only', need: g.need}; if (!g.left) return {ok: false, error: 'limit', per: g.per};
  const buf = Buffer.from(String(b.audio || ''), 'base64'); if (buf.length < 800) return {ok: false, error: 'too_short'}; if (buf.length > 3e6) return [413, {ok: false, error: 'too_long'}];
  if (!BRAIN.live()) return [503, {ok: false, error: 'no_ai'}];
  let heard = ''; try { heard = (await VOICE.stt(buf, String(b.mime || 'audio/webm').slice(0, 60), Math.min(+b.sec || 10, 60))).text; } catch (e) { return {ok: false, error: 'not_heard'}; }
  if (!heard || heard.length < 2) return {ok: false, error: 'not_heard'};
  mediaUse(u.id, 'voice');
  const out = await BRAIN.reply({tgId: u.id, kind: 'ai', profile: mediaProfile(b), ctx: b.ctx || {}, history: b.history || [], text: heard, channel: 'app', area: g.dep >= 100 ? 'funded' : 'traders', task: 'The user sent you a VOICE NOTE (transcribed above). Reply naturally like you listened to it.'});
  BRAIN.logAI(u.id, 'voice-note', mediaProfile(b).key, 'user', heard); BRAIN.logAI(u.id, 'voice-note', mediaProfile(b).key, 'ai', out.messages.join(' || '), out.cta);
  const M = SETTINGS.get('media'); let clips = [];
  if (M.voiceReplyMax && g.dep >= M.maxFrom) clips = VOICE.splitSentences(out.messages.join(' ')).map((t) => ({text: t, clip: VOICE.tts(t, {tier: 'premium', ai: mediaProfile(b).key})})).filter((x) => x.clip);   // MAX: the AI answers out loud too
  return {ok: true, heard, ...out, clips, left: g.left - 1};
};
/* the app: settings it shows (live times, voice), and the support chat thread (so replies from a teammate appear in the app) */
// Region & language in the side menu: switch any time (only languages that are live)
routes['POST /api/app/lang'] = async (req, b, u) => { if (!u) return [401, {ok: false}]; const l = String(b.lang || ''); if (!I18N.LANGS[l] || (l !== 'en' && !I18N.isLive(l))) return [400, {ok: false, error: 'not_available'}];
  FUN.attrib(u.id, {bot: u.bot || 0, via: 'app'}); q("UPDATE attrib SET lang=?, via=COALESCE(via,'')||' switch' WHERE tg_id=?").run(l, String(u.id)); return {ok: true, lang: l}; };
routes['GET /api/app/config'] = async (req, b, u) => { const L = SETTINGS.get('lives'); const lang = u ? FUN.langOf(u.id) : 'en';
  const F = u ? FUN.mentorFor(u.id, lang) : null;
  const M = F || (lang === 'en' ? {name: L.mentor, times: L.times, link: L.link, on: !!L.on, tz: 'WAT', offset: 1} : ((SETTINGS.get('mentors') || {})[lang] || {}));
  const sup = lang === 'en' ? SETTINGS.get('support').name : (((SETTINGS.get('i18n') || {}).support || {})[lang] || SETTINGS.get('support').name);
  return {ok: true, lang, langs: Object.keys(I18N.LANGS).filter((x) => x !== 'en' && I18N.isLive(x)),
    lives: {on: !!(M.on && M.name), mentor: M.name, times: M.times, link: M.link, tz: M.tz || 'WAT', offset: M.offset ?? 1, role: M.role, bio: M.bio, photo: F ? F.photo : lang === 'en' ? '' : M.photo},
    mentor: F ? {custom: true, name: F.name, role: F.role, bio: F.bio, photo: F.photo, base: F.base, lives: F.lives, on: F.on, times: F.times, tz: F.tz, offset: F.offset, link: F.link} : null,
    support: {name: sup}, voice: (await VOICE.routes['GET /api/voice/config']()).on}; };
routes['GET /api/proof'] = async (req, b, u, url, who, res) => { const p = proofFile(url.searchParams.get('n')); if (!p) return [404, {ok: false}]; const buf = fs.readFileSync(p.f);
  res.writeHead(200, {'Content-Type': 'image/' + (p.e === 'jpg' ? 'jpeg' : p.e), 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': C.allowOrigin}); res.end(buf); return null; };
routes['GET /api/admin/knowledge/proof'] = async () => ({ok: true, list: (fs.existsSync(PROOF_DIR) ? fs.readdirSync(PROOF_DIR) : []).filter((f) => /\.(jpg|png|webp)$/.test(f))});
routes['POST /api/admin/knowledge/proof'] = async (req, b) => { const n = String(b.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40); const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(b.data || ''));
  if (!n || !m) return [400, {ok: false, error: 'name_and_image'}]; fs.mkdirSync(PROOF_DIR, {recursive: true}); for (const e of ['jpg', 'png', 'webp']) { try { fs.unlinkSync(new URL(n + '.' + e, PROOF_DIR)); } catch (x) {} }
  fs.writeFileSync(new URL(n + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]), PROOF_DIR), Buffer.from(m[2], 'base64')); return {ok: true, url: '/api/proof?n=' + n}; };
routes['GET /api/support/thread'] = async (req, b, u, url) => {
  if (!u) return [401, {ok: false, error: 'telegram_auth'}];
  const after = +url.searchParams.get('after') || 0; const t = INBOX.open(u.id);
  if (url.searchParams.get('ch') === 'mentor') return {ok: true, status: t ? t.status : 'ai', msgs: q("SELECT id, role, text, at FROM bot_msgs WHERE tg_id=? AND id>? AND channel='mentor' ORDER BY id DESC LIMIT 60").all(String(u.id), after).reverse()};
  return {ok: true, status: t ? t.status : 'ai', agent: t && t.status === 'human' ? (/^owner$/i.test(t.assignee || '') ? 'A teammate' : String(t.assignee || '').split(' ')[0]) : null,
    msgs: q("SELECT id, role, text, who, at FROM bot_msgs WHERE tg_id=? AND id>? AND role IN ('human','system') AND COALESCE(channel,'tg')<>'mentor' ORDER BY id LIMIT 50").all(String(u.id), after).map((m) => ({...m, who: m.role === 'human' ? (/^owner$/i.test(m.who || '') ? 'Support' : String(m.who || '').split(' ')[0]) : m.who}))};
};
REF.hooks.notify = (id, texts, cta) => BOT.notify(id, texts, cta);   // 'your friend joined / funded' messages   // in-app support hand-offs go to the same team group
const PAY = payRoutes({db, q, now}); Object.assign(routes, PAY.routes);

function postback(url, b) {
  const p = {...Object.fromEntries(url.searchParams), ...b};
  if (!C.postbackKey || !safeEq(p.key || '', C.postbackKey)) return [403, {ok: false, error: 'bad_key'}];
  delete p.key; return handlePostback(p);
}

/* ---------------- server ---------------- */
export function createServer() {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.method === 'GET' && /^\/admin\/?(\?.*)?$/.test(req.url)) { res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY'}); return res.end(fs.readFileSync(new URL('./admin.html', import.meta.url))); }
    const url = new URL(req.url, 'http://x'); const key = `${req.method} ${url.pathname}`;
    const h = routes[key]; if (!h) return fail(res, 404, 'not_found');
    try {
      let who = null;
      if (key.includes('/api/admin/')) {
        who = TEAM.auth(req); if (!who) return fail(res, 403, 'admin_only');
        const sec = TEAM.sectionOf(url.pathname); if (url.pathname !== '/api/admin/me' && !url.pathname.startsWith('/api/admin/alerts/') && !TEAM.can(who, sec)) return fail(res, 403, 'not_allowed_for_your_role', {section: sec});
      }
      const b = req.method === 'POST' ? await body(req, {'POST /api/voice/turn': 4.5e6, 'POST /api/ai/voice-note': 4.5e6, 'POST /api/ai/chart': 8.5e6, 'POST /api/ai/chat': 8.5e6, 'POST /api/admin/knowledge/proof': 6e6}[key] || 1e6) : {};
      const tu = key.includes('/api/admin/') ? null : tgUser(req);
      if (tu && key !== 'GET /api/me' && (q('SELECT blocked FROM users WHERE tg_id=?').get(tu.id) || {}).blocked) return fail(res, 403, 'account_blocked');
      const out = await h(req, b, tu, url, who, res);
      if (who && req.method === 'POST' && !/\/(test|count)$/.test(url.pathname) && !/^\/api\/admin\/(inbox|member|broadcast|alerts)\b/.test(url.pathname)) { const d = Object.fromEntries(Object.entries(b).filter(([k]) => !/key|secret|token|password/i.test(k)).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 80) : v])); try { TEAM.log(who, url.pathname.replace('/api/admin/', ''), JSON.stringify(d).slice(0, 400)); } catch (e) {} }
      if (out === null) return;                              // handler already sent the response (audio)
      Array.isArray(out) ? send(res, out[0], out[1]) : send(res, 200, out);
    } catch (e) { console.error(key, e.message, e.detail || ''); fail(res, e.status === 400 ? 400 : 500, e.message); }
  });
}
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  for (const k of ['botToken', 'clientId', 'redirectUri']) if (!C[k]) console.warn(`! missing config: ${k}`);
  const srv = createServer().listen(C.port, () => console.log(`Zubabot API on :${C.port}`));
  // graceful restart (deploys/updates): finish the requests in flight, close the database cleanly, then exit; systemd starts the new version
  const stop = (sig) => { console.log(`[${sig}] stopping…`); srv.close(() => { try { db.close(); } catch (e) {} process.exit(0); }); setTimeout(() => process.exit(0), 8000).unref(); };
  process.on('SIGTERM', () => stop('SIGTERM')); process.on('SIGINT', () => stop('SIGINT'));
  setInterval(() => engine.tick().catch((e) => console.warn('[strategy] tick', e.message)), 5000);
  setInterval(() => PAY.tick().catch((e) => console.warn('[pay] tick', e.message)), 20000);
  BOT.start().catch((e) => console.warn('[bot] start', e.message));
  NEWS.start();
  try { I18N.writeAll(); } catch (e) { console.warn('[i18n] files', e.message); }        // web/i18n/<lang>.js for the app
  setInterval(() => { try { VOICE.sweep(); } catch (e) { console.warn('[voice] sweep', e.message); } }, 30e3);
  setInterval(() => { try { freeTick(); } catch (e) { console.warn('[free]', e.message); } }, 3600e3); setTimeout(() => { try { freeTick(); } catch (e) {} }, 15e3);
  setInterval(() => SALES.tick().catch((e) => console.warn('[sales] tick', e.message)), 15 * 60e3);
  setInterval(() => ADMIN.runBroadcasts().catch((e) => console.warn('[broadcast]', e.message)), 20e3);
}
export {NEWS, C, db, handlePostback, coinsFor, PAY, BOT, BRAIN, REF, TEAM, INBOX, VOICE, ENGINE, SETTINGS, ADMIN, SALES, I18N, FUN};
