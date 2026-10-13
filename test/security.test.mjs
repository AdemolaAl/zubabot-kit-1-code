// Security: the scanner (links in every form, look-alike sites, other brokers, wallets, IBANs, payment asks, private contacts),
// and the server rules around it: owner-only rules, buyers locked out, funnel links on IQ Option only, sanitized mentors,
// teammate buttons can't open other sites, every AI reply gated once.
import http from 'node:http'; import assert from 'node:assert/strict'; import fs from 'node:fs';
for (const f of ['/tmp/zbsec.db', '/tmp/zbsec.db-wal', '/tmp/zbsec.db-shm']) fs.rmSync(f, {force: true});
const SENT = []; let AI_TEXT = 'Sure! Text me on WhatsApp +44 7700 900123 and join https://pocketoption.com/register';
http.createServer(async (q, s) => { const ch = []; for await (const c of q) ch.push(c); const raw = Buffer.concat(ch); s.setHeader('Content-Type', 'application/json');
  if (q.url === '/v1/messages') return s.end(JSON.stringify({content: [{type: 'text', text: AI_TEXT}]}));
  const m = q.url.match(/^\/bot[^/]+\/(\w+)/); if (m) { SENT.push([m[1], raw.length ? JSON.parse(raw) : {}]); return s.end(JSON.stringify({ok: true, result: m[1] === 'getUpdates' ? [] : m[1] === 'getMe' ? {id: 5, username: 'x_bot'} : {message_id: 1}})); }
  s.statusCode = 404; s.end('{}'); }).listen(9995);
Object.assign(process.env, {TELEGRAM_BOT_TOKEN: '111:TEST', TELEGRAM_API: 'http://127.0.0.1:9995', DB_FILE: '/tmp/zbsec.db', ADMIN_KEY: 'AK', ANTHROPIC_API_KEY: 'sk', ANTHROPIC_BASE: 'http://127.0.0.1:9995', QUIET_HOURS: '0-0', APP_URL: 'https://app.zubabot.com', BOT_USERNAME: 'zubabot_bot', AFF_ID: '743768', BOT_MODE: 'off', SUPPORT_MODE: 'off'});
const {createServer, db, BRAIN, TEAM} = await import('../server/server.js');
const srv = createServer().listen(9996); const B = 'http://127.0.0.1:9996';
const api = async (key, path, body) => { const r = await fetch(B + path, {method: body === undefined ? 'GET' : 'POST', headers: {'content-type': 'application/json', 'X-Admin-Key': key}, body: body === undefined ? undefined : JSON.stringify(body)}); return {status: r.status, ...(await r.json())}; };
const ALERTS = []; const oa = TEAM.alert; TEAM.alert = (...a) => { ALERTS.push(a); return oa(...a); };

/* ---------- 1. the scanner ---------- */
const {makeSecurity} = await import('../server/security.js'); const {makeSettings} = await import('../server/settings.js');
const {DatabaseSync} = await import('node:sqlite'); const mdb = new DatabaseSync(':memory:'); const mq = (s) => mdb.prepare(s);
const SC = makeSecurity({db: mdb, q: mq, now: Date.now, settings: makeSettings({db: mdb, q: mq, now: Date.now}), team: {alert: async () => 0}, C: {affId: '743768'}});
const cases = [
  ['ok', 'Open the app: https://app.zubabot.com/?go=fund'], ['ok', 'invite: https://app.zubabot.com/?ref=abc'], ['ok', 'Your signal: EUR/USD buy at 14:05, on IQ Option'],
  ['ok', 'https://iqbroker.com/lp/regframe-01-light-nosocials/en/?aff=743768&afftrack=x'], ['ok', 'e.g. this is fine. Node.js too. 1.5x return? no promises'], ['ok', 't.me/zubabot_bot?start=ref_1'],
  ['ok', 'https://iqbroker.com/lp/x/?aff=%37%34%33%37%36%38'],
  ['block', 'iqoption.com/lp/regframe?aff=99999'], ['block', 'IQOPTION.COM/LP/REGFRAME?AFF=99999'], ['block', 'https://iq-option.com.evil.ru/lp/regframe?aff=743768'], ['block', 'https://evil.com/?aff=743768'],
  ['block', 'https://exnessbroker.org/register'], ['block', 'https://iqbroker.com/lp/x/?aff=%37%34%33%37%36%39'], ['block', 'https://pocketoption.com/?utm=iqoption'], ['block', 'pocketoption.com/register'],
  ['block', 'pay here GB82 WEST 1234 5698 7654 32'], ['block', 'send 50 usdt to my wallet'], ['block', 'https://iqbroker.com/lp/x/?aff=%ZZ'], ['block', 'https://iqbroker.com/lp/x/?aff=743768&aff=99999'],
  ['block', 'switch to olymptrade, it pays more'], ['block', 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE'], ['block', 'https://iqoption.com/lp/regframe/'],
  ['block', 'https://iqoption.com@evil.com/lp'], ['block', 'https://iq.com.ru/register'], ['block', 'hxxps://pocket0ption.com'], ['block', 'google.com/url?q=https://pocketoption.com'],
  ['block', 'po.cash/abc'], ['block', 'qxbroker.zone/x'], ['block', 'iqoption.com/lp?aff=743768&affiliate_id=1'], ['block', 'iqoption.com/lp?aff=743768&ref=55'], ['block', 'https://xn--iqption-3ve.com/register'],
  ['flag', 'Visit https://trade-signals.club for my VIP group'], ['ok', 'Mr.Smith said ok. U.S. markets open'], ['ok', 'EUR/USD and GBP/USD 1.0850'],
  ['flag', 'telegram.dog/x'], ['flag', 'tg://resolve?domain=x'], ['flag', 'https://instagram.com/x'], ['flag', 'wa.link/x'], ['flag', 'https://wa.me/447700900123'], ['flag', 'DM me @fastmoneyguy'],
  ['flag', 'check https://bit.ly/abc'], ['flag', 'see https://tradingview.com/chart'], ['flag', 'join t.me/+AbCdEf123'], ['flag', 'me chama no zap'], ['flag', 'escríbeme al privado'], ['flag', 'ทักแชทส่วนตัวนะ'],
];
for (const [want, t] of cases) assert.equal(SC.scan(t).severity, want, `${want}: ${t} -> ${JSON.stringify(SC.scan(t).findings)}`);
const crash = await SC.check('weird %E0%A4%A link https://iqbroker.com/?aff=%E0%A4%A', {source: 'test'}); assert.equal(crash.ok, false, 'a link that cannot be decoded is blocked');
console.log('1 scanner OK (' + cases.length + ' cases)');

/* ---------- 2. roles ---------- */
const mk = async (name, role, subs) => (await api('AK', '/api/admin/team', {name, role, subs})).key;
const MGR = await mk('Mira', 'manager'), BUY = await mk('Ben', 'buyer', 'b1'), TECH = await mk('Tom', 'tech');
let r = await api(MGR, '/api/admin/security/settings', {on: false}); assert.equal(r.status, 403, 'only the owner can switch security off');
r = await api(MGR, '/api/admin/security/settings', {handles: '@mycontact'}); assert.equal(r.status, 403, 'only the owner trusts handles');
r = await api(MGR, '/api/admin/security/settings', {affIds: '555'}); assert.equal(r.status, 403);
r = await api(TECH, '/api/admin/settings/reset', {key: 'security'}); assert.ok(r.status === 403, 'tech cannot reset security');
ALERTS.length = 0; r = await api('AK', '/api/admin/security/settings', {handles: '@zubabot_support'}); assert.equal(r.ok, true); assert.ok(ALERTS.some(([t, x, o]) => /Security rules changed/.test(x) && o.email && o.all), 'owner change emailed to all admins');
r = await api(BUY, '/api/admin/bots/add', {token: '123456:' + 'a'.repeat(35), lang: 'en'}); assert.equal(r.status, 403, 'buyers cannot connect bots');
r = await api(BUY, '/api/admin/funnels/history?slug=main'); assert.equal(r.status, 403, 'buyers cannot read change history');
r = await api(BUY, '/api/admin/funnels/save', {slug: 'x', name: 'x'}); assert.equal(r.status, 403);
// a buyer's "b1" doesn't cover "b10"
db.prepare("INSERT INTO attrib(tg_id,funnel,sub,bot,lang,first_at) VALUES('1','main','b1-fb',0,'en',1),('2','main','b10',0,'en',1),('3','main','b1',0,'en',1)").run();
r = await api(BUY, '/api/admin/funnels/subs?slug=main'); const subs = r.rows.map((x) => JSON.stringify(x)).join(); assert.ok(/b1-fb/.test(subs) && !/b10/.test(subs), 'buyer sees only own subs ' + subs);
console.log('2 roles OK');

/* ---------- 3. funnel links and mentors ---------- */
r = await api(MGR, '/api/admin/funnels/save', {slug: 'po', name: 'po', lang: 'en', aff_link: 'https://pocketoption.com/register?aff=743768'}); assert.equal(r.status, 400, 'sign-up link must be on IQ Option'); assert.match(r.error, /must be on IQ Option/);
r = await api(MGR, '/api/admin/funnels/save', {slug: 'po', name: 'po', lang: 'en', aff_link: 'https://iqbroker.com/lp/x/?aff=743768&aff=1'}); assert.equal(r.status, 400, 'one aff only');
ALERTS.length = 0; r = await api(MGR, '/api/admin/funnels/save', {slug: 'uk', name: 'uk', lang: 'en', aff_link: 'https://iqbroker.com/lp/x/?aff=743768', track: 'uk_'}); assert.equal(r.ok, true);
assert.ok(ALERTS.some(([t, x]) => /Funnel "uk" created by Mira/.test(x)), 'a new funnel with its own link is announced');
r = await api(MGR, '/api/admin/funnels/save', {edit: true, slug: 'uk', name: 'uk 2', lang: 'en'}); assert.equal(r.funnel.aff_link, 'https://iqbroker.com/lp/x/?aff=743768', 'saving without the affiliate fields keeps them'); assert.equal(r.funnel.track, 'uk_');
r = await api(MGR, '/api/admin/funnels/save', {edit: true, slug: 'uk', name: 'uk', lang: 'en', track_sub: 0}); assert.equal(r.funnel.track_sub, 0, 'track_sub 0 means off');
r = await api(MGR, '/api/admin/funnels/save', {edit: true, slug: 'uk', name: 'uk', lang: 'en', mentor: {on: true, name: 'Jim<img src=x onerror=alert(1)>', bio: '<script>x</script>'}}); assert.equal(r.ok, true);
assert.doesNotMatch(JSON.stringify(r.funnel.mentor), /[<>]/, 'mentor text sanitized');
r = await api('AK', '/api/admin/languages/region', {lang: 'pt', mentor: {name: 'Rafa<img src=x>', bio: '"><script>', photo: 'javascript:alert(1)'}}); assert.equal(r.status, 400, 'bad photo refused');
r = await api('AK', '/api/admin/languages/region', {lang: 'pt', mentor: {name: 'Rafa<img src=x>', bio: '"><script>'}}); assert.equal(r.ok, true); assert.doesNotMatch(r.mentor.name + r.mentor.bio, /[<>"]/);
r = await api('AK', '/api/admin/lives', {link: 'https://t.me/joinchat/xyz'}); assert.equal(r.ok, true, 'flagged, not blocked'); assert.ok(db.prepare("SELECT 1 FROM security_events WHERE source='lives link'").get(), 'lives link checked');
r = await api('AK', '/api/admin/lives', {link: 'https://pocketoption.com/live'}); assert.equal(r.status, 400, 'lives link to another broker blocked');
console.log('3 funnel links + mentors OK');

/* ---------- 4. teammate messages and buttons ---------- */
db.prepare("INSERT INTO bot_users(tg_id,chat_id,first_name,started_at,last_in) VALUES('77','77','Tobi',1,1)").run();
r = await api(MGR, '/api/admin/member/message', {tg_id: '77', text: 'join https://iqbroker.com/lp/x/?aff=1234'}); assert.equal(r.status, 400, 'member message gated');
r = await api(MGR, '/api/admin/bot/send', {tg_id: '77', text: 'hello', cta: {type: 'app', path: '.evil.com/x', label: 'Open'}}); assert.equal(r.ok, true);
const btn = SENT.filter(([k, j]) => k === 'sendMessage' && j.chat_id === '77').at(-1)[1].reply_markup; assert.ok(!btn || !JSON.stringify(btn).includes('evil'), 'button cannot open another site ' + JSON.stringify(btn));
r = await api(MGR, '/api/admin/bot/send', {tg_id: '77', text: 'hi', cta: {type: 'app', path: '?go=fund', label: 'DM me @scammer'}}); assert.equal(r.status, 200); assert.ok(db.prepare("SELECT 1 FROM security_events WHERE text LIKE '%@scammer%' AND who='Mira'").get(), 'button label checked, as the teammate');
console.log('4 teammate messages OK');

/* ---------- 5. every AI reply is gated once (voice, chart, app, Telegram) ---------- */
const before = db.prepare('SELECT COUNT(*) n FROM security_events').get().n;
const out = await BRAIN.reply({tgId: '77', kind: 'ai', profile: {key: 'luna', name: 'Zara'}, history: [], text: 'hi', channel: 'voice', area: 'voice'});
assert.doesNotMatch(out.messages.join(' '), /pocketoption|WhatsApp/i, 'blocked AI text never goes out'); assert.equal(out.checked, true);
assert.equal(db.prepare('SELECT COUNT(*) n FROM security_events').get().n, before + 1, 'recorded once');
console.log('5 AI gate OK');
console.log('SECURITY TESTS PASSED'); srv.close(); process.exit(0);
