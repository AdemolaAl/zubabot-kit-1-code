// Team roles + alerts, support inbox + transfer to a human (Telegram and in-app), "teach a better answer",
// members actions, broadcasts, lives settings, AI engine backup + budget, and voice calls through our own voice server.
import http from 'node:http'; import crypto from 'node:crypto'; import assert from 'node:assert/strict'; import fs from 'node:fs';
for (const f of ['/tmp/zbiv.db', '/tmp/zbiv.db-wal', '/tmp/zbiv.db-shm']) fs.rmSync(f, {force: true}); fs.rmSync('/tmp/zbiv-cache', {recursive: true, force: true});
const SENT = [], AI = [], VS = [];
let aiDown = false;
http.createServer(async (q, s) => {
  const chunks = []; for await (const c of q) chunks.push(c); const raw = Buffer.concat(chunks); s.setHeader('Content-Type', 'application/json');
  // our own voice server
  if (q.url === '/tts') { VS.push(['tts', JSON.parse(raw)]); s.setHeader('Content-Type', 'audio/mpeg'); return s.end(Buffer.from('ID3fake-mp3-' + JSON.parse(raw).text)); }
  if (q.url === '/stt') { VS.push(['stt', q.headers['content-type'], raw.length, q.headers.authorization]); return s.end(JSON.stringify({ok: true, text: 'what pair are we trading?'})); }
  if (q.url === '/health') return s.end(JSON.stringify({ok: true, device: 'cuda', tts: 1}));
  if (q.url === '/v1/messages') { if (aiDown) { s.statusCode = 529; return s.end('{}'); } const j = JSON.parse(raw); AI.push(j); const sys = j.system.map((x) => x.text).join('\n');
    const voice = /VOICE CALL/.test(sys);
    return s.end(JSON.stringify({content: [{type: 'text', text: voice ? 'Okay okay, EUR/USD is looking clean! I like a buy on the one-minute. You in?' : 'Hi! Happy to help 😊||Tell me more.'}], usage: {input_tokens: 1000, output_tokens: 50}})); }
  if (q.url === '/oa/chat/completions') return s.end('{}');
  const m = q.url.match(/^\/bot[^/]+\/(\w+)/); if (m) { const j = raw.length ? JSON.parse(raw) : {}; SENT.push([m[1], j]); return s.end(JSON.stringify({ok: true, result: m[1] === 'getUpdates' ? [] : m[1] === 'sendMessage' ? {message_id: 5000 + SENT.length} : true})); }
  s.statusCode = 404; s.end('{}');
}).listen(9981);
Object.assign(process.env, {TELEGRAM_BOT_TOKEN: '111:TEST', TELEGRAM_API: 'http://127.0.0.1:9981', DB_FILE: '/tmp/zbiv.db', ADMIN_KEY: 'OWNERKEY', ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE: 'http://127.0.0.1:9981',
  APP_URL: 'https://app.test', PUBLIC_URL: 'https://api.test', QUIET_HOURS: '0-0', VOICE_SERVER_URL: 'http://127.0.0.1:9981', VOICE_SERVER_KEY: 'vskey', VOICE_CACHE_DIR: '/tmp/zbiv-cache', BOT_USERNAME: 'zubabot', DEV_FAKE_TG: '0'});
const {createServer, BOT, db, INBOX} = await import('../server/server.js');
createServer().listen(9980); const B = 'http://127.0.0.1:9980';
function initData(id, name) { const p = new URLSearchParams({auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({id, first_name: name})});
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  p.set('hash', crypto.createHmac('sha256', crypto.createHmac('sha256', 'WebAppData').update('111:TEST').digest()).update(dcs).digest('hex')); return p.toString(); }
const call = async (m, path, body, h = {}) => { const r = await fetch(B + path, {method: m, headers: {'Content-Type': 'application/json', ...h}, body: body ? JSON.stringify(body) : undefined}); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return {s: r.status, d}; };
const OWN = {'X-Admin-Key': 'OWNERKEY'};
const msgs = (chat) => SENT.filter(([m, j]) => m === 'sendMessage' && String(j.chat_id) === String(chat));
let r;

/* ---------- team: roles, sign-in links, alerts ---------- */
r = await call('POST', '/api/admin/team', {name: 'Grace Support', role: 'support'}, OWN); assert.ok(r.d.key && r.d.link.startsWith('https://api.test/admin#key=zbt_'));
const GRACE = {'X-Admin-Key': r.d.key};
r = await call('GET', '/api/admin/me', null, GRACE); assert.equal(r.d.me.role, 'support'); assert.ok(r.d.me.perms.includes('inbox'));
r = await call('GET', '/api/admin/engine', null, GRACE); assert.equal(r.s, 403, 'support agents cannot open the AI engine');
r = await call('GET', '/api/admin/team', null, GRACE); assert.equal(r.s, 403);
r = await call('GET', '/api/admin/inbox', null, GRACE); assert.equal(r.s, 200);
r = await call('GET', '/api/admin/me', null, {'X-Admin-Key': 'wrong'}); assert.equal(r.s, 403);
// Grace connects alerts: picks alerts, gets a t.me link, opens it in Telegram
r = await call('POST', '/api/admin/alerts/me', {alerts: ['handoff', 'human_msg']}, GRACE); const code = r.d.alertLink.split('alerts_')[1]; assert.ok(r.d.alertLink.startsWith('https://t.me/zubabot?start=alerts_'));
await BOT.onMessage({message_id: 1, from: {id: 77, first_name: 'Grace'}, chat: {id: 77, type: 'private'}, text: '/start alerts_' + code});
assert.match(msgs(77).at(-1)[1].text, /Alerts connected for Grace Support/);
r = await call('GET', '/api/admin/team', null, OWN); assert.equal(r.d.team.find((x) => x.name === 'Grace Support').tg, true);

/* ---------- Telegram: user asks for a human -> no AI, team alerted, take over, reply, hand back, close + rating ---------- */
const tobi = {id: 501, first_name: 'Tobi', username: 'tobi'}; const say = (text, extra = {}) => BOT.onMessage({message_id: Math.random(), from: tobi, chat: {id: 501, type: 'private'}, text, ...extra});
await say('/start'); const aiBefore = AI.length; SENT.length = 0;
await say('please I want to talk to a real person');
assert.equal(AI.length, aiBefore, 'asking for a human skips the AI');
assert.match(msgs(501).map((m) => m[1].text).join(' '), /getting a teammate/);
const alert = msgs(77).at(-1); assert.match(alert[1].text, /Tobi @tobi needs a human/); assert.equal(alert[1].reply_markup.inline_keyboard[0][0].text, 'Take over');
r = await call('GET', '/api/admin/inbox?filter=needs', null, GRACE); assert.equal(r.d.rows[0].tg_id, '501'); assert.equal(r.d.rows[0].status, 'waiting'); assert.equal(r.d.counts.needs, 1);
// while waiting the assistant stays quiet
SENT.length = 0; await say('hello??'); assert.equal(msgs(501).length, 0); assert.equal(AI.length, aiBefore);
// Grace takes over from the admin -> intro; replies -> user gets it
SENT.length = 0; r = await call('POST', '/api/admin/inbox/take', {tg_id: '501'}, GRACE); assert.equal(r.d.ticket.status, 'human'); assert.equal(r.d.ticket.assignee, 'Grace Support');
assert.match(msgs(501).at(-1)[1].text, /I’m Grace from the Zubabot support team/);
await call('POST', '/api/admin/inbox/reply', {tg_id: '501', text: 'Send me your IQ Option ID please'}, GRACE); assert.equal(msgs(501).at(-1)[1].text, 'Send me your IQ Option ID please');
// user answers -> Grace is alerted in her own Telegram chat, and can reply to that alert directly
SENT.length = 0; await say('it is 12345678'); assert.equal(msgs(501).length, 0, 'AI quiet while Grace has the chat'); const dm = msgs(77).at(-1); assert.match(dm[1].text, /12345678/);
const dmId = 5000 + SENT.indexOf(dm) + 1;
SENT.length = 0; await BOT.onMessage({message_id: 3, from: {id: 77, first_name: 'Grace'}, chat: {id: 77, type: 'private'}, text: 'Found it, your coins are in ✅', reply_to_message: {message_id: dmId}});
assert.equal(msgs(501).at(-1)[1].text, 'Found it, your coins are in ✅', 'reply to an alert reaches the user');
r = await call('GET', '/api/admin/inbox/thread?tg_id=501', null, GRACE); const roles = r.d.msgs.map((m) => m.role); assert.ok(roles.includes('human') && roles.includes('user'));
assert.equal(r.d.msgs.filter((m) => m.role === 'human').at(-1).who, 'Grace Support');
// "teach a better answer" on an AI message -> training note
const aiMsg = db.prepare("SELECT id FROM bot_msgs WHERE tg_id='501' AND role='ai' ORDER BY id LIMIT 1").get();
r = await call('POST', '/api/admin/inbox/teach', {msg_id: aiMsg.id, better: 'Say the welcome bonus is 500 coins.'}, GRACE); assert.match(r.d.note, /answer like this: Say the welcome bonus/);
assert.ok(db.prepare("SELECT 1 FROM knowledge_notes WHERE text LIKE '%welcome bonus is 500%'").get());
// close -> rating buttons; 👎 reopens it for the team
SENT.length = 0; await call('POST', '/api/admin/inbox/close', {tg_id: '501'}, GRACE);
const rate = msgs(501).at(-1)[1]; assert.match(rate.text, /Is everything sorted/); const cbData = rate.reply_markup.inline_keyboard[0][1].callback_data;
await BOT.onCallback({id: 'cb1', data: cbData, from: {id: 501}, message: {chat: {id: 501}, message_id: 99}});
assert.equal(INBOX.open('501').status, 'waiting', '👎 reopens the ticket');
await call('POST', '/api/admin/inbox/handback', {tg_id: '501'}, GRACE); assert.equal(INBOX.open('501'), undefined);
assert.equal(db.prepare('SELECT human_until FROM bot_users WHERE tg_id=?').get('501').human_until, 0, 'assistant answers again');
SENT.length = 0; await say('thanks!'); assert.ok(AI.length > aiBefore, 'AI back on');
r = await call('GET', '/api/admin/activity', null, OWN); assert.ok(r.d.rows.some((x) => x.who === 'Grace Support' && x.action === 'inbox.take_over'));

/* ---------- in-app support chat: transfer + the teammate's reply shows in the app ---------- */
const APPU = {'X-TG-Init-Data': initData(601, 'Bisi')};
await call('GET', '/api/me', null, APPU);
r = await call('POST', '/api/ai/chat', {kind: 'support', agent: 'Ada', text: 'can I speak to a human agent?'}, APPU); assert.equal(r.d.human, true); assert.deepEqual(r.d.messages, []);
r = await call('GET', '/api/support/thread', null, APPU); assert.equal(r.d.status, 'waiting'); assert.match(r.d.msgs.map((m) => m.text).join(' '), /getting a teammate/);
const last = r.d.msgs.at(-1).id;
await call('POST', '/api/admin/inbox/take', {tg_id: '601'}, GRACE);
await call('POST', '/api/admin/inbox/reply', {tg_id: '601', text: 'Hi Bisi, how can I help?'}, GRACE);
r = await call('GET', '/api/support/thread?after=' + last, null, APPU); assert.equal(r.d.status, 'human'); assert.equal(r.d.agent, 'Grace'); assert.equal(r.d.msgs.at(-1).text, 'Hi Bisi, how can I help?'); assert.equal(r.d.msgs.at(-1).who, 'Grace');
r = await call('POST', '/api/ai/chat', {kind: 'support', text: 'my deposit is missing'}, APPU); assert.equal(r.d.human, true, 'no AI while a teammate has the app chat');
await call('POST', '/api/admin/inbox/handback', {tg_id: '601', say: false}, GRACE);

/* ---------- members ---------- */
db.prepare("INSERT INTO users(tg_id,first_name,iq_user_id,linked,created_at,updated_at) VALUES('701','Kemi','IQ701',1,?,?)").run(Date.now(), Date.now());
db.prepare("INSERT INTO aff_accounts(iq_user_id,source,registered_at,deposits_total) VALUES('IQ701','postback',?,1200)").run(Date.now());
db.prepare("INSERT INTO rewards(tg_id,coins,tokens) VALUES('701',100,20)").run();
r = await call('POST', '/api/admin/member/credit', {tg_id: '701', coins: 500, note: ''}, GRACE); assert.equal(r.s, 403, 'support agents cannot give coins');
r = await call('POST', '/api/admin/member/credit', {tg_id: '701', coins: 500, note: ''}, OWN); assert.equal(r.d.error, 'add_a_note');
r = await call('POST', '/api/admin/member/credit', {tg_id: '701', coins: 500, tokens: -5, note: 'sorry for the wait'}, OWN); assert.deepEqual(r.d.rewards, {coins: 600, tokens: 15});
r = await call('GET', '/api/admin/members?q=Kemi', null, GRACE); assert.equal(r.d.rows[0].dep, 1200);
r = await call('GET', '/api/admin/members/one?tg_id=701', null, OWN); assert.equal(r.d.ledger[0].by, 'Owner');

/* ---------- voice calls through our own voice server ---------- */
const KEMI = {'X-TG-Init-Data': initData(701, 'Kemi')};
r = await call('GET', '/api/voice/config'); assert.equal(r.d.on, true); assert.equal(r.d.stt, true); assert.equal(r.d.tts, true); assert.equal(r.d.premium, false);
r = await call('POST', '/api/voice/start', {ai: 'luna', profile: {key: 'luna', name: 'Zara', style: 'Calm trends'}}, KEMI); assert.equal(r.d.ok, true); assert.equal(r.d.tier, 'standard', 'no ElevenLabs key -> standard voice');
const callId = r.d.callId; assert.ok(r.d.sentences.length >= 1 && r.d.sentences[0].clip);
let a = await fetch(B + '/api/voice/clip?id=' + r.d.sentences[0].clip); assert.equal(a.headers.get('content-type'), 'audio/mpeg'); assert.match(Buffer.from(await a.arrayBuffer()).toString(), /^ID3fake-mp3-/);
assert.ok(VS.some(([k, j]) => k === 'tts' && j.voice === 'af_heart'), 'default Kokoro voice');
const audio = Buffer.alloc(6000, 1).toString('base64');
r = await call('POST', '/api/voice/turn', {callId, audio, mime: 'audio/webm;codecs=opus', sec: 2}, KEMI);
assert.equal(r.d.heard, 'what pair are we trading?'); assert.ok(r.d.sentences.length >= 2, 'reply split in sentences'); assert.match(r.d.sentences.map((x) => x.text).join(' '), /EUR\/USD/);
const sttCall = VS.find(([k]) => k === 'stt'); assert.equal(sttCall[1], 'audio/webm;codecs=opus'); assert.equal(sttCall[3], 'Bearer vskey');
assert.match(AI.at(-1).system[1].text, /VOICE CALL/);
for (const s of r.d.sentences) { const x = await fetch(B + '/api/voice/clip?id=' + s.clip); assert.equal(x.status, 200); }
assert.equal(r.d.tokens, 14, 'first minute charged: 1 token (standard)');
r = await call('POST', '/api/voice/end', {callId}, KEMI); assert.equal(r.d.tokensUsed, 1);
// leads: the free welcome call; full -> busy
const LEAD = {'X-TG-Init-Data': initData(801, 'Lola')};
r = await call('POST', '/api/voice/start', {ai: 'luna'}, LEAD); assert.equal(r.d.error, 'voice_locked', 'trader calls need $100+');
r = await call('POST', '/api/voice/start', {kind: 'welcome', ai: 'luna', greeting: 'Hey Lola! Zara here.'}, LEAD); assert.equal(r.d.ok, true); assert.equal(r.d.maxSec, 180); await call('POST', '/api/voice/end', {callId: r.d.callId}, LEAD);
await call('POST', '/api/admin/engine', {voice: {maxCalls: 0}}, OWN);
r = await call('POST', '/api/voice/start', {kind: 'welcome', ai: 'luna', greeting: 'Hi'}, LEAD); assert.equal(r.d.error, 'busy', 'leads wait when calls are full');
r = await call('POST', '/api/voice/start', {ai: 'luna', greeting: 'Hi'}, KEMI); assert.equal(r.d.ok, true, 'funded users always get through'); await call('POST', '/api/voice/end', {callId: r.d.callId}, KEMI);
await call('POST', '/api/admin/engine', {voice: {maxCalls: 60}}, OWN);
r = await call('POST', '/api/voice/say', {lines: ['Hey! Zara here.', 'Your money stays in your own IQ Option account.'], ai: 'luna'}, LEAD); assert.equal(r.d.clips.length, 2); for (const c of r.d.clips) await fetch(B + '/api/voice/clip?id=' + c.clip);
assert.ok(VS.some(([k, j]) => k === 'tts' && /I Q Option/.test(j.text)), 'brand names spelled for the voice');
r = await call('GET', '/api/admin/voice', null, OWN); assert.equal(r.d.servers[0].ok, true); assert.ok(r.d.recent.length >= 3);

/* ---------- AI engine: backup company + budget ---------- */
await call('POST', '/api/admin/engine', {ai: {support: {provider: 'openai', model: 'gpt-4o-mini'}, backup: {provider: 'anthropic', model: 'claude-haiku-5-5'}}}, OWN);
const n0 = AI.length; r = await call('POST', '/api/ai/chat', {kind: 'support', text: 'how do withdrawals work?'}, KEMI); assert.equal(r.s, 200); assert.equal(AI.length, n0 + 1, 'no OpenAI key -> backup answered');
r = await call('GET', '/api/admin/engine', null, OWN); assert.ok(r.d.today > 0, 'spend tracked'); assert.ok(r.d.spend.some((x) => x.area === 'support' && x.provider === 'anthropic'));
await call('POST', '/api/admin/engine', {ai: {budgetUsd: 0.0001}}, OWN);
r = await call('POST', '/api/ai/chat', {kind: 'ai', text: 'hi', profile: {key: 'luna'}}, KEMI); assert.equal(r.s, 503, 'over the daily budget -> app uses its built-in replies');
await call('POST', '/api/admin/engine', {ai: {budgetUsd: 25, support: {provider: 'anthropic', model: 'claude-haiku-5-5'}}}, OWN);

/* ---------- lives from admin ---------- */
await call('POST', '/api/admin/lives', {times: ['09:30', '21:30'], mentor: 'Roland'}, OWN);
SENT.length = 0; await say('/live'); assert.match(msgs(501)[0][1].text, /9:30am and 9:30pm/);
r = await call('GET', '/api/app/config'); assert.deepEqual(r.d.lives.times, ['09:30', '21:30']);

/* ---------- broadcast + block ---------- */
r = await call('GET', '/api/admin/broadcast', null, OWN); assert.ok(r.d.segments.all.count >= 2);
SENT.length = 0; r = await call('POST', '/api/admin/broadcast', {segment: 'all', text: 'Hey {name}! Roland is live at 9:30 🔴', cta: {type: 'live'}}, OWN); assert.ok(r.d.id);
for (let i = 0; i < 30 && db.prepare('SELECT status FROM broadcasts WHERE id=?').get(r.d.id).status !== 'done'; i++) await new Promise((z) => setTimeout(z, 100));
assert.match(msgs(501).at(-1)[1].text, /Hey Tobi! Roland is live/); assert.equal(msgs(501).at(-1)[1].reply_markup.inline_keyboard[0][0].text, '🔴 Join the live');
await call('POST', '/api/admin/member/block', {tg_id: '701', blocked: true}, OWN);
r = await call('GET', '/api/signals', null, KEMI); assert.equal(r.s, 403); assert.equal(r.d.error, 'account_blocked');
r = await call('GET', '/api/admin/overview', null, OWN); assert.ok(r.d.setup.length > 8); assert.equal(r.d.setup.find((x) => x.k === 'Own voice server').ok, true);

/* ---------- charts (MAX) + voice notes (Pro 10/day, MAX) ---------- */
for (const [id, dep] of [['702', 2500], ['703', 1200], ['704', 150]]) { db.prepare("INSERT INTO users(tg_id,first_name,iq_user_id,linked,created_at,updated_at) VALUES(?,?,?,1,?,?)").run(id, 'U' + id, 'IQ' + id, Date.now(), Date.now());
  db.prepare("INSERT INTO aff_accounts(iq_user_id,source,registered_at,deposits_total) VALUES(?,'postback',?,?)").run('IQ' + id, Date.now(), dep); }
const MX = {'X-TG-Init-Data': initData(702, 'Max')}, PR = {'X-TG-Init-Data': initData(703, 'Pro')}, ST = {'X-TG-Init-Data': initData(704, 'Std')};
const png = 'data:image/png;base64,' + Buffer.alloc(300, 7).toString('base64');
r = await call('POST', '/api/ai/chart', {ai: 'luna', image: png}, PR); assert.equal(r.d.error, 'max_only');
r = await call('POST', '/api/ai/chart', {ai: 'luna', image: png, profile: {key: 'luna', name: 'Zara'}}, MX); assert.equal(r.d.ok, true); assert.ok(r.d.messages.length);
assert.equal(AI.at(-1).messages.at(-1).content[0].type, 'image', 'the chart goes to the AI'); assert.match(AI.at(-1).system[1].text, /CHART: the user shared a chart/);
r = await call('POST', '/api/ai/voice-note', {ai: 'luna', audio, mime: 'audio/webm', sec: 2}, ST); assert.equal(r.d.error, 'pro_only');
r = await call('POST', '/api/ai/voice-note', {ai: 'luna', audio, mime: 'audio/webm', sec: 2, profile: {key: 'luna', name: 'Zara'}}, PR); assert.equal(r.d.heard, 'what pair are we trading?'); assert.equal(r.d.left, 9); assert.equal(r.d.clips.length, 0, 'Pro: text reply');
r = await call('POST', '/api/ai/voice-note', {ai: 'luna', audio, mime: 'audio/webm', sec: 2, profile: {key: 'luna', name: 'Zara'}}, MX); assert.ok(r.d.clips.length >= 1, 'MAX: the AI answers out loud too'); assert.equal(r.d.left, 29);
db.prepare("UPDATE ai_usage SET n=10 WHERE tg_id='703' AND day LIKE 'voice:%'").run();
r = await call('POST', '/api/ai/voice-note', {ai: 'luna', audio, mime: 'audio/webm', sec: 2}, PR); assert.equal(r.d.error, 'limit'); assert.equal(r.d.per, 10);
// daily call minutes: 60 a day (tokens still charged)
{ const t0 = Date.now(); db.prepare("INSERT INTO voice_calls(id,tg_id,ai,kind,tier,started_at,last_at,ended_at,secs) VALUES('old1','701','luna','trader','standard',?,?,?,3590)").run(t0 - 1000, t0, t0);
  db.prepare('UPDATE rewards SET tokens=500 WHERE tg_id=?').run('701'); db.prepare("UPDATE users SET blocked=0 WHERE tg_id='701'").run();
  r = await call('POST', '/api/voice/start', {ai: 'luna', greeting: 'Hi'}, KEMI); assert.equal(r.d.error, 'day_limit', 'daily minutes used up ' + JSON.stringify(r.d));
  db.prepare("UPDATE voice_calls SET secs=3000 WHERE id='old1'").run();
  r = await call('POST', '/api/voice/start', {ai: 'luna', greeting: 'Hi'}, KEMI); assert.equal(r.d.ok, true, '10 minutes left'); assert.equal(db.prepare('SELECT cap FROM voice_calls WHERE id=?').get(r.d.callId).cap, 600); await call('POST', '/api/voice/end', {callId: r.d.callId}, KEMI); }
console.log('inbox + voice + admin tests passed');
process.exit(0);
