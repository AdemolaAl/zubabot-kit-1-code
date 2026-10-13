// Invite friends: personal links, first-touch tracking, coins on REAL deposits only.
//
// How someone becomes your friend
//   - they open your link   t.me/<bot>/<app>?startapp=ref_<CODE>   (opens the mini app; Telegram signs the start_param)
//     or the chat link      t.me/<bot>?start=ref_<CODE>            (opens the support chat first)
//   - they must be NEW to Zubabot (first open within the last 30 min, no IQ Option account linked yet), never yourself.
//   - first link wins and can't be changed later.
// What you earn (coins, credited automatically as each deposit is confirmed; .env can change every number)
//   First 24 h after the friend's first deposit of $20+ (REF_WINDOW_H), counting everything they deposit in that window:
//   - under $100 (REF_BIG_FROM): inviter +REF_BASE (200), friend +REF_FRIEND_BASE (100)
//   - $100 and above: inviter REF_PER_DOLLAR (5) coins per $1, max REF_CAP (2,500); friend REF_FRIEND_PER_DOLLAR (2) per $1, max REF_FRIEND_CAP (1,000)
//     (paid as the deposits arrive: only the difference to what was already paid)
//   - after the 24 h: REF_SHARE (0.03) = 3% of the coins the friend earns from each later deposit, for life
//   - REF_MILESTONES (5:1000,15:3000,30:8000): bonus when 5 / 15 / 30 friends are trading
//   Nothing is paid until the friend has taken REF_MIN_TRADES (5) real trades through the app: until then coins are 'reserved'.
// Coins are not money: they can't be withdrawn, only spent to unlock AI traders.
// Safety: only NET new money counts (same rule as deposit rewards); friends flagged for withdraw-and-redeposit earn you nothing.
import crypto from 'node:crypto';

export function referralRoutes({db, q, now, C}) {
  const env = process.env;
  const n_ = (k, d) => (env[k] === undefined || env[k] === '' ? d : +env[k]);
  const BASE = n_('REF_BASE', 200), PER = n_('REF_PER_DOLLAR', 5), CAP = n_('REF_CAP', 2500), BIG = n_('REF_BIG_FROM', 100), WIN = n_('REF_WINDOW_H', 24) * 3600e3;
  const FBASE = n_('REF_FRIEND_BASE', 100), FPER = n_('REF_FRIEND_PER_DOLLAR', 2), FCAP = n_('REF_FRIEND_CAP', 1000), SHARE = n_('REF_SHARE', 0.03);
  const forInviter = (t) => (t >= BIG ? Math.min(CAP, Math.floor(t * PER)) : BASE), forFriend = (t) => (t >= BIG ? Math.min(FCAP, Math.floor(t * FPER)) : FBASE);
  const FTD = BASE, FRIEND = FBASE;      // shown as "from" amounts
  const MINT = n_('REF_MIN_TRADES', 5);   // the friend must take this many real trades before any referral coins are paid
  const MILES = (env.REF_MILESTONES || '5:1000,15:3000,30:8000').split(',').map((x) => x.split(':').map(Number)).filter(([n, c]) => n > 0 && c > 0).sort((a, b) => a[0] - b[0]);
  const BOT = (env.BOT_USERNAME || 'zubabot').replace(/^@/, ''), APPN = env.MINIAPP_NAME || 'app';
  db.exec(`CREATE TABLE IF NOT EXISTS ref_codes(tg_id TEXT PRIMARY KEY, code TEXT UNIQUE, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS referrals(tg_id TEXT PRIMARY KEY, referrer TEXT, code TEXT, src TEXT, created_at INTEGER, ftd_at INTEGER, ftd_amount REAL, coins_to_referrer INTEGER DEFAULT 0);
    CREATE INDEX IF NOT EXISTS referrals_by ON referrals(referrer);
    CREATE TABLE IF NOT EXISTS ref_awards(referrer TEXT, kind TEXT, friend TEXT, coins INTEGER, at INTEGER);
    CREATE INDEX IF NOT EXISTS ref_awards_by ON ref_awards(referrer);`);
  for (const [c, t] of [['win_total', 'REAL DEFAULT 0'], ['paid_ref', 'INTEGER DEFAULT 0'], ['paid_friend', 'INTEGER DEFAULT 0'], ['held_ref', 'INTEGER DEFAULT 0'], ['held_friend', 'INTEGER DEFAULT 0'], ['qualified_at', 'INTEGER']]) if (!q('PRAGMA table_info(referrals)').all().some((x) => x.name === c)) db.exec(`ALTER TABLE referrals ADD COLUMN ${c} ${t}`);
  const hooks = {};                       // hooks.notify(tgId, texts[], cta) -> Telegram message (set by server.js)
  const ping = (id, texts, cta) => { try { hooks.notify && hooks.notify(id, texts, cta).catch(() => {}); } catch (e) {} };

  function codeOf(tgId) {
    const r = q('SELECT code FROM ref_codes WHERE tg_id=?').get(String(tgId)); if (r) return r.code;
    for (let i = 0; i < 20; i++) {
      const c = crypto.randomBytes(5).toString('base64').replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/[O0I1L]/g, '').slice(0, 6);
      if (c.length < 6) continue;
      try { q('INSERT INTO ref_codes(tg_id,code,created_at) VALUES(?,?,?)').run(String(tgId), c, now()); return c; } catch (e) {}
    }
    throw new Error('ref_code_failed');
  }
  const links = (code) => ({app: `https://t.me/${BOT}/${APPN}?startapp=ref_${code}`, chat: `https://t.me/${BOT}?start=ref_${code}`});
  const credit = (tgId, coins) => { q('INSERT OR IGNORE INTO rewards(tg_id) VALUES(?)').run(String(tgId)); q('UPDATE rewards SET coins=coins+? WHERE tg_id=?').run(Math.round(coins), String(tgId)); };

  // attach a new user to whoever invited them. Returns the referrer id or null.
  function attach(friend, raw, src = 'app') {
    const m = String(raw || '').match(/^(?:ref_)?([A-Z2-9]{6})$/i); if (!m) return null;
    const id = String(friend.id), code = m[1].toUpperCase();
    const ref = q('SELECT tg_id FROM ref_codes WHERE code=?').get(code); if (!ref || ref.tg_id === id) return null;
    if (q('SELECT 1 FROM referrals WHERE tg_id=?').get(id)) return null;                        // first link wins
    const u = q('SELECT created_at, linked FROM users WHERE tg_id=?').get(id);
    const bu = (() => { try { return q('SELECT started_at FROM bot_users WHERE tg_id=?').get(id); } catch (e) { return null; } })();
    const first = Math.min(u ? u.created_at || now() : now(), bu ? bu.started_at || now() : now());
    if ((u && u.linked) || now() - first > 30 * 60e3) return null;                                // only brand-new people
    if (q('SELECT 1 FROM referrals WHERE tg_id=? AND referrer=?').get(ref.tg_id, id)) return null; // no A<->B loops
    q('INSERT INTO referrals(tg_id,referrer,code,src,created_at) VALUES(?,?,?,?,?)').run(id, ref.tg_id, code, String(src).slice(0, 12), now());
    ping(ref.tg_id, [`🎉 ${friend.first_name || 'A friend'} just joined Zubabot with your link!`, `When they fund you get +${BASE} coins, and from a $${BIG} first day up to +${CAP.toLocaleString('en-US')}.`], {type: 'app', path: '?go=invite'});
    return ref.tg_id;
  }

  // called from creditRewards() each time a user's NET new deposits are credited
  // real trades the friend placed on IQ Option through the app (failed ones don't count)
  const tradesOf = (id) => { try { return q("SELECT COUNT(DISTINCT iq_option_id) n FROM trades WHERE tg_id=? AND iq_option_id GLOB '[0-9]*' AND LENGTH(iq_option_id)>=5 AND status<>'failed'").get(String(id)).n; } catch (e) { return 0; } };
  const nameOf = (id) => (q('SELECT first_name FROM users WHERE tg_id=?').get(String(id)) || {}).first_name || 'Your friend';
  function milestones(referrer, out) {
    const ok = q('SELECT COUNT(*) n FROM referrals WHERE referrer=? AND qualified_at IS NOT NULL').get(referrer).n;
    for (const [n, c] of MILES) if (ok >= n && !q('SELECT 1 FROM ref_awards WHERE referrer=? AND kind=?').get(referrer, 'mile' + n)) {
      credit(referrer, c); if (out) out.toReferrer += c; q('INSERT INTO ref_awards(referrer,kind,friend,coins,at) VALUES(?,?,?,?,?)').run(referrer, 'mile' + n, null, c, now());
      ping(referrer, [`🏆 ${n} friends are trading! Bonus +${c.toLocaleString('en-US')} coins.`], {type: 'app', path: '?go=invite'}); }
  }
  // pays out what's held once the friend has taken MIN_TRADES real trades. Called on each trade and each deposit.
  function release(friendId) {
    const r = q('SELECT * FROM referrals WHERE tg_id=?').get(String(friendId)); if (!r || !r.ftd_at) return null;
    const n = tradesOf(r.tg_id); if (n < MINT) return {trades: n, need: MINT};
    if (!r.qualified_at) q('UPDATE referrals SET qualified_at=? WHERE tg_id=?').run(now(), r.tg_id);
    const hr = r.held_ref || 0, hf = r.held_friend || 0;
    if (hr || hf) {
      q('UPDATE referrals SET held_ref=0, held_friend=0, coins_to_referrer=coins_to_referrer+? WHERE tg_id=?').run(hr, r.tg_id);
      q("UPDATE ref_awards SET kind=REPLACE(kind,'held:','') WHERE friend=? AND kind LIKE 'held:%'").run(r.tg_id);
      if (hr) { credit(r.referrer, hr); ping(r.referrer, [`✅ ${nameOf(r.tg_id)} has taken ${MINT} trades!`, `+${hr.toLocaleString('en-US')} coins are now in your wallet 🔥`], {type: 'app', path: '?go=invite'}); }
      if (hf) { credit(r.tg_id, hf); ping(r.tg_id, [`🎁 Your +${hf.toLocaleString('en-US')} welcome coins are unlocked!`, 'Spend them on any AI trader in the marketplace.'], {type: 'app'}); }
    }
    if (!r.qualified_at) milestones(r.referrer);
    return {trades: n, need: MINT, released: hr};
  }
  function onTrade(friendId) { try { return release(friendId); } catch (e) { console.warn('[ref] trade', e.message); return null; } }

  // called from creditRewards() each time a user's NET new deposits are credited
  function onDeposit(tgId, add, netTotal, flagged) {
    const r = q('SELECT * FROM referrals WHERE tg_id=?').get(String(tgId)); if (!r || flagged || add <= 0) return null;
    const out = {referrer: r.referrer, toReferrer: 0, toFriend: 0, held: 0};
    const ok = !!r.qualified_at;                          // friend already has 5 real trades -> pay now, else hold
    const award = (kind, coins) => { if (coins <= 0) return;
      q('INSERT INTO ref_awards(referrer,kind,friend,coins,at) VALUES(?,?,?,?,?)').run(r.referrer, (ok ? '' : 'held:') + kind, r.tg_id, coins, now());
      if (ok) { credit(r.referrer, coins); out.toReferrer += coins; q('UPDATE referrals SET coins_to_referrer=coins_to_referrer+? WHERE tg_id=?').run(coins, r.tg_id); }
      else { out.held += coins; q('UPDATE referrals SET held_ref=COALESCE(held_ref,0)+? WHERE tg_id=?').run(coins, r.tg_id); } };
    const toFriend = (coins) => { if (coins <= 0) return; if (ok) { credit(r.tg_id, coins); out.toFriend += coins; } else q('UPDATE referrals SET held_friend=COALESCE(held_friend,0)+? WHERE tg_id=?').run(coins, r.tg_id); };
    const name = nameOf(r.tg_id);
    const first = !r.ftd_at && netTotal >= C.minDeposit;
    if (first) q('UPDATE referrals SET ftd_at=?, ftd_amount=? WHERE tg_id=?').run(now(), netTotal, r.tg_id);
    const ftdAt = first ? now() : r.ftd_at;
    if (ftdAt && now() - ftdAt <= WIN) {
      // inside the first 24 h: the reward follows everything deposited so far (first deposit included)
      const total = first ? netTotal : (r.win_total || 0) + add;
      const dRef = Math.max(0, forInviter(total) - (r.paid_ref || 0)), dFr = Math.max(0, forFriend(total) - (r.paid_friend || 0));
      q('UPDATE referrals SET win_total=?, paid_ref=paid_ref+?, paid_friend=paid_friend+? WHERE tg_id=?').run(total, dRef, dFr, r.tg_id);
      award(first ? 'ftd' : 'ftd_more', dRef); toFriend(dFr);
      const t = tradesOf(r.tg_id), left = Math.max(0, MINT - t);
      if (dRef > 0) ping(r.referrer, first ? [`💰 ${name} just funded $${Math.round(total)}!`, ok ? `+${dRef.toLocaleString('en-US')} coins are in your wallet.` : `+${dRef.toLocaleString('en-US')} coins are reserved for you. They land as soon as ${name} takes ${MINT} trades (${t}/${MINT} so far).`]
        : [`🔥 ${name} added more: $${Math.round(total)} in their first day.`, `+${dRef.toLocaleString('en-US')} more coins ${ok ? 'for you' : 'reserved for you'}.`], {type: 'app', path: '?go=invite'});
      if (first && !ok && dFr > 0) ping(r.tg_id, [`🎁 You've got +${dFr.toLocaleString('en-US')} welcome coins waiting!`, `Take ${left} trade${left === 1 ? '' : 's'} and they unlock.`], {type: 'app'});
    } else if (ftdAt) {
      award('share', Math.floor(add * 10 * SHARE));       // after the first day: 3% of the 10 coins per $1 the friend earns
    }
    release(r.tg_id);                                    // if they already have 5 trades, everything held is paid now
    return out;
  }

  function stats(tgId) {
    const id = String(tgId), code = codeOf(id);
    const fr = q(`SELECT r.tg_id, r.created_at, r.ftd_at, r.qualified_at, r.held_ref, r.coins_to_referrer, r.win_total, u.first_name, u.linked, COALESCE(a.deposits_total,0) dep
      FROM referrals r LEFT JOIN users u ON u.tg_id=r.tg_id LEFT JOIN aff_accounts a ON a.iq_user_id=u.iq_user_id WHERE r.referrer=? ORDER BY r.created_at DESC LIMIT 200`).all(id);
    const earned = q("SELECT COALESCE(SUM(coins),0) s FROM ref_awards WHERE referrer=? AND kind NOT LIKE 'held:%'").get(id).s;
    const held = q("SELECT COALESCE(SUM(coins),0) s FROM ref_awards WHERE referrer=? AND kind LIKE 'held:%'").get(id).s;
    const funded = fr.filter((f) => f.ftd_at).length, trading = fr.filter((f) => f.qualified_at).length;
    const next = MILES.find(([n]) => trading < n) || null;
    const by = q('SELECT r.referrer, u.first_name FROM referrals r LEFT JOIN users u ON u.tg_id=r.referrer WHERE r.tg_id=?').get(id);
    return {code, links: links(code), rules: {minTrades: MINT, ftd: FTD, friend: FRIEND, share: SHARE, min: C.minDeposit, milestones: MILES, big: BIG, per: PER, cap: CAP, fper: FPER, fcap: FCAP, windowH: WIN / 3600e3},
      stats: {invited: fr.length, joined: fr.filter((f) => f.linked).length, funded, trading, earned, held, pending: (fr.length - funded) * BASE + held},
      next: next ? {friends: next[0], coins: next[1], left: next[0] - trading} : null,
      friends: fr.map((f) => ({name: (f.first_name || 'Friend').slice(0, 18), at: f.created_at, status: f.qualified_at ? 'trading' : f.ftd_at ? 'funded' : f.linked ? 'joined' : 'opened', coins: f.coins_to_referrer || 0, held: f.held_ref || 0, trades: f.ftd_at && !f.qualified_at ? Math.min(MINT, tradesOf(f.tg_id)) : undefined,
        firstDay: f.ftd_at ? Math.round(f.win_total || 0) : 0, hoursLeft: f.ftd_at ? Math.max(0, Math.ceil((f.ftd_at + WIN - now()) / 3600e3)) : 0})),
      invitedBy: by ? {name: by.first_name || 'a friend', bonus: FRIEND, cap: FCAP} : null};
  }

  const routes = {
    'GET /api/ref/me': async (req, b, u) => { if (!u) return [401, {ok: false, error: 'telegram_auth'}]; return {ok: true, ...stats(u.id)}; },
    // the app sends the start_param it was opened with (also read from the signed init data on the server)
    'POST /api/ref/attach': async (req, b, u) => { if (!u) return [401, {ok: false, error: 'telegram_auth'}];
      const r = attach(u, u.start_param || b.code, 'app'); return {ok: true, attached: !!r}; },
    'GET /api/admin/referrals': async () => ({ok: true,
      top: q(`SELECT r.referrer, u.first_name, COUNT(*) invited, SUM(CASE WHEN r.ftd_at IS NOT NULL THEN 1 ELSE 0 END) funded, (SELECT COALESCE(SUM(coins),0) FROM ref_awards w WHERE w.referrer=r.referrer) coins
        FROM referrals r LEFT JOIN users u ON u.tg_id=r.referrer GROUP BY r.referrer ORDER BY funded DESC, invited DESC LIMIT 100`).all(),
      totals: q('SELECT COUNT(*) invited, SUM(CASE WHEN ftd_at IS NOT NULL THEN 1 ELSE 0 END) funded FROM referrals').get(),
      coins: q('SELECT COALESCE(SUM(coins),0) s FROM ref_awards').get().s}),
  };
  return {routes, attach, onDeposit, onTrade, release, stats, codeOf, hooks};
}
