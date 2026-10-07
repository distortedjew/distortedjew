/* Backtest panel on the bot detail page: a form, a progress bar and animated results. Needs app.js. */
const BT_LABELS = {
  take_profit: ["Take profit", "share of credit/debit, e.g. 0.5 = +50%"],
  stop_loss: ["Stop loss", "share of credit/debit, e.g. 1 = −100% (0 = no stop)"],
  exit_dte: ["Exit at DTE", "close with this many days left (0 = hold)"],
  max_open: ["Max open", "positions at the same time"],
  min_days_between: ["Days between entries", "calendar days"],
  short_delta: ["Short delta", "e.g. 0.20"],
  long_delta: ["Long delta", "e.g. 0.60"],
  put_delta: ["Put delta", "cash-secured put"],
  call_delta: ["Call delta", "covered call"],
  width: ["Spread width $", "strike distance"],
  max_width: ["Max debit width $", "0 = by delta; 1 = $1-wide (small accounts)"],
  require_dip: ["Require dip", "1 = enter only on dips, 0 = any uptrend day"],
  allow_bearish: ["Allow bearish", "1 = calls and puts, 0 = bullish only"],
};
const MODEL_LABELS = {
  vol_premium: ["Vol premium ×", "implied vol = realised vol × this"],
  put_skew: ["Put skew", "extra IV for out-of-the-money puts"],
  spread_pct: ["Bid/ask spread", "share of option price"],
  slippage: ["Slippage", "0 = fill at mid, 1 = at the far side"],
  fee_per_contract: ["Fee / contract $", "regulatory + broker fees"],
};
const btRuns = [];   // this session's runs, for comparing settings

function btSection(b) {
  return `
  <section class="panel enter bt" id="backtest" style="--i:10;margin-bottom:14px">
    <div class="bt-head">
      <div><h2>Backtest ${esc(b.title)}</h2>
        <div class="sub">Replays ${esc(b.underlying)}'s real daily prices through this bot's actual code. Option prices are modelled, not historical quotes.</div></div>
      <span class="bt-badge">Lab</span>
    </div>
    <form id="bt-form" autocomplete="off">
      <div class="bt-row">
        <div class="seg" role="radiogroup" aria-label="Period">
          ${[1, 2, 3, 5, 8].map((y) => `<label><input type="radio" name="years" value="${y}" ${y === 3 ? "checked" : ""}><span>${y}Y</span></label>`).join("")}
          <label><input type="radio" name="years" value="custom"><span>Custom</span></label>
        </div>
        <label class="fld bt-dates" hidden><span>From</span><input type="date" name="start"></label>
        <label class="fld bt-dates" hidden><span>To</span><input type="date" name="end"></label>
        <label class="fld"><span>Starting capital $</span><input type="number" name="capital" value="100000" min="100" step="100"></label>
      </div>
      <h3>Strategy</h3><div class="bt-grid" id="bt-params"></div>
      <h3>Risk</h3>
      <div class="bt-grid">
        <label class="fld"><span>Risk per trade</span><input type="number" name="risk_per_trade_pct" step="0.005" min="0.001" max="1" placeholder="0.02"><small>share of equity a spread may lose</small></label>
        <label class="fld"><span>Bot allocation</span><input type="number" name="allocation_pct" step="0.05" min="0.01" max="1" placeholder="from .env"><small>share of equity the bot may tie up</small></label>
      </div>
      <details class="bt-model"><summary>Pricing model</summary><div class="bt-grid" id="bt-model"></div></details>
      <div class="bt-actions">
        <button type="submit" class="btn-run" id="bt-run"><span class="btn-glow"></span>Run backtest</button>
        <button type="button" class="btn-ghost" id="bt-reset">Reset to live settings</button>
        <div class="bt-progress" id="bt-progress" hidden><div class="bar"><i></i></div><span class="mono" id="bt-pct">0%</span></div>
      </div>
      <div class="bt-error" id="bt-error" hidden></div>
    </form>
    <div id="bt-results"></div>
    <div id="bt-runs"></div>
  </section>`;
}

let btDefaults = null;
async function btInit(b) {
  const form = $("#bt-form");
  try { btDefaults = await (await fetch("api/backtest-defaults")).json(); } catch { btDefaults = { [b.name]: {}, _model: {} }; }
  const fill = () => {
    const d = btDefaults[b.name] || {};
    $("#bt-params").innerHTML = Object.entries(d).map(([k, v]) => `<label class="fld"><span>${esc(BT_LABELS[k]?.[0] ?? k)}</span>
      <input type="number" step="any" name="p_${k}" value="${v}" data-default="${v}"><small>${esc(BT_LABELS[k]?.[1] ?? "")}</small></label>`).join("");
    $("#bt-model").innerHTML = Object.entries(btDefaults._model || {}).map(([k, v]) => `<label class="fld"><span>${esc(MODEL_LABELS[k]?.[0] ?? k)}</span>
      <input type="number" step="any" name="m_${k}" value="${v}"><small>${esc(MODEL_LABELS[k]?.[1] ?? "")}</small></label>`).join("");
    form.risk_per_trade_pct.value = ""; form.allocation_pct.value = "";
    markChanged();
  };
  const markChanged = () => form.querySelectorAll("[data-default]").forEach((i) => i.closest(".fld").classList.toggle("changed", i.value !== i.dataset.default));
  fill();
  form.addEventListener("input", markChanged);
  $("#bt-reset").onclick = fill;
  const end = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  form.end.value = end; form.start.value = new Date(Date.now() - 3 * 365 * 864e5).toISOString().slice(0, 10);
  form.querySelectorAll('[name="years"]').forEach((r) => r.onchange = () =>
    form.querySelectorAll(".bt-dates").forEach((x) => x.hidden = form.years.value !== "custom"));
  form.onsubmit = (e) => { e.preventDefault(); btRun(b); };
}

async function btRun(b) {
  const form = $("#bt-form"), err = $("#bt-error"), prog = $("#bt-progress"), btn = $("#bt-run");
  const req = { bot: b.name, capital: +form.capital.value, overrides: {}, model: {} };
  if (form.years.value === "custom") { req.start = form.start.value; req.end = form.end.value; } else req.years = +form.years.value;
  form.querySelectorAll('[name^="p_"]').forEach((i) => { if (i.value !== "") req.overrides[i.name.slice(2)] = +i.value; });
  form.querySelectorAll('[name^="m_"]').forEach((i) => { if (i.value !== "") req.model[i.name.slice(2)] = +i.value; });
  if (form.risk_per_trade_pct.value) req.risk_per_trade_pct = +form.risk_per_trade_pct.value;
  if (form.allocation_pct.value) req.allocation_pct = +form.allocation_pct.value;
  err.hidden = true; btn.disabled = true; prog.hidden = false; setProgress(0);
  try {
    const r = await fetch("api/backtest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    let job;
    for (;;) {
      await new Promise((res) => setTimeout(res, 400));
      job = await (await fetch("api/backtest/" + j.id, { cache: "no-store" })).json();
      setProgress(job.progress || 0);
      if (job.status !== "running") break;
    }
    if (job.status === "error") throw new Error(job.error);
    setProgress(1);
    btRuns.unshift({ n: btRuns.length + 1, req, res: job.result });
    btResults(b, job.result);
    btRunsTable(b);
    $("#bt-results").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  } catch (e) {
    err.textContent = "Backtest failed: " + e.message; err.hidden = false;
  } finally {
    btn.disabled = false; setTimeout(() => prog.hidden = true, 600);
  }
}

function setProgress(p) {
  $("#bt-progress i").style.width = Math.round(p * 100) + "%";
  $("#bt-pct").textContent = Math.round(p * 100) + "%";
}

const sp = (v) => v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v * 100).toFixed(1) + "%";

function btResults(b, r) {
  const s = r.stats, c = botColor(b.name);
  const tiles = [
    ["Total return", sp(s.total_return), cls(s.total_return), `buy &amp; hold ${sp(s.buy_hold_return)}`],
    ["Same-risk B&amp;H", sp(s.same_risk_buy_hold_return), cls(s.same_risk_buy_hold_return), `${Math.round((s.same_risk_stock_share || 0) * 100)}% in ${esc(r.underlying)}, rest cash`],
    ["Max drawdown", sp(s.max_drawdown), "neg", `B&amp;H ${sp(s.buy_hold_max_drawdown)}`],
    ["Sharpe", s.sharpe == null ? "—" : s.sharpe.toFixed(2), "", `B&amp;H ${s.buy_hold_sharpe == null ? "—" : s.buy_hold_sharpe.toFixed(2)} · CAGR ${sp(s.cagr)}`],
    ["Win rate", pct(s.win_rate), "", `${s.wins} / ${s.trades} trades`],
    ["Profit factor", s.profit_factor == null ? "—" : s.profit_factor.toFixed(2), "", `avg ${usd(s.avg_win, true)} / ${usd(s.avg_loss, true)}`],
    ["Time in market", pct(s.exposure), "", `fees ${usd(s.fees)}`],
    ["Best / worst", `${usd(s.best, true)}`, "pos", `worst ${usd(s.worst, true)}`],
  ];
  const months = Object.entries(s.monthly);
  const years = [...new Set(months.map(([m]) => m.slice(0, 4)))];
  const maxAbs = Math.max(0.005, ...months.map(([, v]) => Math.abs(v)));
  const reasons = Object.entries(s.exit_reasons).sort((x, y) => y[1].count - x[1].count);
  const maxC = Math.max(1, ...reasons.map(([, x]) => x.count));
  const overrides = Object.entries(r.overrides).filter(([k, v]) => btDefaults?.[b.name]?.[k] !== v);
  $("#bt-results").innerHTML = `
    <div class="bt-res">
      <div class="bt-banner"><b>${esc(r.underlying)} · ${esc(r.start)} → ${esc(r.end)}</b> · ${esc(r.data_source)}
        ${overrides.length ? ` · changed: ${overrides.map(([k, v]) => `<code>${esc(k)}=${esc(v)}</code>`).join(" ")}` : " · live settings"}
        <div class="muted">Option prices are modelled (Black-Scholes on realised vol × ${r.model.vol_premium}, ${Math.round(r.model.slippage * 100)}% slippage). Real fills, IV spikes and gaps will differ. Treat this as a check of the rules, not a forecast.</div></div>
      <div class="bt-kpis">${tiles.map(([k, v, cl, d], i) => `<div class="stat enter" style="--i:${i}"><div class="k">${k}</div><div class="v num ${cl}">${v}</div><div class="muted" style="font-size:11px">${d}</div></div>`).join("")}</div>
      <div class="bt-two">
        <div><h3>Equity vs buy &amp; hold ${esc(r.underlying)}</h3><div class="chart" id="bt-chart" style="--c:${c}"></div>
          <div class="legend"><span style="--c:${c}">${esc(b.title)}</span><span style="--c:var(--text-muted)">Buy &amp; hold ${esc(r.underlying)}</span></div></div>
        <div><h3>How trades ended</h3><div class="bars">${reasons.length ? reasons.map(([k, x], i) => `<div class="bar-row"><span>${esc(k)}</span>
          <div class="bar-track"><div class="bar-fill" style="--w:${x.count / maxC * 100}%;--i:${i};--c:${c}"></div></div>
          <span class="mono ${cls(x.pnl)}" style="text-align:right">${x.count}× ${usd(x.pnl, true)}</span></div>`).join("") : `<div class="none">No trades in this period. The setup never appeared.</div>`}</div>
          ${r.open_at_end ? `<div class="muted" style="font-size:12px;margin-top:8px">${r.open_at_end} position(s) still open at the end (included in equity at model prices).</div>` : ""}</div>
      </div>
      <h3>Monthly returns</h3>
      <div class="heat-wrap"><table class="heat"><thead><tr><th></th>${"JFMAMJJASOND".split("").map((m) => `<th>${m}</th>`).join("")}<th>Year</th></tr></thead><tbody>
        ${years.map((y, yi) => {
          let yr = 1;
          const cells = Array.from({ length: 12 }, (_, i) => {
            const v = s.monthly[`${y}-${String(i + 1).padStart(2, "0")}`];
            if (v == null) return `<td></td>`;
            yr *= 1 + v;
            const a = Math.min(1, Math.abs(v) / maxAbs);
            return `<td class="cell" style="--a:${(0.12 + a * 0.6).toFixed(2)};--hc:${v >= 0 ? "var(--good)" : "var(--bad)"};--d:${yi * 12 + i}" title="${y}-${i + 1}: ${sp(v)}">${(v * 100).toFixed(1)}</td>`;
          }).join("");
          return `<tr><th>${y}</th>${cells}<td class="mono ${cls(yr - 1)}" style="text-align:right;font-weight:700">${sp(yr - 1)}</td></tr>`;
        }).join("")}</tbody></table></div>
      <details class="table"><summary>All ${r.trades.length} trades</summary>
        <div class="hist-wrap"><table><thead><tr><th>Opened</th><th>Closed</th><th>Type</th><th>Legs</th><th class="r">Qty</th><th class="r">Entry</th><th class="r">Exit</th><th class="r">P&amp;L</th><th>Reason</th></tr></thead><tbody>
        ${r.trades.slice().reverse().slice(0, 500).map((t) => `<tr><td>${esc(t.opened_at.slice(0, 10))}</td><td>${esc((t.closed_at || "").slice(0, 10))}</td><td>${esc(t.kind.replace("_", " "))}</td>
          <td class="mono">${esc(legsText(t))}</td><td class="r mono">${t.qty}</td><td class="r mono">${t.entry_price.toFixed(2)}</td><td class="r mono">${t.exit_price == null ? "—" : t.exit_price.toFixed(2)}</td>
          <td class="r mono ${cls(t.pnl)}">${usd(t.pnl, true)}</td><td>${esc(t.exit_reason)}</td></tr>`).join("")}</tbody></table></div></details>
      <details class="table"><summary>Bot log (why it did or didn't trade)</summary>
        <div class="feed slim" style="max-height:320px">${r.events.slice().reverse().map((e) => `<div class="row lv-${esc(e.level)}"><div class="muted mono">${esc(e.ts.slice(0, 10))}</div>
          <div class="msg">${esc(e.message)}${e.repeat ? ` <span class="muted">(×${e.repeat} days)</span>` : ""}</div></div>`).join("") || `<div class="none">Nothing logged.</div>`}</div></details>
    </div>`;
  delete chartSig["bt-chart"];
  lineChart($("#bt-chart"), [
    { label: b.title, color: c, points: r.curve.map((p) => ({ x: Date.parse(p.t), y: p.v })) },
    { label: "Buy & hold", color: "var(--text-muted)", points: r.buy_hold.map((p) => ({ x: Date.parse(p.t), y: p.v })) },
  ], { area: false, zero: false });
}

function btRunsTable(b) {
  if (btRuns.length < 2) { $("#bt-runs").innerHTML = ""; return; }
  const d = btDefaults?.[b.name] || {};
  $("#bt-runs").innerHTML = `<h3>This session's runs</h3><div class="hist-wrap"><table><thead><tr><th>#</th><th>Period</th><th>Changed settings</th>
    <th class="r">Return</th><th class="r">Max DD</th><th class="r">Sharpe</th><th class="r">Win rate</th><th class="r">Trades</th></tr></thead><tbody>
    ${btRuns.map(({ n, res }) => {
      const s = res.stats, ch = Object.entries(res.overrides).filter(([k, v]) => d[k] !== v).map(([k, v]) => `${k}=${v}`).join(", ") || "live settings";
      return `<tr><td>${n}</td><td class="mono">${esc(res.start)} → ${esc(res.end)}</td><td>${esc(ch)}</td><td class="r mono ${cls(s.total_return)}">${sp(s.total_return)}</td>
      <td class="r mono">${sp(s.max_drawdown)}</td><td class="r mono">${s.sharpe == null ? "—" : s.sharpe.toFixed(2)}</td><td class="r mono">${pct(s.win_rate)}</td><td class="r mono">${s.trades}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}
