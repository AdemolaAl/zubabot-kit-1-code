import http from 'node:http'; import crypto from 'node:crypto'; import assert from 'node:assert/strict'; import fs from 'node:fs';
// mock IQ Option token server
let lastTokenReq = null;
const mock = http.createServer(async (req, res) => { let s = ''; for await (const c of req) s += c; lastTokenReq = {path: req.url, body: JSON.parse(s)};
  const b = lastTokenReq.body; res.setHeader('Content-Type', 'application/json');
  if (req.url !== '/auth/oauth.v5/token') { res.statusCode = 404; return res.end('{}') }
  if (b.grant_type === 'authorization_code' && b.code === 'GOODCODE' && b.code_verifier) return res.end(JSON.stringify({access_token: 'AT1', refresh_token: 'RT1', expires_in: 1, token_type: 'bearer', scope: 'full offline_access'}));
  if (b.grant_type === 'refresh_token' && b.refresh_token === 'RT1' && b.client_secret === 'SEC') return res.end(JSON.stringify({access_token: 'AT2', expires_in: 3600}));
  res.statusCode = 400; res.end(JSON.stringify({error: 'invalid_grant'})); }).listen(9911);
fs.rmSync('/tmp/zbtest.db', {force: true}); fs.rmSync('/tmp/zbtest.db-wal', {force: true});
Object.assign(process.env, {TELEGRAM_BOT_TOKEN: '111:TEST', IQ_API_BASE: 'http://127.0.0.1:9911', IQ_CLIENT_ID: '77', IQ_CLIENT_SECRET: 'SEC', IQ_REDIRECT_URI: 'https://app.zubabot.com/oauth/callback.html', AFF_ID: '4242', POSTBACK_KEY: 'PBK', ADMIN_KEY: 'ADM', AFF_LINK: 'https://affiliate.example/redir/?aff=4242&afftrack={afftrack}', DB_FILE: '/tmp/zbtest.db', REQUIRE_LINK: '1'});
const {createServer} = await import('../server/server.js');
const srv = createServer().listen(9910); const B = 'http://127.0.0.1:9910';
function initData(id, name, botToken = '111:TEST', age = 0) {
  const p = new URLSearchParams({auth_date: String(Math.floor(Date.now() / 1000) - age), query_id: 'Q', user: JSON.stringify({id, first_name: name})});
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex')); return p.toString();
}
const call = async (m, path, body, h = {}) => { const r = await fetch(B + path, {method: m, headers: {'Content-Type': 'application/json', ...h}, body: body ? JSON.stringify(body) : undefined}); return {s: r.status, d: await r.json()}; };
const A = {'X-TG-Init-Data': initData(1001, 'Ada')}, Bb = {'X-TG-Init-Data': initData(1002, 'Ben')}, Cc = {'X-TG-Init-Data': initData(1003, 'Cy')};
let r;
// telegram auth
r = await call('POST', '/api/oauth/start', {kind: 'new'}, {'X-TG-Init-Data': initData(1001, 'Ada', '999:WRONG')}); assert.equal(r.s, 401, 'forged initData rejected');
r = await call('POST', '/api/oauth/start', {kind: 'new'}, {'X-TG-Init-Data': initData(1001, 'Ada', '111:TEST', 90000)}); assert.equal(r.s, 401, 'stale initData rejected');
// 1) new user A signs up through OAuth
r = await call('POST', '/api/oauth/start', {kind: 'new'}, A); assert.equal(r.s, 200);
const u = new URL(r.d.url); assert.equal(u.pathname, '/auth/oauth.v5/authorize'); assert.equal(u.searchParams.get('aff'), '4242'); assert.equal(u.searchParams.get('afftrack'), 'Zubabot_tg1001'); assert.equal(u.searchParams.get('code_challenge_method'), 'S256'); assert.equal(u.searchParams.get('client_id'), '77');
const state = u.searchParams.get('state');
r = await call('POST', '/api/oauth/exchange', {code: 'BAD', state}); assert.equal(r.s, 400);
r = await call('POST', '/api/oauth/exchange', {code: 'GOODCODE', state: 'nope'}); assert.equal(r.s, 400);
r = await call('POST', '/api/oauth/exchange', {code: 'GOODCODE', state}); assert.equal(r.s, 200); assert.equal(lastTokenReq.body.client_id, 77); assert.ok(lastTokenReq.body.code_verifier.length > 40);
// PKCE check: challenge = sha256(verifier)
assert.equal(crypto.createHash('sha256').update(lastTokenReq.body.code_verifier).digest('base64url'), u.searchParams.get('code_challenge'));
// token: AT1 expires in 1s -> server refreshes with secret
r = await call('POST', '/api/oauth/token', {}, A); assert.equal(r.d.accessToken, 'AT2'); assert.equal(lastTokenReq.body.client_secret, 'SEC');
// link before postback -> pending (new sign-up)
r = await call('POST', '/api/account/link', {iqUserId: 555001}, A); assert.equal(r.d.linked, false); assert.equal(r.d.pending, true);
// Affstore registration postback with afftrack -> auto link
r = await call('GET', '/api/postback/affstore?key=WRONG&event=reg&user_id=555001&afftrack=tg1001'); assert.equal(r.s, 403);
r = await call('GET', '/api/postback/affstore?key=PBK&event=registration&user_id=555001&afftrack=tg1001&tid=e1'); assert.equal(r.d.type, 'registration');
r = await call('POST', '/api/account/link', {iqUserId: 555001}, A); assert.equal(r.d.linked, true); assert.equal(r.d.source, 'affiliate'); assert.equal(r.d.state.activated, false);
// FTD $250 -> activated, coins 2875 + 500 welcome bonus = 3375, tokens 625. Duplicate postback ignored.
r = await call('GET', '/api/postback/affstore?key=PBK&event=ftd&user_id=555001&amount=250&tid=e2'); assert.equal(r.d.credited.coins, 3375); assert.equal(r.d.credited.tokens, 625);
r = await call('GET', '/api/postback/affstore?key=PBK&event=ftd&user_id=555001&amount=250&tid=e2'); assert.equal(r.d.duplicate, true);
r = await call('GET', '/api/me', null, A); assert.equal(r.d.activated, true); assert.equal(r.d.rewards.coins, 3375); assert.equal(r.d.deposits_total, 250);
// 2) B logs in with an account NOT from our link -> not linked
r = await call('POST', '/api/oauth/start', {kind: 'login'}, Bb);
r = await call('POST', '/api/account/link', {iqUserId: 777000}, Bb); assert.equal(r.d.linked, false); assert.ok(!r.d.pending);
// B can't steal A's IQ account
r = await call('POST', '/api/account/link', {iqUserId: 555001}, Bb); assert.equal(r.s, 409);
// 3) earlier member: imported list + invite code
r = await call('POST', '/api/admin/import-accounts', {ids: [888001, 888002]}); assert.equal(r.s, 403);
r = await call('POST', '/api/admin/import-accounts', {csv: '888001,888002\n888003'}, {'X-Admin-Key': 'ADM'}); assert.equal(r.d.added, 3);
r = await call('POST', '/api/account/link', {iqUserId: 888002}, Cc); assert.equal(r.d.linked, true); assert.equal(r.d.source, 'imported');
r = await call('POST', '/api/admin/invites', {count: 2, note: 'old members'}, {'X-Admin-Key': 'ADM'}); const code = r.d.invites[0].code; assert.match(code, /^ZB-[A-Z0-9]{4}-[A-Z0-9]{2}$/);
r = await call('POST', '/api/invite/redeem', {code: 'ZB-NOPE-00'}, Bb); assert.equal(r.s, 404);
r = await call('POST', '/api/invite/redeem', {code}, Bb); assert.equal(r.s, 200);
r = await call('POST', '/api/account/link', {iqUserId: 777000}, Bb); assert.equal(r.d.linked, true); assert.equal(r.d.source, 'invite');
r = await call('POST', '/api/invite/redeem', {code}, A); assert.equal(r.s, 409, 'single use');
// 4) anti-farming: withdraw then redeposit -> flagged, no bonus
await call('GET', '/api/postback/affstore?key=PBK&event=withdrawal&user_id=555001&amount=240&tid=e3');
r = await call('GET', '/api/postback/affstore?key=PBK&event=deposit&user_id=555001&amount=250&tid=e4'); assert.equal(r.d.credited.flagged, true); assert.equal(r.d.credited.coins, 100, 'only the $10 of truly new money counts');
// genuine top-up later still earns: +$1000 net new -> 15000 coins
r = await call('GET', '/api/postback/affstore?key=PBK&event=deposit&user_id=555001&amount=1000&tid=e5'); assert.equal(r.d.credited.coins, 15000);
r = await call('GET', '/api/admin/stats', null, {'X-Admin-Key': 'ADM'}); console.log('stats', r.d);
// 5) launch flow without OAuth
const D = {'X-TG-Init-Data': initData(2001, 'Dee')}, E2 = {'X-TG-Init-Data': initData(2002, 'Eve')};
r = await call('POST', '/api/register/link', {}, D); assert.equal(r.d.url, 'https://affiliate.example/redir/?aff=4242&afftrack=Zubabot_tg2001');
r = await call('GET', '/api/me', null, D); assert.equal(r.d.user.linked, 0);
await call('GET', '/api/postback/affstore?key=PBK&event=reg&user_id=990001&afftrack=Zubabot_tg2001&tid=r9');
r = await call('GET', '/api/me', null, D); assert.equal(r.d.user.linked, 1); assert.equal(r.d.user.iq_user_id, '990001');
r = await call('POST', '/api/account/claim', {iqUserId: '123'}, E2); assert.equal(r.s, 400);
r = await call('POST', '/api/account/claim', {iqUserId: '555555'}, E2); assert.equal(r.d.linked, false);
r = await call('POST', '/api/account/claim', {iqUserId: '990001'}, E2); assert.equal(r.s, 409);
r = await call('POST', '/api/account/claim', {iqUserId: '888003'}, E2); assert.equal(r.d.linked, true);
for (let i = 0; i < 4; i++) r = await call('POST', '/api/account/claim', {iqUserId: '555555'}, E2);
assert.equal(r.s, 429, 'rate limited');
r = await call('POST', '/api/admin/strategy', {mode: 'test', leadSec: 0, alignMinute: false, testers: '2001', pairs: [{s: 'EUR/USD', on: true, src: 'manual', trend: 'up'}]}, {'X-Admin-Key': 'ADM'}); assert.equal(r.d.strategy.mode, 'test');
r = await call('POST', '/api/admin/signals', {pair: 'EUR/USD', dir: 'buy', expiryMin: 1, conf: 88, note: 'Roland'}, {'X-Admin-Key': 'ADM'}); assert.equal(r.d.signal.mode, 'test');
r = await call('GET', '/api/signals', null, D); assert.equal(r.d.signals.length, 1); assert.equal(r.d.signals[0].pair, 'EUR/USD');
r = await call('GET', '/api/signals', null, E2); assert.equal(r.d.signals.length, 0);
r = await call('POST', '/api/admin/strategy', {mode: 'live'}, {'X-Admin-Key': 'ADM'});
r = await call('POST', '/api/admin/signals', {pair: 'EUR/USD', dir: 'sell'}, {'X-Admin-Key': 'ADM'}); assert.equal(r.d.signal.mode, 'live');
r = await call('GET', '/api/signals', null, E2); assert.equal(r.d.signals.length, 1); assert.equal(r.d.signals[0].dir, 'sell');
r = await call('POST', '/api/admin/signals/resolve', {id: r.d.signals[0].id, status: 'win'}, {'X-Admin-Key': 'ADM'}); assert.equal(r.d.signal.status, 'win');
r = await call('GET', '/api/signals', null, E2); assert.equal(r.d.recent[0].status, 'win');
r = await call('GET', '/api/admin/results?mode=live', null, {'X-Admin-Key': 'ADM'}); assert.equal(r.d.results.wins, 1);
r = await fetch(B + '/admin'); assert.ok((await r.text()).includes('Zubabot Admin'));

console.log('ALL TESTS PASSED'); srv.close(); mock.close(); process.exit(0);
