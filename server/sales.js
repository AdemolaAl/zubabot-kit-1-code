// Sales engine: the AI traders (and support) message users at the right moment, like a good account manager would.
// Each message goes to the app (a preview pops in at the top + the bell) AND to Telegram (a normal phone notification).
//
// Moments (each can be switched off / tuned in Admin -> Sales engine):
//   streak    3 and 5 wins in a row      -> your AI celebrates and shows what the next level gives (deposit = their own trading capital)
//   bigday    a strong day (+30% of what they deposited)
//   near      close to the next level (e.g. $80 of $100: "just $20 from voice calls")
//   idle      funded but no trade for 2 days -> their AI checks in with what it's watching
//   tease     a stronger (locked) AI had a great day -> it introduces itself
//   topup     balance at $0 after funding (the Telegram assistant also does this)
//   care      a big loss (or 3 losses in a row): ~30 min later one AI checks on them like a friend. Calm, honest, teaches risk,
//             "we'll take the next clean one together". NEVER asks for a deposit, never promises to win it back.
//   chance    an active trader, a market session about to open: their AI says it's watching a setup and invites them in
// Natural, not pushy: max per day and per week, and after 3 messages in a row they ignored, the AIs go quiet for a week.
// Never after a loss streak, never during quiet hours, never after /stop, at most N per person per day. No promises of profit.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const LEVELS = [
  {min: 20, n: 'Starter', gives: 'signals from your AI and bonus coins'},
  {min: 50, n: 'Trade with AI', gives: 'your AI trades the setups with you'},
  {min: 100, n: 'Standard', gives: 'voice calls with your AI, tokens and the voice AIs'},
  {min: 500, n: 'Advanced', gives: 'the Advanced AIs (Kai, Teo and more) and +30% bonus coins'},
  {min: 1000, n: 'Pro', gives: 'every Pro AI, premium voice and the Pro badge'},
  {min: 2000, n: 'MAX', gives: 'every AI, premium voice and the VIP live room'},
];
export const nextLevel = (dep) => LEVELS.find((l) => l.min > (+dep || 0)) || null;

export function makeSales({db, q, now, C, settings, brain, publicState, team, getBot, inbox, i18n, funnels}) {
  db.exec(`CREATE TABLE IF NOT EXISTS app_msgs(id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id TEXT, sender TEXT, ai TEXT, who TEXT, text TEXT, cta TEXT, kind TEXT, ref TEXT, at INTEGER, read_at INTEGER, opened_at INTEGER, tg_sent INTEGER DEFAULT 0);
    CREATE UNIQUE INDEX IF NOT EXISTS app_msgs_ref ON app_msgs(tg_id, ref);
    CREATE INDEX IF NOT EXISTS app_msgs_u ON app_msgs(tg_id, id);`);
  if (!q('PRAGMA table_info(user_state)').all().some((c) => c.name === 'ai')) db.exec('ALTER TABLE user_state ADD COLUMN ai TEXT');
  const S = () => settings.get('sales');
  const WAT = (t) => new Date(t + 3600e3);
  const dayKey = (t = now()) => WAT(t).toISOString().slice(0, 10);
  const dayStart = () => { const d = WAT(now()); d.setUTCHours(0, 0, 0, 0); return d.getTime() - 3600e3; };
  const quiet = () => { const [a, b] = String(settings.get('followups').quiet || '22-8').split('-').map(Number); const h = WAT(now()).getUTCHours(); return a > b ? h >= a || h < b : h >= a && h < b; };
  // the AI traders list comes from the app build (knowledge/auto/app-facts.json)
  let AIS = {}, aisAt = 0;
  const ais = () => { if (now() - aisAt < 600e3) return AIS; aisAt = now(); try { const f = path.join(path.dirname(fileURLToPath(import.meta.url)), 'knowledge', 'auto', 'app-facts.json');
    AIS = Object.fromEntries((JSON.parse(fs.readFileSync(f, 'utf8')).ais || []).map((a) => [a.key, a])); } catch (e) {} return AIS; };
  const aiOf = (k) => ais()[k] || ais().luna || {key: k || 'luna', name: 'Zara', style: 'Swing', desc: ''};
  const mainAi = (tgId) => { const s = q('SELECT ai FROM user_state WHERE tg_id=?').get(String(tgId)); if (s && s.ai) return s.ai;
    const t = q('SELECT s.ai FROM trades t JOIN signals s ON s.id=t.sig_id WHERE t.tg_id=? AND s.ai IS NOT NULL ORDER BY t.id DESC LIMIT 1').get(String(tgId)); return (t && t.ai) || 'luna'; };
  const sentToday = (tgId) => q("SELECT COUNT(*) n FROM app_msgs WHERE tg_id=? AND kind LIKE 'sales:%' AND at>=?").get(String(tgId), dayStart()).n;
  const lastOf = (tgId, kind) => (q('SELECT MAX(at) t FROM app_msgs WHERE tg_id=? AND kind=?').get(String(tgId), kind) || {}).t || 0;
  const blocked = (tgId) => { const u = q('SELECT blocked FROM users WHERE tg_id=?').get(String(tgId)) || {}; const b = q('SELECT stopped FROM bot_users WHERE tg_id=?').get(String(tgId)) || {}; return !!(u.blocked || b.stopped); };

  // deliver one message: app inbox (+preview) and Telegram. Returns true if saved.
  async function deliver(tgId, {sender = 'ai', ai = null, who = null, texts, cta = null, kind, ref, localized = false}) {
    // in the person's language: AI-written messages already are; templates get translated
    const L = funnels ? funnels.langOf(tgId) : 'en';
    if (L !== 'en' && !localized && i18n) texts = await i18n.trAll(L, texts);
    const text = texts.join('\n'); if (!text.trim()) return false;
    const r = q('INSERT OR IGNORE INTO app_msgs(tg_id,sender,ai,who,text,cta,kind,ref,at) VALUES(?,?,?,?,?,?,?,?,?)').run(String(tgId), sender, ai, who, text, cta ? JSON.stringify(cta) : null, kind, ref, now());
    if (!r.changes) return false;
    const id = Number(r.lastInsertRowid);
    if (sender === 'ai') {
      const a = aiOf(ai); const bot = getBot && getBot(); const nm = L !== 'en' && i18n ? i18n.aiName(L, a.key, a.name) : a.name;
      const head = L !== 'en' && i18n ? await i18n.tr(L, `${a.name} · your AI trader 💬`) : `${a.name} · your AI trader 💬`;
      if (bot) { const ok = await bot.notify(String(tgId), [head, ...texts], cta && cta.type ? cta : {path: `?go=ai&k=${encodeURIComponent(ai || 'luna')}`, label: `💬 Reply to ${nm}`}, {localized: true});
        if (ok) q('UPDATE app_msgs SET tg_sent=1 WHERE id=?').run(id); }
    }
    return true;
  }

  // how a real person texts: short, their first name, never the same opening twice. One of these per message, so messages never look templated.
  const OPENERS = ['start with their first name and a quick hello', 'start straight with what you noticed, no greeting', 'start with a short question', 'start with one or two lowercase words like a quick text ("yo", "hey you", "ok so")', 'mention the time of day or the session first', 'start with a tiny reaction ("ahh", "honestly", "not gonna lie")'];
  const HUMAN = () => `Write 2 short texts separated by ||, like you're texting a friend from your phone: ${OPENERS[Math.floor(Math.random() * OPENERS.length)]}. Plain words, short sentences, at most one emoji, no hype, no lists, no "Dear", no corporate phrases, no exclamation marks in a row. Never repeat a line you've sent before. It must not read like an ad.`;
  // ask the AI to write it (with the person's real numbers); templates if the AI is off
  async function write(tgId, aiKey, task, fallback, cta, opts = {}) {
    const a = aiOf(aiKey); let out = null;
    if (brain.live()) { try { out = await brain.reply({tgId: String(tgId), kind: 'ai', profile: {key: a.key, name: a.name, style: a.style, desc: a.desc, tf: '', markets: a.market || '', owned: true, voice: a.vibe},
      ctx: {screen: 'proactive message'}, history: [], text: '(no new message from the user: write the proactive message described in TASK)', channel: 'app', area: 'followups', anon: !!opts.anon,
      task: task + ' ' + HUMAN() + ' Never promise profit or say they can’t lose. When you mention a deposit, say it’s their own trading capital that stays in their IQ Option account.'}); } catch (e) { out = null; } }
    const ok = !!(out && !out.blocked && out.messages && out.messages.length); const msgs = ok ? out.messages.slice(0, 3) : fallback(a);
    let c = cta; if (out && out.cta && out.cta.type === 'fund' && cta && cta.type === 'fund') c = {type: 'fund', amount: cta.amount};      // the amount is ours, not the AI's
    else if (out && out.cta && !cta) c = out.cta;
    return {messages: msgs, cta: c, ai: a.key, name: a.name, localized: ok};
  }

  const allowed = (tgId, kind, gapH) => { const s = S(); if (!s.on || !s[kind] || !s[kind].on) return false; if (blocked(tgId) || quiet()) return false;
    if (inbox && inbox.open(tgId)) return false;                                     // a teammate is handling them
    if (sentToday(tgId) >= (s.maxPerDay || 2)) return false;
    if (q("SELECT COUNT(*) n FROM app_msgs WHERE tg_id=? AND kind LIKE 'sales:%' AND at>=?").get(String(tgId), now() - 7 * 864e5).n >= (s.maxPerWeek || 5)) return false;
    if (kind !== 'care' && ignored(tgId)) return false;                              // they stopped reading us: quiet for a week
    return now() - lastOf(tgId, 'sales:' + kind) > (gapH || 20) * 3600e3; };
  // the last N proactive messages were never opened and they haven't come back since -> leave them alone for 7 days
  const ignored = (tgId) => { const n = S().backoffAfter || 3; const l = q("SELECT at, opened_at, read_at FROM app_msgs WHERE tg_id=? AND kind LIKE 'sales:%' ORDER BY id DESC LIMIT ?").all(String(tgId), n);
    if (l.length < n || l.some((m) => m.opened_at || m.read_at)) return false; const seen = (q('SELECT updated_at FROM users WHERE tg_id=?').get(String(tgId)) || {}).updated_at || 0;
    const wrote = (q("SELECT MAX(at) t FROM bot_msgs WHERE tg_id=? AND role='user'").get(String(tgId)) || {}).t || 0;
    return Math.max(seen, wrote) < l[l.length - 1].at && now() - l[0].at < 7 * 864e5; };
  // another AI they can trade with (for the care check-in, sometimes it's a different AI who reaches out)
  const otherAi = (tgId, dep, not) => { const l = Object.values(ais()).filter((a) => a.key !== not && (+a.min || 0) <= dep && a.key); return l.length ? l[Math.floor(Math.random() * l.length)].key : not; };

  /* ---------- moments ---------- */
  function closedTrades(tgId, n = 12) { return q("SELECT id, status, profit, amount, created_at FROM trades WHERE tg_id=? AND status IN ('win','loss') ORDER BY id DESC LIMIT ?").all(String(tgId), n); }
  async function onResult(tgId) {
    tgId = String(tgId); if (lastOf(tgId, 'sales:care') > now() - 24 * 3600e3) return null;      // a loss check-in today: no selling
    const st = publicState(tgId) || {}; const dep = st.deposits_total || 0; if (dep < C.minDeposit) return null;
    const t = closedTrades(tgId); if (!t.length || t[0].status !== 'win') return null;
    let streak = 0; for (const x of t) { if (x.status === 'win') streak++; else break; }
    const s = S(); const nx = nextLevel(dep); const ai = mainAi(tgId);
    const marks = (s.streak.at || [3, 5]).filter((m) => streak === m);
    if (marks.length && allowed(tgId, 'streak', s.streak.gapH || 12)) {
      const won = t.slice(0, streak).reduce((a, x) => a + (+x.profit || 0), 0);
      const add = nx ? Math.max(10, nx.min - dep) : Math.max(50, Math.round(dep / 2 / 10) * 10);
      const cta = {type: 'fund', amount: add};
      const task = `WIN STREAK: they just won ${streak} trades in a row with you (+$${won.toFixed(2)} on those trades). Their deposits so far: $${dep}. Celebrate with them first, genuinely. `
        + (nx ? `Then show what the next level gives: adding $${add} takes them to ${nx.n} ($${nx.min}): ${nx.gives}. Bigger capital also means each trade can be bigger while all the gale steps still fit.` : `They're at the top level; suggest adding capital so each trade can be bigger while the gale steps still fit.`)
        + ` End with [CTA:fund:${add}].`;
      const m = await write(tgId, ai, task, (a) => [`${streak} wins back to back 🔥 that’s how we do it!`, nx ? `Add $${add} and you’re in ${nx.n}: ${nx.gives}. It’s your own trading money, it stays in your IQ Option account.` : `Want to size up? More capital means bigger trades with all the gale steps covered.`], cta);
      await deliver(tgId, {ai: m.ai, localized: m.localized, texts: m.messages, cta: m.cta, kind: 'sales:streak', ref: `streak${streak}:${t[0].id}`}); return 'streak';
    }
    // strong day: today's profit >= X% of what they deposited
    const today = q("SELECT COALESCE(SUM(profit),0) p, COUNT(*) n FROM trades WHERE tg_id=? AND status IN ('win','loss') AND created_at>=?").get(tgId, dayStart());
    if (s.bigday.on && today.p >= dep * (s.bigday.pct || 30) / 100 && today.p > 5 && allowed(tgId, 'bigday', 20)) {
      const add = nx ? Math.max(10, nx.min - dep) : 100; const cta = {type: 'fund', amount: add};
      const m = await write(tgId, ai, `GREAT DAY: they're up $${today.p.toFixed(2)} today over ${today.n} trades, on $${dep} deposited. Celebrate, then suggest growing their trading capital: adding $${add}${nx ? ` reaches ${nx.n} ($${nx.min}): ${nx.gives}` : ''}. End with [CTA:fund:${add}].`,
        (a) => [`What a day! You’re up $${today.p.toFixed(2)} today 🙌`, nx ? `Add $${add} to reach ${nx.n}: ${nx.gives}. Your own capital, in your own IQ Option account.` : 'Ready to size up for tomorrow?'], cta);
      await deliver(tgId, {ai: m.ai, localized: m.localized, texts: m.messages, cta: m.cta, kind: 'sales:bigday', ref: 'bigday:' + dayKey()}); return 'bigday';
    }
    return null;
  }

  /* ---------- care: someone just took a big loss ---------- */
  async function care(u) {
    const s = S(); const c = s.care || {}; if (!c.on) return false;
    const t = closedTrades(u.tg_id, 8); if (!t.length || t[0].status !== 'loss') return false;
    const lastAt = Math.max(...q("SELECT COALESCE(closed_at, created_at) x FROM trades WHERE tg_id=? AND status IN ('win','loss') ORDER BY id DESC LIMIT 1").all(u.tg_id).map((r) => r.x));
    if (now() - lastAt < (c.waitMin || 25) * 60e3 || now() - lastAt > 12 * 3600e3) return false;      // let it breathe first; old news after 12 h
    if (q("SELECT 1 FROM trades WHERE tg_id=? AND status='open' LIMIT 1").get(u.tg_id)) return false;   // they're trading again right now
    const day = q("SELECT COALESCE(SUM(profit),0) p, SUM(CASE WHEN status='loss' THEN 1 ELSE 0 END) l, COUNT(*) n FROM trades WHERE tg_id=? AND status IN ('win','loss') AND created_at>=?").get(u.tg_id, now() - 24 * 3600e3);
    let row = 0; for (const x of t) { if (x.status === 'loss') row++; else break; }
    const down = -(+day.p || 0); const big = down >= Math.max(c.lossUsd || 25, u.dep * (c.lossPct || 25) / 100) || row >= (c.inRow || 3);
    if (!big || !allowed(u.tg_id, 'care', (c.gapDays || 3) * 24)) return false;
    const mine = mainAi(u.tg_id); const who = Math.random() < 0.5 ? mine : otherAi(u.tg_id, u.dep, mine); const other = who !== mine;
    const name = (q('SELECT first_name FROM users WHERE tg_id=?').get(u.tg_id) || {}).first_name || '';
    const task = `CHECK ON THEM AFTER A LOSS: in the last 24 h they're down $${down.toFixed(2)} (${day.l} losing trades of ${day.n}${row >= 2 ? ', the last ' + row + ' in a row' : ''}). Balance now: ${u.balance == null ? 'unknown' : '$' + (+u.balance).toFixed(2)}.`
      + (other ? ` You are NOT the AI they usually trade with (that's ${aiOf(mine).name}); you noticed and wanted to check on them yourself.` : '')
      + ` Be a human first: ask how they're doing, say losses like this happen to every trader and it's okay to step away for a bit. Then ONE simple tip in your own words (smaller amount per trade, fewer gale steps, or waiting for a cleaner setup instead of chasing). `
      + `End with something like: you'll look for a clean setup and you can take the next one together when they're ready. Don't ask for a deposit, don't say "win it back", don't promise anything. ${name ? 'Use their name (' + name + ') once.' : ''} No CTA.`;
    const m = await write(u.tg_id, who, task, (a) => [`${name ? name + ', ' : ''}just checking on you. Today was rough, happens to every trader.`, 'Take a breather. I’ll look for a clean setup and we take the next one together when you’re ready.'], null);
    return deliver(u.tg_id, {ai: m.ai, localized: m.localized, texts: m.messages, cta: {type: 'app', path: `?go=ai&k=${encodeURIComponent(m.ai)}`, label: `💬 Reply to ${aiOf(m.ai).name}`}, kind: 'sales:care', ref: 'care:' + dayKey()});
  }
  /* ---------- chance: a session is about to open and they're an active trader ---------- */
  const SESSIONS = [{n: 'London', h: 8, pairs: 'EUR/USD, GBP/USD'}, {n: 'New York', h: 13, pairs: 'EUR/USD, USD/JPY and gold'}, {n: 'Tokyo', h: 0, pairs: 'USD/JPY, AUD/USD'}];
  async function chance(u, ai) {
    const c = S().chance || {}; if (!c.on || (u.balance != null && u.balance < 1)) return false;
    const last = (q("SELECT MAX(created_at) t FROM trades WHERE tg_id=? AND status<>'failed'").get(u.tg_id) || {}).t || 0;
    if (!last || now() - last > 7 * 864e5 || now() - last < 6 * 3600e3) return false;            // traded this week, but not in the last hours
    const d = new Date(now()); const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
    const ses = SESSIONS.find((x) => { const m = x.h * 60 - mins; return m >= 5 && m <= 25; }); if (!ses) return false;
    const recent = closedTrades(u.tg_id, 3); if (recent.length && recent[0].status === 'loss' && lastOf(u.tg_id, 'sales:care') < now() - 48 * 3600e3 && recent.filter((x) => x.status === 'loss').length >= 2) return false;
    if (!allowed(u.tg_id, 'chance', (c.gapDays || 2) * 24)) return false;
    const name = (q('SELECT first_name FROM users WHERE tg_id=?').get(u.tg_id) || {}).first_name || '';
    const m = await write(u.tg_id, ai, `A SESSION IS OPENING: the ${ses.n} session opens in about ${ses.h * 60 - mins} minutes. You're getting ready and watching ${ses.pairs} for a clean setup in your style. Tell ${name || 'them'} personally (use the name), like you thought of them: you found a good window and want to take it together. Invite them to the Signal Room. No deposit talk. End with [CTA:signal].`,
      (a) => [`${name ? name + ', ' : ''}${ses.n} opens soon and I’m watching ${ses.pairs}.`, 'If a clean one shows up I’ll call it in the Signal Room. Want to take it together?'], {type: 'signal'});
    return deliver(u.tg_id, {ai: m.ai, localized: m.localized, texts: m.messages, cta: m.cta || {type: 'signal'}, kind: 'sales:chance', ref: `chance:${ses.n}:${dayKey()}`});
  }

  let ticking = false;
  async function tick() {
    const s = S(); if (!s.on || quiet() || ticking) return 0; let n = 0; ticking = true;
    try {
    const users = q(`SELECT u.tg_id, COALESCE(a.deposits_total,0) dep, st.balance FROM users u JOIN bot_users b ON b.tg_id=u.tg_id LEFT JOIN aff_accounts a ON a.iq_user_id=u.iq_user_id LEFT JOIN user_state st ON st.tg_id=u.tg_id
      WHERE b.stopped=0 AND COALESCE(u.blocked,0)=0 AND COALESCE(a.deposits_total,0)>=? LIMIT 5000`).all(C.minDeposit);
    for (const u of users) {
      try {
        const nx = nextLevel(u.dep); const ai = mainAi(u.tg_id);
        // a big loss: check on them first, before anything else (and nothing else that day)
        if (await care(u)) { n++; continue; }
        if (await chance(u, ai)) { n++; continue; }
        if (lastOf(u.tg_id, 'sales:care') > now() - 24 * 3600e3) continue;          // no selling for a day after a loss check-in
        // close to the next level
        if (s.near.on && nx && u.dep >= nx.min * (1 - (s.near.pct || 30) / 100) && allowed(u.tg_id, 'near', (s.near.gapDays || 5) * 24)) {
          const add = Math.max(5, Math.round((nx.min - u.dep) * 100) / 100);
          const m = await write(u.tg_id, ai, `NEARLY THERE: they've deposited $${u.dep}, just $${add} from ${nx.n} ($${nx.min}): ${nx.gives}. Make it feel exciting and easy. End with [CTA:fund:${Math.ceil(add)}].`,
            () => [`You’re just $${add} away from ${nx.n} 👀`, `That unlocks ${nx.gives}. Same IQ Option account, your own money.`], {type: 'fund', amount: Math.ceil(add)});
          if (await deliver(u.tg_id, {ai: m.ai, localized: m.localized, texts: m.messages, cta: m.cta, kind: 'sales:near', ref: `near${nx.min}:${dayKey()}`})) n++; continue;
        }
        // funded but quiet for 2 days
        const last = (q("SELECT MAX(created_at) t FROM trades WHERE tg_id=? AND status<>'failed'").get(u.tg_id) || {}).t || 0;
        if (s.idle.on && (u.balance == null || u.balance >= 1) && now() - last > (s.idle.days || 2) * 864e5 && allowed(u.tg_id, 'idle', (s.idle.gapDays || 3) * 24)) {
          const m = await write(u.tg_id, ai, `CHECK-IN: they haven't traded for ${last ? Math.floor((now() - last) / 864e5) + ' days' : 'a while'}. Tell them what you're watching right now and invite them back to the Signal Room for your next setup. No deposit ask. End with [CTA:signal].`,
            (a) => [`Hey! ${a.name} here 👋 I’ve got a setup brewing.`, 'Come back to the Signal Room and let’s take the next one together.'], null);
          if (await deliver(u.tg_id, {ai: m.ai, localized: m.localized, texts: m.messages, cta: m.cta || {type: 'signal'}, kind: 'sales:idle', ref: 'idle:' + dayKey()})) n++; continue;
        }
        // a stronger AI they haven't unlocked had a great day
        if (s.tease.on && allowed(u.tg_id, 'tease', (s.tease.gapDays || 4) * 24)) {
          const best = q(`SELECT ai, SUM(CASE WHEN status='win' THEN 1 ELSE 0 END) w, COUNT(*) c FROM signals WHERE mode='live' AND ai IS NOT NULL AND status IN ('win','loss') AND created_at>=? AND (step IS NULL OR step<=1) GROUP BY ai HAVING w>=3 ORDER BY w*1.0/c DESC, w DESC LIMIT 5`).all(dayStart());
          const pick = best.map((b) => ({...b, a: ais()[b.ai]})).find((b) => b.a && b.a.min > u.dep);
          if (pick) { const add = Math.max(10, pick.a.min - u.dep);
            const m = await write(u.tg_id, pick.ai, `INTRODUCE YOURSELF: you are a stronger AI they haven't unlocked yet. Today you called ${pick.w} wins out of ${pick.c} live signals (real numbers, you may say them). Introduce your style in one line and say you're in the $${pick.a.min}+ level; adding $${add} gets them there. End with [CTA:fund:${add}].`,
              (a) => [`Hi! I’m ${a.name} 👋 ${pick.w} wins from ${pick.c} calls today.`, `I’m in the $${pick.a.min}+ level. Add $${add} and I’ll trade with you too.`], {type: 'fund', amount: add});
            if (await deliver(u.tg_id, {ai: m.ai, localized: m.localized, texts: m.messages, cta: m.cta, kind: 'sales:tease', ref: `tease:${pick.ai}:${dayKey()}`})) n++; }
        }
      } catch (e) { console.warn('[sales]', u.tg_id, e.message); }
    }
    return n;
    } finally { ticking = false; }
  }

  const routes = {
    // the app: new messages for the preview + bell
    'GET /api/app/inbox': async (req, b, u, url) => {
      if (!u) return [401, {ok: false, error: 'telegram_auth'}];
      const after = +url.searchParams.get('after') || 0;
      const msgs = q('SELECT id, sender, ai, who, text, cta, kind, at, read_at FROM app_msgs WHERE tg_id=? AND id>? ORDER BY id DESC LIMIT 30').all(String(u.id), after).reverse()
        .map((m) => ({...m, cta: m.cta ? JSON.parse(m.cta) : null}));
      return {ok: true, msgs, unread: q('SELECT COUNT(*) n FROM app_msgs WHERE tg_id=? AND read_at IS NULL').get(String(u.id)).n};
    },
    'POST /api/app/inbox/read': async (req, b, u) => {
      if (!u) return [401, {ok: false}]; const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean).slice(0, 100);
      for (const id of ids) q(`UPDATE app_msgs SET read_at=COALESCE(read_at,?)${b.opened ? ', opened_at=COALESCE(opened_at,?)' : ''} WHERE id=? AND tg_id=?`).run(...(b.opened ? [now(), now()] : [now()]), id, String(u.id));
      return {ok: true};
    },
    'GET /api/admin/sales': async (req, b, u, url) => {
      const days = Math.min(+url.searchParams.get('days') || 14, 90), from = now() - days * 864e5;
      const rows = q(`SELECT m.kind, COUNT(*) sent, SUM(CASE WHEN m.opened_at IS NOT NULL THEN 1 ELSE 0 END) opened, SUM(m.tg_sent) tg,
          SUM(CASE WHEN EXISTS(SELECT 1 FROM users x JOIN events e ON e.iq_user_id=x.iq_user_id WHERE x.tg_id=m.tg_id AND e.type IN ('ftd','deposit') AND e.created_at BETWEEN m.at AND m.at+172800000) THEN 1 ELSE 0 END) deposited,
          COALESCE(SUM((SELECT SUM(e.amount) FROM users x JOIN events e ON e.iq_user_id=x.iq_user_id WHERE x.tg_id=m.tg_id AND e.type IN ('ftd','deposit') AND e.created_at BETWEEN m.at AND m.at+172800000)),0) usd
        FROM app_msgs m WHERE m.at>=? AND m.kind LIKE 'sales:%' GROUP BY m.kind ORDER BY sent DESC`).all(from);
      return {ok: true, settings: S(), stats: rows, levels: LEVELS,
        recent: q("SELECT m.*, u.first_name FROM app_msgs m LEFT JOIN users u ON u.tg_id=m.tg_id WHERE m.kind LIKE 'sales:%' ORDER BY m.id DESC LIMIT 40").all()};
    },
    'POST /api/admin/sales': async (req, b, u, url, who) => ({ok: true, settings: settings.set('sales', b.settings || {}, who.name)}),
    'POST /api/admin/sales/run': async () => ({ok: true, sent: await tick()}),
  };
  return {routes, onResult, tick, deliver, write, nextLevel, care, chance, ignored};
}
