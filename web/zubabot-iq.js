// Zubabot <-> IQ Option, browser side. Uses the official SDK: @quadcode-tech/client-sdk-js
// Load it once with a bundler (npm i @quadcode-tech/client-sdk-js) or from the CDN below.
// Trades run from the user's own phone (their own IP), as IQ Option asked.

const CFG = {
  api: window.ZB_API || 'https://api.zubabot.com',                  // your backend
  iqApi: 'https://api.iqoption.com',
  ws: 'wss://iqoption.com/echo/websocket',
  platformId: Number(window.ZB_IQ_PLATFORM || 578),
  clientId: Number(window.ZB_IQ_CLIENT_ID || 0),
  redirectUri: window.ZB_IQ_REDIRECT || 'https://app.zubabot.com/callback.html',
  sdkUrl: window.ZB_SDK_URL || 'https://cdn.jsdelivr.net/npm/@quadcode-tech/client-sdk-js@1.3.26/+esm',
};
let SDKMOD = null, SDK = null, REAL = null;
const tg = () => (window.Telegram && Telegram.WebApp) || null;
async function lib() { return SDKMOD || (SDKMOD = await import(/* @vite-ignore */ CFG.sdkUrl)); }
async function api(path, body) {
  const r = await fetch(CFG.api + path, {method: body === undefined ? 'GET' : 'POST', headers: {'Content-Type': 'application/json', 'X-TG-Init-Data': tg() ? tg().initData : ''}, body: body === undefined ? undefined : JSON.stringify(body)});
  const d = await r.json().catch(() => ({})); if (!r.ok || d.ok === false) throw Object.assign(new Error(d.error || ('http_' + r.status)), {data: d, status: r.status}); return d;
}

/* ---------- 1. Connect button ---------- */
// kind: 'new' (Create my free IQ Option account) or 'login' (I registered with Zubabot's link)
export async function startConnect(kind = 'new', {external = false} = {}) {
  const {url} = await api('/api/oauth/start', {kind});
  try { sessionStorage.setItem('zb_return', location.href) } catch {}
  // Inside Telegram the page usually opens fine in the same view. If Google sign-in is blocked there,
  // call startConnect(kind, {external:true}) to use the phone's own browser instead.
  if (external && tg()) tg().openLink(url); else location.href = url;
}

/* ---------- 2. On callback.html ---------- */
export async function finishCallback() {
  const p = new URLSearchParams(location.search);
  if (p.get('error')) throw new Error(p.get('error'));
  await api('/api/oauth/exchange', {code: p.get('code'), state: p.get('state')});
}

/* ---------- 3. Connect the SDK and detect the account ---------- */
export async function connect() {
  if (SDK) return SDK;
  const {ClientSdk, OAuthMethod, BalanceType} = await lib();
  const {accessToken} = await api('/api/oauth/token', {});
  const storage = {                                             // SDK asks here when it needs a fresh token
    _t: {accessToken}, get() { return this._t }, async set(t) { this._t = t }
  };
  SDK = await ClientSdk.create(CFG.ws, CFG.platformId, new OAuthMethod({apiBaseUrl: CFG.iqApi, clientId: CFG.clientId, redirectUri: CFG.redirectUri, scope: 'full offline_access', tokensStorage: storage}));
  const st = await SDK.wsConnectionState();
  st.subscribeOnStateChanged(async (s) => {                    // token expired: get a new one from our server and reconnect
    if (String(s).toLowerCase().includes('authenticationfailed')) { try { await SDK.shutdown() } catch {} SDK = null; REAL = null; try { await connect() } catch (e) { window.dispatchEvent(new CustomEvent('zb:reconnect-needed')) } }
  });
  const balances = await SDK.balances();
  REAL = balances.getBalances().find((b) => b.type === (window.ZB_DEMO ? BalanceType.Demo : BalanceType.Real)) || null;   // window.ZB_DEMO=true while testing
  // test mode must be impossible to miss, so it never stays on by accident after launch
  if (window.ZB_DEMO && !document.getElementById('zbDemoBadge')) { const d = document.createElement('div'); d.id = 'zbDemoBadge'; d.textContent = 'TEST MODE · IQ Option practice balance (remove ZB_DEMO in config.js before launch)';
    d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483646;background:#EF4D57;color:#fff;font:700 11px/1.3 system-ui,sans-serif;text-align:center;padding:4px 8px;padding-top:calc(4px + env(safe-area-inset-top,0px));pointer-events:none'; document.body.appendChild(d); }
  return SDK;
}
// Returns {linked, pending, source, state} from the server. Call right after connect().
export async function detectAccount({waitForPostbackMs = 90000} = {}) {
  const sdk = await connect();
  const iqUserId = sdk.userProfile.userId, firstName = sdk.userProfile.firstName;
  let r = await api('/api/account/link', {iqUserId});
  const t0 = Date.now();
  while (!r.linked && r.pending && Date.now() - t0 < waitForPostbackMs) {   // brand new sign-up: wait for Affstore's registration postback
    await new Promise((ok) => setTimeout(ok, 5000)); r = await api('/api/account/link', {iqUserId});
  }
  return {...r, iqUserId, firstName, realBalance: REAL ? REAL.amount : 0, currency: REAL ? REAL.currency : 'USD'};
}
export const redeemInvite = (code) => api('/api/invite/redeem', {code});
export const me = () => api('/api/me');

/* ---------- 4. Balance and deposit detection ---------- */
// Fires instantly when the real balance goes up by more than a trade could explain. Rewards are still
// credited by the server only when the Affstore deposit postback confirms it.
export async function watchDeposits(onDeposit, {min = 10} = {}) {
  await connect(); if (!REAL) return () => {};
  let last = REAL.amount, tradingUntil = 0;
  window.addEventListener('zb:trade', () => { tradingUntil = Date.now() + 10 * 60e3 });
  const cb = (b) => { const up = b.amount - last; last = b.amount; if (up >= min && Date.now() > tradingUntil) onDeposit({amount: up, balance: b.amount, currency: b.currency}); };
  REAL.subscribeOnUpdate(cb); return () => { try { REAL.unsubscribeOnUpdate(cb) } catch {} };
}
export async function balance() { await connect(); return REAL ? {amount: REAL.availableForOptionsAmount ? REAL.availableForOptionsAmount() : REAL.amount, currency: REAL.currency} : null; }
// Live balance updates: cb({amount, currency})
export async function onBalance(cb) { await connect(); if (!REAL) return () => {}; const f = (b) => cb({amount: b.availableForOptionsAmount ? b.availableForOptionsAmount() : b.amount, currency: b.currency}); REAL.subscribeOnUpdate(f); return () => { try { REAL.unsubscribeOnUpdate(f) } catch {} }; }
export const isConnected = () => !!SDK;

/* ---------- 5. Place an approved trade ---------- */
// pair: 'EUR/USD', 'GBP/USD', 'BTC/USD', 'Gold'...  direction: 'buy'|'sell'  amount: number  minutes: 1..5
const norm = (s) => String(s).toUpperCase().replace('GOLD', 'XAUUSD').replace(/[^A-Z]/g, '');
export async function placeTrade({pair, direction, amount, minutes = 1, kind = 'turbo'}) {
  const sdk = await connect(); const m = await lib(); if (!REAL) throw new Error('no_real_balance');
  const want = norm(pair), at = sdk.currentTime();
  if (kind === 'digital' && minutes >= 1) {   // 30-second trades aren't digital: they go as a 30 s turbo option below
    // Digital options (Signal Room). OTC pairs are named like "EURUSD-OTC" -> normalised "EURUSDOTC".
    const dg = await sdk.digitalOptions();
    const list = dg.getUnderlyingsAvailableForTradingAt(at).filter((u) => norm(u.name) === want || norm(u.name).startsWith(want));
    list.sort((a, b) => (norm(a.name) === want ? 0 : 1) - (norm(b.name) === want ? 0 : 1));
    if (!list.length) throw new Error('market_closed');
    const insts = (await list[0].instruments()).getAvailableForBuyAt(at);
    const inst = insts.find((i) => Math.round(i.period / 60) === minutes) || insts.sort((a, b) => Math.abs(a.period / 60 - minutes) - Math.abs(b.period / 60 - minutes))[0];
    if (!inst) throw new Error('no_expiry_available');
    const dir = direction === 'buy' ? m.DigitalOptionsDirection.Call : m.DigitalOptionsDirection.Put;
    window.dispatchEvent(new Event('zb:trade'));
    const order = await dg.buySpotStrike(inst, dir, amount, REAL);
    return {id: order.id, orderId: order.id, kind: 'digital', ticker: list[0].name, expiresAt: new Date(inst.expiration).getTime(), minutes: Math.round(inst.period / 60), stake: amount};
  }
  const turbo = await sdk.turboOptions();
  // Prefer the regular market; fall back to OTC (weekends) if that's all that's open.
  const actives = turbo.getActives().filter((a) => a.canBeBoughtAt(at) && norm(a.ticker).startsWith(want));
  actives.sort((a, b) => (norm(a.ticker) === want ? 0 : 1) - (norm(b.ticker) === want ? 0 : 1));
  if (!actives.length) throw new Error('market_closed');
  const inst = (await actives[0].instruments()).getAvailableForBuyAt(at);
  const pickInst = minutes < 1 ? inst.find((i) => i.expirationSize === Math.round(minutes * 60)) : (inst.find((i) => Math.round(i.expirationSize / 60) === minutes) || inst.sort((a, b) => a.expirationSize - b.expirationSize)[0]);
  if (!pickInst) throw new Error('no_expiry_available');
  const dir = direction === 'buy' ? m.TurboOptionsDirection.Call : m.TurboOptionsDirection.Put;
  window.dispatchEvent(new Event('zb:trade'));
  const opt = await turbo.buy(pickInst, dir, amount, REAL);
  return {id: opt.id, kind: 'turbo', ticker: actives[0].ticker, expiresAt: new Date(opt.expiredAt).getTime(), minutes: pickInst.expirationSize / 60, payoutPct: opt.profitIncomePercent, openQuote: opt.openQuoteValue, stake: amount};
}
// Calls back once per closed trade: {id, win, profit, invest}
const CLOSED = new Set();
// One subscription to IQ Option positions; any number of listeners (Zara flow + Signal Room open trades).
const CLOSE_CBS = []; let closeSub = false;
export async function onTradeClosed(cb) {
  CLOSE_CBS.push(cb); if (closeSub) return; closeSub = true;
  const sdk = await connect(); const pos = await sdk.positions(); const seen = CLOSED;
  pos.subscribeOnUpdatePosition((p) => {
    if (p.status !== 'closed' || seen.has(p.externalId)) return; seen.add(p.externalId);   // digital positions carry orderIds[] = the order id returned by buy
    const profit = p.closeProfit !== undefined ? p.closeProfit - (p.invest || 0) : (p.pnlRealized || 0);
    const r = {id: p.externalId, orderIds: p.orderIds || [], win: profit > 0, profit, invest: p.invest, closeReason: p.closeReason};
    for (const f of CLOSE_CBS) { try { f(r); } catch (e) {} }
  });
}
// Close a running trade before expiry (digital/turbo/binary; not blitz). The result then arrives through onTradeClosed.
export async function closeTrade(id) {
  const sdk = await connect(); const pos = await sdk.positions();
  const p = pos.getOpenedPositions().find((x) => String(x.externalId) === String(id) || (x.orderIds || []).map(String).includes(String(id)));
  if (!p) throw new Error('trade_not_found');
  await p.sell(); return true;
}
// Live value of an open trade if closed now (for the "Close early" button)
export async function tradeValue(id) {
  const sdk = await connect(); const pos = await sdk.positions();
  const p = pos.getOpenedPositions().find((x) => String(x.externalId) === String(id) || (x.orderIds || []).map(String).includes(String(id)));
  return p ? {sellProfit: p.sellProfit, pnl: p.pnlNet, invest: p.invest} : null;
}
export async function disconnect() { try { SDK && await SDK.shutdown() } catch {} SDK = null; REAL = null; }
