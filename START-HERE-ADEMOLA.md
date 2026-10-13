# Ademola: start here (Zubabot launch kit, 13 Oct 2026, round 5)

This page is everything you need to put Zubabot live: what to connect, where each key goes, how to deploy, how to update safely, and how to keep training the AI. The detailed server steps are in `LAUNCH.md`. The change history is at the bottom.

## 0. Go live in about an hour (the short path)
| Step | Time | What to do |
|---|---|---|
| 1 | 10 min | Rent a VPS (Ubuntu 24.04, 2 GB RAM). Point `app.`, `api.`, `zubabot.com`, `www.` A records at it. |
| 2 | 5 min | @BotFather: `/newbot`, `/newapp`, Menu Button → `https://app.zubabot.com`. Copy the token. |
| 3 | 5 min | console.anthropic.com → API key + billing. |
| 4 | 25–45 min | `LAUNCH.md` step 1 (copy-paste). In `server/.env` fill **only** `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `SUPPORT_TEAM_CHAT_ID`, `OPENAI_API_KEY` (calls work right away). Everything else is already filled in or optional. |
| 5 | 5 min | On the server, `sudo nano /opt/zubabot/web/config.js`: set `ZB_BOT_APP` to `https://t.me/<yourbot>/app`. **If your bot is not called `zubabot`**, also replace `zubabot` with the real bot username in `BOT_USERNAME` (`/opt/zubabot/server/.env`), in `window.ZUBA.telegram` near the top of each `/opt/zubabot/site/zubabot-lp*.html`, and in the `t.me/zubabot` links of `/opt/zubabot/site/index.html`. Set the live link in Admin → Lives. |
| 6 | 5 min | Open `https://api.zubabot.com/admin`, paste `ADMIN_KEY`. **Overview → Setup check** must be green. Add teammates in **Team**. |
| 7 | 5 min | Affstore postbacks (section "Affstore postbacks" below), then run the phone test in section 9 with `ZB_DEMO = true`. |

**First launch is English.** Every other language (Portuguese, Spanish, Taglish, French, Thai) is already built and can be switched on any time, the same day if we want (section 11). Nothing about the other languages blocks the English launch.

Later, when you have traffic: the own voice server (section 6, about 1–2 hours the first time) and Twelve Data Grow for OTC prices (section 10).

## 1. What's in the kit

| Folder | What it is | Where it goes |
|---|---|---|
| `web/` | The Telegram mini app (`zubabot.html`) + `config.js`, `callback.html`, `zubabot-iq.js`, and the media folders `faces/` (144 AI traders), `mentors/`, `avatars/`, `academy/` (`academy/v2/*.mp4` + `.webm` = the 8 training videos) | `https://app.zubabot.com` |
| `server/` | The API (Node 22, no npm installs): accounts, IQ Option OAuth, Affstore postbacks, rewards, signals, AI brain, **Telegram support assistant**, Zubabot Pay | `https://api.zubabot.com` |
| `server/knowledge/` | **The AI's training.** Plain text files the AI traders, the support assistant and the follow-ups all read | edit any time, no restart |
| `site/` | The website (`index.html`) and the 3 landing pages (`zubabot-lp1/2/3-….html`) | `https://zubabot.com` |
| `deploy/` | Caddy (HTTPS), systemd service, nightly backup, **`update.sh` (safe updates)** | `/opt/zubabot/deploy` |
| `tools/` | `export-app-facts.cjs` (teaches the AI the current app), `sync-voice-agents.mjs` (re-trains the voice call agents) | run on your laptop or the server |
| `voice-server/` | **Our own voice server** (Kokoro voices + Whisper listening) for a rented GPU computer. Optional; see section 6 | a GPU server |
| `test/` | All tests (see section 9) | |

## 2. Accounts and keys to connect

Fill these in `server/.env` (server only, never in the app or in git) and `web/config.js` (public settings).

| # | Service | What it's for | Where to get it | Put it in |
|---|---|---|---|---|
| 1 | **Server (VPS)** | Runs everything | Any VPS: Ubuntu 24.04, 2 GB RAM (Hetzner, DigitalOcean, Contabo) | — |
| 2 | **Domain + DNS** | `app.`, `api.`, root `zubabot.com` | Your registrar. A records → the server IP | `deploy/Caddyfile` (already set) |
| 3 | **Telegram bot** | Mini app login + the support chat | @BotFather → `/newbot`, then `/newapp` (link `t.me/<bot>/app`) and *Menu Button* → `https://app.zubabot.com` | `.env` `TELEGRAM_BOT_TOKEN`, `config.js` `ZB_BOT_APP` |
| 4 | **Support team group** | Hard cases go to humans | Create a Telegram group, add the bot, make it admin, send a message, get the id (starts with `-100`, e.g. from `https://api.telegram.org/bot<TOKEN>/getUpdates`) | `.env` `SUPPORT_TEAM_CHAT_ID` |
| 5 | **IQ Option OAuth** | One-tap sign-up / login, automatic trading | **Already filled in** (client 459018691019837, platform 578, secret in `.env`). Confirm the redirect URI with Ejiro | `.env` `IQ_*`, `config.js` `ZB_IQ_*` |
| 6 | **Affstore postbacks** | Registration, FTD, deposits, withdrawals | my.affstore.com, see "Affstore postbacks" below | `.env` `POSTBACK_KEY` (already generated) |
| 7 | **Anthropic (Claude) API** | The brain: AI traders, support assistant, follow-ups | console.anthropic.com → API keys. Add billing | `.env` `ANTHROPIC_API_KEY` |
| 8 | **ElevenLabs** (optional) | The premium voice for Pro calls (see 15). Not needed to launch | elevenlabs.io → API keys | `.env` `ELEVENLABS_API_KEY` |
| 9 | **Wallets for Zubabot Pay** | Coins/tokens bought with crypto | Trust Wallet: USDT (TRC20) address + BTC address | `.env` `PAY_USDT_TRC20_ADDRESS`, `PAY_BTC_ADDRESS` |
| 10 | **TronGrid key** (optional) | Faster USDT checks, no rate limits | trongrid.io (free) | `.env` `TRONGRID_KEY` |
| 11 | **Twelve Data** | Real prices behind OTC signals + scoring. The free plan (8 calls/min) is fine for testing; with many OTC pairs live take **Grow** (about $79/month) | twelvedata.com | `.env` `TWELVEDATA_KEY` |
| 12 | **Live link** | Where "Join the live" goes | Roland's live room link (YouTube/Telegram live) | `config.js` `ZB_LIVE_URL` |
| 13 | **Meta / TikTok pixel** | Ad tracking on the landing pages | Events Manager | paste where it says `<!-- paste Meta Pixel / TikTok pixel here -->` in each `site/zubabot-lp*.html` |
| 14 | **Speech for calls** (pick one to start) | Calls inside Telegram on Android (its browser has no phone voice) | Easiest: OpenAI key (platform.openai.com). Cheapest: our own voice server (section 6) | `.env` `OPENAI_API_KEY` and/or `VOICE_SERVER_URL` + `VOICE_SERVER_KEY` |
| 15 | **Premium voice** (optional) | Pro users' calls | ElevenLabs API key (already have one) | `.env` `ELEVENLABS_API_KEY` |
| 16 | **Backup AI** (optional, recommended) | Chats keep working if Claude is busy | Any one: OpenAI, DeepSeek, Groq, OpenRouter or Gemini key, then pick it in Admin → AI engine → Backup | `.env` `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / … |
| 17 | **Email alerts** (optional) | Team alerts by email | resend.com (free tier) | `.env` `RESEND_API_KEY`, `ALERT_FROM` |

## 3. Deploy (first time, about 1 hour)
Follow **`LAUNCH.md` steps 1–5** (it copies `server`, `web`, `site`, `deploy`, `tools`, installs Caddy for HTTPS, the service and the nightly backup).
Then open: `https://api.zubabot.com/api/health`, `https://app.zubabot.com`, `https://zubabot.com`, `https://api.zubabot.com/admin`.
**Admin sign-in:** open `https://api.zubabot.com/admin`, paste the `ADMIN_KEY` from `server/.env`. Go to **Overview → Setup check**: every red line names the exact key still missing.

## 4. The Telegram support assistant (`server/support-bot.js`)
It runs inside the same server as soon as `TELEGRAM_BOT_TOKEN` is set. Nothing else to install.
- **Answers every message** in the bot chat like a real teammate ("Emily" by default, `SUPPORT_NAME`; the in-app support team is Emily, Noah, Olivia, Jake and Leah): short texts in breaks with a typing indicator, in the user's language/tone, with one button at the end (Open Zubabot / Fund $X now / Join the live / Watch the video).
- **Knows every issue:** sign-up, old IQ Option accounts, deposits not showing, failed cards, signals, auto-gale, withdrawals/KYC, Zubabot Pay, scams, angry users. It can read **screenshots** users send. Voice notes: it politely asks them to type.
- **Follow-ups for people who haven't funded:** 6 personal messages over about 7 days (15 min, 3 h, next day, day 2, day 4, day 7), each with a different angle, written fresh by the AI for that person. It stops the moment they fund (and congratulates them), when they type `/stop`, or if they block the bot. No messages 22:00–08:00 WAT (`QUIET_HOURS`).
- **Sells the lives with Roland only** (lead mentor): an invite about 40 minutes before each live (10:00, 15:00, 18:00, 22:00 WAT), max one per person per day.
- **Zero balance → top-up:** if a funded user's IQ Option balance is $0 (the app reports it), it sends a top-up message with a Fund button (max every 2 days).
- **Losses:** it doesn't blame the AI. It explains which part of the plan was skipped (too big for the balance, chasing, many trades at once, missed entry, gale on a small balance), gives the rule, then offers the next signal, the live or a top-up.
- **Hand-off to humans:** angry users, refund/legal talk, money missing after checks → it says a teammate will reply and forwards the chat to your team group. **Reply to that forwarded message in the group** and the user gets your answer from the bot. The assistant stays quiet in that chat for 6 hours; type `/ai <id>` in the group to give it back, `/human <id>` to take over for 24 h.
- Commands users see: `/start`, `/live`, `/fund`, `/invite`, `/stop`. Ad links can carry a source: `t.me/<bot>?start=tiktok1` (stored in `bot_users.src`).
- Mode: `SUPPORT_MODE=polling` (default, works with no extra setup). For more than one server process use `webhook` + `PUBLIC_URL`.
- Admin → **Telegram support** shows how many people are in the chat, where they are in the follow-ups, and the latest messages.

## 4b. Invite friends (`server/referral.js`, `web/zubabot-invite.js`)
- Own page in the app (side menu → Invite friends, home card, wallet card, or `/invite` in the Telegram chat): personal link, Share on Telegram / WhatsApp / Copy, stats (invited, connected, funded, coins earned), friends list with live status, milestone bar.
- **Link:** `https://t.me/<BOT_USERNAME>/<MINIAPP_NAME>?startapp=ref_<CODE>` (opens the mini app straight away). Telegram signs the `start_param`, so it can't be faked. The chat link `t.me/<bot>?start=ref_<CODE>` works too. Set `BOT_USERNAME` and `MINIAPP_NAME` in `.env`.
- **Tracking rules:** only brand-new people (first open in the last 30 min, no IQ Option account linked), never yourself, first link wins, no A↔B loops.
- **Coins (only on REAL deposits confirmed by the Affstore postback):** counted on everything the friend deposits in the 24 h after their first $20+. Under $100: inviter +200, friend +100. From $100: inviter 5 coins per $1 (max 2,500), friend 2 per $1 (max 1,000). After the 24 h: 3% of the friend's deposit coins for life. Bonuses at 5/15/30 trading friends (+1,000/+3,000/+8,000). **Nothing is paid until the friend has taken 5 real trades** (trades with an IQ Option ID logged in `trades`; failed ones don't count): until then it shows as reserved. All in `.env` (`REF_*`, `REF_MIN_TRADES`). Withdraw-and-redeposit money earns nothing.
- **Coins are not money:** they can't be withdrawn or cashed out, only spent to unlock AI traders. The page, the AIs and support all say so.
- The bot messages the inviter when a friend joins and when a friend funds. Admin → **Invites** shows top inviters and coins paid. Test: `node test/referral.test.mjs`.

## 4c. Admin panel: easy for the whole team (`/admin`)
Open `https://api.zubabot.com/admin`. The owner signs in with `ADMIN_KEY`; everyone else gets a **personal sign-in link** (Admin → Team & activity → Add a teammate → pick a role → send them the link). Roles: Manager, Support lead, Support agent, Coach / mentor, Marketing, Tech / AI. Each role only sees its pages; the table on that page shows who sees what. **Activity** shows everything everyone did.
- **Overview:** today's numbers, a 14-day chart, and the **Setup check** (green = connected, red = missing, with the exact `.env` key to add). Start here after deploying.
- **Support inbox:** every chat (Telegram + in-app + MAX mentor chat). Chats that need a person are on top. **Take over** (the assistant goes quiet and the user gets "Hi, I'm Grace from the Zubabot support team"), reply (Enter sends; quick replies; add a Fund/Live/Open button), **Hand back to AI**, **Close** (user gets 👍/👎; 👎 reopens it), private notes, and **Teach a better answer** under any AI reply (saved as training straight away).
- **Members:** search by name, @username, Telegram ID or IQ ID. Open anyone: deposits, trades, calls, invites; **give/take coins or tokens** (reason required, optional Telegram message), **fix the IQ Option ID**, block/unblock, flag, stop reminders, team note, message them.
- **Broadcast:** pick a group (not registered, not funded, funded, $100+, $500+, balance $0, quiet 7 days, joined today) and optionally the start link they came from (`lp1`, `ad_tiktok`…), write the message (`{name}`, `||` splits texts), add a button, send a test to yourself, send now or schedule. Progress shows live.
- **Lives:** mentor name, times, link, reminder minutes. The app, the AIs and the Telegram invites use them immediately.
- **AI engine & voice:** which AI company/model answers each part + a backup, **Test** buttons, daily **budget** (alert at 80%; at 100% chats fall back to built-in answers), message limits per person, spend per day/part/company, voice settings, voices per AI, **Play a test voice**, recent calls with transcripts.
- **Sales engine**, **Train the AI**, **Invites**, **Signals/Results/Strategy**, **My alerts** (connect Telegram with one tap, choose alerts, add email, set the name users see), **Settings** (hand-off timings, words that go straight to a human, follow-ups, quiet hours, big-deposit alert).

## 4d. Transfer to a human (how it works)
1. A user types "human / agent / real person / customer care…" (editable in Settings) or `/human`, or the assistant decides it needs a person → the chat becomes **Needs a human**; the user is told a teammate is joining (usually within 10 min).
2. The team is alerted: the **team group** (`SUPPORT_TEAM_CHAT_ID`) and every teammate who **connected Telegram** in My alerts, with a **Take over** button. Reply to the alert in Telegram, or answer in the inbox.
3. Nobody answered in 10 min → reminder to the team + "still on it" to the user. Nobody in 30 min → the assistant helps again meanwhile (the chat stays in Needs a human).
4. While a teammate has the chat, the assistant is silent; every new user message pings that teammate. In the app, teammates' replies appear in the support chat (with their name) and as a preview pop-up.
5. Hand back or Close when done. Quiet human chats go back to the assistant after 12 h. Team group commands still work: `/human <id>`, `/ai <id>`, `/close <id>`.

## 4e. Sales engine + Chats tab (`server/sales.js`, `web/zubabot-sales.js`, `web/zubabot-chats.js`)
- The user's own AI messages them at the right moment: **3 and 5 wins in a row**, a **great day** (+30% of deposits), **almost at the next level** ("$20 from voice calls"), **check-in** after 2 days without trading, and a **stronger AI introducing itself** after a great day (real numbers from live signals). The fund amount always points to the next level ($20→$50→$100→$500→$1,000→$2,000) and the deposit is called their own trading capital. Never after a loss, never in quiet hours, never after `/stop`, max 2 a day.
- Delivery: a **Telegram notification** + an **in-app preview** that slides in at the top (tap → that chat), a badge on the bell and on **Chats**.
- **Chats tab** (bottom bar): Support and the Live room pinned on top, **MAX members also get Roland pinned** to text him directly (others see a locked row that sells MAX), and users can **pin 2 AI traders**. MAX mentor messages land in the Support inbox marked "⭐ MAX member"; whoever answers, the user sees it as Roland's reply.
- Admin → **Sales engine**: switch each moment on/off, change the numbers, and see sent / opened / deposited within 48 h / $ for each moment.

## 4f. Telegram funnel (landing page → bot → app)
1. Landing page button → `t.me/<bot>?start=lp1`. Before they tap START, Telegram shows the bot's welcome screen: **“Tap START below to activate your 3 months free 👇”** (set automatically from Admin → Settings → Telegram funnel).
2. After START: **“Congrats {name}! 🎉 Your 3 months free is activated.”** → **“Any question? Just type it right here 👇”** → then ONE call to action: **“Now launch your AI on our app 🚀 …”** with a single **🚀 Launch my AI now** button (opens the mini app). Only the last message has a button, so nothing distracts.
3. Follow-ups now know where each person stopped (didn't open the app / no IQ account / not funded) and aim at that next step.
4. **Hourly “come back” nudges** (8:00–22:00 WAT): one short message with a button, different words each time, fitted to their stage; funded users get the **real next live signal** (pair, BUY/SELL, entry time) with “Take this signal”. The previous nudge is **deleted**, so only the newest stays in the chat. It resets when they open the app or write, slows to every 6 h after 12 ignored ones, and stops with /stop. All editable in Admin → Settings → Telegram funnel.
5. **Telegram Business (Premium account):** in the Premium account go to Settings → Telegram Business → Chatbots → add this bot (allow replies). Customers who message that account get the trained assistant answering *as that account*; when your team types in that chat themselves, the assistant goes quiet (it becomes a human chat in the inbox). Hourly nudges only go out from the bot chat.

## 4f-1. Nobody gets lost on IQ Option's website
- With IQ Option sign-in (OAuth) the sign-up page opens inside Telegram and comes straight back to the app after “Allow”. If it opened in the phone's browser, the return page sends them back to Telegram by itself.
- **Safety nets (bot chat):** the moment Affstore's registration postback arrives, the bot sends “🎉 your IQ Option account is ready, tap to come back” with a **Back to Zubabot** button (even if they're still on IQ Option's site). If they opened the sign-up 10+ minutes ago and still aren't connected, it sends “still on IQ Option? tap to come back” once. A first deposit gets a “your deposit is in” message within a minute. Then the hourly nudges take over.

## 4f-2. Bot flows (templates you can switch and A/B test)
Admin → Settings → **Bot flows**: what people get right after START. Three ready templates (Main: congrats → questions → launch; Short: one message, two buttons; Trust first: IQ Option picture → launch). Edit any message, add a picture, add up to 4 buttons per message (Open app, Fund $X, Live, Training, Invite, Signal Room, Coins, **Ask support** (the bot answers right there, tidy), **Talk to a person** (hand-off), or a link). Save, Save as copy, **Send to my Telegram** to try it, **Make active**, Delete. **A/B test**: send e.g. 30% of new people to a second flow; each flow shows started → opened app → connected → funded → $ so you keep the winner.
Support from the flow stays organised: “💬 Ask support” sits under the Launch button; tapping it gets one friendly reply, then they just type and the assistant (or a teammate) answers in the same chat.

## 4g. Where signals come from
- Built-in engine (`server/strategy.js`), **live by default**. Per AI trader (Admin → Strategy): **Auto** (picks from how the AI trades), **Momentum** (short-term trend + RSI), **Reversal** (RSI under 30 / over 70), **Breakout** (breaks the last 20-minute range): these read real prices and only post when the setup is really there, with a one-line reason the AI explains. Also **Trend bias** (shared settings), **Custom** (its own bias, averages, gap, active hours) and **Random** (testing only). Tick **as many pairs** as each AI trades (none = all pairs that are on).
- **Prices:** crypto from Binance (free). Forex and OTC pairs read the real pair (EUR/USD OTC → EUR/USD) from **Twelve Data** (`TWELVEDATA_KEY`). The free plan (800 calls/day) only covers about 3 pairs; for 8 pairs take a paid plan or raise `TD_CACHE_SEC`. Without a key, OTC pairs keep the AIs active with a 50/50 pick (switch that off in Strategy if you want only real-data setups).
- **“Find me a trade”** in an AI chat checks that AI's rules on its pairs right then and shows the signal card (or honestly says nothing is clean yet).
- **Every other AI in the app is active too**: “Every other AI trader” uses the default strategy (Random to start), on pairs that match its market (crypto AIs on crypto pairs). One open signal per AI per pair.
- **Outside signals:** set `SIGNAL_WEBHOOK_KEY` and send `POST /api/signals/webhook?key=…` `{"ai":"kai","pair":"EUR/USD OTC","dir":"buy","expiry":1}` (works with TradingView alerts). Set that AI's source to *Outside only*. The team can also post by hand in Admin → Signals.
- Everyone who follows the same AI gets the exact same signal. When a user takes a signal, the app finds that pair on **their own IQ Option account** and places it there (it says “market closed” if that pair isn't open for them). Their balance is read live from their IQ Option account.
- Support and the AIs now see each person's account: IQ Option ID and link status, deposits/withdrawals (with times), current balance, today's trades and P/L, open trades, last trades (and errors), coins/tokens, invites, reward reviews. So “where is my deposit?” gets a straight answer.

## 5. Training the AI (and keeping it trained after every update)
Everything the AIs know is in **`server/knowledge/`**. All AI traders, the support assistant, the follow-ups and (through the tool) the voice agents read it.

| File | What's in it |
|---|---|
| `10-product.md` | Facts about Zubabot |
| `20-how-you-talk-and-sell.md` | Texting style, selling, zero balance → top-up, when a user lost, CTA buttons |
| `30-support-issues.md` | Every support issue and how to handle it |
| `40-ai-traders.md` | How AI traders sell themselves |
| `50-voice-calls.md` | Jovial, high-energy call style |
| `60-telegram-follow-ups.md` | The follow-up plan |
| `90-team-notes.md` | Your notes (kept safe by `update.sh`) |
| `auto/app-facts.json` | **Generated from the app**: modes, all 144 AI traders and prices, live times, mentors, trainers |

Three ways to teach it something new, all live immediately (no restart, no code):
1. **Admin → Train the AI → "Teach the AIs something new":** type one fact ("This Friday's 6pm live is 90 minutes"). Saved in the database.
2. **Admin → Train the AI → Knowledge files:** edit any file in the browser and save (a `.bak` backup is kept). Or edit the files on the server.
3. **After an app update:** run `node tools/export-app-facts.cjs` so the AI learns the new AIs, prices and modes automatically (I already run it on every build; the file in the kit is current). Then `node tools/sync-voice-agents.mjs --push` to re-train the two voice agents.

Use **Admin → Train the AI → Try it** to ask a question as a user (funded / zero balance) and see exactly what the AI would answer. Read Admin → AI log weekly and add notes for anything it got wrong.

Privacy: the AI knows nothing about other companies or projects. Only Zubabot, IQ Option and Roland.

## 6. Voice calls (work on every phone, including Telegram on Android)
Telegram's built-in browser on Android has no phone voice and no voice typing, so the app now does all listening and speaking through the server (`server/voice.js`): **hold the mic to talk, let go to send**; the AI answers sentence by sentence (first words in about 2–3 s). The free 3-minute welcome call with Zara before funding and every call with an unlocked AI trader work this way. The old "open the real voice" link is gone (it left the app).
- **Pick providers in Admin → AI engine & voice** (no code). Listening: `self` (our server) → `openai` → `deepgram`. Standard voice (1 token/min): `self` → `openai`. Premium voice (4 tokens/min, Pro $1,000+): `elevenlabs` → `self`. If one fails, the next is used and you get an alert.
- **Start in 5 minutes:** add `OPENAI_API_KEY` → calls work. **Cheapest:** set up `voice-server/` on a GPU computer (README inside: rent a Hetzner GEX44, about 5 copy-paste commands, ~1–2 h the first time), then add `VOICE_SERVER_URL` + `VOICE_SERVER_KEY`. Several servers: comma-separated URLs (shared automatically).
- **Daily minutes:** 60 call minutes a day per person (120 for MAX $2,000+), and at most 20 of them in the premium voice; after that the call carries on in the standard voice. When today's minutes are used, the app says calls are back tomorrow and offers text chat. Change all three in Admin → AI engine & voice. Tokens are still charged per minute on top, so the limit only protects the voice server at busy times.
- **Limits:** max calls at the same time (default 60). When full, *leads* are asked to chat by text for a minute; *funded users always get through*. Tokens are charged on the server per started minute; when they run out the call ends politely. Calls with lost signal end after 90 s.
- Every spoken line is cached (`voice-cache/`), so repeated lines cost nothing. Spend is in AI engine & voice.
- The ElevenLabs agents (`VOICE_AGENT_*`) are kept for reference; `tools/sync-voice-agents.mjs --push` still re-trains them.

## 6b. Charts and voice notes in AI chats
- **MAX ($2,000+):** every AI reads chart screenshots (30 a day) and listens to voice notes (30 a day), and can answer voice notes out loud.
- **Pro ($1,000+):** voice notes, 10 a day.
- **Everyone else:** can unlock chart reading for one AI for **1,500 coins** (10 charts a day with that AI). Going MAX unlocks every AI at once.
- All numbers: Admin → Settings → Charts & voice notes.

## 6c. Free period (nobody is told)
- Everyone starts with **3 months free** (shown in the app as "Free until …").
- When it ends, the server quietly adds **6 more months**. No message, the date just moves.
- When those end, anyone who opened the app in the last 30 days gets **another 6 months**, again silently. Someone who went quiet keeps the old date, and the moment they open the app again they get the 6 months.
- The AIs and support never mention extensions. If asked, they give the person's current "free until" date and say there's nothing to pay.
- Change it (or switch it off) in Admin → Settings → Free period. Each member's date shows in Members.

## 7. Updating without affecting users
- **Always update with** `sudo bash deploy/update.sh` from the new kit folder. It backs up the database, copies the new code **without touching `.env`, the database, `config.js` or your team notes**, restarts gracefully (requests in flight finish first), checks `/api/health` and **rolls back automatically** if the new version doesn't start.
- **Database:** tables are only ever added (`CREATE TABLE IF NOT EXISTS`) and new columns go through `addColumn()` in `server.js`. Nothing is dropped or renamed, so accounts, deposits, coins, chats and follow-up positions survive every update.
- **App:** the user's state on the phone keeps working across versions (new fields are optional). Caddy sends `no-cache` for the app, so phones pick up a new version on the next open.
- **AI:** knowledge changes need no deploy at all (section 5).
- Nightly backups: `/opt/zubabot/backups` (14 days).
- `update.sh` also refreshes the systemd service. If the new kit's `deploy/Caddyfile` differs from yours it tells you; copy it with `sudo cp /opt/zubabot/deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy`.

## 8. Safety rules built in (from the launch audit)
- **Account linking:** an IQ Option account that Affstore says was signed up by another Telegram user (`afftrack=Zubabot_tg<ID>`) can never be linked by someone else. Max 6 link/claim tries per hour per Telegram user. A linked user can't silently switch to another IQ Option account (support moves it).
- **Signal results** are only scored from trades by linked, funded users with a real IQ Option trade ID.
- **AI cost caps:** app chat 40/day (unfunded) and 300/day (funded); Telegram chat `AI_DAILY_TG=60`/day per person.
- **No ghosting:** if the AI key is missing or the AI fails, the Telegram assistant answers common questions from built-in replies. It only promises a human when `SUPPORT_TEAM_CHAT_ID` is set, and in-app hand-offs go to the same group.
- **Follow-up limits:** 6 follow-ups max, quiet hours, max 1 live invite a day and it stops after 3 unanswered invites; anyone can `/stop`.

## 9. Launch test checklist
Run `node test/test.mjs`, `node test/strategy.test.mjs`, `node test/room.test.mjs`, `node test/brain-pay.test.mjs`, `node test/bot.test.mjs`, `node test/referral.test.mjs`, `node test/inbox-voice.test.mjs`, `node test/sales.test.mjs`, `node test/free.test.mjs`, `node test/self-ai.test.mjs`, `node test/multi.test.mjs`, `node test/security.test.mjs`, `node test/care.test.mjs` (all pass). Languages in the browser: `node test/e2e-lang.cjs zubabot-demo.html`. Browser voice test: `node test/e2e-voice-server.mjs` + `node test/e2e-voice.cjs` (real hold-to-talk with a fake microphone). Admin with sample data: `node test/admin-demo-server.mjs` → `http://localhost:9990/admin#key=OWNERKEY`. Browser tests: `test/e2e*.cjs` with their `*-server.mjs` (see `run.sh` usage in the history).
On a phone, with `window.ZB_DEMO = true` first:
1. Open the bot → `/start` → welcome texts + Open button. Ask a question → AI answer in breaks with a button.
2. Sign up (new email) → *Account connected* → the big **I ACCEPT** button → dashboard.
3. Fund $20 → unlocks; the bot congratulates you; follow-ups stop.
4. Place a demo trade from a signal and from New trade (BUY/SELL bar pinned at the bottom).
5. Training → play lesson 1 (video with voice, music and captions; full-screen button).
6. Call Zara: hold the mic, ask “is my money safe?”, let go → she answers out loud (also on an Android phone inside Telegram).
6b. Win 3 trades in a row → your AI's message pops in at the top and arrives on Telegram.
6c. Type “I want a human” in support → take over in Admin → Support inbox → reply → it shows in the app.
7. In the team group: trigger a hand-off ("I want a refund"), reply to it, check the user gets it.
8. Remove `ZB_DEMO`, place a $1 real trade.

---

## 10. Costs, and running our own servers
Prices checked 13 Oct 2026; confirm on each site before you pay.

### What you pay every month
| Item | Cost | Notes |
|---|---|---|
| Main server (VPS) | $10–20 | 2 GB RAM is enough to start; 4 GB from ~5,000 daily users |
| Domain | ~$1 | |
| Claude Haiku 5.5 (all chats, support, follow-ups) | **about $0.0005 per AI message** | $0.10 / $0.50 per million tokens. The training files are cached, so each message mostly pays for the new words. 1,000 active users × 20 messages a day ≈ **$10 a day** |
| Twelve Data Grow | ~$79 | Only when OTC signals are live on many pairs. Crypto prices (Binance) are free |
| Voice, option A: OpenAI | ~$0.015 per call minute | Listening $0.003/min + standard voice. No setup. 1,000 call minutes a day ≈ $15/day |
| Voice, option B: **our own voice server** | **€184/month flat** (+ €79 once) | Hetzner GEX44. About 40–60 people talking at once, unlimited minutes. Cheaper than OpenAI from roughly 400 call minutes a day |
| Premium voice (ElevenLabs, Pro calls) | ~$0.07 per minute | Capped at 20 premium minutes per person a day |
| Email alerts | $0 | Resend / Brevo free tiers |

Set a **daily budget** in Admin → AI engine (start with $25). At 80% the team is alerted; at 100% chats use the built-in answers and hard cases go to the team.

### Do we need our own servers?
- **Voice: yes, once calls take off.** Start with the OpenAI key (5 minutes). Add the voice server when you pass ~400 call minutes a day (`voice-server/README.md`, about 1–2 hours the first time, all copy-paste). Zubabot switches to it by itself and falls back to OpenAI if it's down. Daily call minutes (section 6) keep one server from being swamped at peak.
- **AI brain: no, keep Claude.** At $0.0005 a message, a GPU running our own model (€184–838/month) only pays off above roughly 400,000 messages a month, and the replies would be weaker at selling and support. If you ever want it: run an OpenAI-style model server (vLLM or Ollama) on a GPU, set `SELF_AI_URL` (+ `SELF_AI_KEY`, `SELF_AI_MODEL`) in `.env`, then pick **Our own AI server** for any area in Admin → AI engine (e.g. only follow-ups), with Claude as the backup.

### What's connected in minutes
| To connect | Where | Time |
|---|---|---|
| A new AI company (OpenAI, DeepSeek, Groq, OpenRouter, Gemini) | key in `.env`, restart, pick it in Admin → AI engine, press **Test** | 5 min |
| Voice server | `VOICE_SERVER_URL` + `VOICE_SERVER_KEY` in `.env`, restart, **Play a test voice** | 2 min after it's built |
| Telegram Business (support from a Premium account) | @BotFather → your bot → Bot Settings → Business Mode on; then on the Premium account: Settings → Telegram Business → Chatbots → add the bot | 3 min |
| Team member | Admin → Team → Add → send them the link | 1 min |
| Outside signals (TradingView) | Admin → Strategy → source "external", webhook `POST /api/signals/webhook?key=SIGNAL_WEBHOOK_KEY` | 10 min |

## 11. Funnels, bots and languages (`server/funnels.js`, `server/i18n.js`, `web/zubabot-i18n.js`)
One server, one database, one team, many bots and funnels. Same users, deposits, signals and AI traders everywhere.

**Funnels** (Admin → Funnels & bots). A funnel is one way people come in, with its own language, bot, welcome flow, affiliate link, tracking name and (optional) mentor.
| Type | Link | What happens |
|---|---|---|
| Bot | `t.me/<bot>?start=f_<funnel>_<sub>` | welcome flow in the bot chat → mini app |
| Channel join | invite links made in Admin per sub-ID | the bot accepts join requests (instantly / after a wait / never) and DMs the welcome flow |
| Direct | `t.me/<bot>/<app>?startapp=f_<funnel>_<sub>` | straight into the mini app |

- **Sub-IDs** (media buyers, ad sets): anything after the funnel name. First touch wins and stays with the person; Admin shows people / opened app / accounts / funded / $ per funnel and per sub. Old links like `?start=lp1` count as funnel `main`, sub `lp1`.
- **Media buyers**: Team → Add → role *Media buyer* + their sub-IDs (e.g. `b1`). They see only their own subs (`b1`, `b1-tiktok`, `b1_fb`, not `b10`) and can make invite links; they can't edit funnels, bots or history.
- **Affiliate & tracking per funnel**: affiliate ID (only IDs the owner allowed), tracking name (afftrack becomes `<name><sub>_tg<TelegramID>`), sign-up link (must be on IQ Option, with exactly one `aff=<our ID>`). Every change is kept with who did it (funnel → History) and **every admin gets an email** when a sign-up link changes.
- **Its own mentor (any funnel, English too)**: Edit funnel → *This funnel has its own lead mentor* → name, photo (Upload), title, bio, lives (*same as the region* / *own link and times* / *no lives*). People from that funnel see that name and face everywhere: app, bot messages and flows, the AI's replies, the mentor chat and the inbox (the teammate sees "mentor here: James"). Roland stays for every other funnel.
- **New bot** (e.g. one per country): @BotFather `/newbot` → Admin → Funnels → Connect a bot (paste token, pick language) → in @BotFather `/newapp` for that bot with the web app URL shown (`https://app.zubabot.com/?l=<lang>`), then Menu Button with the same URL. A funnel for it is made automatically.

**Languages** (Admin → Languages). Built: Portuguese (Brazil), Spanish (Latin America), Taglish (Philippines), French (Francophone Africa), Thai. About 2,300 app texts each are translated and shipped in `web/i18n/<lang>.js` (`node tools/build-i18n.mjs` rebuilds them). Anything new is translated by the AI in seconds the first time it shows up, saved, and editable (Edit texts).
- Switch a language on with its switch, after **Preview app**. Off = people from that funnel see English.
- Each language has its **own support name** (Bia, Sofía, Joy, Aïcha, Mint) and its **own lead mentor** (Rafael, Mateo, Paolo, Arnaud, Krit) with their own live times in their time zone. **Roland never shows outside English.** Lives stay off in a language until you add the mentor's live link and switch them on (Support & mentor). With lives off, nothing in that language mentions lives.
- **Same AI traders, speaking the language**, plus **4 local AI traders per country** (Local AI traders: edit, add, switch off). They only show in their language.
- Users can switch **Region & language** in the side menu (with a warning that it changes the app language, AI traders and training videos; they can switch back).
- The team always reads chats in English (an English copy sits under every message), and teammates can reply in English: it's translated for the user.
- Thai and Taglish voice calls use OpenAI voices (the own voice server has no Thai/Filipino voice yet). French: IQ Option does not offer digital options to EU retail clients, so French targets Francophone Africa.
- Training videos: each language plays its own videos from `web/academy/<lang>/` (see section 14); if one is missing, the English video plays.

## 12. Security: no customer diversion (`server/security.js`, Admin → Security)
Every message a **person** sends (support and mentor replies, member messages, broadcasts, bot flows, Telegram Business accounts, the mentors' own Telegram accounts connected through Business, channels and groups where the security bot is admin) and **every AI reply** is checked before it goes out:
- **Blocked (never delivered, recorded):** a sign-up / affiliate link that isn't ours or has a second ID, another broker (link or "switch to …"), look-alike or disguised sites (`iq-option.com.evil.ru`, `iqoption.com@evil.com`, redirects), crypto wallets or bank details that aren't ours, asking for money outside IQ Option.
- **Flagged (delivered, recorded for review):** private contacts — @usernames and t.me links that aren't ours, WhatsApp, Instagram and other DMs, phone numbers, short links, outside sites, "DM me / text me / my number" in all 6 languages.
- Everything shows in Admin → Security (who, where, what, why) and in the security Telegram group (`SECURITY_CHAT_ID`). One tap: *OK* or *Confirmed* (+ pause that teammate).
- **Owner only:** allowed affiliate IDs (default `743768`), switching security or blocking off, trusted @handles / domains / wallets, resetting security. **Every admin is emailed** when any of these change, and when a funnel's sign-up link, a mentor's live link or the lives link changes.
- **Watching the mentors' accounts:** connect each mentor's Telegram (Premium) to the bot through Telegram Business (section 10 table); their messages to users are checked and flagged. **Their channels:** add the security bot as an admin (no rights needed except "delete messages" if you want blocked posts removed: Security → *Also delete blocked posts*).
- Set `SECURITY_CHAT_ID` (a private group with the bot in it) and make sure every admin has an email in Team.

**Other checks I'd add next (not built):** a weekly report of each teammate's flagged messages; alerts when one teammate opens many user profiles quickly; two-person approval for affiliate ID changes.

## 13. AI check-ins: after a loss, and when a session opens (`server/sales.js`)
- **After a big loss** (default: $25 or 25% of their deposits in 24 h, or 3 losses in a row), ~25 minutes after the last trade and only if they're not trading again, one AI checks on them like a friend: how are you doing, it happens to every trader, one tip (smaller amount, fewer gale steps, wait for a cleaner setup), "I'll find us a clean setup when you're ready". Half the time it's a different AI from the one they trade with. **It never asks for a deposit, and nothing is sold to them for 24 h.** When they reply, the AI knows they had a rough day and stays supportive.
- **Session opening:** active traders (traded this week, not in the last 6 h) get a personal message 5–25 minutes before London / New York / Tokyo opens: "Tobi, London opens soon and I'm watching EUR/USD, want to take it together?" → Signal Room.
- **Natural, not pushy:** every message is written fresh (their first name, a different opening each time, short like a text, no hype). Max 2 a day and 5 a week per person; after 3 messages in a row they ignored, the AIs go quiet for them for a week. All tunable in Admin → Sales engine.

## 14. Training videos in every language (`web/academy/<lang>/`)
- All 8 lessons exist in Portuguese (Rafael), Spanish (Mateo), Taglish (Paolo), French (Arnaud) and Thai (Krit): the region's own trainer, voice, captions and on-screen text, recorded on the app in that language. English stays in `web/academy/v2/`.
- The app plays `academy/<lang>/<lesson>.mp4` when that file exists (the list is in `web/i18n/<lang>.js` → `videos`, rebuilt by `node tools/build-i18n.mjs` or by the server on start). A missing lesson falls back to English, so you can replace one video at a time.
- The "talk to your AI" lesson shows the Signal Room instead of the lives, because Roland's lives are English only.
- To remake a video (new screens, new script): the scripts are in `academy2/` in kit part 4 (`zubabot-kit-4-videos-<lang>.zip`, one per language, each holding `web/academy/<lang>/`: unzip them next to kit 1; the scripts are in the pt one); the steps are in `academy2/README-i18n.md`.

## 15. Funnel builder and automatic follow-ups (Admin → Funnels → "+ Funnel")
- **Builder, 3 steps with a live phone preview.** (1) Pick the type: welcome bot, auto-accept bot (channel join requests), or straight to the mini app. (2) Pick the bot, or paste a new BotFather token to connect it right there, plus the language and channel. (3) The messages: start from a template (classic, short, bonus, live) or a saved flow, edit, reorder, add buttons. The preview shows it as it will look in Telegram (Replay plays it with typing pauses). "Send me a test" sends the flow to your own Telegram. Create saves the bot, the flow and the funnel together, then shows the links and sub-IDs.
- Several bots can serve the same language. Every bot and funnel feeds the same users, AIs, inbox and stats. The old form is still there as "classic form".
- **Automatic follow-ups (per funnel, in the builder and in each funnel's Edit).** Settings: how often (30 min to 12 h, default every hour), who writes them (✨ their own AI, new words every time, or 📝 our set messages), who gets them (not in the app yet / no IQ Option account / not funded / funded but not trading), local hours (default 8–22 in the person's own time zone), stop after N days, and "mention the AI's live signal".
- With ✨, the person's own AI writes in their language and its own style. When a live signal is open, it says so ("Ama, it's me 👀 GBP/USD BUY lined up, entry in 4 min"); otherwise it talks about today's setups. Never invented results, never profit promises. One AI call per group (funnel + stage + AI + language + hour), personalised with each first name, so the cost stays low.
- They stop by themselves when the person trades (funded users who traded in the last 3 h are skipped), replies, or taps /stop. After 12 ignored reminders they slow to every 6 hours. The previous reminder is deleted when a new one comes.
- The **main switch** (Engine → Follow-ups on/off) always wins: off means no follow-ups from any funnel. A funnel without its own settings uses the main ones; its Edit says so and only saves its own settings once you change something.
- Limits (in `.env`, all optional): `UPLOADS_PER_DAY` (support pictures per person per day, default 20), `UPLOAD_KEEP_DAYS` (default 30, older pictures are deleted automatically), `VOICE_NOTES_PER_DAY` (voice notes transcribed per person per day, default 20).

# Change history

## 13 Oct 2026 (round 6): builder, follow-ups, safety checks
- Section 15 is new (funnel builder with preview, automatic AI follow-ups per funnel).
- Safety fixes from a full review: support pictures are checked byte by byte (real JPEG/PNG/WebP only), limited per person per day, kept 30 days; picture links are private (signed) and relative; voice notes have a daily limit and a download timeout; a voice note that can't be transcribed goes to the teammate when a human has the chat; headlines from the news feed are cleaned (no links, handles or instruction-like text); the follow-up hours and groups are validated.
- New env keys (optional): `UPLOADS_PER_DAY`, `UPLOAD_KEEP_DAYS`, `VOICE_NOTES_PER_DAY`.

## 13 Oct 2026 (round 5): languages, funnels, security, funnel mentors, AI check-ins
- Sections 11–13 above are new. First launch is English; the other languages can go live any time.
- New env keys (all optional): `SECURITY_CHAT_ID`, `AI_MODEL_TRANSLATE`, `WEB_DIR`. `BOT_USERNAME` and `MINIAPP_NAME` must match the main bot.
- Fixed: trades you place yourself showed an AI's name ("$100 with Kai"); they now show "your trade". A signal you edit (pair, direction or time) also counts as your trade.
- Training videos in Portuguese, Spanish, Taglish, French and Thai (section 14).
- The Telegram assistant now listens to voice notes (speech-to-text in the user's language via the same voice providers as calls) and answers them; when a teammate has taken over, the transcript goes to the team marked 🎤. If speech-to-text is down, it asks the user to resend or type.
- AI knowledge: new `server/knowledge/15-market-knowledge.md` (sessions, pairs, news, chart reading, options basics, money management, strict honesty: never invent prices, news, payouts or results; say "I don't know" instead). Every AI trader also gets its own texting habit and signature move on top of its energy.
- **Market news:** `server/news.js` pulls the economic calendar (high/medium-impact events this week: time, forecast, previous, actual) and forex headlines every few minutes, and every AI reply gets them. The AIs use only that feed for news and never invent events; if the feed is down they say so. Status: Admin → AI engine & voice → "Market news the AIs know". The server needs outbound internet to `nfs.faireconomy.media` and `www.fxstreet.com` (change with `NEWS_CALENDAR_URL` / `NEWS_RSS`).
- **Pictures to support in the app:** the support chat has a picture button. The assistant looks at the screenshot (error, deposit page, Real vs Practice) and explains the fix. A teammate sees the picture in Admin → Inbox (a private, signed link). Pictures are stored in `uploads/` next to the database (`UPLOAD_DIR`); include it in backups or clear it now and then.
- **Real account only:** trades, balance and deposit checks always use the IQ Option REAL balance. `window.ZB_DEMO = true` (testing only) now shows a red "TEST MODE" bar at the top of the app, so it can't stay on by accident after launch.
- English support team is now Emily, Noah, Olivia, Jake and Leah with photo portraits (`web/support/`); the assistant's default name is Emily (`SUPPORT_NAME`). If your live server saved "Ada" in Admin → Settings, change it there.
- Admin: funnels are grouped by language (each language's totals and its own funnels with sub-IDs); every page works on a phone; fixed a typo that stopped the admin from loading.
- New tests: `test/e2e-admin.cjs` (admin on phone and laptop: every tab, no errors, no sideways scroll), `test/multi.test.mjs` (funnels, bots, join requests, mentors, Spanish), `test/security.test.mjs`, `test/care.test.mjs`, browser `test/e2e-lang.cjs` (every language: no English, no Roland, local AIs, region switch).

## 13 Oct 2026 (round 4): deploy check, free period, call minutes, chart unlock
- **Free period** (section 6c): 3 months, then silent +6 months, then +6 more for active users. `users.free_until`, Admin → Settings → Free period.
- **Daily call minutes** (section 6): 60/day, 120 for MAX, 20 premium. Admin → AI engine & voice.
- **Chart reading for coins** (section 6b): unlock one AI for 1,500 coins; MAX = every AI.
- **Own AI server** option in AI engine (`SELF_AI_URL`), with Haiku 5.5 prices updated for the spend tracker.
- **Deploy check fixes:** team alert sign-in link crashed when a teammate connected Telegram (fixed + tested); hold-to-talk no longer breaks if you let go while the phone is still asking for mic permission; calls tapped before voice settings load still use the real voice; the old outside demo voice links are removed from the app; the Chats tab badge updates live; `.env` comments moved onto their own lines; the shipped `TELEGRAM_BOT_TOKEN` is empty; voice-server firewall now works with Docker, the GPU driver steps split at the reboot, the GPU build of onnxruntime is enforced and checked; `update.sh` uses your `PORT`; nightly backup cron line fixed; all optional `.env` keys documented.

## 13 Oct 2026 (round 3): own voice server, new admin, human transfer, sales engine, Chats tab
New server files: `settings.js` (live settings), `team.js` (roles, sign-in links, activity, alerts), `ai-engine.js` (AI companies + backup + budget + spend), `inbox.js` (support inbox + transfer to a human), `voice.js` (voice calls), `admin-api.js` (overview, members, broadcast, lives), `sales.js` (sales engine). New app layers: `zubabot-voice.js`, `zubabot-sales.js`, `zubabot-chats.js`. New folder `voice-server/`. `admin.html` rebuilt. All new database tables are added automatically; nothing existing changes. Update with `deploy/update.sh` as usual, then add the new keys you want (section 2, rows 14–17) and open Admin → Overview → Setup check.
Also: bot flows with templates + A/B tests, live-by-default real-data strategies (momentum / reversal / breakout) and on-demand “Find me a trade”, the IQ Option Play Store picture for “is it legit?”, and Telegram funnel (welcome screen, congrats → questions → one Launch CTA, stage-aware follow-ups, hourly nudges that replace the previous one), Telegram Business support, per-AI strategies (Random / Trend / Custom, many pairs, every AI active, outside signals by webhook), and full account facts for support and the AIs.
Also: Advanced mode is $500 again (the Advanced AIs need $500); talking AIs keep their real photo; "I already have IQ Option" now asks *opened it myself* (new account, different email) or *joined through Zubabot before* (invite code); live times now come from Admin → Lives.
### Already filled in (`server/.env` and `web/config.js`)
- **IQ Option OAuth:** client ID `459018691019837`, platform ID `578`, scope `full offline_access`. The client secret is in `server/.env` only. Never put it in the app or in git.
- **Affiliate:** `AFF_ID=743768`, `AFF_MODEL=revenue`. The sign-up link is `https://iqbroker.com/lp/regframe-01-light-nosocials/en/?aff=743768&aff_model=revenue&afftrack={afftrack}`.
- **Sub-ID:** every user is tagged `afftrack=Zubabot_tg<TelegramID>`. The server links the postback back to the Telegram user. It also accepts plain `tg<ID>`.
- **Keys:** `POSTBACK_KEY` and `ADMIN_KEY` are generated (in `.env`). Use the admin key to open `/admin`.
- **Unlock amount:** $20 (`MIN_DEPOSIT=20`).

### Changed in the code
- `web/zubabot-iq.js`: the platform ID comes from `window.ZB_IQ_PLATFORM` (578). It was 303 before.
- `server/server.js`:
  - `.env` loader: inline `# comments` are now stripped from values. Before this fix the secret would have been read with the comment attached.
  - `afftrack` uses the `AFF_TRACK_PREFIX` setting (default `Zubabot_`).
  - Postback matching accepts `Zubabot_tg123`.
  - Registration and FTD are de-duplicated per trader.
  - The amount can come in as `amount`, `deposit_amount` or `ftd_amount`.
- All server, strategy and OAuth e2e tests pass.

### Still to fill in
- `TELEGRAM_BOT_TOKEN` (from @BotFather).
- `ZB_BOT_APP` in `/opt/zubabot/web/config.js` (the real `t.me/<bot>/app` link).
- `TWELVEDATA_KEY` (optional, for forex scoring).
- **Redirect URI:** confirm with Ejiro that IQ Option registered **exactly** `https://app.zubabot.com/callback.html`. If they registered something else, change both `IQ_REDIRECT_URI` and `ZB_IQ_REDIRECT` to match.

### Affstore postbacks (Ejiro creates them in my.affstore.com after the server is live)
Create 4 postbacks, all **GET**, with Advertiser filter = IQ Option and no afftrack filter:

| Name | Event | Target URL ends with |
|---|---|---|
| Zubabot reg | Registration | `&event=reg` |
| Zubabot FTD | First deposit | `&event=ftd` |
| Zubabot depo | Deposit | `&event=deposit` |
| Zubabot withdraw | Withdrawal | `&event=withdrawal` |

The base URL is `https://api.zubabot.com/api/postback/affstore?key=<POSTBACK_KEY from .env>`.

Under "Additional parameters", turn on:
- **Trader ID** (`trader_id`). Required: without it the server rejects the postback.
- **Afftrack** (`afftrack`). Required.
- **Event ID** (`event_id`).
- On FTD and Deposit, the **amount** field.

Leave the parameter names as Affstore's defaults; the server reads them.

**Check after the first test sign-up:**
- `/admin` → Overview shows the registration.
- In the database, the `events` table has `afftrack = Zubabot_tg<ID>`.
- The user's app switches to *Account connected*.

If the trader ID or amount arrives under a different name, check the `raw` column in `events` and add the name to `pick(...)` in `handlePostback`.

### Test order
Run the phone tests in `LAUNCH.md` step 8, with `window.ZB_DEMO = true` first.

### New (12 Oct, evening): faster sign-up and in-app deposit (`web/zubabot-auto.js`)
- **No waiting after sign-up.** A brand-new account (tapped *Create account*, no real money on it) goes straight to *Account connected* and the deposit screen. The server keeps checking `/api/account/link` every 4 s in the background. If Affstore's registration postback never arrives within 15 min, the user is sent back to *This account isn't linked*. Accounts that already have real money are still checked properly before entry (up to 60 s).
- **Deposit opens inside the mini app** (same window, where the user is logged in from sign-up).
  - After paying, they close the window and reopen Zubabot. The app compares the balance before and after, and unlocks immediately.
  - "Open in my browser instead" stays as a fallback. `window.ZB_DEPOSIT_MODE = 'browser'` makes the browser the default.
  - **Phone-test this:** does IQ Option's payment page load and accept cards inside Telegram? Confirm the right cashier URL with Evgeny (`ZB_DEPOSIT_URL`; is iqoption.com or iqbroker.com better for Nigeria?).
- **Fixed:** instant unlock after a deposit used $50. It now uses $20 (`window.ZB_MIN_DEPOSIT`, default 20).
- **Test:** `test/e2e-fast.cjs` (run with `e2e-auto-server.mjs`).

### New (12 Oct, night): easier trading screens (`web/zubabot-room.js`, `web/zubabot-iq.js`)
- **Side menu → My trades** (New trade · Open · History). The Signal Room shows signals only, and an "open trades" bar appears on every screen.
- **New trade** has 4 steps: market (searchable list of OTC pairs) → time → amount → BUY / SELL.
- **Signal Room, first visit:** "Pick your AI trader" (Zara marked "Best for beginners"). After that, a simple AI sheet: one main AI plus on/off for the others.
- **30 sec timeframe:** placed as a 30-second **turbo** option, because digital options start at 1 min. Placement only accepts an exact 30 s expiry, otherwise the user sees "That timeframe isn't available on this pair right now". Phone-test this on demo: does IQ Option offer 30 s on OTC pairs for this account?
- The pair search lists 20 common OTC pairs. If IQ Option doesn't offer one, the user sees "This pair is closed right now".

### New (12 Oct, night): deposit funnel and simpler home (`web/zubabot-funnel.js`, built into zubabot.html)
- **New user:** a home tour (about 7 s, can be skipped), then "How do you want to trade?", then an amount screen, then IQ Option.
  - Copy signals: from $20.
  - Trade with AI: from $50.
  - Trade and talk to AI: from $100.
- **Gate:** Zara's own trading flow (`startTrade`) needs $50 or more in total. Below that, the home button says "See my signals" (Signal Room), and the Z button offers "Add $30".
- **Z button:** opens the same three choices.
- **Support:** the floating support face is gone. A headset icon in the home header opens the support assistant.
- **Home before deposit:** one card (steps, the chosen plan, "Fund $X to start", a real 24 h bonus timer stored in `S.bonusUntil`), blurred signals and Roland live.
- **Welcome bonus:** the server credits +500 coins (`WELCOME_BONUS`) on a first deposit of $20+ within 24 h of the user first opening the app (2 h grace). This is done in `creditRewards`.
- **Existing IQ Option accounts not made through Zubabot:** the user must create a new account with a **new email**. The connect screen says so up front, and the "not linked" screen gives 3 steps (create new → new email → log out of the old account first if IQ Option opens it). Earlier members still use invite codes.
- **Help while funding:** the amount sheet has a pinned "Questions before you fund? Chat · Call Zara" bar. After 15 s with no action, Zara pops up with Chat now / Call me.
- **Support before deposit:** answers the common questions (safety, amount, how to deposit, withdrawals, profit, bonus, not ready), then shows a **Fund $X now** card. That card goes straight to the IQ Option deposit (`depDetect` → in-app cashier). Typed questions are keyword-matched. Anything unknown says a teammate will reply. This is still scripted in the app, not connected to a live team inbox yet.

### New (12 Oct, late): white app and realistic AI traders (`web/zubabot-real.js`)
- The page background is white.
- All 24 AI traders have photoreal portraits (gold rim light). They're stored in `faces/photos.json` in the scratch build and embedded in `zubabot.html` at build time, about 250 KB.
- **AI cloud (`ZORB`):** a gold cloud breathes behind Zara on the home screen and in the deposit flow. It shakes when she "talks" (every few seconds, and in the speaking bubbles).
- The news AI previously also called "Zara" (key `zara`) is renamed **Zuri**, so there's only one Zara.
- **AI profiles and chat (`web/zubabot-aichat.js`):** tap any AI in the marketplace, or use Side menu → "Message your AIs", to open its profile: photo in its cloud, style, timeframe, markets, how it trades, and Message / Call buttons.
  - **Anyone can message any AI.** Replies are scripted in the app, keyword-matched per AI.
  - **Locked AIs** answer, then say "Unlock me and I'll start sending you my trades today", show how to get coins (deposit $1 = 10 coins, daily gift, Star Trader) and one button: Unlock me · X coins / Get X more coins / Fund $X to unlock me.
  - **Calls** are only for unlocked AIs.
  - Chat history is saved per AI in `S.aichat`.
- **30 more AI traders** (54 total), each with a photoreal portrait. The definitions are generated into `zubabot-real.js` at build time (`newai/list.json` in the scratch build).
  - Tiers: $100 / $200 / $500 / $1,000, plus Valentina and Zane, who are MAX only.
  - Categories feed the Star Trader team.
  - **For the Signal Room:** add any of these keys in `/admin` → Strategy → AIs. Keys: aria, dante, lina, marco, sana, tariq, elena, kofi, maya, viktor, imani, hugo, priya, felix, noor, bruno, chloe, rafael, yara, ken, leila, oscar, freya, malik, sofia, ivan, mei, arjun, valentina, zane.
- **AI chat fix:** "Get X more coins" and "Fund $X to unlock me" now open the deposit amount screen pre-filled with exactly what's needed. Before, they opened the general menu. Owned AIs no longer say "I cost 0 coins".
- **Calls go to the AI being called:** every unlocked AI can be called (Viza included), and the call screen shows that AI. The "real voice" demo link only shows for Zara, because she's the only live ElevenLabs agent so far. For real voices per AI, use one ElevenLabs agent with per-call overrides (name, persona, voice ID) sent from the app.
- **New Zara portrait.** The other options are in `faces_opts/` in the scratch build.
- **Lighter start (13 Oct):** the AI photos are no longer embedded in `zubabot.html`. They're 54 small files in `web/faces/` (about 325 KB in total), so **deploy the `faces/` folder** next to `zubabot.html`. The page went from 975 KB to 540 KB.
- **Start-up safety screen:** if the app hasn't drawn anything after 9 s, the user sees "Zubabot didn't start · Reload", plus the first error and the phone's browser. If testers report a launch problem, ask them for a screenshot of that screen.

### New (13 Oct): AI brain, training videos, mentors, AI of the week, Zubabot Pay

**Deploy these folders next to `zubabot.html`:** `faces/`, `mentors/`, `academy/`. Caddy already serves the whole `web/` folder.

### AI brain (`server/brain.js`): real replies for every AI trader and the support assistant
- Put `ANTHROPIC_API_KEY` in `server/.env` (console.anthropic.com).
  - With the key, AI chats and support go to `POST /api/ai/chat`.
  - Without it, the app keeps its scripted replies. Nothing breaks.
- Models:
  - `AI_MODEL=claude-haiku-5-5` for everyone.
  - `AI_MODEL_PRO` (Sonnet) for users with $100+ deposited.
- Daily caps: `AI_DAILY_FREE=40` and `AI_DAILY_PAID=300` messages.
- (Replaced 13 Oct: the training now lives in `server/knowledge/`, see the top of this file.)
  - It covers the app facts, the sales playbook (short texts "in breaks", one step forward each time, objection handling, upsell) and the rules: no profit promises, no repeated risk warnings, don't push people who can't afford it, 18+, never ask for passwords.
  - Each reply comes back as 1–4 short texts plus an optional CTA card: `fund`, `unlock`, `coins`, `signal`, `live` or `academy`.
  - Money facts (deposits) come from the server, not the app.
  - The playbook part is sent with prompt caching, so it's cheap.
- Admin: `GET /api/admin/ai-log` shows all AI conversations. Read it weekly and improve the playbook from real questions.
- Cost: see section 10 (about $0.0005 per message on Haiku 5.5).

### AI of the week + Top 5 (home screen)
- `GET /api/ai/leaderboard` ranks AIs by **real resolved live signals** (`signals.ai`, step 0, at least 5 signals).
  - AI of the week = best AI of last week, so it stays the same all week.
  - Top 5 = this week. The app shows only Pro and MAX AIs (min $1,000+).
- The demo uses placeholder numbers and says so on the card.

### Live schedule
- Lives at **10 AM, 3 PM, 6 PM and 10 PM WAT** (the `RT_SLOTS` code in the build).
- A session counts as "Live now" for 50 minutes.
- The opening screen now says "Top traders go live with you every day" (no name).
- `LIVE_URL` still needs Roland's real live link.

### Mentors
- Roland plus mentors with photos in `mentors/`: Drex, Xane, Jasmine (trainer), Sipho, Hannah, Otieno, Lerato, Diego.
- Names, roles and days are in `zubabot-plus.js` (section 1).
- Swap in real photos and schedules when the team is final.

### Training (side menu → Training videos, plus a home card)
- 8 lessons by Jasmine 🇺🇸, Sipho 🇿🇦 and Hannah 🇬🇧 (replaced 13 Oct: see the top of this file).
  - Audio is in `academy/*.mp3`, made with ElevenLabs v3 (natural laughs, throat-clearing, small slips).
  - Captions are timed from the audio.
- Each lesson ends with a "try it now" button (fund, pick AI, Signal Room, and so on).
- **IQ Option screen recordings:** when Ejiro sends the silent videos, put them in `academy/` and set this in `config.js`:
  `window.ZB_ACADEMY_VIDEOS = {deposit: 'academy/deposit.mp4', firsttrade: 'academy/firsttrade.mp4'}`
  The video plays muted under the trainer's voice, with the trainer in a small bubble.
  If a recording needs a new voice track, ask me and I'll make one that matches it.

### Coins and tokens: "Claim with a deposit" (best value) or "Buy with crypto"
- **Zubabot Pay (`server/pay.js`)** is our own crypto gateway. Payments go straight to our wallets.
  - Set `PAY_USDT_TRC20_ADDRESS` (Trust Wallet USDT TRC20) and `PAY_BTC_ADDRESS`.
  - `TRONGRID_KEY` is optional.
- Each invoice gets a **unique amount** (e.g. 25.137 USDT), so one address is enough.
  - A watcher checks TronGrid and mempool.space every 20 s and credits automatically.
  - It keeps watching late payments for 3 h.
- Packs: coins 80/$10, 220/$25, 500/$50; tokens 200/$10, 550/$25, 1,200/$50 (`PACKS` in `pay.js`).
  - Deposit stays the better deal ($1 = 10 coins).
- Admin endpoints:
  - `GET /api/admin/payments`
  - `POST /api/admin/payments/mark-paid {id, txid}` for someone who sent the wrong amount.
- The QR code uses `qrcode-generator` from cdnjs (loaded only on the payment screen).
- **Fixed:** coins and tokens spent in the app (unlocking AIs, voice minutes) were only taken off on the phone. The server balance overwrote them on the next sync, so spent coins came back. Spends now go to `POST /api/wallet/spend` straight away.

### Other fixes
- **Support chat:** closing the chat while support was "typing" threw an error. Fixed.
- **AI chat:** the quick buttons no longer include "Can I lose money?". The profile no longer says "Trading is risky". Risk is covered at sign-up and in the footer.
- **New tests:**
  - `test/brain-pay.test.mjs` (AI chat with a mock Claude API, leaderboard, USDT/BTC payment matching, wallet spend).
  - `test/e2e-brain.cjs` with `e2e-brain-server.mjs` (AI chat and support in the browser).
  - All older tests still pass.

### New (13 Oct, late): avatars, Star Trader look, new pulse mark, easier New trade (`web/zubabot-me.js`, `web/zubabot-room.js`)
- **24 semi-realistic 3D user avatars** in `web/avatars/`: 12 men (`m0–m11`) and 12 women (`w0–w11`). Styles include hijab, gele, cap, glasses, suit, kaftan and fila, braids and locs. **Deploy the `avatars/` folder.**
- **Star Trader look:** the user's own avatar gets a turning gold ring and a crown, and their name turns gold with a ★. It switches on automatically when `isStar()` is true.
- **New status mark:** the generic green "online" dot is now Zubabot's own mark: three small gold bars that pulse like live candles. It's used everywhere the dot was.
- **New trade:**
  - The amount field is a big, labelled box ("Type your amount") that opens the number keypad.
  - Quick amounts: $1, $5, $10, $25, $50, $100, $200 and Max.
  - BUY/SELL now sits in a bar that stays on screen above the menu, with a summary (pair, time, amount, about how much you'd win).
  - The tabs no longer wrap onto two lines, and the type is cleaner.
- **AI chat:** a new chat shows one big **Find me a trade** button above the typing box. Once the user sends a message, the button goes away and the normal quick replies come back.
  - An unlocked AI answers with its next signal card, or with "Open the Signal Room" if it has nothing yet.
  - A locked AI answers with its unlock card.
- **Mode crests:** custom drawn crests replace the star and crown icons for Starter, Standard, Advanced, Pro and MAX (`TMARK()` in the build). They're used in the mode pills, the AI tags, the "Pro & MAX" / "MAX only" labels and the lock buttons.
  - The crest is a faceted hexagon. The rising bars grow with each mode, Pro gets a gold crown on black, and MAX is solid gold with the Z bolt.
  - The MAX pill is now gold with a moving shine instead of the pink/purple gradient.
