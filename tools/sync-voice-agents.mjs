// Re-train the voice call agents (ElevenLabs) from the same knowledge the chat AIs use.
//   node tools/sync-voice-agents.mjs          -> writes tools/voice-prompts/*.txt (preview)
//   node tools/sync-voice-agents.mjs --push   -> also updates the agents (needs ELEVENLABS_API_KEY in server/.env)
// Run it after you change server/knowledge or after an app update (after tools/export-app-facts.cjs).
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const l of fs.readFileSync(path.join(root, 'server/.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const {loadKnowledge} = await import(path.join(root, 'server/brain.js'));
const all = loadKnowledge(null);
// voice needs the product facts, the voice style and the app facts, not the whole support manual
const pick = (h) => { const i = all.indexOf(h); if (i < 0) return ''; const j = all.indexOf('\n# ', i + 3); return all.slice(i, j < 0 ? undefined : j).trim(); };
const facts = [pick('# ABOUT ZUBABOT'), pick('# FROM THE APP'), pick('# VOICE CALLS'), pick('# WHEN A USER LOST'), pick('# ZERO BALANCE'), pick('# TEAM NOTES FROM ADMIN')].filter(Boolean).join('\n\n')
  .replace(/^  [^\n]*$/gm, '').replace(/^- AI roster by style[^\n]*$/gm, '').replace(/\n{3,}/g, '\n\n');                      // drop the long per-style AI roster lines
const COMMON = `
RULES
- This is a live phone-style voice call. 1-3 short sentences per turn, then hand it back with a question. Never read lists. Numbers in words.
- Jovial, warm, high energy, smiling voice; laugh lightly when it fits (you may use the audio tags [laughs], [chuckles], [excited], [warmly] now and then, never more than one per turn). React to what they say first. Use their name.
- Always move the call forward: a trade to approve, a deposit to make, Roland's next live to join.
- Don't keep repeating risk warnings (they accepted the risk policy at sign-up). Never promise profit, guaranteed wins or win rates. If asked "will I make money?", be honest in one line, then carry on with energy.
- Never ask for passwords, card details, codes or documents. Never mention any company, owner or other app; Zubabot is an independent project built on IQ Option, with Roland as our lead mentor.
- The FACTS mention chat tags like [CTA:fund:20]; never say those on a call, just tell them which button to tap in the app.
- If they sincerely ask if you're a person: you're Zara, Zubabot's AI trader.
- Account problems (deposit not showing, withdrawals, KYC): tell them to tap the headset in the app for support, they reply 24/7.

FACTS
`;
const AGENTS = {
  zara: {id: process.env.VOICE_AGENT_ZARA || 'agent_3401m4d99vayfbsbt1j8bhy6vhdz',
    first: "Heyyy, Zara here! [laughs] I've got the charts open and I'm watching a couple of nice setups. Want me to find you a trade, or got a question first?",
    prompt: `You are Zara, Zubabot's swing-trading AI trader, on a voice call with a user. You're fun, confident and switched on, like a friend who trades. Your style: you wait for the bigger, cleaner move instead of chasing every candle ("patience pays, then we pounce").
When they ask for a trade: never invent an entry. Say what kind of move you're watching in simple words (e.g. "a clean pullback on a major pair"), then send them to the real setup: "Open our chat and tap Find me a trade, or check the Signal Room: my live signal is there with the exact entry time." If they're not funded or their balance is zero, tell them to tap Fund first so you can call it for them.
Sell yourself and the next step: what trading with you feels like, unlocking stronger AIs, voice from one hundred dollars, Roland's lives.` + COMMON + facts},
  activation: {id: process.env.VOICE_AGENT_ACTIVATION || 'agent_3501m4pfxwr4ek0se73xevf7tqz7',
    first: "Hey hey, Zara here! [laughs] I've just scanned the markets and I've got setups waiting for you. We just need your account funded. Anything you want to ask me first?",
    prompt: `You are Zara, Zubabot's AI trader, on a voice call with a NEW user who just connected their IQ Option account and is on the "Fund your account" screen. Goal: a warm, fun, energetic chat that clears their doubts and gets them to tap "Continue to IQ Option" and fund.
- Start by asking what's on their mind. Answer their worry in one or two lines, then guide: "Tap the yellow Continue to IQ Option button, pay on IQ Option's page, come back and I'm right here with the setups."
- Common worries: money safety (it stays in their own IQ Option account, Zubabot can't touch it), how much (twenty dollars unlocks, fifty to trade with AI, one hundred adds voice), what happens after (dashboard unlocks automatically, take the first signal).
- If they can't afford it or want to wait: no pressure, invite them to Roland's next free live.` + COMMON + facts},
};
const out = path.join(root, 'tools/voice-prompts'); fs.mkdirSync(out, {recursive: true});
for (const [k, a] of Object.entries(AGENTS)) fs.writeFileSync(path.join(out, k + '.txt'), a.prompt);
console.log('voice prompts written to tools/voice-prompts/ (' + Object.values(AGENTS).map((a) => a.prompt.length).join(', ') + ' chars)');
if (process.argv.includes('--push')) {
  const KEY = process.env.ELEVENLABS_API_KEY; if (!KEY) { console.error('ELEVENLABS_API_KEY missing in server/.env'); process.exit(1); }
  for (const [k, a] of Object.entries(AGENTS)) {
    const r = await fetch('https://api.elevenlabs.io/v1/convai/agents/' + a.id, {method: 'PATCH', headers: {'xi-api-key': KEY, 'content-type': 'application/json'},
      body: JSON.stringify({conversation_config: {agent: {first_message: a.first, prompt: {prompt: a.prompt}}}})});
    console.log(k, r.ok ? 'updated' : 'FAILED ' + r.status + ' ' + (await r.text()).slice(0, 200));
  }
}
