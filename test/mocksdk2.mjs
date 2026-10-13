// Stand-in for @quadcode-tech/client-sdk-js with the same method names the app uses.
const M = window.__mock = window.__mock || {log: [], results: [], balance: 100, closeAfterMs: 1500, fail: null};
export const BalanceType = {Real: 'real', Demo: 'demo'}; export const TurboOptionsDirection = {Call: 'call', Put: 'put'}; export const DigitalOptionsDirection = {Call: 'call', Put: 'put'};
const balSubs = [], posSubs = [];
const bal = {id: 9, type: 'real', get amount() { return M.balance }, currency: 'USD', availableForOptionsAmount() { return M.balance }, subscribeOnUpdate(cb) { balSubs.push(cb) }, unsubscribeOnUpdate() {}};
M.setBalance = (v) => { M.balance = v; balSubs.forEach((f) => f(bal)); };
const inst = (s) => ({activeId: 1, expirationSize: s, expiredAt: new Date(Date.now() + M.closeAfterMs), profitPercent: () => 85});
let OID = 5000; const OPEN = new Map();
export class OAuthMethod { constructor(o) { M.log.push(['oauth', o.clientId, o.scope, !!o.tokensStorage, o.tokensStorage && o.tokensStorage.get().accessToken]) } }
export class ClientSdk {
  static async create(ws, pid) { M.log.push(['create', ws, pid]); return new ClientSdk(); }
  constructor() { this.userProfile = {userId: M.userId || 196640999, firstName: 'Tobi'} }
  currentTime() { return new Date() } async wsConnectionState() { return {subscribeOnStateChanged() {}} }
  async balances() { return {getBalances: () => [{type: 'demo', amount: 10000}, bal]} }
  async turboOptions() { return {getActives: () => ['EURUSD', 'GBPUSD', 'BTCUSD'].map((t) => ({ticker: t, canBeBoughtAt: () => true, instruments: async () => ({getAvailableForBuyAt: () => [inst(30), inst(60), inst(120)]})})),
    buy: async (i, d, price, b) => { if (M.fail) { const e = M.fail; M.fail = null; throw new Error(e); } if (price > M.balance) throw new Error('insufficient balance');
      const id = ++OID; M.log.push(['buy', d, price, b.id]); M.setBalance(+(M.balance - price).toFixed(2));
      const res = M.results.length ? M.results.shift() : 'win';
      setTimeout(() => { const profit = res === 'win' ? +(price * 1.85).toFixed(2) : 0; if (profit) M.setBalance(+(M.balance + profit).toFixed(2)); posSubs.forEach((f) => f({status: 'closed', externalId: id, closeProfit: profit, invest: price})); }, M.closeAfterMs + 200);
      return {id, expiredAt: i.expiredAt, profitIncomePercent: 85, openQuoteValue: 1.0871}; }} }
  async digitalOptions() { const mk = (name) => ({activeId: 7, name, instruments: async () => ({getAvailableForBuyAt: () => [60, 300, 900].map((sec) => ({period: sec, expiration: new Date(Date.now() + M.closeAfterMs)}))})});
    return {getUnderlyingsAvailableForTradingAt: () => ['EURUSD', 'EURUSD-OTC', 'GBPUSD-OTC', 'USDJPY-OTC', 'AUDCAD-OTC'].map(mk),
      buySpotStrike: async (inst, d, amount, b) => { if (amount > M.balance) throw new Error('insufficient balance'); const id = ++OID; M.log.push(['digital', d, amount, inst.period, b.id]); M.setBalance(+(M.balance - amount).toFixed(2));
        const res = M.results.length ? M.results.shift() : 'win'; const posId = 90000 + id;
        const close = (profit) => { if (!OPEN.has(posId)) return; OPEN.delete(posId); if (profit) M.setBalance(+(M.balance + profit).toFixed(2)); posSubs.forEach((f) => f({status: 'closed', externalId: posId, orderIds: [id], closeProfit: profit, invest: amount})); };
        OPEN.set(posId, {externalId: posId, orderIds: [id], invest: amount, sellProfit: +(amount * 1.3).toFixed(2), sell: async () => { M.log.push(['sell', posId]); close(+(amount * 1.3).toFixed(2)); }});
        setTimeout(() => close(res === 'win' ? +(amount * 1.82).toFixed(2) : 0), M.closeAfterMs + 200);
        return {id}; }}; }
  async positions() { return {subscribeOnUpdatePosition: (cb) => posSubs.push(cb), getOpenedPositions: () => [...OPEN.values()]} }
  async shutdown() {}
}
