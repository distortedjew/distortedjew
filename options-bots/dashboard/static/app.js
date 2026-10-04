/* Shared by index.html and bot.html: formatting, theme, market clock, animated numbers, line charts. */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const usd = (v, sign = false) => v == null ? "—" :
  (sign && v > 0 ? "+" : v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
const pct = (v) => v == null ? "—" : Math.round(v * 100) + "%";
const cls = (v) => v > 0 ? "pos" : v < 0 ? "neg" : "";
const botColor = (name) => `var(--bot-${name})`;
const parseT = (t) => Date.parse(t.length === 16 ? t + "Z" : t);
const fmtTime = (t) => new Date(parseT(t)).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const NAMES = ["atlas", "nova", "ranger", "volt", "orchard"];

// orbiting logo dots, one per bot
$("#logo").innerHTML = NAMES.map((n, i) => `<i style="--c:${botColor(n)};--n:${i}"></i>`).join("");

// theme toggle
try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch {}
$("#theme").onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch {}
  chartSig = {};
  window.onThemeChange?.();
};

// ---- small helpers -------------------------------------------------------------
/** Replace innerHTML only when it changed, so animations don't replay on every poll. */
function setHTML(el, html) { if (el._h !== html) { el.innerHTML = html; el._h = html; return true; } return false; }

/** Count a number up/down to its new value and flash green/red on change. */
function tween(el, to, fmt, { flash = true } = {}) {
  if (to == null) { el.textContent = "—"; return; }
  const from = el._v;
  el._v = to;
  if (from === undefined || reduced) { el.textContent = fmt(to); if (from === undefined && !reduced) countFromZero(el, to, fmt); return; }
  if (from === to) return;
  if (flash) { el.classList.remove("flash-up", "flash-down"); void el.offsetWidth; el.classList.add(to > from ? "flash-up" : "flash-down"); }
  run(el, from, to, fmt, 900);
}
function countFromZero(el, to, fmt) { run(el, to * 0.0, to, fmt, 1400); }
function run(el, from, to, fmt, ms) {
  const t0 = performance.now(); cancelAnimationFrame(el._raf);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 4);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

// ---- market clock (regular hours, US/Eastern) ------------------------------------
function etParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", second: "numeric", hour12: false })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { wd: p.weekday, mins: (+p.hour % 24) * 60 + +p.minute, secs: +p.second };
}
function hms(totalSec) {
  const h = Math.floor(totalSec / 3600), m = Math.floor(totalSec % 3600 / 60), s = totalSec % 60;
  return (h ? h + "h " : "") + String(m).padStart(h ? 2 : 1, "0") + "m " + String(s).padStart(2, "0") + "s";
}
function tickMarket() {
  const { wd, mins, secs } = etParts();
  const weekday = !["Sat", "Sun"].includes(wd);
  const open = weekday && mins >= 570 && mins < 960;
  let label;
  if (open) label = `Market open · closes in ${hms((960 - mins) * 60 - secs)}`;
  else if (weekday && mins < 570) label = `Market closed · opens in ${hms((570 - mins) * 60 - secs)}`;
  else label = "Market closed";
  const el = $("#market");
  el.className = "pill " + (open ? "mk-open" : "mk-closed");
  setHTML(el, `<span class="live-dot ${open ? "on" : ""}"></span><span class="mono">${label}</span>`);
}
tickMarket(); setInterval(tickMarket, 1000);

// ---- line chart ------------------------------------------------------------------
let chartSig = {};
function lineChart(el, series, { step = false, area = false, emptyText = "No data yet", spark = false, zero } = {}) {
  const pts = series.flatMap((s) => s.points);
  const sig = JSON.stringify([el.clientWidth, el.clientHeight, series.map((s) => s.points.length + ":" + (s.points.at(-1)?.y ?? ""))]);
  const key = el.id || el.dataset.key;
  const first = !(key in chartSig);
  if (chartSig[key] === sig) return;
  chartSig[key] = sig;
  el.innerHTML = "";
  if (!pts.length) { if (!spark) el.innerHTML = `<div class="empty">${emptyText}</div>`; return; }
  const W = el.clientWidth, H = el.clientHeight;
  const m = spark ? { l: 2, r: 2, t: 4, b: 4 } : { l: 58, r: series.length > 1 ? 72 : 12, t: 8, b: 24 };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const withZero = zero ?? (series.length > 1 || spark);
  if (withZero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  if (x0 === x1) { x0 -= 3600e3; x1 += 3600e3; }
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
  const X = (x) => m.l + (x - x0) / (x1 - x0) * (W - m.l - m.r);
  const Y = (y) => m.t + (1 - (y - y0) / (y1 - y0)) * (H - m.t - m.b);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const add = (tag, attrs, parent = svg) => { const n = document.createElementNS(ns, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent.appendChild(n); return n; };
  if (!spark) {
    for (let i = 0; i <= 4; i++) {
      const v = y0 + (y1 - y0) * i / 4, y = Y(v);
      add("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: "var(--grid)", "stroke-width": 1 });
      const t = add("text", { x: m.l - 8, y: y + 4, "text-anchor": "end", "font-size": 11, fill: "var(--text-muted)", "font-family": "JetBrains Mono, monospace" });
      t.textContent = usd(v);
    }
    const nx = W < 480 ? 2 : 3;   // fewer date labels on narrow screens
    for (let i = 0; i <= nx; i++) {
      const v = x0 + (x1 - x0) * i / nx;
      const t = add("text", { x: X(v), y: H - 6, "text-anchor": i === 0 ? "start" : i === nx ? "end" : "middle", "font-size": 11, fill: "var(--text-muted)" });
      const longSpan = x1 - x0 > 300 * 864e5;   // multi-year charts show the year instead of the day
      t.textContent = new Date(v).toLocaleDateString(undefined, longSpan ? { month: "short", year: "numeric" } : { month: "short", day: "numeric" });
    }
  }
  if (withZero && y0 < 0 && y1 > 0)
    add("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: "var(--text-muted)", "stroke-width": 1, "stroke-dasharray": spark ? "2 3" : "", opacity: spark ? .5 : 1 });
  const defs = add("defs", {});
  series.forEach((s, si) => {
    if (!s.points.length) return;
    let d = "";
    s.points.forEach((p, i) => {
      if (i === 0) d += `M${X(p.x)},${Y(p.y)}`;
      else d += step ? `H${X(p.x)}V${Y(p.y)}` : `L${X(p.x)},${Y(p.y)}`;
    });
    if (step) d += `H${X(x1)}`;
    if (area) {
      const gid = `g-${key}-${si}`;
      const g = add("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      add("stop", { offset: 0, "stop-color": s.color, "stop-opacity": .28 }, g);
      add("stop", { offset: 1, "stop-color": s.color, "stop-opacity": 0 }, g);
      const base = Y(Math.max(y0, Math.min(y1, spark ? 0 : y0)));
      add("path", { d: `${d}V${base}H${X(s.points[0].x)}Z`, fill: `url(#${gid})`, class: first && !reduced ? "fade-in" : "" });
    }
    const path = add("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" });
    if (first && !reduced) {
      const len = path.getTotalLength ? path.getTotalLength() : 2000;
      path.style.setProperty("--len", len); path.style.setProperty("--i", si); path.classList.add("draw");
    }
    const lastP = s.points[s.points.length - 1];
    if (series.length > 1 || !spark) {
      add("circle", { cx: step ? X(x1) : X(lastP.x), cy: Y(lastP.y), r: 3.5, fill: s.color, stroke: "var(--surface-solid)", "stroke-width": 2, class: first && !reduced ? "fade-in" : "" });
    }
    if (series.length > 1) {
      const t = add("text", { x: W - m.r + 8, y: Y(lastP.y) + 4, "font-size": 11, "font-weight": 600, fill: "var(--text-secondary)", class: first && !reduced ? "fade-in" : "" });
      t.textContent = s.label;
    }
  });
  el.appendChild(svg);
  if (spark) return;
  // hover layer: crosshair + tooltip
  const cross = add("line", { y1: m.t, y2: H - m.b, stroke: "var(--text-muted)", "stroke-width": 1, "stroke-dasharray": "3 3", visibility: "hidden" });
  const dots = series.map((s) => add("circle", { r: 4.5, fill: s.color, stroke: "var(--surface-solid)", "stroke-width": 2, visibility: "hidden" }));
  const hit = add("rect", { x: m.l, y: 0, width: Math.max(0, W - m.l - m.r), height: H, fill: "transparent" });
  const tip = document.createElement("div"); tip.className = "tip"; el.appendChild(tip);
  const valueAt = (s, x) => { let v = null; for (const p of s.points) { if (p.x <= x) v = p; else break; } return v; };
  hit.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    const xv = x0 + ((e.clientX - r.left) * (W / r.width) - m.l) / (W - m.l - m.r) * (x1 - x0);
    let best = pts[0].x; for (const p of pts) if (Math.abs(p.x - xv) < Math.abs(best - xv)) best = p.x;
    cross.setAttribute("x1", X(best)); cross.setAttribute("x2", X(best)); cross.setAttribute("visibility", "visible");
    let rows = "";
    series.forEach((s, i) => {
      const v = valueAt(s, best);
      if (!v) { dots[i].setAttribute("visibility", "hidden"); return; }
      dots[i].setAttribute("cx", X(best)); dots[i].setAttribute("cy", Y(v.y)); dots[i].setAttribute("visibility", "visible");
      rows += `<div><span class="sw" style="background:${s.color}"></span>${esc(s.label)} <b class="mono">${usd(v.y, series.length > 1)}</b></div>`;
    });
    tip.innerHTML = `<div class="muted">${new Date(best).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>${rows}`;
    tip.style.display = "block";
    const left = X(best) / W * el.clientWidth;
    tip.style.left = Math.max(4, Math.min(left + 12, el.clientWidth - tip.offsetWidth - 4)) + "px";
    tip.style.top = "6px";
  });
  hit.addEventListener("pointerleave", () => { tip.style.display = "none"; cross.setAttribute("visibility", "hidden"); dots.forEach((d) => d.setAttribute("visibility", "hidden")); });
}

function table(head, rows) {
  return `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
    rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

