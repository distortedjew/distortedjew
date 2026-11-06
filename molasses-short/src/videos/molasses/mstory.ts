// Timeline of "The Molasses Flood": shots timed to voice/words.json (line starts below), camera grammar from the bridge short.
import { FPS, clamp01, smooth, glide, run, pushK, dolly, zoom, Cam, Shot, Key, V3 } from "../bridge/story";
export { FPS, clamp01, smooth };
export type { V3 };
export const TOTAL = 1980;
export const TANK: V3 = [-26, 0, 60]; // centre of the tank base
export const TANK_R = 13.5, TANK_H = 15;
export const BURST = 29.0; // s: "the whole tank let go"
export const WAVE_H = 7.6;
export type Light = "day" | "golden";
export type ShotDef = { id: number; a: number; b: number; light: Light; crowd: string; tau: (t: number) => number };
// tau = seconds since the burst (negative = tank intact). Shot 1 is a flash-forward of the wave.
const S = (id: number, a: number, b: number, tau: (t: number) => number, crowd = "none", light: Light = "day"): ShotDef => ({ id, a, b, light, crowd, tau });
export const SHOTS: ShotDef[] = [
  S(1, 0, 220, (t) => 2.6 + 0.8 * t, "run"),
  S(2, 220, 390, () => -9, "town"),
  S(3, 390, 500, () => -9),
  S(4, 500, 620, () => -9, "workers"),
  S(5, 620, 780, (t) => -9 + 0.0 * t, "none"),
  S(6, 780, 915, (t) => t - BURST, "none"),
  S(7, 915, 1065, (t) => t - BURST, "run"),
  S(8, 1065, 1240, () => 12, "dazed"),
  S(9, 1240, 1376, () => -9, "none"),
  S(10, 1376, 1511, () => -9, "none"),
  S(11, 1511, 1640, () => 12, "none", "golden"),
  S(12, 1640, 1806, () => -9, "engineer"),
  S(13, 1806, TOTAL, () => -9, "none", "golden"),
];
export const XFADE: Record<number, number> = { 9: 6, 11: 8, 12: 8, 13: 8 };
export const FLASH_AT = 220;
export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---- wave physics ----
export const zFront = (tau: number) => 52 - 12 * Math.min(Math.max(tau, 0), 9);
export const waveH = (tau: number) => WAVE_H * smooth(tau / 0.9) * (1 - 0.9 * smooth((tau - 8) / 3));
export const bulge = (t: number) => (t < 20.98 ? 0 : 0.012 * smooth((t - 20.98) / 5) + (t > 26.39 ? 0.01 * Math.sin(t * 40) : 0)); // tank swells on "warm"
export const POP: number[] = [27.9, 28.1, 28.25, 28.4, 28.52];
export const HITS = [57.3, 58.25, 59.3]; // stamp hits

const T = (f: number) => f / FPS;
const Zf = (id: number, f: number) => zFront(SHOTS[id - 1].tau(T(f)));

const cam1a = (f: number) => { const z = Zf(1, f); return dolly([1.0, 2.0, z - 26], [0, 3.8, z + 2], pushK(f, 0, 0.002), { fov: 48 }); };
const cam1b = (f: number) => { const z = Zf(1, f); return dolly([-1.2, 1.2, z - 15], [0, 3.2, z - 1], pushK(f, 90, 0.003), { fov: 46, roll: 0.04 }); };
const cam2a = () => zoom([20, 9, 28], [-26, 7, 60], 42, 1);
const CAMS: Record<number, Key[]> = {
  1: [{ f: 0, s: cam1a }, { f: 90, dur: 28, s: cam1b }],
  2: [{ f: 220, s: (f) => dolly([8, 19, 4], [-26, 6, 60], pushK(f, 220, 0.0025), { fov: 46 }) }, { f: 300, cut: true, s: (f) => dolly([3, 2.5, 30], [-18, 7.5, 60], pushK(f, 300, 0.002), { fov: 48, roll: -0.03 }) }],
  3: [{ f: 390, s: (f) => dolly([-4, 2.2, 55], [-12.5, 3.2, 60], pushK(f, 390, 0.0025), { fov: 42 }) }, { f: 445, cut: true, s: (f) => dolly([-8.3, 1.1, 58.6], [-12.5, 1.5, 60], pushK(f, 445, 0.0028), { fov: 36, roll: 0.04 }) }],
  4: [{ f: 500, s: (f) => dolly([3, 1.7, 46], [-5, 1.7, 53], pushK(f, 500, 0.0025), { fov: 40 }) }, { f: 560, cut: true, s: (f) => dolly([-1, 1.5, 49.5], [-4.5, 1.6, 53], pushK(f, 560, 0.003), { fov: 36, roll: -0.04 }) }],
  5: [{ f: 620, s: (f) => dolly([16, 4.5, 42], [-18, 7, 58], pushK(f, 620, 0.002), { fov: 46 }) }, { f: 705, cut: true, s: (f) => dolly([-7.5, 6, 54], [-12.5, 6.2, 58], pushK(f, 705, 0.003, 0.006, 30), { fov: 38, roll: 0.03 }) }],
  6: [{ f: 780, s: (f) => dolly([-6, 5.6, 53], [-12.5, 6, 57.5], pushK(f, 780, 0.003), { fov: 36 }) }, { f: 836, cut: true, s: (f) => dolly([10, 6, 40], [-20, 6.5, 58], pushK(f, 836, 0.002, 0.006, 40), { fov: 48, roll: -0.04 }) }],
  7: [{ f: 915, s: (f) => { const z = Zf(7, f); return dolly([3, 2.2, z - 13], [0, 4, z + 2], pushK(f, 915, 0.002), { fov: 46 }); } },
      { f: 975, cut: true, s: (f) => { const z = Zf(7, f); return dolly([17, 6, z + 5], [0, 3, z - 6], pushK(f, 975, 0.002), { fov: 46, roll: 0.04 }); } },
      { f: 1020, cut: true, s: (f) => { const z = Zf(7, f); return dolly([-1.5, 1.0, z - 7], [0, 3.2, z], pushK(f, 1020, 0.003), { fov: 44, roll: -0.05 }); } }],
  8: [{ f: 1065, s: (f) => dolly([1.4, 1.7, -8], [0, 1.9, -15], pushK(f, 1065, 0.0025), { fov: 38 }) }, { f: 1150, cut: true, s: (f) => dolly([0.5, 1.5, -13], [0, 1.7, -18], pushK(f, 1150, 0.003), { fov: 34, roll: 0.04 }) }],
  9: [{ f: 1240, s: (f) => dolly([80.1, 2.0, -3.4], [80.1, 1.45, 0.2], pushK(f, 1240, 0.002), { fov: 44 }) }],
  10: [{ f: 1376, s: (f) => dolly([6, 4.5, 42], [-20, 6.5, 58], pushK(f, 1376, 0.0025), { fov: 46 }) }, { f: 1440, cut: true, s: (f) => dolly([-5, 8, 52], [-12.5, 7.5, 58], pushK(f, 1440, 0.003, 0.006, 30), { fov: 40, roll: 0.04 }) }],
  11: [{ f: 1511, s: (f) => zoom([0, 20, -20], [0, -1, -110], 50, pushK(f, 1511, 0.0016)) }],
  12: [{ f: 1640, s: (f) => dolly([62.2, 1.7, -4.2], [60.2, 1.5, 0], pushK(f, 1640, 0.0025), { fov: 38 }) }, { f: 1715, cut: true, s: (f) => dolly([60.9, 1.3, -2.2], [60, 1.1, 0.3], pushK(f, 1715, 0.003, 0.004, 24), { fov: 40, roll: 0.03 }) }],
  13: [{ f: 1806, s: (f) => dolly([-5.5, 2.3, 56.5], [-12.5, 2.7, 60], pushK(f, 1806, 0.002), { fov: 42 }) }, { f: 1890, dur: 70, s: (f) => zoom([14, 7, 30], [-26, 7, 60], 44, 1) }],
};
CAMS[1] = CAMS[1];
export const hitK = (t: number) => { let a = 0; for (const h of HITS) { const n = Math.floor((t - h) * FPS + 1e-6); if (n >= 0 && n < 7) a += (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5 * 0.7; } return a; };
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of [[BURST, 1.8], [POP[0], 0.4], [POP[2], 0.5], [POP[4], 0.8]] as [number, number][]) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a + hitK(t);
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(T(f));
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
export const DOF: Dof[] = [
  { f: 0, cInf: 14, focus: (f) => [0, 1.5, Zf(1, f) - 4] },
  { f: 220, cInf: 0 }, { f: 390, cInf: 8 }, { f: 445, cInf: 14 }, { f: 500, cInf: 10 }, { f: 620, cInf: 0 }, { f: 705, cInf: 12 },
  { f: 780, cInf: 12 }, { f: 836, cInf: 0 }, { f: 915, cInf: 0 }, { f: 1020, cInf: 12 }, { f: 1065, cInf: 12, focus: () => [0, 1.9, -15] },
  { f: 1240, cInf: 14 }, { f: 1376, cInf: 0 }, { f: 1440, cInf: 10 }, { f: 1511, cInf: 0 }, { f: 1640, cInf: 12 }, { f: 1806, cInf: 14 },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
export { glide };
