// Free period: 3 months, then quietly +6 months, then +6 more while active
import crypto from 'node:crypto'; import assert from 'node:assert/strict'; import fs from 'node:fs';
for (const f of ['/tmp/zbfree.db', '/tmp/zbfree.db-wal', '/tmp/zbfree.db-shm']) fs.rmSync(f, {force: true});
Object.assign(process.env, {TELEGRAM_BOT_TOKEN: '111:TEST', DB_FILE: '/tmp/zbfree.db', ADMIN_KEY: 'AK', BOT_MODE: 'off', IQ_CLIENT_ID: '1', IQ_CLIENT_SECRET: 'x', AFF_ID: '1', POSTBACK_KEY: 'p'});
const {createServer, db} = await import('../server/server.js');
const srv = createServer().listen(9915); const B = 'http://127.0.0.1:9915';
function initData(id, name) { const p = new URLSearchParams({auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'Q', user: JSON.stringify({id, first_name: name})});
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  p.set('hash', crypto.createHmac('sha256', crypto.createHmac('sha256', 'WebAppData').update('111:TEST').digest()).update(dcs).digest('hex')); return p.toString(); }
const me = async (id) => (await (await fetch(B + '/api/me', {headers: {'X-TG-Init-Data': initData(id, 'U' + id)}})).json());
const D = 864e5, row = (id) => db.prepare('SELECT free_until, free_n FROM users WHERE tg_id=?').get(String(id));
let m = await me(7001); assert.ok(Math.abs(m.free_until - (Date.now() + 90 * D)) < 60e3, 'starts with 3 months');
// 3 months over -> +6 months quietly, even if they were away
db.prepare('UPDATE users SET free_until=?, seen_at=? WHERE tg_id=?').run(Date.now() - 1000, Date.now() - 60 * D, '7001');
m = await me(7001); assert.ok(m.free_until > Date.now() + 179 * D, 'extended 6 months'); assert.equal(row(7001).free_n, 1);
// extra months over and inactive: hourly check leaves it; coming back extends
await me(7002); db.prepare('UPDATE users SET free_until=?, free_n=1, seen_at=? WHERE tg_id=?').run(Date.now() - 1000, Date.now() - 60 * D, '7002');
const {SETTINGS} = await import('../server/server.js'); assert.equal(SETTINGS.get('free').extendDays, 180);
m = await me(7002); assert.ok(m.free_until > Date.now() + 179 * D, 'active again -> extended'); assert.equal(row(7002).free_n, 2);
console.log('free period OK');
// chart reading: unlock one AI with coins
const post = async (id, path, body) => (await (await fetch(B + path, {method: 'POST', headers: {'content-type': 'application/json', 'X-TG-Init-Data': initData(id, 'U' + id)}, body: JSON.stringify(body)})).json());
let r = await post(7001, '/api/ai/unlock-chart', {ai: 'luna'}); assert.equal(r.error, 'not_enough_coins');
db.prepare('UPDATE rewards SET coins=2000 WHERE tg_id=?').run('7001');
r = await post(7001, '/api/ai/unlock-chart', {ai: 'luna'}); assert.equal(r.ok, true); assert.equal(r.coins, 500);
r = await post(7001, '/api/ai/unlock-chart', {ai: 'luna'}); assert.equal(r.already, true); assert.equal(db.prepare('SELECT coins FROM rewards WHERE tg_id=?').get('7001').coins, 500, 'charged once');
r = await post(7001, '/api/ai/unlock-chart', {ai: 'remi'}); assert.equal(r.error, 'not_enough_coins', 'unlock is per AI');
console.log('chart unlock OK'); srv.close(); process.exit(0);
