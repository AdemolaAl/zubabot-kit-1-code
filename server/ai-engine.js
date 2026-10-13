// AI engine: which AI company and model answers each area (support, AI traders, funded users, voice calls, follow-ups),
// a backup company if the first one fails, the daily budget, and spend tracking. Changed live from Admin -> AI engine.
// Claude uses Anthropic's API. OpenAI, DeepSeek, Groq, OpenRouter and Gemini all use the same "OpenAI-style" API.
export const PROVIDERS = {
  anthropic: {n: 'Claude (Anthropic)', key: 'ANTHROPIC_API_KEY', url: () => (process.env.ANTHROPIC_BASE || 'https://api.anthropic.com').replace(/\/$/, '') + '/v1/messages', models: ['claude-haiku-5-5', 'claude-sonnet-5-5']},
  openai: {n: 'OpenAI', key: 'OPENAI_API_KEY', url: () => 'https://api.openai.com/v1/chat/completions', models: ['gpt-4o-mini', 'gpt-4.1-mini']},
  deepseek: {n: 'DeepSeek', key: 'DEEPSEEK_API_KEY', url: () => 'https://api.deepseek.com/v1/chat/completions', models: ['deepseek-chat']},
  groq: {n: 'Groq', key: 'GROQ_API_KEY', url: () => 'https://api.groq.com/openai/v1/chat/completions', models: ['llama-3.3-70b-versatile']},
  openrouter: {n: 'OpenRouter', key: 'OPENROUTER_API_KEY', url: () => 'https://openrouter.ai/api/v1/chat/completions', models: ['anthropic/claude-haiku-5-5', 'openai/gpt-4o-mini']},
  // our own AI server (vLLM, Ollama, LM Studio, llama.cpp: anything with an OpenAI-style /v1/chat/completions)
  self: {n: 'Our own AI server', key: 'SELF_AI_URL', url: () => String(process.env.SELF_AI_URL || '').replace(/\/$/, '').replace(/\/v1$/, '') + '/v1/chat/completions', models: [process.env.SELF_AI_MODEL || 'qwen3-32b']},
  gemini: {n: 'Google Gemini', key: 'GEMINI_API_KEY', url: () => 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', models: ['gemini-2.5-flash']},
};
const hasKey = (p) => !!(PROVIDERS[p] && process.env[PROVIDERS[p].key]);

export function makeEngine({db, q, now, settings, team}) {
  db.exec(`CREATE TABLE IF NOT EXISTS ai_spend(day TEXT, area TEXT, provider TEXT, model TEXT, calls INTEGER DEFAULT 0, fails INTEGER DEFAULT 0, tin INTEGER DEFAULT 0, tout INTEGER DEFAULT 0, usd REAL DEFAULT 0, PRIMARY KEY(day, area, provider, model));`);
  const day = () => new Date(now() + 3600e3).toISOString().slice(0, 10);           // WAT day
  const price = (model) => { const p = (settings.get('ai').prices || {})[model]; return Array.isArray(p) ? p : [1, 5]; };
  function record(area, provider, model, tin, tout, ok) {
    const [pi, po] = price(model); const usd = (tin * pi + tout * po) / 1e6;
    q(`INSERT INTO ai_spend(day,area,provider,model,calls,fails,tin,tout,usd) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(day,area,provider,model) DO UPDATE SET
      calls=calls+excluded.calls, fails=fails+excluded.fails, tin=tin+excluded.tin, tout=tout+excluded.tout, usd=usd+excluded.usd`).run(day(), area, provider, model, ok ? 1 : 0, ok ? 0 : 1, tin, tout, usd);
  }
  // voice.js adds its own spend here too (area 'voice-stt' / 'voice-tts')
  const addSpend = (area, provider, model, usd, units = 0) => q(`INSERT INTO ai_spend(day,area,provider,model,calls,tin,usd) VALUES(?,?,?,?,1,?,?) ON CONFLICT(day,area,provider,model) DO UPDATE SET calls=calls+1, tin=tin+excluded.tin, usd=usd+excluded.usd`).run(day(), area, provider, model, Math.round(units), usd);
  const spentToday = () => q('SELECT COALESCE(SUM(usd),0) s FROM ai_spend WHERE day=?').get(day()).s;
  const overBudget = () => { const b = +settings.get('ai').budgetUsd || 0; return b > 0 && spentToday() >= b; };
  function checkBudget() {
    const b = +settings.get('ai').budgetUsd || 0; if (!b || !team) return; const s = spentToday(), pct = settings.get('alerts').spendWarnPct || 80;
    if (s >= b) team.alert('ai_spend', `🛑 AI + voice spend today is $${s.toFixed(2)}, the daily budget of $${b} is used up. Chats now use the built-in answers and hand hard cases to the team. Raise the budget in Admin -> AI engine.`, {key: 'over' + day(), every: 864e5});
    else if (s >= b * pct / 100) team.alert('ai_spend', `⚠️ AI + voice spend today is $${s.toFixed(2)} (${Math.round(s / b * 100)}% of the $${b} daily budget).`, {key: 'warn' + day(), every: 864e5});
  }

  async function one(provider, model, system, messages, maxTokens) {
    const P = PROVIDERS[provider]; if (!P) throw new Error('unknown_provider ' + provider);
    const key = provider === 'self' ? (process.env.SELF_AI_KEY || 'none') : process.env[P.key]; if (!key || (provider === 'self' && !process.env.SELF_AI_URL)) throw new Error('no_key ' + provider);
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), +(process.env.AI_TIMEOUT_MS || 25000));
    try {
      if (provider === 'anthropic') {
        const r = await fetch(P.url(), {method: 'POST', signal: ctl.signal, headers: {'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01'},
          body: JSON.stringify({model, max_tokens: maxTokens, temperature: 0.8, system, messages})});
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw Object.assign(new Error('ai_failed ' + provider + ' ' + r.status), {status: 502, detail: d && d.error});
        const u = d.usage || {};
        return {text: (d.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('\n'), tin: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1, tout: u.output_tokens || 0};
      }
      // OpenAI-style: one system string, images as data URLs
      const sys = (Array.isArray(system) ? system.map((s) => s.text).join('\n\n') : String(system || ''));
      const msgs = [{role: 'system', content: sys}, ...messages.map((m) => ({role: m.role, content: typeof m.content === 'string' ? m.content
        : m.content.map((c) => c.type === 'image' ? {type: 'image_url', image_url: {url: `data:${c.source.media_type};base64,${c.source.data}`}} : {type: 'text', text: c.text})}))];
      const headers = {'content-type': 'application/json', authorization: 'Bearer ' + key};
      if (provider === 'openrouter') { headers['HTTP-Referer'] = process.env.PUBLIC_URL || 'https://zubabot.com'; headers['X-Title'] = 'Zubabot'; }
      const r = await fetch(P.url(), {method: 'POST', signal: ctl.signal, headers, body: JSON.stringify({model, max_tokens: maxTokens, temperature: 0.8, messages: msgs})});
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error('ai_failed ' + provider + ' ' + r.status), {status: 502, detail: d && d.error});
      const u = d.usage || {};
      return {text: ((d.choices || [])[0] || {}).message?.content || '', tin: u.prompt_tokens || 0, tout: u.completion_tokens || 0};
    } finally { clearTimeout(to); }
  }

  // area: support | traders | funded | voice | followups
  async function call(area, system, messages, maxTokens = 400) {
    const S = settings.get('ai'); const main = S[area] || S.support; const backup = S.backup || {};
    const tries = [main]; if (backup.provider && backup.model && (backup.provider !== main.provider || backup.model !== main.model)) tries.push(backup);
    let err;
    for (const t of tries) {
      if (!hasKey(t.provider)) { err = new Error('no_key ' + t.provider); continue; }
      try { const out = await one(t.provider, t.model, system, messages, maxTokens); record(area, t.provider, t.model, out.tin, out.tout, true); checkBudget(); return out.text; }
      catch (e) { err = e; record(area, t.provider, t.model, 0, 0, false);
        if (team) team.alert('provider_fail', `⚠️ ${PROVIDERS[t.provider]?.n || t.provider} (${t.model}) failed for ${area}: ${String(e.message).slice(0, 120)}.${tries.length > 1 && t === main ? ' Switching to the backup.' : ''}`, {key: t.provider + t.model, every: 30 * 60e3}); }
    }
    throw Object.assign(err || new Error('ai_failed'), {status: 502});
  }
  const live = () => { const S = settings.get('ai'); return ['support', 'traders'].some((a) => hasKey((S[a] || {}).provider)) || hasKey((S.backup || {}).provider); };

  const routes = {
    'GET /api/admin/engine': async (req, b, u, url) => {
      const days = Math.min(+url.searchParams.get('days') || 7, 90); const from = new Date(now() + 3600e3 - days * 864e5).toISOString().slice(0, 10);
      return {ok: true, ai: settings.get('ai'), voice: settings.get('voice'), providers: Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, {n: v.n, models: v.models, key: v.key, ready: hasKey(k)}])),
        today: spentToday(), spend: q('SELECT * FROM ai_spend WHERE day>=? ORDER BY day DESC, usd DESC').all(from),
        byDay: q('SELECT day, SUM(usd) usd, SUM(calls) calls, SUM(fails) fails FROM ai_spend WHERE day>=? GROUP BY day ORDER BY day').all(from),
        perPerson: q(`SELECT a.tg_id, u.first_name, SUM(a.n) msgs FROM ai_usage a LEFT JOIN users u ON u.tg_id=a.tg_id WHERE (a.day GLOB '[0-9]*' AND a.day>=?) OR (a.day GLOB 'tg:*' AND a.day>=?) GROUP BY a.tg_id ORDER BY msgs DESC LIMIT 15`).all(from, 'tg:' + from)};
    },
    'POST /api/admin/engine': async (req, b, u, url, who) => {
      const out = {};
      if (b.ai) { const a = {}; for (const k of ['support', 'traders', 'funded', 'voice', 'followups', 'translate', 'backup']) if (b.ai[k]) a[k] = {provider: String(b.ai[k].provider || ''), model: String(b.ai[k].model || '').slice(0, 80)};
        for (const k of ['capFree', 'capPaid', 'capTg', 'budgetUsd']) if (b.ai[k] !== undefined) a[k] = Math.max(0, +b.ai[k] || 0);
        if (b.ai.prices && typeof b.ai.prices === 'object') a.prices = b.ai.prices;
        out.ai = settings.set('ai', a, who.name); }
      if (b.voice) out.voice = settings.set('voice', b.voice, who.name);
      return {ok: true, ...out};
    },
    'POST /api/admin/engine/test': async (req, b) => {
      const t0 = now(); try { const txt = await one(String(b.provider), String(b.model), [{type: 'text', text: 'You are a test. Reply with one short friendly sentence.'}], [{role: 'user', content: 'Say hi to the Zubabot team.'}], 60); return {ok: true, text: txt, ms: now() - t0}; }
      catch (e) { return {ok: false, error: e.message, detail: e.detail, ms: now() - t0}; }
    },
  };
  return {call, live, addSpend, spentToday, overBudget, checkBudget, routes, hasKey};
}
