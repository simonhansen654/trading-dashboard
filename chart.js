/* Atlas Desk · Pulse24 chart (our data, not a TradingView clone) */
(function () {
  const BINANCE_DIRECT =
    "https://data-api.binance.vision/api/v3/klines";
  const SYM_MAP = { BTCUSDT: "BTC", ETHUSDT: "ETH" };

  const COLORS = {
    up: "#3D9B6E",
    down: "#C45C5C",
    wickUp: "#3D9B6E",
    wickDown: "#C45C5C",
    volUp: "rgba(61, 155, 110, 0.35)",
    volDown: "rgba(196, 92, 92, 0.35)",
    grid: "#1E232B",
    text: "#8B93A1",
    cross: "#5C6570",
    bucketH: "#3D8B7A",
    bucketL: "#B8923A",
    pdh: "#5B8FA8",
    pdl: "#8B6FA8",
    swing: "#5C6570",
    eq: "#B8923A",
    fvg: "rgba(61, 139, 122, 0.12)",
    fvgBorder: "rgba(61, 139, 122, 0.45)",
    sweep: "#C9B06A",
    bos: "#5B8FA8",
    ifvg: "#8B6FA8",
    entry: "#E8EAED",
    stop: "#C45C5C",
    tp1: "#3D9B6E",
    tp2: "#3D8B7A",
    tp3: "#5B8FA8",
    biasBull: "#3D9B6E",
    biasBear: "#C45C5C",
    biasRange: "#B8923A",
  };

  let chart = null;
  let candleSeries = null;
  let volumeSeries = null;
  let priceLines = [];
  let resizeObs = null;
  let pollTimer = null;
  let lastCandles = [];
  let overlays = null;
  let dashPulse = null;

  const $ = (id) => document.getElementById(id);

  function apiBase() {
    // same-origin when served by server.py / vercel
    return "";
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res.json();
  }

  async function loadKlines(symbol, interval, limit = 400) {
    // Prefer local proxy (normalized), fall back to Binance direct
    try {
      return await fetchJson(
        `${apiBase()}/api/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );
    } catch (_) {
      const raw = await fetchJson(
        `${BINANCE_DIRECT}?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );
      return raw.map((row) => ({
        time: Math.floor(row[0] / 1000),
        open: +row[1],
        high: +row[2],
        low: +row[3],
        close: +row[4],
        volume: +row[5],
      }));
    }
  }

  async function loadOverlays() {
    try {
      overlays = await fetchJson(`${apiBase()}/api/pulse24/overlays`);
    } catch (_) {
      overlays = null;
    }
    try {
      const dash = await fetchJson(`${apiBase()}/api/dashboard`);
      dashPulse = dash.pulse24 || null;
    } catch (_) {
      dashPulse = null;
    }
  }

  function clearPriceLines() {
    priceLines.forEach((pl) => {
      try {
        candleSeries.removePriceLine(pl);
      } catch (_) {}
    });
    priceLines = [];
  }

  function addLine(price, color, title, style = 0, width = 1) {
    if (price == null || !Number.isFinite(+price) || !candleSeries) return;
    const pl = candleSeries.createPriceLine({
      price: +price,
      color,
      lineWidth: width,
      lineStyle: style, // 0 solid, 2 dashed, 3 large dashed
      axisLabelVisible: true,
      title: title || "",
    });
    priceLines.push(pl);
  }

  function parseEtToUnix(atEt, fallbackYear) {
    // "10-05 12:15" or "2026-10-05 12:15" — treat as America/New_York (EDT=UTC-4 in Oct)
    if (!atEt) return null;
    const s = String(atEt).trim();
    let y, mo, d, hh, mm;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (m) {
      y = +m[1]; mo = +m[2]; d = +m[3]; hh = +m[4]; mm = +m[5];
    } else {
      m = s.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
      if (!m) return null;
      mo = +m[1]; d = +m[2]; hh = +m[3]; mm = +m[4];
      y = fallbackYear || new Date().getUTCFullYear();
    }
    const utcMs = Date.UTC(y, mo - 1, d, hh + 4, mm, 0);
    return Math.floor(utcMs / 1000);
  }

  function snapTimeToCandle(t, candles) {
    if (t == null || !candles.length) return null;
    let best = candles[0].time;
    let bestDist = Math.abs(best - t);
    for (const c of candles) {
      const dist = Math.abs(c.time - t);
      if (dist < bestDist) {
        best = c.time;
        bestDist = dist;
      }
    }
    return best;
  }

  function assetKey(symbol) {
    return SYM_MAP[symbol] || "BTC";
  }

  function assetOverlay(symbol) {
    const a = assetKey(symbol);
    if (overlays && overlays.assets && overlays.assets[a]) return overlays.assets[a];
    return null;
  }

  function computeBucketsFrom1h(h1) {
    // Rolling 8h UTC buckets — mirror pulse24.levels bucket logic (completed only)
    if (!h1 || h1.length < 2) return [];
    const bk = new Map();
    for (const x of h1) {
      const s = Math.floor(x.time / (8 * 3600));
      if (!bk.has(s)) bk.set(s, []);
      bk.get(s).push(x);
    }
    const keys = [...bk.keys()].sort((a, b) => a - b);
    const cur = Math.floor(h1[h1.length - 1].time / (8 * 3600));
    const out = [];
    for (const s of keys.slice(-5)) {
      if (s === cur) continue;
      const g = bk.get(s);
      const lab = "ABC"[(s * 8) % 24 / 8 | 0];
      out.push({
        name: `bucket${lab}_H`,
        p: Math.max(...g.map((x) => x.high)),
        side: "h",
      });
      out.push({
        name: `bucket${lab}_L`,
        p: Math.min(...g.map((x) => x.low)),
        side: "l",
      });
    }
    // PDH/PDL
    const dd = new Map();
    for (const x of h1) {
      const day = Math.floor(x.time / 86400);
      if (!dd.has(day)) dd.set(day, []);
      dd.get(day).push(x);
    }
    const days = [...dd.keys()].sort((a, b) => a - b);
    const today = Math.floor(h1[h1.length - 1].time / 86400);
    const prev = days.filter((d) => d < today);
    if (prev.length) {
      const g = dd.get(prev[prev.length - 1]);
      out.push({ name: "PDH", p: Math.max(...g.map((x) => x.high)), side: "h" });
      out.push({ name: "PDL", p: Math.min(...g.map((x) => x.low)), side: "l" });
    }
    return out;
  }

  function applyOverlays(symbol, candles) {
    clearPriceLines();
    if (!candleSeries) return;

    const a = assetKey(symbol);
    const ao = assetOverlay(symbol);
    const markers = [];
    const year = new Date().getUTCFullYear();

    // Bias badge
    const biasEl = $("chart-bias");
    const bias =
      (ao && ao.bias_4h) ||
      (dashPulse && dashPulse.bias_4h && dashPulse.bias_4h[a]) ||
      "—";
    if (biasEl) {
      biasEl.textContent = `4H ${bias}`;
      biasEl.className =
        "chart-pill " +
        (bias === "bull" ? "bull" : bias === "bear" ? "bear" : "range");
    }

    const periodEl = $("chart-period");
    const period =
      (overlays && overlays.period) ||
      (dashPulse && dashPulse.period) ||
      "—";
    if (periodEl) periodEl.textContent = period;

    const scanEl = $("chart-scan");
    const scan =
      (overlays && overlays.generated_et) ||
      (dashPulse && dashPulse.last_scan_et) ||
      "—";
    if (scanEl) scanEl.textContent = `scan ET ${scan}`;

    // Levels: prefer overlays cache, else client buckets from lastCandles if TF is 1h
    let levels = (ao && ao.levels) || [];
    if (!levels.length) {
      // fetch handled separately; use empty + open trades only
      levels = [];
    }

    // Dedup by name+rounded price; prefer bucket / PD / EQ / swing
    const shown = new Set();
    const prefer = (name) =>
      /^(bucket|PDH|PDL|EQ)/.test(name) || /swing/i.test(name);
    const sorted = [...levels].sort((x, y) => {
      const px = prefer(x.name) ? 0 : 1;
      const py = prefer(y.name) ? 0 : 1;
      return px - py;
    });
    let nDrawn = 0;
    for (const lv of sorted) {
      if (nDrawn >= 14) break; // keep chart readable
      const key = `${lv.name}:${(+lv.p).toFixed(2)}`;
      if (shown.has(key)) continue;
      shown.add(key);
      let color = COLORS.swing;
      let style = 2;
      let title = lv.name;
      if (/^bucket.*_H/.test(lv.name)) {
        color = COLORS.bucketH;
        title = lv.name.replace(/_\d+/, "");
      } else if (/^bucket.*_L/.test(lv.name)) {
        color = COLORS.bucketL;
        title = lv.name.replace(/_\d+/, "");
      } else if (lv.name === "PDH") color = COLORS.pdh;
      else if (lv.name === "PDL") color = COLORS.pdl;
      else if (/^EQ/.test(lv.name)) color = COLORS.eq;
      else continue; // skip raw 1H swings if we already have buckets — less clutter
      addLine(lv.p, color, title, style, 1);
      nDrawn++;
    }

    // Always draw PDH/PDL + recent buckets if we skipped swings-only
    if (nDrawn === 0 && levels.length) {
      for (const lv of levels.filter((l) => /^(bucket|PDH|PDL)/.test(l.name)).slice(-8)) {
        const color = /_H$|PDH/.test(lv.name) ? COLORS.bucketH : COLORS.bucketL;
        addLine(lv.p, color, lv.name, 2, 1);
      }
    }

    // Sweep mark
    const sweep =
      (ao && ao.sweep) ||
      (dashPulse && dashPulse.sweep && dashPulse.sweep[a]) ||
      null;
    if (sweep && sweep.p != null) {
      addLine(sweep.p, COLORS.sweep, `SWEEP ${sweep.level || ""}`, 0, 2);
      const t = snapTimeToCandle(parseEtToUnix(sweep.at_et, year), candles);
      if (t != null) {
        markers.push({
          time: t,
          position: sweep.level && /L|low/i.test(sweep.level) ? "belowBar" : "aboveBar",
          color: COLORS.sweep,
          shape: "arrowUp",
          text: `SW ${sweep.level || ""}`,
        });
      }
    }

    // 15m BOS / IFVG + equilibrium / FVG
    const conf = ao && ao.confirm15;
    if (conf) {
      if (conf.ref != null) {
        addLine(
          conf.ref,
          conf.type === "IFVG" ? COLORS.ifvg : COLORS.bos,
          conf.type || "BOS",
          2,
          1
        );
      }
      if (conf.eq != null) {
        addLine(conf.eq, COLORS.eq, "EQ", 3, 1);
      }
      if (Array.isArray(conf.fvg)) {
        conf.fvg.slice(0, 4).forEach((p, i) => {
          addLine(p, COLORS.fvgBorder, `FVG${i + 1}`, 2, 1);
        });
      }
      const t = snapTimeToCandle(parseEtToUnix(conf.at_et, year), candles);
      if (t != null) {
        markers.push({
          time: t,
          position: "aboveBar",
          color: conf.type === "IFVG" ? COLORS.ifvg : COLORS.bos,
          shape: "circle",
          text: conf.type || "BOS",
        });
      }
    }

    // Open / partial trades → stop + TP1–TP3 + entry
    const trades = [
      ...((overlays && overlays.open_trades) || []),
      ...((dashPulse && dashPulse.open_trades) || []),
    ];
    // dedupe by id
    const seen = new Set();
    for (const t of trades) {
      if (!t || seen.has(t.id)) continue;
      seen.add(t.id);
      if (t.asset && t.asset !== a) continue;
      if (t.symbol && !String(t.symbol).includes(symbol.replace("USDT", ""))) {
        // BINANCE:BTCUSDT style
        if (!String(t.symbol).includes(symbol)) continue;
      }
      if (t.entry != null) addLine(t.entry, COLORS.entry, "ENTRY", 0, 1);
      if (t.stop != null) addLine(t.stop, COLORS.stop, "STOP", 0, 2);
      if (t.tp1 != null) addLine(t.tp1, COLORS.tp1, "TP1", 2, 1);
      if (t.tp2 != null) addLine(t.tp2, COLORS.tp2, "TP2", 2, 1);
      if (t.tp3 != null) addLine(t.tp3, COLORS.tp3, "TP3", 2, 1);
      const et = snapTimeToCandle(
        parseEtToUnix(t.opened_at_et || t.opened_et, year),
        candles
      );
      if (et != null) {
        markers.push({
          time: et,
          position: t.direction === "short" ? "aboveBar" : "belowBar",
          color: COLORS.entry,
          shape: t.direction === "short" ? "arrowDown" : "arrowUp",
          text: "5m ENTRY",
        });
      }
    }

    // Armed signal (not yet filled) from overlays.signal
    const sig = overlays && overlays.signal;
    if (sig && (sig.asset === a || (sig.symbol && String(sig.symbol).includes(symbol)))) {
      if (sig.entry != null) addLine(sig.entry, COLORS.entry, "TRIG", 3, 1);
      if (sig.stop != null) addLine(sig.stop, COLORS.stop, "STOP?", 3, 1);
      if (sig.tp1 != null) addLine(sig.tp1, COLORS.tp1, "TP1?", 3, 1);
      if (sig.tp2 != null) addLine(sig.tp2, COLORS.tp2, "TP2?", 3, 1);
    }

    try {
      candleSeries.setMarkers(
        markers.sort((x, y) => x.time - y.time)
      );
    } catch (_) {
      candleSeries.setMarkers([]);
    }

    // Status line
    const st = $("chart-status");
    if (st) {
      const parts = [
        `${symbol} · ${$("chart-tf")?.dataset.value || ""}`,
        bias !== "—" ? `bias ${bias}` : null,
        sweep ? `sweep ${sweep.level}` : null,
        conf ? conf.type : null,
        ao && ao.armed ? "armed" : null,
        `${markers.length} markers · ${priceLines.length} lines`,
      ].filter(Boolean);
      st.textContent = parts.join(" · ");
    }
  }

  function updateOhlc(param) {
    const el = $("chart-ohlc");
    if (!el) return;
    const c =
      param && param.seriesData && candleSeries
        ? param.seriesData.get(candleSeries)
        : null;
    const bar = c || (lastCandles.length ? lastCandles[lastCandles.length - 1] : null);
    if (!bar) {
      el.textContent = "O —  H —  L —  C —";
      return;
    }
    const digs = bar.close >= 1000 ? 2 : 4;
    const fmt = (n) =>
      n == null
        ? "—"
        : Number(n).toLocaleString("en-US", {
            minimumFractionDigits: digs,
            maximumFractionDigits: digs,
          });
    const chg = bar.open ? ((bar.close - bar.open) / bar.open) * 100 : 0;
    const cls = chg >= 0 ? "pos" : "neg";
    el.innerHTML = `O <b>${fmt(bar.open)}</b>  H <b>${fmt(
      bar.high
    )}</b>  L <b>${fmt(bar.low)}</b>  C <b class="${cls}">${fmt(
      bar.close
    )}</b>  <span class="${cls}">${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%</span>`;
  }

  function ensureChart() {
    const el = $("chart-canvas");
    if (!el || typeof LightweightCharts === "undefined") return false;
    if (chart) return true;

    chart = LightweightCharts.createChart(el, {
      layout: {
        background: { type: "solid", color: "#12151A" },
        textColor: COLORS.text,
        fontFamily:
          '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          color: COLORS.cross,
          labelBackgroundColor: "#1E232B",
        },
        horzLine: {
          color: COLORS.cross,
          labelBackgroundColor: "#1E232B",
        },
      },
      rightPriceScale: {
        borderColor: COLORS.grid,
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: COLORS.grid,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    candleSeries = chart.addCandlestickSeries({
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor: COLORS.wickUp,
      wickDownColor: COLORS.wickDown,
    });

    volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "",
      color: COLORS.volUp,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chart.subscribeCrosshairMove(updateOhlc);

    const ro = new ResizeObserver(() => {
      if (!chart || !el) return;
      chart.applyOptions({
        width: el.clientWidth,
        height: el.clientHeight,
      });
    });
    ro.observe(el);
    resizeObs = ro;
    chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    return true;
  }

  async function refresh(fit = false) {
    const symbol = $("chart-symbol")?.dataset.value || "BTCUSDT";
    const interval = $("chart-tf")?.dataset.value || "15m";
    const err = $("chart-err");
    try {
      if (!ensureChart()) throw new Error("Chart lib not loaded");
      const [candles] = await Promise.all([
        loadKlines(symbol, interval, 500),
        loadOverlays(),
      ]);
      lastCandles = candles;
      candleSeries.setData(
        candles.map(({ time, open, high, low, close }) => ({
          time,
          open,
          high,
          low,
          close,
        }))
      );
      volumeSeries.setData(
        candles.map((c) => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? COLORS.volUp : COLORS.volDown,
        }))
      );

      // If overlays lack levels, compute buckets from 1h
      const ao = assetOverlay(symbol);
      if (!ao || !ao.levels || !ao.levels.length) {
        try {
          const h1 = await loadKlines(symbol, "1h", 120);
          const buckets = computeBucketsFrom1h(h1);
          if (!overlays) overlays = { assets: {} };
          if (!overlays.assets) overlays.assets = {};
          const a = assetKey(symbol);
          overlays.assets[a] = {
            ...(overlays.assets[a] || {}),
            levels: buckets,
            bias_4h:
              (dashPulse && dashPulse.bias_4h && dashPulse.bias_4h[a]) ||
              (overlays.assets[a] && overlays.assets[a].bias_4h),
            sweep:
              (dashPulse && dashPulse.sweep && dashPulse.sweep[a]) ||
              (overlays.assets[a] && overlays.assets[a].sweep),
          };
        } catch (_) {}
      }

      applyOverlays(symbol, candles);
      updateOhlc(null);
      if (fit) chart.timeScale().fitContent();
      if (err) {
        err.hidden = true;
        err.textContent = "";
      }
    } catch (e) {
      if (err) {
        err.hidden = false;
        err.textContent = `Chart: ${e.message}`;
      }
    }
  }

  function bindToolbar() {
    document.querySelectorAll("[data-chart-sym]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll("[data-chart-sym]")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        $("chart-symbol").dataset.value = btn.dataset.chartSym;
        $("chart-symbol").textContent = btn.dataset.chartSym;
        refresh(true);
      });
    });
    document.querySelectorAll("[data-chart-tf]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll("[data-chart-tf]")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        $("chart-tf").dataset.value = btn.dataset.chartTf;
        $("chart-tf").textContent = btn.dataset.chartTf;
        refresh(true);
      });
    });
    $("chart-refresh")?.addEventListener("click", () => refresh(false));
  }

  function showChartView(show) {
    const section = $("chart-view");
    if (!section) return;
    section.hidden = !show;
    if (show) {
      ensureChart();
      refresh(true);
      if (!pollTimer) pollTimer = setInterval(() => refresh(false), 60 * 1000);
      // resize after becoming visible
      requestAnimationFrame(() => {
        const el = $("chart-canvas");
        if (chart && el) {
          chart.applyOptions({
            width: el.clientWidth,
            height: el.clientHeight,
          });
        }
      });
    }
  }

  window.AtlasChart = { refresh, showChartView, ensureChart };

  function boot() {
    if (!$("chart-view")) return;
    bindToolbar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
