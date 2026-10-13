import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
fs.rmSync('/tmp/zbauto.db', {force: true}); globalThis.AILOG = [];
// mock IQ Option OAuth server
http.createServer(async (q, s) => { const u = new URL(q.url, 'http://x');
  if (u.pathname === '/auth/oauth.v5/authorize') { const to = new URL(u.searchParams.get('redirect_uri')); to.searchParams.set('code', 'GOODCODE'); to.searchParams.set('state', u.searchParams.get('state')); fs.writeFileSync('/tmp/zbauth.json', JSON.stringify(Object.fromEntries(u.searchParams))); s.writeHead(302, {Location: to.toString()}); return s.end(); }
  let b = ''; for await (const c of q) b += c; s.setHeader('Content-Type', 'application/json');
  if (u.pathname === '/auth/oauth.v5/token') { const j = JSON.parse(b); if (j.grant_type === 'authorization_code' && j.code === 'GOODCODE') return s.end(JSON.stringify({access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600})); if (j.grant_type === 'refresh_token') return s.end(JSON.stringify({access_token: 'AT2', expires_in: 3600})); }
  if (u.pathname === '/v1/messages') { const j = JSON.parse(b); AILOG.push(j); const last = j.messages.at(-1).content; const sup = /support team/.test(j.system[1].text);
    return s.end(JSON.stringify({content: [{type: 'text', text: sup ? 'Hi Tobi! Yes, $20 is enough to start 😊||Your money stays in your own IQ Option account.\n[CTA:fund:20]' : /signal/i.test(last) ? 'I like where gold is heading 👀||Unlock me and I send you my next one.\n[CTA:unlock]' : 'Hey Tobi! I ride big trends.||I wait for a clean pullback, then strike.'}]})); }
  if (u.pathname === '/ailog') return s.end(JSON.stringify(AILOG));
  s.statusCode = 400; s.end('{}'); }).listen(9961);
Object.assign(process.env, {ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE: 'http://127.0.0.1:9961', DB_FILE: '/tmp/zbauto.db', ADMIN_KEY: 'ADM', POSTBACK_KEY: 'PBK', TELEGRAM_BOT_TOKEN: '111:TEST', IQ_API_BASE: 'http://127.0.0.1:9961', IQ_CLIENT_ID: '77', IQ_CLIENT_SECRET: 'SEC', IQ_REDIRECT_URI: 'http://127.0.0.1:9951/callback.html', AFF_ID: '4242', REQUIRE_LINK: '1'});
const {createServer, engine} = await import('../server/server.js');
createServer().listen(9950);
engine.setStrategy({mode: 'live', pairs: [{s: 'EUR/USD', on: false, src: 'manual', trend: 'up'}]});
setInterval(() => engine.tick(), 1000);
const web = path.resolve('web'), test = path.resolve('test');
http.createServer((q, s) => { const p = q.url.split('?')[0]; let f = p === '/' ? path.join(web, 'zubabot.html') : p === '/mocksdk.mjs' ? path.join(test, 'mocksdk2.mjs') : path.join(web, p);
  if (!fs.existsSync(f)) { s.statusCode = 404; return s.end(); } let b = fs.readFileSync(f);
  if (f.endsWith('config.js')) b = b.toString().replace("window.ZB_API = 'https://api.zubabot.com';", "window.ZB_API = 'http://127.0.0.1:9950';").replace(/window.ZB_IQ_CLIENT_ID = '[0-9]*';/, "window.ZB_IQ_CLIENT_ID = '77';").replace("window.ZB_IQ_REDIRECT = 'https://app.zubabot.com/callback.html';", "window.ZB_IQ_REDIRECT = 'http://127.0.0.1:9951/callback.html'; window.ZB_SDK_URL = '/mocksdk.mjs';");
  s.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8'); s.end(b); }).listen(9951);
console.log('auto e2e up');
