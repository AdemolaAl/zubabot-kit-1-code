// live app + server + mock AI + mock voice server, for the browser voice test (e2e-voice.cjs)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
for (const f of ['/tmp/zbev.db', '/tmp/zbev.db-wal', '/tmp/zbev.db-shm']) fs.rmSync(f, {force: true}); fs.rmSync('/tmp/zbev-cache', {recursive: true, force: true});
const BEEP = fs.readFileSync('/tmp/beep.mp3'); globalThis.VLOG = [];
http.createServer(async (q, s) => { const u = new URL(q.url, 'http://x'); const ch = []; for await (const c of q) ch.push(c); const raw = Buffer.concat(ch); s.setHeader('Content-Type', 'application/json');
  if (u.pathname === '/tts') { VLOG.push(['tts', JSON.parse(raw).text]); s.setHeader('Content-Type', 'audio/mpeg'); return s.end(BEEP); }
  if (u.pathname === '/stt') { VLOG.push(['stt', q.headers['content-type'], raw.length]); return s.end(JSON.stringify({ok: true, text: 'is my money safe?'})); }
  if (u.pathname === '/health') return s.end('{"ok":true}');
  if (u.pathname === '/v1/messages') { const j = JSON.parse(raw); const sys = j.system.map((x) => x.text).join('\n');
    const text = /VOICE CALL/.test(sys) ? 'Great question! Your money stays in your own IQ Option account. You approve every trade. Ready to fund?\n[CTA:fund:20]' : 'Hi! Happy to help.';
    return s.end(JSON.stringify({content: [{type: 'text', text}], usage: {input_tokens: 10, output_tokens: 10}})); }
  if (u.pathname === '/vlog') return s.end(JSON.stringify(VLOG));
  const m = u.pathname.match(/^\/bot[^/]+\/(\w+)/); if (m) return s.end(JSON.stringify({ok: true, result: m[1] === 'getUpdates' ? [] : {message_id: 1}}));
  s.statusCode = 404; s.end('{}'); }).listen(9931);
Object.assign(process.env, {ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE: 'http://127.0.0.1:9931', DB_FILE: '/tmp/zbev.db', ADMIN_KEY: 'ADM', TELEGRAM_BOT_TOKEN: '111:TEST', TELEGRAM_API: 'http://127.0.0.1:9931',
  VOICE_SERVER_URL: 'http://127.0.0.1:9931', VOICE_SERVER_KEY: 'k', VOICE_CACHE_DIR: '/tmp/zbev-cache', SUPPORT_TEAM_CHAT_ID: '-100', SUPPORT_BOT: 'off', REQUIRE_LINK: '0'});
const {createServer, db} = await import('../server/server.js');
createServer().listen(9930);
db.prepare("INSERT INTO users(tg_id,first_name,iq_user_id,linked,created_at,updated_at) VALUES('8101','Tobi','IQ8101',1,?,?)").run(Date.now(), Date.now());
db.prepare("INSERT INTO aff_accounts(iq_user_id,source,registered_at,deposits_total) VALUES('IQ8101','postback',?,150)").run(Date.now());
db.prepare("INSERT INTO rewards(tg_id,coins,tokens,credited_deposits) VALUES('8101',2000,50,150)").run();
const web = path.resolve('web');
http.createServer((q, s) => { const p = q.url.split('?')[0]; const f = p === '/' ? path.join(web, 'zubabot.html') : path.join(web, p);
  if (!fs.existsSync(f)) { s.statusCode = 404; return s.end(); } let b = fs.readFileSync(f);
  if (f.endsWith('config.js')) b = b.toString().replace("window.ZB_API = 'https://api.zubabot.com';", "window.ZB_API = 'http://127.0.0.1:9930';").replace(/window.ZB_IQ_CLIENT_ID = '[0-9]*';/, "window.ZB_IQ_CLIENT_ID = '';");
  s.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream'); s.end(b); }).listen(9932);
console.log('voice e2e up');
