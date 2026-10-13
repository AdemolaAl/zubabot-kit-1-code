// Live settings the team changes from the admin panel (no restart, no code). Stored in the database; .env values are
// only the starting defaults. Every change is written to the activity log with who made it.
const num = (v, d) => (v === undefined || v === '' || isNaN(+v) ? d : +v);
const list = (v, d) => (v ? String(v).split(',').map((x) => x.trim()).filter(Boolean) : d);

export function defaults(env = process.env) {
  return {
    lives: {on: true, mentor: env.LEAD_MENTOR || 'Roland', times: list(env.LIVE_TIMES, ['10:00', '15:00', '18:00', '22:00']), link: env.LIVE_URL || '', remindMin: num(env.LIVE_REMIND_MIN, 40), maxPerDay: 1, stopAfter: 3},
    followups: {on: (env.FOLLOWUPS || 'on') !== 'off', quiet: env.QUIET_HOURS || '22-8'},
    support: {name: env.SUPPORT_NAME || 'Emily', introOnTakeover: true, slaMin: num(env.HUMAN_SLA_MIN, 10), aiBackMin: num(env.HUMAN_AI_BACK_MIN, 30), idleBackH: num(env.HUMAN_IDLE_BACK_H, 12), askRating: true,
      humanWords: 'human,agent,real person,customer care,customer service,talk to someone,speak to someone,manager'},
    ai: {
      // provider per area. anthropic = Claude. The others use the same "OpenAI-style" API: openai, deepseek, groq, openrouter, gemini
      support: {provider: env.AI_PROVIDER || 'anthropic', model: env.AI_MODEL || 'claude-haiku-5-5'},
      traders: {provider: env.AI_PROVIDER || 'anthropic', model: env.AI_MODEL || 'claude-haiku-5-5'},
      funded: {provider: env.AI_PROVIDER || 'anthropic', model: env.AI_MODEL_PRO || env.AI_MODEL || 'claude-haiku-5-5'},   // $100+ users
      voice: {provider: env.AI_PROVIDER || 'anthropic', model: env.AI_MODEL_VOICE || env.AI_MODEL || 'claude-haiku-5-5'},
      translate: {provider: env.AI_PROVIDER || 'anthropic', model: env.AI_MODEL_TRANSLATE || 'claude-sonnet-5-5'},       // app + bot translations, local AI traders
      followups: {provider: env.AI_PROVIDER || 'anthropic', model: env.AI_MODEL || 'claude-haiku-5-5'},
      backup: {provider: env.AI_BACKUP_PROVIDER || '', model: env.AI_BACKUP_MODEL || ''},
      capFree: num(env.AI_DAILY_FREE, 40), capPaid: num(env.AI_DAILY_PAID, 300), capTg: num(env.AI_DAILY_TG, 60),
      budgetUsd: num(env.AI_DAILY_BUDGET_USD, 25),
      // estimated $ per 1M tokens (input/output). Edit to match your provider's bill.
      prices: {'claude-haiku-5-5': [0.1, 0.5], 'claude-sonnet-5-5': [2, 10], 'gpt-4o-mini': [0.15, 0.6], 'deepseek-chat': [0.27, 1.1], 'gemini-2.5-flash': [0.3, 2.5]},
    },
    voice: {
      on: (env.VOICE || 'on') !== 'off',
      stt: list(env.VOICE_STT, ['self', 'openai', 'deepgram']),                // tried in this order
      standard: list(env.VOICE_TTS_STANDARD, ['self', 'openai']),            // standard voice (1 token / min): our own voice server first
      premium: list(env.VOICE_TTS_PREMIUM, ['elevenlabs', 'self']),          // premium voice (4 tokens / min, Pro $1,000+)
      premiumFrom: num(env.VOICE_PREMIUM_FROM, 1000), voiceFrom: num(env.VOICE_FROM, 100),
      perMinStd: 1, perMinPremium: 4, maxCalls: num(env.VOICE_MAX_CALLS, 60), maxTurnSec: 30, maxCallMin: 30,
      // daily call minutes per person (tokens are still charged). Premium minutes run out first, then the call carries on in the standard voice.
      dayMin: num(env.VOICE_DAY_MIN, 60), dayMinMax: num(env.VOICE_DAY_MIN_MAX, 120), maxFrom: 2000, premiumDayMin: num(env.VOICE_PREMIUM_DAY_MIN, 20),
      // voice per AI trader for each provider. 'default' is used when an AI has no own voice.
      voices: {default: {self: 'af_heart', openai: 'coral', elevenlabs: env.ELEVEN_VOICE_DEFAULT || 'EXAVITQu4vr4xnSDxMaL'},
        male: {self: 'am_michael', openai: 'ash', elevenlabs: env.ELEVEN_VOICE_MALE || 'TX3LPaxmHKxFdv7VOQHJ'}, perAI: {}},
      speed: 1.05,
      prices: {self: 0, openaiStt: 0.003, deepgram: 0.0043, elevenlabsSttMin: 0.0067, openaiTts: 15, elevenlabs: 100, google: 16},   // $ per minute (STT) or per 1M characters (TTS); estimates
    },
    sales: {on: (env.SALES || 'on') !== 'off', maxPerDay: num(env.SALES_MAX_PER_DAY, 2),
      streak: {on: true, at: [3, 5], gapH: 12}, bigday: {on: true, pct: 30}, near: {on: true, pct: 30, gapDays: 5}, idle: {on: true, days: 2, gapDays: 3}, tease: {on: true, gapDays: 4},
      care: {on: true, lossUsd: 25, lossPct: 25, inRow: 3, waitMin: 25, gapDays: 3}, chance: {on: true, gapDays: 2}, maxPerWeek: 5, backoffAfter: 3},
    // the Telegram bot funnel (Admin -> Settings -> Telegram funnel). {name} = first name.
    funnel: {
      description: '👋 Welcome to Zubabot!\n\nTap START below to activate your 3 months free 👇',
      short: 'Your AI trader for IQ Option. Tap START to activate your 3 months free.',
      welcome: ['Congrats {name}! 🎉 Your 3 months free is activated.', 'Any question? Just type it right here 👇 our support team replies 24/7.'],
      cta: 'Now launch your AI on our app 🚀\n\nYou’ll fund your own IQ Option trading account to connect the AI (the money stays yours). Training and everything is right inside the app.\n\nYou can be talking to your AI and trading live in the next 5 minutes ⏱',
      button: '🚀 Launch my AI now',
      nudgeOn: true, aiNudges: true, nudgeEveryMin: 60, nudgeHours: '8-22', deleteOld: true, slowAfter: 12,
    },
    // saved bot flows (templates). The active one runs after START; split sends a % of new people to a second flow to test it.
    // button actions: app | fund (value = amount) | live | academy | invite | signal | support | human | url (value = link)
    flows: {active: 'main', split: {to: '', pct: 0}, list: {
      main: {name: 'Main: congrats → questions → launch', supportReply: 'Sure 🙌 just type your question here and our team will answer you right away.', steps: [
        {text: 'Congrats {name}! 🎉 Your 3 months free is activated.', buttons: []},
        {text: 'Any question? Just type it right here 👇 our support team replies 24/7.', buttons: []},
        {text: 'Now launch your AI on our app 🚀\n\nYou’ll fund your own IQ Option trading account to connect the AI (the money stays yours). Training and everything is right inside the app.\n\nYou can be talking to your AI and trading live in the next 5 minutes ⏱', buttons: [{label: '🚀 Launch my AI now', action: 'app'}, {label: '💬 Ask support a question', action: 'support'}]}]},
      short: {name: 'Short: one message, two buttons', supportReply: 'Sure 🙌 type your question here, we reply right away.', steps: [
        {text: 'Congrats {name}! 🎉 Your 3 months free is activated.\n\nLaunch your AI now: fund your own IQ Option account to connect it, and you’ll be trading live with your AI in 5 minutes.', buttons: [{label: '🚀 Launch my AI now', action: 'app'}, {label: '💬 I have a question', action: 'support'}]}]},
      trust: {name: 'Trust first: proof picture → launch', supportReply: 'Sure 🙌 ask me anything, a teammate is on standby too.', steps: [
        {text: 'Congrats {name}! 🎉 Your 3 months free is activated.', buttons: []},
        {text: 'Zubabot runs on IQ Option, one of the biggest trading apps in the world (100M+ downloads). Your money stays in your own account.', image: 'iqoption', buttons: []},
        {text: 'Ready? Launch your AI and trade live with it in the next 5 minutes ⏱', buttons: [{label: '🚀 Launch my AI now', action: 'app'}, {label: '🔴 Watch Roland live first', action: 'live'}, {label: '💬 Ask support', action: 'support'}]}]},
      // for join-request funnels: they just tapped "Request to join" on the channel, the bot accepted them
      join: {name: 'Join channel: accepted → launch', supportReply: 'Sure 🙌 type your question here, we reply right away.', steps: [
        {text: 'Welcome {name}! ✅ You’re in. Your request was accepted.', buttons: []},
        {text: 'Your AI trader is ready and your 3 months free is activated 🎉\n\nLaunch it now: fund your own IQ Option account to connect it, and you’ll be trading live with your AI in 5 minutes ⏱', buttons: [{label: '🚀 Launch my AI now', action: 'app'}, {label: '💬 I have a question', action: 'support'}]}]},
    }},
    // languages: AI translations, and what the team sees. Lives are run in English, so other languages don't get live invites unless switched on here.
    i18n: {translateHuman: true, teamEnglish: true, support: {pt: 'Bia', es: 'Sofía', tl: 'Joy', fr: 'Aïcha', th: 'Mint'}},      // support assistant's name in each language
    // each language has its own lead mentor (Roland is English only). Their lives switch on when there's a live link and "on" is set (Admin -> Languages).
    // times are in the region's own time zone: offset = hours from UTC, tz = the label people there know.
    mentors: {
      pt: {name: 'Rafael', role: 'Lead mentor', bio: 'Leads the daily lives for Brazil. Trades the market live with the community and explains every move.', photo: 'mentors/lead-pt.jpg', times: ['12:00', '20:00'], tz: 'BRT', offset: -3, link: '', on: false},
      es: {name: 'Mateo', role: 'Lead mentor', bio: 'Leads the daily lives for Latin America. Trades the market live with the community and explains every move.', photo: 'mentors/lead-es.jpg', times: ['12:00', '20:00'], tz: 'CDMX', offset: -6, link: '', on: false},
      tl: {name: 'Paolo', role: 'Lead mentor', bio: 'Leads the daily lives for the Philippines. Trades the market live with the community and explains every move.', photo: 'mentors/lead-tl.jpg', times: ['12:00', '20:00'], tz: 'PHT', offset: 8, link: '', on: false},
      fr: {name: 'Arnaud', role: 'Lead mentor', bio: 'Leads the daily lives in French. Trades the market live with the community and explains every move.', photo: 'mentors/lead-fr.jpg', times: ['12:00', '20:00'], tz: 'WAT', offset: 1, link: '', on: false},
      th: {name: 'Krit', role: 'Lead mentor', bio: 'Leads the daily lives for Thailand. Trades the market live with the community and explains every move.', photo: 'mentors/lead-th.jpg', times: ['12:00', '20:00'], tz: 'ICT', offset: 7, link: '', on: false},
    },
    // charts + voice notes in AI trader chats: charts for MAX, voice notes for Pro (10 a day) and MAX
    media: {chartsFrom: num(env.CHARTS_FROM, 2000), chartsPerDay: 30, chartUnlockCoins: num(env.CHART_UNLOCK_COINS, 1500), chartsPerDayUnlocked: 10, voiceFrom: num(env.VOICE_NOTES_FROM, 1000), voicePerDayPro: 10, voicePerDayMax: 30, maxFrom: 2000, voiceReplyMax: true},
    // free period: first 3 months, then quietly +6 months, then +6 more each time while they're active (opened the app in the last activeDays)
    free: {on: true, firstDays: 90, extendDays: 180, activeDays: 30},
    // security: allowed affiliate IDs (owner only), our own @usernames / domains / wallets, and the Telegram group that gets security alerts
    security: {on: true, block: true, affIds: [env.AFF_ID || '743768'].filter(Boolean), handles: [], domains: [], wallets: [], groupId: env.SECURITY_CHAT_ID || '', removeInChannels: false},
    alerts: {bigDeposit: num(env.ALERT_BIG_DEPOSIT, 200), spendWarnPct: 80},
  };
}
const merge = (a, b) => { if (Array.isArray(b) || typeof b !== 'object' || b === null) return b === undefined ? a : b; const o = {...(a || {})}; for (const k of Object.keys(b)) o[k] = merge(o[k], b[k]); return o; };

export function makeSettings({db, q, now}) {
  db.exec('CREATE TABLE IF NOT EXISTS app_settings(k TEXT PRIMARY KEY, v TEXT, updated_at INTEGER, by TEXT)');
  let cache = null;
  function all() {
    if (cache) return cache;
    let s = defaults();
    for (const r of q('SELECT k,v FROM app_settings').all()) { try { const v = JSON.parse(r.v); s[r.k] = r.k === 'flows' ? {...s.flows, ...v, list: v.list || s.flows.list} : merge(s[r.k], v); } catch (e) {} }   // saved flows replace the built-in list
    return (cache = s);
  }
  const get = (k) => all()[k];
  function set(k, v, by = 'system') {
    if (!(k in defaults())) throw Object.assign(new Error('unknown_setting'), {status: 400});
    const next = merge(get(k), v);
    q('INSERT INTO app_settings(k,v,updated_at,by) VALUES(?,?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at, by=excluded.by').run(k, JSON.stringify(next), now(), by);
    cache = null; return get(k);
  }
  // overwrite a whole setting (needed to delete an item from a list)
  function replace(k, v, by = 'system') { q('INSERT INTO app_settings(k,v,updated_at,by) VALUES(?,?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at, by=excluded.by').run(k, JSON.stringify(v), now(), by); cache = null; return get(k); }
  function reset(k) { q('DELETE FROM app_settings WHERE k=?').run(k); cache = null; return get(k); }
  // times "HH:MM" -> minutes after midnight WAT
  const liveMins = () => (get('lives').times || []).map((t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); }).filter((x) => x >= 0 && x < 1440).sort((a, b) => a - b);
  return {all, get, set, reset, replace, liveMins};
}
export const fmtTime = (mins) => { const h = Math.floor(mins / 60), m = mins % 60; return (h % 12 || 12) + (m ? ':' + String(m).padStart(2, '0') : '') + (h >= 12 ? 'pm' : 'am'); };
