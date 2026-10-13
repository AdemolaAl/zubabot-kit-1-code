# Zubabot × IQ Option integration

What this does, end to end:

1. **Connect.** The user taps *Create my free IQ Option account* or *Log in* in the mini app. IQ Option's own page opens, with our affiliate tag on the link. They sign up or log in, tap Allow, and come back.
2. **Detect.** The app connects to IQ Option from the user's phone and reads their IQ Option user ID. The server checks that the account is ours (affiliate link, imported list, or invite code).
3. **Deposit.** The app sees the real balance go up straight away. Rewards (coins and tokens) are credited **only** when the Affstore deposit postback confirms the deposit.
4. **Trade.** Approved trades are placed with the official SDK from the user's phone, which uses their own IP, as IQ Option asked.

```
integration/
  server/server.js      backend (Node 22.13+, zero npm dependencies, SQLite built in)
  server/.env.example   all settings
  web/zubabot-iq.js     browser module for the mini app (wraps the official SDK)
  web/callback.html     OAuth return page
  test/test.mjs         server tests (mock IQ Option + signed Telegram data) → `node test/test.mjs`
  test/client.*         browser test of zubabot-iq.js against a mock SDK
```

Official SDK: https://github.com/quadcode/client-sdk-js (`@quadcode-tech/client-sdk-js`, v1.3.26 checked)

---

## 1. What you need from Evgeny or IQ Option

| Item | Where it goes |
|---|---|
| Client ID and client secret (emailed after the Google form) | `IQ_CLIENT_ID`, `IQ_CLIENT_SECRET` |
| Redirect URI you registered in the form: **`https://app.zubabot.com/callback.html`** | `IQ_REDIRECT_URI`. Must match the registered value character for character |
| Our affiliate ID for the OAuth link (and `aff_model` if they use one) | `AFF_ID`, `AFF_MODEL` |
| Confirmation that new sign-ups through OAuth with `aff` + `afftrack` are credited to us on Affstore | — |
| A test account or demo access | for testing |

Connection details Evgeny already sent: `wss://iqoption.com/echo/websocket`, `https://api.iqoption.com`, platform ID **303**. These are already set in `web/zubabot-iq.js`.

> In the form, list the redirect URI exactly as above. If you host the app on a different domain, change it everywhere: the form, `.env` and `web/zubabot-iq.js`.

---

## 2. Run the backend

```bash
cd server
cp .env.example .env     # fill it in
node server.js           # Node 22.13 or newer. No npm install needed.
```

Put it behind HTTPS at `https://api.zubabot.com` (nginx/Caddy, or any VPS or PaaS). It stores everything in `zubabot.db` (SQLite), so **back that file up**. It holds the refresh tokens.

Health check: `GET https://api.zubabot.com/api/health`

Run the tests first: `node test/test.mjs` should print `ALL TESTS PASSED`.

---

## 3. Affstore postback (registrations and deposits)

In Affstore, add a postback for **registration, FTD, deposit and withdrawal** events:

```
https://api.zubabot.com/api/postback/affstore?key=POSTBACK_KEY&event={event}&user_id={trader_id}&afftrack={afftrack}&amount={amount}&currency={currency}&tid={transaction_id}
```

Replace the `{…}` parts with Affstore's real macro names. The server accepts common aliases: `user_id|trader_id|uid`, `afftrack|sub_id|subid|sub1|aff_sub`, `event|type|status|goal`, `amount|sum|deposit`, `tid|transaction_id|id`. Duplicate events, matched by `tid`, are ignored.

How we know who registered: when the server builds the IQ Option link, it adds `afftrack=tg<TelegramUserId>`. Affstore sends that back in the registration postback, so a brand-new sign-up is linked to the right Telegram user automatically. The app waits up to about 90 seconds for this postback.

---

## 4. Existing members (registered with our link before)

**Automatic (preferred).** Export their IQ Option IDs from Affstore stats and import them once:

```bash
curl -X POST https://api.zubabot.com/api/admin/import-accounts \
  -H "X-Admin-Key: ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"csv":"196641001,196641002,196641003"}'
```

They then just tap *Log in* and are recognised.

**Invite codes (backup).** These are for anyone who doesn't match. Codes are single use. Optionally, bind a code to one IQ Option ID:

```bash
curl -X POST https://api.zubabot.com/api/admin/invites -H "X-Admin-Key: ADMIN_KEY" \
  -H "Content-Type: application/json" -d '{"count":20,"note":"old members"}'
# or one code per known id:  -d '{"iqUserIds":["196641001","196641002"]}'
```

Stats: `GET /api/admin/stats` with the same header.

---

## 5. Wire up the mini app

Host `web/zubabot-iq.js` and `web/callback.html` on the mini app domain. `callback.html` sits next to the app at `/callback.html`. In the app:

```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script>window.ZB_API='https://api.zubabot.com'; window.ZB_IQ_CLIENT_ID='YOUR_CLIENT_ID';</script>
<script type="module">
  import * as IQ from './zubabot-iq.js';

  // Step 1 buttons
  createBtn.onclick = () => IQ.startConnect('new');    // "Create my free IQ Option account"
  loginBtn.onclick  = () => IQ.startConnect('login');  // "I registered with Zubabot's link · Log in"

  // When the app reopens with ?connected=1 (after callback.html)
  if (new URLSearchParams(location.search).get('connected')) {
    const r = await IQ.detectAccount();
    // r.linked === true          → show "Account connected 🎉" (r.iqUserId, r.firstName)
    // r.linked === false         → show "This account isn't linked to Zubabot" (create new / invite code)
    // r.state.activated          → deposit already confirmed
  }

  // Invite code screen
  await IQ.redeemInvite('ZB-7Q4K-21');  // then IQ.startConnect('login')

  // Deposit screen: instant UI feedback (rewards still come from the server)
  IQ.watchDeposits(({amount}) => showDepositLanded(amount));
  const s = await IQ.me();              // s.rewards.coins / tokens, s.activated

  // Approve-trade button
  const t = await IQ.placeTrade({pair: 'EUR/USD', direction: 'buy', amount: 10, minutes: 1});
  IQ.onTradeClosed(({id, win, profit}) => showResult(id, win, profit));
</script>
```

The SDK is loaded from jsDelivr by default. If you bundle with Vite or webpack, run `npm i @quadcode-tech/client-sdk-js` and set `window.ZB_SDK_URL` (or change `sdkUrl` in the file).

---

## 6. Things to test on a real phone (in this order)

1. **Login inside Telegram.** Tap Create or Log in. Does IQ Option's page open and come back to `callback.html`, then into the app with `?connected=1`?
   - If you lose the Telegram session when returning, open the login in the phone's browser instead with `IQ.startConnect(kind, {external:true})`. `callback.html` then sends the user back to the bot with `t.me/zubabot/app?startapp=connected`.
   - "Continue with Google" is usually blocked inside Telegram's browser. Email sign-up works. If many users need Google, use `external:true`.
2. **Account detection.** `detectAccount()` returns the right IQ Option user ID.
3. **Affiliate tag.** Sign up a fresh test account and check it appears under our Affstore account, with the registration postback arriving and `afftrack=tg…`.
4. **Deposit.** Make a small real deposit. The balance updates in the app, the deposit postback arrives, and `/api/me` shows `activated: true` plus coins.
5. **Trade.** Place a 1-minute trade on the **demo balance first**. Set `window.ZB_DEMO = true` before loading the module to use the demo balance while testing. Check the result callback.
   - Confirm whether the closed position's `closeProfit` is the full payout (stake + profit) or the net profit, then adjust `onTradeClosed` if needed.
6. **Token refresh.** Leave the app for over an hour and come back. It should reconnect without asking the user to log in again.

---

## 7. Security notes

- `IQ_CLIENT_SECRET` and refresh tokens never leave the server. The app only gets short-lived access tokens from `/api/oauth/token`.
- Every app request is verified with Telegram's signed `initData` (bot token HMAC, valid for 24h). `DEV_FAKE_TG=1` skips this, so use it **only** locally.
- One IQ Option account can be linked to only one Telegram user.
- **Anti-farming.** Rewards count only *net new money* (deposits minus withdrawals) above the best level already rewarded. Withdrawing and redepositing earns nothing and marks the user `flagged` for review, which supports the ban rule.
- The IQ Option user ID is reported by the app after it connects. Accounts that came through our affiliate postback (with `afftrack`) are verified by the server. Imported IDs and invite codes rely on that report. If you want server-side proof as well, ask Evgeny whether the server may make a single profile check with the user's access token. He asked us to keep trading traffic on users' own devices.
