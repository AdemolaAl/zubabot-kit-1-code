import http from 'node:http'; import assert from 'node:assert/strict'; import {DatabaseSync} from 'node:sqlite';
import {createEngine} from '../server/strategy.js';
// fake Binance: rising candles, controllable live price
let live = 100, calls = 0;
const srv = http.createServer((req, res) => { calls++; res.setHeader('Content-Type', 'application/json');
  if (req.url.startsWith('/api/v3/klines')) return res.end(JSON.stringify(Array.from({length: 80}, (_, i) => [0, 0, 0, 0, String(90 + i * 0.125)])));
  if (req.url.startsWith('/api/v3/ticker/price')) return res.end(JSON.stringify({price: String(live)}));
  res.statusCode = 404; res.end('{}'); }).listen(9931);
let T = 1_700_000_000_000; const clock = () => T;
let seed = 7; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const db = new DatabaseSync(':memory:');
const E = createEngine({db, env: {BINANCE_BASE: 'http://127.0.0.1:9931'}, clock, random});
// 1) settings validation
let st = E.setStrategy({mode: 'test', leadSec: 0, alignMinute: false, ais: [{key: 'viza', on: true, expiry: 1, strategy: 'trend', pairs: ['BTC/USD']}, {key: 'luna', on: true, expiry: 1, strategy: 'trend', pairs: ['EUR/USD']}], everySec: 5, trendBias: 2, testers: '1001, 1002', pairs: [{s: 'btc/usd', on: true, src: 'binance', trend: 'auto'}, {s: 'EUR/USD', on: true, src: 'manual', trend: 'down'}], martingale: {steps: 3, mult: 2}});
assert.equal(st.trendBias, 1); assert.equal(st.everySec, 30); assert.deepEqual(st.testers, ['1001', '1002']); assert.equal(st.pairs[0].s, 'BTC/USD');
// 2) trend detection from candles
const tr = await E._trendOf(st.pairs[0], st); assert.equal(tr.trend, 'up'); assert.ok(tr.strength > 0.2);
// 3) with bias 1 and uptrend every BTC signal is BUY; manual 'down' pair -> SELL
E.setStrategy({trendBias: 1});
await E.tick(); let open = E.recent({mode: 'test'}); assert.equal(open.length, 2);
const btc = open.find((s) => s.pair === 'BTC/USD'), eur = open.find((s) => s.pair === 'EUR/USD');
assert.equal(btc.dir, 'buy'); assert.equal(eur.dir, 'sell'); assert.equal(btc.entry, 99.875); assert.equal(eur.entry, null); assert.ok(btc.conf >= 72 && btc.conf <= 92);
// no duplicate while open
await E.tick(); assert.equal(E.recent({mode: 'test'}).length, 2);
// 4) testers see it, others don't; live mode shows to all
assert.equal(E.forUser('1001').signals.length, 2); assert.equal(E.forUser('5555').signals.length, 0);
// 5) expiry: price fell -> BTC buy loses -> martingale step 2 opens at 2x stake
live = 99; T += 61e3; await E.tick();
let all = E.recent({mode: 'test'}); const lost = all.find((s) => s.id === btc.id); assert.equal(lost.status, 'loss');
const step2 = all.find((s) => s.chain_id === btc.id && s.step === 2); assert.ok(step2); assert.equal(step2.stake, 2); assert.equal(step2.dir, 'buy');
// step 2 wins (price up) -> chain recovered
live = 101; T += 61e3; await E.tick();
assert.equal(E.recent({mode: 'test'}).find((s) => s.id === step2.id).status, 'win');
// manual pair: unresolved by price -> admin marks it
await assert.rejects(E.resolveManual(eur.id, 'maybe'));
const m = await E.resolveManual(eur.id, 'win'); assert.equal(m.status, 'win');
// 6) results board
const R = E.results({mode: 'test'});
assert.equal(R.chains.won, 2); assert.equal(R.chains.wonAtStep['2'], 1); assert.ok(R.wins >= 2);
// P/L: btc chain = -1 + 2*0.85 = +0.7 ; eur = +0.85 => 1.55 (other new signals still open)
assert.equal(R.simulated.pl, 1.55); assert.equal(R.simulated.maxDrawdown, 1);
// 7) full martingale loss: 3 steps lose -> chain lost
E.setStrategy({pairs: [{s: 'BTC/USD', on: true, src: 'binance', trend: 'auto'}], ais: [{key: 'viza', on: true, expiry: 1, strategy: 'trend', pairs: ['BTC/USD']}]}); E.resetTest();
T += 600e3; live = 99.875; await E.tick(); let c0 = E.recent({mode: 'test'})[0];
for (let k = 0; k < 3; k++) { live = 89 - k * 10; T += 61e3; await E.tick(); }
const R2 = E.results({mode: 'test'}); assert.equal(R2.chains.lost, 1); assert.equal(R2.simulated.pl, -(1 + 2 + 4)); assert.equal(R2.chains.worstLosingStreak, 1);
assert.equal(E.recent({mode: 'test'}).filter((s) => s.chain_id === c0.id).length, 3, 'stops after 3 steps');
// 8) off mode: nothing new
E.setStrategy({mode: 'off'}); E.resetTest(); T += 600e3; await E.tick(); assert.equal(E.recent({}).length, 0);
// 9) live mode visible to everyone
E.setStrategy({mode: 'live'}); T += 600e3; await E.tick(); assert.equal(E.forUser('5555').signals.length, 1); assert.equal(E.forUser('5555').signals[0].mode, 'live');
// 10) per-AI strategies: random (for testing), own pairs only, custom (reversal bias, active hours)
const ethP = {s: 'ETH/USD', on: false, src: 'binance', trend: 'auto'};
E.setStrategy({mode: 'test', maxOpenPerPair: 5, pairs: [{s: 'BTC/USD', on: true, src: 'binance', trend: 'auto'}, {s: 'EUR/USD', on: true, src: 'manual', trend: 'up'}, ethP],
  ais: [{key: 'rand', on: true, expiry: 1, strategy: 'random', everySec: 30}, {key: 'own', on: true, expiry: 5, strategy: 'trend', pairs: ['ETH/USD', 'NOPE'], everySec: 30}, {key: 'rev', on: true, expiry: 1, strategy: 'custom', pairs: ['BTC/USD'], everySec: 30, custom: {bias: 0, emaFast: 5, emaSlow: 20, minPct: 0.01}}]});
st = E.getStrategy(); assert.deepEqual(st.ais[1].pairs, ['ETH/USD'], 'unknown pairs dropped'); assert.equal(st.ais[0].strategy, 'random');
E.resetTest(); const dirs = {buy: 0, sell: 0};
for (let k = 0; k < 40; k++) { T += 40e3; await E.tick(); }
const sig = E.recent({mode: 'test', limit: 500}).filter((x) => x.step === 1);
const by = (k) => sig.filter((x) => x.ai === k);
assert.ok(by('own').length > 5 && by('own').every((x) => x.pair === 'ETH/USD'), 'own pairs only, even when the pair is off for the others');
assert.ok(by('rev').length > 5 && by('rev').every((x) => x.pair === 'BTC/USD' && x.dir === 'sell'), 'custom bias 0 = against the uptrend');
for (const x of by('rand')) dirs[x.dir]++; assert.ok(dirs.buy > 3 && dirs.sell > 3, 'random mixes buy and sell'); assert.ok(by('rand').every((x) => ['BTC/USD', 'EUR/USD'].includes(x.pair) && x.note === 'random'));
assert.ok(by('own').every((x) => x.expiry_min === 5));
// active hours: outside them, a custom AI stays quiet
const hNow = new Date(T + 3600e3).getUTCHours(); E.setStrategy({ais: [{key: 'rev', on: true, strategy: 'custom', pairs: ['BTC/USD'], everySec: 30, custom: {bias: 0, hours: `${(hNow + 2) % 24}-${(hNow + 4) % 24}`}}]});
E.resetTest(); for (let k = 0; k < 5; k++) { T += 40e3; await E.tick(); } assert.equal(E.recent({mode: 'test'}).filter((x) => x.step === 1).length, 0);
// 11) every other AI in the app is active too (default strategy, pairs by market); external AIs only post via webhook/admin
const E2 = createEngine({db: new DatabaseSync(':memory:'), env: {}, clock, random, allAis: () => [{key: 'cryx', market: 'crypto'}, {key: 'fxa', market: 'forex'}, {key: 'mine'}]});
E2.setStrategy({mode: 'test', maxOpenPerPair: 1, pairs: [{s: 'BTC/USD', on: true, src: 'manual', trend: 'flat'}, {s: 'EUR/USD OTC', on: true, src: 'manual', trend: 'flat'}],
  ais: [{key: 'mine', on: true, strategy: 'random', source: 'external'}], others: {on: true, strategy: 'random', everySec: 60}});
for (let k = 0; k < 12; k++) { T += 61e3; await E2.tick(); }
const s2 = E2.recent({mode: 'test', limit: 200});
assert.ok(s2.some((x) => x.ai === 'cryx') && s2.filter((x) => x.ai === 'cryx').every((x) => x.pair === 'BTC/USD'), 'crypto AI on crypto pairs');
assert.ok(s2.some((x) => x.ai === 'fxa') && s2.filter((x) => x.ai === 'fxa').every((x) => x.pair === 'EUR/USD OTC'), 'forex AI on forex pairs');
assert.ok(!s2.some((x) => x.ai === 'mine'), 'external AI: the engine never posts for it');
// 12) real-data rule families (momentum / reversal / breakout), 'auto' from the AI's style, "find me a trade" on demand
let shape = 'up';
const kl = () => Array.from({length: 60}, (_, i) => { const base = shape === 'up' ? 100 + i * 0.015 + Math.sin(i * 1.7) * 0.05 : shape === 'spike' ? (i < 59 ? 100 + Math.sin(i) * 0.05 : 101) : 100 - i * 0.2;
  return [0, 0, base + 0.02, base - 0.02, base]; });
const fakeFetch = async (url) => ({ok: true, json: async () => url.includes('klines') ? kl() : {price: '100'}});
const E3 = createEngine({db: new DatabaseSync(':memory:'), env: {}, clock, random, fetchFn: fakeFetch, allAis: () => [{key: 'rv', style: 'Reversal', desc: 'Fades overstretched moves using RSI.'}, {key: 'bo', style: 'Breakouts', desc: 'Waits for the range to break.'}, {key: 'mo', style: 'Trend rider', desc: 'Rides strong trends.'}]});
E3.setStrategy({mode: 'live', maxOpenPerPair: 3, pairs: [{s: 'BTC/USD', on: true, src: 'binance', trend: 'auto'}], ais: [], others: {on: true, strategy: 'auto', everySec: 60}});
let f = await E3.find('mo'); assert.equal(f.signal.dir, 'buy'); assert.equal(f.signal.trend, 'momentum'); assert.match(f.signal.note, /trend is up/);
f = await E3.find('mo'); assert.equal(f.existing, true, 'returns the open one instead of a new one');
T += 60e3; shape = 'down'; f = await E3.find('rv'); assert.equal(f.signal.dir, 'buy', 'RSI very low -> snap back up'); assert.equal(f.signal.trend, 'reversal');
T += 60e3; shape = 'spike'; f = await E3.find('bo'); assert.equal(f.signal.dir, 'buy'); assert.match(f.signal.note, /broke above/);
shape = 'up'; const E4 = createEngine({db: new DatabaseSync(':memory:'), env: {}, clock, random, fetchFn: fakeFetch, allAis: () => [{key: 'rv', style: 'Reversal'}]});
E4.setStrategy({mode: 'live', fallbackRandom: false, pairs: [{s: 'EUR/USD OTC', on: true, src: 'manual', trend: 'flat'}], ais: [], others: {on: true, strategy: 'auto'}});
assert.equal((await E4.find('rv')).none, 'no_setup', 'OTC without price data and no fallback: honest "nothing yet"');
E4.setStrategy({fallbackRandom: true}); assert.equal((await E4.find('rv')).signal.note, 'random', 'fallback keeps the AI active');
console.log('STRATEGY TESTS PASSED', {priceCalls: calls}); srv.close();
