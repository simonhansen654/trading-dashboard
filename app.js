const POLL_MS = 5 * 60 * 1000;
const $ = (id) => document.getElementById(id);

function fmtMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function fmtNum(n, digits = 2) {
  if (n == null || n === "" || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function pnlClass(n) {
  if (n == null) return "";
  if (n > 0) return "pos";
  if (n < 0) return "neg";
  return "";
}

function dirBadge(dir) {
  if (!dir) return "";
  const d = String(dir).toLowerCase();
  const cls = d.includes("short") ? "short" : "long";
  return `<span class="badge ${cls}">${escapeHtml(dir)}</span>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&")
    .replaceAll("<", "<")
    .replaceAll(">", ">")
    .replaceAll('"', """);
}

function metric(label, value, cls = "") {
  return `<div class="metric"><div class="label">${escapeHtml(label)}</div><div class="value ${cls}">${value}</div></div>`;
}

function isHighKey(k) {
  return /(_H|H$|ATH|PDH|high|open)/i.test(k) && !/(_L|low|PDL)/i.test(k);
}
function isLowKey(k) {
  return /(_L|L$|PDL|low)/i.test(k);
}

function renderLevels(obj) {
  if (!obj) return `<div class="empty">Ingen niveauer</div>`;
  const rows = Object.entries(obj).map(([k, v]) => {
    if (typeof v === "string") {
      return `<div class="level-row string"><span class="name">${escapeHtml(k)}</span><span class="num">${escapeHtml(v)}</span></div>`;
    }
    const cls = isHighKey(k) ? "high" : isLowKey(k) ? "low" : "";
    return `<div class="level-row ${cls}"><span class="name">${escapeHtml(k)}</span><span class="num">${fmtNum(v)}</span></div>`;
  });
  return rows.join("");
}

function renderTradeLike(t, kind) {
  if (!t) {
    return `<div class="empty">${kind === "armed" ? "Ingen armed setup" : "Ingen åben trade"}</div>`;
  }
  const status = escapeHtml(t.status || kind);
  const statusCls = kind === "armed" ? "armed" : "open";
  return `
    <div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${dirBadge(t.direction)}
      <span class="badge ${statusCls}">${status}</span>
      <strong>${escapeHtml(t.instrument || "")}</strong>
      <span class="muted">${escapeHtml(t.id || "")}</span>
    </div>
    <dl class="kv">
      <dt>Entry</dt><dd>${fmtNum(t.entry)}</dd>
      <dt>Stop</dt><dd>${fmtNum(t.stop)}</dd>
      <dt>TP1</dt><dd>${fmtNum(t.tp1)}</dd>
      <dt>TP2</dt><dd>${fmtNum(t.tp2)}</dd>
      <dt>Size</dt><dd>${t.size == null ? "—" : escapeHtml(t.size)}</dd>
      <dt>Risk</dt><dd>${fmtMoney(t.risk_usd)}</dd>
      <dt>R</dt><dd>${t.r_multiple == null ? "—" : fmtNum(t.r_multiple, 2)}</dd>
      <dt>Opened ET</dt><dd>${escapeHtml(t.opened_at_et || "—")}</dd>
      ${t.trigger ? `<dt>Trigger</dt><dd class="wrap">${escapeHtml(t.trigger)}</dd>` : ""}
      ${t.waiting_for ? `<dt>Waiting</dt><dd class="wrap">${escapeHtml(t.waiting_for)}</dd>` : ""}
      ${t.notes ? `<dt>Notes</dt><dd class="wrap">${escapeHtml(t.notes)}</dd>` : ""}
    </dl>`;
}

function renderSweeps(sweeps) {
  if (!sweeps || !sweeps.length) return `<div class="empty">Ingen sweeps</div>`;
  return sweeps
    .map(
      (s) => `
    <div class="sweep">
      <div class="head">
        <strong>${escapeHtml(s.instrument)}</strong>
        <span>${escapeHtml(s.level)}</span>
        <span class="badge ${s.side === "high" ? "short" : "long"}">${escapeHtml(s.side)}</span>
        <span class="muted">${escapeHtml(s.time_et_feed || "")} · ${escapeHtml(s.type || "")}</span>
        <span class="muted">ext ${fmtNum(s.extreme)}</span>
      </div>
      <div class="note">${escapeHtml(s.note || "")}</div>
    </div>`
    )
    .join("");
}

function renderTrades(trades) {
  const body = $("trades-body");
  if (!trades || !trades.length) {
    body.innerHTML = `<tr><td colspan="11" class="empty">Ingen trades endnu</td></tr>`;
    return;
  }
  body.innerHTML = trades
    .map((t) => {
      const res = String(t.result || "").toLowerCase();
      const rcls = res === "win" ? "win" : res === "loss" ? "loss" : res === "be" ? "be" : "";
      return `<tr>
        <td>${escapeHtml(t.date)}</td>
        <td>${escapeHtml(t.time_et)}</td>
        <td>${escapeHtml(t.instrument)}</td>
        <td>${dirBadge(t.direction)}</td>
        <td>${fmtNum(t.entry)}</td>
        <td>${fmtNum(t.stop)}</td>
        <td class="wrap">${escapeHtml(t.targets)}</td>
        <td>${escapeHtml(t.size)}</td>
        <td class="${rcls}">${escapeHtml(t.result)}</td>
        <td>${fmtNum(t.R, 2)}</td>
        <td class="wrap">${escapeHtml(t.notes)}</td>
      </tr>`;
    })
    .join("");
}

function render(data) {
  const a = data.account || {};
  $("account-line").textContent = `${a.broker || "Paper"} · ${a.username || ""} · ${a.session_date || ""} · risk ${a.risk_pct ?? "—"}% · max ${a.max_trades_per_day ?? "—"} trades/dag`;

  const loginOk = data.status?.login_ok;
  const pill = $("login-pill");
  pill.textContent = loginOk ? "Login OK" : "Login?";
  pill.className = "pill " + (loginOk ? "ok" : "bad");

  const updated = data.updated_at || {};
  $("updated").textContent = `Opdateret ${updated.iso_copenhagen || "—"} (CPH) · ${updated.iso_et || "—"} (ET)`;

  $("metrics").innerHTML = [
    metric("Equity", fmtMoney(a.equity)),
    metric("Balance", fmtMoney(a.balance)),
    metric("Unrealized", fmtMoney(a.unrealized_pnl), pnlClass(a.unrealized_pnl)),
    metric("Realized i dag", fmtMoney(a.realized_pnl_today), pnlClass(a.realized_pnl_today)),
    metric("Trades i dag", `${a.trade_count_today ?? 0} / ${a.max_trades_per_day ?? "—"}`),
    metric("Losses i dag", String(a.losses_today ?? 0), a.losses_today > 0 ? "neg" : ""),
    metric("Feed delay", `${a.feed_delay_min ?? "—"} min`),
    metric(
      "Last feed",
      data.status?.last_prices_feed_0940
        ? `NQ ${fmtNum(data.status.last_prices_feed_0940.NQ)} · ES ${fmtNum(data.status.last_prices_feed_0940.ES)}`
        : "—"
    ),
  ].join("");

  $("open-trade").innerHTML = renderTradeLike(data.open_trade, "open");
  $("armed-setup").innerHTML = renderTradeLike(data.armed_setup, "armed");

  const b = data.bias || {};
  $("bias").innerHTML = `
    <div class="decision"><strong>Decision:</strong> ${escapeHtml(b.decision || "—")}</div>
    <dl class="kv">
      <dt>4H</dt><dd class="wrap">${escapeHtml(b["4H"] || "—")}</dd>
      <dt>1H</dt><dd class="wrap">${escapeHtml(b["1H"] || "—")}</dd>
      <dt>Long TP</dt><dd class="wrap">${escapeHtml(b.longs_TP_candidates || "—")}</dd>
      <dt>Short TP</dt><dd class="wrap">${escapeHtml(b.shorts_TP_candidates || "—")}</dd>
    </dl>`;

  $("news").textContent = a.news || "";
  const notes = data.status?.notes_tail || [];
  $("notes").innerHTML = notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("");

  $("levels-nq").innerHTML = renderLevels(data.levels?.NQ);
  $("levels-es").innerHTML = renderLevels(data.levels?.ES);
  $("sweeps").innerHTML = renderSweeps(data.sweeps);
  renderTrades(data.trades);
}

async function load() {
  try {
    const res = await fetch("https://raw.githubusercontent.com/simonhansen654/trading-dashboard/main/dashboard-data.json?ts=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    render(data);
    document.querySelector(".err")?.remove();
  } catch (e) {
    let err = document.querySelector(".err");
    if (!err) {
      err = document.createElement("div");
      err.className = "err";
      document.body.prepend(err);
    }
    err.textContent = `Kunne ikke hente dashboard.json: ${e.message}`;
  }
}

$("refresh-btn").addEventListener("click", load);
load();
setInterval(load, POLL_MS);
