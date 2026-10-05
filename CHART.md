# Atlas Desk · Pulse24 Chart

Our own trader chart on **Atlas Desk** — Binance public klines + Pulse24 overlays.  
Not a TradingView UI clone.

## Open

**Production (Vercel):** https://trading-dashboard-swart-psi.vercel.app/#chart

Local (box): `python3 server.py` → `http://127.0.0.1:8765/#chart`

## What you see

| Control | Options |
|--------|---------|
| Symbol | BTCUSDT / ETHUSDT |
| Timeframe | 5m · 15m · 1H · 4H |
| Readout | Crosshair OHLC + % |

Overlays: 4H bias pill, rolling 8h UTC bucket H/L + PDH/PDL, sweep price + marker, 15m BOS/IFVG + EQ/FVG, 5m entry / stop / TP1–TP3.

## Data sources (Vercel serverless, `api/`)

| Endpoint | Source |
|----------|--------|
| `/api/klines?symbol=&interval=&limit=` | Binance Vision proxy (`data-api.binance.vision`) |
| `/api/dashboard` | latest `dashboard-data.json` on GitHub `main` (fallback: bundled copy) |
| `/api/pulse24/overlays` | latest `pulse24-overlays.json` on GitHub `main` (fallback: bundled copy) |

Routines only need to push `dashboard-data.json` and `pulse24-overlays.json` to `main` — no redeploy needed.
Candles fall back to Binance direct (CORS `*`) in the browser if the proxy is unavailable.
If overlays lack levels, the client computes bucket H/L + PDH/PDL from 1h bars.

## Library

[lightweight-charts](https://github.com/tradingview/lightweight-charts) v4 via unpkg CDN — open-source charting library only (not the TradingView product UI).

## Refresh

- Chart candles/overlays: every **60s** while the Chart view is open, plus **Opdater**
- Desk metrics: every **5 min**
