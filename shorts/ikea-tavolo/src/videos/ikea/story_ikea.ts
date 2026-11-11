// "Il tavolo che non entrava in macchina" — timeline of the IKEA short (replaces story.ts of the bridge template).
// Same exported API as story.ts (SHOTS, XFADE, FLASH_AT, layersAt, camAt, kickAt, keyEnd, DOF, dofAt, focusAt, FOREGROUND)
// so Bridge.tsx / world.ts can switch by changing one import. Times follow voice/words.json (Fish Audio voice): shot cuts and EV events are on the real word onsets;
// camera keys were time-warped from the first 57 s plan. Reactions should land 0-3 f before their word.
// Scene space (metres, ground y = 0, +y up). Anchors below are the contract with the scene builder (build.ts / world.ts).
export const FPS = 30;
export const TOTAL = 2055; // 68.5 s (voice/voice.mp3)
export type V3 = [number, number, number];

// ---------------- anchors (contract with the scene builder) ----------------
export const YARD: V3 = [0, 0, 0];            // Almhult yard in front of the red cottage, packed earth
export const CAR: V3 = [0, 0, 0];             // small 1950s car, nose toward +x, open boot at x = -2.1
export const BOOT: V3 = [-2.1, 0.9, 0];       // rear opening of the car (the table must NOT fit)
export const TABLE0: V3 = [-4.4, 0, 0.3];     // the Lovet table standing behind the car (shot 1)
export const COTTAGE: V3 = [-14, 0, -16];     // red cottage with the catalogue desk
export const KAMPRAD_AT: V3 = [-11.5, 0, -9];
export const FACTORY: V3 = [24, 0, -18];      // furniture supplier's workshop
export const DEALERS_AT: V3 = [19.5, 0, -11]; // the three rivals
export const FAIR_GATE: V3 = [32, 0, 12];     // gate of the furniture fair
export const TRUCK: V3 = [-6, 0, 24];         // supplier lorry with disguised crates
export const ROAD_EAST: V3 = [60, 0, 24];     // road toward the border / Poland (shot 7)
export const SHOWROOM: V3 = [0, 0, -40];      // final shot: flat box on the floor
export const EXPLAIN: V3 = [-40, 0, 60];     // shot 8 studio: assembled table in a bubble of air vs flat box

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;

// ---------------- story clock ----------------
/** moments (s) the cast and the sound react to; estimates, to be replaced by word onsets */
export const EV = {
  tableStuck: 1.44,     // "non entrava in una macchina"
  boycott: 17.06,       // "fermarlo"
  fairSlam: 21.06,      // "lo cacciano dalla fiera"
  neutralCrates: 25.62, // "nomi neutri"
  legsOff: 34.74,       // "gli toglie le gambe"
  tableIn: 36.66,       // "E il tavolo entra"
  poland: 43.93,        // "fornitori in Polonia"
  airPuffs: 47.05,      // "quasi tutto aria"
  priceDrop: 56.7,     // "i prezzi scendono"
  boxCarry: 58.22,      // "il cliente porta a casa la scatola"
  reissue: 62.3,       // "Nel 2013..."
} as const;

// ---------------- shots ----------------
export type Light = "day" | "golden";
export type Scene = "yard" | "cottage" | "factory" | "fair" | "road" | "explain" | "showroom";
export type ShotDef = { id: number; a: number; b: number; light: Light; scene: Scene; tau: (t: number) => number; towns?: boolean };
export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: 162, light: "day", scene: "yard", tau: (t) => t },
  { id: 2, a: 162, b: 444, light: "day", scene: "cottage", tau: (t) => t },
  { id: 3, a: 444, b: 627, light: "day", scene: "factory", tau: (t) => t },
  { id: 4, a: 627, b: 696, light: "day", scene: "fair", tau: (t) => t },
  { id: 5, a: 696, b: 846, light: "day", scene: "road", tau: (t) => t },
  { id: 6, a: 846, b: 1125, light: "golden", scene: "yard", tau: (t) => t },
  { id: 7, a: 1125, b: 1350, light: "day", scene: "road", tau: (t) => t },
  { id: 8, a: 1350, b: 1692, light: "day", scene: "explain", tau: (t) => t },
  { id: 9, a: 1692, b: 1860, light: "day", scene: "showroom", tau: (t) => t },
  { id: 10, a: 1860, b: TOTAL, light: "golden", scene: "showroom", tau: (t) => t },
];
/** crossfades (frames) at place/time changes; a white 4-frame flash after the hook */
export const XFADE: Record<number, number> = { 6: 8, 7: 6, 8: 8, 10: 8 };
export const FLASH_AT = 162;

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- camera ----------------
// Grammar from the style study (unchanged): hard cut on a big reframe; every other move is a symmetric smootherstep glide
// of 18-40 f; every hold creeps in (0.15-0.35 %/f, ~0.6 %/f on punch words); rolls 4-5 deg; kicks flip sign every frame.
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mix = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mix(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const T = (f: number) => f / FPS;
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });
const rolled = (s: (f: number) => Shot, roll: number) => (f: number): Shot => ({ ...s(f), roll });
const add = (a: V3, d: V3): V3 => [a[0] + d[0], a[1] + d[1], a[2] + d[2]];

/** where the table is: standing behind the car, then (shot 6) legs off and lying flat, then slid into the boot */
export const tableState = (t: number) => ({
  legs: t < EV.legsOff ? 1 : clamp01(1 - (t - EV.legsOff) / 0.7), // 1 = legs on, 0 = legs off
  inBoot: smooth((t - EV.legsOff - 0.9) / (EV.tableIn - EV.legsOff - 0.9)),
});

// ---- framings ----
// shot 1 (hook): car + standing table, then closer on the stuck table, then low on the boot edge
const S1a = (f: number) => dolly([-5.5, 2.6, 11], add(BOOT, [1.0, 0.1, 0]), pushK(f, 0, 0.0025), { fov: 46 });
const S1b = (f: number) => dolly([-5.2, 1.5, 4.2], add(BOOT, [-1.4, 0.4, 0.1]), pushK(f, 43, 0.002, 0.006, 30), { fov: 38, roll: -0.04 });
const S1c = (f: number) => dolly([-3.6, 0.5, 2.1], add(BOOT, [-0.4, -0.1, 0]), pushK(f, 99, 0.003), { fov: 36, roll: 0.04 });
// shot 2: cottage + Kamprad with the catalogue; broken parcel
const S2a = (f: number) => zoom([-3, 6, 4], add(COTTAGE, [2, 3, 3]), 44, pushK(f, 162, 0.002));
const S2b = (f: number) => dolly([-8.8, 1.7, -4.4], add(KAMPRAD_AT, [0, 1.5, 0]), pushK(f, 242, 0.0025), { fov: 38 });
const S2c = (f: number) => dolly([-11.0, 1.1, -3.4], [-12.2, 0.3, -7.6], pushK(f, 350, 0.0025, 0.006, 30), { fov: 38, roll: 0.035 }); // the broken parcel
// shot 3: rivals at the factory gate
const S3a = (f: number) => zoom([13, 2.2, -4], add(DEALERS_AT, [0, 1.5, 0]), 42, pushK(f, 444, 0.002), { roll: -0.03 });
const S3b = (f: number) => dolly([17.2, 1.7, -7.4], add(DEALERS_AT, [0.6, 1.7, 0]), pushK(f, 543, 0.003, 0.006, 25), { fov: 36 });
// shot 4: fair gate shut in IKEA's face
const S4a = (f: number) => zoom([24, 3, 20], add(FAIR_GATE, [0, 2, 0]), 44, pushK(f, 627, 0.002));
const S4b = (f: number) => dolly([29.2, 1.5, 8.2], add(FAIR_GATE, [-0.5, 1.5, 0]), pushK(f, 664, 0.0025, 0.006, 30), { fov: 38, roll: 0.04 });
// shot 5: lorry with disguised crates
const S5a = (f: number) => dolly([2, 2.6, 14], add(TRUCK, [0, 1.7, 0]), pushK(f, 696, 0.002), { fov: 44 });
const S5b = (f: number) => dolly([-3.4, 1.3, 20.4], add(TRUCK, [1.5, 1.6, 0]), pushK(f, 766, 0.0025, 0.005, 30), { fov: 38, roll: -0.035 });
// shot 6 (golden): Lundgren + table; legs come off; table slides in
const S6a = (f: number) => dolly([-8, 2.2, 7.5], add(TABLE0, [0.6, 0.9, 0]), pushK(f, 846, 0.002), { fov: 44 });
const S6b = (f: number) => dolly([-5.6, 0.45, 1.8], add(TABLE0, [0, 0.15, 0]), pushK(f, 939, 0.003, 0.006, 35), { fov: 34, roll: 0.04 }); // legs, close and low
const S6c = (f: number) => dolly([-4.2, 3.2, 6.4], add(BOOT, [-1.0, 0.3, 0]), pushK(f, 1020, 0.002), { fov: 42, roll: -0.03 });
const S6d = (f: number) => dolly([-3.2, 0.9, 2.8], add(BOOT, [-0.3, 0.1, 0]), pushK(f, 1073, 0.003), { fov: 36 }); // "e il tavolo entra"
// shot 7: Kamprad on the road east
const S7a = (f: number) => dolly([42, 2.4, 14], add(ROAD_EAST, [-12, 1.8, 0]), pushK(f, 1125, 0.002), { fov: 44 });
const S7b = (f: number) => dolly([48.5, 1.4, 19], add(ROAD_EAST, [-10.3, 1.5, 0]), pushK(f, 1225, 0.0025), { fov: 38, roll: 0.035 });
const S7c = (f: number) => dolly([12.5, 1.6, -4.5], add(DEALERS_AT, [-1, 1.5, 0]), pushK(f, 1295, 0.0025), { fov: 38 }); // glum rivals
// shot 8: explanation set (white studio with two tables)
const S8a = (f: number) => dolly(add(EXPLAIN, [-3.2, 2.0, 10]), add(EXPLAIN, [-3.2, 1.3, 0]), pushK(f, 1350, 0.002), { fov: 42 });
const S8b = (f: number) => dolly(add(EXPLAIN, [3.6, 1.2, 8.6]), add(EXPLAIN, [3.2, 0.6, 0]), pushK(f, 1451, 0.0025, 0.006, 35), { fov: 38, roll: -0.03 });
const S8c = (f: number) => dolly(add(EXPLAIN, [0, 3.4, 12]), add(EXPLAIN, [0, 1.2, 0]), pushK(f, 1563, 0.002), { fov: 46 }); // suitcase vs wardrobe on the lorry
// shot 9: price tags + customer
const S9a = (f: number) => dolly([-2.0, 1.8, SHOWROOM[2] + 8], add(SHOWROOM, [0, 1.6, 0]), pushK(f, 1692, 0.002), { fov: 40 });
const S9b = (f: number) => dolly([1.2, 1.5, SHOWROOM[2] + 5.4], add(SHOWROOM, [0.4, 1.4, 0]), pushK(f, 1776, 0.0025, 0.005, 30), { fov: 36, roll: 0.04 });
// shot 10 (golden): reissued table box, last gag
const S10a = (f: number) => dolly([-2.6, 1.6, SHOWROOM[2] + 7.5], add(SHOWROOM, [0, 0.7, 0]), pushK(f, 1860, 0.002), { fov: 40 });
const S10b = (f: number) => dolly([-1.2, 0.8, SHOWROOM[2] + 4.2], add(SHOWROOM, [0, 0.45, 0]), pushK(f, 1964, 0.0035, 0.006, 30), { fov: 34, roll: -0.035 });

const CAMS: Record<number, Key[]> = {
  1: [{ f: 0, s: S1a }, { f: 43, dur: 30, s: S1b }, { f: 99, dur: 28, s: S1c }],
  2: [{ f: 162, s: S2a }, { f: 242, cut: true, s: S2b }, { f: 350, dur: 24, s: S2c }],
  3: [{ f: 444, s: S3a }, { f: 543, cut: true, s: S3b }],
  4: [{ f: 627, s: S4a }, { f: 664, cut: true, s: S4b }, { f: 664, dur: 20, s: rolled(S4b, -0.035) }],
  5: [{ f: 696, s: S5a }, { f: 766, dur: 20, s: S5b }],
  6: [{ f: 846, s: S6a }, { f: 939, cut: true, s: S6b }, { f: 1020, cut: true, s: S6c }, { f: 1073, dur: 22, s: S6d }],
  7: [{ f: 1125, s: S7a }, { f: 1225, cut: true, s: S7b }, { f: 1295, cut: true, s: S7c }],
  8: [{ f: 1350, s: S8a }, { f: 1451, cut: true, s: S8b }, { f: 1563, cut: true, s: S8c }],
  9: [{ f: 1692, s: S9a }, { f: 1776, dur: 22, s: S9b }],
  10: [{ f: 1860, s: S10a }, { f: 1964, cut: true, s: S10b }],
};

// impact kicks: table-in thud, gate slam, legs-off clunk, last gag
const KICKS: [number, number][] = [[EV.fairSlam, 1.2], [EV.legsOff, 0.8], [EV.tableIn, 1.4], [EV.reissue + 2.2, 0.5]];
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(T(f));
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};
export const keyEnd = (id: number, f: number) => {
  let e = 0;
  for (const k of CAMS[id]) if (f >= k.f) e = k.f + (k.cut ? 0 : k.dur ?? 24);
  return Math.max(f, e);
};

// ---------------- lens ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
export const DOF: Dof[] = [
  { f: 0, cInf: 0 },                 // hook: car + table sharp (readable at once)
  { f: 43, dur: 30, cInf: 14, focus: () => add(BOOT, [-1.4, 0.5, 0]) },
  { f: 99, dur: 28, cInf: 15, focus: () => add(BOOT, [-0.4, 0, 0]) },
  { f: 162, cInf: 0 },               // cottage establishing
  { f: 242, cInf: 12 },              // Kamprad MS, focus = look
  { f: 350, dur: 24, cInf: 14 },     // broken parcel CU
  { f: 444, cInf: 0 },
  { f: 543, cInf: 12 },              // rivals MS
  { f: 627, cInf: 0 },
  { f: 664, cInf: 13 },              // gate CU
  { f: 696, cInf: 0 },
  { f: 766, dur: 20, cInf: 11 },     // crates
  { f: 846, cInf: 0 },
  { f: 939, cInf: 15 },              // legs CU (focus = look)
  { f: 1020, cInf: 0 },
  { f: 1073, dur: 22, cInf: 12 },     // table slides in
  { f: 1125, cInf: 0 },
  { f: 1225, cInf: 12 },
  { f: 1295, cInf: 10 },
  { f: 1350, cInf: 0 },
  { f: 1451, cInf: 13 },
  { f: 1563, cInf: 0 },
  { f: 1692, cInf: 0 },
  { f: 1776, dur: 22, cInf: 12 },
  { f: 1860, cInf: 5 },
  { f: 1964, cInf: 14 },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
export const focusAt = (id: number, f: number): V3 => {
  const d = dofAt(f);
  return d.focus ? d.focus(f) : camAt(id, f).look;
};

/** near framing objects (kit = GLB name accepted by build.ts prop(); missing GLBs are skipped by the loader) */
export type Fg = { a: number; b: number; kit: string; pos: V3; s?: number; yaw?: number };
export const FOREGROUND: Fg[] = [
  { a: 242, b: 350, kit: "crate", pos: [-9.6, 0, -6.2], s: 0.7, yaw: 0.4 },           // Kamprad MS: crate bottom-left
  { a: 543, b: 627, kit: "barrel", pos: [15.2, 0, -8.2], s: 0.9, yaw: 0.2 },          // rivals: barrel
  { a: 766, b: 846, kit: "crate", pos: [-1.4, 0, 18.2], s: 0.8, yaw: -0.5 },          // disguised crates
  { a: 939, b: 1020, kit: "toolbox", pos: [-4.4, 0, 1.2], s: 0.25, yaw: 0.3 },         // Lundgren's tools, bottom-right
  { a: 1692, b: 1776, kit: "plant_bushDetailed", pos: [-1.6, 0, SHOWROOM[2] + 6.4], s: 1.1, yaw: 0.4 },
];
