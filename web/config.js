/* ===== ZUBABOT CONFIG — the only file Ademola needs to edit ===== */
window.ZB_API = 'https://api.zubabot.com';                          // your server ('' = run the demo)
window.ZB_IQ_CLIENT_ID = '459018691019837';                         // IQ Option OAuth client ID ('' = manual mode). Public, safe in the app.
window.ZB_IQ_PLATFORM = 578;                                        // platform ID IQ Option assigned to Zubabot
window.ZB_IQ_REDIRECT = 'https://app.zubabot.com/callback.html';    // must match the redirect URI registered with IQ Option
window.ZB_BOT_APP = 'https://t.me/zubabot/app';                     // your bot's mini app link (used if login opened outside Telegram)
window.ZB_DEPOSIT_URL = 'https://iqoption.com/traderoom';           // where deposits happen
// window.ZB_DEPOSIT_MODE = 'browser';                             // default: deposit opens inside the mini app. 'browser' = separate browser window
window.ZB_TRADE_URL = 'https://iqoption.com/traderoom';             // manual mode only
// window.ZB_SDK_URL = '';                                          // optional: self-hosted copy of @quadcode-tech/client-sdk-js
// window.ZB_DEMO = true;                                           // testing: trade on the IQ Option DEMO balance instead of real
window.ZB_LIVE_URL = 'https://t.me/';                               // Roland's live room link (Telegram/YouTube live) used by every 'Join the live' button
