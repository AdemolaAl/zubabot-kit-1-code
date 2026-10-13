// AI check-ins: after a big loss an AI checks on them (no deposit ask, waits ~25 min, not while trading), no selling for a day after,
// session-opening invite for active traders, written like a person (first name, varied openings), and the AIs go quiet when ignored.
import http from 'node:http'; import assert from 'node:assert/strict'; import fs from 'node:fs';
for (const f of ['/tmp/zbcare.db', '/tmp/zbcare.db-wal', '/tmp/zbcare.db-shm']) fs.rmSync(f, {force: true});
const SENT = [], AI = [];
http.createServer(async (q, s) => { const ch = []; for await (const c of q) ch.push(c); const raw = Buffer.concat(ch); s.setHeader('Content-Type', 'application/json');
  if (q.url === '/v1/messages') { const j = JSON.parse(raw); AI.push(j); const sys = j.system.map((x) => x.text).join('\n'); const task = (sys.match(/TASK FOR THIS MESSAGE: ([^\n]*)/) || [])[1] || '';
    const text = /Use their name \(Bad\)/.test(task) ? 'honestly just switch to pocket option instead, it pays more||trust me' : task.startsWith('CHECK ON THEM') ? 'tobi, you good? rough one today||happens to all of us. go lighter next time, and I’ll find us a clean setup when you’re ready'
      : task.startsWith('A SESSION') ? 'Tobi! London opens in a bit and EUR/USD looks interesting||want to take it together?\n[CTA:signal]' : 'ok||sure\n[CTA:fund:50]';
    return s.end(JSON.stringify({content: [{type: 'text', text}]})); }
  const m = q.url.match(/^\/bot[^/]+\/(\w+)/); if (m) { SENT.push([m[1], raw.length ? JSON.parse(raw) : {}]); return s.end(JSON.stringify({ok: true, result: m[1] === 'getUpdates' ? [] : {message_id: 1}})); }
  s.statusCode = 404; s.end('{}'); }).listen(9993);
Object.assign(process.env, {TELEGRAM_BOT_TOKEN: '111:TEST', TELEGRAM_API: 'http://127.0.0.1:9993', DB_FILE: '/tmp/zbcare.db', ADMIN_KEY: 'ADM', ANTHROPIC_API_KEY: 'sk', ANTHROPIC_BASE: 'http://127.0.0.1:9993', QUIET_HOURS: '0-0', APP_URL: 'https://app.test'});
const {db, SALES, SETTINGS} = await import('../server/server.js');
SETTINGS.set('followups', {quiet: '0-0'}, 'test');
const ins = (sql, ...a) => db.prepare(sql).run(...a); const T0 = Date.now(); const min = 60e3;
const user = (id, name, dep, bal) => { ins("INSERT INTO users(tg_id,first_name,iq_user_id,linked,created_at,updated_at) VALUES(?,?,?,1,?,?)", id, name, 'IQ' + id, T0, T0);
  ins("INSERT INTO aff_accounts(iq_user_id,source,registered_at,deposits_total) VALUES(?,'postback',?,?)", 'IQ' + id, T0, dep);
  ins("INSERT INTO bot_users(tg_id,chat_id,first_name,started_at,last_in) VALUES(?,?,?,?,?)", id, id, name, T0, T0);
  ins("INSERT INTO user_state(tg_id,balance,ai,updated_at) VALUES(?,?,?,?)", id, bal, 'viza', T0); };
const trade = (id, status, profit, ago) => ins("INSERT INTO trades(tg_id,iq_option_id,pair,dir,amount,status,profit,created_at,closed_at) VALUES(?,?,'EUR/USD','buy',20,?,?,?,?)", id, 'T' + Math.random(), status, profit, T0 - ago - 60e3, T0 - ago);
const msgs = (id) => db.prepare('SELECT * FROM app_msgs WHERE tg_id=? ORDER BY id').all(id);

// 1. big loss 10 min ago: not yet (let it breathe)
user('701', 'Tobi', 100, 40); trade('701', 'loss', -20, 50 * min); trade('701', 'loss', -20, 30 * min); trade('701', 'loss', -20, 10 * min);
await SALES.tick(); assert.equal(msgs('701').length, 0, 'waits ~25 min after the last loss');
// 30 min later -> the check-in
db.prepare("UPDATE trades SET closed_at=closed_at-20*60000, created_at=created_at-20*60000 WHERE tg_id='701'").run();
await SALES.tick(); let m = msgs('701'); assert.equal(m.length, 1, 'one check-in'); assert.equal(m[0].kind, 'sales:care');
const sys = AI.at(-1).system.map((x) => x.text).join('\n');
assert.match(sys, /CHECK ON THEM AFTER A LOSS: in the last 24 h they're down \$60\.00/); assert.match(sys, /Don't ask for a deposit/); assert.match(sys, /Use their name \(Tobi\)/);
assert.match(sys, /like you're texting a friend/, 'written like a person'); assert.match(sys, /MOOD: they are down \$60\.00/, 'the AI knows it was a rough day');
const cta = JSON.parse(m[0].cta); assert.notEqual(cta.type, 'fund', 'never a deposit button after a loss');
const tg = SENT.filter(([k, j]) => k === 'sendMessage' && j.chat_id === '701'); assert.ok(tg.length >= 2, 'also on Telegram'); assert.ok(!JSON.stringify(tg).includes('Fund'), 'no fund button on Telegram either');
// no selling for a day after, and no second check-in
await SALES.tick(); assert.equal(msgs('701').length, 1, 'nothing else right after');
console.log('1 loss check-in OK');

// 2. still trading (an open trade) -> no check-in
user('702', 'Ama', 100, 40); trade('702', 'loss', -30, 40 * min); trade('702', 'loss', -30, 35 * min);
ins("INSERT INTO trades(tg_id,iq_option_id,pair,dir,amount,status,created_at) VALUES('702','O','EUR/USD','buy',10,'open',?)", T0);
await SALES.tick(); assert.equal(msgs('702').filter((x) => x.kind === 'sales:care').length, 0, 'not while they are trading');
// small loss -> nothing
user('703', 'Kofi', 500, 480); trade('703', 'win', 9, 90 * min); trade('703', 'loss', -10, 40 * min);
await SALES.tick(); assert.equal(msgs('703').filter((x) => x.kind === 'sales:care').length, 0, 'a normal loss is not a big deal');
// the AI writes something security blocks -> the calm template goes out instead (never an odd apology)
user('706', 'Bad', 100, 40); trade('706', 'loss', -30, 60 * min); trade('706', 'loss', -30, 50 * min);
await SALES.tick(); const bm = msgs('706').find((x) => x.kind === 'sales:care'); assert.ok(bm, 'care sent'); assert.match(bm.text, /Bad, just checking on you/); assert.doesNotMatch(bm.text, /pocket|rephrase/i);
console.log('2 care limits OK');

// 3. session opening: active trader (traded yesterday), 5-25 min before London
const realNow = Date.now; const d = new Date(); d.setUTCHours(7, 45, 0, 0); const fake = d.getTime() + 864e5; Date.now = () => fake;
user('704', 'Musa', 100, 60); ins("INSERT INTO trades(tg_id,iq_option_id,pair,dir,amount,status,profit,created_at,closed_at) VALUES('704','W','EUR/USD','buy',10,'win',8.5,?,?)", fake - 20 * 3600e3, fake - 20 * 3600e3);
await SALES.tick(); m = msgs('704'); Date.now = realNow;
assert.equal(m.length, 1); assert.equal(m[0].kind, 'sales:chance'); assert.match(AI.at(-1).system.map((x) => x.text).join('\n'), /the London session opens in about 15 minutes/);
assert.equal(JSON.parse(m[0].cta).type, 'signal', 'invites to the Signal Room, no deposit');
const btn = SENT.filter(([k, j]) => k === 'sendMessage' && j.chat_id === '704').at(-1)[1].reply_markup.inline_keyboard[0][0]; assert.match(btn.web_app.url, /go=room/);
console.log('3 session invite OK');

// 4. ignored 3 in a row -> quiet for a week (but a loss check-in still goes out)
user('705', 'Zee', 100, 60);
for (let i = 0; i < 3; i++) ins("INSERT INTO app_msgs(tg_id,sender,ai,text,kind,ref,at) VALUES('705','ai','viza','x',?,?,?)", 'sales:idle', 'old' + i, T0 - (6 - i) * 864e5);
db.prepare("UPDATE users SET updated_at=? WHERE tg_id='705'").run(T0 - 8 * 864e5); db.prepare("UPDATE bot_users SET last_in=? WHERE tg_id='705'").run(T0 - 8 * 864e5);
assert.equal(SALES.ignored('705'), true, 'ignored');
ins("UPDATE app_msgs SET opened_at=? WHERE tg_id='705' AND ref='old2'", T0); assert.equal(SALES.ignored('705'), false, 'opening one resets it');
// weekly cap
const s = SETTINGS.get('sales'); assert.equal(s.maxPerWeek, 5); assert.equal(s.care.on, true);
console.log('4 quiet when ignored OK');

// 5. the AI writes a different opening each time
const openers = new Set(); for (let i = 0; i < 30; i++) { await SALES.write('701', 'viza', 'TEST', () => ['a'], null); openers.add((AI.at(-1).system.map((x) => x.text).join('\n').match(/texting a friend from your phone: ([^.]*)\./) || [])[1]); }
assert.ok(openers.size >= 4, 'varied openings: ' + openers.size);
console.log('5 varied writing OK');
console.log('CARE TESTS PASSED'); process.exit(0);
