// Zubabot Pay: our own non-custodial crypto checkout.
// Users buy coins or tokens with USDT (TRC20) or Bitcoin. Money goes straight to OUR wallets; no third party.
// How a payment is matched: every invoice gets a unique amount (a few extra cents / sats), so one wallet address
// is enough. A watcher checks the blockchain every 20 s (TronGrid for USDT, mempool.space for BTC) and credits
// the coins/tokens automatically when the exact amount arrives.
//
// .env:
//   PAY_USDT_TRC20_ADDRESS=T...      your Trust Wallet USDT (TRC20) receive address
//   PAY_BTC_ADDRESS=bc1...           your BTC receive address
//   TRONGRID_KEY=                    optional (free key from trongrid.io, avoids rate limits)
//   PAY_MINUTES=30                   how long an invoice stays open
//   PAY_BTC_CONFIRMATIONS=1          confirmations needed for BTC (USDT: TronGrid "only_confirmed")

export const PACKS = {
  coins: [{id: 'c80', amount: 80, usd: 10}, {id: 'c220', amount: 220, usd: 25, tag: '+10% extra'}, {id: 'c500', amount: 500, usd: 50, tag: 'Best value'}],
  tokens: [{id: 't200', amount: 200, usd: 10}, {id: 't550', amount: 550, usd: 25, tag: '+10% extra'}, {id: 't1200', amount: 1200, usd: 50, tag: 'Best value'}],
};
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

export function payRoutes({db, q, now}) {
  const env = process.env;
  const ADDR = {usdt: env.PAY_USDT_TRC20_ADDRESS || '', btc: env.PAY_BTC_ADDRESS || ''};
  const TRON = (env.TRONGRID_BASE || 'https://api.trongrid.io').replace(/\/$/, '');
  const MEMPOOL = (env.MEMPOOL_BASE || 'https://mempool.space').replace(/\/$/, '');
  const MIN = +(env.PAY_MINUTES || 30), BTC_CONF = +(env.PAY_BTC_CONFIRMATIONS || 1);
  db.exec(`CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY, tg_id TEXT, kind TEXT, pack TEXT, qty INTEGER, usd REAL,
    coin TEXT, address TEXT, amount_str TEXT, amount_units INTEGER, status TEXT, txid TEXT, created_at INTEGER, expires_at INTEGER, paid_at INTEGER);
    CREATE INDEX IF NOT EXISTS pay_open ON payments(status, coin);`);

  let btcUsd = {v: 0, at: 0};
  async function btcPrice() {
    if (now() - btcUsd.at < 120e3 && btcUsd.v) return btcUsd.v;
    const r = await fetch(MEMPOOL + '/api/v1/prices'); const d = await r.json(); if (!d.USD) throw new Error('btc_price');
    btcUsd = {v: d.USD, at: now()}; return d.USD;
  }
  // unique amount among open invoices of the same coin
  function uniqueUnits(coin, base, step, max) {
    const open = new Set(q("SELECT amount_units FROM payments WHERE coin=? AND status='pending' AND expires_at>?").all(coin, now()).map((r) => r.amount_units));
    for (let i = 0; i < 400; i++) { const u = base + step * (1 + Math.floor(Math.random() * max)); if (!open.has(u)) return u; }
    throw new Error('busy_try_again');
  }
  const pub = (p) => p && ({id: p.id, kind: p.kind, qty: p.qty, usd: p.usd, coin: p.coin, network: p.coin === 'usdt' ? 'USDT · TRC20' : 'Bitcoin', address: p.address, amount: p.amount_str,
    uri: p.coin === 'btc' ? `bitcoin:${p.address}?amount=${p.amount_str}` : p.address, status: p.status, txid: p.txid || null, expiresAt: p.expires_at, now: now()});

  function credit(p, txid) {
    const r = q("UPDATE payments SET status='paid', txid=?, paid_at=? WHERE id=? AND status IN ('pending','expired')").run(txid, now(), p.id);
    if (!r.changes) return false;
    q('INSERT OR IGNORE INTO rewards(tg_id) VALUES(?)').run(p.tg_id);
    q(`UPDATE rewards SET ${p.kind === 'tokens' ? 'tokens=tokens+?' : 'coins=coins+?'} WHERE tg_id=?`).run(p.qty, p.tg_id);
    console.log('[pay] paid', p.id, p.coin, p.amount_str, '->', p.qty, p.kind, 'tg', p.tg_id);
    return true;
  }

  async function checkUsdt(list) {
    if (!list.length || !ADDR.usdt) return;
    const since = Math.min(...list.map((p) => p.created_at)) - 60e3;
    const h = env.TRONGRID_KEY ? {'TRON-PRO-API-KEY': env.TRONGRID_KEY} : {};
    const r = await fetch(`${TRON}/v1/accounts/${ADDR.usdt}/transactions/trc20?only_to=true&only_confirmed=true&limit=200&contract_address=${USDT_CONTRACT}&min_timestamp=${since}`, {headers: h});
    const d = await r.json(); const used = new Set(q("SELECT txid FROM payments WHERE coin='usdt' AND txid IS NOT NULL").all().map((x) => x.txid));
    for (const tx of d.data || []) {
      if (used.has(tx.transaction_id) || (tx.to || '') !== ADDR.usdt || (tx.token_info && tx.token_info.address && tx.token_info.address !== USDT_CONTRACT)) continue;
      const units = +tx.value;                                                // 6 decimals
      const p = list.find((x) => x.amount_units === units && tx.block_timestamp >= x.created_at - 60e3 && tx.block_timestamp <= x.expires_at + 15 * 60e3);
      if (p && credit(p, tx.transaction_id)) used.add(tx.transaction_id);
    }
  }
  async function checkBtc(list) {
    if (!list.length || !ADDR.btc) return;
    const txs = await (await fetch(`${MEMPOOL}/api/address/${ADDR.btc}/txs`)).json();
    const tip = BTC_CONF > 1 ? +(await (await fetch(`${MEMPOOL}/api/blocks/tip/height`)).text()) : 0;
    const used = new Set(q("SELECT txid FROM payments WHERE coin='btc' AND txid IS NOT NULL").all().map((x) => x.txid));
    for (const tx of txs || []) {
      if (used.has(tx.txid) || !tx.status || !tx.status.confirmed) continue;
      if (BTC_CONF > 1 && tip - tx.status.block_height + 1 < BTC_CONF) continue;
      const t = (tx.status.block_time || 0) * 1000;
      for (const o of tx.vout || []) {
        if (o.scriptpubkey_address !== ADDR.btc) continue;
        const p = list.find((x) => x.amount_units === o.value && t >= x.created_at - 60e3 && t <= x.expires_at + 3 * 3600e3);
        if (p && credit(p, tx.txid)) { used.add(tx.txid); break; }
      }
    }
  }
  async function tick() {
    q("UPDATE payments SET status='expired' WHERE status='pending' AND expires_at<?").run(now() - 3 * 3600e3);
    // keep watching a little after expiry: people pay late
    const open = q("SELECT * FROM payments WHERE status IN ('pending','expired') AND expires_at>?").all(now() - 3 * 3600e3);
    await Promise.all([checkUsdt(open.filter((p) => p.coin === 'usdt')).catch((e) => console.warn('[pay] usdt', e.message)),
      checkBtc(open.filter((p) => p.coin === 'btc')).catch((e) => console.warn('[pay] btc', e.message))]);
  }

  const routes = {
    'GET /api/pay/packs': async () => ({ok: true, packs: PACKS, coins: {usdt: !!ADDR.usdt, btc: !!ADDR.btc}}),
    'POST /api/pay/create': async (req, b, u) => {
      if (!u) return [401, {ok: false, error: 'telegram_auth'}];
      const kind = b.kind === 'tokens' ? 'tokens' : 'coins', pack = (PACKS[kind] || []).find((p) => p.id === b.pack);
      const coin = b.coin === 'btc' ? 'btc' : 'usdt';
      if (!pack) return [400, {ok: false, error: 'bad_pack'}];
      if (!ADDR[coin]) return [503, {ok: false, error: 'coin_not_enabled'}];
      // re-use the user's open invoice for the same pack and coin
      const ex = q("SELECT * FROM payments WHERE tg_id=? AND pack=? AND coin=? AND status='pending' AND expires_at>?").get(u.id, pack.id, coin, now() + 5 * 60e3);
      if (ex) return {ok: true, payment: pub(ex)};
      let units, str;
      if (coin === 'usdt') { units = uniqueUnits('usdt', pack.usd * 1e6, 1000, 999); str = (units / 1e6).toFixed(3); }   // e.g. 25.137 USDT
      else { const sats = Math.round(pack.usd / await btcPrice() * 1e8); units = uniqueUnits('btc', sats, 1, 999); str = (units / 1e8).toFixed(8); }
      const id = 'zp_' + Math.random().toString(36).slice(2, 10) + now().toString(36).slice(-4);
      q('INSERT INTO payments(id,tg_id,kind,pack,qty,usd,coin,address,amount_str,amount_units,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, u.id, kind, pack.id, pack.amount, pack.usd, coin, ADDR[coin], str, units, 'pending', now(), now() + MIN * 60e3);
      return {ok: true, payment: pub(q('SELECT * FROM payments WHERE id=?').get(id))};
    },
    'GET /api/pay/status': async (req, b, u, url) => {
      if (!u) return [401, {ok: false, error: 'telegram_auth'}];
      const p = q('SELECT * FROM payments WHERE id=? AND tg_id=?').get(String(url.searchParams.get('id') || ''), u.id);
      if (!p) return [404, {ok: false, error: 'not_found'}];
      const rw = q('SELECT coins,tokens FROM rewards WHERE tg_id=?').get(u.id) || {};
      return {ok: true, payment: pub(p), balance: rw};
    },
    'GET /api/admin/payments': async (req, b, u, url) => ({ok: true, payments: q('SELECT * FROM payments ORDER BY created_at DESC LIMIT ?').all(Math.min(+url.searchParams.get('limit') || 200, 2000)),
      totals: q("SELECT coin, COUNT(*) n, COALESCE(SUM(usd),0) usd FROM payments WHERE status='paid' GROUP BY coin").all()}),
    // admin: mark a payment paid by hand (e.g. someone sent the wrong amount and support checked it)
    'POST /api/admin/payments/mark-paid': async (req, b) => { const p = q('SELECT * FROM payments WHERE id=?').get(String(b.id || '')); if (!p) return [404, {ok: false, error: 'not_found'}]; return {ok: true, credited: credit(p, String(b.txid || 'manual'))}; },
  };
  return {routes, tick};
}
