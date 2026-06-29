# 🍷 Wine Tasting Companion

A consumer sommelier-style tasting *game*. You order a bottle at a restaurant,
find the spot in the app, tap the wine you ordered, and play a guided tasting:
mark what you smell and taste, then the app reveals the wine's real profile and
scores you — *"Actually, there was plum in that."* It remembers every wine in
your **cellar**, gives you **awards & levels** (like the Top O' Mac beer club),
and lets you **share** your scorecard with friends.

Built with the Luminous Reef design philosophy: calm, glanceable, candlelit
wine-bar feel.

## Status — v1 (solo + shareable)
- ✅ Restaurant → wine list → guided tasting game → scored reveal
- ✅ Saved tasting history ("My Cellar") + personal notes per wine
- ✅ Rewards: tier ladder + per-tasting awards/ribbons + collector badges
- ✅ Share a scorecard (Web Share API + auto-generated image, clipboard fallback)
- ✅ Installable PWA, works offline
- ⏳ **Data:** real Nashville restaurants + real, source-cited bottles
  (no placeholder wines — see Data Integrity)
- 🔜 Live group/multiplayer mode (chosen as the *next* phase, not v1)

## Data integrity (important)
Every wine in `data/wines.js` is a **real bottle** and every tasting attribute is
**extracted from a real published source** (winery sheet / critic / retailer /
aggregator), with `source.url` kept on each wine. The app **fails loud** (shows a
"being prepared" banner) rather than ever shipping made-up wines.

## The tasting chart is data-driven
The whole game is generated from `data/tasting-schema.js` (currently a WSET-style
placeholder). When Amy sends screenshots of her sommelier practice chart, we edit
**only that file** — no app rewrite — and her exact questions become the game.

## Run it
No build step. Either:
- **Quick test:** open `index.html` in a browser (history saves locally; PWA
  install / offline need a server).
- **Phone-ready:** serve the folder and open on your phone:
  ```bash
  cd ~/Projects/wine-tasting-companion
  python3 -m http.server 8799
  # then visit http://<your-mac-ip>:8799  (or tunnel with ngrok)
  ```

## Files
```
index.html              shell
styles.css              Luminous Reef theme (Cormorant + Mulish)
app.js                  engine: routing, scoring, history, rewards, sharing
data/tasting-schema.js  the blind-tasting chart (swap in Amy's chart here)
data/wines.js           REAL restaurants + sourced wines
data/rewards.js         levels / awards / badges
sw.js, manifest.webmanifest, icons/   PWA bits
```
