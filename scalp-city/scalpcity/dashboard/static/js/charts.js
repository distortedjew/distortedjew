// Canvas charts: the intraday candle chart (with crosshair), the equity curve and sparklines.
import { minuteOf, money, fmtDay } from "./util.js";

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const C = () => ({
  ink: css("--ink"), dim: css("--dim"), grid: css("--grid"), up: css("--up"), down: css("--down"),
  vwap: css("--vwap"), ema: css("--ema"), or: css("--or"), gold: css("--gold"), panel: css("--panel-solid"),
});

function setup(cv) {
  const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  return { g, W, H };
}

function tooltip(g, W, x, y, lines, col) {
  g.font = "11px ui-monospace, monospace";
  const w = Math.max(...lines.map((l) => g.measureText(l).width)) + 14, h = lines.length * 15 + 8;
  let tx = x + 12; if (tx + w > W - 4) tx = x - w - 12;
  const ty = Math.max(4, y - h / 2);
  g.fillStyle = col.panel; g.strokeStyle = col.grid; g.lineWidth = 1;
  g.beginPath(); g.roundRect(tx, ty, w, h, 6); g.fill(); g.stroke();
  g.fillStyle = col.ink;
  lines.forEach((l, i) => g.fillText(l, tx + 7, ty + 16 + i * 15));
}

/** Intraday chart for one worker-day. Returns a redraw(hoverX) function for the crosshair. */
export function dayChart(cv, dl, position) {
  const bars = dl.bars || [];
  const draw = (hx = null) => {
    const { g, W, H } = setup(cv), col = C();
    const L = 8, R = 52, T = 10, B = 22, n = 390;
    if (!bars.length) { g.fillStyle = col.dim; g.font = "12px ui-monospace, monospace"; g.fillText("no candles yet for this day", 14, 24); return; }
    const hasOHLC = bars[0].length >= 7;
    const vals = [];
    for (const b of bars) { vals.push(b[1]); if (b[2] != null) vals.push(b[2]); if (b[3] != null) vals.push(b[3]); if (hasOHLC) vals.push(b[5], b[6]); }
    for (const v of dl.opening_range || []) if (v != null) vals.push(v);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
    // a partial day (live, or a bot started late) zooms to the minutes that have candles
    const first = minuteOf(bars[0][0]), last = minuteOf(bars[bars.length - 1][0]);
    let m0 = 0, m1 = n - 1;
    if (last - first < 0.6 * n) { m0 = Math.max(0, first - 5); m1 = Math.min(n - 1, Math.max(last + 20, m0 + 60)); }
    const X = (m) => L + ((m - m0) / (m1 - m0)) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const bw = Math.max(1, ((W - L - R) / (m1 - m0 + 1)) * 0.7);

    g.font = "10px ui-monospace, monospace"; g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const v = lo + ((hi - lo) * k) / 4, y = Y(v);
      g.strokeStyle = col.grid; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke();
      g.fillStyle = col.dim; g.fillText(v.toFixed(2), W - R + 6, y + 3);
    }
    const step = m1 - m0 > 240 ? 90 : m1 - m0 > 100 ? 30 : 15;
    for (let m = Math.ceil(m0 / step) * step; m <= m1; m += step) {
      const t = 570 + m, lbl = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      const x = X(m); if (x < L + 10 || x > W - R - 20) continue;
      g.fillStyle = col.dim; g.fillText(lbl, x - 14, H - 6);
    }
    g.save(); g.beginPath(); g.rect(L, 0, W - L - R, H); g.clip(); // nothing draws over the price axis

    const [orh, orl] = dl.opening_range || [];
    if (orh != null && orl != null) {
      g.fillStyle = col.or + "1f"; g.fillRect(Math.max(L, X(15)), Y(orh), W - R - Math.max(L, X(15)), Y(orl) - Y(orh));
      g.strokeStyle = col.or; g.setLineDash([4, 4]);
      for (const v of [orh, orl]) { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke(); }
      g.setLineDash([]);
    }

    for (const t of dl.trades || []) { // holding periods
      g.fillStyle = (t.pnl > 0 ? col.up : col.down) + "22";   // holding period
      g.fillRect(X(minuteOf(t.opened)), T, Math.max(2, X(minuteOf(t.closed)) - X(minuteOf(t.opened))), H - T - B);
    }
    if (position) { g.fillStyle = col.gold + "18"; g.fillRect(X(minuteOf(position.opened)), T, W - R - X(minuteOf(position.opened)), H - T - B); }

    if (hasOHLC) {
      for (const b of bars) {
        const x = X(minuteOf(b[0])), o = b[4], c = b[1], up = c >= o;
        g.strokeStyle = g.fillStyle = up ? col.up : col.down;
        g.beginPath(); g.moveTo(x, Y(b[5])); g.lineTo(x, Y(b[6])); g.stroke();
        const y0 = Y(Math.max(o, c)), h = Math.max(1, Math.abs(Y(o) - Y(c)));
        g.fillRect(x - bw / 2, y0, bw, h);
      }
    }
    const line = (k, c, w) => {
      g.strokeStyle = c; g.lineWidth = w; g.beginPath(); let on = false;
      for (const b of bars) { if (b[k] == null) { on = false; continue; } const x = X(minuteOf(b[0])), y = Y(b[k]); on ? g.lineTo(x, y) : g.moveTo(x, y); on = true; }
      g.stroke(); g.lineWidth = 1;
    };
    line(2, col.vwap, 1.6); line(3, col.ema, 1.6);
    if (!hasOHLC) line(1, col.ink, 1.4);

    for (const s of dl.signals || []) { // small ticks at the axis
      const x = X(minuteOf(s.t)); g.fillStyle = s.dir === "call" ? col.up : col.down;
      g.fillRect(x - 1, H - B - 5, 2, 5);
    }
    const tri = (x, y, up, c) => { g.fillStyle = c; g.beginPath(); if (up) { g.moveTo(x, y - 7); g.lineTo(x - 6, y + 4); g.lineTo(x + 6, y + 4); } else { g.moveTo(x, y + 7); g.lineTo(x - 6, y - 4); g.lineTo(x + 6, y - 4); } g.closePath(); g.fill(); g.strokeStyle = col.panel; g.stroke(); };
    for (const t of dl.trades || []) {
      if (!t.spot_in) continue;
      const x0 = X(minuteOf(t.opened)), x1 = X(minuteOf(t.closed)), c = t.pnl > 0 ? col.up : col.down;
      g.strokeStyle = c; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x0, Y(t.spot_in)); g.lineTo(x1, Y(t.spot_out)); g.stroke(); g.setLineDash([]);
      tri(x0, Y(t.spot_in), t.right === "call", t.right === "call" ? col.up : col.down);
      g.fillStyle = c; g.beginPath(); g.arc(x1, Y(t.spot_out), 4, 0, 7); g.fill(); g.strokeStyle = col.panel; g.stroke();
    }
    if (position?.spot_in) tri(X(minuteOf(position.opened)), Y(position.spot_in), position.right === "call", col.gold);

    g.restore();
    const lastBar = bars[bars.length - 1], ly = Y(lastBar[1]);
    g.fillStyle = col.gold; g.beginPath(); g.roundRect(W - R + 2, ly - 8, R - 4, 16, 4); g.fill();
    g.fillStyle = "#000"; g.font = "bold 10px ui-monospace, monospace"; g.fillText(lastBar[1].toFixed(2), W - R + 6, ly + 3);

    if (hx != null && hx >= L && hx <= W - R) {
      const m = m0 + Math.round(((hx - L) / (W - L - R)) * (m1 - m0));
      let best = bars[0];
      for (const b of bars) if (Math.abs(minuteOf(b[0]) - m) < Math.abs(minuteOf(best[0]) - m)) best = b;
      const x = X(minuteOf(best[0])), y = Y(best[1]);
      g.strokeStyle = col.dim; g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(x, T); g.lineTo(x, H - B); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.setLineDash([]);
      const lines = [best[0] + "  close " + best[1].toFixed(2)];
      if (hasOHLC) lines.push(`O ${best[4].toFixed(2)} H ${best[5].toFixed(2)} L ${best[6].toFixed(2)}`);
      lines.push(`VWAP ${best[2] != null ? best[2].toFixed(2) : "—"}  EMA ${best[3] != null ? best[3].toFixed(2) : "warming"}`);
      const tr = (dl.trades || []).find((t) => t.opened <= best[0] && best[0] <= t.closed);
      if (tr) lines.push(`${tr.right.toUpperCase()} ${tr.triggers.join("+")} → ${money(tr.pnl)} (${tr.reason})`);
      tooltip(g, W, x, y, lines, col);
    }
  };
  attachHover(cv, draw);
  draw();
  return draw;
}

function attachHover(cv, draw) {
  cv.onpointermove = (e) => draw(e.clientX - cv.getBoundingClientRect().left);
  cv.onpointerdown = cv.onpointermove;
  cv.onpointerleave = () => draw(null);
}

/** Cumulative P&L across days with the drawdown underneath and daily bars along the bottom. */
export function equityChart(cv, equity) {
  const draw = (hx = null) => {
    const { g, W, H } = setup(cv), col = C();
    if (!equity.length) { g.fillStyle = col.dim; g.fillText("no history yet", 12, 22); return; }
    const L = 8, R = 60, T = 12, B = 20;
    const cum = equity.map((e) => e.cum), dd = equity.map((e) => e.dd), daily = equity.map((e) => e.pnl);
    let lo = Math.min(0, ...cum, ...dd), hi = Math.max(0, ...cum);
    const pad = (hi - lo) * 0.08 || 100; lo -= pad; hi += pad;
    const n = equity.length;
    const X = (i) => L + (n === 1 ? 0.5 : i / (n - 1)) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    g.font = "10px ui-monospace, monospace";
    for (let k = 0; k <= 4; k++) {
      const v = lo + ((hi - lo) * k) / 4, y = Y(v);
      g.strokeStyle = col.grid; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke();
      g.fillStyle = col.dim; g.fillText(money(v), W - R + 4, y + 3);
    }
    g.strokeStyle = col.dim; g.beginPath(); g.moveTo(L, Y(0)); g.lineTo(W - R, Y(0)); g.stroke();
    const maxd = Math.max(1, ...daily.map(Math.abs)), bw = Math.max(2, ((W - L - R) / n) * 0.6);
    daily.forEach((v, i) => { g.fillStyle = (v >= 0 ? col.up : col.down) + "55"; const h = (Math.abs(v) / maxd) * (H - T - B) * 0.22; g.fillRect(X(i) - bw / 2, H - B - h, bw, h); });
    g.beginPath(); g.moveTo(X(0), Y(0)); dd.forEach((v, i) => g.lineTo(X(i), Y(v))); g.lineTo(X(n - 1), Y(0)); g.closePath();
    g.fillStyle = col.down + "33"; g.fill();
    const grad = g.createLinearGradient(0, T, 0, H - B);
    grad.addColorStop(0, col.up + "55"); grad.addColorStop(1, col.up + "00");
    g.beginPath(); g.moveTo(X(0), Y(0)); cum.forEach((v, i) => g.lineTo(X(i), Y(v))); g.lineTo(X(n - 1), Y(0)); g.closePath(); g.fillStyle = grad; g.fill();
    g.strokeStyle = col.up; g.lineWidth = 2; g.beginPath(); cum.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.stroke(); g.lineWidth = 1;
    g.fillStyle = col.dim;
    g.fillText(fmtDay(equity[0].date, { month: "numeric", day: "numeric" }), L, H - 5);
    const lastLbl = fmtDay(equity[n - 1].date, { month: "numeric", day: "numeric" });
    g.fillText(lastLbl, W - R - g.measureText(lastLbl).width, H - 5);
    if (hx != null) {
      const i = Math.max(0, Math.min(n - 1, Math.round(((hx - L) / (W - L - R)) * (n - 1))));
      const e = equity[i], x = X(i), y = Y(e.cum);
      g.strokeStyle = col.dim; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x, T); g.lineTo(x, H - B); g.stroke(); g.setLineDash([]);
      g.fillStyle = col.gold; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
      tooltip(g, W, x, y, [fmtDay(e.date), `day ${money(e.pnl)}`, `total ${money(e.cum)}`, `drawdown ${money(e.dd)}`], col);
    }
  };
  attachHover(cv, draw);
  draw();
  return draw;
}

export function sparkline(cv, values, color) {
  const { g, W, H } = setup(cv);
  if (values.length < 2) return;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  g.strokeStyle = color; g.lineWidth = 1.4; g.beginPath();
  values.forEach((v, i) => { const x = (i / (values.length - 1)) * W, y = H - 2 - ((v - lo) / span) * (H - 4); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
}
