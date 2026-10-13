// Support inbox + transfer to a human. Every chat (Telegram bot chat and the in-app support chat) shows up in
// Admin -> Support inbox. The assistant answers by itself; when a user asks for a person (or the assistant can't solve it)
// the chat becomes "Needs a human", the team is alerted, and a teammate takes over from the admin (or by replying in Telegram).
// While a human has the chat the assistant stays quiet. "Hand back" gives it back to the assistant; "Close" asks the user to rate it.
//
// Ticket status: waiting (asked for a human, nobody answered yet) -> human (a teammate took over) -> closed
export function makeInbox({db, q, now, settings, team}) {
  const env = process.env;
  db.exec(`CREATE TABLE IF NOT EXISTS tickets(id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id TEXT, channel TEXT, status TEXT, assignee TEXT, reason TEXT, first_text TEXT,
      opened_at INTEGER, updated_at INTEGER, last_user_at INTEGER, last_team_at INTEGER, sla_ping INTEGER DEFAULT 0, rating TEXT, closed_by TEXT, closed_at INTEGER);
    CREATE INDEX IF NOT EXISTS tickets_u ON tickets(tg_id, status);
    CREATE TABLE IF NOT EXISTS bot_msgs(id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id TEXT, role TEXT, text TEXT, at INTEGER);
    CREATE TABLE IF NOT EXISTS bot_handoff(team_msg_id TEXT PRIMARY KEY, tg_id TEXT, at INTEGER);
    CREATE TABLE IF NOT EXISTS bot_users(tg_id TEXT PRIMARY KEY, chat_id TEXT, first_name TEXT, username TEXT, lang TEXT, started_at INTEGER, last_in INTEGER, last_out INTEGER,
      fu_step INTEGER DEFAULT 0, fu_next_at INTEGER, stopped INTEGER DEFAULT 0, human_until INTEGER DEFAULT 0, live_day TEXT, last_dep REAL DEFAULT 0, topup_at INTEGER DEFAULT 0, src TEXT);`);
  for (const [t, c, ty] of [['bot_msgs', 'channel', "TEXT DEFAULT 'tg'"], ['bot_msgs', 'who', 'TEXT'], ['bot_msgs', 'ticket', 'INTEGER']])
    if (!q(`PRAGMA table_info(${t})`).all().some((x) => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${ty}`);
  const hooks = {toUser: null, rateAsk: null, teamGroup: null};   // set by the support bot
  const S = () => settings.get('support');
  const adminUrl = (id) => (env.PUBLIC_URL || '').replace(/\/$/, '') + '/admin#inbox/' + id;
  const open = (tgId) => q("SELECT * FROM tickets WHERE tg_id=? AND status IN ('waiting','human') ORDER BY id DESC LIMIT 1").get(String(tgId));
  const name = (tgId) => { const r = q('SELECT b.first_name bf, b.username bu, u.first_name uf, u.username uu FROM (SELECT ? id) x LEFT JOIN bot_users b ON b.tg_id=x.id LEFT JOIN users u ON u.tg_id=x.id').get(String(tgId)) || {};
    const n = r.bf || r.uf || 'User'; const un = r.bu || r.uu; return n + (un ? ' @' + un : ''); };
  const record = (tgId, role, text, channel = 'tg', who = null) => { const t = open(tgId);
    const r = q('INSERT INTO bot_msgs(tg_id,role,text,at,channel,who,ticket) VALUES(?,?,?,?,?,?,?)').run(String(tgId), role, String(text || '').slice(0, 2000), now(), channel, who, t ? t.id : null);
    if (t && role === 'user') q('UPDATE tickets SET last_user_at=?, updated_at=? WHERE id=?').run(now(), now(), t.id);
    return Number(r.lastInsertRowid); };
  // replies go back where the user last wrote (Telegram, in-app support or the MAX mentor chat)
  const lastCh = (tgId, dflt) => ((q("SELECT channel FROM bot_msgs WHERE tg_id=? AND role='user' ORDER BY id DESC LIMIT 1").get(String(tgId)) || {}).channel) || dflt || 'tg';
  const silence = (tgId, until) => q('UPDATE bot_users SET human_until=? WHERE tg_id=?').run(until, String(tgId));
  const humansAvailable = () => !!(env.SUPPORT_TEAM_CHAT_ID || team.OWNER().tg_chat_id || q("SELECT 1 FROM team WHERE active=1 AND tg_chat_id IS NOT NULL AND tg_chat_id<>''").get());
  const wantsHuman = (text) => { const w = String(S().humanWords || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean); const t = String(text || '').toLowerCase();
    return /^\/(human|agent|support)\b/.test(t) || w.some((x) => new RegExp('\\b' + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(t)); };

  // picture links are stored relative; Telegram needs the full address
  const abs = (s) => String(s).replace(/📷 picture: \/api\/upload/g, '📷 picture: ' + String(env.PUBLIC_URL || '').replace(/\/$/, '') + '/api/upload');
  // user (or the assistant) asks for a person
  async function requestHuman(tgId, {reason = 'asked for a human', text = '', channel = 'tg', notifyUser = true} = {}) {
    let t = open(tgId);
    if (!t) { const r = q('INSERT INTO tickets(tg_id,channel,status,reason,first_text,opened_at,updated_at,last_user_at) VALUES(?,?,?,?,?,?,?,?)').run(String(tgId), channel, 'waiting', reason, String(text).slice(0, 500), now(), now(), now()); t = q('SELECT * FROM tickets WHERE id=?').get(Number(r.lastInsertRowid)); }
    else q('UPDATE tickets SET updated_at=?, last_user_at=? WHERE id=?').run(now(), now(), t.id);
    if (t.status === 'waiting') silence(tgId, now() + (S().aiBackMin || 30) * 60e3);
    const msg = `🙋 ${name(tgId)} needs a human (${channel === 'app' ? 'in-app chat' : channel === 'mentor' ? '⭐ MAX member, mentor chat' : 'Telegram'})\nWhy: ${reason}\n\n“${abs(String(text || t.first_text || '').slice(0, 600))}”\n\nTake over in the admin, or reply to this message to answer them.`;
    if (t.status === 'waiting') {
      if (hooks.teamGroup) { try { await hooks.teamGroup(tgId, msg); } catch (e) { console.warn('[inbox] group', e.message); } }
      await team.alert('handoff', msg, {url: adminUrl(t.id), button: 'Take over', key: 'h' + t.id, every: 10 * 60e3, tgId});
    } else if (t.assignee) await team.alert('human_msg', `💬 ${name(tgId)}: “${abs(String(text).slice(0, 500))}”`, {to: t.assignee, url: adminUrl(t.id), button: 'Reply', tgId});
    if (notifyUser && t.status === 'waiting' && hooks.toUser) {
      const m = humansAvailable() ? [`Sure 🙌 I’m getting a teammate for you now.`, `They’ll reply right here${channel === 'app' ? ' in this chat' : ''}, usually within ${S().slaMin || 10} minutes.`] : ['Got you 🙏 a teammate will check this and reply right here.'];
      await hooks.toUser(tgId, m, null, {channel, who: 'system', role: 'system'});
    }
    return t;
  }
  async function takeOver(id, who) {
    const t = q('SELECT * FROM tickets WHERE id=?').get(+id); if (!t) throw Object.assign(new Error('not_found'), {status: 404});
    const was = t.status; q("UPDATE tickets SET status='human', assignee=?, updated_at=?, closed_at=NULL WHERE id=?").run(who.name, now(), t.id);
    silence(t.tg_id, now() + (S().idleBackH || 12) * 3600e3);
    if (S().introOnTakeover && who.id !== -1 && lastCh(t.tg_id, t.channel) !== 'mentor' && (was !== 'human' || t.assignee !== who.name) && hooks.toUser) {
      const first = (q('SELECT first_name FROM bot_users WHERE tg_id=?').get(t.tg_id) || {}).first_name || '';
      const me = who.id === 0 && /^owner$/i.test(who.name) ? '' : String(who.name).split(' ')[0];
      await hooks.toUser(t.tg_id, [`Hi${first ? ' ' + first : ''} 👋 ${me ? 'I’m ' + me + ' from' : 'This is'} the Zubabot support team. I’m on it now.`], null, {channel: lastCh(t.tg_id, t.channel), who: who.name, role: 'human'});
    }
    team.log(who, 'inbox.take_over', `ticket ${t.id} · ${name(t.tg_id)}`);
    return q('SELECT * FROM tickets WHERE id=?').get(t.id);
  }
  // a teammate's reply (admin inbox, team group reply or a reply to an alert in Telegram)
  async function reply(tgId, who, text, cta = null) {
    // security: a teammate's or mentor's message is checked before it reaches the user
    if (hooks.security) { const g = await hooks.security(String(text) + (cta && cta.label ? '\n' + cta.label : ''), {source: lastCh(tgId, 'tg') === 'mentor' ? 'mentor reply' : 'support reply', who: who.name, tgId}); if (!g.ok) throw Object.assign(new Error('Not sent: blocked for security review (#' + g.id + '). ' + g.findings.filter((x) => x.sev === 'block').map((x) => x.why).join('; ')), {status: 400}); }
    let t = open(tgId);
    if (!t) { const r = q("INSERT INTO tickets(tg_id,channel,status,assignee,reason,opened_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(String(tgId), 'tg', 'human', who.name, 'team started the chat', now(), now()); t = q('SELECT * FROM tickets WHERE id=?').get(Number(r.lastInsertRowid)); }
    if (t.status === 'waiting') { q("UPDATE tickets SET status='human', assignee=? WHERE id=?").run(who.name, t.id); }
    q('UPDATE tickets SET last_team_at=?, updated_at=? WHERE id=?').run(now(), now(), t.id);
    silence(tgId, now() + (S().idleBackH || 12) * 3600e3);
    let sent = null; if (hooks.toUser) sent = await hooks.toUser(tgId, [String(text).slice(0, 3000)], cta, {channel: lastCh(tgId, t.channel), who: who.name, role: 'human', fast: true});
    const shown = Array.isArray(sent) && sent[0] ? sent[0] : String(text).slice(0, 3000);         // translated into the person's language when needed
    if (shown !== String(text).slice(0, 3000)) { try { q("UPDATE bot_msgs SET tr=? WHERE id=(SELECT MAX(id) FROM bot_msgs WHERE tg_id=? AND role='human')").run(String(text).slice(0, 2000), String(tgId)); } catch (e) {} }
    if (hooks.appMsg) { try { hooks.appMsg(tgId, who, shown, cta); } catch (e) {} }   // preview in the app
    team.log(who, 'inbox.reply', `${name(tgId)}: ${String(text).slice(0, 120)}`);
    return t.id;
  }
  async function handBack(id, who, say = true) {
    const t = q('SELECT * FROM tickets WHERE id=?').get(+id); if (!t) throw Object.assign(new Error('not_found'), {status: 404});
    q("UPDATE tickets SET status='closed', closed_by=?, closed_at=?, updated_at=?, reason=reason||' · handed back' WHERE id=?").run(who.name, now(), now(), t.id); silence(t.tg_id, 0);
    if (say && hooks.toUser) await hooks.toUser(t.tg_id, [`I’ll pass you back to ${S().name || 'Emily'}, our assistant, who’s here 24/7. Message any time 🙌`], null, {channel: t.channel, who: who.name, role: 'human'});
    team.log(who, 'inbox.hand_back', `ticket ${t.id} · ${name(t.tg_id)}`);
  }
  async function close(id, who) {
    const t = q('SELECT * FROM tickets WHERE id=?').get(+id); if (!t) throw Object.assign(new Error('not_found'), {status: 404});
    q("UPDATE tickets SET status='closed', closed_by=?, closed_at=?, updated_at=? WHERE id=?").run(who.name, now(), now(), t.id); silence(t.tg_id, 0);
    if (S().askRating && hooks.rateAsk) { try { await hooks.rateAsk(t); } catch (e) {} }
    team.log(who, 'inbox.close', `ticket ${t.id} · ${name(t.tg_id)}`);
  }
  async function rate(id, v) {
    const t = q('SELECT * FROM tickets WHERE id=?').get(+id); if (!t) return;
    q('UPDATE tickets SET rating=? WHERE id=?').run(v === 'up' ? 'up' : 'down', t.id);
    if (v !== 'up') { q("UPDATE tickets SET status='waiting', sla_ping=0, updated_at=?, reason='rated not solved' WHERE id=?").run(now(), t.id); silence(t.tg_id, now() + (S().aiBackMin || 30) * 60e3);
      await team.alert('handoff', `👎 ${name(t.tg_id)} says their issue isn't solved yet (ticket ${t.id}, closed by ${t.closed_by || '?'}).`, {url: adminUrl(t.id), button: 'Open'}); }
  }
  // a message from a user whose chat is with a human: save it and tell the teammate
  async function userWhileHuman(tgId, text, channel) {
    const t = open(tgId); if (!t) return false;
    if (hooks.teamGroup) { try { await hooks.teamGroup(tgId, `💬 ${name(tgId)}${t.assignee ? ' (with ' + t.assignee + ')' : ' (waiting)'}: “${abs(String(text).slice(0, 600))}”`); } catch (e) {} }
    if (t.status === 'human' && t.assignee) await team.alert('human_msg', `💬 ${name(tgId)}: “${abs(String(text).slice(0, 500))}”`, {to: t.assignee, url: adminUrl(t.id), button: 'Reply', tgId});
    else await team.alert('handoff', `🙋 ${name(tgId)} is still waiting for a human: “${abs(String(text).slice(0, 400))}”`, {url: adminUrl(t.id), button: 'Take over', key: 'w' + t.id, every: 5 * 60e3, tgId});
    return true;
  }
  const isHuman = (tgId) => { const t = open(tgId); if (!t) return false; if (t.status === 'human') return true;
    return ((q('SELECT human_until h FROM bot_users WHERE tg_id=?').get(String(tgId)) || {}).h || 0) > now(); };

  // every minute: nobody answered in time -> remind the team and reassure the user; quiet human chats go back to the assistant
  async function tick() {
    const s = S(), t = now();
    for (const k of q("SELECT * FROM tickets WHERE status='waiting' AND sla_ping=0 AND opened_at<? AND (last_team_at IS NULL)").all(t - (s.slaMin || 10) * 60e3)) {
      q('UPDATE tickets SET sla_ping=1 WHERE id=?').run(k.id);
      await team.alert('handoff', `⏰ ${name(k.tg_id)} has waited ${s.slaMin} minutes for a human. Please take over.`, {url: adminUrl(k.id), button: 'Take over', tgId: k.tg_id});
      if (hooks.toUser) await hooks.toUser(k.tg_id, ['Still on it 🙏 a teammate will reply here shortly. You can keep typing, they’ll see everything.'], null, {channel: k.channel, who: 'system', role: 'system', fast: true});
    }
    for (const k of q("SELECT * FROM tickets WHERE status='human' AND COALESCE(last_team_at,updated_at)<? AND COALESCE(last_user_at,0)<?").all(t - (s.idleBackH || 12) * 3600e3, t - (s.idleBackH || 12) * 3600e3)) {
      q("UPDATE tickets SET status='closed', closed_by='auto (quiet)', closed_at=? WHERE id=?").run(t, k.id); silence(k.tg_id, 0);
    }
  }

  const routes = {
    // list of conversations. filter: needs | mine | human | ai | closed | all
    'GET /api/admin/inbox': async (req, b, u, url, who) => {
      const f = url.searchParams.get('filter') || 'needs', s = (url.searchParams.get('q') || '').trim(), lim = Math.min(+url.searchParams.get('limit') || 80, 300);
      const rows = q(`WITH l AS (SELECT tg_id, MAX(id) last_id, COUNT(*) n FROM bot_msgs WHERE role<>'note' GROUP BY tg_id)
        SELECT l.tg_id, l.last_id, l.n, m.at last_at, m.text last_text, m.role last_role, m.channel, b.first_name, b.username, u.first_name ufn, u.username uun, COALESCE(a.deposits_total,0) dep,
          t.id ticket, t.status, t.assignee, t.reason, t.opened_at, t.sla_ping, f.lang, f.funnel, f.sub
        FROM l JOIN bot_msgs m ON m.id=l.last_id LEFT JOIN attrib f ON f.tg_id=l.tg_id LEFT JOIN bot_users b ON b.tg_id=l.tg_id LEFT JOIN users u ON u.tg_id=l.tg_id LEFT JOIN aff_accounts a ON a.iq_user_id=u.iq_user_id
        LEFT JOIN tickets t ON t.id=(SELECT MAX(id) FROM tickets WHERE tg_id=l.tg_id)
        ${s ? "WHERE (l.tg_id=? OR b.first_name LIKE ? OR b.username LIKE ? OR u.first_name LIKE ? OR u.iq_user_id=?)" : ''}
        ORDER BY CASE WHEN t.status='waiting' THEN 0 WHEN t.status='human' THEN 1 ELSE 2 END, l.last_id DESC LIMIT 1000`).all(...(s ? [s, '%' + s + '%', '%' + s + '%', '%' + s + '%', s] : []));
      const keep = rows.filter((r) => f === 'all' ? true : f === 'needs' ? r.status === 'waiting' : f === 'mine' ? r.status === 'human' && r.assignee === who.name : f === 'human' ? r.status === 'human' : f === 'closed' ? r.status === 'closed' : !r.status || r.status === 'closed');
      const count = (fn) => rows.filter(fn).length;
      return {ok: true, rows: keep.slice(0, lim).map((r) => ({...r, name: r.first_name || r.ufn || 'User', username: r.username || r.uun || '', status: r.status && r.status !== 'closed' ? r.status : 'ai'})),
        counts: {needs: count((r) => r.status === 'waiting'), mine: count((r) => r.status === 'human' && r.assignee === who.name), human: count((r) => r.status === 'human'), all: rows.length}};
    },
    'GET /api/admin/inbox/thread': async (req, b, u, url) => {
      const tk = +url.searchParams.get('ticket') || 0; const id = tk ? ((q('SELECT tg_id FROM tickets WHERE id=?').get(tk) || {}).tg_id || '') : String(url.searchParams.get('tg_id') || '');
      const st = q(`SELECT u.tg_id, COALESCE(b.first_name,u.first_name) name, COALESCE(b.username,u.username) username, u.iq_user_id, u.linked, u.created_at, COALESCE(a.deposits_total,0) dep, COALESCE(r.coins,0) coins, COALESCE(r.tokens,0) tokens,
        s.balance, s.last_result, s.plan, b.src, b.stopped, b.fu_step, f.lang, f.funnel, f.sub FROM (SELECT ? tg) x LEFT JOIN attrib f ON f.tg_id=x.tg LEFT JOIN users u ON u.tg_id=x.tg LEFT JOIN bot_users b ON b.tg_id=x.tg LEFT JOIN aff_accounts a ON a.iq_user_id=u.iq_user_id
        LEFT JOIN rewards r ON r.tg_id=x.tg LEFT JOIN user_state s ON s.tg_id=x.tg`).get(id);
      if (st && hooks.mentorOf) { try { st.mentor = hooks.mentorOf(id); } catch (e) {} }
      return {ok: true, user: st, ticket: q('SELECT * FROM tickets WHERE tg_id=? ORDER BY id DESC LIMIT 1').get(id) || null, tickets: q('SELECT id,status,assignee,reason,opened_at,closed_at,rating FROM tickets WHERE tg_id=? ORDER BY id DESC LIMIT 10').all(id),
        msgs: q('SELECT * FROM bot_msgs WHERE tg_id=? ORDER BY id DESC LIMIT 200').all(id).reverse()};
    },
    'POST /api/admin/inbox/take': async (req, b, u, url, who) => { let t = open(b.tg_id); if (!t) t = await requestHuman(String(b.tg_id), {reason: 'team took over', notifyUser: false}); return {ok: true, ticket: await takeOver(t.id, who)}; },
    'POST /api/admin/inbox/reply': async (req, b, u, url, who) => { const text = String(b.text || '').trim(); if (!text) return [400, {ok: false, error: 'empty'}];
      return {ok: true, ticket: await reply(String(b.tg_id), who, text, b.cta && b.cta.type ? b.cta : null)}; },
    'POST /api/admin/inbox/note': async (req, b, u, url, who) => { record(String(b.tg_id), 'note', String(b.text || '').slice(0, 1000), 'note', who.name); return {ok: true}; },
    'POST /api/admin/inbox/handback': async (req, b, u, url, who) => { const t = open(b.tg_id); if (t) await handBack(t.id, who, b.say !== false); return {ok: true}; },
    'POST /api/admin/inbox/close': async (req, b, u, url, who) => { const t = open(b.tg_id); if (t) await close(t.id, who); return {ok: true}; },
    'POST /api/admin/inbox/assign': async (req, b, u, url, who) => { const t = open(b.tg_id); if (!t) return [404, {ok: false}]; q('UPDATE tickets SET assignee=?, updated_at=? WHERE id=?').run(String(b.to || '').slice(0, 40), now(), t.id);
      team.log(who, 'inbox.assign', `ticket ${t.id} -> ${b.to}`); if (b.to) await team.alert('handoff', `📌 ${who.name} assigned you a chat with ${name(t.tg_id)}.`, {to: String(b.to), url: adminUrl(t.id), button: 'Open'}); return {ok: true}; },
    // "Teach a better answer": the corrected answer becomes a training note the AI uses from the next message on
    'POST /api/admin/inbox/teach': async (req, b, u, url, who) => {
      const m = q('SELECT * FROM bot_msgs WHERE id=?').get(+b.msg_id); const better = String(b.better || '').trim().slice(0, 1200);
      if (!better) return [400, {ok: false, error: 'empty'}];
      const ask = m ? (q("SELECT text FROM bot_msgs WHERE tg_id=? AND id<? AND role='user' ORDER BY id DESC LIMIT 1").get(m.tg_id, m.id) || {}).text : '';
      const note = ask ? `When a user asks something like "${String(ask).slice(0, 300)}", answer like this: ${better}` : better;
      q('INSERT INTO knowledge_notes(text,active,created_at,updated_at) VALUES(?,1,?,?)').run(note, now(), now());
      team.log(who, 'train.teach', note.slice(0, 200)); return {ok: true, note};
    },
  };
  return {routes, record, requestHuman, takeOver, reply, handBack, close, rate, userWhileHuman, isHuman, wantsHuman, humansAvailable, open, tick, hooks};
}
