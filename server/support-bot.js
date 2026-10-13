// Zubabot Telegram bots: answers every message with the brain, follows up people who haven't funded, invites people to
// the lives, nudges funded users whose balance is empty, hands hard cases to a human, accepts channel join requests,
// and does all of it in each person's language. Many bots run at once (Admin -> Funnels -> Bots), all on this one server.
// Zero dependencies.
//
// .env
//   TELEGRAM_BOT_TOKEN=...            the main bot (same bot as the main mini app). More bots are added in Admin.
//   SUPPORT_BOT=on                    on | off            (off = the bots stay silent, the app still works)
//   SUPPORT_MODE=polling              polling | webhook   (polling = easiest, no public URL needed)
//   PUBLIC_URL=https://api.zubabot.com   only for webhook mode (and pictures in flows)
//   SUPPORT_TEAM_CHAT_ID=-100...       Telegram group where hand-offs go (through the main bot)
//   SUPPORT_NAME=Emily                 name the support assistant uses
//   APP_URL=https://app.zubabot.com   the mini app URL (for the Open buttons)
//   QUIET_HOURS=22-8                  WAT hours with no follow-ups
import crypto from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {fmtTime} from './settings.js';

let MENTOR_ = (L) => 'Roland', LIVES_ = (L) => '10am, 3pm, 6pm and 10pm', TZ_ = (L) => 'WAT';     // set from Admin -> Lives / Languages when the bot starts
const STEPS = [15 * 60e3, 3 * 3600e3, 20 * 3600e3, 30 * 3600e3, 48 * 3600e3, 72 * 3600e3];     // gap BEFORE each follow-up step 1..6
const WAT = (t) => new Date(t + 3600e3);                                                          // West Africa Time = UTC+1, no DST
const TEMPLATES = {   // used when the AI is off or fails, so the bot never goes quiet (translated for other languages)
  1: (n) => [`Hey ${n} 👋 did the app open fine for you?`, 'Setup takes about a minute. Tap below and I’ll walk you through it if you get stuck.'],
  2: (n) => [`${n}, your AI trader is ready and signals are dropping today 🔥`, 'All it takes is $20 to switch everything on. Your money stays in your own IQ Option account.'],
  3: (n, at, L) => [`${n}, ${MENTOR_(L)} our lead mentor goes live today at ${LIVES_(L)} (${TZ_(L)}).`, 'Come watch free and trade along with him 🙌'],
  '3b': (n) => [`${n}, there are 8 short training videos in the app 🎬`, 'Watch the 1-minute welcome video and you’ll be set up in no time.'],
  4: (n) => ['Quick one, a lot of people ask me this 👇', 'Zubabot never holds your money. It stays in your own IQ Option account and you approve every trade.', 'Want me to show you the fastest way to fund $20?'],
  5: (n) => [`${n}, there are 144 AI traders waiting in the app, plus 8 short training videos.`, 'Start with the 1-minute welcome video 🎬'],
  6: (n) => [`Hey ${n}, just checking in 😊`, 'Anything stopping you from starting? Payment method, questions about IQ Option? Tell me and I’ll sort it.'],
  live: (n, at, L) => [`${n}! ${MENTOR_(L)} goes live at ${at} ${TZ_(L)} 🔴`, 'Our lead mentor trades live and you trade along with him. It’s free to watch. See you there?'],
  topup: (n) => [`${n}, your balance is at $0 so your signals can’t be placed right now.`, 'Top up and we go again 💪'],
  funded: (n) => [`${n}, your deposit is in 🎉 Zubabot is fully unlocked!`, 'Open the app, pick your AI and take the next signal.'],
};
const CTA_FOLLOW = {1: {type: 'app'}, 2: {type: 'fund', amount: 20}, 3: {type: 'live'}, '3b': {type: 'academy'}, 4: {type: 'fund', amount: 20}, 5: {type: 'academy'}, 6: {type: 'fund', amount: 20}, live: {type: 'live'}, topup: {type: 'fund', amount: 20}, funded: {type: 'app'}};
const TASKS = {
  1: 'FOLLOW-UP step 1: they opened the bot minutes ago and have not funded. Check the app opened fine; offer 1-minute setup help.',
  2: 'FOLLOW-UP step 2: their AI is ready, signals are dropping; $20 is enough; mention welcome bonus only if USER FACTS show time left.',
  3: 'FOLLOW-UP step 3: personally invite them to the next live with Roland, our lead mentor (times in WAT). Free to watch, trade along.',
  '3b': 'FOLLOW-UP step 3: invite them to watch the 1-minute welcome training video in the app; it shows the whole setup.',
  4: 'FOLLOW-UP step 4: handle the most common doubt (money stays in their own IQ Option account, they approve every trade). Offer to walk them through funding $20.',
  5: 'FOLLOW-UP step 5: show what they are missing: 144 AI traders, AI of the week, 8 short training videos. Invite them to watch the welcome video.',
  6: 'FOLLOW-UP step 6: friendly last check-in. Ask what is stopping them and offer help. No pressure.',
  live: 'LIVE INVITE: Roland, our lead mentor, goes live soon (time given below). Personal, exciting invite. Only Roland.',
  topup: 'TOP-UP: they funded before but their IQ Option balance is $0 now. Warm, direct; signals are waiting; invite them to top up.',
  funded: 'DEPOSIT RECEIVED: celebrate their deposit, Zubabot is unlocked; next step pick an AI and take the next signal.',
};

// answers when the AI is off or failing, so nobody is left without a reply
const FAQ = [
  [/deposit|fund|pay|card|naira|cedi|rand|ksh|mpesa|momo|transfer|dep[oó]sit|pagar|pix|tarjeta|cart[aã]o|ฝาก/i, ['Funding takes about a minute 💳', 'Open Zubabot, tap Fund, pick your plan and pay on IQ Option’s page (card, bank, mobile money or crypto). Make sure it’s your REAL account. It unlocks by itself.'], {type: 'fund', amount: 20}],
  [/withdraw|cash ?out|payout|kyc|verify|retir|saque|sacar|retrait|ถอน/i, ['Withdrawals are done on IQ Option itself, to the method you deposited with 👌', 'Your money stays in your own IQ Option account. Zubabot never holds it.'], {type: 'app'}],
  [/scam|legit|safe|trust|real\?|estafa|golpe|seguro|arnaque|โกง/i, ['Fair question 🙂 Your money never leaves your own IQ Option account and you approve every trade.', 'Start small, with $20, and see how your AI trades first.'], {type: 'app'}],
  [/how much|minimum|start with|\$\s?\d+|cu[aá]nto|quanto|combien|magkano|เท่าไหร่/i, ['$20 is enough to switch Zubabot on 🙌', '$50 lets you trade with AI, and $100 adds voice with your AI.'], {type: 'fund', amount: 20}],
  [/account|sign ?up|register|link|connect|email|cuenta|conta|compte|บัญชี/i, ['Open Zubabot and tap “Create my free IQ Option account”, sign up on their page and tap Allow 👌', 'If you already had an IQ Option account, use a NEW email: old accounts can’t be linked.'], {type: 'app'}],
  [/coin|token|usdt|btc|crypto|moneda|moeda/i, ['Coins unlock more AI traders and tokens power voice calls 🪙', 'Best value: every $1 you deposit gives 10 coins. You can also buy them with USDT or BTC in the app.'], {type: 'coins'}],
  [/lost|loss|losing|lose|perd|ขาดทุน|talo/i, ['I hear you, that one hurt 😔', 'Most losses come from trading too big for the balance or chasing after a loss. Keep the first trade small so all the gale steps fit, and follow one signal at a time.'], {type: 'app'}],
  [/live|roland|session|mentor/i, [`${'{mentor}'}, our lead mentor, goes live every day (WAT) 🔴`, 'Free to watch, and you trade along with him.'], {type: 'live'}],
];

export function supportBot({db, q, now, C, publicState, brain, referral, settings, inbox, team, funnels, i18n, security}) {
  const HOOKS = {stt: null, aiWrite: null};
  const env = process.env, TGAPI = env.TELEGRAM_API || 'https://api.telegram.org';
  const ON = () => (env.SUPPORT_BOT || 'on') !== 'off' && funnels.bots().length > 0;
  const TEAM = env.SUPPORT_TEAM_CHAT_ID || '', APP = env.APP_URL || 'https://app.zubabot.com';
  const SUP = () => settings.get('support'), LV = () => settings.get('lives');
  // each language has its own support name and its own lead mentor (Roland is English only)
  const NAMEF = (L = 'en') => (L !== 'en' && ((settings.get('i18n') || {}).support || {})[L]) || SUP().name || 'Emily';
  // the person being handled right now (so their funnel's own mentor is used, when it has one)
  const UCTX = new AsyncLocalStorage();
  const asU = (id, fn) => UCTX.run({id: String(id || '')}, fn);
  const FM = (L) => { const st = UCTX.getStore(); return st && st.id ? funnels.mentorFor(st.id, L) : null; };
  const mentorOf = (L = 'en') => FM(L) || funnels.baseMentor(L);
  const minsOf = (L) => (mentorOf(L).times || []).map((t) => { const [h, mm] = String(t).split(':').map(Number); return h * 60 + (mm || 0); }).filter((x) => x >= 0 && x < 1440).sort((a, b) => a - b);
  MENTOR_ = (L) => MENTOR(L); LIVES_ = (L) => livesText(L); TZ_ = (L) => mentorOf(L).tz;
  const FOLLOWF = () => settings.get('followups').on;
  const QH = () => String(settings.get('followups').quiet || '22-8').split('-').map(Number);
  const MENTOR = (L = 'en') => mentorOf(L).name || 'Roland';
  const LIVES = (L = 'en') => { const F = FM(L); return L === 'en' && (!F || F.lives === 'main') ? settings.liveMins() : minsOf(L); };
  const livesText = (L = 'en') => { const l = LIVES(L).map(fmtTime); return l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l[0] || ''; };
  db.exec(`CREATE TABLE IF NOT EXISTS bot_users(tg_id TEXT PRIMARY KEY, chat_id TEXT, first_name TEXT, username TEXT, lang TEXT, started_at INTEGER, last_in INTEGER, last_out INTEGER,
      fu_step INTEGER DEFAULT 0, fu_next_at INTEGER, stopped INTEGER DEFAULT 0, human_until INTEGER DEFAULT 0, live_day TEXT, last_dep REAL DEFAULT 0, topup_at INTEGER DEFAULT 0, src TEXT);
    CREATE TABLE IF NOT EXISTS bot_msgs(id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id TEXT, role TEXT, text TEXT, at INTEGER);
    CREATE INDEX IF NOT EXISTS bot_msgs_u ON bot_msgs(tg_id, id);
    CREATE TABLE IF NOT EXISTS bot_handoff(team_msg_id TEXT PRIMARY KEY, tg_id TEXT, at INTEGER);`);
  for (const [c, t] of [['live_n', 'INTEGER DEFAULT 0'], ['nudge_at', 'INTEGER DEFAULT 0'], ['nudge_ids', 'TEXT'], ['nudge_n', 'INTEGER DEFAULT 0'], ['nudge_i', 'INTEGER DEFAULT 0'], ['biz', 'TEXT'], ['via', 'TEXT'], ['flow', 'TEXT'], ['back_reg', 'INTEGER DEFAULT 0'], ['back_pend', 'INTEGER DEFAULT 0'], ['bot', 'INTEGER DEFAULT 0']]) if (!q('PRAGMA table_info(bot_users)').all().some((x) => x.name === c)) db.exec(`ALTER TABLE bot_users ADD COLUMN ${c} ${t}`);
  if (!q('PRAGMA table_info(bot_msgs)').all().some((x) => x.name === 'tr')) db.exec('ALTER TABLE bot_msgs ADD COLUMN tr TEXT');       // English copy for the team
  const CAP_TG = () => +(settings.get('ai').capTg ?? env.AI_DAILY_TG ?? 60);

  /* ---------- which bot sends: the bot the update came in on, else the person's own bot, else the main bot ---------- */
  const CTX = new AsyncLocalStorage();
  const isTeamChat = (chatId) => (TEAM && String(chatId) === String(TEAM)) || team.isTeamChat(chatId);
  function botFor(body) {
    const st = CTX.getStore(); if (st && st.bot != null) return st.bot;
    const cid = body && body.chat_id != null ? String(body.chat_id) : ''; if (!cid) return 0;
    if (isTeamChat(cid)) return 0;
    const u = q('SELECT bot FROM bot_users WHERE chat_id=? OR tg_id=? LIMIT 1').get(cid, cid); if (u && u.bot != null) return +u.bot;
    return funnels.botOf(cid);
  }
  const BIZ_METHODS = new Set(['sendMessage', 'sendChatAction', 'sendPhoto']);
  async function tgRaw(botId, method, body) {
    const tok = funnels.bot(botId).token || funnels.mainBot.token; if (!tok) throw new Error('tg_' + method + ': no bot token');
    const r = await fetch(TGAPI + '/bot' + tok + '/' + method, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    const d = await r.json().catch(() => ({})); if (!d.ok) throw Object.assign(new Error('tg_' + method + ': ' + (d.description || r.status)), {tg: d}); return d.result;
  }
  const tg = async (method, body) => {
    if (BIZ_METHODS.has(method) && body && body.chat_id && !body.business_connection_id) { const b = q("SELECT biz FROM bot_users WHERE chat_id=? AND via='biz'").get(String(body.chat_id)); if (b && b.biz) body = {...body, business_connection_id: b.biz}; }
    return tgRaw(botFor(body), method, body);
  };
  funnels.hooks.tgFor = (botId) => (method, body) => tgRaw(+botId || 0, method, body);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const user = (id) => q('SELECT * FROM bot_users WHERE tg_id=?').get(String(id));
  const hist = (id) => q('SELECT role,text FROM bot_msgs WHERE tg_id=? ORDER BY id DESC LIMIT 14').all(String(id)).reverse().map((m) => [m.role === 'user' ? 'me' : 'ai', m.text]);
  const save = (id, role, text, who = null, channel = 'tg') => inbox.record(id, role, text, channel, who);
  const fmtLive = fmtTime;
  const localMin = (t, L) => { const d = new Date(t + mentorOf(L).offset * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const nextLive = (t = now(), lang = 'en') => { const m = localMin(t, lang); const L = LIVES(lang); if (!L.length || !livesFor(lang)) return 'soon (check the Live tab)'; const n = L.find((x) => x > m); return (n != null ? fmtLive(n) + ' today' : fmtLive(L[0]) + ' tomorrow') + ' ' + mentorOf(lang).tz; };

  // a funnel with its own mentor: the region mentor's name never reaches these people
  const SW = (id, t, L) => funnels.swapMentor(id, t, L);
  const swapKb = (id, kb, L) => { if (!kb || !kb.inline_keyboard) return kb; return {inline_keyboard: kb.inline_keyboard.map((r) => r.map((b) => ({...b, text: SW(id, b.text, L)})))}; };
  /* ---------- language ---------- */
  const langOf = (id) => funnels.langOf(id);
  const livesFor = (lang) => mentorOf(lang).on;
  const T = (lang, text, names) => i18n.tr(lang, text, {names});
  const TA = (lang, texts, names) => i18n.trAll(lang, texts, {names});
  // mini app links carry the language, so the app opens translated straight away
  // the app link carries the language, and the funnel's own mentor (so the app shows them from the very first screen)
  const fmParam = (lang) => { const F = FM(lang); if (!F) return ''; const j = {n: F.name, r: F.role, p: F.photo, lv: F.lives, on: F.on, t: F.times, tz: F.tz, o: F.offset, k: F.link, b: F.base};
    return 'fm=' + Buffer.from(JSON.stringify(j)).toString('base64url'); };
  const appUrl = (lang, path = '') => { let q = path || ''; const add = (x) => { if (x) q += (q ? '&' : '?') + x; }; add(lang && lang !== 'en' ? 'l=' + lang : ''); add(fmParam(lang)); return APP + q; };

  // buttons only ever open our own mini app (a teammate can't smuggle another site in through a button)
  const CTA_TYPES = new Set(['app', 'fund', 'live', 'academy', 'coins', 'room', 'signal', 'human', 'proof', 'invite']);
  const safeCta = (c) => { if (c && typeof c === 'object' && !c.type && c.path) c = {...c, type: 'app'}; if (!c || typeof c !== 'object' || !CTA_TYPES.has(c.type)) return c && c.path ? null : c ? {type: 'app'} : null;
    const o = {type: c.type}; if (c.amount != null) o.amount = Math.max(1, Math.min(100000, Math.round(+c.amount) || 20)); if (c.label) o.label = String(c.label).replace(/[<>]/g, '').slice(0, 48);
    if (c.path && /^\?[A-Za-z0-9_=&%.-]{0,160}$/.test(String(c.path))) o.path = String(c.path); if (c.name) o.name = String(c.name).replace(/[^a-z0-9-]/gi, '').slice(0, 40); return o; };
  async function buttons(cta, lang = 'en') {
    cta = safeCta(cta); if (!cta) return undefined;
    const open = async (label, path = '') => ({text: await T(lang, label), web_app: {url: appUrl(lang, path)}});
    if (cta.path) return {inline_keyboard: [[await open(cta.label || '🚀 Open Zubabot', cta.path)]]};
    if (cta.type === 'app' && cta.label) return {inline_keyboard: [[await open(cta.label)]]};
    if (cta.type === 'signal') return {inline_keyboard: [[await open(cta.label || '⚡ Open the Signal Room', '?go=room')]]};
    if (cta.type === 'room') return {inline_keyboard: [[await open(cta.label || '⚡ Take the signal', '?go=room')]]};
    const row = cta.type === 'fund' ? [await open(`💳 Fund $${cta.amount || 20} now`, '?go=fund&amt=' + (cta.amount || 20))] : cta.type === 'live' ? (livesFor(lang) ? [await open('🔴 Join the live', '?go=live')] : [await open('🚀 Open Zubabot')]) : cta.type === 'academy' ? [await open('🎬 Watch the 1-min video', '?go=academy')]
      : cta.type === 'coins' ? [await open('🪙 Get coins', '?go=coins')] : cta.type === 'human' ? null : [await open('🚀 Open Zubabot')];
    return row ? {inline_keyboard: [row]} : undefined;
  }
  // send texts "in breaks" like a person: typing..., pause, next text. Texts are translated unless meta.localized (AI wrote them in the language already)
  function sendTexts(id, chatId, texts, cta, fast, meta = {}) { return asU(id, () => sendTextsU(id, chatId, texts, cta, fast, meta)); }
  async function sendTextsU(id, chatId, texts, cta, fast, meta = {}) {
    const lang = meta.lang || langOf(id); const u = user(id);
    if (lang !== 'en' && !meta.localized) texts = await TA(lang, texts, [u && u.first_name].filter(Boolean));
    texts = texts.map((t) => SW(id, t, lang));
    // security: anything the AI wrote is checked like a person's message (a teammate's reply was checked before it got here)
    if (security && (meta.role || 'ai') === 'ai' && meta.checked !== true && !meta.localized) { const g = await security.check(texts.join('\n'), {source: 'AI ' + (meta.channel || 'telegram'), who: meta.who || 'AI', tgId: id, ai: true}); if (!g.ok) { texts = ['Sorry, let me rephrase that 🙏 Open the app below and I’ll help you there.']; cta = {type: 'app'}; if (lang !== 'en') texts = await TA(lang, texts); } }
    if (cta && cta.type === 'proof') { await sendTexts(id, chatId, texts, null, fast, {...meta, lang, localized: true}); const url = (env.PUBLIC_URL || '').replace(/\/$/, '') + '/api/proof?n=' + encodeURIComponent(cta.name || 'iqoption');
      if (env.PUBLIC_URL) { try { await tg('sendPhoto', {chat_id: chatId, photo: url}); save(id, 'ai', '(sent a picture: ' + (cta.name || 'iqoption') + ')', meta.who || null, meta.channel || 'tg'); } catch (e) { console.warn('[bot] proof', e.message); } } return; }
    const kb = swapKb(id, await buttons(cta, lang), lang);
    for (let i = 0; i < texts.length; i++) {
      try { await tg('sendChatAction', {chat_id: chatId, action: 'typing'}); } catch (e) {}
      await sleep(fast ? 900 : Math.min(3800, 700 + texts[i].length * 28));
      const last = i === texts.length - 1;
      await tg('sendMessage', {chat_id: chatId, text: texts[i], reply_markup: last ? kb : undefined, disable_web_page_preview: true});
      save(id, meta.role || 'ai', texts[i], meta.who || null, meta.channel || 'tg');
    }
    q('UPDATE bot_users SET last_out=? WHERE tg_id=?').run(now(), String(id));
  }
  // the team reads every chat in English: user messages in other languages get an English copy next to them
  async function englishCopy(tgId, lang, text) {
    if (lang === 'en' || !text || !settings.get('i18n').teamEnglish || !brain.live()) return;
    try { const r = q('SELECT id FROM bot_msgs WHERE tg_id=? AND role=\'user\' ORDER BY id DESC LIMIT 1').get(String(tgId)); if (!r) return;
      const en = await i18n.free('en', text); if (en) q('UPDATE bot_msgs SET tr=? WHERE id=?').run(en.slice(0, 2000), r.id); } catch (e) {}
  }
  // hand the chat to a human: the inbox alerts the team (team group + connected teammates) and tells the user
  async function handoff(u, text, why, notifyUser = false) { await inbox.requestHuman(u.tg_id, {reason: why, text, channel: 'tg', notifyUser}); }
  // a forwarded copy in the team group: reply to it to answer the user
  inbox.hooks.teamGroup = async (tgId, msg) => { if (!TEAM || !ON()) return; const lang = langOf(tgId); const m = await tgRaw(0, 'sendMessage', {chat_id: TEAM, text: (lang !== 'en' ? `[${lang.toUpperCase()}] ` : '') + msg + `\n\n/human ${tgId} = take over · /ai ${tgId} = back to the assistant`});
    q('INSERT OR REPLACE INTO bot_handoff(team_msg_id,tg_id,at) VALUES(?,?,?)').run(String(m.message_id), String(tgId), now()); };
  // alerts to teammates' own Telegram chats (always through the main bot): they can reply to the alert to answer the user
  team.hooks.sendTg = async (chatId, text, btn, tgId) => { if (!ON()) return; const m = await tgRaw(0, 'sendMessage', {chat_id: chatId, text, reply_markup: btn, disable_web_page_preview: true});
    if (tgId) q('INSERT OR REPLACE INTO bot_handoff(team_msg_id,tg_id,at) VALUES(?,?,?)').run(chatId + ':' + m.message_id, String(tgId), now()); };
  // the inbox sends messages to users through their bot. Teammates' replies are translated into the person's language.
  inbox.hooks.toUser = (tgId, texts, cta, meta = {}) => asU(tgId, () => toUserU(tgId, texts, cta, meta));
  const toUserU = async (tgId, texts, cta, meta = {}) => {
    const u = user(tgId); const role = meta.role || 'ai'; const lang = langOf(tgId);
    if (lang !== 'en' && role === 'human' && settings.get('i18n').translateHuman) { const orig = texts; try { texts = await Promise.all(texts.map(async (t) => (await i18n.free(lang, t)) || t)); } catch (e) {} meta = {...meta, localized: true};
      // the translation is checked too (the teammate's English was checked before it got here)
      if (security && texts.join('\n') !== orig.join('\n') && security.scan(orig.join('\n')).severity === 'ok') { const g = await security.check(texts.join('\n'), {source: 'translated reply', who: meta.who || '', tgId}); if (!g.ok) texts = orig; } }
    else if (lang !== 'en' && !meta.localized) { texts = await TA(lang, texts, [u && u.first_name].filter(Boolean)); meta = {...meta, localized: true}; }
    texts = texts.map((t) => SW(tgId, t, lang));
    if (meta.channel === 'app' || meta.channel === 'mentor') { for (const t of texts) save(tgId, role, t, meta.who || null, meta.channel); if (ON() && u && u.chat_id && !u.stopped) { try { const kb = await buttons(cta, lang); for (const t of texts) await tg('sendMessage', {chat_id: u.chat_id, text: t, reply_markup: kb}); } catch (e) {} } return texts; }
    if (!ON() || !u) { for (const t of texts) save(tgId, role, t, meta.who || null); return texts; }
    await sendTexts(String(tgId), u.chat_id, texts, cta, meta.fast !== false, {...meta, lang});
    return texts;
  };
  inbox.hooks.rateAsk = async (t) => { const u = user(t.tg_id); if (!ON() || !u) return; const L = langOf(t.tg_id);
    await tg('sendMessage', {chat_id: u.chat_id, text: await T(L, 'Glad we could help 🙌 Is everything sorted?'), reply_markup: {inline_keyboard: [[{text: await T(L, '👍 Yes, sorted'), callback_data: `rate:${t.id}:up`}, {text: await T(L, '👎 Not yet'), callback_data: `rate:${t.id}:down`}]]}}); };
  // a flow = steps; each step is a text (+ optional picture) with optional buttons. Sent with a typing pause, like a person.
  const flowButtons = async (btns, lang = 'en', native = false) => { const rows = []; for (const b of (btns || []).filter((b) => b && b.label && !(b.action === 'live' && !livesFor(lang))).slice(0, 6)) { const L = String(native ? b.label : await T(lang, String(b.label))).slice(0, 60), v = b.value;
      if (b.action === 'url' && /^https?:\/\//.test(v || '')) { rows.push([{text: L, url: v}]); continue; }
      if (b.action === 'support') { rows.push([{text: L, callback_data: 'flow:sup'}]); continue; } if (b.action === 'human') { rows.push([{text: L, callback_data: 'flow:hum'}]); continue; }
      const path = b.action === 'fund' ? '?go=fund&amt=' + (+v || 20) : b.action === 'live' ? '?go=live' : b.action === 'academy' ? '?go=academy' : b.action === 'invite' ? '?go=invite' : b.action === 'signal' ? '?go=room' : b.action === 'coins' ? '?go=coins' : '';
      rows.push([{text: L, web_app: {url: appUrl(lang, path)}}]); }
    return rows.length ? {inline_keyboard: rows} : undefined; };
  function runFlow(id, chatId, flow, name, lang) { return asU(id, () => runFlowU(id, chatId, flow, name, lang)); }
  async function runFlowU(id, chatId, flow, name, lang) {
    lang = lang || langOf(id); const native = (flow && (flow.lang || 'en')) === lang;      // a flow written in this language is sent as it is
    for (const st of (flow && flow.steps) || []) {
      let text = String(st.text || ''); if (!text && !st.image) continue;
      if (!native && lang !== 'en') text = await T(lang, text.replace(/\{name\}/g, '{name}'));
      text = SW(id, text.replace(/\{name\}/g, name || 'there'), lang);
      try { await tg('sendChatAction', {chat_id: chatId, action: 'typing'}); } catch (e) {}
      await sleep(Math.min(2600, 700 + text.length * 14));
      const kb = swapKb(id, await flowButtons(st.buttons, lang, native), lang);
      if (st.image && env.PUBLIC_URL) { try { await tg('sendPhoto', {chat_id: chatId, photo: env.PUBLIC_URL.replace(/\/$/, '') + '/api/proof?n=' + encodeURIComponent(st.image), caption: text.slice(0, 1000), reply_markup: kb}); save(id, 'ai', text + ' (picture)'); continue; } catch (e) {} }
      await tg('sendMessage', {chat_id: chatId, text, reply_markup: kb, disable_web_page_preview: true}); save(id, 'ai', text);
    }
    q('UPDATE bot_users SET last_out=? WHERE tg_id=?').run(now(), String(id));
  }
  // which welcome flow: the funnel's own flow, else the active one (or the A/B test flow for a share of new people)
  function pickFlow(id) {
    const FL = settings.get('flows'); const a = q('SELECT funnel FROM attrib WHERE tg_id=?').get(String(id)); const f = a && a.funnel ? funnels.funnel(a.funnel) : null;
    let fk = f && f.flow && FL.list[f.flow] ? f.flow : null;
    if (!fk) { fk = FL.active; if (FL.split && FL.split.to && FL.list[FL.split.to] && Math.random() * 100 < (+FL.split.pct || 0)) fk = FL.split.to; if (f && f.type === 'join' && FL.list.join) fk = 'join'; }
    if (!FL.list[fk]) fk = Object.keys(FL.list)[0];
    return fk;
  }
  function onCallback(cb) { return asU(cb && cb.from ? cb.from.id : '', () => onCallbackU(cb)); }
  async function onCallbackU(cb) {
    if (cb && /^flow:(sup|hum)$/.test(cb.data || '')) {
      const id = String(cb.from.id), chat = cb.message ? cb.message.chat.id : id; try { await tg('answerCallbackQuery', {callback_query_id: cb.id}); } catch (e) {}
      const u = user(id) || {tg_id: id, first_name: cb.from.first_name};
      if (cb.data === 'flow:hum' && inbox.humansAvailable()) return handoff(u, '(tapped “talk to a person”)', 'asked for a human from the welcome flow', true);
      const fl = settings.get('flows'); const f = fl.list[(u && u.flow) || fl.active] || {};
      return sendTexts(id, chat, [f.supportReply || 'Sure 🙌 type your question here, we reply right away.'], null, true, {localized: (f.lang || 'en') === langOf(id)});
    }
    const m = String(cb.data || '').match(/^rate:(\d+):(up|down)$/); if (!m) return;
    const t = q('SELECT tg_id FROM tickets WHERE id=?').get(+m[1]); if (!t || t.tg_id !== String(cb.from.id)) return;
    const L = langOf(t.tg_id);
    await inbox.rate(+m[1], m[2]); try { await tg('answerCallbackQuery', {callback_query_id: cb.id, text: await T(L, m[2] === 'up' ? 'Thanks! 💛' : 'Sorry! A teammate is on it.')}); } catch (e) {}
    try { await tg('editMessageReplyMarkup', {chat_id: cb.message.chat.id, message_id: cb.message.message_id, reply_markup: {inline_keyboard: []}}); } catch (e) {}
    if (m[2] === 'down') await sendTexts(t.tg_id, cb.message.chat.id, ['Sorry about that 🙏 a teammate will get back to you right here.'], null, true, {who: 'system'});
  }

  // messages in the team group, or a teammate replying to an alert in their own chat with the main bot
  async function onTeamMessage(m, member) {
    const t = (m.text || '').trim(); const who = member || {name: (m.from.first_name || 'Team') + (m.from.last_name ? ' ' + m.from.last_name[0] : ''), role: 'support'};
    const cmd = t.match(/^\/(ai|human|stop|close)(?:@\w+)?\s+(\d+)/);
    if (cmd) { const id = cmd[2]; const tk = inbox.open(id);
      if (cmd[1] === 'human') { const k = tk || await inbox.requestHuman(id, {reason: 'team took over', notifyUser: false}); await inbox.takeOver(k.id, who); }
      else if (cmd[1] === 'ai') { if (tk) await inbox.handBack(tk.id, who); else q('UPDATE bot_users SET human_until=0 WHERE tg_id=?').run(id); }
      else if (cmd[1] === 'close') { if (tk) await inbox.close(tk.id, who); }
      else q('UPDATE bot_users SET stopped=1 WHERE tg_id=?').run(id);
      return tgRaw(0, 'sendMessage', {chat_id: m.chat.id, text: `OK ✅ ${cmd[1]} for ${id}`}); }
    if (!m.reply_to_message) return;
    const key = String(m.chat.id) === String(TEAM) ? String(m.reply_to_message.message_id) : m.chat.id + ':' + m.reply_to_message.message_id;
    const ref = q('SELECT tg_id FROM bot_handoff WHERE team_msg_id=?').get(key);
    if (!ref || !t) return tgRaw(0, 'sendMessage', {chat_id: m.chat.id, text: 'Reply to a hand-off message to answer that user, or use the admin inbox.'}).catch(() => {});
    if (!user(ref.tg_id)) return;
    try { await inbox.reply(ref.tg_id, who, t); } catch (e) { return tgRaw(0, 'sendMessage', {chat_id: m.chat.id, text: '🛑 ' + e.message, reply_to_message_id: m.message_id}).catch(() => {}); }
    try { await tgRaw(0, 'setMessageReaction', {chat_id: m.chat.id, message_id: m.message_id, reaction: [{type: 'emoji', emoji: '👍'}]}); } catch (e) {}
  }

  /* ---------- Telegram Business: a Premium account connected to a bot answers as a real person ---------- */
  db.exec('CREATE TABLE IF NOT EXISTS biz_conn(id TEXT PRIMARY KEY, owner_id TEXT, owner_chat TEXT, enabled INTEGER, can_reply INTEGER, at INTEGER)');
  function onBizConnection(c) { if (!c || !c.id) return; q('INSERT INTO biz_conn(id,owner_id,owner_chat,enabled,can_reply,at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled, can_reply=excluded.can_reply, at=excluded.at')
    .run(c.id, String(c.user && c.user.id), String(c.user_chat_id || ''), c.is_enabled ? 1 : 0, (c.can_reply ?? (c.rights && c.rights.can_reply)) ? 1 : 0, now()); }
  async function onBizMessage(m) {
    if (!m || !m.from || !m.business_connection_id || m.sender_business_bot) return;          // our own replies sent through the account
    const bc = q('SELECT * FROM biz_conn WHERE id=?').get(m.business_connection_id); if (!bc || !bc.enabled) return;
    if (String(m.from.id) === bc.owner_id) {                  // the team typed in the Premium account themselves -> that's a human take-over
      const cust = String(m.chat.id);
      if (security && (m.text || m.caption)) security.check(m.text || m.caption, {source: 'Telegram Business account (' + (m.business_connection_id || '').slice(0, 6) + ')', who: (m.from.first_name || '') + (m.from.username ? ' @' + m.from.username : ''), tgId: cust, canBlock: false}).catch(() => {}); if (m.text) { save(cust, 'human', m.text, 'Business account', 'tg'); const t = inbox.open(cust) || await inbox.requestHuman(cust, {reason: 'answered from the Business account', notifyUser: false}); if (t.status !== 'human') await inbox.takeOver(t.id, {name: 'Business account', role: 'support', id: -1}); }
      return;
    }
    const st = CTX.getStore() || {};
    q(`INSERT INTO bot_users(tg_id,chat_id,first_name,username,started_at,last_in,fu_step,fu_next_at,bot) VALUES(?,?,?,?,?,?,0,NULL,?) ON CONFLICT(tg_id) DO NOTHING`).run(String(m.from.id), String(m.chat.id), m.from.first_name || '', m.from.username || '', now(), now(), +st.bot || 0);
    q("UPDATE bot_users SET biz=?, via='biz', chat_id=? WHERE tg_id=?").run(m.business_connection_id, String(m.chat.id), String(m.from.id));
    return onMessage({...m, chat: {...m.chat, type: 'private'}}, true);
  }
  function onMessage(m, viaBiz) { return asU(m && m.from ? m.from.id : '', () => onMessageU(m, viaBiz)); }
  async function onMessageU(m, viaBiz) {
    if (!m || !m.from || m.from.is_bot) return;
    const botId = +((CTX.getStore() || {}).bot || 0);
    if (!viaBiz && m.chat && m.chat.type === 'private') q("UPDATE bot_users SET via='bot' WHERE tg_id=? AND via='biz'").run(String(m.from.id));
    if (TEAM && String(m.chat.id) === String(TEAM)) { if (botId === 0 && (m.reply_to_message || /^\/(ai|human|stop|close)\b/.test(m.text || ''))) return onTeamMessage(m); return; }
    if (m.chat.type !== 'private') return watchChat(m, botId);
    // a teammate's own chat with the main bot: connect alerts, or answer a user by replying to an alert
    const tm = botId === 0 ? team.memberByChat(m.chat.id) : null;
    if (tm && (m.reply_to_message || /^\/(ai|human|stop|close)\s+\d+/.test(m.text || ''))) return onTeamMessage(m, tm);
    const al = (m.text || '').match(/^\/start\s+alerts_([\w-]+)/);
    if (al) { const who = botId === 0 ? team.connect(al[1], m.chat.id, m.from.first_name) : null; return tg('sendMessage', {chat_id: m.chat.id, text: who ? `✅ Alerts connected for ${who}. You’ll get Zubabot team alerts here. Reply to an alert about a user to answer them.` : 'That alerts link is not valid any more. Get a new one in Admin -> Alerts (open it with the main bot).'}); }
    if ((q('SELECT blocked FROM users WHERE tg_id=?').get(String(m.from.id)) || {}).blocked) return;
    const id = String(m.from.id), chatId = String(m.chat.id), t = now();
    q(`INSERT INTO bot_users(tg_id,chat_id,first_name,username,lang,started_at,last_in,fu_step,fu_next_at,bot) VALUES(?,?,?,?,?,?,?,0,?,?)
       ON CONFLICT(tg_id) DO UPDATE SET chat_id=excluded.chat_id, first_name=excluded.first_name, username=excluded.username, lang=excluded.lang, last_in=excluded.last_in`)
      .run(id, chatId, m.from.first_name || '', m.from.username || '', m.from.language_code || '', t, t, t + STEPS[0], botId);
    let u = user(id); let text = (m.text || m.caption || '').trim();
    if (/^\/start\b/.test(text)) { const src = text.split(' ')[1] || ''; funnels.fromStart(id, src, botId, 'bot'); q('UPDATE bot_users SET bot=? WHERE tg_id=?').run(botId, id); }
    else if (!q('SELECT 1 FROM attrib WHERE tg_id=?').get(id)) funnels.attrib(id, {bot: botId, via: 'bot'});
    const L = langOf(id);
    if (/^\/stop\b/.test(text)) { q('UPDATE bot_users SET stopped=1 WHERE tg_id=?').run(id); return tg('sendMessage', {chat_id: chatId, text: await T(L, 'Done ✅ No more reminders from me. I’m still here any time you message.')}); }
    if (/^\/start\b/.test(text)) {
      const src = text.split(' ')[1] || ''; if (src) q('UPDATE bot_users SET src=COALESCE(src,?) WHERE tg_id=?').run(src.slice(0, 40), id);
      q('UPDATE bot_users SET stopped=0 WHERE tg_id=?').run(id);
      const n = m.from.first_name || 'there';
      save(id, 'user', '/start');
      let by = null; if (referral && /^ref_/i.test(src)) { try { if (referral.attach(m.from, src, 'chat')) by = referral.stats(id).invitedBy; } catch (e) {} }
      if (by) return sendTexts(id, chatId, [`Hey ${n}! 👋 ${by.name} invited you to Zubabot.`, `Start your 3 months free. Your first day of deposits gets you up to +${by.cap || by.bonus} bonus coins, unlocked after your first 5 trades 🎁`, 'Any question, just type it here. I’m here 24/7 😊'], {type: 'app'});
      const fk = pickFlow(id); q('UPDATE bot_users SET flow=COALESCE(flow,?) WHERE tg_id=?').run(fk, id);
      return runFlow(id, chatId, settings.get('flows').list[fk], n, L);
    }
    if (/^\/invite\b/.test(text) && referral) { const r = referral.stats(id); const msg = await T(L, `I trade with an AI trader on Zubabot 🔥 3 months free. Join with my link and get up to +${r.rules.fcap} bonus coins on your first day:`);
      const head = await T(L, 'Here’s your invite link 👇'), body1 = await T(L, `+${r.rules.ftd} coins when a friend funds $${r.rules.min}+, and if they put in $${r.rules.big}+ in their first 24 hours you get ${r.rules.per} coins per $1 (up to ${r.rules.cap}). Coins land once your friend takes ${r.rules.minTrades} trades.`),
        body2 = await T(L, `So far: ${r.stats.invited} invited · ${r.stats.funded} funded · ${r.stats.earned} coins earned.`);
      save(id, 'ai', head + ' ' + r.links.app);
      await tg('sendMessage', {chat_id: chatId, text: `${head}\n${r.links.app}\n\n${body1}\n${body2}`,
        reply_markup: {inline_keyboard: [[{text: await T(L, '📤 Share with friends'), url: 'https://t.me/share/url?url=' + encodeURIComponent(r.links.app) + '&text=' + encodeURIComponent(msg)}], [{text: await T(L, '🎁 My invite page'), web_app: {url: appUrl(L, '?go=invite')}}]]}}); return; }
    if (/^\/(live)\b/.test(text)) return livesFor(L) ? sendTexts(id, chatId, [`${MENTOR(L)}, our lead mentor, goes live every day at ${livesText(L)} (${mentorOf(L).tz}).`, `Next one: ${nextLive(now(), L)}. Free to watch, trade along with him 🔴`], {type: 'live'}) : sendTexts(id, chatId, ['Your AI posts new signals all day 🔔', 'Open the app and take the next one with your AI.'], {type: 'room'});
    if (/^\/(fund)\b/.test(text)) return sendTexts(id, chatId, ['Funding takes about a minute 💳', 'Open the app, tap Fund, pick your plan and pay on IQ Option’s page. It unlocks by itself.'], {type: 'fund', amount: 20});
    // reset the follow-up clock when they talk to us
    q('UPDATE bot_users SET fu_next_at=?, live_n=0 WHERE tg_id=? AND fu_step<?').run(t + 20 * 3600e3, id, STEPS.length);
    q('UPDATE bot_users SET live_n=0 WHERE tg_id=?').run(id);
    // voice notes: listen (speech-to-text in their language), then answer like a typed message
    let heardVoice = false;
    if (m.voice || m.audio || m.video_note) {
      const vn = m.voice || m.audio || m.video_note; const sec = +vn.duration || 0;
      try {
        if (!HOOKS.stt || sec > 180) throw new Error('no stt');
        const sday = 'stt:' + new Date().toISOString().slice(0, 10);
        if (((q('SELECT n FROM ai_usage WHERE tg_id=? AND day=?').get(String(id), sday) || {}).n || 0) >= +(env.VOICE_NOTES_PER_DAY || 20)) throw new Error('stt cap');
        q('INSERT INTO ai_usage(tg_id,day,n) VALUES(?,?,1) ON CONFLICT(tg_id,day) DO UPDATE SET n=n+1').run(String(id), sday);
        try { await tg('sendChatAction', {chat_id: chatId, action: 'typing'}); } catch (e) {}
        const f = await tg('getFile', {file_id: vn.file_id}); const tok = funnels.bot(botId).token || funnels.mainBot.token;
        const ac = new AbortController(); const tmo = setTimeout(() => ac.abort(), 15000); let buf;
        try { const r = await fetch(TGAPI + '/file/bot' + tok + '/' + f.file_path, {signal: ac.signal}); if (!r.ok) throw new Error('file ' + r.status); buf = Buffer.from(await r.arrayBuffer()); } finally { clearTimeout(tmo); }
        const mime = m.voice ? 'audio/ogg' : (vn.mime_type || (m.video_note ? 'video/mp4' : 'audio/mpeg'));
        const heard = String(((await HOOKS.stt(buf, mime, Math.max(1, Math.min(sec || 10, 180)), L)) || {}).text || '').trim();
        if (!heard) throw new Error('empty');
        text = (heard + (text ? '\n' + text : '')).slice(0, 2000); heardVoice = true;
      } catch (e) { if (inbox.isHuman(id)) { save(id, 'user', '🎤 (voice note, not transcribed)'); await inbox.userWhileHuman(id, '🎤 (voice note, not transcribed: open the chat in Telegram to listen)', 'tg'); return; }
        save(id, 'user', '(voice note)'); return sendTexts(id, chatId, ['I couldn’t hear that one clearly 🙈', 'Can you send it again, or type it? I’ll reply straight away.'], null); }
    }
    if (inbox.isHuman(id)) { const tx = heardVoice ? '🎤 ' + text : text; save(id, 'user', tx || '(media)'); englishCopy(id, L, text); await inbox.userWhileHuman(id, tx || '(sent media)', 'tg'); return; }
    // asked for a person -> straight to the team, no AI
    if (text && inbox.wantsHuman(text) && inbox.humansAvailable()) { save(id, 'user', text); englishCopy(id, L, text); await handoff(u, text, 'asked for a human', true); return; }
    // photos: the brain can look at screenshots (deposit page, error screens)
    let images = [];
    if (m.photo && m.photo.length) { try { const ph = m.photo[m.photo.length - 1]; const f = await tg('getFile', {file_id: ph.file_id}); const tok = funnels.bot(botId).token || funnels.mainBot.token; const r = await fetch(TGAPI + '/file/bot' + tok + '/' + f.file_path);
      images = [{media_type: 'image/jpeg', data: Buffer.from(await r.arrayBuffer()).toString('base64')}]; } catch (e) { console.warn('[bot] photo', e.message); } }
    if (!text && !images.length) return;
    const h = hist(id); save(id, 'user', heardVoice ? '🎤 ' + text : (text || '(screenshot)')); englishCopy(id, L, text);
    try { await tg('sendChatAction', {chat_id: chatId, action: 'typing'}); } catch (e) {}
    let out, localized = false;
    const day = 'tg:' + new Date().toISOString().slice(0, 10), used = (q('SELECT n FROM ai_usage WHERE tg_id=? AND day=?').get(id, day) || {}).n || 0;
    if (brain.live() && used < CAP_TG()) {
      q('INSERT INTO ai_usage(tg_id,day,n) VALUES(?,?,1) ON CONFLICT(tg_id,day) DO UPDATE SET n=n+1').run(id, day);
      try { out = await brain.reply({tgId: id, kind: 'support', agent: NAMEF(L), ctx: {name: u.first_name, nextLive: livesFor(L) ? nextLive(now(), L) : 'no lives in this region', screen: 'telegram chat', humans: inbox.humansAvailable()}, history: h, text, images, channel: 'telegram', lang: L}); localized = true; }
      catch (e) { console.warn('[bot] ai', e.message); }
    }
    if (!out) { const f = faqFor(text, L); out = f || (inbox.humansAvailable() ? {messages: ['Got you 🙏 let me get a teammate on this, they’ll reply right here.'], cta: {type: 'human'}}
      : {messages: ['Got you 🙏', 'Open Zubabot below and tap the headset at the top for instant help, or ask me about funding, withdrawals or your account.'], cta: {type: 'app'}}); }
    if (out.cta && out.cta.type === 'human' && !inbox.humansAvailable()) out.cta = {type: 'app'};
    brain.logAI(id, 'support-tg', NAMEF(L), 'user', text || '(screenshot)'); brain.logAI(id, 'support-tg', NAMEF(L), 'ai', out.messages.join(' || '), out.cta);
    await sendTexts(id, chatId, out.messages, out.cta, false, {localized, lang: L});
    if (out.cta && out.cta.type === 'human' && inbox.humansAvailable()) await handoff(u, text || '(screenshot)', 'assistant asked for a human');
  }
  const faqFor = (t, L = 'en') => { for (const [re, m, c] of FAQ) if (re.test(t || '')) { if (c.type === 'live' && !livesFor(L)) continue; return {messages: m.map((x) => x.replace('{mentor}', MENTOR(L))), cta: c}; } return null; };

  /* ---------- security watch: every post in channels / groups where a bot is admin ---------- */
  async function watchChat(m, botId, kind) {
    if (!security || !m || !m.chat) return; const text = m.text || m.caption || ''; if (!text) return;
    q('INSERT INTO security_watch(chat_id,title,kind,bot,added_at,last_at,n) VALUES(?,?,?,?,?,?,1) ON CONFLICT(chat_id) DO UPDATE SET title=excluded.title, last_at=excluded.last_at, n=n+1').run(String(m.chat.id), m.chat.title || m.chat.username || '', kind || m.chat.type, botId, now(), now());
    const who = m.author_signature || (m.from ? (m.from.first_name || '') + (m.from.username ? ' @' + m.from.username : '') : m.chat.title || 'channel');
    const g = await security.check(text, {source: (kind || m.chat.type) + (m.edit_date ? ' (edited)' : ''), who, chat: m.chat.id, chatTitle: m.chat.title || '', canBlock: !!(settings.get('security') || {}).removeInChannels});
    if (!g.ok) { try { await tgRaw(botId, 'deleteMessage', {chat_id: m.chat.id, message_id: m.message_id}); } catch (e) { console.warn('[security] delete', e.message); } }
  }
  security && (security.hooks.sendGroup = async (text) => { const gid = (settings.get('security') || {}).groupId || TEAM; if (!gid || !ON()) return; await tgRaw(0, 'sendMessage', {chat_id: gid, text: text.slice(0, 4000), disable_web_page_preview: true}); });
  security && security.setBotNames(() => funnels.bots().map((b) => b.username));

  /* ---------- channel join requests (join funnels) ---------- */
  async function onJoin(r) {
    const botId = +((CTX.getStore() || {}).bot || 0);
    const j = funnels.onJoinRequest(botId, r); if (!j) return;
    q(`INSERT INTO bot_users(tg_id,chat_id,first_name,username,lang,started_at,last_in,fu_step,fu_next_at,bot) VALUES(?,?,?,?,?,?,?,0,?,?) ON CONFLICT(tg_id) DO NOTHING`)
      .run(String(r.from.id), String(r.user_chat_id || r.from.id), r.from.first_name || '', r.from.username || '', r.from.language_code || '', now(), now(), now() + STEPS[0], botId);
    if (j.due <= now()) await joinTick();
  }
  let joinBusy = false;
  async function joinTick() {
    if (joinBusy || !ON()) return; joinBusy = true;
    try { for (const j of funnels.dueJoins()) {
      let ok = false; try { await tgRaw(j.bot, 'approveChatJoinRequest', {chat_id: j.chat_id, user_id: +j.tg_id}); ok = true; } catch (e) { if (!/USER_ALREADY_PARTICIPANT|HIDE_REQUESTER_MISSING/i.test(e.message)) console.warn('[bot] approve', e.message); ok = /USER_ALREADY_PARTICIPANT/i.test(e.message); }
      funnels.doneJoin(j, ok);
      if (!ok) continue;
      // welcome them in a private message with the funnel's flow (they never pressed START, so this is the first message they get)
      try { await CTX.run({bot: j.bot}, async () => { const fk = pickFlow(j.tg_id); q('UPDATE bot_users SET flow=COALESCE(flow,?), chat_id=? WHERE tg_id=?').run(fk, j.user_chat, j.tg_id); save(j.tg_id, 'user', '(joined the channel)');
        await runFlow(j.tg_id, j.user_chat, settings.get('flows').list[fk], j.first_name || 'there'); }); }
      catch (e) { if (/blocked|deactivated|chat not found|403/i.test(e.message)) q('UPDATE bot_users SET stopped=1 WHERE tg_id=?').run(j.tg_id); else console.warn('[bot] join dm', e.message); }
    } } finally { joinBusy = false; }
  }

  // one personal follow-up (AI-written in their language, template fallback translated)
  function follow(u, kind, liveAt = '') { return asU(u.tg_id, () => followU(u, kind, liveAt)); }
  async function followU(u, kind, liveAt = '') {
    const n = u.first_name || 'there'; const L = langOf(u.tg_id);
    if ((kind === 3 || kind === 'live') && !livesFor(L)) { if (kind === 'live') return; kind = '3b'; }
    let out = null, localized = false;
    const stg = stageOf(u.tg_id); const stageTask = stg === 'no_app' ? ' THEIR STAGE: they have NOT opened the app yet. Goal of this message: get them to tap the button and open the app.' : stg === 'no_account' ? ' THEIR STAGE: opened the app but has not created/connected the IQ Option account. Goal: finish the 1-minute sign-up.' : stg === 'no_deposit' ? ' THEIR STAGE: account connected, not funded yet. Goal: fund their own trading account ($20 is enough).' : '';
    if (brain.live()) { try { out = await brain.reply({tgId: u.tg_id, kind: 'support', agent: NAMEF(L), ctx: {name: u.first_name, nextLive: livesFor(L) ? nextLive(now(), L) : 'no lives in this region', screen: 'telegram follow-up'}, history: hist(u.tg_id), text: '(no new message from the user; write the follow-up described in TASK)', channel: 'telegram', area: 'followups', lang: L, task: (TASKS[kind] || '').replace(/Roland/g, MENTOR(L)).replace('(times in WAT)', '(times in ' + mentorOf(L).tz + ')') + stageTask + (liveAt ? ' Live time: ' + liveAt + ' ' + mentorOf(L).tz + '.' : '')}); localized = true; if (out && out.blocked) { out = null; localized = false; } } catch (e) { console.warn('[bot] follow ai', e.message); } }
    if (!out || !out.messages.length) { out = {messages: TEMPLATES[kind](n, liveAt || nextLive(now(), L), L), cta: CTA_FOLLOW[kind]}; localized = false; }
    if (!out.cta || out.cta.type === 'human') out.cta = CTA_FOLLOW[kind];
    brain.logAI(u.tg_id, 'followup', String(kind), 'ai', out.messages.join(' || '), out.cta);
    try { await CTX.run({bot: u.bot != null ? +u.bot : funnels.botOf(u.tg_id)}, () => sendTexts(u.tg_id, u.chat_id, out.messages.slice(0, 3), out.cta, true, {localized, lang: L})); }
    catch (e) { if (/blocked|deactivated|chat not found|kicked/i.test(e.message)) q('UPDATE bot_users SET stopped=1 WHERE tg_id=?').run(u.tg_id); throw e; }
  }
  // where someone is in the funnel: no_app -> no_account -> no_deposit -> funded
  function stageOf(tgId) { const u = q('SELECT iq_user_id, linked, updated_at FROM users WHERE tg_id=?').get(String(tgId)); if (!u) return 'no_app';
    const st = publicState(tgId) || {}; if ((st.deposits_total || 0) >= C.minDeposit) return 'funded'; return u.linked ? 'no_deposit' : 'no_account'; }
  /* ---------- hourly "come back" nudges: one at a time (the previous one is deleted), different words every time ---------- */
  const NUDGE = {
    no_app: ['🔔 Your AI trader is waiting for you, {name}. Tap below to launch it 🚀', '⏳ Your 3 months free is activated but your AI is still off. Launch it now', '👀 {name}, your AI already found setups for today. Open the app to see them', '🔥 People are trading live with their AI right now. Your turn, {name}'],
    no_account: ['⚡ You’re 1 minute away, {name}. Finish your free IQ Option sign-up and your AI switches on', '🔔 New signals are dropping. Connect your account to receive them', '👆 Almost there {name}! Tap below and finish connecting your account'],
    no_deposit: ['🔔 New signal just dropped on Zubabot! Fund your account to take it with your AI', '💰 $20 is enough to switch your AI on, {name}. It’s your own trading money, it stays in your IQ Option account', '🔥 {mentor} goes live soon. Fund now and trade along with him', '👀 Your AI is calling setups right now. Don’t watch from outside, {name}'],
    funded: ['🔔 New signal now! Open the Signal Room and take it', '⚡ {name}, your AI just called a setup. Tap to see it', '📈 Fresh setups are in. Your AI is waiting for you', '🔥 The market is moving, {name}. Open Zubabot and trade with your AI'],
  };
  function nudge(u) { return asU(u.tg_id, () => nudgeU(u)); }
  async function nudgeU(u) {
    const F = settings.get('funnel'); const stg = stageOf(u.tg_id); const n = u.first_name || 'there'; const L = langOf(u.tg_id);
    let text, cta;
    if (stg === 'funded') {                                         // a real open signal beats any template
      const sig = q("SELECT pair, dir, expiry_min, entry_at, ai FROM signals WHERE status='open' AND mode='live' AND step<=1 AND entry_at>? ORDER BY entry_at LIMIT 1").get(now() + 20e3);
      if (sig) { const t = WAT(sig.entry_at); text = (await TA(L, ['🔔 New signal now!', `${sig.pair} · ${sig.dir.toUpperCase()} · ${sig.expiry_min} min`, `Entry ${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')} WAT. Tap to take it 👇`])).join('\n'); cta = {type: 'room', label: '⚡ Take this signal'}; }
    }
    // written fresh by THEIR AI trader, in their language, with a real live signal when there is one
    const FF = funnels.followOf ? funnels.followOf(u.tg_id) : null;
    if (!text && HOOKS.aiWrite && brain.live() && (FF ? FF.style === 'ai' : F.aiNudges !== false)) {
      try {
        const aiKey = (brain.stateOf(u.tg_id) || {}).ai || 'luna';
        const sig = FF && FF.signals === false ? null : q("SELECT pair, dir, expiry_min, entry_at FROM signals WHERE status='open' AND mode='live' AND step<=1 AND entry_at>? ORDER BY entry_at LIMIT 1").get(now() + 60e3);
        const sigTxt = sig ? `You have a REAL live signal right now: ${sig.pair} ${String(sig.dir).toUpperCase()} ${sig.expiry_min} min, entry at ${new Date(sig.entry_at).toISOString().slice(11, 16)} UTC (say the time in their zone if you know it, otherwise "in a few minutes").` : 'There is no open signal this second: talk about the setups you are watching today or the next session, never invent a signal or a price.';
        const goal = {no_app: 'They started the bot but never opened the app. Goal: open the app and switch you on (button below).', no_account: 'They opened the app but did not finish the free 1-minute IQ Option sign-up. Goal: finish it so you can send them signals.',
          no_deposit: 'Signed up but not funded. Goal: fund $20 (their own trading capital, it stays in their own IQ Option account) so they can take your signals. No pressure, one clear reason to do it now.', funded: 'Funded but not trading lately. Goal: check the Signal Room now and take your next trade.'}[stg];
        // one fresh version per hour for each (stage, AI, language, signal): shared by everyone in that group, personalised with {name}. Cheap at any size.
        const fslug = (q('SELECT funnel FROM attrib WHERE tg_id=?').get(String(u.tg_id)) || {}).funnel || 'main';
        const ck = [fslug, stg, aiKey, L, sig ? sig.pair + sig.entry_at : '-', Math.floor(now() / 3600e3)].join('|');
        // in-flight requests are shared too, so people sent at the same moment wait for the same answer
        let pw = NCACHE.get(ck);
        if (!pw) {
          pw = HOOKS.aiWrite(u.tg_id, aiKey, `TELEGRAM NUDGE FROM YOU (their AI trader). It goes to many people at this stage, so write the literal placeholder {name} where their first name goes, and don't mention any personal numbers (deposit, balance, results). ${goal} ${sigTxt} Keep it to 1-2 very short texts, a fresh angle (not like earlier messages), like a real trader texting. No links (a button is added under it).`, () => null, null, {anon: true})
            .then((r) => { if (!r || !r.localized) NCACHE.delete(ck); return r; }, (e) => { NCACHE.delete(ck); throw e; });
          NCACHE.set(ck, pw); if (NCACHE.size > 500) NCACHE.delete(NCACHE.keys().next().value); }
        const w = await pw;
        if (w && w.localized && w.messages && w.messages.length) { const head = L !== 'en' && i18n ? await i18n.tr(L, `${aiName(L, w.ai, w.name)} · your AI trader`) : `${aiName(L, w.ai, w.name)} · your AI trader`;
          text = SW(u.tg_id, head + '\n' + w.messages.slice(0, 2).join('\n').replace(/\{[^{}\n]{1,20}\}/g, n), L).slice(0, 900);   // {name} (or a translated placeholder) -> this person's first name
          cta = sig && stg === 'funded' ? {type: 'room', label: '⚡ Check it now'} : stg === 'no_deposit' ? {type: 'fund', amount: 20} : stg === 'funded' ? {type: 'room', label: '📈 Open the Signal Room'} : {type: 'app', label: F.button}; }
      } catch (e) { console.warn('[bot] ai nudge', e.message); }
    }
    if (!text) { let l = NUDGE[stg]; if (!livesFor(L)) l = l.filter((x) => !x.includes('{mentor}')); const raw = l[(u.nudge_i || 0) % l.length];
      text = SW(u.tg_id, (await T(L, raw.replace(/\{name\}/g, '{name}'))).replace(/\{name\}/g, n).replace(/\{mentor\}/g, MENTOR(L)), L);
      cta = stg === 'no_deposit' ? {type: 'fund', amount: 20} : stg === 'funded' ? {type: 'room', label: '📈 Open the Signal Room'} : {type: 'app', label: F.button}; }
    const run = async () => {
      // delete the previous nudge(s) so the chat stays clean and the newest one is on top
      if (F.deleteOld) for (const mid of JSON.parse(u.nudge_ids || '[]')) { try { await tg('deleteMessage', {chat_id: u.chat_id, message_id: mid}); } catch (e) {} }
      let r; try { r = await tg('sendMessage', {chat_id: u.chat_id, text, reply_markup: swapKb(u.tg_id, await buttons(cta, L), L), disable_web_page_preview: true}); }
      catch (e) { if (/blocked|deactivated|chat not found|kicked|403/i.test(e.message)) q('UPDATE bot_users SET stopped=1 WHERE tg_id=?').run(u.tg_id); throw e; }
      save(u.tg_id, 'ai', text, 'nudge');
      q('UPDATE bot_users SET nudge_at=?, nudge_ids=?, nudge_n=COALESCE(nudge_n,0)+1, nudge_i=COALESCE(nudge_i,0)+1, last_out=? WHERE tg_id=?').run(now(), JSON.stringify([r.message_id]), now(), u.tg_id);
    };
    return CTX.run({bot: u.bot != null ? +u.bot : funnels.botOf(u.tg_id)}, run);
  }
  const NCACHE = new Map();
  const tradedSince = (tgId, since) => { try { return !!q('SELECT 1 FROM trades WHERE tg_id=? AND created_at>=? LIMIT 1').get(String(tgId), since); } catch (e) { return false; } };
  const aiName = (L, key, nm) => { const k = String(key || 'luna'); const base = nm || (k.charAt(0).toUpperCase() + k.slice(1)); try { return i18n && i18n.aiName ? i18n.aiName(L, k, base) : base; } catch (e) { return base; } };
  const quiet = (t) => { const h = WAT(t).getUTCHours(); const [qs, qe] = QH(); return qs > qe ? h >= qs || h < qe : h >= qs && h < qe; };
  let busy = false;
  async function tick() {
    if (!ON() || busy) return; busy = true;
    try {
      const t = now(), d = WAT(t), day = d.toISOString().slice(0, 10), hm = d.getUTCHours() * 60 + d.getUTCMinutes();
      const users = q('SELECT * FROM bot_users WHERE stopped=0 AND human_until<?').all(t); const jobs = [];
      for (const u of users) {
        const st = publicState(u.tg_id) || {}; const dep = st.deposits_total || 0;
        try {
          // deposit landed -> celebrate once
          if (dep > (u.last_dep || 0) + 0.5) { q('UPDATE bot_users SET last_dep=? WHERE tg_id=?').run(dep, u.tg_id); if ((u.last_dep || 0) < C.minDeposit && dep >= C.minDeposit) { jobs.push(() => follow(u, 'funded')); continue; } }
          // live invite ~40 min before each live (max 1 per day, not if we messaged them in the last 5 h) — only languages that have lives
          const UL = langOf(u.tg_id); const rm = LV().remindMin || 40;
          const [live, lday] = asU(u.tg_id, () => { const hmL = localMin(t, UL); return [livesFor(UL) ? LIVES(UL).find((x) => hmL >= x - rm - 2 && hmL < x - rm + 10) : undefined, new Date(t + mentorOf(UL).offset * 3600e3).toISOString().slice(0, 10)]; });
          const engaged = t - (u.last_in || 0) < 14 * 864e5 || (u.fu_step || 0) < STEPS.length;
          if (FOLLOWF() && live !== undefined && u.live_day !== lday && (u.live_n || 0) < (LV().stopAfter || 3) && engaged && t - (u.last_out || 0) > 5 * 3600e3 && t - (u.last_in || 0) > 30 * 60e3) {
            q('UPDATE bot_users SET live_day=?, live_n=COALESCE(live_n,0)+1 WHERE tg_id=?').run(lday, u.tg_id); jobs.push(() => follow(u, 'live', fmtLive(live))); continue; }
          if (!FOLLOWF()) continue; const QT = quiet(t);   // a funnel with its own follow-ups uses its own local hours instead
          // funded, but the IQ Option balance is empty -> top-up nudge (at most every 2 days)
          const us = brain.stateOf(u.tg_id);
          if (!QT && dep >= C.minDeposit && us.balance != null && us.balance < 1 && t - (u.topup_at || 0) > 48 * 3600e3 && t - (u.last_out || 0) > 6 * 3600e3) {
            q('UPDATE bot_users SET topup_at=? WHERE tg_id=?').run(t, u.tg_id); jobs.push(() => follow(u, 'topup')); continue; }
          // not funded -> follow-up sequence
          if (!QT && dep < C.minDeposit && (u.fu_step || 0) < STEPS.length && u.fu_next_at && u.fu_next_at <= t) {
            const step = (u.fu_step || 0) + 1;
            q('UPDATE bot_users SET fu_step=?, fu_next_at=? WHERE tg_id=?').run(step, step < STEPS.length ? t + STEPS[step] : null, u.tg_id);
            jobs.push(() => follow(u, step)); continue;
          }
          // hourly nudge (only in the bot chat; slows to every 6 h after many ignored ones; resets when they open the app or write)
          const F = settings.get('funnel'); const FF = funnels.followOf ? funnels.followOf(u.tg_id) : null;   // this person's funnel can set its own follow-ups
          if (F.nudgeOn !== false && (FF ? FF.on : true) && (FF || !QT) && u.via !== 'biz' && (!FF || FF.stages.includes(stageOf(u.tg_id))) && (!FF || t - (u.started_at || 0) < FF.days * 864e5) && !(stageOf(u.tg_id) === 'funded' && tradedSince(u.tg_id, t - 3 * 3600e3))) {
            const [h1, h2] = String((FF && FF.hours) || F.nudgeHours || '8-22').split('-').map(Number), hh = FF ? Math.floor(asU(u.tg_id, () => localMin(t, langOf(u.tg_id))) / 60) % 24 : d.getUTCHours(); const inHours = h1 <= h2 ? hh >= h1 && hh < h2 : hh >= h1 || hh < h2;
            const opened = (q('SELECT updated_at FROM users WHERE tg_id=?').get(u.tg_id) || {}).updated_at || 0;
            if (opened > (u.nudge_at || 0) || (u.last_in || 0) > (u.nudge_at || 0)) { if (u.nudge_n) q('UPDATE bot_users SET nudge_n=0 WHERE tg_id=?').run(u.tg_id); u.nudge_n = 0; }
            const every = ((u.nudge_n || 0) >= (F.slowAfter || 12) ? 360 : ((FF && FF.every) || F.nudgeEveryMin || 60)) * 60e3;
            if (inHours && t - (u.nudge_at || 0) >= every && t - (u.last_out || 0) > 40 * 60e3 && t - (u.last_in || 0) > 30 * 60e3 && t - (u.started_at || 0) < 45 * 864e5 && t - opened > 20 * 60e3) jobs.push(() => nudge(u));
          }
        } catch (e) { console.warn('[bot] tick', u.tg_id, e.message); }
      }
      // send with 8 at a time (about 15-20 messages a second, under Telegram's 30/s)
      let k = 0; const worker = async () => { while (k < jobs.length) { const j = jobs[k++]; try { await j(); } catch (e) { console.warn('[bot] send', e.message); } } };
      await Promise.all(Array.from({length: Math.min(8, jobs.length)}, worker));
    } finally { busy = false; }
  }

  // updates: long polling (default) or webhook, one per bot
  const ALLOWED = ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'callback_query', 'business_connection', 'business_message', 'edited_business_message', 'chat_join_request'];
  const route = (up, botId = 0) => CTX.run({bot: +botId || 0}, () => { const w = (p) => p.catch((e) => console.warn('[bot] update', e.message));
    if (up.callback_query) return w(onCallback(up.callback_query)); else if (up.business_connection) onBizConnection(up.business_connection); else if (up.business_message) return w(onBizMessage(up.business_message));
    else if (up.chat_join_request) return w(onJoin(up.chat_join_request)); else if (up.message) return w(onMessage(up.message));
    else if (up.channel_post || up.edited_channel_post) return w(watchChat(up.channel_post || up.edited_channel_post, +botId || 0, 'channel'));
    else if (up.edited_message) { const em = up.edited_message; if (em.chat && em.chat.type !== 'private') return w(watchChat(em, +botId || 0)); }
    else if (up.edited_business_message) { const em = up.edited_business_message; const bc = q('SELECT owner_id FROM biz_conn WHERE id=?').get(em.business_connection_id || ''); if (security && bc && String(em.from && em.from.id) === bc.owner_id && (em.text || em.caption)) return w(security.check(em.text || em.caption, {source: 'Telegram Business account (edited)', who: em.from.first_name || '', tgId: String(em.chat.id), canBlock: false})); } });
  const pollers = new Map();          // bot id -> {stop}
  async function poll(b) {
    if (pollers.has(b.id)) return; const me = {stop: false}; pollers.set(b.id, me); let offset = 0;
    try { await tgRaw(b.id, 'deleteWebhook', {}); } catch (e) {}
    while (ON() && !me.stop) {
      try { const ups = await tgRaw(b.id, 'getUpdates', {offset, timeout: 30, allowed_updates: ALLOWED}); for (const up of ups) { offset = up.update_id + 1; route(up, b.id); } }
      catch (e) { if (/401|Unauthorized|404/.test(e.message)) { console.warn('[bot]', b.username || b.id, 'token rejected, stopping'); try { if (b.id) q('UPDATE bots SET error=? WHERE id=?').run('Telegram rejected the token', b.id); } catch (x) {} break; } console.warn('[bot] poll', b.id, e.message); await sleep(3000); }
    }
    pollers.delete(b.id);
  }
  const secretOf = (tok) => crypto.createHash('sha256').update('zb-hook' + tok).digest('hex').slice(0, 32);
  // set up one bot: its welcome screen and commands in its language, then start listening
  async function startBot(b) {
    if (!b || !b.token) return; const L = b.lang || 'en';
    if (!b.username) { try { const me = await tgRaw(b.id, 'getMe', {}); b.username = me.username; if (b.main) funnels.mainBot.username = me.username; else q('UPDATE bots SET username=? WHERE id=?').run(me.username, b.id); } catch (e) {} }
    try { const F = settings.get('funnel'); await tgRaw(b.id, 'setMyDescription', {description: String(await T(L, F.description)).slice(0, 512)}); await tgRaw(b.id, 'setMyShortDescription', {short_description: String(await T(L, F.short)).slice(0, 120)}); } catch (e) {}
    try { const cmds = [['start', 'Start Zubabot'], ...(livesFor(L) ? [['live', q("SELECT 1 FROM funnels WHERE bot=? AND mentor LIKE '%\"on\":true%' LIMIT 1").get(+b.id || 0) ? 'Next live' : 'Next live with ' + MENTOR(L)]] : []), ['fund', 'How to fund'], ['invite', 'Invite friends, earn coins'], ['stop', 'Stop reminders']];
      await tgRaw(b.id, 'setMyCommands', {commands: await Promise.all(cmds.map(async ([c, d]) => ({command: c, description: String(await T(L, d)).slice(0, 256)})))}); } catch (e) {}
    try { await tgRaw(b.id, 'setChatMenuButton', {menu_button: {type: 'web_app', text: String(await T(L, 'Open')).slice(0, 16), web_app: {url: appUrl(L)}}}); } catch (e) {}
    if ((env.SUPPORT_MODE || 'polling') === 'webhook' && env.PUBLIC_URL) { try { await tgRaw(b.id, 'setWebhook', {url: env.PUBLIC_URL.replace(/\/$/, '') + '/api/tg/hook?b=' + b.id, secret_token: secretOf(b.token), allowed_updates: ALLOWED}); console.log('[bot] webhook set for', b.username || b.id); return; } catch (e) { console.warn('[bot] setWebhook failed, using polling:', e.message); } }
    poll(b);
  }
  funnels.hooks.startBot = startBot; funnels.hooks.stopBot = (id) => { const p = pollers.get(+id); if (p) p.stop = true; };
  const hook = async (req, b, u, url) => { const id = +(url && url.searchParams.get('b')) || 0; const bt = funnels.bot(id); if (!bt || !bt.token || (req.headers['x-telegram-bot-api-secret-token'] || '') !== secretOf(bt.token)) return [403, {ok: false}]; route(b, id); return {ok: true}; };
  const routes = {
    'POST /api/tg/webhook': hook, 'POST /api/tg/hook': hook,
    'GET /api/admin/bot': async () => ({ok: true, on: ON(), bots: funnels.bots().length, users: q('SELECT COUNT(*) n, SUM(stopped) stopped FROM bot_users').get(), steps: q('SELECT fu_step, COUNT(*) n FROM bot_users GROUP BY fu_step').all(), recent: q('SELECT * FROM bot_msgs ORDER BY id DESC LIMIT 100').all()}),
    'POST /api/admin/bot/send': async (req, b, x, url, who) => { const u = user(b.tg_id); if (!u) return [404, {ok: false}]; const text = String(b.text || '').slice(0, 1000); const cta = safeCta(b.cta || null);
      if (security) { const g = await security.check(text + (cta && cta.label ? '\n' + cta.label : ''), {source: 'teammate message (bot)', who: who ? who.name : '', tgId: u.tg_id}); if (!g.ok) return [400, {ok: false, error: 'Not sent: blocked for security review (#' + g.id + ')'}]; }
      await sendTexts(u.tg_id, u.chat_id, [text], cta, false, {role: 'human', who: who ? who.name : null, checked: true}); return {ok: true}; },
  };
  async function start() {
    if (!ON()) return console.log('[bot] support assistant off (no bot token or SUPPORT_BOT=off)');
    for (const b of funnels.bots()) startBot(b).catch((e) => console.warn('[bot] start', b.id, e.message));
    setInterval(() => tick().catch((e) => console.warn('[bot] tick', e.message)), 60e3);
    setInterval(() => inbox.tick().catch((e) => console.warn('[inbox] tick', e.message)), 60e3);
    setInterval(() => backTick().catch((e) => console.warn('[bot] back', e.message)), 60e3);
    setInterval(() => joinTick().catch((e) => console.warn('[bot] join', e.message)), 5e3);
    console.log('[bot] support assistant on,', funnels.bots().length, 'bot(s)');
  }
  // the in-app support chat hands hard cases to the same team
  async function handoffFromApp(tgUser, text, why = 'asked for a human in the app', fromAi = false) {
    if (!inbox.humansAvailable()) return false;
    q(`INSERT INTO bot_users(tg_id,chat_id,first_name,username,started_at,last_in,fu_step,fu_next_at,bot) VALUES(?,?,?,?,?,?,0,NULL,?) ON CONFLICT(tg_id) DO NOTHING`).run(String(tgUser.id), String(tgUser.id), tgUser.first_name || '', tgUser.username || '', now(), now(), +tgUser.bot || 0);
    await inbox.requestHuman(String(tgUser.id), {reason: why, text, channel: 'app', notifyUser: !fromAi}); return true;
  }
  /* ---------- bring people back from IQ Option's website ----------
     registered: Affstore says their account was created -> "it's ready, tap to come back" (once, right away)
     pending: they opened the sign-up 10+ min ago and still aren't connected -> "still there? tap to come back" (once) */
  async function comeBack(tgId, kind) {
    if (!ON()) return false; const u = user(tgId); if (!u || u.stopped) return false; const n = u.first_name || 'there';
    if (kind === 'registered') { if (u.back_reg) return false; q('UPDATE bot_users SET back_reg=1, back_pend=1 WHERE tg_id=?').run(String(tgId));
      return notify(String(tgId), [`🎉 ${n}, your IQ Option account is ready and connected to Zubabot!`, 'Tap below to come back and switch on your AI. Your 3 months free is waiting 👇'], {type: 'app', label: '🚀 Back to Zubabot'}); }
    if (u.back_pend) return false; q('UPDATE bot_users SET back_pend=1 WHERE tg_id=?').run(String(tgId));
    return notify(String(tgId), [`${n}, still on IQ Option? 👀`, 'Once you’ve signed up (or if you got stuck), tap below to come back. Zubabot finds your account by itself, nothing to copy.'], {type: 'app', label: '🔙 Come back to Zubabot'});
  }
  async function backTick() {
    const rows = q(`SELECT DISTINCT o.tg_id FROM oauth_states o JOIN bot_users b ON b.tg_id=o.tg_id LEFT JOIN users u ON u.tg_id=o.tg_id
      WHERE o.kind='new' AND o.created_at BETWEEN ? AND ? AND COALESCE(b.back_pend,0)=0 AND COALESCE(u.linked,0)=0 AND b.stopped=0`).all(now() - 3 * 3600e3, now() - 10 * 60e3);
    for (const r of rows) { try { await comeBack(r.tg_id, 'pending'); } catch (e) {} }
  }
  // one-off message to a user (friend joined, friend funded...) through their own bot, in their language.
  async function notify(tgId, texts, cta, meta = {}) {
    if (!ON()) return false; const u = user(tgId); if (u && u.stopped) return false; if ((q('SELECT blocked FROM users WHERE tg_id=?').get(String(tgId)) || {}).blocked) return false;
    try { await CTX.run({bot: u && u.bot != null ? +u.bot : funnels.botOf(tgId)}, () => sendTexts(String(tgId), u ? u.chat_id : String(tgId), texts, cta, true, meta)); return true; } catch (e) { if (/blocked|deactivated|chat not found|kicked|403/i.test(e.message)) q('UPDATE bot_users SET stopped=1 WHERE tg_id=?').run(String(tgId)); return false; }
  }
  const applyDescription = async () => { for (const b of funnels.bots()) { const L = b.lang || 'en'; const F = settings.get('funnel'); try { await tgRaw(b.id, 'setMyDescription', {description: String(await T(L, F.description)).slice(0, 512)}); await tgRaw(b.id, 'setMyShortDescription', {short_description: String(await T(L, F.short)).slice(0, 120)}); } catch (e) {} } };
  return {hooks: HOOKS, safeCta, routes, start, tick, joinTick, runFlow: (id, chat, flow, name, lang) => CTX.run({bot: funnels.botOf(id)}, () => runFlow(id, chat, flow, name, lang)), comeBack, backTick, flowButtons, onMessage, onCallback, onBizMessage, onBizConnection, nudge, stageOf, applyDescription, follow, handoffFromApp, notify, sendTexts, route, startBot, team: !!TEAM, _TEMPLATES: TEMPLATES};
}
