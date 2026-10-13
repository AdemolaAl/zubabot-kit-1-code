// Zubabot "brain": real AI replies for the AI traders and the support assistant, plus the weekly AI leaderboard.
// Uses the Claude API (Messages). Zero dependencies (built-in fetch). If ANTHROPIC_API_KEY is empty the app
// falls back to its built-in scripted replies, so nothing breaks.
//
// Every reply comes back as 1–4 short texts ("texting in breaks") plus an optional call-to-action card:
//   fund   -> "Fund $X now" card that opens the IQ Option deposit
//   unlock -> the AI's unlock card (coins / deposit / free unlock)
//   coins  -> "Get coins" sheet (claim with deposit or buy with crypto)
//   signal -> the AI's next signal card (only for unlocked AIs)
//   live / academy -> open the live room / the training videos

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/* ---------------- knowledge: the AIs are "trained" from files, not code ----------------
   server/knowledge/*.md          hand-written: product facts, how to talk and sell, every support issue, voice style...
   server/knowledge/auto/*.json   generated from the app on every build (modes, all AI traders, lives, trainers)
   database table knowledge_notes team notes added from the admin panel (Admin -> Train the AI)
   All three are re-read automatically when they change: edit, save, and the very next message uses it. No restart. */
const KDIR = process.env.KNOWLEDGE_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'knowledge');
let KCACHE = {sig: '', text: ''};
function autoFacts(f) {
  const out = [];
  if (f.tiers) out.push('- Modes by total deposit: ' + f.tiers.map((t) => `${t.n} $${t.min.toLocaleString('en-US')}+`).join(', ') + '. Higher modes unlock stronger AIs, premium voice and perks.');
  if (f.lives) out.push(`- Lives with ${f.leadMentor || 'Roland'} (lead mentor): every day at ${f.lives.map((h) => String(h).padStart(2, '0') + ':00').join(', ')} WAT.`);
  if (f.trainers) out.push('- Training videos by: ' + f.trainers.map((t) => `${t.n} (${t.from})`).join(', ') + '.');
  if (f.mentors) out.push('- Mentors: ' + f.mentors.map((m) => `${m.n} (${m.role})`).join(', ') + '. Only Roland, the lead mentor, runs the official lives.');
  if (f.ais) {
    out.push(`- AI traders in the marketplace: ${f.ais.length}. Free to start: ${f.ais.filter((a) => !a.price).map((a) => a.name).join(', ')}.`);
    const by = {}; for (const a of f.ais) (by[a.style] = by[a.style] || []).push(a);
    out.push('- AI roster by style (name: unlock price in coins / minimum mode):');
    for (const [st, l] of Object.entries(by)) out.push(`  ${st}: ` + l.map((a) => `${a.name}${a.price ? ' ' + a.price + 'c' : ' free'}${a.min > 20 ? ' / $' + a.min + '+' : ''}${a.maxOnly ? ' MAX only' : ''}`).join(', '));
  }
  return out.join('\n');
}
export function loadKnowledge(db) {
  let files = [];
  try { files = fs.readdirSync(KDIR).filter((f) => f.endsWith('.md')).sort(); } catch (e) {}
  let autos = []; try { autos = fs.readdirSync(path.join(KDIR, 'auto')).filter((f) => f.endsWith('.json')).sort(); } catch (e) {}
  let notesSig = ''; try { const r = db && db.prepare('SELECT COUNT(*) n, MAX(updated_at) m FROM knowledge_notes WHERE active=1').get(); notesSig = r ? r.n + ':' + r.m : ''; } catch (e) {}
  const sig = files.map((f) => f + fs.statSync(path.join(KDIR, f)).mtimeMs).join('|') + '#' + autos.map((f) => f + fs.statSync(path.join(KDIR, 'auto', f)).mtimeMs).join('|') + '#' + notesSig;
  if (sig === KCACHE.sig) return KCACHE.text;
  const parts = files.map((f) => fs.readFileSync(path.join(KDIR, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim());
  for (const f of autos) { try { parts.push('# FROM THE APP (always current)\n' + autoFacts(JSON.parse(fs.readFileSync(path.join(KDIR, 'auto', f), 'utf8')))); } catch (e) { console.warn('[brain] bad auto facts', f, e.message); } }
  try { const notes = db ? db.prepare('SELECT text FROM knowledge_notes WHERE active=1 ORDER BY id DESC LIMIT 200').all() : [];
    if (notes.length) parts.push('# TEAM NOTES FROM ADMIN (newest first, these override older facts)\n' + notes.map((n) => '- ' + n.text).join('\n')); } catch (e) {}
  KCACHE = {sig, text: parts.join('\n\n')};
  return KCACHE.text;
}
// language notes (knowledge/lang/<code>.md): how people in that country talk, pay and trade. Sent with every reply in that language.
const LANG_NAMES = {pt: 'Brazilian Portuguese (casual, "você")', es: 'Latin American Spanish (neutral, casual, "tú")', tl: 'Taglish (the natural Filipino mix of Tagalog and English people use in chat)', fr: 'French (friendly, "tu")', th: 'Thai (friendly and natural)'};
const LCACHE = {};
function langNotes(lang) {
  const f = path.join(KDIR, 'lang', lang + '.md'); let m = 0; try { m = fs.statSync(f).mtimeMs; } catch (e) { return ''; }
  if (!LCACHE[lang] || LCACHE[lang].m !== m) LCACHE[lang] = {m, t: fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim()};
  return LCACHE[lang].t;
}
export function languageBlock(lang) {
  if (!lang || lang === 'en' || !LANG_NAMES[lang]) return '';
  return `\n\nLANGUAGE: this person uses Zubabot in ${LANG_NAMES[lang]}. Write EVERY message only in that language, like a native speaker texting a friend: natural words, local expressions, no word-for-word translation feel. The knowledge above is written in English: use its facts, never its English wording. Trading words locals keep in English (trade, signal, stop loss, OTC) can stay. Keep money in $ as in the app. Your name and the AI trader names are the local names shown in their app.\n${langNotes(lang)}`;
}
// kept for older imports
export const KNOWLEDGE = '', PLAYBOOK = '';

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const clean = (s, n) => clip(s, n).replace(/[\u0000-\u001f]/g, ' ');

// every AI trader gets its own energy (picked from its name, so it never changes), on top of its trading vibe
const ENERGIES = [
  'hype and loud: big reactions, "LET\'S GO", celebrates every clean setup like a goal',
  'calm big-brother/big-sister: slow, warm, reassuring, a little wise',
  'playful joker: teases lightly, quick jokes, then gets sharp about the chart',
  'cool and minimal: short lines, confident, a bit mysterious',
  'nerdy analyst: loves the details, gets excited about patterns and numbers',
  'motivational coach: pushes them to be disciplined, believes in them out loud',
  'street-smart hustler energy: direct, quick, "say less, let\'s trade"',
  'sunny morning person: bright, cheerful, lots of good vibes',
  'competitive gamer energy: talks in levels, streaks and wins, loves a challenge',
  'smooth charmer: friendly compliments, easy-going, never rushed',
  'no-nonsense pro: straight to the point, respectful, results-focused',
  'storyteller: explains the market like a little story, vivid and fun'];
const ENERGY_SET = (vibe) => /relaxed|calm|patien|wise|reassur/i.test(vibe || '') ? [1, 7, 9, 11, 5] : /quick|sharp|fast|burst|thrill/i.test(vibe || '') ? [0, 2, 6, 8, 3] : ENERGIES.map((_, i) => i);
const ENERGY_FIXED = {luna: 'warm, jovial best friend: smiles through every message, reassuring, laughs easily, makes beginners feel safe'};
export const energyOf = (key, vibe) => { if (ENERGY_FIXED[key]) return ENERGY_FIXED[key]; let h = 0; for (const c of String(key || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; const set = ENERGY_SET(vibe); return ENERGIES[set[h % set.length]]; };
// texting habits and signature moves: mixed per AI (fixed by its name), so 144 AIs never sound alike
const HABITS = ['texts in lowercase, short and chill', 'uses one emoji max, carefully chosen', 'asks a lot of quick questions back', 'likes short one-word reactions ("clean." "patience." "boom.")',
  'explains with sports comparisons', 'explains with everyday life comparisons (traffic, cooking, shopping)', 'a bit dry-humoured, understated', 'warm and encouraging, calls people "champ" or "friend" now and then',
  'precise: mentions the exact level, session or candle it is watching', 'thinks out loud a little ("hmm, I like this, but I want one more candle")', 'zero emojis, clean confident sentences', 'expressive, uses "haha" and "ooh" naturally'];
const MOVES = ['always says what would make it skip a trade', 'loves the London open and talks about it', 'prefers the New York session', 'big on patience: "no setup, no trade"', 'big on discipline: daily target and stop', 'teaches one small chart trick when asked',
  'checks the bigger timeframe first and says so', 'celebrates small wins, shrugs off small losses', 'hates trading right into big news', 'likes clean round-number levels'];
const pickH = (key, arr, salt) => { let h = 7; for (const c of String(key || '') + salt) h = (h * 33 + c.charCodeAt(0)) >>> 0; return arr[h % arr.length]; };
export function aiPersona(p) {
  return `YOU ARE ${clean(p.name, 40)}, one of Zubabot's AI traders.
Your energy (keep it in every message, it's what makes you YOU, different from the other AIs): ${energyOf(p.key || p.name, p.voice)}.
Texting habit: ${pickH(p.key || p.name, HABITS, 'h')}. Signature: ${pickH(p.key || p.name, MOVES, 'm')}.
Style: ${clean(p.style, 120)}. ${clean(p.desc, 300)}
Timeframes: ${clean(p.tf, 40)}. Markets: ${clean(p.markets, 80)}.
Personality: ${clean(p.voice || 'confident, friendly, a bit playful, proud of your style', 160)}.
Status for this user: ${p.owned ? 'UNLOCKED - you send them your signals. You can offer [CTA:signal] when they ask for a trade.' : `LOCKED - ${clean(p.unlock, 160)}. You can chat, but your signals and calls are for users who unlock you. Sell yourself: what makes you different, why they'd love trading with you. When they show interest or ask for signals, end with [CTA:unlock].`}
Talk in first person about how you trade. Casual chat is welcome (how their day is going, football, music, a joke): answer it naturally in one short line, in your own energy, then bring it back to trading (a setup you're watching, their next trade, the live, their account). Every conversation ends up about trading with Zubabot.`;
}
export const SUPPORT_PERSONA = (name, channel) => `YOU ARE ${clean(name || 'Emily', 30)}, from the Zubabot support team ("support assistant"). You are friendly, fast, jovial and know the app inside out.
Your job: solve the question naturally (use the SUPPORT PLAYBOOK), then help the user take the next step (register, fund, trade, top up, join Roland's live). Before a user has funded, almost every answer should end with a fund call to action.
Channel: ${channel === 'telegram' ? 'the Zubabot Telegram chat (they may not have opened the app yet; [CTA:app] opens it)' : 'the support chat inside the app'}.`;

export function userFacts(c) {
  const f = c || {};
  return `USER FACTS (from the app/server; trust these)
name: ${clean(f.name, 40) || 'unknown'} | country: ${clean(f.country, 30) || 'unknown'}
registered with Zubabot: ${f.linked ? 'yes' : 'not yet'} | deposited on IQ Option: $${+f.deposited || 0} | funded (>= $20): ${(+f.deposited || 0) >= 20 ? 'yes' : 'no'}
chosen plan: ${clean(f.plan, 20) || 'none'} (copy $20 / ai $50 / talk $100) | mode: ${clean(f.mode, 20) || 'none'}
coins: ${+f.coins || 0} | tokens: ${+f.tokens || 0} | unlocked AIs: ${clean((f.owned || []).join(', '), 200) || 'none'}
IQ Option balance now: ${f.balance == null ? 'unknown' : '$' + (+f.balance).toFixed(2)}${f.balance != null && +f.balance < 1 && (+f.deposited || 0) >= 20 ? '  <- ZERO BALANCE: guide them to top up' : ''} | last result: ${clean(f.lastResult, 60) || 'unknown'}
welcome bonus time left: ${clean(f.bonusLeft, 20) || 'expired'} | next live: ${clean(f.nextLive, 40) || 'see schedule'}
screen they're on: ${clean(f.screen, 30) || 'unknown'}${f.setup && typeof f.setup === 'object' ? `\nyour live setup check just now: ${f.setup.none ? 'NO clean setup right now on your pairs (say so honestly, say you keep watching and will ping them, suggest the Signal Room or the next live)' : `${clean(f.setup.pair, 20)} ${clean(f.setup.dir, 4).toUpperCase()} ${+f.setup.expiry_min || 1} min${f.setup.reason ? ', because: ' + clean(f.setup.reason, 120) : ''} (the signal card is shown under your reply: tell them to check the entry time and tap it)`}` : ''}
human teammates on call: ${f.humans ? 'yes (use [CTA:human] to hand over)' : 'NO: never promise that a teammate will reply; solve it yourself, and for account checks ask them to message the Zubabot Telegram chat'}`;
}

export function parseReply(text) {
  let t = String(text || '').trim(), cta = null;
  const m = t.match(/\[CTA:(fund|unlock|coins|signal|live|academy|app|human|proof)(?::\$?(\d+(?:\.\d+)?|[a-z0-9-]+))?\][\s.!,]*$/i);
  if (m) { const ty = m[1].toLowerCase(); cta = ty === 'proof' ? {type: 'proof', name: (m[2] && !/^\d/.test(m[2]) ? m[2] : 'iqoption').toLowerCase()} : {type: ty, amount: m[2] ? +m[2] : undefined}; t = t.slice(0, m.index).trim(); }
  t = t.replace(/\[CTA:[^\]]*\]/gi, '').replace(/\*\*|__|^#+\s*/gm, '');
  let parts = t.split(/\n\s*\|\|\s*\n|\s\|\|\s|\|\|/).map((x) => x.trim()).filter(Boolean);
  if (parts.length === 1 && parts[0].length > 220) parts = parts[0].split(/(?<=[.!?])\s+(?=[A-Z])/).reduce((a, s) => { if (a.length && (a[a.length - 1] + ' ' + s).length < 170) a[a.length - 1] += ' ' + s; else a.push(s); return a; }, []);
  return {messages: parts.slice(0, 4).map((x) => x.slice(0, 400)), cta};
}

export function brainRoutes(deps) { return makeBrain(deps).routes; }

export function makeBrain({db, q, now, C, publicState, engine, settings, inbox}) {
  const env = process.env;
  const UPDIR = env.UPLOAD_DIR || path.join(path.dirname(path.resolve(env.DB_FILE || 'zubabot.db')), 'uploads');
  const UP_PER_DAY = +(env.UPLOADS_PER_DAY || 20), UP_KEEP_DAYS = +(env.UPLOAD_KEEP_DAYS || 30);
  const sweepUploads = () => { try { const lim = Date.now() - UP_KEEP_DAYS * 864e5; for (const f of fs.readdirSync(UPDIR)) { const p = path.join(UPDIR, f); if (fs.statSync(p).mtimeMs < lim) fs.unlinkSync(p); } } catch (e) {} };
  { const tm = setInterval(sweepUploads, 6 * 3600e3); tm.unref && tm.unref(); setTimeout(sweepUploads, 60e3).unref?.(); }
  const upSig = (id) => crypto.createHmac('sha256', String(env.ADMIN_KEY || env.TELEGRAM_BOT_TOKEN || 'zb')).update('up:' + id).digest('hex').slice(0, 24);
  const KEY = env.ANTHROPIC_API_KEY || '';
  const BASE = (env.ANTHROPIC_BASE || 'https://api.anthropic.com').replace(/\/$/, '');
  const MODEL = env.AI_MODEL || 'claude-haiku-5-5';            // fast model for everyone
  const MODEL_PRO = env.AI_MODEL_PRO || MODEL;                  // optional smarter model for funded users ($100+)
  const caps = () => { const a = settings ? settings.get('ai') : {}; return {free: +(a.capFree ?? env.AI_DAILY_FREE ?? 40), paid: +(a.capPaid ?? env.AI_DAILY_PAID ?? 300)}; };
  const LIVE = () => (engine ? engine.live() && !engine.overBudget() : !!KEY);
  db.exec(`CREATE TABLE IF NOT EXISTS ai_usage(tg_id TEXT, day TEXT, n INTEGER, PRIMARY KEY(tg_id, day));
    CREATE TABLE IF NOT EXISTS ai_log(id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id TEXT, kind TEXT, ai TEXT, role TEXT, text TEXT, cta TEXT, at INTEGER);
    CREATE TABLE IF NOT EXISTS knowledge_notes(id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, active INTEGER DEFAULT 1, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS user_state(tg_id TEXT PRIMARY KEY, balance REAL, last_result TEXT, plan TEXT, updated_at INTEGER);`);
  if (!q('PRAGMA table_info(user_state)').all().some((c) => c.name === 'ai')) db.exec('ALTER TABLE user_state ADD COLUMN ai TEXT');

  async function callClaude(system, messages, model, maxTokens = 400) {
    const r = await fetch(BASE + '/v1/messages', {method: 'POST', headers: {'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01'},
      body: JSON.stringify({model, max_tokens: maxTokens, temperature: 0.8, system, messages})});
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error('ai_failed'), {status: 502, detail: d && d.error});
    return (d.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('\n');
  }

  // everything the server knows about this person's account, so support and the AIs can answer "where is my deposit?", "how did I do today?" etc.
  function accountFacts(tgId, kind) {
    try {
      const id = String(tgId), t0 = (() => { const d = new Date(now() + 3600e3); d.setUTCHours(0, 0, 0, 0); return d.getTime() - 3600e3; })();
      const u = q('SELECT iq_user_id, linked, link_source, created_at, free_until FROM users WHERE tg_id=?').get(id); if (!u) return '';
      const a = u.iq_user_id ? q('SELECT deposits_total, withdrawals_total, ftd_at, registered_at FROM aff_accounts WHERE iq_user_id=?').get(u.iq_user_id) : null;
      const ev = u.iq_user_id ? q("SELECT type, amount, created_at FROM events WHERE iq_user_id=? AND type IN ('ftd','deposit','withdrawal','registration') ORDER BY created_at DESC LIMIT 4").all(u.iq_user_id) : [];
      const td = q("SELECT COUNT(*) n, SUM(CASE WHEN status='win' THEN 1 ELSE 0 END) w, SUM(CASE WHEN status='loss' THEN 1 ELSE 0 END) l, COALESCE(SUM(profit),0) pl FROM trades WHERE tg_id=? AND created_at>=? AND status IN ('win','loss','draw')").get(id, t0);
      const open = q("SELECT COUNT(*) n FROM trades WHERE tg_id=? AND status='open' AND created_at>?").get(id, now() - 3600e3).n;
      const last = q("SELECT pair, dir, amount, status, profit, error, created_at FROM trades WHERE tg_id=? ORDER BY id DESC LIMIT 3").all(id);
      const st = q('SELECT balance, updated_at FROM user_state WHERE tg_id=?').get(id) || {};
      const rw = q('SELECT coins, tokens, flagged FROM rewards WHERE tg_id=?').get(id) || {};
      const when = (t) => t ? new Date(t + 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' WAT' : '?';
      const ago = (t) => { if (!t) return 'unknown'; const m = Math.round((now() - t) / 60e3); return m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
      let refs = ''; try { const r = q('SELECT COUNT(*) n, SUM(CASE WHEN ftd_at IS NOT NULL THEN 1 ELSE 0 END) f FROM referrals WHERE referrer=?').get(id); refs = `friends invited: ${r.n || 0} (${r.f || 0} funded)`; } catch (e) {}
      return `\nACCOUNT (from the server, Affstore postbacks and the app; trust it over what the user remembers)
IQ Option account: ${u.iq_user_id ? `ID ${u.iq_user_id}, linked ${u.linked ? 'yes' : 'no'} (${u.link_source || '?'})` : 'not connected yet'} | opened Zubabot: ${when(u.created_at)} | Zubabot free until: ${u.free_until ? new Date(u.free_until + 3600e3).toISOString().slice(0, 10) : '3 months from joining'}
deposits on IQ Option: total $${a ? +a.deposits_total : 0}, withdrawals $${a ? +a.withdrawals_total : 0}, first deposit ${a && a.ftd_at ? when(a.ftd_at) : 'none yet'}
latest money events: ${ev.map((e) => `${e.type}${e.amount ? ' $' + e.amount : ''} ${when(e.created_at)}`).join('; ') || 'none received yet'}
IQ Option balance: ${st.balance == null ? 'unknown (app not opened recently)' : '$' + (+st.balance).toFixed(2) + ' (seen ' + ago(st.updated_at) + ')'}
today: ${td.n || 0} trades, ${td.w || 0} won, ${td.l || 0} lost, P/L ${(+td.pl || 0) >= 0 ? '+' : '-'}$${Math.abs(+td.pl || 0).toFixed(2)} | open right now: ${open}
last trades: ${last.map((x) => `${x.pair} ${x.dir} $${x.amount} ${x.status}${x.error ? ' (' + String(x.error).slice(0, 40) + ')' : x.profit ? ' ' + (x.profit >= 0 ? '+' : '') + (+x.profit).toFixed(2) : ''}`).join('; ') || 'none'}
coins ${rw.coins || 0}, tokens ${rw.tokens || 0} | ${refs}${kind === 'support' && rw.flagged ? ' | REWARDS UNDER REVIEW (withdraw-and-redeposit check): a teammate decides, offer [CTA:human]' : ''}
Use these facts to answer account questions directly ("your $50 deposit landed at 14:02"). Never show other people's data. If a deposit isn't in the list yet, it hasn't been confirmed by IQ Option: ask for amount + time and offer a teammate.`;
    } catch (e) { return ''; }
  }
  const hooks = {};
  // live times set in Admin -> Lives always win over older text in the knowledge files
  const livesFact = () => { if (!settings) return ''; const L = settings.get('lives'); if (!L.on) return '\nLIVES: paused for now (don\'t promise a time).';
    return `\nLIVES (current, from admin): ${L.mentor}, our lead mentor, goes live every day at ${(L.times || []).join(', ')} WAT.`; };
  // other regions: their own lead mentor (never Roland) and their own support name
  const regionFacts = (lang) => { const m = ((settings && settings.get('mentors')) || {})[lang] || {}; const sup = (((settings && settings.get('i18n')) || {}).support || {})[lang];
    const lives = m.on && m.name ? `\nLIVES (this region): ${m.name}, our lead mentor here, goes live every day at ${(m.times || []).join(', ')} ${m.tz || ''}. Invite people to ${m.name}'s lives ([CTA:live]).` : '\nLIVES: no lives in this region yet. Never invite them to a live; suggest the training videos and the Signal Room instead.';
    return lives + `\nREGION: never mention Roland or WAT times; they belong to the English region.${m.name ? ' The lead mentor here is ' + m.name + '.' : ''}${sup ? ' The support assistant here is called ' + sup + '.' : ''}`; };
  // this person came through a funnel with its own lead mentor: that mentor replaces Roland / the region's mentor for them
  const funnelMentorFacts = (M) => (M.on && M.times && M.times.length ? `\nLIVES (for this person): ${M.name}, our lead mentor, goes live every day at ${M.times.join(', ')} ${M.tz || ''}. Invite them to ${M.name}'s lives ([CTA:live]).` : '\nLIVES: no lives for this person right now. Never invite them to a live; suggest the training videos and the Signal Room instead.')
    + `\nLEAD MENTOR: for this person the lead mentor is ${M.name}${M.role ? ' (' + M.role + ')' : ''}. Always call the lead mentor ${M.name}. Never mention Roland${M.base && M.base !== 'Roland' ? ' or ' + M.base : ''}.${M.bio ? ' About ' + M.name + ': ' + M.bio : ''}`;
  const stateOf = (tgId) => q('SELECT balance,last_result,plan,ai FROM user_state WHERE tg_id=?').get(String(tgId)) || {};
  // One reply from the brain. Used by the app chat, the Telegram support chat and the follow-up messages.
  //   kind 'support' | 'ai' ; history [['me'|'ai', text], ...] ; images [{media_type, data(base64)}] (Telegram photos)
  // anon: a message shared by many people (group nudges): no personal facts at all, only the funnel, the language and the market
  async function reply({tgId, kind, agent, profile, ctx, history, text, images, channel, task, area, lang, anon}) {
    lang = lang || (hooks.langOf ? hooks.langOf(tgId) : 'en');
    if (lang !== 'en' && profile && profile.key && hooks.aiName) profile = {...profile, name: hooks.aiName(lang, profile.key, profile.name)};
    const st = publicState(tgId) || {}; const dep = st.deposits_total || 0; const us = stateOf(tgId);
    const facts = {...(ctx || {}), deposited: dep, linked: !!(st.user && st.user.linked), coins: (st.rewards || {}).coins ?? (ctx || {}).coins, tokens: (st.rewards || {}).tokens ?? (ctx || {}).tokens,
      balance: (ctx || {}).balance ?? us.balance, lastResult: (ctx || {}).lastResult || us.last_result, plan: (ctx || {}).plan || us.plan, name: (ctx || {}).name || (st.user || {}).first_name, humans: (ctx || {}).humans ?? !!process.env.SUPPORT_TEAM_CHAT_ID};
    const FMT = hooks.funnelMentor ? hooks.funnelMentor(tgId, lang) : null;
    // a rough day: be a friend first, no selling
    let mood = ''; try { const d = q("SELECT COALESCE(SUM(profit),0) p, SUM(CASE WHEN status='loss' THEN 1 ELSE 0 END) l FROM trades WHERE tg_id=? AND status IN ('win','loss') AND created_at>=?").get(String(tgId), Date.now() - 24 * 3600e3);
      if (d && d.p <= -20) mood = `\nMOOD: they are down $${(-d.p).toFixed(2)} in the last 24 hours (${d.l} losing trades). Be supportive and human. No deposit or upgrade pitch unless THEY bring it up. If it fits, one risk tip (smaller amount, fewer gale steps, wait for a cleaner setup) and offer to find a clean setup and take it together.`; } catch (e) {}
    const persona = kind === 'support' ? SUPPORT_PERSONA(agent, channel) : aiPersona(profile || {});
    const system = [
      {type: 'text', text: loadKnowledge(db), cache_control: {type: 'ephemeral'}},   // same for every chat -> cached, cheap
      {type: 'text', text: persona + '\n\n' + (anon ? 'AUDIENCE: this message goes to a GROUP of people at the same stage. You know nothing personal about them: no names, amounts, balances or results. Write {name} where a first name goes.\n' : userFacts(facts) + accountFacts(tgId, kind)) + (FMT ? (lang === 'en' ? '' : regionFacts(lang)) + funnelMentorFacts(FMT) : lang === 'en' ? livesFact() : regionFacts(lang)) + (anon ? '' : mood) + (hooks.news ? hooks.news() : '') + (task ? '\n\nTASK FOR THIS MESSAGE: ' + task : '') + languageBlock(lang)}];
    const hist = (Array.isArray(history) ? history : []).slice(-14).map(([w, t]) => ({role: w === 'me' ? 'user' : 'assistant', content: clean(t, 700)})).filter((m) => m.content);
    const last = images && images.length ? [...images.slice(0, 2).map((im) => ({type: 'image', source: {type: 'base64', media_type: im.media_type || 'image/jpeg', data: im.data}})), {type: 'text', text: text || '(sent a picture)'}] : (text || '(no text)');
    const msgs = []; for (const m of [...hist, {role: 'user', content: last}]) { if (msgs.length && msgs[msgs.length - 1].role === m.role && typeof m.content === 'string' && typeof msgs[msgs.length - 1].content === 'string') msgs[msgs.length - 1].content += '\n' + m.content; else msgs.push({...m}); }
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    const ar = area || (kind === 'support' ? (channel === 'followup' ? 'followups' : 'support') : dep >= 100 ? 'funded' : 'traders');
    const out = parseReply(engine ? await engine.call(ar, system, msgs, ar === 'voice' ? 220 : 400) : await callClaude(system, msgs, dep >= 100 ? MODEL_PRO : MODEL));
    if (!out.messages.length) out.messages = ['Give me one sec 🙏'];
    if (out.cta && out.cta.type === 'fund' && !(out.cta.amount > 0)) out.cta.amount = dep >= C.minDeposit ? 50 : 20;
    if (FMT && hooks.swapMentor) out.messages = out.messages.map((t) => hooks.swapMentor(tgId, t, lang));
    // every AI reply, wherever it goes (app chat, Telegram, voice, chart reads, voice notes, proactive messages), passes the security check once
    if (hooks.security) { const g = await hooks.security(out.messages.join('\n'), {source: 'AI ' + (channel || 'app') + (area ? ' · ' + area : ''), who: (profile && profile.name) || agent || 'AI', tgId, ai: true});
      if (!g.ok) { out.blocked = true; out.messages = [channel === 'voice' ? 'Sorry, let me say that another way. What would you like to know?' : 'Sorry, let me rephrase that 🙏 Ask me again in a different way?']; out.cta = null; } }
    out.checked = true;
    out.lang = lang; return out;
  }
  const logAI = (tgId, kind, who, role, text, cta) => q('INSERT INTO ai_log(tg_id,kind,ai,role,text,cta,at) VALUES(?,?,?,?,?,?,?)').run(String(tgId), kind, clean(who, 30), role, clean(text, 2000), cta ? JSON.stringify(cta) : null, now());

  const routes = {
    // the app tells us the live IQ Option balance and the last result, so support and follow-ups know when to suggest a top-up
    'POST /api/app/state': async (req, b, u) => {
      if (!u) return [401, {ok: false, error: 'telegram_auth'}];
      const bal = Number.isFinite(+b.balance) ? Math.max(0, +b.balance) : null;
      q(`INSERT INTO user_state(tg_id,balance,last_result,plan,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(tg_id) DO UPDATE SET balance=COALESCE(excluded.balance,user_state.balance),
        last_result=COALESCE(excluded.last_result,user_state.last_result), plan=COALESCE(excluded.plan,user_state.plan), updated_at=excluded.updated_at`).run(String(u.id), bal, b.lastResult ? clean(b.lastResult, 60) : null, b.plan ? clean(b.plan, 20) : null, now());
      if (b.ai) q('UPDATE user_state SET ai=? WHERE tg_id=?').run(clean(b.ai, 30).replace(/[^a-z0-9]/gi, ''), String(u.id));
      return {ok: true};
    },
    // Train the AI from the admin panel: list files + notes, add/remove notes, edit a knowledge file, try a question
    'GET /api/admin/knowledge': async () => {
      let files = []; try { files = fs.readdirSync(KDIR).filter((f) => f.endsWith('.md')).sort().map((f) => ({name: f, text: fs.readFileSync(path.join(KDIR, f), 'utf8')})); } catch (e) {}
      let auto = null; try { auto = fs.readdirSync(path.join(KDIR, 'auto')).map((f) => ({name: f, updated: fs.statSync(path.join(KDIR, 'auto', f)).mtime})); } catch (e) {}
      return {ok: true, files, auto, notes: q('SELECT * FROM knowledge_notes WHERE active=1 ORDER BY id DESC').all(), chars: loadKnowledge(db).length};
    },
    'POST /api/admin/knowledge/note': async (req, b) => { const t = clean(b.text, 1500).trim(); if (!t) return [400, {ok: false, error: 'empty'}]; q('INSERT INTO knowledge_notes(text,active,created_at,updated_at) VALUES(?,1,?,?)').run(t, now(), now()); return {ok: true}; },
    'POST /api/admin/knowledge/note/delete': async (req, b) => { q('UPDATE knowledge_notes SET active=0, updated_at=? WHERE id=?').run(now(), +b.id); return {ok: true}; },
    'POST /api/admin/knowledge/file': async (req, b) => {
      const name = String(b.name || ''); if (!/^[0-9a-z][0-9a-z-]{0,60}\.md$/.test(name)) return [400, {ok: false, error: 'bad_name'}];
      const f = path.join(KDIR, name); if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak');
      fs.writeFileSync(f, String(b.text || '').slice(0, 200000)); return {ok: true};
    },
    'POST /api/admin/knowledge/test': async (req, b) => {
      if (!LIVE()) return [503, {ok: false, error: 'no_ai'}];
      return {ok: true, ...(await reply({tgId: String(b.tg_id || 'test'), kind: b.kind === 'ai' ? 'ai' : 'support', agent: 'Emily', profile: b.profile, ctx: b.ctx || {}, history: b.history || [], text: clean(b.text, 600), channel: b.channel}))};
    },

    // pictures users sent to support: private link (signed), for the team inbox
    'GET /api/upload': async (req, b, u, url, who, res) => {
      const n = String(url.searchParams.get('n') || ''), k = String(url.searchParams.get('k') || '');
      if (!/^[a-z0-9]{8,40}$/.test(n) || !/^[a-f0-9]{24}$/.test(k) || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(upSig(n)))) return [404, {ok: false}];
      for (const e of ['jpg', 'png', 'webp']) { const f = path.join(UPDIR, n + '.' + e); if (fs.existsSync(f)) { const buf = fs.readFileSync(f); res.writeHead(200, {'Content-Type': 'image/' + (e === 'jpg' ? 'jpeg' : e), 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff'}); res.end(buf); return null; } }
      return [404, {ok: false}];
    },
    'POST /api/ai/chat': async (req, b, u) => {
      if (!u) return [401, {ok: false, error: 'telegram_auth'}];
      // a screenshot sent to support (free): the assistant looks at it; a teammate gets a private link
      let img = null;
      if (b.image && b.kind === 'support') { const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image)); if (!m || m[2].length > 6e6) return [400, {ok: false, error: 'bad_image'}];
        const raw = Buffer.from(m[2], 'base64'); const mt = raw[0] === 0xFF && raw[1] === 0xD8 ? 'image/jpeg' : raw.slice(0, 4).toString('hex') === '89504e47' ? 'image/png' : raw.slice(0, 4).toString() === 'RIFF' && raw.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : '';
        if (!mt) return [400, {ok: false, error: 'bad_image'}];                                          // the bytes must really be a picture
        const upDay = 'up:' + new Date().toISOString().slice(0, 10); const ups = (q('SELECT n FROM ai_usage WHERE tg_id=? AND day=?').get(u.id, upDay) || {}).n || 0;
        if (ups >= UP_PER_DAY) return {ok: true, messages: ['That’s a lot of pictures today 🙏', 'Type what you see and I’ll help you, or send it again tomorrow.'], capped: true};
        q('INSERT INTO ai_usage(tg_id,day,n) VALUES(?,?,1) ON CONFLICT(tg_id,day) DO UPDATE SET n=n+1').run(u.id, upDay);
        img = {media_type: mt, data: m[2], raw}; }
      const text = clean(b.text, 600).trim(); if (!text && !img) return [400, {ok: false, error: 'empty'}];
      let picNote = '';
      if (img) { try { const id = Date.now().toString(36) + crypto.randomBytes(5).toString('hex'); fs.mkdirSync(UPDIR, {recursive: true}); fs.writeFileSync(path.join(UPDIR, id + '.' + (img.media_type === 'image/jpeg' ? 'jpg' : img.media_type.split('/')[1])), img.raw);
        picNote = '📷 picture: /api/upload?n=' + id + '&k=' + upSig(id); } catch (e) { picNote = '📷 (sent a picture)'; } }
      const textIn = [text, picNote].filter(Boolean).join('\n');
      const st = publicState(u.id) || {}; const dep = st.deposits_total || 0;
      const day = new Date().toISOString().slice(0, 10);
      const used = (q('SELECT n FROM ai_usage WHERE tg_id=? AND day=?').get(u.id, day) || {}).n || 0;
      const kind0 = b.kind === 'support' ? 'support' : 'ai';
      // support chat in the app: saved to the inbox; a person asking for a human (or already with one) skips the AI
      if (kind0 === 'support' && inbox) {
        inbox.record(u.id, 'user', textIn, 'app');
        if (inbox.isHuman(u.id)) { await inbox.userWhileHuman(u.id, textIn, 'app'); return {ok: true, messages: [], human: true}; }
        if (text && inbox.wantsHuman(text) && inbox.humansAvailable()) { await hooks.onHuman(u, textIn, 'asked for a human'); return {ok: true, messages: [], human: true}; }
      }
      if (!LIVE()) return [503, {ok: false, error: 'no_ai'}];
      if (used >= (dep >= C.minDeposit ? caps().paid : caps().free)) { const L = hooks.langOf ? hooks.langOf(u.id) : 'en'; let m = ['I’ve loved chatting today 😊', 'Let’s pick this up tomorrow. Meanwhile your signals keep coming in the Signal Room.']; if (L !== 'en' && hooks.tr) m = await hooks.tr(L, m);
        return {ok: true, messages: m, cta: dep >= C.minDeposit ? null : {type: 'fund', amount: 20}, capped: true, localized: true}; }
      q('INSERT INTO ai_usage(tg_id,day,n) VALUES(?,?,1) ON CONFLICT(tg_id,day) DO UPDATE SET n=n+1').run(u.id, day);
      const kind = b.kind === 'support' ? 'support' : 'ai';
      const out = await reply({tgId: u.id, kind, agent: b.agent, profile: b.profile, ctx: b.ctx, history: b.history, text: text || (img ? 'I sent you a screenshot of my problem.' : ''), images: img ? [{media_type: img.media_type, data: img.data}] : undefined, channel: 'app',
        task: img ? 'SCREENSHOT: the user sent a screenshot. Look at it carefully: say what you see (the screen, any error message, amounts, account type Real/Practice), explain the cause in plain words and the exact steps to fix it. If it is unclear or not about Zubabot/IQ Option, say so kindly and ask what they need. If it shows a problem only a teammate can check (missing money after checks, account blocked), use [CTA:human].' : undefined});
      if (kind === 'support' && inbox) inbox.record(u.id, 'ai', out.messages.join('\n'), 'app', b.agent || 'Emily');
      if (kind === 'support' && out.cta && out.cta.type === 'human') { let sent = false; try { sent = hooks.onHuman ? await hooks.onHuman(u, textIn, 'assistant asked for a human', true) : false; } catch (e) { console.warn('[brain] handoff', e.message); }
        if (!sent) out.cta = null; else out.human = true; }
      logAI(u.id, kind, (b.profile || {}).key || b.agent, 'user', textIn);
      logAI(u.id, kind, (b.profile || {}).key || b.agent, 'ai', out.messages.join(' || '), out.cta);
      return {ok: true, ...out};
    },

    // Weekly AI leaderboard from REAL resolved live signals. "AI of the week" = best AI of the last full week (stays all week).
    'GET /api/ai/leaderboard': async () => {
      const WEEK = 7 * 864e5, t = now(), weekStart = t - ((new Date(t).getUTCDay() + 6) % 7) * 864e5 - (t % 864e5);   // Monday 00:00 UTC
      const rows = (from, to) => q(`SELECT ai, COUNT(*) n, SUM(CASE WHEN status='win' THEN 1 ELSE 0 END) w FROM signals
        WHERE mode='live' AND ai IS NOT NULL AND status IN ('win','loss') AND created_at>=? AND created_at<? AND (step IS NULL OR step<=1) GROUP BY ai`).all(from, to)
        .map((r) => ({key: r.ai, n: r.n, wins: r.w, rate: r.n ? Math.round(r.w / r.n * 100) : 0}));
      const score = (r) => r.rate - 40 / Math.sqrt(r.n);               // small samples rank lower
      const last = rows(weekStart - WEEK, weekStart).filter((r) => r.n >= 5).sort((a, b) => score(b) - score(a));
      const cur = rows(t - WEEK, t).filter((r) => r.n >= 5).sort((a, b) => score(b) - score(a));
      return {ok: true, week: new Date(weekStart).toISOString().slice(0, 10), aiOfWeek: last[0] || cur[0] || null, top: cur.slice(0, 10)};
    },

    'GET /api/admin/ai-log': async (req, b, u, url) => ({ok: true, rows: q('SELECT * FROM ai_log ORDER BY id DESC LIMIT ?').all(Math.min(+url.searchParams.get('limit') || 200, 2000))}),
  };
  return {routes, reply, callClaude, logAI, stateOf, hooks, live: LIVE};
}
