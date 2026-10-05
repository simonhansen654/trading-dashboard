const { send, preflight } = require("./_util");

const BINANCE = "https://data-api.binance.vision/api/v3/klines";
const ALLOWED_SYM = new Set(["BTCUSDT", "ETHUSDT"]);
const ALLOWED_IV = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  const q = new URL(req.url, "http://x").searchParams;
  const sym = (q.get("symbol") || "BTCUSDT").toUpperCase();
  const iv = q.get("interval") || "15m";
  let lim = parseInt(q.get("limit") || "300", 10);
  if (!Number.isFinite(lim)) lim = 300;
  lim = Math.max(1, Math.min(lim, 1000));
  if (!ALLOWED_SYM.has(sym) || !ALLOWED_IV.has(iv)) {
    return send(res, 400, { error: "symbol/interval not allowed" });
  }
  try {
    const r = await fetch(`${BINANCE}?symbol=${sym}&interval=${iv}&limit=${lim}`, {
      headers: { "User-Agent": "AtlasDesk/1.0" },
    });
    if (!r.ok) return send(res, 502, { error: `binance HTTP ${r.status}` });
    const raw = await r.json();
    const candles = raw.map((row) => ({
      time: Math.floor(row[0] / 1000),
      open: +row[1],
      high: +row[2],
      low: +row[3],
      close: +row[4],
      volume: +row[5],
    }));
    return send(res, 200, candles);
  } catch (e) {
    return send(res, 500, { error: String(e.message || e) });
  }
};
