const RAW = "https://raw.githubusercontent.com/simonhansen654/trading-dashboard/main/";

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(typeof obj === "string" ? obj : JSON.stringify(obj));
}

function preflight(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.end();
    return true;
  }
  if (req.method !== "GET") {
    send(res, 405, { error: "method not allowed" });
    return true;
  }
  return false;
}

// Latest synced JSON from GitHub main (routines push there), fallback to bundled copy.
async function latestJson(file, bundled) {
  try {
    const r = await fetch(RAW + file + "?ts=" + Date.now(), {
      headers: { "User-Agent": "AtlasDesk/1.0", "Cache-Control": "no-cache" },
    });
    if (r.ok) return await r.json();
  } catch (_) {}
  return bundled();
}

module.exports = { send, preflight, latestJson };
