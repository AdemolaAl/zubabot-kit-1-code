ZUBABOT LANDING PAGES (3 concepts)
==================================

Files
  zubabot-lp1-k7q2.html   LP1 "Gold field"  - full yellow field, AI faces orbiting Zara, BUY/SELL cards popping, crossing signal tapes
  zubabot-lp2-m4x9.html   LP2 "Live room"   - dark ink, phone looping real app screens, countdown to the next live with Roland (10am/3pm/6pm/10pm WAT)
  zubabot-lp3-p8d3.html   LP3 "Pick your AI" - warm paper, swipeable auto-scrolling wall of AI traders, "Zara is ready" reveal, example signals
  img/                    images used by the pages (keep this folder next to the HTML files)
  shots/                  QA screenshots (not needed for upload)

Upload: put the 3 HTML files + the img/ folder in the same directory on your host.
The 4-letter suffix in each file name is a cache-buster; rename it when you change a page.

CONFIG (top of every page, inside <head>):
  window.ZUBA = { telegram: "https://t.me/zubabot?start=lp1", offerEnds: null, slots: 0 };
  - telegram : where every button goes (lp1 / lp2 / lp3 start parameter per page)
  - offerEnds: null -> the big countdown counts to the NEXT LIVE with Roland, our lead mentor
                       (10:00, 15:00, 18:00, 22:00 WAT, UTC+1): "Next live with Roland starts in".
                       For 50 minutes after each start it shows "LIVE NOW with Roland · ends in".
               "2026-12-01T23:59:00+01:00" -> counts to that real date: "Free 3 months offer ends in"
                       (shows DAYS / HRS / MIN when more than 24h away). LP2 keeps the live countdown
                       as its main clock and shows the offer end date under the button.
                       After the date passes, pages fall back to the live countdown.
  - slots    : 0 = hidden (default). Set a real number (e.g. 25) to show "25 spots left".
               It never changes on its own - update it by hand.
  No fake/rolling timers and no automatic scarcity: every number shown is real.

PIXELS: paste your Meta Pixel and TikTok pixel code where it says
  <!-- paste Meta Pixel / TikTok pixel here -->
Every button tap fires:  fbq('track','Lead',{content_name:'LP1'|'LP2'|'LP3'})  and  ttq.track('ClickButton')

LP2 live times are computed in West Africa Time (UTC+1): 10:00, 15:00, 18:00, 22:00.
Fonts: Bricolage Grotesque, Plus Jakarta Sans, JetBrains Mono (Google Fonts).
Motion uses transform/opacity only and switches off for users with "reduce motion" turned on.
