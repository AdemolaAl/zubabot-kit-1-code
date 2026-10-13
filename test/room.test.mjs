import assert from 'node:assert/strict'; import {DatabaseSync} from 'node:sqlite'; import {createEngine} from '../server/strategy.js';
let T = Date.UTC(2026, 9, 12, 13, 31, 20); const clock = () => T; let seed = 3; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const E = createEngine({db: new DatabaseSync(':memory:'), env: {}, clock, random});
// defaults = Signal Room: OTC pairs, digital, AIs with their own expiry, entry on a full minute 40s+ ahead
let st = E.getStrategy(); assert.equal(st.kind, 'digital'); assert.ok(st.pairs.every((p) => p.s.endsWith('OTC'))); assert.equal(st.ais.length, 5);
E.setStrategy({mode: 'live', everySec: 60, pairs: [{s: 'EUR/USD OTC', on: true, src: 'manual', trend: 'up'}], ais: [{key: 'remi', on: true, expiry: 15}, {key: 'viza', on: false, expiry: 1}]});
await E.tick(); let sig = E.recent({})[0];
assert.equal(sig.ai, 'remi'); assert.equal(sig.expiry_min, 15); assert.equal(sig.kind, 'digital'); assert.equal(sig.entry, null);
assert.equal(sig.entry_at, Date.UTC(2026, 9, 12, 13, 32, 0), 'entry at next full minute after 40s lead');
assert.equal(sig.expires_at, sig.entry_at + 15 * 60e3);
const u = E.forUser('1'); assert.equal(u.signals[0].entry_at, sig.entry_at); assert.equal(u.ais[0].key, 'remi'); assert.equal(u.kind, 'digital'); assert.deepEqual(u.pairs, ['EUR/USD OTC']); assert.equal(u.martingale.steps, 3);
// a real trade can't settle it early or with a different expiry
T = sig.expires_at - 60e3; assert.equal(await E.resolveFromTrade(sig.id, 'loss', {pair: 'EUR/USD OTC', dir: sig.dir, expiryMin: 15}), null);
T = sig.expires_at + 1000; assert.equal(await E.resolveFromTrade(sig.id, 'loss', {pair: 'EUR/USD OTC', dir: sig.dir, expiryMin: 5}), null);
const r = await E.resolveFromTrade(sig.id, 'loss', {pair: 'EUR/USD OTC', dir: sig.dir, expiryMin: 15}); assert.equal(r.status, 'loss'); assert.equal(r.result_src, 'trade');
// martingale step 2 starts right when step 1 ended, same AI and expiry
const g2 = E.recent({}).find((x) => x.chain_id === sig.id && x.step === 2); assert.ok(g2); assert.ok(g2.entry_at >= sig.expires_at && g2.entry_at - sig.expires_at < 3000); assert.equal(g2.ai, 'remi'); assert.equal(g2.expiry_min, 15);
// results by AI
await E.resolveManual(g2.id, 'win'); const R = E.results({mode: 'live'}); assert.equal(R.ais[0].ai, 'remi'); assert.equal(R.chains.won, 1);
console.log('ROOM TESTS PASSED');
