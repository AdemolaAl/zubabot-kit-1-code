// Writes web/i18n/<lang>.js from the shipped translations (server/i18n/*.json), so the mini app has every language
// before the server ever runs. The server rewrites these files itself whenever a translation is added or edited.
//   node tools/build-i18n.mjs
import {DatabaseSync} from 'node:sqlite';
import {makeSettings} from '../server/settings.js';
import {makeI18n} from '../server/i18n.js';
const db = new DatabaseSync(':memory:'); const q = (s) => db.prepare(s); const now = () => Date.now();
const settings = makeSettings({db, q, now});
const I = makeI18n({db, q, now, engine: null, settings});
await I.writeAll();
await new Promise((r) => setTimeout(r, 300));
console.log('written');
