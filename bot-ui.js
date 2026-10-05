/* —— Crypto bot (TJR) kill-switch —— */
const BOT_LS_KEY = "atlas_crypto_tjr";
const BOT_API = "/api/bot";
const BOT_GH_RAW =
  "https://raw.githubusercontent.com/simonhansen654/trading-dashboard/main/bot-control.json";

function botShortTime(iso) {
  if (!iso) return "—";
  const m = String(iso).match(/T(\d{2}:\d{2}(?::\d{2})?)/);
  return m ? m[1] : String(iso);
}

function applyBotUi(ctrl, extra = {}) {
  const on = !!ctrl.crypto_tjr;
  const toggle = $("bot-toggle");
  const state = $("bot-state");
  const pill = $("bot-pill");
  const status = $("bot-status");
  const updated = $("bot-updated");
  const persist = $("bot-persist");
  if (toggle && document.activeElement !== toggle) toggle.checked = on;
  if (state) {
    state.textContent = on ? "ON" : "OFF";
    state.className = "bot-state " + (on ? "on" : "off");
  }
  if (pill) {
    pill.textContent = on ? "Kører" : "Stoppet";
    pill.className = "bot-pill " + (on ? "on" : "off");
  }
  if (status) {
    status.textContent = on
      ? "Tillader nye paper-entries (BTC/ETH TJR 24/7)"
      : "Ingen nye crypto-entries (Pulse24 + TJR)";
  }
  if (updated) {
    const by = ctrl.updated_by ? ` · ${ctrl.updated_by}` : "";
    updated.textContent = ctrl.updated_at
      ? `${botShortTime(ctrl.updated_at)}${by}`
      : "—";
    updated.title = ctrl.updated_at || "";
  }
  if (persist) {
    if (extra.message) persist.textContent = extra.message;
    else if (extra.persisted === true) persist.textContent = "GitHub synket";
    else if (extra.persisted === false)
      persist.textContent = "Kun browser — venter på agent-sync";
    else persist.textContent = "Server / GitHub";
  }
  try {
    localStorage.setItem(BOT_LS_KEY, on ? "1" : "0");
  } catch (_) {}
}

function setBotLastScan(data) {
  const el = $("bot-last-scan");
  if (!el) return;
  const scan =
    data?.pulse24?.last_scan_et ||
    data?.crypto?.last_scan_et ||
    data?.status?.last_crypto_scan_et ||
    null;
  el.textContent = scan || "—";
}

async function fetchBotControl() {
  try {
    const r = await fetch(BOT_API + "?ts=" + Date.now(), { cache: "no-store" });
    if (r.ok) return await r.json();
  } catch (_) {}
  try {
    const r = await fetch(BOT_GH_RAW + "?ts=" + Date.now(), { cache: "no-store" });
    if (r.ok) return await r.json();
  } catch (_) {}
  let ls = null;
  try {
    ls = localStorage.getItem(BOT_LS_KEY);
  } catch (_) {}
  if (ls === "0" || ls === "1") {
    return {
      crypto_tjr: ls === "1",
      updated_at: null,
      updated_by: "localStorage",
      note: "offline fallback",
    };
  }
  return { crypto_tjr: true, updated_by: "default" };
}

async function loadBot() {
  try {
    const ctrl = await fetchBotControl();
    applyBotUi(ctrl);
  } catch (e) {
    if ($("bot-status"))
      $("bot-status").textContent = "Kunne ikke hente bot-status: " + e.message;
  }
}

async function setBotEnabled(on) {
  const toggle = $("bot-toggle");
  if (toggle) toggle.disabled = true;
  applyBotUi(
    { crypto_tjr: on, updated_at: new Date().toISOString(), updated_by: "ui" },
    { persisted: false, message: "Gemmer…" }
  );
  try {
    const r = await fetch(BOT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ crypto_tjr: on, updated_by: "ui" }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    applyBotUi(data, {
      persisted: !!data.persisted,
      message: data.message || (data.persisted ? "GitHub synket" : "Browser only"),
    });
  } catch (e) {
    applyBotUi(
      { crypto_tjr: on, updated_at: new Date().toISOString(), updated_by: "ui" },
      {
        persisted: false,
        message:
          "Gemt i browser — API fejl (" +
          e.message +
          "). Trading synker ved næste run.",
      }
    );
  } finally {
    if (toggle) toggle.disabled = false;
  }
}

const botToggleEl = $("bot-toggle");
if (botToggleEl) {
  botToggleEl.addEventListener("change", () => {
    setBotEnabled(!!botToggleEl.checked);
  });
}

const _renderOrig = render;
render = function (data) {
  _renderOrig(data);
  setBotLastScan(data);
};

loadBot();
setInterval(loadBot, POLL_MS);
