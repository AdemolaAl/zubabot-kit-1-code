# Zubabot: launch checklist

The app runs in **automatic mode**: users connect IQ Option once, approve each trade with one tap, and the trade is placed in their IQ Option account. Martingale steps are placed automatically. The balance shown is their real IQ Option balance.

If the OAuth keys are ever missing, the same files run in **manual mode** (users place trades on IQ Option themselves). It's the same launch steps with `ZB_IQ_CLIENT_ID` left empty.

## How it works

| Step | What the user sees | What happens behind it |
|---|---|---|
| Connect | *Create my free IQ Option account* or *Log in*. IQ Option's page opens, they sign up or log in, tap Allow, and come back | The OAuth link carries our `aff` ID and `afftrack=tg<TelegramID>`. The server swaps the code for tokens (the secret stays on the server). The app connects to IQ Option from the user's phone and reads their IQ Option user ID. |
| Account check | *Account connected 🎉* or *This account isn't linked to Zubabot* | Allowed if: Affstore's registration postback matched (new sign-ups), **or** the ID is in your imported list (earlier members), **or** they used an invite code. For brand-new sign-ups the app waits up to 2 minutes for the postback. |
| Deposit | Pick amount → *Continue to IQ Option* → pay | The app sees the real balance go up **instantly** and unlocks trading. Coins and tokens are credited when Affstore's deposit postback confirms it. |
| Trade | Zara shows a setup → amount → **Place $10 buy on IQ Option** | Placed straight away via the official SDK as a turbo option (1 min), from the user's phone and IP. The result comes from IQ Option's closed position. |
| Martingale | Trade lost → *Martingale step 1 placed on IQ Option: $22* | Placed automatically, using their ladder (default 3 steps × 2.2). It stops early if the balance can't cover the next step. |
| Strategy | — | `/admin` → Test → Results → Live (see step 7). |
| **Signal Room** (Signals tab) | Live feed of OTC signals. Each one shows entry time + auto-gale times **in the user's local time** (they pick their country). They choose pair, BUY/SELL, timeframe (1/5/15 min), amount and auto-gale steps (default 3, 0–5), and which AIs post to them | Signals come from the strategy engine, each posted by an AI with its own timeframe. Trades are **digital options**, placed through the SDK. "At entry" schedules the trade for the exact entry time. Auto-gale steps are placed automatically after a loss, and there's a **Stop auto-gale** button during the chain. OTC signals are scored by the first trade that copied them exactly (same pair, direction, timeframe), or by you in `/admin`. |
| Unlock amount | **$20**, the CPA qualifying FTD | `MIN_DEPOSIT=20` in `.env`. The app's tiers start at $20 (Starter). Voice still needs $100+. |

---

## Checklist

### 1. Server: about 30–60 minutes
1. Rent a small VPS: Ubuntu 24.04, 2 GB RAM.
2. Add DNS **A records** for `app.zubabot.com`, `api.zubabot.com`, `zubabot.com` and `www.zubabot.com`, all pointing at the server's IP (the last two serve the website and landing pages from `site/`).
3. On the server:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs sqlite3
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update && sudo apt install -y caddy

   sudo useradd -r -s /bin/false zubabot
   cd ~/zubabot-kit                 # the folder where you unzipped the kit (it has server/, web/, site/ ...)
   sudo mkdir -p /opt/zubabot && sudo cp -r server web site deploy tools /opt/zubabot/ && sudo chown -R zubabot /opt/zubabot
   cd /opt/zubabot/server && sudo nano .env     # step 2: IQ keys are already in; add the rest
   node --version   # 22.13 or newer

   sudo cp /opt/zubabot/deploy/zubabot.service /etc/systemd/system/ && sudo systemctl enable --now zubabot
   sudo cp /opt/zubabot/deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
   sudo chmod 600 /opt/zubabot/server/.env && sudo chown zubabot /opt/zubabot/server/.env
   sudo bash -c '(crontab -l 2>/dev/null; echo "0 3 * * * /opt/zubabot/deploy/backup.sh") | crontab -'   # nightly backup
   ```
4. Check that these open:
   - `https://api.zubabot.com/api/health`
   - `https://app.zubabot.com`
   - `https://api.zubabot.com/admin`

### 2. Server settings (`server/.env`)
| Key | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `IQ_CLIENT_ID`, `IQ_CLIENT_SECRET`, `IQ_PLATFORM_ID` | **Already filled in** (`server/.env`): client 459018691019837, platform 578. **The secret stays on the server only.** |
| `IQ_REDIRECT_URI` | `https://app.zubabot.com/callback.html`. It must match, character for character, what IQ Option registered. |
| `AFF_ID`, `AFF_MODEL`, `AFF_LINK` | **Already filled in**: aff 743768, model revenue, and your iqbroker.com sign-up link with `{afftrack}` (`AFF_LINK` is only used in manual mode). Each sign-up is tagged `afftrack=Zubabot_tg<TelegramID>`. |
| `POSTBACK_KEY`, `ADMIN_KEY` | **Already generated** in the kit's `.env`. To make new ones: `openssl rand -hex 24` |
| `ALLOW_ORIGIN` | `https://app.zubabot.com` |
| `TWELVEDATA_KEY` | Free key from twelvedata.com, for forex trend + signal scoring. Crypto uses Binance (no key). |
| `REQUIRE_LINK` | `1` |

Restart after editing: `sudo systemctl restart zubabot`

### 3. App settings (`/opt/zubabot/web/config.js` on the server): the only app file to edit
```js
window.ZB_API = 'https://api.zubabot.com';
window.ZB_IQ_CLIENT_ID = '459018691019837';                        // already set: automatic trading is on
window.ZB_IQ_PLATFORM = 578;                                       // already set
window.ZB_IQ_REDIRECT = 'https://app.zubabot.com/callback.html';   // same as IQ_REDIRECT_URI
window.ZB_BOT_APP = 'https://t.me/<yourbot>/app';
// window.ZB_DEMO = true;   // ← turn this on for the first tests: trades go to the IQ Option DEMO balance
```

### 4. Telegram bot: 10 minutes
In @BotFather:
- *Menu Button* → `https://app.zubabot.com`
- `/newapp` → app link `t.me/<yourbot>/app`. Put this in `ZB_BOT_APP` and use it in the ads.

### 5. Affstore postback: 15 minutes
Follow **"Affstore postbacks"** in `START-HERE-ADEMOLA.md` (4 GET postbacks, Affstore's default parameter names). **Amounts must arrive in USD**: confirm with Affstore/Evgeny. The sub-ID Affstore sends back must be the same `afftrack` we put in the OAuth link (`Zubabot_tg123456`; plain `tg123456` also works).

### 6. Earlier members
In `/admin` → Members:
- Paste their IQ Option IDs into **Import earlier members**. They then just tap *Log in*.
- Create **invite codes** for anyone who doesn't match.

### 7. Strategy lab
`/admin` → **Strategy**:
1. Set pairs, trend bias, timing and martingale. Add your team's Telegram IDs under **Testers**.
2. **Test** mode: only testers see signals. Every signal is scored against the real price.
3. Check **Results**: win rate, martingale recovery per step, chains lost, simulated P/L, drawdown.
4. Tune → **Clear test data** → repeat. When happy, switch to **Live**.

Overview also shows **real trades placed through the app** (count, volume, W/L).

Twelve Data's free plan only covers light forex testing. Test on BTC/ETH (Binance, unlimited), or upgrade.

### 7b. Signal Room settings (`/admin` → Strategy)
- **AIs posting signals:** add or remove AIs and set each one's timeframe (default: Viza 1 min, Zara 5, Mira 5, Blaze 1, Remi 15). The key must match the app's AI names (`viza`, `luna` = Zara, `mira`, `blaze`, `remi`, `kai`, …).
- **Entry lead time:** default 40 s, on a full minute. This gives users time to open the ticket.
- **Option type:** Digital.
- **Pairs:** OTC, price source **Manual**. OTC prices only exist inside IQ Option, so the strategy lab gets OTC results from testers' real (demo) trades that copied the signal. Mark any leftovers W/L in the Signals tab. If Evgeny allows one server connection, a price feed from an admin IQ Option account can be added later for fully automatic scoring.

### 8. Phone tests, in this order (with `ZB_DEMO = true` first)
1. **Connect.** Create an account inside Telegram. Does IQ Option's page open and come back to *Account connected*?
   - Email sign-up should work. "Continue with Google" is often blocked inside Telegram's browser.
2. **Affiliate.** Does the new account appear under your Affstore account with the registration postback (`afftrack=tg…`)?
3. **Log in** with an account **not** from your link. You should see *This account isn't linked to Zubabot*.
4. **Trade on demo.** Place a $1 trade (main flow), then one from the **Signal Room** (digital OTC, 1 min).
   - Does it appear on IQ Option?
   - Does the result show in the app when it closes?
   - Does a loss trigger martingale step 1 automatically?
   - Signal Room: does *Place at 14:32* fire on time? Does *Stop auto-gale* stop the chain? Do OTC names match (the app looks for e.g. `EURUSD-OTC`)?
5. **Check profit.** Compare one result with IQ Option's history. The code assumes the closed position's `closeProfit` is the full payout (stake + profit). If IQ Option reports net profit instead, change one line in `onTradeClosed` in `web/zubabot-iq.js`.
6. **Deposit.** Make a small real deposit.
   - Does the app unlock straight away?
   - Do coins arrive after the postback?
7. **Go real.** Remove `ZB_DEMO`, then place a $1 real trade.
8. **Token refresh.** Leave the app for over an hour. It should reconnect without asking to log in again.

---

## Files
| File | What it is |
|---|---|
| `web/zubabot.html` | The mini app (manual + automatic modes built in) |
| `web/config.js` | App settings |
| `web/callback.html` | IQ Option login return page |
| `web/zubabot-iq.js` | IQ Option connection: login, account, balance, placing trades, results |
| `server/server.js`, `server/strategy.js` | API, account checks, postbacks, rewards, strategy engine |
| `server/admin.html` | Admin panel at `/admin` |
| `deploy/` | Caddy (HTTPS), systemd service, daily database backup |
| `test/` | 10 test files, see START-HERE section 9 (all pass) |
