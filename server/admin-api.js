// Admin: overview + setup check, members (search, profile, coins/tokens, block, fix IQ ID, stop reminders, message),
// broadcasts by segment, lives settings, general settings.
export function makeAdminApi({db, q, now, C, settings, team, engine, getBot, publicState, creditRewards, i18n, security}) {
  const env = process.env;
  const addCol = (t, c, ty) => { if (!q(`PRAGMA table_info(${t})`).all().some((x) => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${ty}`); };
  addCol('users', 'blocked', 'INTEGER DEFAULT 0'); addCol('users', 'note', 'TEXT');
  db.exec(`CREATE TABLE IF NOT EXISTS wallet_ledger(id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id TEXT, coins INTEGER, tokens INTEGER, note TEXT, by TEXT, at INTEGER);
    CREATE TABLE IF NOT EXISTS broadcasts(id INTEGER PRIMARY KEY AUTOINCREMENT, by TEXT, segment TEXT, text TEXT, cta TEXT, total INTEGER DEFAULT 0, sent INTEGER DEFAULT 0, failed INTEGER DEFAULT 0,
      status TEXT, created_at INTEGER, send_at INTEGER, done_at INTEGER);`);
  const dayStart = () => { const d = new Date(now() + 3600e3); d.setUTCHours(0, 0, 0, 0); return d.getTime() - 3600e3; };   // midnight WAT

  /* ---------- segments for broadcasts ---------- */
  const SEGMENTS = {
    all: {n: 'Everyone in the bot chat', sql: '1=1'},
    not_registered: {n: 'Not registered on IQ Option yet', sql: "(u.linked IS NULL OR u.linked=0)"},
    not_funded: {n: 'Registered, not funded', sql: `u.linked=1 AND COALESCE(a.deposits_total,0)<${C.minDeposit}`},
    funded: {n: 'Funded ($20+)', sql: `COALESCE(a.deposits_total,0)>=${C.minDeposit}`},
    voice: {n: 'Funded $100+', sql: 'COALESCE(a.deposits_total,0)>=100'},
    advanced: {n: 'Advanced and up ($500+)', sql: 'COALESCE(a.deposits_total,0)>=500'},
    zero: {n: 'Funded, balance now $0', sql: `COALESCE(a.deposits_total,0)>=${C.minDeposit} AND s.balance IS NOT NULL AND s.balance<1`},
    quiet7: {n: 'No message from them in 7 days', sql: 'COALESCE(b.last_in,0)<' + '__T7__'},
    new24: {n: 'Joined in the last 24 hours', sql: 'b.started_at>' + '__T1__'},
  };
  const segSql = (k, src) => { const s = (SEGMENTS[k] || SEGMENTS.all).sql.replace('__T7__', String(now() - 7 * 864e5)).replace('__T1__', String(now() - 864e5));
    return `FROM bot_users b LEFT JOIN users u ON u.tg_id=b.tg_id LEFT JOIN aff_accounts a ON a.iq_user_id=u.iq_user_id LEFT JOIN user_state s ON s.tg_id=b.tg_id
      WHERE b.stopped=0 AND COALESCE(u.blocked,0)=0 AND (${s})${src ? ' AND b.src=?' : ''}`; };
  const segCount = (k, src) => q('SELECT COUNT(*) n ' + segSql(k, src)).get(...(src ? [src] : [])).n;
  let running = false;
  async function runBroadcasts() {
    if (running) return; running = true;
    try {
      const bc = q("SELECT * FROM broadcasts WHERE status='queued' AND COALESCE(send_at,0)<=? ORDER BY id LIMIT 1").get(now()); if (!bc) return;
      const seg = JSON.parse(bc.segment); const ids = q('SELECT b.tg_id ' + segSql(seg.k, seg.src)).all(...(seg.src ? [seg.src] : [])).map((r) => r.tg_id);
      q("UPDATE broadcasts SET status='sending', total=? WHERE id=?").run(ids.length, bc.id);
      const cta = bc.cta ? JSON.parse(bc.cta) : null; const texts = bc.text.split(/\n\s*\|\|\s*\n|\n{3,}/).map((x) => x.trim()).filter(Boolean);
      let k = 0, sent = 0, failed = 0; const bot = getBot();
      const worker = async () => { while (k < ids.length) { const id = ids[k++]; const first = (q('SELECT first_name FROM bot_users WHERE tg_id=?').get(id) || {}).first_name || 'there';
        const ok = await bot.notify(id, texts.map((t) => t.replace(/\{name\}/g, first)), cta); ok ? sent++ : failed++;
        if ((sent + failed) % 25 === 0) q('UPDATE broadcasts SET sent=?, failed=? WHERE id=?').run(sent, failed, bc.id); } };
      await Promise.all(Array.from({length: Math.min(8, ids.length || 1)}, worker));
      q("UPDATE broadcasts SET status='done', sent=?, failed=?, done_at=? WHERE id=?").run(sent, failed, now(), bc.id);
    } finally { running = false; }
  }

  /* ---------- setup check: what's connected ---------- */
  function setup() {
    const has = (k) => !!env[k]; const v = settings.get('voice'); const ai = settings.get('ai');
    return [
      {k: 'Telegram bot', ok: has('TELEGRAM_BOT_TOKEN'), need: 'TELEGRAM_BOT_TOKEN', why: 'The app sign-in and the support chat'},
      {k: 'IQ Option sign-in', ok: !!(C.clientId && C.redirectUri), need: 'IQ_CLIENT_ID, IQ_REDIRECT_URI, IQ_CLIENT_SECRET', why: 'One-tap IQ Option account connect'},
      {k: 'Affstore postbacks', ok: has('POSTBACK_KEY') && !!q("SELECT 1 FROM events LIMIT 1").get(), warn: has('POSTBACK_KEY') && !q("SELECT 1 FROM events LIMIT 1").get(), need: 'POSTBACK_KEY + postback URL in Affstore', why: 'Detect registrations and deposits'},
      {k: 'AI brain', ok: engine.live(), need: 'ANTHROPIC_API_KEY (or another AI key)', why: 'AI traders and the support assistant'},
      {k: 'Backup AI', ok: !!(ai.backup && ai.backup.provider && engine.hasKey(ai.backup.provider)), warn: true, need: 'A second AI key + choose it as backup in AI engine', why: 'Keeps chats going if the first AI company is down'},
      {k: 'Team alerts group', ok: has('SUPPORT_TEAM_CHAT_ID') || !!team.OWNER().tg_chat_id || !!q("SELECT 1 FROM team WHERE tg_chat_id IS NOT NULL AND tg_chat_id<>''").get(), need: 'SUPPORT_TEAM_CHAT_ID or connect Telegram in Alerts', why: 'Hand-offs to a human'},
      {k: 'Voice: listening', ok: (v.stt || []).some((p) => (p === 'self' ? has('VOICE_SERVER_URL') : has({openai: 'OPENAI_API_KEY', deepgram: 'DEEPGRAM_API_KEY', elevenlabs: 'ELEVENLABS_API_KEY'}[p]))), need: 'VOICE_SERVER_URL or OPENAI_API_KEY', why: 'Calls inside Telegram on Android'},
      {k: 'Voice: standard voices', ok: (v.standard || []).some((p) => (p === 'self' ? has('VOICE_SERVER_URL') : has({openai: 'OPENAI_API_KEY', elevenlabs: 'ELEVENLABS_API_KEY', google: 'GOOGLE_TTS_KEY'}[p]))), need: 'VOICE_SERVER_URL (our own voices) or OPENAI_API_KEY', why: 'AI voices on calls'},
      {k: 'Voice: premium voices', ok: has('ELEVENLABS_API_KEY'), warn: true, need: 'ELEVENLABS_API_KEY', why: 'Premium voice for Pro users'},
      {k: 'Own voice server', ok: has('VOICE_SERVER_URL'), warn: true, need: 'VOICE_SERVER_URL + VOICE_SERVER_KEY (voice-server/README.md)', why: 'Cheapest voices'},
      {k: 'Crypto payments', ok: has('PAY_USDT_TRC') || has('PAY_BTC_ADDRESS'), warn: true, need: 'see pay.js / .env.example', why: 'Buy coins and tokens with USDT or BTC'},
      {k: 'Email alerts', ok: has('RESEND_API_KEY') || has('BREVO_API_KEY'), warn: true, need: 'RESEND_API_KEY (or BREVO_API_KEY)', why: 'Alerts by email (Telegram alerts work without it)'},
      {k: 'Public URL', ok: has('PUBLIC_URL'), warn: true, need: 'PUBLIC_URL', why: 'Sign-in links for the team and "Open in admin" buttons'},
    ];
  }

  const memberRow = `SELECT u.tg_id, u.first_name, u.username, u.iq_user_id, u.linked, u.link_source, u.created_at, u.free_until, COALESCE(u.blocked,0) blocked, u.note,
      COALESCE(a.deposits_total,0) dep, COALESCE(a.withdrawals_total,0) wd, a.ftd_at, COALESCE(r.coins,0) coins, COALESCE(r.tokens,0) tokens, COALESCE(r.flagged,0) flagged,
      s.balance, s.last_result, b.src, COALESCE(b.stopped,0) stopped, b.last_in, (SELECT COUNT(*) FROM trades t WHERE t.tg_id=u.tg_id AND t.status<>'failed') trades
    FROM users u LEFT JOIN aff_accounts a ON a.iq_user_id=u.iq_user_id LEFT JOIN rewards r ON r.tg_id=u.tg_id LEFT JOIN user_state s ON s.tg_id=u.tg_id LEFT JOIN bot_users b ON b.tg_id=u.tg_id`;
  const MSEG = {all: '1=1', funded: `COALESCE(a.deposits_total,0)>=${C.minDeposit}`, unfunded: `COALESCE(a.deposits_total,0)<${C.minDeposit}`, notlinked: 'COALESCE(u.linked,0)=0', flagged: 'COALESCE(r.flagged,0)=1', blocked: 'COALESCE(u.blocked,0)=1', zero: `COALESCE(a.deposits_total,0)>=${C.minDeposit} AND s.balance<1`};

  const routes = {
    'GET /api/admin/overview': async () => {
      const t0 = dayStart(), w0 = now() - 7 * 864e5;
      const dep = (from) => q("SELECT COALESCE(SUM(amount),0) s, COUNT(*) n FROM events WHERE type IN ('ftd','deposit') AND created_at>=?").get(from);
      return {ok: true, setup: setup(),
        kpi: {users: q('SELECT COUNT(*) n FROM users').get().n, usersToday: q('SELECT COUNT(*) n FROM users WHERE created_at>=?').get(t0).n,
          linked: q('SELECT COUNT(*) n FROM users WHERE linked=1').get().n, funded: q(`SELECT COUNT(*) n FROM users u JOIN aff_accounts a ON a.iq_user_id=u.iq_user_id WHERE a.deposits_total>=${C.minDeposit}`).get().n,
          ftdToday: q("SELECT COUNT(*) n FROM events WHERE type='ftd' AND created_at>=?").get(t0).n, depToday: dep(t0).s, depWeek: dep(w0).s, depAll: dep(0).s,
          regToday: q("SELECT COUNT(*) n FROM events WHERE type='registration' AND created_at>=?").get(t0).n,
          needsHuman: q("SELECT COUNT(*) n FROM tickets WHERE status='waiting'").get().n, humanChats: q("SELECT COUNT(*) n FROM tickets WHERE status='human'").get().n,
          calls: q('SELECT COUNT(*) n FROM voice_calls WHERE ended_at IS NULL AND last_at>?').get(now() - 75e3).n, callsToday: q('SELECT COUNT(*) n FROM voice_calls WHERE started_at>=?').get(t0).n,
          aiToday: engine.spentToday(), budget: settings.get('ai').budgetUsd, trades: q("SELECT COUNT(*) n FROM trades WHERE created_at>=? AND status<>'failed'").get(t0).n},
        days: q(`SELECT strftime('%Y-%m-%d', (created_at+3600000)/1000, 'unixepoch') d, SUM(CASE WHEN type='registration' THEN 1 ELSE 0 END) reg, SUM(CASE WHEN type='ftd' THEN 1 ELSE 0 END) ftd,
          SUM(CASE WHEN type IN ('ftd','deposit') THEN amount ELSE 0 END) dep FROM events WHERE created_at>=? GROUP BY d ORDER BY d`).all(now() - 14 * 864e5),
        recent: q("SELECT e.type, e.amount, e.created_at, e.iq_user_id, u.first_name FROM events e LEFT JOIN users u ON u.iq_user_id=e.iq_user_id ORDER BY e.created_at DESC LIMIT 12").all()};
    },
    'GET /api/admin/members': async (req, b, u, url) => {
      const s = (url.searchParams.get('q') || '').trim().replace(/^@/, ''), seg = MSEG[url.searchParams.get('seg')] || MSEG.all, lim = Math.min(+url.searchParams.get('limit') || 100, 500), off = Math.max(0, +url.searchParams.get('offset') || 0);
      const where = `WHERE (${seg})` + (s ? ' AND (u.tg_id=? OR u.iq_user_id=? OR u.first_name LIKE ? OR u.username LIKE ?)' : '');
      const args = s ? [s, s, '%' + s + '%', '%' + s + '%'] : [];
      return {ok: true, total: q(`SELECT COUNT(*) n FROM users u LEFT JOIN aff_accounts a ON a.iq_user_id=u.iq_user_id LEFT JOIN rewards r ON r.tg_id=u.tg_id LEFT JOIN user_state s ON s.tg_id=u.tg_id ${where}`).get(...args).n,
        rows: q(`${memberRow} ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).all(...args, lim, off)};
    },
    'GET /api/admin/members/one': async (req, b, u, url) => {
      const id = String(url.searchParams.get('tg_id') || ''); const m = q(memberRow + ' WHERE u.tg_id=?').get(id); if (!m) return [404, {ok: false}];
      return {ok: true, member: m, events: m.iq_user_id ? q('SELECT type,amount,currency,created_at FROM events WHERE iq_user_id=? ORDER BY created_at DESC LIMIT 30').all(m.iq_user_id) : [],
        trades: q('SELECT pair,dir,amount,step,status,profit,created_at FROM trades WHERE tg_id=? ORDER BY id DESC LIMIT 20').all(id), ledger: q('SELECT * FROM wallet_ledger WHERE tg_id=? ORDER BY id DESC LIMIT 20').all(id),
        calls: q('SELECT id,ai,kind,tier,started_at,secs,tokens FROM voice_calls WHERE tg_id=? ORDER BY started_at DESC LIMIT 10').all(id),
        invitedBy: (q('SELECT referrer FROM referrals WHERE tg_id=?').get(id) || {}).referrer || null, invited: (q('SELECT COUNT(*) n FROM referrals WHERE referrer=?').get(id) || {}).n || 0};
    },
    // give or take coins / tokens (negative numbers take). Optional Telegram message to the user.
    'POST /api/admin/member/credit': async (req, b, u, url, who) => {
      const id = String(b.tg_id || ''); const c = Math.trunc(+b.coins || 0), t = Math.trunc(+b.tokens || 0); const note = String(b.note || '').trim().slice(0, 200);
      if (!q('SELECT 1 FROM users WHERE tg_id=?').get(id)) return [404, {ok: false, error: 'not_found'}];
      if (!c && !t) return [400, {ok: false, error: 'nothing'}]; if (!note) return [400, {ok: false, error: 'add_a_note'}];
      if (Math.abs(c) > 100000 || Math.abs(t) > 10000) return [400, {ok: false, error: 'too_big'}];
      q('INSERT OR IGNORE INTO rewards(tg_id) VALUES(?)').run(id);
      q('UPDATE rewards SET coins=MAX(0,coins+?), tokens=MAX(0,tokens+?) WHERE tg_id=?').run(c, t, id);
      q('INSERT INTO wallet_ledger(tg_id,coins,tokens,note,by,at) VALUES(?,?,?,?,?,?)').run(id, c, t, note, who.name, now());
      team.log(who, 'member.credit', `${id}: ${c} coins, ${t} tokens · ${note}`);
      if (b.notify && (c > 0 || t > 0)) await getBot().notify(id, [`🎁 ${[c > 0 ? '+' + c + ' coins' : '', t > 0 ? '+' + t + ' tokens' : ''].filter(Boolean).join(' and ')} just landed in your Zubabot wallet${b.message ? '' : '!'}`, ...(b.message ? [String(b.message).slice(0, 500)] : [])], {type: 'coins'});
      return {ok: true, rewards: q('SELECT coins,tokens FROM rewards WHERE tg_id=?').get(id)};
    },
    'POST /api/admin/member/block': async (req, b, u, url, who) => { q('UPDATE users SET blocked=? WHERE tg_id=?').run(b.blocked ? 1 : 0, String(b.tg_id)); if (b.blocked) q('UPDATE bot_users SET stopped=1 WHERE tg_id=?').run(String(b.tg_id));
      team.log(who, b.blocked ? 'member.block' : 'member.unblock', String(b.tg_id) + (b.note ? ' · ' + b.note : '')); return {ok: true}; },
    'POST /api/admin/member/flag': async (req, b, u, url, who) => { q('INSERT OR IGNORE INTO rewards(tg_id) VALUES(?)').run(String(b.tg_id)); q('UPDATE rewards SET flagged=? WHERE tg_id=?').run(b.flagged ? 1 : 0, String(b.tg_id));
      team.log(who, b.flagged ? 'member.flag' : 'member.unflag', String(b.tg_id)); return {ok: true}; },
    'POST /api/admin/member/reminders': async (req, b, u, url, who) => { q('UPDATE bot_users SET stopped=? WHERE tg_id=?').run(b.stopped ? 1 : 0, String(b.tg_id)); team.log(who, 'member.reminders', `${b.tg_id}: ${b.stopped ? 'off' : 'on'}`); return {ok: true}; },
    'POST /api/admin/member/note': async (req, b, u, url, who) => { q('UPDATE users SET note=? WHERE tg_id=?').run(String(b.note || '').slice(0, 500), String(b.tg_id)); team.log(who, 'member.note', String(b.tg_id)); return {ok: true}; },
    // fix a wrong / missing IQ Option ID (support checked it in Affstore)
    'POST /api/admin/member/iq': async (req, b, u, url, who) => {
      const id = String(b.tg_id || ''), iq = String(b.iq_user_id || '').replace(/\D/g, '');
      if (!q('SELECT 1 FROM users WHERE tg_id=?').get(id)) return [404, {ok: false, error: 'not_found'}];
      if (iq) { const other = q('SELECT tg_id FROM users WHERE iq_user_id=? AND tg_id<>?').get(iq, id); if (other && !b.move) return [409, {ok: false, error: 'used_by_other', other: other.tg_id}];
        if (other) q('UPDATE users SET iq_user_id=NULL, linked=0 WHERE tg_id=?').run(other.tg_id); }
      q("UPDATE users SET iq_user_id=?, linked=?, link_source='admin', updated_at=? WHERE tg_id=?").run(iq || null, iq ? 1 : 0, now(), id);
      if (iq) { q("INSERT INTO aff_accounts(iq_user_id,source,registered_at) VALUES(?,'admin',?) ON CONFLICT(iq_user_id) DO NOTHING").run(iq, now()); creditRewards(iq); }
      team.log(who, 'member.iq', `${id} -> ${iq || '(removed)'}${b.note ? ' · ' + b.note : ''}`); return {ok: true, state: publicState(id)};
    },
    'POST /api/admin/member/message': async (req, b, u, url, who) => { const t = String(b.text || '').trim(); if (!t) return [400, {ok: false}];
      const cta = b.cta && b.cta.type && getBot().safeCta ? getBot().safeCta(b.cta) : null;
      if (security) { const g = await security.check(t + (cta && cta.label ? '\n' + cta.label : ''), {source: 'teammate message', who: who.name, tgId: String(b.tg_id)}); if (!g.ok) return [400, {ok: false, error: 'Not sent: blocked for security review (#' + g.id + ')'}]; }
      const ok = await getBot().notify(String(b.tg_id), [t.slice(0, 3000)], cta, {role: 'human', who: who.name, checked: true}); team.log(who, 'member.message', `${b.tg_id}: ${t.slice(0, 120)}`); return {ok}; },

    'GET /api/admin/broadcast': async () => ({ok: true, segments: Object.fromEntries(Object.entries(SEGMENTS).map(([k, v]) => [k, {n: v.n, count: segCount(k)}])),
      sources: q("SELECT src, COUNT(*) n FROM bot_users WHERE src IS NOT NULL AND src<>'' GROUP BY src ORDER BY n DESC LIMIT 30").all(), list: q('SELECT * FROM broadcasts ORDER BY id DESC LIMIT 30').all()}),
    'POST /api/admin/broadcast/count': async (req, b) => ({ok: true, count: segCount(b.segment, b.src || '')}),
    'POST /api/admin/broadcast': async (req, b, u, url, who) => {
      const text = String(b.text || '').trim().slice(0, 3500); if (!text) return [400, {ok: false, error: 'empty'}];
      if (security) { const g = await security.check(text, {source: 'broadcast', who: who.name}); if (!g.ok) return [400, {ok: false, error: 'Blocked for security review (#' + g.id + '): ' + g.findings.filter((x) => x.sev === 'block').map((x) => x.why).join('; ')}]; }
      const cta = b.cta && b.cta.type ? {type: String(b.cta.type), amount: +b.cta.amount || undefined} : null;
      if (b.test) { const me = who.tg_chat_id; if (!me) return [400, {ok: false, error: 'connect_your_telegram_in_alerts_first'}]; const ok = await getBot().notify(String(me), text.split(/\n\s*\|\|\s*\n|\n{3,}/).map((x) => x.trim().replace(/\{name\}/g, who.name.split(' ')[0])).filter(Boolean), cta); return {ok}; }
      const sendAt = b.sendAt ? Math.max(now(), +new Date(b.sendAt) || now()) : now();
      const r = q("INSERT INTO broadcasts(by,segment,text,cta,status,created_at,send_at,total) VALUES(?,?,?,?,'queued',?,?,?)").run(who.name, JSON.stringify({k: SEGMENTS[b.segment] ? b.segment : 'all', src: String(b.src || '').slice(0, 40)}), text, cta ? JSON.stringify(cta) : null, now(), sendAt, segCount(b.segment, b.src || ''));
      team.log(who, 'broadcast.create', `${b.segment}${b.src ? '/' + b.src : ''}: ${text.slice(0, 100)}`);
      if (who.role !== 'owner') { try { team.alert('security', `📣 ${who.name} queued a broadcast to “${b.segment || 'all'}”${b.src ? ' / ' + b.src : ''}:\n“${text.slice(0, 300)}”`, {key: 'bc' + now(), every: 1}); } catch (e) {} } setTimeout(() => runBroadcasts().catch((e) => console.warn('[broadcast]', e.message)), 50);
      return {ok: true, id: Number(r.lastInsertRowid)};
    },
    'POST /api/admin/broadcast/cancel': async (req, b, u, url, who) => { q("UPDATE broadcasts SET status='cancelled' WHERE id=? AND status='queued'").run(+b.id); team.log(who, 'broadcast.cancel', String(b.id)); return {ok: true}; },

    // bot flows: list + stats per flow (how many started, opened the app, connected IQ Option, funded)
    'GET /api/admin/flows': async () => {
      const stats = q(`SELECT COALESCE(b.flow,'(before flows)') flow, COUNT(*) started, SUM(CASE WHEN u.tg_id IS NOT NULL THEN 1 ELSE 0 END) opened, SUM(CASE WHEN u.linked=1 THEN 1 ELSE 0 END) linked,
        SUM(CASE WHEN COALESCE(a.deposits_total,0)>=${C.minDeposit} THEN 1 ELSE 0 END) funded, COALESCE(SUM(a.deposits_total),0) usd
        FROM bot_users b LEFT JOIN users u ON u.tg_id=b.tg_id LEFT JOIN aff_accounts a ON a.iq_user_id=u.iq_user_id GROUP BY COALESCE(b.flow,'(before flows)')`).all();
      return {ok: true, flows: settings.get('flows'), stats};
    },
    'POST /api/admin/flows': async (req, b, u, url, who) => {
      const cur = settings.get('flows'); const list = {...cur.list};
      const clean = (f) => ({name: String(f.name || 'Untitled').slice(0, 60), lang: ['en', 'pt', 'es', 'tl', 'fr', 'th'].includes(f.lang) ? f.lang : 'en', supportReply: String(f.supportReply || '').slice(0, 500), steps: (Array.isArray(f.steps) ? f.steps : []).slice(0, 8).map((st) => ({text: String(st.text || '').slice(0, 1500), image: st.image ? String(st.image).replace(/[^a-z0-9-]/gi, '').slice(0, 40) : '',
        buttons: (Array.isArray(st.buttons) ? st.buttons : []).slice(0, 4).filter((x) => x && x.label).map((x) => ({label: String(x.label).slice(0, 60), action: ['app', 'fund', 'live', 'academy', 'invite', 'signal', 'coins', 'support', 'human', 'url'].includes(x.action) ? x.action : 'app', value: x.value == null ? '' : String(x.value).slice(0, 300)}))}))});
      if (b.op === 'save' && security && b.flow) { const f = clean(b.flow); const all = [f.supportReply, ...f.steps.flatMap((st) => [st.text, ...st.buttons.map((x) => x.label + ' ' + (x.action === 'url' ? x.value : ''))])].join('\n');
        const g = await security.check(all, {source: 'bot flow "' + f.name + '"', who: who.name}); if (!g.ok) return [400, {ok: false, error: 'Blocked for security review (#' + g.id + '): ' + g.findings.filter((x) => x.sev === 'block').map((x) => x.why).join('; ')}]; }
      if (b.op === 'save') { const k = String(b.key || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || 'flow' + Date.now().toString(36); list[k] = clean(b.flow || {}); settings.set('flows', {list}, who.name); return {ok: true, key: k, flows: settings.get('flows')}; }
      if (b.op === 'delete') { if (b.key === cur.active) return [400, {ok: false, error: 'cant_delete_active'}]; const all = JSON.parse(JSON.stringify(cur)); delete all.list[b.key]; if (all.split && all.split.to === b.key) all.split = {to: '', pct: 0};
        return {ok: true, flows: settings.replace('flows', all, who.name)}; }
      if (b.op === 'activate') { if (!list[b.key]) return [404, {ok: false}]; return {ok: true, flows: settings.set('flows', {active: b.key}, who.name)}; }
      if (b.op === 'split') { const to = list[b.to] ? b.to : ''; return {ok: true, flows: settings.set('flows', {split: {to, pct: to ? Math.max(0, Math.min(90, +b.pct || 0)) : 0}}, who.name)}; }
      // one click: a copy of this flow written in another language (the AI translates it, then you can edit it)
      if (b.op === 'translate') { const f = list[b.key]; const L = String(b.lang || ''); if (!f || !i18n || !i18n.LANGS[L] || L === 'en') return [400, {ok: false, error: 'pick a flow and a language'}];
        const tr = async (t) => (t ? await i18n.tr(L, t) : t);
        const nf = {...clean(f), lang: L, name: (f.name || 'Flow') + ' · ' + i18n.LANGS[L].n, supportReply: await tr(f.supportReply), steps: await Promise.all((f.steps || []).map(async (st) => ({...st, text: await tr(st.text), buttons: await Promise.all((st.buttons || []).map(async (x) => ({...x, label: await tr(x.label)})))})))};
        const k = (String(b.key) + '-' + L).slice(0, 30); list[k] = clean(nf); settings.set('flows', {list}, who.name); return {ok: true, key: k, flows: settings.get('flows')}; }
      if (b.op === 'test') { const me = who.tg_chat_id; if (!me) return [400, {ok: false, error: 'connect_your_telegram_in_alerts_first'}]; const f = b.flow ? clean(b.flow) : list[b.key]; if (!f) return [404, {ok: false}];
        await getBot().runFlow(String(me), String(me), f, String(who.name).split(' ')[0], f.lang || 'en'); return {ok: true}; }
      return [400, {ok: false, error: 'op'}];
    },
    'GET /api/admin/lives': async () => ({ok: true, lives: settings.get('lives')}),
    'POST /api/admin/lives': async (req, b, u, url, who) => {
      const v = {}; const cur = settings.get('lives') || {}; if (b.mentor !== undefined) v.mentor = String(b.mentor).replace(/[<>{}"]/g, '').trim().slice(0, 40); if (b.link !== undefined) v.link = String(b.link).trim().slice(0, 300);
      if (v.link && !/^https:\/\/[^\s"'<>]+$/.test(v.link)) return [400, {ok: false, error: 'the live link must start with https://'}];
      if (v.link && security) { const g = await security.check(v.link, {source: 'lives link', who: who.name}); if (!g.ok) return [400, {ok: false, error: 'Blocked for security review (#' + g.id + ')'}]; }
      if (security && security.notify && ((v.link !== undefined && v.link !== (cur.link || '')) || (v.mentor !== undefined && v.mentor !== cur.mentor))) security.notify(`🔐 Lives changed by ${who.name}\nMentor: ${cur.mentor || '—'} → ${v.mentor ?? cur.mentor}\nLive link: ${cur.link || '—'} → ${v.link ?? cur.link ?? '—'}`, 'lv' + Date.now());
      if (Array.isArray(b.times)) v.times = b.times.map(String).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).slice(0, 12);
      for (const k of ['remindMin', 'maxPerDay', 'stopAfter']) if (b[k] !== undefined) v[k] = Math.max(0, +b[k] || 0); if (b.on !== undefined) v.on = !!b.on;
      return {ok: true, lives: settings.set('lives', v, who.name)};
    },
    'GET /api/admin/settings': async () => ({ok: true, all: settings.all()}),
    'POST /api/admin/settings': async (req, b, u, url, who) => { if (!['followups', 'support', 'alerts', 'funnel', 'media', 'free'].includes(b.key)) return [400, {ok: false, error: 'use_the_matching_tab'}]; const value = settings.set(b.key, b.value || {}, who.name);
      if (b.key === 'funnel') { try { await getBot().applyDescription(); } catch (e) {} } return {ok: true, value}; },
    'POST /api/admin/settings/reset': async (req, b, u, url, who) => { const k = String(b.key); if (['security', 'lives', 'mentors', 'i18n'].includes(k) && who.role !== 'owner') return [403, {ok: false, error: 'only the owner can reset this'}];
      if (k === 'security' && security && security.notify) security.notify(`🔐 Security settings were reset to default by ${who.name}`, 'rs' + Date.now()); return {ok: true, value: settings.reset(k)}; },
  };
  return {routes, runBroadcasts, setup, SEGMENTS};
}
