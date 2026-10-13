// Team: who can sign in to the admin, what each role can see, the activity log, and alerts (Telegram / email).
// The owner signs in with ADMIN_KEY. Everyone else gets a personal sign-in link from Admin -> Team.
import crypto from 'node:crypto';

export const SECTIONS = {
  overview: 'Overview', inbox: 'Support inbox', members: 'Members (view)', members_edit: 'Members (coins, block, IQ ID)', broadcast: 'Broadcast',
  lives: 'Lives & mentor', signals: 'Signals & strategy', train: 'Train the AI', invites: 'Invites & referrals', engine: 'AI engine & voice', pay: 'Crypto payments', team: 'Team & activity', settings: 'Settings',
  funnels: 'Funnels & bots', languages: 'Languages & local AIs', security: 'Security',
};
export const ROLES = {
  owner: {n: 'Owner', p: Object.keys(SECTIONS)},
  manager: {n: 'Manager', p: Object.keys(SECTIONS).filter((x) => x !== 'team')},
  support_lead: {n: 'Support lead', p: ['overview', 'inbox', 'members', 'members_edit', 'broadcast', 'train', 'invites', 'pay']},
  support: {n: 'Support agent', p: ['overview', 'inbox', 'members', 'train']},
  coach: {n: 'Coach / mentor', p: ['overview', 'lives', 'signals', 'inbox']},
  marketing: {n: 'Marketing', p: ['overview', 'broadcast', 'invites', 'funnels']},
  buyer: {n: 'Media buyer', p: ['funnels']},          // sees only the funnels, and only the sub-IDs given to them
  tech: {n: 'Tech / AI', p: ['overview', 'engine', 'train', 'settings', 'signals', 'languages', 'funnels']},
};
export const ALERTS = {
  handoff: 'Someone asked for a human', human_msg: 'New message in a chat I took over', ftd: 'First deposit (new funded user)', big_deposit: 'Big deposit',
  registration: 'New IQ Option registration', ai_spend: 'AI / voice spend near the daily budget', provider_fail: 'AI or voice provider failing', voice_busy: 'Voice calls are full', security: 'Security: blocked or flagged messages, affiliate ID changes',
};
const DEFAULT_ALERTS = {owner: ['handoff', 'big_deposit', 'ai_spend', 'provider_fail', 'security'], manager: ['handoff', 'ftd', 'big_deposit', 'ai_spend', 'provider_fail', 'security'], support_lead: ['handoff', 'human_msg', 'security'], support: ['handoff', 'human_msg'], coach: [], marketing: ['ftd'], buyer: [], tech: ['ai_spend', 'provider_fail', 'voice_busy']};

// which section each admin API belongs to
const ROUTE_SECTION = [
  [/^\/api\/admin\/(inbox|ticket)/, 'inbox'], [/^\/api\/admin\/member\//, 'members_edit'], [/^\/api\/admin\/(members?|users|ai-log)/, 'members'], [/^\/api\/admin\/(broadcast|sales)/, 'broadcast'],
  [/^\/api\/admin\/lives/, 'lives'], [/^\/api\/admin\/(strategy|signals|results|reset-test)/, 'signals'], [/^\/api\/admin\/knowledge/, 'train'],
  [/^\/api\/admin\/(referrals|invites|import-accounts)/, 'invites'], [/^\/api\/admin\/(engine|voice)/, 'engine'], [/^\/api\/admin\/pay/, 'pay'],
  [/^\/api\/admin\/security/, 'security'], [/^\/api\/admin\/(funnels|bots)/, 'funnels'], [/^\/api\/admin\/languages/, 'languages'],
  [/^\/api\/admin\/(team|activity)/, 'team'], [/^\/api\/admin\/(settings|bot)/, 'settings'], [/^\/api\/admin\/(stats|overview|me|alerts\/me)/, 'overview'],
];
export const sectionOf = (p) => { for (const [re, s] of ROUTE_SECTION) if (re.test(p)) return s; return 'settings'; };

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function makeTeam({db, q, now, C}) {
  const env = process.env;
  db.exec(`CREATE TABLE IF NOT EXISTS team(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, role TEXT, key_hash TEXT UNIQUE, key_hint TEXT, tg_chat_id TEXT, tg_name TEXT, email TEXT,
      alerts TEXT, email_alerts INTEGER DEFAULT 0, link_code TEXT, active INTEGER DEFAULT 1, created_at INTEGER, last_seen INTEGER);
    CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY AUTOINCREMENT, who TEXT, role TEXT, action TEXT, detail TEXT, at INTEGER);
    CREATE INDEX IF NOT EXISTS activity_at ON activity(at);
    CREATE TABLE IF NOT EXISTS owner_prefs(k TEXT PRIMARY KEY, v TEXT);`);
  if (!q('PRAGMA table_info(team)').all().some((c) => c.name === 'subs')) db.exec('ALTER TABLE team ADD COLUMN subs TEXT');      // media buyers: their sub-IDs
  const hooks = {sendTg: null};          // set by the server: (chatId, text, buttons) -> Promise
  const OWNER = () => {
    const p = Object.fromEntries(q('SELECT k,v FROM owner_prefs').all().map((r) => [r.k, r.v]));
    return {id: 0, name: p.name || 'Owner', role: 'owner', tg_chat_id: p.tg_chat_id || '', email: p.email || env.OWNER_EMAIL || '', alerts: p.alerts ? JSON.parse(p.alerts) : DEFAULT_ALERTS.owner, email_alerts: +(p.email_alerts || 0), link_code: p.link_code || ''};
  };
  const setOwner = (k, v) => q('INSERT INTO owner_prefs(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v));
  const rowOut = (r) => r && {id: r.id, name: r.name, role: r.role, roleName: (ROLES[r.role] || {}).n, perms: (ROLES[r.role] || ROLES.support).p, tg: !!r.tg_chat_id, tgName: r.tg_name || '', email: r.email || '',
    alerts: Array.isArray(r.alerts) ? r.alerts : JSON.parse(r.alerts || '[]'), emailAlerts: !!r.email_alerts, active: r.id === 0 ? true : !!r.active, keyHint: r.key_hint || '', subs: r.subs || '', lastSeen: r.last_seen || null, createdAt: r.created_at || null};

  // who is calling the admin API
  function auth(req) {
    const k = String(req.headers['x-admin-key'] || '');
    if (!k) return null;
    if (C.adminKey && safeEq(k, C.adminKey)) return {...OWNER(), perms: ROLES.owner.p};
    const r = q('SELECT * FROM team WHERE key_hash=? AND active=1').get(sha(k));
    if (!r) return null;
    if (!r.last_seen || now() - r.last_seen > 60e3) q('UPDATE team SET last_seen=? WHERE id=?').run(now(), r.id);
    return {...r, perms: (ROLES[r.role] || ROLES.support).p};
  }
  const can = (who, section) => !!who && (who.perms || []).includes(section);
  const log = (who, action, detail) => q('INSERT INTO activity(who,role,action,detail,at) VALUES(?,?,?,?,?)').run(who ? who.name : 'system', who ? who.role : 'system', String(action).slice(0, 80), String(detail || '').slice(0, 600), now());
  const signInLink = (key) => (env.PUBLIC_URL || '').replace(/\/$/, '') + '/admin#key=' + key;
  const alertLink = (code) => `https://t.me/${env.BOT_USERNAME || 'zubabot'}?start=alerts_${code}`;

  /* ---------- alerts ---------- */
  const lastSent = new Map();
  async function email(to, subject, text) {
    if (env.RESEND_API_KEY) {
      const r = await fetch('https://api.resend.com/emails', {method: 'POST', headers: {authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json'},
        body: JSON.stringify({from: env.ALERT_FROM || 'Zubabot alerts <alerts@zubabot.com>', to: [to], subject, text})});
      if (!r.ok) throw new Error('resend ' + r.status);
    } else if (env.BREVO_API_KEY) {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {method: 'POST', headers: {'api-key': env.BREVO_API_KEY, 'content-type': 'application/json'},
        body: JSON.stringify({sender: {email: (env.ALERT_FROM || 'alerts@zubabot.com').replace(/.*<|>.*/g, ''), name: 'Zubabot alerts'}, to: [{email: to}], subject, textContent: text})});
      if (!r.ok) throw new Error('brevo ' + r.status);
    }
  }
  // type: key of ALERTS. opt.to = only this member (by name), opt.key = de-duplicate within opt.every ms, opt.url = "Open" button
  async function alert(type, text, opt = {}) {
    if (opt.key) { const k = type + ':' + opt.key, t = lastSent.get(k) || 0; if (now() - t < (opt.every || 15 * 60e3)) return 0; lastSent.set(k, now()); }
    const people = [OWNER(), ...q('SELECT * FROM team WHERE active=1').all().map((r) => ({...r, alerts: JSON.parse(r.alerts || '[]')}))]
      .filter((p) => (opt.to ? p.name === opt.to : (p.alerts || []).includes(type) || (opt.all && (p.role === 'owner' || p.role === 'manager'))));
    let n = 0; const btn = opt.url ? {inline_keyboard: [[{text: opt.button || 'Open in admin', url: opt.url}]]} : undefined;
    for (const p of people) {
      if (p.tg_chat_id && hooks.sendTg) { try { await hooks.sendTg(p.tg_chat_id, text, btn, opt.tgId); n++; } catch (e) { console.warn('[alert] tg', p.name, e.message); } }
      if (p.email && (p.email_alerts || opt.email)) { try { await email(p.email, 'Zubabot: ' + (ALERTS[type] || type), text + (opt.url ? '\n\n' + opt.url : '')); n++; } catch (e) { console.warn('[alert] email', e.message); } }
    }
    return n;
  }
  // the bot calls this when someone sends /start alerts_<code>
  function connect(linkCode, chatId, tgName) {
    if (!linkCode) return null;
    const o = OWNER(); if (o.link_code && o.link_code === linkCode) { setOwner('tg_chat_id', chatId); setOwner('link_code', crypto.randomBytes(9).toString('base64url')); return o.name || 'Owner'; }
    const r = q('SELECT * FROM team WHERE link_code=? AND active=1').get(linkCode); if (!r) return null;
    q('UPDATE team SET tg_chat_id=?, tg_name=?, link_code=? WHERE id=?').run(String(chatId), String(tgName || ''), code(), r.id); return r.name;   // the link works once
  }
  const isTeamChat = (chatId) => String(chatId) === String(OWNER().tg_chat_id) || !!q('SELECT 1 FROM team WHERE tg_chat_id=? AND active=1').get(String(chatId));
  const memberByChat = (chatId) => String(chatId) === String(OWNER().tg_chat_id) ? OWNER() : q('SELECT * FROM team WHERE tg_chat_id=? AND active=1').get(String(chatId));
  const code = () => crypto.randomBytes(9).toString('base64url');

  const routes = {
    'GET /api/admin/me': async (req, b, u, url, who) => ({ok: true, me: {...rowOut(who), alertLink: who.link_code ? alertLink(who.link_code) : ''}, sections: SECTIONS, roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.n])), alerts: ALERTS}),
    'POST /api/admin/alerts/me': async (req, b, u, url, who) => {
      const alerts = (b.alerts || []).filter((x) => ALERTS[x]); const c = who.link_code || code();
      if (who.id === 0) { setOwner('alerts', JSON.stringify(alerts)); setOwner('link_code', c); if (b.email !== undefined) setOwner('email', String(b.email).slice(0, 120)); setOwner('email_alerts', b.emailAlerts ? 1 : 0); if (b.name) setOwner('name', String(b.name).slice(0, 40)); if (b.disconnect) setOwner('tg_chat_id', ''); }
      else q('UPDATE team SET alerts=?, link_code=?, email=COALESCE(?,email), email_alerts=?, tg_chat_id=CASE WHEN ? THEN NULL ELSE tg_chat_id END WHERE id=?').run(JSON.stringify(alerts), c, b.email === undefined ? null : String(b.email).slice(0, 120), b.emailAlerts ? 1 : 0, b.disconnect ? 1 : 0, who.id); if (b.name) { const nn = String(b.name).trim().slice(0, 40); if (/^owner$/i.test(nn) || q('SELECT 1 FROM team WHERE name=? AND id<>?').get(nn, who.id)) return [409, {ok: false, error: 'name_taken'}]; q('UPDATE team SET name=? WHERE id=?').run(nn, who.id); }
      return {ok: true, alertLink: alertLink(c)};
    },
    'POST /api/admin/alerts/test': async (req, b, u, url, who) => ({ok: true, sent: await alert('handoff', `🔔 Test alert for ${who.name}. Alerts work ✅`, {to: who.name})}),
    'GET /api/admin/team': async () => ({ok: true, team: [rowOut(OWNER()), ...q('SELECT * FROM team ORDER BY active DESC, id').all().map(rowOut)], roles: ROLES, sections: SECTIONS, alerts: ALERTS}),
    'POST /api/admin/team': async (req, b, u, url, who) => {
      const name = String(b.name || '').trim().slice(0, 40), role = ROLES[b.role] && b.role !== 'owner' ? b.role : 'support';
      if (!name) return [400, {ok: false, error: 'name'}]; if (/^owner$/i.test(name) || q('SELECT 1 FROM team WHERE name=?').get(name)) return [409, {ok: false, error: 'name_taken'}];
      const key = 'zbt_' + crypto.randomBytes(18).toString('base64url');
      q('INSERT INTO team(name,role,key_hash,key_hint,alerts,link_code,active,created_at,subs) VALUES(?,?,?,?,?,?,1,?,?)').run(name, role, sha(key), key.slice(-4), JSON.stringify(DEFAULT_ALERTS[role] || []), code(), now(), String(b.subs || '').replace(/[^A-Za-z0-9,\- ]/g, '').slice(0, 300));
      return {ok: true, key, link: signInLink(key), note: 'Send this link to ' + name + ' privately. It is shown once.'};
    },
    'POST /api/admin/team/update': async (req, b) => {
      const r = q('SELECT * FROM team WHERE id=?').get(+b.id); if (!r) return [404, {ok: false}];
      if (b.role && ROLES[b.role] && b.role !== 'owner') q('UPDATE team SET role=? WHERE id=?').run(b.role, r.id);
      if (b.active !== undefined) q('UPDATE team SET active=? WHERE id=?').run(b.active ? 1 : 0, r.id);
      if (b.subs !== undefined) q('UPDATE team SET subs=? WHERE id=?').run(String(b.subs).replace(/[^A-Za-z0-9,\- ]/g, '').slice(0, 300), r.id);
      if (b.name) { const nn = String(b.name).trim().slice(0, 40); if (/^owner$/i.test(nn) || q('SELECT 1 FROM team WHERE name=? AND id<>?').get(nn, r.id)) return [409, {ok: false, error: 'name_taken'}]; q('UPDATE team SET name=? WHERE id=?').run(nn, r.id); }
      if (b.newKey) { const key = 'zbt_' + crypto.randomBytes(18).toString('base64url'); q('UPDATE team SET key_hash=?, key_hint=? WHERE id=?').run(sha(key), key.slice(-4), r.id); return {ok: true, key, link: signInLink(key)}; }
      return {ok: true};
    },
    'GET /api/admin/activity': async (req, b, u, url) => {
      const who = url.searchParams.get('who'); const lim = Math.min(+url.searchParams.get('limit') || 200, 1000);
      return {ok: true, rows: who ? q('SELECT * FROM activity WHERE who=? ORDER BY id DESC LIMIT ?').all(who, lim) : q('SELECT * FROM activity ORDER BY id DESC LIMIT ?').all(lim)};
    },
  };
  return {routes, auth, can, log, alert, connect, isTeamChat, memberByChat, hooks, sectionOf, OWNER};
}
