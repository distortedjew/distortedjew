export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function money(v, { cents = false } = {}) {
  v = Number(v) || 0;
  const n = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  return (v > 0 ? "+$" : v < 0 ? "−$" : "$") + n;
}
export const pct = (v, d = 0) => (v == null || !isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
export const cls = (v) => (v > 0 ? "up" : v < 0 ? "down" : "flat");

export function fmtDay(d, opts = { weekday: "short", month: "numeric", day: "numeric" }) {
  if (!d) return "";
  return new Date(d + "T12:00:00").toLocaleDateString(undefined, opts);
}

const etFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" });
export function etNow(date = new Date()) {
  const p = Object.fromEntries(etFmt.formatToParts(date).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return { weekday: p.weekday, hour, minute: Number(p.minute), second: Number(p.second), ymd: `${p.year}-${p.month}-${p.day}` };
}

/** US equity session status (ignores exchange holidays). */
export function marketStatus(date = new Date()) {
  const t = etNow(date), mins = t.hour * 60 + t.minute, open = 570, close = 960;
  const weekday = !["Sat", "Sun"].includes(t.weekday);
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
  if (weekday && mins >= open && mins < close) return { open: true, label: `Market open · closes in ${dur(close - mins)}` };
  if (weekday && mins < open) return { open: false, label: `Pre-market · opens in ${dur(open - mins)}` };
  const next = { Fri: "Mon", Sat: "Mon", Sun: "Mon" }[t.weekday] || "tomorrow";
  return { open: false, label: `Market closed · opens ${next} 9:30` };
}

export const clock = (date = new Date()) => {
  const t = etNow(date);
  return `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}:${String(t.second).padStart(2, "0")} ET`;
};

export const store = {
  get(k, d) { try { const v = localStorage.getItem("scalpcity:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("scalpcity:" + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

export const minuteOf = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m - 570; };
