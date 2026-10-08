// HTML side of the dashboard: top bar, crew roster, panels, toasts, day ribbon and ticker.
import { $, $$, esc, money, pct, cls, fmtDay, marketStatus, clock } from "./util.js";
import { dayChart, equityChart, sparkline } from "./charts.js";

const STATUS = {
  watching: { label: "watching", c: "cyan" }, call: { label: "in a call", c: "up" }, put: { label: "in a put", c: "down" },
  "target hit": { label: "target hit", c: "gold" }, halted: { label: "halted", c: "down" }, closed: { label: "clocked out", c: "grey" },
};
const st = (w) => STATUS[w.position ? w.position.right : w.status] || { label: w.status, c: "grey" };
const dayOf = (w, d) => (w.days && w.days[d]) || { pnl: 0, bars: [], trades: [], signals: [], opening_range: [null, null] };
const changeOf = (dl) => { const b = dl.bars; if (!b?.length) return null; const o = b[0][4] ?? b[0][1]; return (b[b.length - 1][1] - o) / o; };

function bar(value, max, color) {
  const w = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return `<span class="mbar"><i style="width:${w}%;background:var(--${color})"></i></span>`;
}
function targetBar(w) {
  const pnl = w.pnl_today + (w.unrealized || 0);
  const pos = pnl >= 0, lim = pos ? w.target : w.max_loss;
  const p = lim > 0 ? Math.min(1, Math.abs(pnl) / lim) : 0;
  return `<span class="tbar ${pos ? "" : "neg"}" title="${pos ? "toward daily target" : "toward daily loss limit"}"><i style="width:${p * 100}%"></i></span>`;
}

export class UI {
  constructor(h) {
    this.h = h; // handlers: select(name), pickDay(d), settings(k,v), resetView()
    this.state = null;
    this.stats = null;
    this.panel = null; // {kind, name}
    this.day = null;
    $("#panel .close").onclick = () => this.close();
    $$("[data-act]").forEach((b) => (b.onclick = () => this.action(b.dataset.act)));
    setInterval(() => this.tick(), 1000);
    this.tick();
  }

  action(a) {
    if (a === "stats") return this.panel?.kind === "stats" ? this.close() : this.openStats();
    if (a === "payroll") return this.panel?.kind === "payroll" ? this.close() : this.openPayroll();
    if (a === "help") return this.panel?.kind === "help" ? this.close() : this.openHelp();
    if (a === "settings") return $("#settings").toggleAttribute("hidden");
    if (a === "reset") return this.h.resetView();
    if (a === "roster") return document.body.classList.toggle("roster-open");
  }

  tick() {
    $("#clock").textContent = clock();
    const m = marketStatus();
    const el = $("#market");
    el.textContent = m.label;
    el.className = "market " + (m.open ? "open" : "closed");
    this.health();
  }

  /** Connection dot: live / replay / stale / offline. */
  health(err) {
    if (err !== undefined) this.err = err;
    const dot = $("#conn"), s = this.state;
    let kind = "ok", text = "live";
    if (this.err) { kind = "bad"; text = this.err; }
    else if (!s || s.error) { kind = "warn"; text = s?.error || "connecting…"; }
    else if (!/^(alpaca|sim)/.test(s.mode)) { kind = "replay"; text = `replay of a ${s.mode} run`; }
    else if (s.written_at && marketStatus().open && Date.now() - Date.parse(s.written_at) > 180000) { kind = "warn"; text = `stale: the bot hasn't written for ${Math.round((Date.now() - Date.parse(s.written_at)) / 60000)} min`; }
    dot.className = "dot " + kind;
    dot.title = text;
    $("#conn-text").textContent = kind === "ok" ? "" : text;
  }

  // ------------------------------------------------------------------ main render
  render(s, day) {
    this.state = s;
    this.day = day || s.day;
    this.health(null);
    if (s.error) { $("#kpis").innerHTML = `<span class="muted">${esc(s.error)}</span>`; return; }
    $("#cityName").textContent = s.city;
    $("#mode").textContent = s.mode;
    this.kpis(s);
    this.roster(s);
    this.ribbon(s);
    this.tape(s);
    if (this.panel?.kind === "tower") this.openTower(this.panel.name, true);
    else if (this.panel?.kind === "payroll") this.openPayroll(true);
  }

  kpis(s) {
    const ws = s.workers, today = s.day;
    const open = ws.reduce((a, w) => a + (w.unrealized || 0), 0);
    const trades = ws.flatMap((w) => dayOf(w, today).trades);
    const wins = trades.filter((t) => t.pnl > 0).length;
    const v = s.vault, tgt = v.target > 0 ? Math.min(1, Math.max(0, v.today / v.target)) : null;
    $("#kpis").innerHTML = [
      ["Today", `<b class="${cls(v.today)}">${money(v.today)}</b>`],
      ["Open P&L", `<b class="${cls(open)}">${money(open)}</b>`],
      ["Trades", `<b>${trades.length}</b>`],
      ["Win rate", `<b>${trades.length ? pct(wins / trades.length) : "—"}</b>`],
      ["Positions", `<b>${ws.filter((w) => w.position).length}/${ws.length}</b>`],
      tgt == null ? null : ["Vault target", `<span class="tbar wide"><i style="width:${tgt * 100}%"></i></span><small>${pct(tgt)}</small>`],
    ].filter(Boolean).map(([k, val]) => `<div class="kpi"><span>${k}</span>${val}</div>`).join("");
  }

  roster(s) {
    const box = $("#roster-list");
    const today = s.day;
    if (box.children.length !== s.workers.length) {
      box.innerHTML = s.workers.map((w, i) => `<div class="crew" data-name="${esc(w.name)}" tabindex="0">
        <div class="r1"><span class="sdot"></span><b class="nm"></b><kbd>${i + 1}</kbd><span class="px"></span></div>
        <div class="r2"><span class="chip"></span><span class="pnl"></span></div>
        <div class="r3"></div><canvas class="spark"></canvas></div>`).join("");
      $$(".crew", box).forEach((el) => { el.onclick = () => this.h.select(el.dataset.name); el.onkeydown = (e) => e.key === "Enter" && el.click(); });
    }
    s.workers.forEach((w, i) => {
      const el = box.children[i], status = st(w), dl = dayOf(w, today), ch = changeOf(dl);
      el.querySelector(".sdot").className = "sdot " + status.c;
      el.querySelector(".nm").textContent = w.name;
      el.querySelector(".px").innerHTML = `${esc(w.symbol)} ${w.spot ? w.spot.toFixed(2) : ""} <span class="${cls(ch)}">${ch == null ? "" : (ch >= 0 ? "+" : "") + (ch * 100).toFixed(2) + "%"}</span>`;
      const chip = el.querySelector(".chip");
      chip.className = "chip " + status.c;
      chip.textContent = w.position ? `${w.position.right === "call" ? "▲" : "▼"} ${w.position.qty}x ${money(w.unrealized)}` : status.label;
      const pnl = el.querySelector(".pnl");
      pnl.className = "pnl " + cls(w.pnl_today); pnl.textContent = money(w.pnl_today);
      el.querySelector(".r3").innerHTML = targetBar(w) + `<small>${w.trades_today ?? dl.trades.length}/${w.max_trades ?? "∞"} trades</small>`;
      el.classList.toggle("selected", this.panel?.kind === "tower" && this.panel.name === w.name);
      const closes = dl.bars.map((b) => b[1]);
      if (closes.length > 1) sparkline(el.querySelector(".spark"), closes, getComputedStyle(document.documentElement).getPropertyValue(ch >= 0 ? "--up" : "--down"));
    });
  }

  ribbon(s) {
    const r = $("#ribbon"), max = Math.max(1, ...s.history.map((h) => Math.abs(h.pnl)));
    const total = s.history.reduce((a, h) => a + h.pnl, 0);
    const atEnd = r.scrollLeft + r.clientWidth >= r.scrollWidth - 20;
    r.innerHTML = `<div class="chip-total"><span>${s.history.length} day${s.history.length === 1 ? "" : "s"}</span><b class="${cls(total)}">${money(total)}</b></div>` +
      s.history.map((h) => `<button class="day ${h.date === this.day ? "sel" : ""} ${h.date === s.day ? "live" : ""}" data-d="${h.date}">
        <span class="d">${fmtDay(h.date)}</span><b class="${cls(h.pnl)}">${money(h.pnl)}</b>
        <i class="${cls(h.pnl)}" style="height:${Math.max(2, (Math.abs(h.pnl) / max) * 18)}px"></i></button>`).join("");
    $$(".day", r).forEach((b) => (b.onclick = () => this.h.pickDay(b.dataset.d === s.day ? null : b.dataset.d)));
    if (atEnd || !this.ribbonInit) { r.scrollLeft = r.scrollWidth; this.ribbonInit = true; }
  }

  tape(s) {
    const html = s.tape.slice(0, 20).map((l) => {
      const k = /SELL.*\[(target)\]|target hit/.test(l) ? "up" : /\[(stop|flip|time|eod)\].*-\d|max loss|failed/.test(l) ? "down" : /BUY/.test(l) ? "cyan" : "";
      return `<span class="${k}">${esc(l)}</span>`;
    }).join('<span class="sep">◆</span>');
    const inner = $("#tape .tape-inner");
    if (inner.dataset.html !== html) { inner.dataset.html = html; inner.innerHTML = html + '<span class="sep">◆</span>' + html; }
  }

  labelHTML(w) {
    const status = st(w), p = w.position;
    const line = p ? `${p.right === "call" ? "▲ CALL" : "▼ PUT"} ${p.qty}x · <span class="${cls(w.unrealized)}">${money(w.unrealized)}</span>` : status.label;
    return `<div class="tl-name"><span class="sdot ${status.c}"></span>${esc(w.name)}</div><div class="tl-st">${line}</div>
      <div class="tl-pnl ${cls(w.pnl_today)}">${money(w.pnl_today)}</div>${targetBar(w)}`;
  }

  vaultHTML(s) {
    const v = s.vault;
    const tgt = v.target > 0 ? `<span class="tbar wide"><i style="width:${Math.min(100, Math.max(0, (v.today / v.target) * 100))}%"></i></span>` : "";
    return `<div class="vh">THE VAULT · ${fmtDay(s.day)}</div><div class="vv ${cls(v.today)}">${money(v.today)}</div>${tgt}
      <div class="vf">${v.on_shift} on shift${v.closed ? " · CLOSED" : ""} · tap for payroll</div>`;
  }

  // ------------------------------------------------------------------ panels
  show(kind, name, html) {
    const p = $("#panel");
    const keep = this.panel && this.panel.kind === kind && this.panel.name === name ? p.querySelector(".pbody").scrollTop : 0;
    this.panel = { kind, name };
    p.querySelector(".pbody").innerHTML = html;
    p.querySelector(".pbody").scrollTop = keep;
    p.hidden = false;
    document.body.classList.add("panel-open");
  }

  close() {
    $("#panel").hidden = true;
    document.body.classList.remove("panel-open");
    this.panel = null;
    this.h.select(null);
  }

  openTower(name, refresh = false) {
    const s = this.state, w = s?.workers.find((x) => x.name === name);
    if (!w) return;
    const day = this.day, dl = dayOf(w, day), live = day === s.day, status = st(w), p = live ? w.position : null;
    const wins = dl.trades.filter((t) => t.pnl > 0), ch = changeOf(dl);
    const best = dl.trades.reduce((a, t) => Math.max(a, t.pnl), 0), worst = dl.trades.reduce((a, t) => Math.min(a, t.pnl), 0);
    const r = w.rules || {};
    let pos = "";
    if (p) {
      const upnl = (p.mark - p.entry) * 100 * p.qty, ppct = p.entry ? p.mark / p.entry - 1 : 0;
      const span = p.tp - p.sl || 1, at = Math.min(100, Math.max(0, ((p.mark - p.sl) / span) * 100)), ent = ((p.entry - p.sl) / span) * 100;
      pos = `<div class="card pos ${p.right}">
        <div class="row"><b>${p.right === "call" ? "▲ CALL" : "▼ PUT"} ${p.qty}x ${esc(p.contract)}</b><span class="${cls(upnl)} big">${money(upnl)} <small>${(ppct * 100).toFixed(1)}%</small></span></div>
        <div class="row muted"><span>entry ${p.entry.toFixed(2)} → mark ${p.mark.toFixed(2)}</span><span>${esc(p.triggers.join("+"))} · ${p.opened}</span></div>
        <div class="slt"><span class="down">stop ${p.sl.toFixed(2)}</span><div class="track"><i class="ent" style="left:${ent}%"></i><i class="mark" style="left:${at}%"></i></div><span class="up">target ${p.tp.toFixed(2)}</span></div>
        <div class="row muted"><span>held ${p.held_min}m of ${p.max_hold_min}m</span><span class="mbar"><i style="width:${Math.min(100, (p.held_min / p.max_hold_min) * 100)}%;background:var(--gold)"></i></span></div>
      </div>`;
    }
    const trades = dl.trades.slice().reverse().map((t) => `<tr><td>${t.opened}→${t.closed}</td><td class="${t.right === "call" ? "up" : "down"}">${t.right === "call" ? "▲ CALL" : "▼ PUT"}</td>
      <td class="hide-sm">${esc(t.triggers.join("+"))}</td><td>${t.entry.toFixed(2)}→${t.exit.toFixed(2)}</td><td><span class="tag ${t.reason}">${esc(t.reason)}</span></td><td class="${cls(t.pnl)}">${money(t.pnl)}</td></tr>`).join("");
    const sigs = dl.signals.slice().reverse().map((x) => `<tr><td>${x.t}</td><td class="${x.dir === "call" ? "up" : "down"}">${x.dir.toUpperCase()}</td><td>${esc(x.triggers.join("+"))}</td><td>${x.price}</td></tr>`).join("");
    this.show("tower", name, `
      <div class="ph"><div><h2>${esc(w.name)} <small>${esc(w.symbol)} · ${esc(w.district)}</small></h2>
        <div class="muted">${fmtDay(day, { weekday: "long", month: "short", day: "numeric" })}${live ? "" : " · history"} · <span class="chip ${status.c}">${live ? status.label : "replay"}</span></div></div>
        <div class="pr"><div class="big ${cls(dl.pnl)}">${money(dl.pnl)}</div><div class="muted">${w.symbol} ${dl.bars.length ? dl.bars[dl.bars.length - 1][1].toFixed(2) : "—"} <span class="${cls(ch)}">${ch == null ? "" : (ch * 100).toFixed(2) + "%"}</span></div></div></div>
      ${pos}
      <div class="chartbox"><canvas id="chart"></canvas></div>
      <div class="legend"><span class="lg-c">▮ candles</span><span style="color:var(--vwap)">— VWAP</span><span style="color:var(--ema)">— EMA 50</span><span style="color:var(--or)">┅ opening range</span><span class="up">▲ call</span><span class="down">▼ put</span><span>● exit</span></div>
      <div class="grid4">
        <div class="stat"><span>trades</span><b>${dl.trades.length}</b></div><div class="stat"><span>win rate</span><b>${dl.trades.length ? pct(wins.length / dl.trades.length) : "—"}</b></div>
        <div class="stat"><span>best</span><b class="up">${money(best)}</b></div><div class="stat"><span>worst</span><b class="down">${money(worst)}</b></div>
      </div>
      <h3>Trades</h3>
      <div class="tablewrap"><table><thead><tr><th>time</th><th>side</th><th class="hide-sm">trigger</th><th>premium</th><th>exit</th><th>P&L</th></tr></thead><tbody>${trades || '<tr><td colspan="6" class="muted">no trades</td></tr>'}</tbody></table></div>
      <details ${dl.signals.length < 12 ? "open" : ""}><summary>Signals (${dl.signals.length})</summary>
      <div class="tablewrap"><table><thead><tr><th>time</th><th>side</th><th>trigger</th><th>price</th></tr></thead><tbody>${sigs || '<tr><td colspan="4" class="muted">none</td></tr>'}</tbody></table></div></details>
      <details><summary>Rules</summary><div class="rules">
        <span>triggers <b>${esc(w.triggers.join(", "))}</b></span><span>expiry <b>${r.dte === 0 ? "0DTE" : r.dte + "DTE"}</b></span><span>size <b>${r.contracts} contracts</b></span>
        <span>take profit <b>+${r.take_profit_pct}%</b></span><span>stop <b>−${r.stop_loss_pct}%</b></span><span>max hold <b>${r.max_hold_min}m</b></span>
        <span>entries <b>${r.entry}</b></span><span>flatten <b>${r.flatten_at}</b></span><span>daily target <b>${money(w.target)}</b></span><span>max loss <b>${money(-w.max_loss)}</b></span>
      </div></details>`);
    const cv = $("#chart");
    this.chartRedraw = dayChart(cv, dl, p);
  }

  openPayroll(refresh = false) {
    const s = this.state; if (!s || s.error) return;
    const day = this.day, rows = s.workers.map((w) => ({ w, dl: dayOf(w, day) }));
    const max = Math.max(1, ...rows.map((r) => Math.abs(r.dl.pnl))), total = rows.reduce((a, r) => a + r.dl.pnl, 0);
    this.show("payroll", null, `<div class="ph"><div><h2>Payroll</h2><div class="muted">${fmtDay(day, { weekday: "long", month: "short", day: "numeric" })}</div></div>
      <div class="pr"><div class="big ${cls(total)}">${money(total)}</div></div></div>
      <div class="tablewrap"><table class="pay"><thead><tr><th>worker</th><th>trades</th><th>win</th><th></th><th>P&L</th></tr></thead><tbody>${rows.map(({ w, dl }) => {
        const n = dl.trades.length, wins = dl.trades.filter((t) => t.pnl > 0).length;
        return `<tr data-name="${esc(w.name)}"><td><b>${esc(w.name)}</b><br><small class="muted">${esc(w.symbol)}</small></td><td>${n}</td><td>${n ? pct(wins / n) : "—"}</td><td>${bar(dl.pnl, max, dl.pnl >= 0 ? "up" : "down")}</td><td class="${cls(dl.pnl)}">${money(dl.pnl)}</td></tr>`;
      }).join("")}</tbody></table></div><p class="muted">Tap a worker to open its tower.</p>`);
    $$("#panel tr[data-name]").forEach((tr) => (tr.onclick = () => this.h.select(tr.dataset.name)));
  }

  async openStats() {
    this.show("stats", null, `<h2>Performance</h2><p class="muted">loading…</p>`);
    try {
      const r = await fetch("/api/stats", { cache: "no-store" });
      this.stats = await r.json();
    } catch (e) { this.show("stats", null, `<h2>Performance</h2><p class="down">couldn't load stats: ${esc(e.message)}</p>`); return; }
    if (this.panel?.kind !== "stats") return;
    const s = this.stats;
    if (s.error) { this.show("stats", null, `<h2>Performance</h2><p class="muted">${esc(s.error)}</p>`); return; }
    const t = s.totals;
    const table = (title, rows) => {
      const max = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
      return `<h3>${title}</h3><div class="tablewrap"><table><thead><tr><th></th><th>trades</th><th>win</th><th></th><th>P&L</th></tr></thead><tbody>${rows.map((r) =>
        `<tr><td>${esc(r.key)}</td><td>${r.trades}</td><td>${pct(r.wins / r.trades)}</td><td>${bar(r.pnl, max, r.pnl >= 0 ? "up" : "down")}</td><td class="${cls(r.pnl)}">${money(r.pnl)}</td></tr>`).join("")}</tbody></table></div>`;
    };
    const stat = (k, v, c = "") => `<div class="stat"><span>${k}</span><b class="${c}">${v}</b></div>`;
    this.show("stats", null, `<div class="ph"><div><h2>Performance</h2><div class="muted">${t.days} days · ${t.trades} trades</div></div>
      <div class="pr"><div class="big ${cls(t.total)}">${money(t.total)}</div><div class="muted">${money(t.avg_day)} / day</div></div></div>
      <div class="chartbox short"><canvas id="equity"></canvas></div>
      <div class="grid4">
        ${stat("green days", `${t.green_days}/${t.days}`)}${stat("win rate", pct(t.win_rate))}${stat("profit factor", t.profit_factor ?? "∞")}${stat("expectancy", money(t.expectancy), cls(t.expectancy))}
        ${stat("avg win", money(t.avg_win), "up")}${stat("avg loss", money(t.avg_loss), "down")}${stat("max drawdown", money(t.max_drawdown), "down")}${stat("streak", t.streak > 0 ? `${t.streak} green` : t.streak < 0 ? `${-t.streak} red` : "—", cls(t.streak))}
        ${stat("best day", t.best_day ? `${money(t.best_day.pnl)}` : "—", "up")}${stat("worst day", t.worst_day ? money(t.worst_day.pnl) : "—", "down")}
      </div>
      ${table("By worker", s.by_worker)}${table("By trigger", s.by_trigger)}${table("By exit", s.by_exit)}${table("By side", s.by_side)}${table("By entry hour", s.by_hour)}
      <p class="muted small">Paper fills. Backtest fills are modelled (Black-Scholes), not real quotes.</p>`);
    this.chartRedraw = equityChart($("#equity"), s.equity);
  }

  openHelp() {
    this.show("help", null, `<h2>Reading the city</h2>
      <ul class="help">
        <li><b>Towers</b> are bots. Height follows today's P&L (realised + open).</li>
        <li><b>Ring on top</b> fills <span class="up">green</span> toward the daily profit target and <span class="down">red</span> toward the loss limit; it turns <span class="gold">gold</span> when the target is hit.</li>
        <li><b>Beams</b>: <span class="up">green</span> = a call is open, <span class="down">red</span> = a put is open. A flash means a new entry.</li>
        <li><b>Packets</b>: a <span class="gold">gold</span> orb flies into the vault when a trade closes green; a <span class="down">red</span> orb flies out to the tower on a loss.</li>
        <li><b>Links</b> pulse faster while a bot holds a position. Tower colour = status (cyan watching, gold target hit, grey clocked out).</li>
        <li><b>The vault</b> glows green or red with the city's day; the ground pulse matches it. Gold sparks rise while the day is green.</li>
        <li><b>Status dot</b> (top left): green live, blue replay of a backtest, amber stale/connecting, red offline.</li>
      </ul>
      <h3>Keys</h3><div class="keys"><kbd>1</kbd>-<kbd>9</kbd> bot · <kbd>S</kbd> stats · <kbd>P</kbd> payroll · <kbd>R</kbd> reset view · <kbd>A</kbd> auto-orbit · <kbd>←</kbd><kbd>→</kbd> day · <kbd>Esc</kbd> close</div>`);
  }

  toast(html, kind = "") {
    const box = $("#toasts"), el = document.createElement("div");
    el.className = "toast " + kind;
    el.innerHTML = html;
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => el.classList.add("out"), 5000);
    setTimeout(() => el.remove(), 5600);
  }
}
