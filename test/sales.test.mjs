// Sales engine: win streak upsell (app preview + Telegram), next-level amount, limits, idle check-in, "almost there", stats.
import http from 'node:http'; import crypto from 'node:crypto'; import assert from 'node:assert/strict'; import fs from 'node:fs';
for (const f of ['/tmp/zbsl.db', '/tmp/zbsl.db-wal', '/tmp/zbsl.db-shm']) fs.rmSync(f, {force: true});
const SENT = [], AI = [];
http.createServer(async (q, s) => { const ch = []; for await (const c of q) ch.push(c); const raw = Buffer.concat(ch); s.setHeader('Content-Type', 'application/json');
  if (q.url === '/v1/messages') { const j = JSON.parse(raw); AI.push(j); const task = (j.system[1].text.match(/TASK FOR THIS MESSAGE: ([^\n]*)/) || [])[1] || '';
    const amt = (task.match(/\[CTA:fund:(\d+)\]/) || [])[1];
    return s.end(JSON.stringify({content: [{type: 'text', text: task.startsWith('WIN STREAK') ? `Three in a row Tobi 🔥||Add $${amt} and we trade with AI together.\n[CTA:fund:999]` : task.startsWith('CHECK-IN') ? 'Hey! I see gold setting up.||Come take it with me.\n[CTA:signal]' : `Nearly there!||Just a little more.\n[CTA:fund:${amt}]`}], usage: {input_tokens: 5, output_tokens: 5}})); }
  const m = q.url.match(/^\/bot[^/]+\/(\w+)/); if (m) { SENT.push([m[1], raw.length ? JSON.parse(raw) : {}]); return s.end(JSON.stringify({ok: true, result: m[1] === 'getUpdates' ? [] : {message_id: 1}})); }
  s.statusCode = 404; s.end('{}'); }).listen(9921 + 70);
Object.assign(process.env, {TELEGRAM_BOT_TOKEN: '111:TEST', TELEGRAM_API: 'http://127.0.0.1:9991', DB_FILE: '/tmp/zbsl.db', ADMIN_KEY: 'ADM', ANTHROPIC_API_KEY: 'sk', ANTHROPIC_BASE: 'http://127.0.0.1:9991', QUIET_HOURS: '0-0', APP_URL: 'https://app.test'});
const {createServer, db, SALES} = await import('../server/server.js');
createServer().listen(9990); const B = 'http://127.0.0.1:9990';
function initData(id, name) { const p = new URLSearchParams({auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({id, first_name: name})});
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  p.set('hash', crypto.createHmac('sha256', crypto.createHmac('sha256', 'WebAppData').update('111:TEST').digest()).update(dcs).digest('hex')); return p.toString(); }
const call = async (m, path, body, h = {}) => { const r = await fetch(B + path, {method: m, headers: {'Content-Type': 'application/json', ...h}, body: body ? JSON.stringify(body) : undefined}); return {s: r.status, d: await r.json()}; };
const T = {'X-TG-Init-Data': initData(901, 'Tobi')}, ADM = {'X-Admin-Key': 'ADM'};
const ins = (sql, ...a) => db.prepare(sql).run(...a);
ins("INSERT INTO users(tg_id,first_name,iq_user_id,linked,created_at,updated_at) VALUES('901','Tobi','IQ901',1,?,?)", Date.now(), Date.now());
ins("INSERT INTO aff_accounts(iq_user_id,source,registered_at,deposits_total) VALUES('IQ901','postback',?,20)", Date.now());
ins("INSERT INTO bot_users(tg_id,chat_id,first_name,started_at,last_in) VALUES('901','901','Tobi',?,?)", Date.now(), Date.now());
await call('POST', '/api/app/state', {ai: 'viza', balance: 24}, T);
// three real trades, all wins -> on the third result Viza messages
const tr = []; for (let i = 0; i < 3; i++) tr.push((await call('POST', '/api/trades', {iqOptionId: 'X' + i, pair: 'EUR/USD', dir: 'buy', amount: 1}, T)).d.id);
for (const [i, id] of tr.entries()) { await call('POST', '/api/trades', {id, status: 'win', profit: 0.85}, T); await new Promise((z) => setTimeout(z, 150)); if (i < 2) assert.equal(db.prepare('SELECT COUNT(*) n FROM app_msgs').get().n, 0, 'nothing before 3 wins'); }
await new Promise((z) => setTimeout(z, 400));
let r = await call('GET', '/api/app/inbox', null, T); assert.equal(r.d.msgs.length, 1); const m = r.d.msgs[0];
assert.equal(m.sender, 'ai'); assert.equal(m.ai, 'viza'); assert.equal(m.kind, 'sales:streak'); assert.deepEqual(m.cta, {type: 'fund', amount: 30}, 'next level is $50 -> add $30 (the AI can’t change the amount)');
assert.match(AI.at(-1).system[1].text, /WIN STREAK: they just won 3 trades in a row/); assert.match(AI.at(-1).system[1].text, /own trading capital/);
for (let i = 0; i < 60 && SENT.filter(([k, j]) => k === 'sendMessage' && j.chat_id === '901').length < 3; i++) await new Promise((z) => setTimeout(z, 100));
const tg = SENT.filter(([k, j]) => k === 'sendMessage' && j.chat_id === '901'); assert.match(tg[0][1].text, /Viza · your AI trader/); assert.match(tg.at(-1)[1].reply_markup.inline_keyboard[0][0].text, /Fund \$30/);
assert.equal(r.d.unread, 1); await call('POST', '/api/app/inbox/read', {ids: [m.id], opened: true}, T); r = await call('GET', '/api/app/inbox', null, T); assert.equal(r.d.unread, 0);
// same streak again doesn't repeat; a loss resets; nothing for unfunded users
await SALES.onResult('901'); assert.equal(db.prepare('SELECT COUNT(*) n FROM app_msgs').get().n, 1);
// a deposit within 48h counts for the stats
ins("INSERT INTO events(ext_id,iq_user_id,type,amount,created_at) VALUES('d1','IQ901','deposit',30,?)", Date.now() + 1000);
r = await call('GET', '/api/admin/sales', null, ADM); const st = r.d.stats.find((x) => x.kind === 'sales:streak'); assert.equal(st.sent, 1); assert.equal(st.opened, 1); assert.equal(st.deposited, 1); assert.equal(st.usd, 30);
// "almost there": $80 of $100
ins("INSERT INTO users(tg_id,first_name,iq_user_id,linked,created_at,updated_at) VALUES('902','Ama','IQ902',1,?,?)", Date.now(), Date.now());
ins("INSERT INTO aff_accounts(iq_user_id,source,registered_at,deposits_total) VALUES('IQ902','postback',?,80)", Date.now());
ins("INSERT INTO bot_users(tg_id,chat_id,first_name,started_at,last_in) VALUES('902','902','Ama',?,?)", Date.now(), Date.now());
ins("INSERT INTO trades(tg_id,iq_option_id,pair,dir,amount,status,created_at) VALUES('902','Z','EUR/USD','buy',2,'win',?)", Date.now());
await SALES.tick(); let a = db.prepare("SELECT * FROM app_msgs WHERE tg_id='902'").get(); assert.equal(a.kind, 'sales:near'); assert.deepEqual(JSON.parse(a.cta), {type: 'fund', amount: 20});
// idle check-in: funded, no trades for 3 days (and no "near")
ins("INSERT INTO users(tg_id,first_name,iq_user_id,linked,created_at,updated_at) VALUES('903','Kofi','IQ903',1,?,?)", Date.now(), Date.now());
ins("INSERT INTO aff_accounts(iq_user_id,source,registered_at,deposits_total) VALUES('IQ903','postback',?,100)", Date.now());
ins("INSERT INTO bot_users(tg_id,chat_id,first_name,started_at,last_in) VALUES('903','903','Kofi',?,?)", Date.now(), Date.now());
ins("INSERT INTO trades(tg_id,iq_option_id,pair,dir,amount,status,created_at) VALUES('903','Z','EUR/USD','buy',2,'win',?)", Date.now() - 3 * 864e5);
await SALES.tick(); a = db.prepare("SELECT * FROM app_msgs WHERE tg_id='903'").get(); assert.equal(a.kind, 'sales:idle'); assert.equal(JSON.parse(a.cta).type, 'signal');
// limit: max 2 sales messages a day, and none after /stop
db.prepare("UPDATE bot_users SET stopped=1 WHERE tg_id='903'").run(); ins("DELETE FROM app_msgs WHERE tg_id='903'"); await SALES.tick(); assert.equal(db.prepare("SELECT COUNT(*) n FROM app_msgs WHERE tg_id='903'").get().n, 0, 'respects /stop');
// MAX members text the mentor; the team answers from the inbox; it shows in the mentor chat + preview as Roland
r = await call('POST', '/api/mentor/send', {text: 'hi Roland'}, T); assert.equal(r.s, 403); assert.equal(r.d.error, 'max_only');
db.prepare("UPDATE aff_accounts SET deposits_total=2500 WHERE iq_user_id='IQ901'").run();
r = await call('POST', '/api/mentor/send', {text: 'How should I size my trades?'}, T); assert.equal(r.d.ok, true);
r = await call('GET', '/api/admin/inbox?filter=needs', null, ADM); assert.equal(r.d.rows[0].tg_id, '901'); assert.match(r.d.rows[0].reason, /MAX member texting Roland/);
await call('POST', '/api/admin/inbox/reply', {tg_id: '901', text: 'Keep each trade around 2% of your balance 👌'}, ADM);
r = await call('GET', '/api/support/thread?ch=mentor', null, T); assert.deepEqual(r.d.msgs.map((m) => m.role), ['user', 'system', 'human']); assert.match(r.d.msgs[2].text, /2% of your balance/);
r = await call('GET', '/api/support/thread', null, T); assert.ok(!r.d.msgs.some((m) => /2% of your balance/.test(m.text)), 'not mixed into the support chat');
r = await call('GET', '/api/app/inbox', null, T); const mm = r.d.msgs.find((m) => m.sender === 'mentor'); assert.equal(mm.who, 'Roland');
await call('POST', '/api/admin/inbox/handback', {tg_id: '901', say: false}, ADM);
// switched off in the admin
await call('POST', '/api/admin/sales', {settings: {on: false}}, ADM); ins("DELETE FROM app_msgs WHERE tg_id='902'"); await SALES.tick(); assert.equal(db.prepare("SELECT COUNT(*) n FROM app_msgs WHERE tg_id='902'").get().n, 0);
console.log('sales tests passed'); process.exit(0);
