// Tests for the AI brain (mock Claude API) and Zubabot Pay (mock TronGrid + mempool.space).
import http from 'node:http'; import crypto from 'node:crypto'; import assert from 'node:assert/strict'; import fs from 'node:fs';
let lastAI = null, aiN = 0, tronTx = [], btcTx = [];
const AIN = () => aiN;
const mock = http.createServer(async (req, res) => { let s = ''; for await (const c of req) s += c; res.setHeader('Content-Type', 'application/json');
  if (req.url === '/v1/messages') { aiN++; lastAI = {headers: req.headers, body: JSON.parse(s)}; const u = lastAI.body.messages.at(-1).content;
    const text = /fund/.test(u) ? 'Yes you can start with $20 😊\n||\nYour money stays in your own IQ Option account.\n||\nWant to start now?\n[CTA:fund:20]' : 'Hey! I trade trends.||I wait for a pullback.';
    return res.end(JSON.stringify({content: [{type: 'text', text}]})); }
  if (req.url.startsWith('/v1/accounts/')) return res.end(JSON.stringify({data: tronTx}));
  if (req.url === '/api/v1/prices') return res.end(JSON.stringify({USD: 100000}));
  if (req.url.startsWith('/api/address/')) return res.end(JSON.stringify(btcTx));
  res.statusCode = 404; res.end('{}'); }).listen(9921);
fs.rmSync('/tmp/zbbp.db', {force: true}); fs.rmSync('/tmp/zbbp.db-wal', {force: true});
Object.assign(process.env, {TELEGRAM_BOT_TOKEN: '111:TEST', DB_FILE: '/tmp/zbbp.db', ADMIN_KEY: 'ADM', ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE: 'http://127.0.0.1:9921', AI_MODEL: 'claude-haiku-5-5',
  TRONGRID_BASE: 'http://127.0.0.1:9921', MEMPOOL_BASE: 'http://127.0.0.1:9921', PAY_USDT_TRC20_ADDRESS: 'TXYZaddr', PAY_BTC_ADDRESS: 'bc1qtest', AI_DAILY_FREE: '2'});
const {createServer, PAY, db} = await import('../server/server.js');
const srv = createServer().listen(9920); const B = 'http://127.0.0.1:9920';
function initData(id, name) { const p = new URLSearchParams({auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({id, first_name: name})});
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  p.set('hash', crypto.createHmac('sha256', crypto.createHmac('sha256', 'WebAppData').update('111:TEST').digest()).update(dcs).digest('hex')); return p.toString(); }
const call = async (m, path, body, h = {}) => { const r = await fetch(B + path, {method: m, headers: {'Content-Type': 'application/json', ...h}, body: body ? JSON.stringify(body) : undefined}); return {s: r.status, d: await r.json()}; };
const A = {'X-TG-Init-Data': initData(2001, 'Ada')};
let r;
// ---- brain ----
r = await call('POST', '/api/ai/chat', {kind: 'ai', text: 'hi'}); assert.equal(r.s, 401);
r = await call('POST', '/api/ai/chat', {kind: 'ai', text: 'how do you trade?', profile: {key: 'mira', name: 'Mira', style: 'Trend rider', owned: false, unlock: 'costs 300 coins'}, history: [['ai', 'Hey'], ['me', 'yo'], ['cta', '']]}, A);
assert.equal(r.s, 200); assert.deepEqual(r.d.messages, ['Hey! I trade trends.', 'I wait for a pullback.']); assert.equal(r.d.cta, null);
assert.equal(lastAI.headers['x-api-key'], 'sk-test'); assert.equal(lastAI.body.model, 'claude-haiku-5-5');
assert.equal(lastAI.body.system[0].cache_control.type, 'ephemeral', 'playbook cached'); assert.match(lastAI.body.system[1].text, /YOU ARE Mira/); assert.match(lastAI.body.system[1].text, /LOCKED/);
assert.equal(lastAI.body.messages[0].role, 'user', 'history starts with user'); assert.ok(lastAI.body.messages.every((m, i, a) => !i || m.role !== a[i - 1].role), 'roles alternate');
r = await call('POST', '/api/ai/chat', {kind: 'support', agent: 'Ada', text: 'can I fund $20?', ctx: {deposited: 5000, plan: 'copy'}}, A);
assert.equal(r.d.messages.length, 3); assert.deepEqual(r.d.cta, {type: 'fund', amount: 20}); assert.match(lastAI.body.system[1].text, /deposited on IQ Option: \$0 /, 'server money facts override the app');
r = await call('POST', '/api/ai/chat', {kind: 'support', text: 'more'}, A); assert.equal(r.d.capped, true, 'daily cap for unfunded users');
r = await call('GET', '/api/ai/leaderboard'); assert.equal(r.s, 200); assert.equal(r.d.aiOfWeek, null);
// leaderboard with real signals
const ins = db.prepare("INSERT INTO signals(pair,dir,mode,step,status,ai,created_at) VALUES('EURUSD','buy','live',0,?,?,?)");
for (let i = 0; i < 10; i++) ins.run(i < 8 ? 'win' : 'loss', 'kai', Date.now() - 3600e3); for (let i = 0; i < 10; i++) ins.run(i < 5 ? 'win' : 'loss', 'mira', Date.now() - 3600e3);
r = await call('GET', '/api/ai/leaderboard'); assert.equal(r.d.top[0].key, 'kai'); assert.equal(r.d.top[0].rate, 80); assert.equal(r.d.aiOfWeek.key, 'kai');
// ---- pay ----
r = await call('GET', '/api/pay/packs'); assert.equal(r.d.packs.coins.length, 3); assert.equal(r.d.coins.usdt, true);
r = await call('POST', '/api/pay/create', {kind: 'coins', pack: 'c220', coin: 'usdt'}, A); assert.equal(r.s, 200);
const p1 = r.d.payment; assert.equal(p1.address, 'TXYZaddr'); assert.match(p1.amount, /^25\.\d{3}$/); assert.notEqual(p1.amount, '25.000');
r = await call('POST', '/api/pay/create', {kind: 'coins', pack: 'c220', coin: 'usdt'}, A); assert.equal(r.d.payment.id, p1.id, 'open invoice reused');
r = await call('POST', '/api/pay/create', {kind: 'tokens', pack: 't550', coin: 'btc'}, A); const p2 = r.d.payment; assert.match(p2.amount, /^0\.00025\d{3}$/); assert.match(p2.uri, /^bitcoin:bc1qtest\?amount=/);
// wrong amount -> nothing; exact amount -> credited once
tronTx = [{transaction_id: 'T1', to: 'TXYZaddr', value: String(25e6), block_timestamp: Date.now(), token_info: {address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'}}];
await PAY.tick(); r = await call('GET', '/api/pay/status?id=' + p1.id, null, A); assert.equal(r.d.payment.status, 'pending');
tronTx.push({transaction_id: 'T2', to: 'TXYZaddr', value: String(Math.round(+p1.amount * 1e6)), block_timestamp: Date.now(), token_info: {address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'}});
await PAY.tick(); await PAY.tick(); r = await call('GET', '/api/pay/status?id=' + p1.id, null, A); assert.equal(r.d.payment.status, 'paid'); assert.equal(r.d.payment.txid, 'T2'); assert.equal(r.d.balance.coins, 220);
btcTx = [{txid: 'B1', status: {confirmed: true, block_time: Math.floor(Date.now() / 1000)}, vout: [{scriptpubkey_address: 'bc1qtest', value: Math.round(+p2.amount * 1e8)}]}];
await PAY.tick(); r = await call('GET', '/api/pay/status?id=' + p2.id, null, A); assert.equal(r.d.payment.status, 'paid'); assert.equal(r.d.balance.tokens, 550);
r = await call('GET', '/api/pay/status?id=' + p2.id, null, {'X-TG-Init-Data': initData(2002, 'Ben')}); assert.equal(r.s, 404, 'other users cannot see it');
// spending
// support screenshot: the assistant sees the picture; the team gets a signed private link
{ const P = {'X-TG-Init-Data': initData(2009, 'Pic')}; const PB = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('fakepngbytes')]); const png = 'data:image/png;base64,' + PB.toString('base64');
  r = await call('POST', '/api/ai/chat', {kind: 'support', agent: 'Emily', text: '', image: png}, P); assert.equal(r.s, 200);
  const c = lastAI.body.messages.at(-1).content; assert.ok(Array.isArray(c) && c[0].type === 'image' && c[0].source.media_type === 'image/png', 'the AI got the picture');
  assert.match(lastAI.body.system.map((x) => x.text).join('\n'), /SCREENSHOT: the user sent a screenshot/);
  const row = db.prepare("SELECT text FROM bot_msgs WHERE tg_id='2009' AND role='user' ORDER BY id DESC").get();
  const link = (row.text.match(/\/api\/upload\?n=[a-z0-9]+&k=[a-f0-9]+/) || [])[0]; assert.ok(link, 'inbox has the picture link: ' + row.text);
  const g = await fetch(B + link); assert.equal(g.status, 200); assert.ok(Buffer.from(await g.arrayBuffer()).equals(PB));
  assert.equal((await fetch(B + link.replace(/k=[a-f0-9]+/, 'k=' + '0'.repeat(24)))).status, 404, 'wrong signature -> 404');
  r = await call('POST', '/api/ai/chat', {kind: 'ai', text: 'x', image: png}, P); assert.ok(!(lastAI.body.messages.at(-1).content instanceof Array), 'AI traders use the chart route, not this one');
  r = await call('POST', '/api/ai/chat', {kind: 'support', image: 'data:text/html;base64,PGI+'}, P); assert.equal(r.s, 400, 'only pictures');
  r = await call('POST', '/api/ai/chat', {kind: 'support', image: 'data:image/png;base64,' + Buffer.from('<html>not a picture</html>').toString('base64')}, P); assert.equal(r.s, 400, 'bytes must really be a picture');
  const JB = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.from('jpegbytes')]);
  const P2 = {'X-TG-Init-Data': initData(2010, 'Pic2')}; r = await call('POST', '/api/ai/chat', {kind: 'support', image: 'data:image/png;base64,' + JB.toString('base64')}, P2); assert.equal(r.s, 200);
  assert.equal(lastAI.body.messages.at(-1).content[0].source.media_type, 'image/jpeg', 'type taken from the bytes');
  assert.ok(!/https?:/.test(db.prepare("SELECT text FROM bot_msgs WHERE tg_id='2010' AND role='user' ORDER BY id DESC").get().text), 'stored link is relative');
  assert.equal((await fetch(B + link.replace(/k=[a-f0-9]+/, 'k=' + 'z'.repeat(24)))).status, 404, 'non-hex signature -> 404, no crash');
  db.prepare("INSERT INTO ai_usage(tg_id,day,n) VALUES('2010',?,99) ON CONFLICT(tg_id,day) DO UPDATE SET n=99").run('up:' + new Date().toISOString().slice(0, 10));
  const nAI = AIN(); r = await call('POST', '/api/ai/chat', {kind: 'support', image: png}, P2); assert.equal(r.s, 200); assert.ok(r.d.capped, 'daily picture limit'); assert.equal(AIN(), nAI, 'no AI call over the limit'); }
r = await call('POST', '/api/wallet/spend', {coins: 100, tokens: 50}, A); assert.deepEqual(r.d.rewards, {coins: 120, tokens: 500});
r = await call('POST', '/api/wallet/spend', {coins: 9999}, A); assert.equal(r.d.rewards.coins, 0, 'never below zero');
r = await call('GET', '/api/admin/payments', null, {'X-Admin-Key': 'ADM'}); assert.equal(r.d.payments.length, 2);
console.log('brain + pay tests passed'); srv.close(); mock.close(); process.exit(0);
