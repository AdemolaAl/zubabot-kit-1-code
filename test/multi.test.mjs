// Funnels, many bots, languages, funnel mentors and security, end to end on one server:
//  - a funnel with its own mentor (name + photo): bot messages, flow buttons, /live, the AI and the app config all use that mentor, never Roland
//  - a funnel mentor with no lives: no live invites at all
//  - sub-IDs: first touch wins, afftrack carries the sub, admin stats per sub
//  - affiliate safety: wrong aff IDs refused, owner-only allowed IDs, every admin alerted (email) when links change
//  - security gate: private contacts flagged, other brokers / wrong aff blocked in inbox replies, broadcasts, channel posts
//  - a second bot (Spanish): messages go out through that bot's token, in Spanish, no Roland, no live buttons
//  - channel join requests: approved, then the welcome flow is DMed
import crypto from 'node:crypto'; import http from 'node:http'; import assert from 'node:assert/strict'; import fs from 'node:fs';
for (const f of ['/tmp/zbmulti.db', '/tmp/zbmulti.db-wal', '/tmp/zbmulti.db-shm']) fs.rmSync(f, {force: true});
const SENT = [], AI = []; let AI_TEXT = null;
http.createServer(async (rq, s) => {
  let b = ''; for await (const c of rq) b += c; const j = b ? JSON.parse(b) : {}; s.setHeader('Content-Type', 'application/json');
  if (rq.url === '/v1/messages') { AI.push(j); const sys = j.system.map((x) => x.text).join('\n');
    // the translator asks for JSON; everything else is a chat reply
    if (/translat/i.test(sys) && /JSON/.test(sys)) { const src = JSON.parse((typeof j.messages.at(-1).content === 'string' ? j.messages.at(-1).content : j.messages.at(-1).content[0].text).match(/\{[\s\S]*\}|\[[\s\S]*\]/)[0]);
      const out = Array.isArray(src) ? src.map((x) => 'ES:' + x) : Object.fromEntries(Object.entries(src).map(([k, v]) => [k, 'ES:' + v])); return s.end(JSON.stringify({content: [{type: 'text', text: JSON.stringify(out)}]})); }
    return s.end(JSON.stringify({content: [{type: 'text', text: AI_TEXT || 'Hi! Roland goes live at 6pm, come trade along with Roland 🔴||Your money stays in your own IQ Option account.\n[CTA:live]'}]})); }
  const m = rq.url.match(/^\/bot([^/]+)\/(\w+)/);
  if (m) { SENT.push([m[2], j, m[1]]); const r = m[2] === 'getMe' ? {id: m[1].startsWith('222') ? 222 : 111, username: m[1].startsWith('222') ? 'zb_es_bot' : 'zb_main_bot', first_name: 'Zubabot'}
      : m[2] === 'getUpdates' ? [] : m[2] === 'sendMessage' ? {message_id: 1000 + SENT.length} : m[2] === 'getChat' ? {id: j.chat_id, title: 'Zubabot Signals'} : true;
    return s.end(JSON.stringify({ok: true, result: r})); }
  s.statusCode = 404; s.end('{}');
}).listen(9981);
Object.assign(process.env, {TELEGRAM_BOT_TOKEN: '111:TEST', TELEGRAM_API: 'http://127.0.0.1:9981', DB_FILE: '/tmp/zbmulti.db', ADMIN_KEY: 'AK', ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE: 'http://127.0.0.1:9981',
  SUPPORT_TEAM_CHAT_ID: '-100777', APP_URL: 'https://app.test', QUIET_HOURS: '0-0', BOT_MODE: 'off', SUPPORT_MODE: 'off', AFF_ID: '743768', IQ_CLIENT_ID: '1', IQ_CLIENT_SECRET: 'x', POSTBACK_KEY: 'p'});
const {createServer, db, BOT, TEAM, FUN, I18N, SETTINGS} = await import('../server/server.js');
const srv = createServer().listen(9982); const B = 'http://127.0.0.1:9982';
const admin = async (path, body) => { const r = await fetch(B + path, {method: body === undefined ? 'GET' : 'POST', headers: {'content-type': 'application/json', 'X-Admin-Key': 'AK'}, body: body === undefined ? undefined : JSON.stringify(body)}); return {status: r.status, ...(await r.json())}; };
function initData(id, name, tok = '111:TEST') { const p = new URLSearchParams({auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'Q', user: JSON.stringify({id, first_name: name})});
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  p.set('hash', crypto.createHmac('sha256', crypto.createHmac('sha256', 'WebAppData').update(tok).digest()).update(dcs).digest('hex')); return p.toString(); }
const app = async (id, path, body, tok) => (await (await fetch(B + path, {method: body === undefined ? 'GET' : 'POST', headers: {'content-type': 'application/json', 'X-TG-Init-Data': initData(id, 'U' + id, tok)}, body: body === undefined ? undefined : JSON.stringify(body)})).json());
const msgs = (chat) => SENT.filter(([m, j]) => (m === 'sendMessage' || m === 'sendPhoto') && String(j.chat_id) === String(chat));
const textOf = (chat) => msgs(chat).map(([, j]) => (j.text || j.caption || '') + ' ' + JSON.stringify(j.reply_markup || {})).join('\n');
const say = async (id, text, botId = 0, name = 'Tobi') => BOT.route({update_id: Math.floor(Math.random() * 1e9), message: {message_id: Math.floor(Math.random() * 1e6), from: {id, first_name: name, language_code: 'en'}, chat: {id, type: 'private'}, date: Math.floor(Date.now() / 1000), text}}, botId);
const ALERTS = []; const origAlert = TEAM.alert; TEAM.alert = (...a) => { ALERTS.push(a); return origAlert(...a); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
SETTINGS.set('lives', {on: true, mentor: 'Roland', times: ['10:00', '15:00', '18:00', '22:00']}, 'test');

/* ---------- 1. funnels: affiliate safety ---------- */
let r = await admin('/api/admin/funnels/save', {slug: 'uk-james', name: 'UK James', lang: 'en', type: 'bot', bot: 0, aff_link: 'https://iqbroker.com/lp/x/en/?aff=999999'});
assert.equal(r.status, 400); assert.match(r.error, /must contain aff=743768/);
r = await admin('/api/admin/funnels/save', {slug: 'uk-james', name: 'UK James', lang: 'en', type: 'bot', bot: 0, aff_id: '555'}); assert.equal(r.status, 400, 'aff ID not ours');
r = await admin('/api/admin/funnels/save', {slug: 'uk-james', name: 'UK James', lang: 'en', type: 'bot', bot: 0, track: 'uk_fb_', aff_link: 'https://iqbroker.com/lp/regframe-01-light-nosocials/en/?aff=743768&afftrack={afftrack}',
  mentor: {on: true, name: 'James', role: 'Head trader', bio: '10 years on forex', photo: 'mentors/lead-es.jpg', lives: 'main'}});
assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.funnel.mentor.name, 'James'); assert.equal(r.funnel.mentor.lives, 'main');
r = await admin('/api/admin/funnels/save', {slug: 'uk-x', name: 'x', lang: 'en', mentor: {on: true, name: ''}}); assert.equal(r.status, 400, 'mentor needs a name');
r = await admin('/api/admin/funnels/save', {slug: 'uk-x', name: 'x', lang: 'en', mentor: {on: true, name: 'Kate', lives: 'own'}}); assert.equal(r.status, 400, 'own lives need link + times');
r = await admin('/api/admin/funnels/save', {slug: 'uk-x', name: 'x', lang: 'en', mentor: {on: true, name: 'Kate', photo: 'javascript:alert(1)'}}); assert.equal(r.status, 400, 'bad photo refused');
r = await admin('/api/admin/funnels/save', {slug: 'uk-quiet', name: 'UK quiet', lang: 'en', mentor: {on: true, name: 'Grace', lives: 'off'}}); assert.equal(r.ok, true);
console.log('1 funnel + affiliate checks OK');

/* ---------- 2. a person from the James funnel: everything says James ---------- */
SENT.length = 0; await say(801, '/start f_uk-james_buyer1'); await wait(50);
const a801 = db.prepare('SELECT * FROM attrib WHERE tg_id=?').get('801'); assert.equal(a801.funnel, 'uk-james'); assert.equal(a801.sub, 'buyer1');
let t = textOf(801); assert.ok(t.length > 20, 'welcome flow sent'); assert.doesNotMatch(t, /Roland/, 'no Roland in the welcome flow');
// first touch wins
await say(801, '/start f_main_other'); assert.equal(db.prepare('SELECT funnel, sub FROM attrib WHERE tg_id=?').get('801').sub, 'buyer1');
SENT.length = 0; await say(801, '/live'); t = textOf(801); assert.match(t, /James, our lead mentor, goes live every day/); assert.doesNotMatch(t, /Roland/);
// the AI: told the mentor is James, and anything it says about Roland becomes James
SENT.length = 0; AI.length = 0; await say(801, 'when is the next live?'); t = textOf(801);
const sys801 = AI.at(-1).system.map((x) => x.text).join('\n'); assert.match(sys801, /lead mentor is James \(Head trader\)/); assert.match(sys801, /Never mention Roland/);
assert.match(t, /James goes live at 6pm, come trade along with James/); assert.doesNotMatch(t, /Roland/);
// the app: config carries the funnel mentor
let c = await app(801, '/api/app/config'); assert.equal(c.mentor.name, 'James'); assert.equal(c.mentor.photo, 'mentors/lead-es.jpg'); assert.equal(c.lives.mentor, 'James'); assert.equal(c.lives.on, true);
assert.deepEqual(c.lives.times, ['10:00', '15:00', '18:00', '22:00'], 'lives "main" = same times as Roland');
// afftrack: funnel tracking name + sub + telegram ID, link = the funnel's own
const aff = FUN.affFor('801'); assert.equal(aff.afftrack, 'uk_fb_buyer1_tg801'); assert.match(aff.link, /aff=743768/);
// someone from the main funnel still sees Roland
SENT.length = 0; await say(802, '/start'); await wait(30); c = await app(802, '/api/app/config'); assert.equal(c.mentor, null); assert.equal(c.lives.mentor, 'Roland');
SENT.length = 0; await say(802, '/live'); assert.match(textOf(802), /Roland, our lead mentor/);
// a teammate writes "Roland" to a James person -> James
SENT.length = 0; await admin('/api/admin/inbox/take', {tg_id: '801'}); r = await admin('/api/admin/inbox/reply', {tg_id: '801', text: 'Roland will answer you after the live'}); assert.equal(r.ok, true);
assert.match(textOf(801), /James will answer you after the live/);
const th = await admin('/api/admin/inbox/thread?tg_id=801'); assert.equal(th.user.mentor, 'James', 'the inbox tells the teammate who the mentor is');
await admin('/api/admin/inbox/handback', {tg_id: '801', say: false});
console.log('2 funnel mentor everywhere OK');

/* ---------- 3. funnel mentor without lives ---------- */
SENT.length = 0; await say(803, '/start f_uk-quiet'); await wait(30); t = textOf(803); assert.doesNotMatch(t, /Roland/); assert.doesNotMatch(t, /go=live/, 'no live button when the funnel has no lives');
SENT.length = 0; await say(803, '/live'); assert.doesNotMatch(textOf(803), /goes live/); c = await app(803, '/api/app/config'); assert.equal(c.mentor.name, 'Grace'); assert.equal(c.lives.on, false);
AI.length = 0; await say(803, 'any lives?'); assert.match(AI.at(-1).system.map((x) => x.text).join('\n'), /no lives for this person/);
console.log('3 mentor without lives OK');

/* ---------- 4. admin stats per sub, history, alerts on link changes ---------- */
r = await admin('/api/admin/funnels/subs?slug=uk-james'); assert.ok(r.rows.some((x) => /buyer1/.test(JSON.stringify(x))), 'sub stats');
ALERTS.length = 0;
r = await admin('/api/admin/funnels/save', {edit: true, slug: 'uk-james', name: 'UK James', lang: 'en', type: 'bot', bot: 0, track: 'uk_fb_', aff_link: 'https://iqbroker.com/lp/regframe-01-light-nosocials/en/?aff=743768&afftrack={afftrack}&x=2',
  mentor: {on: true, name: 'James', role: 'Head trader', photo: 'mentors/lead-es.jpg', lives: 'own', link: 'https://t.me/+PrivateGroupXyz', times: '19:00', tz: 'GMT', offset: 0}});
assert.equal(r.ok, true); assert.match(r.warn || '', /Security flagged/, 'private live link flagged');
assert.ok(ALERTS.some(([type, text, o]) => type === 'security' && /Sign-up link/.test(text) && /Mentor live link/.test(text) && o.all && o.email), 'every admin alerted by email');
const hist = await admin('/api/admin/funnels/history?slug=uk-james'); assert.ok(hist.rows.length >= 2 && hist.rows[0].who, 'who changed it is kept');
c = await app(801, '/api/app/config'); assert.deepEqual(c.lives.times, ['19:00']); assert.equal(c.lives.tz, 'GMT'); assert.equal(c.lives.link, 'https://t.me/+PrivateGroupXyz');
// photo upload
const png = 'data:image/png;base64,' + fs.readFileSync(new URL('../web/mentors/lead-fr.jpg', import.meta.url)).toString('base64');
r = await admin('/api/admin/funnels/photo', {slug: 'uk-james', data: png.replace('image/png', 'image/jpeg')}); assert.equal(r.ok, true); assert.match(r.url, /^\/api\/mphoto\?n=uk-james-/);
const ph = await fetch(B + r.url); assert.equal(ph.status, 200); assert.equal(ph.headers.get('content-type'), 'image/jpeg');
r = await admin('/api/admin/funnels/save', {edit: true, slug: 'uk-james', name: 'UK James', lang: 'en', mentor: {on: true, name: 'James', photo: r.url, lives: 'main'}}); assert.equal(r.ok, true); assert.match(r.funnel.mentor.photo, /^\/api\/mphoto/);
console.log('4 stats, history, alerts, photo OK');

/* ---------- 5. security gate ---------- */
await admin('/api/admin/inbox/take', {tg_id: '802'});
r = await admin('/api/admin/inbox/reply', {tg_id: '802', text: 'text me on whatsapp +44 7700 900123 for a better deal'}); assert.equal(r.ok, true, 'flag = delivered but recorded');
r = await admin('/api/admin/inbox/reply', {tg_id: '802', text: 'open your account here https://iqbroker.com/lp/x/en/?aff=111222'}); assert.equal(r.ok, false, 'wrong aff = blocked'); assert.match(r.error, /Not sent/);
r = await admin('/api/admin/inbox/reply', {tg_id: '802', text: 'switch to olymptrade, it pays more'}); assert.equal(r.ok, false, 'other broker = blocked');
const ev = db.prepare('SELECT severity, action, source FROM security_events ORDER BY id').all();
assert.ok(ev.some((e) => e.severity === 'flag' && e.action === 'delivered')); assert.ok(ev.filter((e) => e.action === 'blocked').length >= 2);
r = await admin('/api/admin/broadcast', {text: 'Big bonus today: send 50 USDT to TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE and we double it', segment: 'all'}); assert.equal(r.status, 400, 'broadcast asking for money blocked'); assert.match(r.error, /Blocked for security review/);
// channel watch: the bot is admin in a channel, a post sends people to a private DM
await BOT.route({update_id: 9, channel_post: {message_id: 5, chat: {id: -100555, type: 'channel', title: 'Signals'}, date: 1, text: 'DM me @fastmoneyguy for VIP signals'}}, 0);
assert.ok(db.prepare("SELECT 1 FROM security_events WHERE text LIKE '%fastmoneyguy%'").get(), 'channel post recorded');
assert.ok(db.prepare("SELECT 1 FROM security_watch WHERE chat_id='-100555'").get(), 'channel listed as watched');
// affiliate IDs: owner only, every admin told by email
ALERTS.length = 0; r = await admin('/api/admin/security/settings', {affIds: ['743768', '800800']}); assert.equal(r.ok, true);
assert.ok(ALERTS.some(([type, text, o]) => type === 'security' && /Affiliate IDs changed/.test(text) && o.email && o.all));
r = await admin('/api/admin/funnels/save', {slug: 'uk-two', name: 'two', lang: 'en', aff_id: '800800'}); assert.equal(r.ok, true, 'a newly allowed ID works');
await admin('/api/admin/security/settings', {affIds: ['743768']});
console.log('5 security OK');

/* ---------- 6. a Spanish bot ---------- */
I18N.setLive('es', true);
r = await admin('/api/admin/bots/add', {token: '222333:ESBOTabcdefghijklmnopqrstuvwxyz0123', lang: 'es'}); assert.equal(r.ok, true, JSON.stringify(r)); const esBot = r.bot.id; assert.equal(r.bot.username, 'zb_es_bot');
const esFunnel = r.funnel; assert.ok(esFunnel);
SENT.length = 0; await say(804, '/start', esBot, 'Luis'); await wait(50);
const out804 = SENT.filter(([m, j]) => m === 'sendMessage' && String(j.chat_id) === '804');
assert.ok(out804.length, 'Spanish welcome sent'); assert.ok(out804.every(([, , tok]) => tok === '222333:ESBOTabcdefghijklmnopqrstuvwxyz0123'), 'sent through the Spanish bot');
t = textOf(804); assert.doesNotMatch(t, /Roland/); assert.doesNotMatch(t, /go=live/, 'no lives in Spanish yet'); assert.match(t, /l=es/, 'app opens in Spanish');
assert.equal(FUN.langOf('804'), 'es');
const enWelcome = SETTINGS.get('flows').list[SETTINGS.get('flows').active].steps[0].text.replace('{name}', 'Luis');
assert.notEqual(out804[0][1].text, enWelcome, 'the welcome is not in English');
c = await app(804, '/api/app/config', undefined, '222333:ESBOTabcdefghijklmnopqrstuvwxyz0123'); assert.equal(c.lang, 'es'); assert.equal(c.lives.on, false); assert.equal(c.support.name, 'Sofía');
// the Spanish AI support has its own name
AI.length = 0; AI_TEXT = '¡Hola Luis! Con $20 empiezas.||Tu dinero está en tu cuenta.\n[CTA:fund:20]'; await say(804, 'cuánto necesito?', esBot, 'Luis'); AI_TEXT = null;
const sysEs = AI.at(-1).system.map((x) => x.text).join('\n'); assert.match(sysEs, /Sofía/); assert.match(sysEs, /never mention Roland/i);
// the app knows the person's bot (initData signed by the Spanish bot)
const me804 = await app(804, '/api/me', undefined, '222333:ESBOTabcdefghijklmnopqrstuvwxyz0123'); assert.equal(me804.lang, 'es');
// local AI traders only in their region
const esAis = I18N.localAis().filter((a) => a.lang === 'es' || /^es-/.test(a.key)); assert.ok(esAis.length >= 4, 'Spanish local AIs');
console.log('6 Spanish bot OK');

/* ---------- 7. channel join requests ---------- */
r = await admin('/api/admin/funnels/save', {slug: 'tg-channel', name: 'Channel', lang: 'en', type: 'join', bot: 0, channel_id: '-100999', approve: 'instant'}); assert.equal(r.ok, true);
SENT.length = 0; await BOT.route({update_id: 77, chat_join_request: {chat: {id: -100999, type: 'channel', title: 'Zubabot Signals'}, from: {id: 805, first_name: 'Ama'}, user_chat_id: 805, date: Math.floor(Date.now() / 1000)}}, 0);
await wait(100); await BOT.joinTick();
assert.ok(SENT.some(([m, j]) => m === 'approveChatJoinRequest' && j.user_id === 805), 'approved');
assert.ok(msgs(805).length, 'welcome DM after joining'); assert.equal(db.prepare('SELECT funnel FROM attrib WHERE tg_id=?').get('805').funnel, 'tg-channel');
console.log('7 join requests OK');

console.log('MULTI TESTS PASSED'); srv.close(); process.exit(0);
