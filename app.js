const POLL_MS = 5 * 60 * 1000;
const DATA_URL =
  "https://raw.githubusercontent.com/simonhansen654/trading-dashboard/main/dashboard-data.json";
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

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&")
    .replaceAll("<", "<")
    .replaceAll(">", ">")
    .replaceAll('"', """);
}

function dirBadge(dir) {
  if (!dir) return "";
  const d = String(dir).toLowerCase();
  const cls = d.includes("short") ? "short" : "long";
  return `<span class="badge ${cls}">${escapeHtml(dir)}</span>`;
}

function metric(label, value, cls = "") {
  return `<div class="metric"><div class="label">${escapeHtml(
    label
  )}</div><div class="value ${cls}">${value}</div></div>`;
}

function isHighKey(k) {
  return /(_H|H$|ATH|PDH|high|open)/i.test(k) && !/(_L|low|PDL)/i.test(k);
}

function isLowKey(k) {
  return /(_L|L$|PDL|low)/i.test(k);
}

function shortTime(iso) {
  if (!iso) return "—";
  const m = String(iso).match(/T(\d{2}:\d{2})/);
  return m ? m[1] : iso;
}

function renderLevels(obj) {
  if (!obj) return `<p class="empty">Ingen niveauer</p>`;
  return Object.entries(obj)
    .map(([k, v]) => {
      if (typeof v === "string") {
        return `<div class="level-row string"><span class="name">${escapeHtml(
          k
        )}</span><span class="num">${escapeHtml(v)}</span></div>`;
      }
      const cls = isHighKey(k) ? "high" : isLowKey(k) ? "low" : "";
      return `<div class="level-row ${cls}"><span class="name">${escapeHtml(
        k
      )}</span><span class="num">${fmtNum(v)}</span></div>`;
    })
    .join("");
}

function renderTradeLike(t, kind) {
  if (!t) {
    return `<p class="empty">${
      kind === "armed" ? "Ingen armed setup" : "Ingen åben trade"
    }</p>`;
  }
  const status = escapeHtml(t.status || kind);
  const statusCls = kind === "armed" ? "armed" : "open";
  return `
    <div class="trade-head">
      ${dirBadge(t.direction)}
      <span class="badge ${statusCls}">${status}</span>
      <span class="inst">${escapeHtml(t.instrument || "")}</span>
      <span class="id">${escapeHtml(t.id || "")}</span>
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
      ${
        t.trigger
          ? `<dt>Trigger</dt><dd class="wrap">${escapeHtml(t.trigger)}</dd>`
          : ""
      }
      ${
        t.waiting_for
          ? `<dt>Waiting</dt><dd class="wrap">${escapeHtml(t.waiting_for)}</dd>`
          : ""
      }
      ${
        t.notes
          ? `<dt>Notes</dt><dd class="wrap">${escapeHtml(t.notes)}</dd>`
          : ""
      }
    </dl>`;
}

function renderSweeps(sweeps) {
  if (!sweeps || !sweeps.length) return `<p class="empty">Ingen sweeps</p>`;
  return sweeps
    .map(
      (s) => `
    <div class="sweep">
      <div class="head">
        <strong>${escapeHtml(s.instrument)}</strong>
        <span>${escapeHtml(s.level)}</span>
        <span class="badge ${s.side === "high" ? "short" : "long"}">${escapeHtml(
          s.side
        )}</span>
        <span class="id">${escapeHtml(s.time_et_feed || "")} · ${escapeHtml(
          s.type || ""
        )}</span>
        <span class="id">ext ${fmtNum(s.extreme)}</span>
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
      const rcls =
        res === "win" ? "win" : res === "loss" ? "loss" : res === "be" ? "be" : "";
      const notes = String(t.notes || "");
      return `<tr>
        <td class="mono">${escapeHtml(t.date)}</td>
        <td class="mono">${escapeHtml(t.time_et)}</td>
        <td>${escapeHtml(t.instrument)}</td>
        <td>${dirBadge(t.direction)}</td>
        <td class="num">${fmtNum(t.entry)}</td>
        <td class="num">${fmtNum(t.stop)}</td>
        <td class="notes-cell" title="${escapeHtml(t.targets)}">${escapeHtml(
          t.targets
        )}</td>
        <td class="num">${escapeHtml(t.size)}</td>
        <td class="${rcls}">${escapeHtml(t.result)}</td>
        <td class="num">${fmtNum(t.R, 2)}</td>
        <td class="notes-cell" title="${escapeHtml(notes)}">${escapeHtml(
          notes
        )}</td>
      </tr>`;
    })
    .join("");
}

function render(data) {
  const a = data.account || {};
  $("account-line").textContent = `${a.broker || "Paper"} · ${
    a.session_date || ""
  } · risk ${a.risk_pct ?? "—"}% · max ${a.max_trades_per_day ?? "—"} trades/dag`;
  $("user-chip").textContent = a.username || "—";
  $("session-meta").textContent = `${a.session_date || "—"} · delay ${
    a.feed_delay_min ?? "—"
  }m`;

  const loginOk = data.status?.login_ok;
  const pill = $("login-pill");
  pill.textContent = loginOk ? "Live" : "Offline";
  pill.className = "live-pill " + (loginOk ? "ok" : "bad");

  const updated = data.updated_at || {};
  $("updated").textContent = `CPH ${shortTime(
    updated.iso_copenhagen
  )} · ET ${shortTime(updated.iso_et)}`;
  $("updated").title = `${updated.iso_copenhagen || "—"} (CPH) · ${
    updated.iso_et || "—"
  } (ET)`;

  $("metrics").innerHTML = [
    metric("Equity", fmtMoney(a.equity)),
    metric("Balance", fmtMoney(a.balance)),
    metric("Unrealized", fmtMoney(a.unrealized_pnl), pnlClass(a.unrealized_pnl)),
    metric(
      "Realized i dag",
      fmtMoney(a.realized_pnl_today),
      pnlClass(a.realized_pnl_today)
    ),
    metric(
      "Trades i dag",
      `${a.trade_count_today ?? 0} / ${a.max_trades_per_day ?? "—"}`
    ),
    metric("Losses", String(a.losses_today ?? 0), a.losses_today > 0 ? "neg" : ""),
    metric("Feed delay", `${a.feed_delay_min ?? "—"} min`),
  ].join("");

  $("open-trade").innerHTML = renderTradeLike(data.open_trade, "open");
  $("armed-setup").innerHTML = renderTradeLike(data.armed_setup, "armed");

  const b = data.bias || {};
  $("bias").innerHTML = `
    <div class="decision"><strong>Decision</strong> · ${escapeHtml(
      b.decision || "—"
    )}</div>
    <dl class="kv">
      <dt>4H</dt><dd class="wrap">${escapeHtml(b["4H"] || "—")}</dd>
      <dt>1H</dt><dd class="wrap">${escapeHtml(b["1H"] || "—")}</dd>
      <dt>Long TP</dt><dd class="wrap">${escapeHtml(
        b.longs_TP_candidates || "—"
      )}</dd>
      <dt>Short TP</dt><dd class="wrap">${escapeHtml(
        b.shorts_TP_candidates || "—"
      )}</dd>
    </dl>`;

  const newsEl = $("news");
  if (a.news) {
    newsEl.textContent = a.news;
    newsEl.hidden = false;
  } else {
    newsEl.textContent = "";
    newsEl.hidden = true;
  }

  const notes = data.status?.notes_tail || [];
  $("notes").innerHTML = notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("");

  $("levels-nq").innerHTML = renderLevels(data.levels?.NQ);
  $("levels-es").innerHTML = renderLevels(data.levels?.ES);
  $("sweeps").innerHTML = renderSweeps(data.sweeps);
  renderTrades(data.trades);
}

async function load() {
  const err = $("err");
  try {
    const res = await fetch(DATA_URL + "?ts=" + Date.now(), {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    render(data);
    err.hidden = true;
    err.textContent = "";
  } catch (e) {
    err.hidden = false;
    err.textContent = `Kunne ikke hente data: ${e.message}`;
  }
}

/* Sidebar mobile + nav */
const sidebar = $("sidebar");
const backdrop = $("sidebar-backdrop");
$("sidebar-toggle").addEventListener("click", () => {
  const open = sidebar.classList.toggle("open");
  backdrop.hidden = !open;
});
backdrop.addEventListener("click", () => {
  sidebar.classList.remove("open");
  backdrop.hidden = true;
});

document.querySelectorAll(".nav-item").forEach((el) => {
  el.addEventListener("click", () => {
    document
      .querySelectorAll(".nav-item")
      .forEach((n) => n.classList.remove("active"));
    el.classList.add("active");
    sidebar.classList.remove("open");
    backdrop.hidden = true;
  });
});

$("refresh-btn").addEventListener("click", load);
load();
setInterval(load, POLL_MS);
