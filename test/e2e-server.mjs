import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
fs.rmSync('/tmp/zbe2e.db', {force: true});
Object.assign(process.env, {DB_FILE: '/tmp/zbe2e.db', ADMIN_KEY: 'ADM', POSTBACK_KEY: 'PBK', TELEGRAM_BOT_TOKEN: '111:TEST', IQ_CLIENT_ID: '1', IQ_REDIRECT_URI: 'x', AFF_LINK: 'https://affiliate.example/redir/?aff=4242&afftrack={afftrack}', REQUIRE_LINK: '1'});
const {createServer, engine} = await import('../server/server.js');
createServer().listen(9950);
engine.setStrategy({mode: 'live', pairs: [{s: 'EUR/USD', on: false, src: 'manual', trend: 'up'}]});
setInterval(() => engine.tick(), 1000);
const root = path.resolve('web');
http.createServer((q, s) => { let f = path.join(root, q.url.split('?')[0]); if (f.endsWith('/')) f += 'zubabot.html'; if (!fs.existsSync(f)) { s.statusCode = 404; return s.end(); }
  let b = fs.readFileSync(f); if (f.endsWith('config.js')) b = b.toString().replace("window.ZB_API = 'https://api.zubabot.com';", "window.ZB_API = 'http://127.0.0.1:9950';").replace(/window.ZB_IQ_CLIENT_ID = '[0-9]*';/, "window.ZB_IQ_CLIENT_ID = '';");
  s.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8'); s.end(b); }).listen(9951);
console.log('e2e up');
