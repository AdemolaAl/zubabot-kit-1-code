import http from 'node:http'; import fs from 'node:fs';
let px = 100; const m = http.createServer((q, s) => { s.setHeader('Content-Type', 'application/json'); px += (Math.random() - .45) * .3;
  if (q.url.startsWith('/api/v3/klines')) return s.end(JSON.stringify(Array.from({length: 80}, (_, i) => [0, 0, 0, 0, String(95 + i * 0.07 + Math.random() * .2)])));
  s.end(JSON.stringify({price: String(px)})); }).listen(9941);
fs.rmSync('/tmp/zbdemo.db', {force: true});
Object.assign(process.env, {BINANCE_BASE: 'http://127.0.0.1:9941', DB_FILE: '/tmp/zbdemo.db', ADMIN_KEY: 'demo', POSTBACK_KEY: 'pb', TELEGRAM_BOT_TOKEN: '1:x', IQ_CLIENT_ID: '1', IQ_REDIRECT_URI: 'x'});
const {createServer, engine, db, handlePostback} = await import('../server/server.js');
createServer().listen(9940);
engine.setStrategy({mode: 'test', testers: '1001', pairs: [{s: 'EUR/USD OTC', on: true, src: 'manual', trend: 'up'}, {s: 'GBP/USD OTC', on: true, src: 'manual', trend: 'flat'}, {s: 'BTC/USD', on: true, src: 'binance', trend: 'auto'}]});
// seed history
const pairs = ['EUR/USD OTC', 'GBP/USD OTC', 'BTC/USD'], aiK = ['viza', 'luna', 'mira', 'blaze', 'remi'];
for (let i = 0; i < 40; i++) { const s = await engine.create({pair: pairs[i % 3], dir: Math.random() < .7 ? 'buy' : 'sell', source: 'auto', mode: 'test', ai: aiK[i % 5], expiryMin: [1, 5, 5, 1, 15][i % 5], entryAt: Date.now() - 60e3, conf: 70 + Math.round(Math.random() * 20), trend: ['up', 'flat', 'up'][i % 3], strength: .6});
  await engine.resolveManual(s.id, Math.random() < .56 ? 'win' : 'loss'); }
// resolve any martingale steps randomly
for (let k = 0; k < 4; k++) for (const s of engine.recent({mode: 'test', limit: 500}).filter((x) => x.status === 'open')) await engine.resolveManual(s.id, Math.random() < .6 ? 'win' : 'loss');
await engine.tick();
for (let i = 0; i < 12; i++) db.prepare('INSERT INTO users(tg_id,first_name,username,created_at,updated_at,iq_user_id,linked,link_source) VALUES(?,?,?,?,?,?,?,?)').run(String(1000 + i), ['Ada', 'Ben', 'Chika', 'Dan', 'Efe', 'Femi', 'Grace', 'Hassan', 'Ivy', 'Jude', 'Kemi', 'Lola'][i], '', Date.now() - i * 3600e3, Date.now(), i < 9 ? String(196641000 + i) : null, i < 9 ? 1 : 0, i < 9 ? (i < 6 ? 'affiliate' : 'imported') : null);
for (let i = 0; i < 6; i++) handlePostback({event: 'ftd', user_id: String(196641000 + i), amount: [50, 100, 250, 500, 100, 1000][i], tid: 'd' + i});
console.log('demo up');
