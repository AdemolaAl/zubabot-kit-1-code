// Security: stops customer diversion and affiliate-link swaps.
// Every message a PERSON sends to users (support replies, mentors, broadcasts, bot flows, the Telegram Business account,
// the mentors' own Telegram accounts connected through Business, channels and groups the security bot watches) and
// every AI message is checked:
//   BLOCK (never delivered, flagged):  a sign-up / affiliate link without one of OUR affiliate IDs, another broker's link,
//                                      a crypto wallet or bank details that aren't ours
//   FLAG  (delivered, recorded):       a private contact (@username / t.me link that isn't ours, WhatsApp, phone number,
//                                      "DM me / text me / my number" in all our languages)
// Only the owner can change the allowed affiliate IDs; every admin gets an email + Telegram alert when they change.
// Everything flagged shows in Admin -> Security and in the security Telegram group, with who sent it, where, and why.

const BROKERS = /\b(olymp\s?trade|olymptrade|pocket\s?option|po\.trade|quotex|qxbroker|binomo|expert\s?option|exness|deriv\.com|binary\.com|iq\s?broker|iqoption|iq-option|iqbroker|xm\.com|octafx|fbs\.com|hfm\.com|raceoption|spectre\.ai|stockity|olymp\.trade)\b/i;
const OUR_BROKER = /\b(iqoption|iq-option|iqbroker|iq\s?option)\b/i;
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+|(?:t\.me|telegram\.me|wa\.me|chat\.whatsapp\.com|api\.whatsapp\.com)\/[^\s<>"']+)/gi;
const AFF_PARAM = /[?&](aff|affid|aff_id|partner|partner_id|ref|refid|ref_id|btag|pid|affiliate)=([^&#\s]+)/i;
const HANDLE = /(?<![\w@./])@([A-Za-z][A-Za-z0-9_]{3,31})\b/g;
const PHONE = /(?<![\d$€£₦.,:])(?:\+|00)?\d[\d\s().-]{8,16}\d(?![\d%x])/g;
const WALLET = /\b(T[1-9A-HJ-NP-Za-km-z]{33}|bc1[02-9ac-hj-np-z]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|0x[a-fA-F0-9]{40})\b/g;
const IBAN_SP = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{2,4}){3,8}\b/g;
const TLD = 'com|net|org|io|co|me|app|ai|xyz|info|biz|ru|br|mx|ph|fr|th|ng|uk|us|link|site|online|top|pro|vip|club|live|trade|bet|cc|to|gg|tv|ly|gl|ee|in|id|vn|es|pt|ar|cl|pe|de|it|eu|ca|au|za|ke|gh|ci|sn|cm|dog|sh|so|page|dev|ws|su|mobi|shop|store|finance|money|markets|capital|exchange|investments|zone|cash|win|fun|space|website|tech|digital|today|world|one|plus|best|bond|click|life|fyi|icu|network|global|company|agency|media|group|team|express|run|social|chat|bio|lol|cam|monster|rest|bar|cfd|sbs|bet|casino|poker|loan|work|ltd|inc';
const BARE = new RegExp('(?<![@\\w.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:' + TLD + ')(?![a-z0-9-])(?:[/?#][^\\s<>"\']*)?', 'gi');
const BARE_PATH = /(?<![@\w.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?=[/?#])[^\s<>"']*/gi;
const TGLINK = /\btg:\/\/[^\s<>"']+/gi;
const OTHER_HOST = /olymp|pocket|po\.trade|po\.cash|pocketbroker|quotex|qxbroker|binomo|expertoption|exness|deriv|binary\.com|octafx|fbs\.|hfm\.|raceoption|spectre\.ai|stockity|xm\.com|avatrade|plus500|etoro|iqcent|olymptrade|pocket-option/i;
const OTHER_TXT = /\b(olymp\s?trade|pocket\s?option|quotex|binomo|expert\s?option|exness|deriv|octafx|raceoption|stockity|spectre\.ai|iqcent|avatrade|plus500|etoro)\b/i;
// "contact me privately", in English, Portuguese, Spanish, Taglish, French and Thai
const PRIVATE = new RegExp([
  'dm me', 'inbox me', 'text me', 'message me (on|at|privately|directly)', 'chat me', 'my (whats ?app|number|telegram|ig|instagram|phone|contact)', 'add me on', 'call me on', 'contact me (on|at|privately|directly)', 'reach me (on|at)', 'send me a (dm|message) (on|at)', 'private(ly)? (chat|message)', 'whats ?app', 'signal app', 'outside (the )?(app|zubabot)', 'my own (group|channel|signals)', 'pay me', 'send (the )?money to me', 'my (account|wallet) (number|address)',
  'me chama no', 'me manda (uma )?mensagem', 'meu (zap|whats|número|numero|telegram|insta)', 'chama no privado', 'no privado', 'fala comigo no',
  'escr[ií]beme', 'mand[aá]me (un )?mensaje', 'mi (n[uú]mero|whats|telegram|insta)', 'al privado', 'por privado', 'h[aá]blame (al|por)',
  'pm mo ako', 'i-?pm mo ako', 'chat mo ako', 'message mo ako', 'number ko', 'gcash ko', 'add mo ako',
  '[ée]cris[- ]moi', 'contacte[- ]moi', 'mon (num[ée]ro|whats|telegram|insta)', 'en priv[ée]', 'appelle[- ]moi',
  'ทักแชทส่วนตัว', 'ทักส่วนตัว', 'แอดไลน์', 'ไลน์ส่วนตัว', 'เบอร์โทร', 'ติดต่อส่วนตัว', 'ทักมาที่', 'โอนเงินมาที่'].join('|'), 'i');
const PAYMENT2 = /\b(send|transfer|pay)\s+(me\s+)?[$€£₦]?\s?\d[\d,.]*\s*(k|usd|usdt|dollars?|naira|btc|eth|reais|pesos|euros?|bucks)?\s+(to|into|on|via)\s+(me|my|this|our|the)\b|\bto my (wallet|account|gcash|pix|bank|cashapp|paypal)\b|\bmy (wallet|usdt|btc|binance|gcash|cashapp|paypal) (address|id|number)\b/i;
const PAYMENT = /(send|transfer|pay|deposit)\s+(the\s+)?(money|funds|usdt|btc|crypto|payment)\s+(to|into)\s+(me|my|this|the following)|bank (account|transfer) (to|details)|account number|routing number|envie (o )?(dinheiro|pix) para|chave pix|env[ií]a(me)? (el )?dinero a|transfi[eé]reme|envoie[- ]moi|virement (sur|à)|โอน(เงิน)?(มา)?ที่บัญชี/i;

export function makeSecurity({db, q, now, settings, team, C}) {
  db.exec(`CREATE TABLE IF NOT EXISTS security_events(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, severity TEXT, source TEXT, who TEXT, tg_id TEXT, chat TEXT, text TEXT, findings TEXT, action TEXT, status TEXT DEFAULT 'open', reviewed_by TEXT, reviewed_at INTEGER, note TEXT);
    CREATE INDEX IF NOT EXISTS security_open ON security_events(status, id);
    CREATE TABLE IF NOT EXISTS security_watch(chat_id TEXT PRIMARY KEY, title TEXT, kind TEXT, bot INTEGER, added_at INTEGER, last_at INTEGER, n INTEGER DEFAULT 0);`);
  const S = () => settings.get('security') || {};
  const allowedAff = () => (S().affIds || [String(C.affId || '')]).map(String).filter(Boolean);
  const ourHandles = () => new Set([...(S().handles || []), process.env.BOT_USERNAME || '', ...(S().extraHandles || [])].map((h) => String(h).replace(/^@/, '').toLowerCase()).filter(Boolean));
  let botNames = () => [];
  const setBotNames = (fn) => { botNames = fn; };
  const ours = (h) => { h = String(h || '').replace(/^@/, '').toLowerCase(); return ourHandles().has(h) || botNames().map((x) => String(x || '').toLowerCase()).includes(h); };
  const ourDomains = () => new Set(['zubabot.com', 'app.zubabot.com', 'api.zubabot.com', 'iqoption.com', 'iq.com', ...(S().domains || [])].map((d) => String(d).toLowerCase()));
  const ourWallets = () => new Set([process.env.PAY_USDT_TRC20_ADDRESS, process.env.PAY_BTC_ADDRESS, ...(S().wallets || [])].filter(Boolean).map((w) => String(w).trim()));

  /* ---------- the check ---------- */
  const OUR_BROKER_HOSTS = () => ['iqoption.com', 'iq.com', 'iqbroker.com', ...(S().brokerDomains || [])].map((d) => String(d).toLowerCase());
  const hostIs = (host, list) => list.some((d) => host === d || host.endsWith('.' + d));
  const dec = (x) => { try { return decodeURIComponent(x); } catch (e) { return null; } };
  function scan(text) {
    const t = String(text || ''); const f = [];
    if (!t.trim()) return {severity: 'ok', findings: f};
    // every link: with http(s):// or www., Telegram/WhatsApp short forms, tg:// links, and bare domains like iqoption.com/lp?aff=1
    const found = []; const seen = (a, b) => found.some((x) => a < x.b && b > x.a);
    for (const re of [URL_RE, TGLINK, BARE_PATH, BARE]) { re.lastIndex = 0; let m; while ((m = re.exec(t))) { if (!seen(m.index, m.index + m[0].length)) found.push({a: m.index, b: m.index + m[0].length, u: m[0]}); } }
    for (const {u: raw} of found) {
      const u = raw.replace(/[).,!?]+$/, ''); const low = u.toLowerCase();
      if (/^tg:\/\//.test(low)) { f.push({type: 'private_link', sev: 'flag', why: 'Telegram app link (tg://) to a private chat', value: u}); continue; }
      let host = '', url = null; try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : 'https://' + u); host = url.hostname.toLowerCase().replace(/^www\./, ''); } catch (e) {}
      if (!host) { f.push({type: 'odd_link', sev: /xn--|iq|opt|pocket|olymp|zuba|broker|aff=/i.test(u) ? 'block' : 'flag', why: 'a link that could not be read', value: u}); continue; }
      // links that pretend to be something else: user@host tricks, punycode look-alikes, redirects to another site
      if (url.username || url.password || /^[^/?#]*@/.test(u.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ''))) { f.push({type: 'fake_site', sev: 'block', why: 'disguised link (text before @ hides the real site)', value: u}); continue; }
      const hostN = host.replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/5/g, 's');
      if (/(^|\.)xn--/.test(host)) { f.push({type: 'fake_site', sev: /iq|opt|zuba|pocket|olymp/.test(host) ? 'block' : 'flag', why: 'international look-alike domain (' + host + ')', value: u}); continue; }
      const inner = url ? [...url.searchParams.values()].map((v) => dec(v) || v).filter((v) => /^(https?:\/\/|www\.)/i.test(v)) : [];
      if (inner.length) { const r2 = inner.map((v) => scan(v)); if (r2.some((x) => x.severity === 'block')) { f.push({type: 'redirect', sev: 'block', why: 'redirect link that leads to ' + r2.flatMap((x) => x.findings).map((x) => x.why).join('; '), value: u}); continue; } }
      // Telegram / WhatsApp / social DMs
      if (hostIs(host, ['t.me', 'telegram.me', 'telegram.dog'])) { const h = (url.pathname.split('/')[1] || '').replace(/^\+/, '');
        if (/^(\+|joinchat)/.test(url.pathname.slice(1))) f.push({type: 'private_link', sev: 'flag', why: 'Telegram invite link to a group or channel', value: u});
        else if (h && !ours(h)) f.push({type: 'private_link', sev: 'flag', why: `Telegram link to @${h} (not one of ours)`, value: u}); continue; }
      if (hostIs(host, ['wa.me', 'wa.link', 'whatsapp.com', 'whatsapp.net'])) { f.push({type: 'private_link', sev: 'flag', why: 'WhatsApp link', value: u}); continue; }
      if (hostIs(host, ['instagram.com', 'facebook.com', 'fb.me', 'm.me', 'messenger.com', 'line.me', 'signal.me', 'discord.gg', 'discord.com', 'snapchat.com', 'viber.com', 'wechat.com', 'tiktok.com', 'x.com', 'twitter.com'])) { f.push({type: 'private_link', sev: 'flag', why: `social / messenger link (${host})`, value: u}); continue; }
      // affiliate parameters, decoded (a broken % encoding is itself suspicious)
      const affs = url ? [...url.searchParams.entries()].filter(([k]) => /^(aff|affid|aff_id|partner|partner_id|ref|refid|ref_id|btag|pid|affiliate|affiliate_id|afftrack_id)$/i.test(k)) : [];
      const bad = /%(?![0-9a-f]{2})/i.test(u) || (/%[0-9a-f]{2}/i.test(u) && dec(u) === null);
      const ourBroker = hostIs(host, OUR_BROKER_HOSTS());
      if (!ourBroker && (BROKERS.test(host) || OTHER_HOST.test(host) || OTHER_HOST.test(hostN))) { f.push({type: 'other_broker', sev: 'block', why: `link to another broker (${host})`, value: u}); continue; }
      if (!ourBroker && !hostIs(host, [...ourDomains()]) && (/iq-?option|iqbroker|zubabot/.test(hostN) || /(^|\.)iq\.com\./.test(host))) { f.push({type: 'fake_site', sev: 'block', why: `look-alike site (${host}), not ours`, value: u}); continue; }
      if (ourBroker) {
        const ids = affs.filter(([k]) => /^(aff|affid|aff_id|partner|partner_id|btag|pid|affiliate)$/i.test(k)).map(([, v]) => v);
        if (bad) { f.push({type: 'wrong_aff', sev: 'block', why: 'broken link encoding (hides the affiliate ID)', value: u}); continue; }
        const extra = affs.filter(([k]) => /^(ref|refid|ref_id|affiliate_id|afftrack_id)$/i.test(k));
        if (ids.length > 1 || (extra.length && ids.length)) { f.push({type: 'wrong_aff', sev: 'block', why: 'more than one affiliate ID in the link', value: u}); continue; }
        if (ids.length && !allowedAff().includes(ids[0])) { f.push({type: 'wrong_aff', sev: 'block', why: `affiliate ID ${ids[0]} is not ours (allowed: ${allowedAff().join(', ')})`, value: u}); continue; }
        if (!ids.length && /lp|regframe|register|signup|sign-up|promo|partner|land/.test(url.pathname.toLowerCase() + url.search.toLowerCase())) { f.push({type: 'wrong_aff', sev: 'block', why: 'sign-up link without our affiliate ID', value: u}); continue; }
        continue;
      }
      if (hostIs(host, [...ourDomains()])) continue;
      if (affs.length || bad) { f.push({type: 'wrong_aff', sev: 'block', why: `affiliate / referral link to a site that isn't ours (${host})`, value: u}); continue; }
      if (/^(bit\.ly|tinyurl\.com|cutt\.ly|rb\.gy|t\.co|shorturl\.at|is\.gd|linktr\.ee|beacons\.ai|tiny\.cc|ow\.ly|s\.id|goo\.gl|rebrand\.ly|lnkd\.in)$/.test(host)) { f.push({type: 'short_link', sev: 'flag', why: `short link (${host}) hides where it goes`, value: u}); continue; }
      f.push({type: 'external_link', sev: 'flag', why: `link to an outside site (${host})`, value: u});
    }
    for (const m of t.matchAll(HANDLE)) if (!ours(m[1]) && !/^(gmail|yahoo|outlook|hotmail)$/i.test(m[1])) f.push({type: 'private_contact', sev: 'flag', why: `@${m[1]} is not one of our accounts`, value: '@' + m[1]});
    // bank details first (so an IBAN written with spaces isn't mistaken for a phone number)
    const ibans = [...t.matchAll(IBAN_SP)].map((m) => m[0]).filter((x) => { const c = x.replace(/\s/g, ''); return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(c); });
    for (const x of ibans) f.push({type: 'bank', sev: 'block', why: 'bank account (IBAN)', value: x});
    const tNoIban = ibans.reduce((a, x) => a.replace(x, ' '), t);
    for (const m of tNoIban.matchAll(PHONE)) { const d = m[0].replace(/\D/g, ''); if (d.length >= 10 && d.length <= 15 && !/^(19|20)\d{6,}$/.test(d)) f.push({type: 'phone', sev: 'flag', why: 'phone number', value: m[0].trim()}); }
    for (const m of t.matchAll(WALLET)) if (!ourWallets().has(m[0])) f.push({type: 'wallet', sev: 'block', why: 'crypto wallet that is not ours', value: m[0]});
    const pm = t.match(PRIVATE); if (pm) f.push({type: 'private_ask', sev: 'flag', why: `asks to contact privately: “${pm[0]}”`, value: pm[0]});
    const pay = t.match(PAYMENT) || t.match(PAYMENT2); if (pay) f.push({type: 'payment', sev: 'block', why: `asks for money outside IQ Option: “${pay[0]}”`, value: pay[0]});
    // another broker named in plain text (no link): pushing people there is blocked, a mention is flagged
    if (!f.some((x) => x.type === 'other_broker')) { const bm = t.match(OTHER_TXT);
      if (bm) { const push = new RegExp('(switch|move|go|use|join|open|register|sign\\s?up|try|download|deposit|trade)\\b[^.!?\\n]{0,40}' + bm[0].replace(/\s/g, '\\s?'), 'i').test(t) || /(better|pays more|instead)/i.test(t);
        f.push({type: 'other_broker', sev: push ? 'block' : 'flag', why: push ? `sends people to another broker (${bm[0]})` : `mentions another broker (${bm[0]})`, value: bm[0]}); } }
    const severity = f.some((x) => x.sev === 'block') ? 'block' : f.length ? 'flag' : 'ok';
    return {severity, findings: f};
  }

  /* ---------- record + alert ---------- */
  const hooks = {sendGroup: null};             // set by the bot: post to the security Telegram group
  async function record({severity, findings}, ctx) {
    const action = severity === 'block' && S().block !== false && ctx.canBlock ? 'blocked' : 'delivered';
    const r = q('INSERT INTO security_events(at,severity,source,who,tg_id,chat,text,findings,action) VALUES(?,?,?,?,?,?,?,?,?)').run(now(), severity, String(ctx.source || ''), String(ctx.who || ''), ctx.tgId ? String(ctx.tgId) : null, ctx.chat ? String(ctx.chat) : null, String(ctx.text || '').slice(0, 4000), JSON.stringify(findings), action);
    const id = Number(r.lastInsertRowid);
    const head = `${severity === 'block' ? '🛑' : '⚠️'} Security ${action === 'blocked' ? 'BLOCKED a message' : 'flag'} #${id}\nFrom: ${ctx.who || 'unknown'} · ${ctx.source}${ctx.tgId ? ' · to user ' + ctx.tgId : ''}${ctx.chatTitle ? ' · ' + ctx.chatTitle : ''}\nWhy: ${findings.map((x) => x.why).join('; ')}\n\n“${String(ctx.text || '').slice(0, 600)}”`;
    try { if (team) team.alert('security', head, {key: 'sec' + id, every: 1}); } catch (e) {}
    try { if (hooks.sendGroup) await hooks.sendGroup(head + `\n\nReview: Admin -> Security`); } catch (e) {}
    return {id, action};
  }
  // the gate every human/AI message goes through. Returns {ok:false} when it must not be delivered.
  async function check(text, ctx = {}) {
    if (S().on === false) return {ok: true};
    let r; try { r = scan(text); } catch (e) { r = {severity: 'block', findings: [{type: 'scan_error', sev: 'block', why: 'the message could not be checked (' + String(e.message).slice(0, 60) + ')'}]}; }
    if (r.severity === 'ok') return {ok: true};
    if (ctx.ai && r.severity === 'flag' && r.findings.every((x) => x.type === 'phone')) return {ok: true};      // AI quoting a number back is fine (outside links ARE recorded)
    const rec = await record(r, {...ctx, text, canBlock: ctx.canBlock !== false});
    return {ok: rec.action !== 'blocked', id: rec.id, severity: r.severity, findings: r.findings};
  }

  // a change every admin must know about (email too), plus the security group
  async function notify(msg, key) {
    try { await team.alert('security', msg, {key: key || 'n' + now(), every: 1, all: true, email: true}); } catch (e) {}
    try { if (hooks.sendGroup) await hooks.sendGroup(msg); } catch (e) {}
  }
  /* ---------- owner-only: allowed affiliate IDs. Every admin is told when they change. ---------- */
  async function setAffIds(ids, who) {
    const list = [...new Set((ids || []).map((x) => String(x).trim()).filter((x) => /^[A-Za-z0-9_-]{2,40}$/.test(x)))];
    if (!list.length) throw Object.assign(new Error('keep at least one affiliate ID'), {status: 400});
    const before = allowedAff().join(', ');
    settings.set('security', {affIds: list}, who.name);
    const msg = `🔐 Affiliate IDs changed by ${who.name}\nBefore: ${before}\nNow: ${list.join(', ')}\n\nIf this wasn't you or the owner, act now: Admin -> Security.`;
    try { await team.alert('security', msg, {key: 'aff' + now(), every: 1, all: true, email: true}); } catch (e) {}
    try { if (hooks.sendGroup) await hooks.sendGroup(msg); } catch (e) {}
    return list;
  }

  const routes = {
    'GET /api/admin/security': async (req, b, u, url) => {
      const st = url.searchParams.get('status') || 'open';
      return {ok: true, settings: {...S(), affIds: allowedAff()}, counts: q("SELECT status, COUNT(*) n FROM security_events GROUP BY status").all(),
        events: q(`SELECT * FROM security_events ${st === 'all' ? '' : 'WHERE status=?'} ORDER BY id DESC LIMIT 200`).all(...(st === 'all' ? [] : [st])).map((e) => ({...e, findings: JSON.parse(e.findings || '[]')})),
        watch: q('SELECT * FROM security_watch ORDER BY last_at DESC').all(), top: q("SELECT who, COUNT(*) n, SUM(CASE WHEN severity='block' THEN 1 ELSE 0 END) blocked FROM security_events WHERE at>? GROUP BY who ORDER BY n DESC LIMIT 10").all(now() - 30 * 864e5)};
    },
    'POST /api/admin/security/review': async (req, b, u, url, who) => {
      const e = q('SELECT * FROM security_events WHERE id=?').get(+b.id); if (!e) return [404, {ok: false}];
      const status = ['ok', 'confirmed', 'open'].includes(b.status) ? b.status : 'ok';
      q('UPDATE security_events SET status=?, reviewed_by=?, reviewed_at=?, note=? WHERE id=?').run(status, who.name, now(), String(b.note || '').slice(0, 500), e.id);
      // a confirmed diversion by a teammate: pause their admin access in one tap
      if (status === 'confirmed' && b.pause && e.who) { const m = q('SELECT id FROM team WHERE name=?').get(e.who); if (m) { q('UPDATE team SET active=0 WHERE id=?').run(m.id); try { team.alert('security', `⛔ ${who.name} paused ${e.who}'s admin access after security event #${e.id}.`, {key: 'pause' + e.id, every: 1, all: true}); } catch (x) {} } }
      return {ok: true};
    },
    'POST /api/admin/security/settings': async (req, b, u, url, who) => {
      const out = {};
      if (b.affIds !== undefined) { if (who.role !== 'owner') return [403, {ok: false, error: 'only the owner can change the affiliate IDs'}]; out.affIds = await setAffIds(Array.isArray(b.affIds) ? b.affIds : String(b.affIds).split(/[,\s]+/), who); }
      const v = {};
      const LOCK = ['on', 'block', 'handles', 'domains', 'brokerDomains', 'groupId', 'removeInChannels'].filter((k) => b[k] !== undefined);
      if (LOCK.length && who.role !== 'owner') return [403, {ok: false, error: 'only the owner can change the security rules'}];
      if (b.on !== undefined) v.on = !!b.on;
      if (b.block !== undefined) v.block = !!b.block;
      if (b.handles !== undefined) v.handles = String(b.handles).split(/[,\s]+/).map((h) => h.replace(/^@/, '')).filter(Boolean).slice(0, 100);
      if (b.domains !== undefined) v.domains = String(b.domains).split(/[,\s]+/).filter(Boolean).slice(0, 100);
      if (b.wallets !== undefined) { if (who.role !== 'owner') return [403, {ok: false, error: 'only the owner can change trusted wallets'}]; v.wallets = String(b.wallets).split(/[,\s]+/).filter(Boolean).slice(0, 20);
        try { team.alert('security', `🔐 Trusted wallet list changed by ${who.name}: ${v.wallets.join(', ') || '(none)'}`, {key: 'w' + now(), every: 1, all: true, email: true}); } catch (e) {} }
      if (b.groupId !== undefined) v.groupId = String(b.groupId).trim().slice(0, 30);
      if (b.brokerDomains !== undefined) v.brokerDomains = String(b.brokerDomains).split(/[,\s]+/).map((d) => d.toLowerCase()).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)).slice(0, 20);
      if (b.removeInChannels !== undefined) v.removeInChannels = !!b.removeInChannels;
      if (Object.keys(v).length) { const before = S(); settings.set('security', v, who.name);
        const ch = Object.keys(v).filter((k) => k !== 'wallets' && JSON.stringify(before[k]) !== JSON.stringify(v[k])).map((k) => `${k}: ${JSON.stringify(before[k] ?? '—')} → ${JSON.stringify(v[k])}`);
        if (ch.length) await notify(`🔐 Security rules changed by ${who.name}\n${ch.join('\n')}`, 'set' + now()); }
      return {ok: true, settings: {...S(), affIds: allowedAff()}, ...out};
    },
    'POST /api/admin/security/test': async (req, b) => ({ok: true, ...scan(String(b.text || ''))}),
  };
  return {scan, check, record, notify, routes, hooks, allowedAff, setAffIds, setBotNames, ours};
}
