import { World } from "./world.js";
import { UI } from "./ui.js";
import { $, $$, esc, money, store } from "./util.js";

const isPhone = matchMedia("(max-width: 700px)").matches || matchMedia("(pointer: coarse)").matches;
const settings = {
  quality: store.get("quality", isPhone ? "medium" : "high"),
  labels: store.get("labels", true),
  autoRotate: store.get("autoRotate", false),
  toasts: store.get("toasts", true),
  sound: store.get("sound", false),
};

let state = null, selDay = null, selected = null;
const seen = { trades: new Map(), positions: new Map(), day: null };

const world = new World($("#scene"), { quality: settings.quality, onPick: (n) => (n === "vault" ? ui.openPayroll() : select(n)) });
const ui = new UI({
  select: (n) => select(n),
  pickDay: async (d) => { selDay = d; await load(); },
  resetView: () => world.resetView(),
});

function select(name) {
  selected = name;
  world.setSelected(name);
  if (!name) return;
  ui.openTower(name);
  world.focus(name);
  if (isPhone) document.body.classList.remove("roster-open");
}

// ------------------------------------------------------------------ settings
function applySettings() {
  world.setQuality(settings.quality);
  world.setAutoRotate(settings.autoRotate);
  document.body.classList.toggle("no-labels", !settings.labels);
  world.setLabelsVisible(settings.labels);
  $$("#settings [data-set]").forEach((el) => {
    const [k, v] = el.dataset.set.split("=");
    el.classList.toggle("on", v === undefined ? !!settings[k] : settings[k] === v);
  });
}
$$("#settings [data-set]").forEach((el) => (el.onclick = () => {
  const [k, v] = el.dataset.set.split("=");
  settings[k] = v === undefined ? !settings[k] : v;
  store.set(k, settings[k]);
  applySettings();
}));
applySettings();

// ------------------------------------------------------------------ sound
let audio;
function blip(up) {
  if (!settings.sound) return;
  try {
    audio = audio || new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
    o.frequency.setValueAtTime(up ? 660 : 330, t);
    o.frequency.exponentialRampToValueAtTime(up ? 990 : 220, t + 0.18);
    g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.26);
  } catch { /* audio blocked */ }
}

// ------------------------------------------------------------------ diffing: what happened since the last poll
function diff(s) {
  const fresh = seen.day !== s.day;
  for (const w of s.workers) {
    const dl = w.days?.[s.day];
    const n = dl ? dl.trades.length : 0, prevN = seen.trades.get(w.name);
    const pos = w.position ? w.position.occ : null, prevPos = seen.positions.get(w.name);
    if (!fresh && prevN != null && n > prevN) {
      for (const t of dl.trades.slice(prevN)) {
        world.tradeClosed(w.name, t.pnl);
        blip(t.pnl >= 0);
        if (settings.toasts) ui.toast(`<b>${esc(w.name)}</b> closed ${t.right.toUpperCase()} <span class="${t.pnl >= 0 ? "up" : "down"}">${money(t.pnl)}</span> <small>${esc(t.reason)}</small>`, t.pnl >= 0 ? "win" : "loss");
      }
    }
    if (!fresh && prevPos !== undefined && pos && pos !== prevPos) {
      world.tradeOpened(w.name);
      if (settings.toasts) ui.toast(`<b>${esc(w.name)}</b> bought ${w.position.qty}x ${esc(w.position.contract)} <small>${esc(w.position.triggers.join("+"))}</small>`, w.position.right);
    }
    seen.trades.set(w.name, n);
    seen.positions.set(w.name, pos);
  }
  seen.day = s.day;
}

// ------------------------------------------------------------------ polling
let loading = false, failures = 0;
async function load() {
  if (loading) return;
  loading = true;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch("/api/state" + (selDay ? "?day=" + encodeURIComponent(selDay) : ""), { cache: "no-store", signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const s = await r.json();
    failures = 0;
    state = s;
    if (s.error) { ui.render(s); return; }
    if (selDay && !s.history.some((h) => h.date === selDay)) selDay = null;
    world.setTitle(s.city);
    world.setDistricts([...new Set(s.workers.map((w) => w.district))]);
    world.ensureTowers(s.workers);
    for (const w of s.workers) {
      world.updateTower(w);
      const el = world.towerLabel(w.name);
      if (el) { const html = ui.labelHTML(w); if (el._html !== html) { el.innerHTML = html; el._html = html; } }
    }
    world.setVault(s.vault.today, ui.vaultHTML(s));
    diff(s);
    ui.render(s, selDay || s.day);
  } catch (e) {
    failures++;
    ui.health(e.name === "AbortError" ? "no answer in 15 s: is the server up and the SSH tunnel open?" : "offline: " + e.message);
  } finally { clearTimeout(timer); loading = false; }
}
(async function poll() {
  await load();
  setTimeout(poll, document.hidden ? 10000 : failures ? Math.min(15000, 2000 * failures) : 2000);
})();
document.addEventListener("visibilitychange", () => !document.hidden && load());

// ------------------------------------------------------------------ keyboard
addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea") || e.metaKey || e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (k === "escape") { $("#settings").hidden = true; return ui.close(); }
  if (k === "s") return ui.action("stats");
  if (k === "p") return ui.action("payroll");
  if (k === "h" || k === "?") return ui.action("help");
  if (k === "r") return world.resetView();
  if (k === "a") { settings.autoRotate = !settings.autoRotate; store.set("autoRotate", settings.autoRotate); return applySettings(); }
  if (/^[1-9]$/.test(k) && state?.workers?.[+k - 1]) return select(state.workers[+k - 1].name);
  if ((k === "arrowleft" || k === "arrowright") && state?.history?.length) {
    const days = state.history.map((h) => h.date), cur = days.indexOf(selDay || state.day);
    const nxt = days[Math.max(0, Math.min(days.length - 1, cur + (k === "arrowleft" ? -1 : 1)))];
    selDay = nxt === state.day ? null : nxt;
    load();
  }
});
addEventListener("resize", () => ui.chartRedraw?.());

// test/debug hook (read-only)
window.__scalpcity = { world, ui, get state() { return state; } };
