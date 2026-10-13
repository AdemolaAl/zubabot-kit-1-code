// Funnels and bots: many Telegram bots (one per country/language, or just for testing), all on this one server and database.
//
// Bot       = a Telegram bot + its mini app. The main bot is TELEGRAM_BOT_TOKEN; more are added in Admin -> Funnels -> Bots.
// Funnel    = how people arrive. Each has a language, a bot, a type and a welcome flow:
//   bot     t.me/<bot>?start=f_<funnel>_<sub>          -> welcome flow in the bot chat -> mini app
//   join    a channel with join requests                -> the bot accepts them (instantly or after a delay) and DMs the flow
//   direct  t.me/<bot>/<app>?startapp=f_<funnel>_<sub> -> straight into the mini app
// Sub-ID    = anything after the funnel name (media buyer, ad set, creative). First touch wins and stays with the person,
//             so sign-ups, deposits and $ show per funnel and per sub in Admin.
import crypto from 'node:crypto';
import fs from 'node:fs';
import {LANGS, isLang} from './i18n.js';

export const parseStart = (p) => {
  const m = String(p || '').match(/^f_([a-z0-9-]{1,30})(?:_([A-Za-z0-9-]{1,40}))?$/);
  return m ? {slug: m[1], sub: m[2] || ''} : null;
};
const slugOk = (s) => /^[a-z0-9-]{1,30}$/.test(s || '');
const subOk = (s) => /^[A-Za-z0-9-]{0,40}$/.test(s || '');

const MPHOTO_DIR = new URL('./knowledge/mentor-photos/', import.meta.url);
export function makeFunnels({db, q, now, C, i18n, settings}) {
  db.exec(`CREATE TABLE IF NOT EXISTS bots(id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE, username TEXT, title TEXT, lang TEXT DEFAULT 'en', app_name TEXT DEFAULT 'app', on_ INTEGER DEFAULT 1, created_at INTEGER, error TEXT);
    CREATE TABLE IF NOT EXISTS funnels(slug TEXT PRIMARY KEY, name TEXT, lang TEXT DEFAULT 'en', bot INTEGER DEFAULT 0, type TEXT DEFAULT 'bot', flow TEXT, channel_id TEXT, channel_title TEXT,
      approve TEXT DEFAULT 'instant', approve_delay INTEGER DEFAULT 0, active INTEGER DEFAULT 1, note TEXT, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS funnel_history(id INTEGER PRIMARY KEY AUTOINCREMENT, funnel TEXT, who TEXT, at INTEGER, changes TEXT);
    CREATE TABLE IF NOT EXISTS funnel_links(invite_link TEXT PRIMARY KEY, funnel TEXT, sub TEXT, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS attrib(tg_id TEXT PRIMARY KEY, funnel TEXT, sub TEXT, bot INTEGER DEFAULT 0, lang TEXT, via TEXT, first_at INTEGER);
    CREATE INDEX IF NOT EXISTS attrib_f ON attrib(funnel, sub);
    CREATE TABLE IF NOT EXISTS join_queue(tg_id TEXT, chat_id TEXT, bot INTEGER, user_chat TEXT, funnel TEXT, sub TEXT, first_name TEXT, due_at INTEGER, done INTEGER DEFAULT 0, PRIMARY KEY(tg_id, chat_id));`);
  // the main English funnel always exists, so every person has a funnel (old links like ?start=lp1 count as funnel "main", sub "lp1")
  for (const [c, t] of [['aff_id', 'TEXT'], ['aff_link', 'TEXT'], ['track', 'TEXT'], ['track_sub', 'INTEGER DEFAULT 1'], ['updated_by', 'TEXT'], ['updated_at', 'INTEGER'], ['mentor', 'TEXT'], ['follow', 'TEXT']]) if (!q('PRAGMA table_info(funnels)').all().some((x) => x.name === c)) db.exec(`ALTER TABLE funnels ADD COLUMN ${c} ${t}`);
  q("INSERT OR IGNORE INTO funnels(slug,name,lang,bot,type,active,created_at) VALUES('main','Main (English)','en',0,'bot',1,?)").run(now());
  let SEC = null; const setSecurity = (s) => { SEC = s; };
  // the affiliate ID, sign-up link and afftrack for this person's funnel (afftrack always ends in tg<TelegramID>, so the sign-up still links to them)
  function affFor(tgId) {
    const a = q('SELECT funnel, sub FROM attrib WHERE tg_id=?').get(String(tgId)) || {}; const f = a.funnel ? funnel(a.funnel) : null;
    const allowed = SEC ? SEC.allowedAff() : [String(C.affId || '')];
    const affId = f && f.aff_id && allowed.includes(f.aff_id) ? f.aff_id : allowed.includes(String(C.affId)) ? C.affId : allowed[0] || C.affId;
    const prefix = f && f.track ? f.track : C.trackPrefix;
    const sub = f && f.track_sub !== 0 && a.sub ? String(a.sub).replace(/[^A-Za-z0-9-]/g, '').slice(0, 24) + '_' : '';
    let link = f && f.aff_link ? f.aff_link : C.affLink;
    if (link && SEC && SEC.scan(String(link).replace('{afftrack}', 'x')).severity === 'block') link = C.affLink;     // never send people to a link that isn't ours
    return {affId, afftrack: prefix + sub + 'tg' + tgId, link};
  }

  /* ---------- bots ---------- */
  const mainBot = {id: 0, token: process.env.TELEGRAM_BOT_TOKEN || '', username: process.env.BOT_USERNAME || '', title: 'Main bot', lang: 'en', app_name: (process.env.MINIAPP_NAME || 'app'), on_: 1, main: true};
  const bots = () => [mainBot, ...q('SELECT * FROM bots WHERE on_=1 ORDER BY id').all()].filter((b) => b.token);
  const bot = (id) => (+id === 0 || id == null ? mainBot : q('SELECT * FROM bots WHERE id=?').get(+id)) || mainBot;
  const tokens = () => bots().map((b) => [b.id, b.token]);
  const hooks = {startBot: null, stopBot: null, tgFor: null};                     // set by the bot module
  const pub = (b) => ({id: b.id, username: b.username, title: b.title, lang: b.lang, app_name: b.app_name, on: !!b.on_, main: !!b.main, error: b.error || '', tokenHint: b.token ? '…' + b.token.slice(-5) : '', users: (q('SELECT COUNT(*) n FROM attrib WHERE bot=?').get(b.id) || {}).n || 0});

  /* ---------- who came from where ---------- */
  const funnel = (slug) => q('SELECT * FROM funnels WHERE slug=?').get(String(slug || ''));
  function attrib(tgId, {slug, sub = '', bot: botId = 0, via = '', lang} = {}) {
    const id = String(tgId); let f = slug ? funnel(slug) : null; if (f && !f.active) f = null;
    const L = (f && f.lang) || lang || bot(botId).lang || 'en';
    const cur = q('SELECT * FROM attrib WHERE tg_id=?').get(id);
    if (!cur) { q('INSERT INTO attrib(tg_id,funnel,sub,bot,lang,via,first_at) VALUES(?,?,?,?,?,?,?)').run(id, f ? f.slug : (slug === undefined ? null : 'main'), subOk(sub) ? sub : '', +botId || 0, L, f || slug === undefined ? via : via + ' fallback', now()); }
    // first touch wins; but a paused / unknown funnel link only parks them in 'main' until a real funnel link comes
    else if ((!cur.funnel || / fallback$/.test(cur.via || '')) && f) q('UPDATE attrib SET funnel=?, sub=?, lang=COALESCE(lang,?), bot=?, via=? WHERE tg_id=?').run(f.slug, subOk(sub) ? sub : '', L, +botId || 0, via, id);
    return q('SELECT * FROM attrib WHERE tg_id=?').get(id);
  }
  // legacy start parameters (lp1, tiktok1…) -> funnel "main" with that sub
  function fromStart(tgId, param, botId = 0, via = 'bot') {
    const p = parseStart(param);
    if (p) return attrib(tgId, {slug: p.slug, sub: p.sub, bot: botId, via});
    if (param && /^[A-Za-z0-9-]{1,40}$/.test(param) && !/^(ref|alerts)/i.test(param)) return attrib(tgId, {slug: botId ? defaultFunnel(botId) : 'main', sub: param, bot: botId, via});
    return attrib(tgId, {slug: botId ? defaultFunnel(botId) : undefined, bot: botId, via});
  }
  const defaultFunnel = (botId) => (q("SELECT slug FROM funnels WHERE bot=? AND active=1 AND type<>'join' ORDER BY created_at LIMIT 1").get(+botId) || {}).slug || 'main';
  // the person's language: their funnel's (or bot's), only when that language is live. Otherwise English.
  function langOf(tgId) {
    const a = q('SELECT lang, bot FROM attrib WHERE tg_id=?').get(String(tgId));
    const l = (a && a.lang) || (a ? bot(a.bot).lang : 'en') || 'en';
    return isLang(l) && i18n.isLive(l) ? l : 'en';
  }
  const botOf = (tgId) => { const a = q('SELECT bot FROM attrib WHERE tg_id=?').get(String(tgId)); return a ? +a.bot || 0 : 0; };

  /* ---------- a funnel can have its own lead mentor (name, photo, lives) instead of Roland / the region's mentor ----------
     lives: 'main' = same live times and link as the region's mentor, 'own' = this mentor's own link and times, 'off' = no lives */
  const T5 = (t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t).trim());
  function cleanMentor(m) {
    if (!m || typeof m !== 'object') return null;
    const photo = String(m.photo || '').trim().slice(0, 300);
    const link = String(m.link || '').trim().slice(0, 300);
    return {on: !!m.on, name: String(m.name || '').replace(/[<>{}]/g, '').trim().slice(0, 40), role: String(m.role || '').replace(/[<>]/g, '').slice(0, 60), bio: String(m.bio || '').replace(/[<>]/g, '').slice(0, 300),
      photo: /^(\/api\/mphoto\?n=[a-z0-9-]+|mentors\/[a-z0-9_-]+\.(jpg|png|webp)|https:\/\/[^\s"'<>]+)$/i.test(photo) ? photo : '',
      lives: ['main', 'own', 'off'].includes(m.lives) ? m.lives : 'main', link: /^https:\/\/[^\s"'<>]+$/.test(link) ? link : '',
      times: (Array.isArray(m.times) ? m.times : String(m.times || '').split(',')).map((t) => String(t).trim()).filter(T5).map((t) => t.padStart(5, '0')).slice(0, 8),
      tz: String(m.tz || '').replace(/[^A-Za-z0-9+:-]/g, '').slice(0, 10), offset: Math.max(-12, Math.min(14, +m.offset || 0))};
  }
  // automatic follow-ups for people from this funnel who haven't started trading: how often, written fresh by their own AI or from the set messages
  const STAGES = ['no_app', 'no_account', 'no_deposit', 'funded'];
  const cleanFollow = (x) => { if (!x || typeof x !== 'object') return null; const every = [30, 60, 120, 180, 360, 720].includes(+x.every) ? +x.every : 60;
    const hrs = /^\d{1,2}-\d{1,2}$/.test(String(x.hours || '')) && String(x.hours).split('-').every((h) => +h >= 0 && +h <= 24) && +String(x.hours).split('-')[0] !== +String(x.hours).split('-')[1] ? String(x.hours) : '8-22';
    return {on: !!x.on, every, style: x.style === 'set' ? 'set' : 'ai', hours: hrs, days: Math.max(1, Math.min(60, +x.days || 14)), stages: (Array.isArray(x.stages) ? x.stages : STAGES).filter((k) => STAGES.includes(k)), signals: x.signals !== false}; };
  const followJSON = (f) => { try { return f && f.follow ? cleanFollow(JSON.parse(f.follow)) : null; } catch (e) { return null; } };
  const followOf = (tgId) => { const a = q('SELECT funnel FROM attrib WHERE tg_id=?').get(String(tgId)); const f = a && a.funnel ? funnel(a.funnel) : null; return followJSON(f); };
  const mentorJSON = (f) => { try { return f && f.mentor ? JSON.parse(f.mentor) : null; } catch (e) { return null; } };
  // the region's normal mentor (English: Roland from Admin -> Lives)
  function baseMentor(lang) {
    if (lang === 'en') { const L = settings.get('lives') || {}; return {name: L.mentor || 'Roland', times: L.times || [], tz: 'WAT', offset: 1, on: !!L.on, link: L.link || '', photo: '', role: '', bio: ''}; }
    const m = (settings.get('mentors') || {})[lang] || {}; return {name: m.name || '', times: m.times || [], tz: m.tz || 'UTC', offset: +m.offset || 0, on: !!(m.on && m.name), link: m.link || '', photo: m.photo || '', role: m.role || '', bio: m.bio || ''};
  }
  // this person's mentor when their funnel has its own (and they are still in that funnel's language), else null
  function mentorFor(tgId, lang) {
    const a = q('SELECT funnel FROM attrib WHERE tg_id=?').get(String(tgId)); if (!a || !a.funnel) return null;
    const f = funnel(a.funnel); const m = mentorJSON(f); if (!m || !m.on || !m.name) return null;
    const L = lang || langOf(tgId); const FL = f.lang || 'en';
    if (FL !== L && !(L === 'en' && FL !== 'en' && !i18n.isLive(FL))) return null;      // their funnel's language is off -> they see English, still with their funnel's mentor
    const b = baseMentor(L), own = m.lives === 'own', off = m.lives === 'off';
    return {custom: true, slug: f.slug, lang: L, base: b.name, name: m.name, role: m.role, bio: m.bio, photo: m.photo,
      lives: m.lives, times: own ? m.times : off ? [] : b.times, tz: own ? (m.tz || b.tz) : b.tz, offset: own ? (m.tz ? m.offset : b.offset) : b.offset,
      link: own ? m.link : off ? '' : b.link, on: off ? false : own ? !!(m.link && m.times.length) : b.on};
  }
  // swap the region mentor's name for the funnel mentor's name in anything we send this person
  const esc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function swapMentor(tgId, text, lang) {
    if (text == null || text === '') return text; const M = mentorFor(tgId, lang); if (!M) return text;
    const names = [...new Set([M.base, 'Roland', (settings.get('lives') || {}).mentor].filter((x) => x && x !== M.name))]; if (!names.length) return text;
    return String(text).replace(new RegExp('(^|[^\\p{L}])(' + names.map(esc).join('|') + ')(?![\\p{L}])', 'gu'), (all, pre) => pre + M.name);
  }

  /* ---------- numbers per funnel and per sub ---------- */
  function statsBy(where, args, group) {
    return q(`SELECT ${group} g, COUNT(*) users, SUM(CASE WHEN u.tg_id IS NOT NULL THEN 1 ELSE 0 END) opened, SUM(CASE WHEN u.linked=1 THEN 1 ELSE 0 END) accounts,
      SUM(CASE WHEN COALESCE(x.deposits_total,0)>=? THEN 1 ELSE 0 END) funded, COALESCE(SUM(x.deposits_total),0) deposits
      FROM attrib a LEFT JOIN users u ON u.tg_id=a.tg_id LEFT JOIN aff_accounts x ON x.iq_user_id=u.iq_user_id ${where} GROUP BY ${group} ORDER BY users DESC LIMIT 500`).all(C.minDeposit || 20, ...args);
  }
  // media buyers only see their own sub-IDs (Admin -> Team -> their "sub-IDs")
  const buyerSubs = (who) => (who && who.role === 'buyer' ? String(who.subs || '').split(/[,\s]+/).filter(Boolean) : null);
  const subFilter = (who) => { const s = buyerSubs(who); if (!s) return ['', []]; if (!s.length) return [' AND 1=0', []]; return [' AND (' + s.map(() => '(a.sub=? OR instr(a.sub, ?)=1 OR instr(a.sub, ?)=1)').join(' OR ') + ')', s.flatMap((x) => [x, x + '-', x + '_'])]; };
  // a buyer's sub "b1" covers b1, b1-adset, b1_tiktok, but not b10
  const subMine = (sub, mine) => mine.some((p) => sub === p || String(sub).startsWith(p + '-') || String(sub).startsWith(p + '_'));

  function links(f) {
    const b = bot(f.bot); const u = b.username || '<bot>';
    if (f.type === 'direct') return {base: `https://t.me/${u}/${b.app_name || 'app'}?startapp=f_${f.slug}`, withSub: `https://t.me/${u}/${b.app_name || 'app'}?startapp=f_${f.slug}_SUB`};
    if (f.type === 'join') return {base: '', withSub: '', note: 'Make one invite link per sub below (the bot must be an admin of the channel with "Invite users" on).'};
    return {base: `https://t.me/${u}?start=f_${f.slug}`, withSub: `https://t.me/${u}?start=f_${f.slug}_SUB`};
  }

  /* ---------- join-request funnels ---------- */
  // called by the bot for chat_join_request updates
  function onJoinRequest(botId, r) {
    if (!r || !r.from || !r.chat) return null;
    let link = r.invite_link && r.invite_link.invite_link ? q('SELECT * FROM funnel_links WHERE invite_link=?').get(r.invite_link.invite_link) : null;
    const f = (link && funnel(link.funnel)) || q("SELECT * FROM funnels WHERE type='join' AND channel_id=? AND active=1 ORDER BY created_at LIMIT 1").get(String(r.chat.id));
    if (!f || !f.active || f.approve === 'off') return null;
    attrib(r.from.id, {slug: f.slug, sub: link ? link.sub : '', bot: botId, via: 'join'});
    const due = now() + (f.approve === 'delay' ? Math.max(0, +f.approve_delay || 0) * 1000 : 0);
    q('INSERT OR IGNORE INTO join_queue(tg_id,chat_id,bot,user_chat,funnel,sub,first_name,due_at) VALUES(?,?,?,?,?,?,?,?)').run(String(r.from.id), String(r.chat.id), +botId || 0, String(r.user_chat_id || r.from.id), f.slug, link ? link.sub : '', r.from.first_name || '', due);
    return {funnel: f, due};
  }
  const dueJoins = () => q('SELECT * FROM join_queue WHERE done=0 AND due_at<=? LIMIT 50').all(now());
  const doneJoin = (j, ok) => q('UPDATE join_queue SET done=? WHERE tg_id=? AND chat_id=?').run(ok ? 1 : 2, j.tg_id, j.chat_id);

  const flowsList = () => Object.entries((settings.get('flows') || {}).list || {}).map(([k, v]) => ({key: k, name: v.name || k, lang: v.lang || 'en'}));
  const out = (f, who) => { const [w, a] = subFilter(who); const s = statsBy('WHERE a.funnel=?' + w, [f.slug, ...a], 'a.funnel')[0] || {users: 0, opened: 0, accounts: 0, funded: 0, deposits: 0};
    return {...f, mentor: mentorJSON(f), follow: followJSON(f), active: !!f.active, botName: bot(f.bot).username || bot(f.bot).title, links: links(f), stats: s}; };

  const routes = {
    'GET /api/admin/funnels': async (req, b, u, url, who) => {
      const buyer = buyerSubs(who);
      return {ok: true, buyer: !!buyer, mySubs: buyer || [], affIds: SEC ? SEC.allowedAff() : [String(C.affId || '')], funnels: q('SELECT * FROM funnels ORDER BY created_at').all().map((f) => out(f, who)), bots: buyer ? bots().map((x) => ({id: x.id, username: x.username, lang: x.lang})) : bots().map(pub),
        langs: Object.fromEntries(Object.entries(LANGS).map(([k, v]) => [k, {n: v.n, flag: v.flag, live: i18n.isLive(k)}])), flows: flowsList()};
    },
    'GET /api/admin/funnels/history': async (req, b, u, url, who) => buyerSubs(who) ? [403, {ok: false}] : ({ok: true, rows: q('SELECT * FROM funnel_history WHERE funnel=? ORDER BY id DESC LIMIT 100').all(String(url.searchParams.get('slug') || ''))}),
    'GET /api/admin/funnels/subs': async (req, b, u, url, who) => {
      const slug = String(url.searchParams.get('slug') || ''); const [w, a] = subFilter(who); const days = Math.min(+url.searchParams.get('days') || 0, 365);
      const since = days ? ' AND a.first_at>=' + (now() - days * 864e5) : '';
      return {ok: true, rows: statsBy('WHERE a.funnel=?' + w + since, [slug, ...a], "COALESCE(NULLIF(a.sub,''),'(no sub)')"),
        links: q('SELECT invite_link, sub, created_at FROM funnel_links WHERE funnel=? ORDER BY created_at DESC').all(slug).filter((l) => !buyerSubs(who) || subMine(String(l.sub), buyerSubs(who)))};
    },
    'POST /api/admin/funnels/save': async (req, b, u, url, who) => {
      if (buyerSubs(who)) return [403, {ok: false, error: 'not_allowed_for_your_role'}];
      // affiliate safety: only our affiliate IDs, in the ID field and inside the sign-up link
      const allowed = SEC ? SEC.allowedAff() : [String(C.affId || '')];
      const affId = String(b.aff_id || '').trim(); if (affId && !allowed.includes(affId)) return [400, {ok: false, error: `affiliate ID ${affId} is not one of ours (${allowed.join(', ')}). Only the owner can add IDs, in Security.`}];
      const affLink = String(b.aff_link || '').trim().slice(0, 500);
      if (affLink) { if (!/^https:\/\//.test(affLink)) return [400, {ok: false, error: 'the sign-up link must start with https://'}];
        let lu = null; try { lu = new URL(affLink.replace('{afftrack}', 'x')); } catch (e) { return [400, {ok: false, error: 'that sign-up link is not a valid link'}]; }
        const host = lu.hostname.toLowerCase(); const brokerHosts = ['iqoption.com', 'iq.com', 'iqbroker.com', ...((settings.get('security') || {}).brokerDomains || [])];
        if (!brokerHosts.some((d) => host === d || host.endsWith('.' + d))) return [400, {ok: false, error: `the sign-up link must be on IQ Option (${brokerHosts.join(', ')}), not ${host}`}];
        const ids = [...lu.searchParams.entries()].filter(([k]) => /^(aff|affid|aff_id|partner|partner_id|btag|pid|affiliate)$/i.test(k)).map(([, v]) => v);
        if (ids.length !== 1 || !allowed.includes(ids[0])) return [400, {ok: false, error: `the sign-up link must contain aff=${allowed[0]} exactly once`}];
        if (SEC) { const r = SEC.scan(affLink.replace('{afftrack}', 'x')); if (r.severity === 'block') return [400, {ok: false, error: 'Security blocked this link: ' + r.findings.map((x) => x.why).join('; ')}]; } }
      const track = String(b.track || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
      const slug = String(b.slug || '').toLowerCase().trim(); if (!slugOk(slug)) return [400, {ok: false, error: 'funnel name in the link: small letters, numbers and - only (max 30)'}];
      const lang = isLang(b.lang) ? b.lang : 'en'; const type = ['bot', 'join', 'direct'].includes(b.type) ? b.type : 'bot'; const botId = +b.bot || 0;
      if (botId && !q('SELECT 1 FROM bots WHERE id=?').get(botId)) return [400, {ok: false, error: 'bot_not_found'}];
      const flows = (settings.get('flows') || {}).list || {}; const flow = b.flow && flows[b.flow] ? b.flow : null;
      const approve = ['instant', 'delay', 'off'].includes(b.approve) ? b.approve : 'instant';
      const mentor = b.mentor === undefined ? undefined : cleanMentor(b.mentor);
      if (mentor && mentor.on && !mentor.name) return [400, {ok: false, error: 'give the mentor a name (or switch the custom mentor off)'}];
      if (mentor && mentor.on && mentor.lives === 'own' && (!mentor.link || !mentor.times.length)) return [400, {ok: false, error: 'own lives need a live link (https://…) and at least one time like 19:00'}];
      if (b.mentor && b.mentor.photo && mentor && !mentor.photo) return [400, {ok: false, error: 'upload the mentor photo with the Upload button (or paste an https:// image link)'}];
      if (b.follow && typeof b.follow === 'object' && b.follow.on) { const hh = String(b.follow.hours || '8-22');
        if (!/^\d{1,2}-\d{1,2}$/.test(hh) || hh.split('-').some((h) => +h > 24) || +hh.split('-')[0] === +hh.split('-')[1]) return [400, {ok: false, error: 'follow-up hours: write them like 8-22 (start and end must differ)'}];
        if (Array.isArray(b.follow.stages) && !b.follow.stages.length) return [400, {ok: false, error: 'follow-ups: pick at least one group under "Send to" (or switch follow-ups off)'}]; }
      const ex = funnel(slug);
      if (ex && !b.edit) return [409, {ok: false, error: 'that funnel name is taken'}];
      q(`INSERT INTO funnels(slug,name,lang,bot,type,flow,channel_id,approve,approve_delay,active,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(slug) DO UPDATE SET name=excluded.name, lang=excluded.lang, bot=excluded.bot, type=excluded.type, flow=excluded.flow, channel_id=excluded.channel_id, approve=excluded.approve, approve_delay=excluded.approve_delay, active=excluded.active, note=excluded.note`)
        .run(slug, String(b.name || slug).slice(0, 60), lang, botId, type, flow, b.channel_id ? String(b.channel_id).trim().slice(0, 40) : null, approve, Math.max(0, Math.min(86400, +b.approve_delay || 0)), b.active === false ? 0 : 1, String(b.note || '').slice(0, 300), ex ? ex.created_at : now());
      const keep = (k, v) => (b[k] === undefined && ex ? ex[k] : v);
      q('UPDATE funnels SET aff_id=?, aff_link=?, track=?, track_sub=?, updated_by=?, updated_at=? WHERE slug=?').run(keep('aff_id', affId || null), keep('aff_link', affLink || null), keep('track', track || null), b.track_sub === undefined && ex ? ex.track_sub : (b.track_sub === false || b.track_sub === 0 || b.track_sub === '0') ? 0 : 1, who ? who.name : '', now(), slug);
      if (b.mentor !== undefined) q('UPDATE funnels SET mentor=? WHERE slug=?').run(mentor ? JSON.stringify(mentor) : null, slug);
      if (b.follow !== undefined) { const fo = cleanFollow(b.follow); q('UPDATE funnels SET follow=? WHERE slug=?').run(fo ? JSON.stringify(fo) : null, slug); }
      let warn = '';
      // who changed what, kept forever
      const after = funnel(slug); const changed = ex ? Object.keys(after).filter((k) => !['updated_by', 'updated_at'].includes(k) && String(after[k] ?? '') !== String(ex[k] ?? '')).map((k) => `${k}: ${ex[k] ?? '—'} → ${after[k] ?? '—'}`) : ['created'];
      if (changed.length) q('INSERT INTO funnel_history(funnel,who,at,changes) VALUES(?,?,?,?)').run(slug, who ? who.name : '', now(), changed.join('\n'));
      // security: every admin is told (email too) when a funnel's sign-up link or its mentor's live link changes
      if (SEC) {
        const base = ex || {}; const om = mentorJSON(ex) || {}, nm = mentorJSON(after) || {};
        const what = [];
        if ((base.aff_link || '') !== (after.aff_link || '') || (base.aff_id || '') !== (after.aff_id || '')) what.push(`Sign-up link: ${base.aff_link || '(main)'} → ${after.aff_link || '(main)'}${after.aff_id ? ' (aff ' + after.aff_id + ')' : ''}`);
        if ((om.link || '') !== (nm.link || '') && nm.lives === 'own') what.push(`Mentor live link: ${om.link || '—'} → ${nm.link || '—'}`);
        if ((om.name || '') !== (nm.name || '') || !!om.on !== !!nm.on) what.push(`Mentor: ${om.on ? om.name : 'region mentor'} → ${nm.on ? nm.name : 'region mentor'}`);
        if (what.length && SEC.notify) await SEC.notify(`🔐 Funnel "${slug}" ${ex ? 'changed' : 'created'} by ${who ? who.name : 'someone'}\n${what.join('\n')}\n\nIf this wasn't planned, act now: Admin -> Funnels -> ${slug} -> History.`, 'fn' + slug + now());
      }
      if (SEC && mentor && mentor.on && mentor.lives === 'own' && mentor.link) { const g = await SEC.check(mentor.link, {source: 'Funnel mentor live link (' + slug + ')', who: who ? who.name : '', canBlock: false}); if (!g.ok || g.severity) warn = 'Security flagged the live link for review (private contacts / other brokers are not allowed).'; }
      // a join funnel: check the bot can see the channel
      if (type === 'join' && b.channel_id && hooks.tgFor) { try { const ch = await hooks.tgFor(botId)('getChat', {chat_id: String(b.channel_id).trim()}); q('UPDATE funnels SET channel_title=? WHERE slug=?').run(ch.title || '', slug); } catch (e) { warn = 'The bot can’t see that channel yet: add the bot to the channel as an admin (with “Invite users”), then save again.'; } }
      if (lang !== 'en' && !i18n.isLive(lang)) warn = (warn ? warn + ' ' : '') + `${LANGS[lang].n} is not live yet: people from this funnel see English until you switch it on in Languages.`;
      return {ok: true, funnel: out(funnel(slug), who), warn};
    },
    // the funnel mentor's photo: uploaded here, served at /api/mphoto?n=…
    'POST /api/admin/funnels/photo': async (req, b, u, url, who) => {
      if (buyerSubs(who)) return [403, {ok: false, error: 'not_allowed_for_your_role'}];
      const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(b.data || '')); if (!m) return [400, {ok: false, error: 'pick a JPG, PNG or WEBP photo'}];
      const buf = Buffer.from(m[2], 'base64'); if (buf.length > 3e6) return [413, {ok: false, error: 'photo too big (max 3 MB)'}];
      const n = String(b.slug || 'f').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) + '-' + now().toString(36);
      fs.mkdirSync(MPHOTO_DIR, {recursive: true}); fs.writeFileSync(new URL(n + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]), MPHOTO_DIR), buf);
      return {ok: true, url: '/api/mphoto?n=' + n};
    },
    'GET /api/mphoto': async (req, b, u, url, who, res) => {
      const n = String(url.searchParams.get('n') || '').replace(/[^a-z0-9-]/g, ''); if (!n) return [404, {ok: false}];
      for (const e of ['jpg', 'png', 'webp']) { const f = new URL(n + '.' + e, MPHOTO_DIR); if (fs.existsSync(f)) { const buf = fs.readFileSync(f);
        res.writeHead(200, {'Content-Type': 'image/' + (e === 'jpg' ? 'jpeg' : e), 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': C.allowOrigin || '*'}); res.end(buf); return null; } }
      return [404, {ok: false}];
    },
    'POST /api/admin/funnels/delete': async (req, b, u, url, who) => { if (buyerSubs(who)) return [403, {ok: false}]; const slug = String(b.slug); if (slug === 'main') return [400, {ok: false, error: 'the main funnel stays (pause it instead)'}];
      q('UPDATE funnels SET active=0 WHERE slug=?').run(slug); return {ok: true, note: 'Paused. People who already came from it keep their funnel.'}; },
    // join funnels: one invite link per sub (Telegram counts the requests per link, and so do we)
    'POST /api/admin/funnels/invite': async (req, b, u, url, who) => {
      const f = funnel(b.slug); if (!f || f.type !== 'join' || !f.channel_id) return [400, {ok: false, error: 'pick a join funnel with a channel'}];
      const sub = String(b.sub || '').trim(); if (!subOk(sub)) return [400, {ok: false, error: 'sub: letters, numbers and - only'}];
      const mine = buyerSubs(who); if (mine && !subMine(sub, mine)) return [403, {ok: false, error: 'use one of your own sub-IDs: ' + mine.join(', ')}];
      if (!hooks.tgFor) return [503, {ok: false, error: 'bot_off'}];
      try { const l = await hooks.tgFor(f.bot)('createChatInviteLink', {chat_id: f.channel_id, name: (f.slug + ' ' + sub).slice(0, 32), creates_join_request: true});
        q('INSERT OR REPLACE INTO funnel_links(invite_link,funnel,sub,created_at) VALUES(?,?,?,?)').run(l.invite_link, f.slug, sub, now()); return {ok: true, link: l.invite_link}; }
      catch (e) { return [400, {ok: false, error: 'Telegram said: ' + e.message.replace(/^tg_\w+: /, '') + '. Is the bot an admin of the channel with “Invite users”?'}]; }
    },
    'POST /api/admin/bots/add': async (req, b, u, url, who) => {
      if (buyerSubs(who)) return [403, {ok: false, error: 'not_allowed_for_your_role'}];
      const token = String(b.token || '').trim(); if (!/^\d{5,}:[\w-]{30,}$/.test(token)) return [400, {ok: false, error: 'paste the full token from @BotFather (looks like 123456:ABC…)'}];
      if (token === mainBot.token || q('SELECT 1 FROM bots WHERE token=?').get(token)) return [409, {ok: false, error: 'that bot is already connected'}];
      let me; try { const r = await fetch((process.env.TELEGRAM_API || 'https://api.telegram.org') + '/bot' + token + '/getMe'); const d = await r.json(); if (!d.ok) throw new Error(d.description || 'bad token'); me = d.result; } catch (e) { return [400, {ok: false, error: 'Telegram did not accept this token: ' + e.message}]; }
      const lang = isLang(b.lang) ? b.lang : 'en';
      const r = q('INSERT INTO bots(token,username,title,lang,app_name,on_,created_at) VALUES(?,?,?,?,?,1,?)').run(token, me.username, me.first_name || me.username, lang, String(b.app_name || 'app').replace(/[^A-Za-z0-9_]/g, '').slice(0, 30) || 'app', now());
      const id = Number(r.lastInsertRowid); const slug = String(b.funnel || (lang + '-' + me.username)).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30);
      if (!funnel(slug)) q("INSERT INTO funnels(slug,name,lang,bot,type,active,created_at) VALUES(?,?,?,?,'bot',1,?)").run(slug, `${LANGS[lang].n} · @${me.username}`, lang, id, now());
      if (hooks.startBot) { try { await hooks.startBot(bot(id)); } catch (e) { q('UPDATE bots SET error=? WHERE id=?').run(e.message.slice(0, 200), id); } }
      return {ok: true, bot: pub(bot(id)), funnel: slug, next: `In @BotFather: /newapp for @${me.username} (web app URL: ${(process.env.APP_URL || 'https://app.zubabot.com')}/?l=${lang}), short name "${b.app_name || 'app'}". Then Bot Settings -> Menu Button with the same URL.`};
    },
    'POST /api/admin/bots/update': async (req, b, u, url, who) => { if (buyerSubs(who)) return [403, {ok: false, error: 'not_allowed_for_your_role'}]; const x = q('SELECT * FROM bots WHERE id=?').get(+b.id); if (!x) return [404, {ok: false}];
      if (b.lang && isLang(b.lang)) q('UPDATE bots SET lang=? WHERE id=?').run(b.lang, x.id);
      if (b.app_name) q('UPDATE bots SET app_name=? WHERE id=?').run(String(b.app_name).replace(/[^A-Za-z0-9_]/g, '').slice(0, 30), x.id);
      if (b.on !== undefined) { q('UPDATE bots SET on_=? WHERE id=?').run(b.on ? 1 : 0, x.id); try { if (b.on && hooks.startBot) await hooks.startBot(bot(x.id)); else if (!b.on && hooks.stopBot) hooks.stopBot(x.id); } catch (e) {} }
      return {ok: true, bot: pub(bot(x.id))}; },
  };
  return {routes, hooks, followOf, cleanFollow, affFor, mentorFor, baseMentor, swapMentor, cleanMentor, setSecurity, bots, bot, tokens, mainBot, funnel, attrib, fromStart, langOf, botOf, onJoinRequest, dueJoins, doneJoin, parseStart, links};
}
