// Telegram support assistant: /start, AI replies in breaks, CTA buttons, hand-off to the team group and back,
// follow-ups for unfunded users, live invite, top-up nudge, /stop, training notes picked up live.
import http from 'node:http'; import assert from 'node:assert/strict'; import fs from 'node:fs';
fs.rmSync('/tmp/zbbot.db', {force: true});
const SENT = [], AI = [];
http.createServer(async (q, s) => {
  let b = ''; for await (const c of q) b += c; const j = b ? JSON.parse(b) : {}; s.setHeader('Content-Type', 'application/json');
  if (q.url === '/v1/messages') { AI.push(j); const sys = j.system.map((x) => x.text).join('\n');
    const task = (sys.match(/TASK FOR THIS MESSAGE: ([^\n]*)/) || [])[1] || '';
    const last = j.messages.at(-1).content; const lt = typeof last === 'string' ? last : last.map((x) => x.text || '').join(' ');
    const text = /TELEGRAM NUDGE/.test(task) ? (/REAL live signal right now: GBP\/USD/.test(task) ? '{name}, it’s me 👀||GBP/USD BUY lined up, entry soon. Fund and take it with me' : '{name}, quick one||I’m watching EUR/USD for the London open') : task ? (task.startsWith('LIVE') ? 'Tobi! Roland goes live at 6pm WAT 🔴||Come trade along.\n[CTA:live]' : task.startsWith('TOP-UP') ? 'Your balance is at zero, Tobi.||Top up and we go again.\n[CTA:fund:50]' : 'Hey Tobi 👋||Your AI is ready, $20 starts it.\n[CTA:fund:20]')
      : /refund|lawyer/i.test(lt) ? 'I’m sorry about the stress, Tobi.||A teammate will take this one.\n[CTA:human]' : 'Hi Tobi! $20 is enough to start 😊||Your money stays in your own IQ Option account.\n[CTA:fund:20]';
    return s.end(JSON.stringify({content: [{type: 'text', text}]})); }
  if (q.url.startsWith('/file/')) return s.end('OggS-voice-bytes');
  const m = q.url.match(/^\/bot[^/]+\/(\w+)/); if (m) { SENT.push([m[1], j]); return s.end(JSON.stringify({ok: true, result: m[1] === 'getUpdates' ? [] : m[1] === 'sendMessage' ? {message_id: 1000 + SENT.length} : true})); }
  s.statusCode = 404; s.end('{}');
}).listen(9971);
Object.assign(process.env, {TELEGRAM_BOT_TOKEN: '111:TEST', TELEGRAM_API: 'http://127.0.0.1:9971', DB_FILE: '/tmp/zbbot.db', ADMIN_KEY: 'ADM', ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE: 'http://127.0.0.1:9971',
  SUPPORT_TEAM_CHAT_ID: '-100777', APP_URL: 'https://app.test', QUIET_HOURS: '0-0'});
const {BOT, db} = await import('../server/server.js');
const msgs = (chat) => SENT.filter(([m, j]) => m === 'sendMessage' && String(j.chat_id) === String(chat));
const from = {id: 501, first_name: 'Tobi', username: 'tobi', language_code: 'en'};
const say = (text, extra = {}) => BOT.onMessage({message_id: Math.random(), from, chat: {id: 501, type: 'private'}, text, ...extra});

await say('/start ad_tiktok');
let mine = msgs(501); assert.equal(mine.length, 3); assert.match(mine[0][1].text, /Congrats Tobi! 🎉 Your 3 months free is activated/); assert.match(mine[1][1].text, /Any question/); assert.match(mine[2][1].text, /Now launch your AI/);
assert.equal(mine.at(-1)[1].reply_markup.inline_keyboard[0][0].text, '🚀 Launch my AI now'); assert.ok(!mine[0][1].reply_markup && !mine[1][1].reply_markup, 'one button only, on the CTA');
assert.ok(mine.at(-1)[1].reply_markup.inline_keyboard[0][0].web_app.url.startsWith('https://app.test'), 'open button');
assert.equal(db.prepare('SELECT src FROM bot_users WHERE tg_id=?').get('501').src, 'ad_tiktok');
assert.equal(mine.at(-1)[1].reply_markup.inline_keyboard[1][0].callback_data, 'flow:sup', 'support button next to Launch');
SENT.length = 0; await BOT.onCallback({id: 'c1', data: 'flow:sup', from: {id: 501, first_name: 'Tobi'}, message: {chat: {id: 501}, message_id: 5}}); assert.match(msgs(501)[0][1].text, /type your question/);
assert.equal(db.prepare('SELECT flow FROM bot_users WHERE tg_id=?').get('501').flow, 'main');

SENT.length = 0; await say('how much do I need to start?');
mine = msgs(501); assert.equal(mine.length, 2, 'two texts in breaks');
assert.match(mine[1][1].reply_markup.inline_keyboard[0][0].text, /Fund \$20/); assert.match(mine[1][1].reply_markup.inline_keyboard[0][0].web_app.url, /go=fund&amt=20/);
assert.ok(SENT.some(([m]) => m === 'sendChatAction'), 'typing indicator');
const sys = AI.at(-1).system.map((x) => x.text).join('\n');
assert.match(sys, /SUPPORT PLAYBOOK/); assert.match(sys, /FROM THE APP/); assert.match(sys, /Telegram chat/); assert.doesNotMatch(sys, /zedapex|gatevoo|kastra|hornex/i, 'no other projects in the brain');

// training: a team note shows up on the very next message
db.prepare('INSERT INTO knowledge_notes(text,active,created_at,updated_at) VALUES(?,1,?,?)').run('TEST-NOTE: Friday lives are double length.', Date.now(), Date.now());
await say('anything special this week?'); assert.match(AI.at(-1).system[0].text, /TEST-NOTE: Friday lives/, 'note used immediately');

// hand-off to a human and back
SENT.length = 0; await say('I want a refund or I call my lawyer');
const team = msgs('-100777'); if (team.length !== 1) console.log(JSON.stringify(SENT).slice(0, 1500)); assert.equal(team.length, 1, 'forwarded to team'); assert.match(team[0][1].text, /refund/);
const teamMsgId = 1000 + SENT.findIndex(([m, j]) => m === 'sendMessage' && j.chat_id === '-100777') + 1;
SENT.length = 0; await say('hello??'); assert.equal(msgs(501).length, 0, 'assistant quiet while human handles'); assert.equal(msgs('-100777').length, 1, 'new message forwarded');
SENT.length = 0; await BOT.onMessage({message_id: 9, from: {id: 9, first_name: 'Agent'}, chat: {id: -100777, type: 'supergroup'}, text: 'Hi Tobi, I’m on it.', reply_to_message: {message_id: teamMsgId}});
assert.equal(msgs(501).at(-1)[1].text, 'Hi Tobi, I’m on it.', 'team reply relayed');
await BOT.onMessage({message_id: 10, from: {id: 9}, chat: {id: -100777, type: 'supergroup'}, text: '/ai 501'});
assert.equal(db.prepare('SELECT human_until FROM bot_users WHERE tg_id=?').get('501').human_until, 0);

// follow-up for an unfunded user (due now)
db.prepare('UPDATE bot_users SET fu_step=0, fu_next_at=?, last_out=0, last_in=0, live_day=? WHERE tg_id=?').run(Date.now() - 1000, new Date(Date.now() + 3600e3).toISOString().slice(0, 10), '501');
SENT.length = 0; await BOT.tick();
assert.ok(msgs(501).length >= 1, 'follow-up sent'); assert.equal(db.prepare('SELECT fu_step FROM bot_users WHERE tg_id=?').get('501').fu_step, 1);
assert.match(AI.at(-1).system[1].text, /FOLLOW-UP step 1/);

// funded user with zero balance -> top-up nudge
db.prepare("INSERT INTO users(tg_id,first_name,iq_user_id,linked,created_at,updated_at) VALUES('501','Tobi','IQ501',1,?,?)").run(Date.now(), Date.now());
db.prepare("INSERT INTO aff_accounts(iq_user_id,source,registered_at,deposits_total) VALUES('IQ501','postback',?,100)").run(Date.now());
db.prepare("INSERT INTO user_state(tg_id,balance,updated_at) VALUES('501',0,?)").run(Date.now());
db.prepare('UPDATE bot_users SET last_dep=100, last_out=0, topup_at=0 WHERE tg_id=?').run('501');
SENT.length = 0; await BOT.tick();
assert.match(AI.at(-1).system[1].text, /TOP-UP/); assert.match(AI.at(-1).system[1].text, /ZERO BALANCE/);
assert.match(msgs(501).at(-1)[1].reply_markup.inline_keyboard[0][0].text, /Fund \$50/);

// hourly nudge: replaces the previous one, fits the stage (funded + live signal -> the real signal)
db.prepare('UPDATE bot_users SET nudge_at=0, last_out=0, last_in=0, started_at=?, fu_step=6 WHERE tg_id=?').run(Date.now(), '501');
db.prepare("UPDATE users SET updated_at=0 WHERE tg_id='501'").run(); db.prepare("UPDATE user_state SET balance=50 WHERE tg_id='501'").run();
db.prepare("INSERT INTO signals(pair,dir,mode,step,status,expiry_min,entry_at,expires_at,created_at) VALUES('EUR/USD OTC','buy','live',1,'open',1,?,?,?)").run(Date.now() + 120e3, Date.now() + 180e3, Date.now());
process.env.TZ = 'UTC'; const { SETTINGS } = await import('../server/server.js'); SETTINGS.set('funnel', {nudgeHours: '0-24'});
SENT.length = 0; await BOT.tick(); let nd = msgs(501).at(-1); assert.match(nd[1].text, /New signal now!\nEUR\/USD OTC · BUY · 1 min/); assert.equal(nd[1].reply_markup.inline_keyboard[0][0].text, '⚡ Take this signal');
db.prepare('UPDATE bot_users SET nudge_at=?, last_out=0 WHERE tg_id=?').run(Date.now() - 61 * 60e3, '501');
SENT.length = 0; await BOT.tick(); assert.ok(SENT.some(([k, j]) => k === 'deleteMessage' && String(j.chat_id) === '501'), 'previous nudge deleted'); assert.equal(msgs(501).length, 1);
SENT.length = 0; await BOT.tick(); assert.equal(msgs(501).length, 0, 'not again within the hour');
// per-funnel follow-ups, written by THEIR AI in their language, with the real live signal; one AI call shared by everyone at that stage this hour
{ const T0 = Date.now(); db.prepare("UPDATE funnels SET follow=? WHERE slug='main'").run(JSON.stringify({on: true, every: 60, style: 'ai', hours: '0-24', days: 14, stages: ['no_deposit'], signals: true}));
  for (const [id, nm] of [['601', 'Ama'], ['602', 'Kofi']]) { db.prepare("INSERT OR REPLACE INTO bot_users(tg_id,chat_id,first_name,started_at,last_in,last_out,nudge_at,fu_step,bot) VALUES(?,?,?,?,0,0,0,6,0)").run(id, id, nm, T0);
    db.prepare("INSERT OR REPLACE INTO users(tg_id,first_name,iq_user_id,linked,created_at,updated_at) VALUES(?,?,?,1,?,0)").run(id, nm, 'IQ' + id, T0); db.prepare("INSERT OR REPLACE INTO attrib(tg_id,funnel,first_at) VALUES(?,'main',?)").run(id, T0);
    db.prepare("INSERT OR REPLACE INTO user_state(tg_id,ai,updated_at) VALUES(?,'viza',?)").run(id, T0); }
  db.prepare("UPDATE signals SET status='done'").run(); db.prepare("INSERT INTO signals(pair,dir,mode,step,status,expiry_min,entry_at,expires_at,created_at) VALUES('GBP/USD','buy','live',1,'open',5,?,?,?)").run(T0 + 300e3, T0 + 600e3, T0);
  const before = AI.length; SENT.length = 0; await BOT.tick();
  const a = msgs(601).at(-1), b = msgs(602).at(-1); assert.ok(a && b, 'both got the follow-up');
  assert.match(a[1].text, /· your AI trader\nAma, it’s me 👀\nGBP\/USD BUY lined up/, 'their AI, their name, the real signal'); assert.match(b[1].text, /^.*\nKofi, it’s me/, 'personalised for each person');
  assert.match(a[1].reply_markup.inline_keyboard[0][0].text, /Fund \$20/, 'not funded -> fund button');
  const calls = AI.slice(before).filter((j) => /TELEGRAM NUDGE/.test(j.system.map((x) => x.text).join(''))); assert.equal(calls.length, 1, 'one AI call for the whole group this hour');
  assert.match(calls[0].system.map((x) => x.text).join(''), /YOU ARE Viza/i, 'written as their own AI');
  SENT.length = 0; await BOT.tick(); assert.equal(msgs(601).length, 0, 'every 60 min, not every tick');
  db.prepare("UPDATE funnels SET follow=? WHERE slug='main'").run(JSON.stringify({on: false})); db.prepare("UPDATE bot_users SET nudge_at=0 WHERE tg_id IN ('601','602')").run();
  SENT.length = 0; await BOT.tick(); assert.equal(msgs(601).length, 0, 'switched off for this funnel');
  db.prepare("UPDATE funnels SET follow=? WHERE slug='main'").run(JSON.stringify({on: true, every: 60, style: 'ai', hours: '0-24', days: 14, stages: ['no_deposit']})); db.prepare("UPDATE bot_users SET nudge_at=0 WHERE tg_id IN ('601','602')").run();
  SETTINGS.set('funnel', {nudgeHours: '0-24', nudgeOn: false}); SENT.length = 0; await BOT.tick(); assert.equal(msgs(601).length, 0, 'main switch off wins over the funnel');
  SETTINGS.set('funnel', {nudgeHours: '0-24', nudgeOn: true});
  db.prepare("UPDATE funnels SET follow=NULL WHERE slug='main'").run(); db.prepare("UPDATE bot_users SET stopped=1 WHERE tg_id IN ('601','602')").run(); }
console.log('funnel AI follow-ups OK');
// /stop
SENT.length = 0; await say('/stop'); assert.match(msgs(501)[0][1].text, /No more reminders/);
db.prepare('UPDATE bot_users SET fu_next_at=?, fu_step=2, last_out=0, topup_at=0 WHERE tg_id=?').run(Date.now() - 1, '501');
SENT.length = 0; await BOT.tick(); assert.equal(msgs(501).length, 0, 'no follow-ups after /stop');

// lost on IQ Option's website: 10+ min after opening the sign-up and still not connected -> "still on IQ Option?"; registration postback -> "your account is ready, come back"
const {handlePostback} = await import('../server/server.js');
db.prepare("INSERT INTO bot_users(tg_id,chat_id,first_name,started_at,last_in) VALUES('777','777','Ifeoma',?,?)").run(Date.now(), Date.now());
db.prepare("INSERT INTO users(tg_id,first_name,linked,created_at,updated_at) VALUES('777','Ifeoma',0,?,?)").run(Date.now(), Date.now());
db.prepare("INSERT INTO oauth_states(state,tg_id,kind,created_at) VALUES('s777','777','new',?)").run(Date.now() - 15 * 60e3);
SENT.length = 0; await BOT.backTick(); assert.match(msgs(777).map((m) => m[1].text).join(' '), /still on IQ Option/); assert.equal(msgs(777).at(-1)[1].reply_markup.inline_keyboard[0][0].text, '🔙 Come back to Zubabot');
SENT.length = 0; await BOT.backTick(); assert.equal(msgs(777).length, 0, 'only once');
SENT.length = 0; handlePostback({event: 'registration', user_id: '9770001', afftrack: 'Zubabot_tg777'}); for (let i = 0; i < 40 && msgs(777).length < 2; i++) await new Promise((z) => setTimeout(z, 100));
assert.match(msgs(777)[0][1].text, /your IQ Option account is ready/); assert.equal(msgs(777).at(-1)[1].reply_markup.inline_keyboard[0][0].text, '🚀 Back to Zubabot');
assert.equal(db.prepare("SELECT linked FROM users WHERE tg_id='777'").get().linked, 1);
// Telegram Business: a Premium account connected to the bot; the bot answers in that chat as the account; the team typing there = human take-over
BOT.onBizConnection({id: 'BC1', user: {id: 7000}, user_chat_id: 7000, is_enabled: true, can_reply: true});
SENT.length = 0; await BOT.onBizMessage({message_id: 1, business_connection_id: 'BC1', from: {id: 811, first_name: 'Kemi'}, chat: {id: 811, type: 'private'}, text: 'how much do I need to start?'});
const bz = SENT.filter(([k, j]) => k === 'sendMessage' && String(j.chat_id) === '811'); assert.ok(bz.length >= 1 && bz.every(([, j]) => j.business_connection_id === 'BC1'), 'replies go through the Business account');
await BOT.onBizMessage({message_id: 2, business_connection_id: 'BC1', from: {id: 7000, first_name: 'Team'}, chat: {id: 811, type: 'private'}, text: 'Hi Kemi, Grace here'});
SENT.length = 0; await BOT.onBizMessage({message_id: 3, business_connection_id: 'BC1', from: {id: 811, first_name: 'Kemi'}, chat: {id: 811, type: 'private'}, text: 'ok thanks'});
assert.equal(SENT.filter(([k, j]) => k === 'sendMessage' && String(j.chat_id) === '811').length, 0, 'assistant quiet after the team typed in the Business chat');
// voice notes: the assistant listens (speech-to-text) and answers what was said
{ let gotLang = null; BOT.hooks.stt = async (buf, mime, sec, lang) => { gotLang = lang; return {text: 'how much do I need to start?'}; };
  SENT.length = 0; const before = AI.length;
  await BOT.onMessage({message_id: 77, from, chat: {id: 501, type: 'private'}, voice: {file_id: 'V1', duration: 4, mime_type: 'audio/ogg'}});
  const asked = AI.slice(before).map((j) => JSON.stringify(j.messages.at(-1).content)).join(' ');
  assert.match(asked, /how much do I need to start/, 'the AI got what was said in the voice note'); assert.equal(gotLang, 'en');
  assert.ok(msgs(501).some(([, j]) => /\$20 is enough/.test(j.text)), 'answered the voice note');
  assert.ok(SENT.some(([k]) => k === 'getFile'), 'downloaded the voice note');
  BOT.hooks.stt = async () => { throw new Error('down'); }; SENT.length = 0;
  await BOT.onMessage({message_id: 78, from, chat: {id: 501, type: 'private'}, voice: {file_id: 'V2', duration: 3}});
  assert.match(msgs(501).map(([, j]) => j.text).join(' '), /couldn’t hear that one/, 'speech service down -> asks to resend or type');
  // a teammate has the chat: unreadable voice note goes to them, the assistant stays quiet
  db.prepare("INSERT INTO tickets(tg_id,channel,status,reason,first_text,opened_at,updated_at,last_user_at,assignee) VALUES('501','tg','human','t','x',?,?,?,'Grace')").run(Date.now(), Date.now(), Date.now()); SENT.length = 0;
  await BOT.onMessage({message_id: 79, from, chat: {id: 501, type: 'private'}, voice: {file_id: 'V3', duration: 3}});
  assert.equal(msgs(501).length, 0, 'no auto-reply while a human has the chat');
  assert.ok(db.prepare("SELECT 1 FROM bot_msgs WHERE tg_id='501' AND text LIKE '%voice note, not transcribed%'").get(), 'saved for the teammate');
  db.prepare("UPDATE tickets SET status='closed', closed_at=? WHERE tg_id='501'").run(Date.now()); db.prepare("UPDATE bot_users SET human_until=0 WHERE tg_id='501'").run();
  // daily listening limit
  BOT.hooks.stt = async () => ({text: 'hello'}); db.prepare("INSERT INTO ai_usage(tg_id,day,n) VALUES('501',?,99) ON CONFLICT(tg_id,day) DO UPDATE SET n=99").run('stt:' + new Date().toISOString().slice(0, 10));
  SENT.length = 0; const g0 = SENT.length; await BOT.onMessage({message_id: 80, from, chat: {id: 501, type: 'private'}, voice: {file_id: 'V4', duration: 3}});
  assert.ok(!SENT.some(([k]) => k === 'getFile'), 'over the daily limit: not downloaded'); assert.match(msgs(501).map(([, j]) => j.text).join(' '), /type it/); }
console.log('voice note OK');
// AI down -> templates, never silent
process.env.ANTHROPIC_API_KEY = '';
console.log('bot tests passed');
process.exit(0);
