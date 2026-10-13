// Invite friends: link, first-touch attach, coins only on real deposits, lifetime share, milestones, abuse rules.
import crypto from 'node:crypto'; import assert from 'node:assert/strict'; import fs from 'node:fs';
for (const s of ['', '-wal', '-shm']) fs.rmSync('/tmp/zbref.db' + s, {force: true});
Object.assign(process.env, {TELEGRAM_BOT_TOKEN: '111:TEST', POSTBACK_KEY: 'PBK', ADMIN_KEY: 'ADM', DB_FILE: '/tmp/zbref.db', SUPPORT_BOT: 'off', MIN_DEPOSIT: '20', BOT_USERNAME: 'zubabot', REQUIRE_LINK: '0'});
const {createServer, db} = await import('../server/server.js');
const srv = createServer().listen(9940); const B = 'http://127.0.0.1:9940';
function init(id, name, sp = '') { const o = {auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({id, first_name: name})}; if (sp) o.start_param = sp; const p = new URLSearchParams(o);
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n'); const sec = crypto.createHmac('sha256', 'WebAppData').update('111:TEST').digest();
  p.set('hash', crypto.createHmac('sha256', sec).update(dcs).digest('hex')); return p.toString(); }
const call = async (m, p, b, h = {}) => { const r = await fetch(B + p, {method: m, headers: {'Content-Type': 'application/json', ...h}, body: b ? JSON.stringify(b) : undefined}); return {s: r.status, d: await r.json()}; };
const as = (id, name, sp) => ({'X-TG-Init-Data': init(id, name, sp)});
const coins = (id) => db.prepare('SELECT coins FROM rewards WHERE tg_id=?').get(String(id)).coins;
const pb = (q) => call('GET', '/api/postback/affstore?key=PBK&' + q);

// A gets a code and links
await call('GET', '/api/me', null, as(1001, 'Ada'));
let a = (await call('GET', '/api/ref/me', null, as(1001, 'Ada'))).d;
assert.match(a.code, /^[A-Z2-9]{6}$/); assert.equal(a.links.app, `https://t.me/zubabot/app?startapp=ref_${a.code}`); assert.equal(a.stats.invited, 0);
// self-referral ignored
await call('GET', '/api/me', null, as(1001, 'Ada', 'ref_' + a.code)); assert.equal(db.prepare('SELECT COUNT(*) n FROM referrals').get().n, 0);
// B opens A's link -> attached
await call('GET', '/api/me', null, as(2002, 'Bola', 'ref_' + a.code));
assert.equal(db.prepare('SELECT referrer FROM referrals WHERE tg_id=?').get('2002').referrer, '1001');
// second link can't steal B
await call('GET', '/api/ref/me', null, as(3003, 'Chi')); const c = (await call('GET', '/api/ref/me', null, as(3003, 'Chi'))).d.code;
await call('POST', '/api/ref/attach', {code: c}, as(2002, 'Bola', 'ref_' + c)); assert.equal(db.prepare('SELECT referrer FROM referrals WHERE tg_id=?').get('2002').referrer, '1001', 'first link wins');
// old user can't be attached later
db.prepare("INSERT INTO users(tg_id,first_name,created_at,updated_at) VALUES('4004','Old',?,?)").run(Date.now() - 3 * 3600e3, Date.now());
await call('GET', '/api/me', null, as(4004, 'Old', 'ref_' + a.code)); assert.ok(!db.prepare('SELECT 1 FROM referrals WHERE tg_id=?').get('4004'), 'only new people');
a = (await call('GET', '/api/ref/me', null, as(1001, 'Ada'))).d; assert.equal(a.stats.invited, 1); assert.equal(a.friends[0].status, 'opened');

// B registers (afftrack carries B's Telegram id) and deposits $15 -> below $20, no FTD reward yet
const a0 = coins(1001), b0 = coins(2002);
await pb('event=reg&user_id=900200&afftrack=Zubabot_tg2002');
a = (await call('GET', '/api/ref/me', null, as(1001, 'Ada'))).d; assert.equal(a.friends[0].status, 'joined');
await pb('event=ftd&user_id=900200&amount=15&tid=d1');
assert.equal(coins(1001) - a0, 0, 'under $20: nothing yet');
// B tops up to $115 -> first day total $115 (>= $100): inviter 5/$ = 575, friend 2/$ = 230
await pb('event=deposit&user_id=900200&amount=100&tid=d2');
assert.equal(coins(1001) - a0, 0, 'held until 5 trades'); const bHeld = coins(2002);
a = (await call('GET', '/api/ref/me', null, as(1001, 'Ada'))).d;
assert.equal(a.stats.funded, 1); assert.equal(a.stats.earned, 0); assert.equal(a.stats.held, 575); assert.equal(a.friends[0].status, 'funded'); assert.equal(a.friends[0].trades, 0); assert.equal(a.friends[0].firstDay, 115); assert.ok(a.friends[0].hoursLeft >= 23);
const trade = (id, n, i) => call('POST', '/api/trades', {iqOptionId: String(id * 1000 + i), pair: 'EUR/USD', dir: 'buy', amount: 1}, as(id, 'F'));
for (let i = 0; i < 4; i++) await trade(2002, 1, i);
await call('POST', '/api/trades', {pair: 'EUR/USD', dir: 'buy', amount: 1, error: 'closed'}, as(2002, 'F'));   // failed trades don't count
assert.equal(coins(1001) - a0, 0, '4 trades: still held');
await trade(2002, 1, 4);
assert.equal(coins(1001) - a0, 575, 'released after 5 trades'); assert.equal(coins(2002) - bHeld, 230, 'friend bonus released too'); const bAfter = coins(2002);
a = (await call('GET', '/api/ref/me', null, as(1001, 'Ada'))).d;
assert.equal(a.stats.earned, 575); assert.equal(a.stats.held, 0); assert.equal(a.friends[0].status, 'trading');
assert.deepEqual(a.next, {friends: 5, coins: 1000, left: 4}); assert.equal(a.rules.cap, 2500); assert.equal(a.rules.minTrades, 5);
// duplicate postback doesn't pay twice; recycled money earns nothing
await pb('event=deposit&user_id=900200&amount=100&tid=d2'); assert.equal(coins(1001) - a0, 575);
// big top-up on day one -> capped at 2,500 for the inviter, 1,000 for the friend
await pb('event=deposit&user_id=900200&amount=400&tid=d4');
assert.equal(coins(1001) - a0, 2500, 'inviter capped'); assert.ok(coins(2002) - bAfter >= 770, 'friend bonus grows to the cap');
await pb('event=withdrawal&user_id=900200&amount=100&tid=w1'); await pb('event=deposit&user_id=900200&amount=100&tid=d3'); assert.equal(coins(1001) - a0, 2500, 'no reward for recycled money');
// after the first 24 h: only the 3% share
// (B is now flagged for withdraw-and-redeposit, so later deposits pay nothing; the 3% share is checked on a clean friend below)
// a small friend: $20 -> flat 200 for the inviter
const s1 = coins(1001);
for (const [id, iq] of [[5005, 900500], [6006, 900600], [7007, 900700], [8008, 900800]]) {
  await call('GET', '/api/me', null, as(id, 'F' + id, 'ref_' + a.code));
  await pb(`event=reg&user_id=${iq}&afftrack=Zubabot_tg${id}`); await pb(`event=ftd&user_id=${iq}&amount=20&tid=f${id}`);
  for (let i = 0; i < 5; i++) await trade(id, 1, i);
}
assert.equal(coins(1001) - s1, 4 * 200 + 1000, '4 small friends + milestone at 5 funded');
db.prepare('UPDATE referrals SET ftd_at=? WHERE tg_id=?').run(Date.now() - 25 * 3600e3, '5005');
const s2 = coins(1001); await pb('event=deposit&user_id=900500&amount=100&tid=f5005b'); assert.equal(coins(1001) - s2, 30, 'after day one: 3% of 1,000 coins');
a = (await call('GET', '/api/ref/me', null, as(1001, 'Ada'))).d;
assert.equal(a.stats.funded, 5); assert.equal(a.stats.trading, 5); assert.deepEqual(a.next, {friends: 15, coins: 3000, left: 10});
const adm = (await call('GET', '/api/admin/referrals', null, {'X-Admin-Key': 'ADM'})).d; assert.equal(adm.top[0].funded, 5);
// B sees who invited them
assert.equal((await call('GET', '/api/ref/me', null, as(2002, 'Bola'))).d.invitedBy.name, 'Ada');
console.log('referral tests passed'); srv.close(); process.exit(0);
