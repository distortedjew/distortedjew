// Cast of the IKEA short (replaces the soldier/townsfolk/kid cast of cast.ts). Own characters, drawn with the same toon.ts
// Pen API: bean heads, plum ink, stick limbs. Outfits only use hats the drawing code already has (hair, cap, tophat, bonnet).
// `stage(id, t, cam)` returns the characters for shot `id` at story time `t` as Place[] ready for the card pool.
import { Outfit, Expr, FrontOpts, SideOpts, bodyFront, bodySide, townsfolk, INK, SKINS } from "./toon";
import type { Pen } from "./toon";
import { FPS, EV, KAMPRAD_AT, DEALERS_AT, FAIR_GATE, TRUCK, SHOWROOM, TABLE0, BOOT, V3, clamp01, smooth } from "./story_ikea";

// ---------------- outfits ----------------
/** Ingvar Kamprad, young mail-order seller: blond hair, cardigan, tie-less shirt collar */
export const KAMPRAD: Outfit = { jacket: "#4f7d9a", pants: "#3b3f52", boots: "#4a3426", hat: "hair", hair: "#d8b25a", skin: SKINS[0], buttons: "#f1efe6" };
/** Gillis Lundgren, designer in a work apron, flat cap */
export const LUNDGREN: Outfit = { jacket: "#b5653f", pants: "#4a4a52", boots: "#3a2a20", hat: "cap", cap: "#3b3f52", skin: SKINS[1], moustache: "#4a3020", belt: "#d9a441" };
/** the three rivals: dark suits, top hats, moustaches, stout */
export const DEALERS: Outfit[] = [
  { jacket: "#2f2f38", pants: "#25252d", boots: INK, hat: "tophat", moustache: "#2a201a", build: "stout", skin: SKINS[2] },
  { jacket: "#5a2f3a", pants: "#25252d", boots: INK, hat: "tophat", moustache: "#4a3426", build: "stout", skin: SKINS[0] },
  { jacket: "#3b3b4a", pants: "#25252d", boots: INK, hat: "tophat", moustache: "#2a201a", build: "stout", skin: SKINS[3] },
];
/** the customer carrying the flat box */
export const CUSTOMER: Outfit = { jacket: "#c25a7a", pants: "#3b3f52", boots: "#5a3b2a", hat: "hair", hair: "#5a3b2a", skin: SKINS[1] };
/** lorry drivers / fair guards reuse townsfolk with a work look */
export const DRIVER: Outfit = { ...townsfolk(2), hat: "cap", cap: "#5d7a3a" };
export const GUARD: Outfit = { ...townsfolk(0), hat: "tophat", jacket: "#2f5f6a", moustache: "#2a201a" };

// ---------------- small helpers ----------------
const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
const LID = [0.5, 1, 1, 0.5];
/** blink every 0.5-2.3 s, 4 frames (half / shut / shut / half) */
const lidAt = (t: number, i: number) => {
  const f = Math.round(t * FPS);
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13));
  }
  return 0;
};
const lerp3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));

export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; roll?: number; size?: [number, number, number];
};
export type CamInfo = { pos: { x: number; y: number; z: number }; right: { x: number; z: number } };
export type Stage = { places: Place[] };

const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];
const LIGHT_DAY = (-120 * Math.PI) / 180, LIGHT_GOLD = (-160 * Math.PI) / 180;

type Who = { id: string; o: Outfit; i: number };
/** one drawing: front view, or side view when the walk runs across the camera (dx, dz = walk direction) */
const person = (cam: CamInfo, who: Who, at: V3, walk: [number, number] | null, fo: FrontOpts, so: SideOpts, golden: boolean): Place => {
  const [x, y, z] = at;
  const d = Math.hypot(cam.pos.x - x, cam.pos.y - (y + 1.2), cam.pos.z - z);
  const [w, h, k] = tier(d);
  let side = false, mirror = false;
  if (walk) {
    const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
    const c = (tx * walk[0] + tz * walk[1]) / tl;
    side = c < 0.57;
    mirror = side && walk[0] * cam.right.x + walk[1] * cam.right.z < 0;
  }
  const light = golden ? LIGHT_GOLD : LIGHT_DAY, seed = (who.i % 7) + 1;
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = side ? `S|${who.id}|${fkey(s2)}|${mirror}` : `F|${who.id}|${fkey(f2)}`;
  return { key, x, y, z, mirror, size: [w, h, k], draw: (p) => (side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)) };
};

const WHO = {
  kamprad: { id: "kamprad", o: KAMPRAD, i: 1 },
  lundgren: { id: "lundgren", o: LUNDGREN, i: 2 },
  dealer: [0, 1, 2].map((n) => ({ id: `dealer${n}`, o: DEALERS[n], i: 3 + n })) as Who[],
  customer: { id: "customer", o: CUSTOMER, i: 8 },
  driver: { id: "driver", o: DRIVER, i: 9 },
  guard: { id: "guard", o: GUARD, i: 10 },
};

// ---------------- who is where, by shot ----------------
export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [] };
  const golden = id === 6 || id === 10;
  const put = (who: Who, at: V3, expr: Expr, o: { mode?: FrontOpts["mode"]; walk?: [number, number]; phase?: number; look?: number; prop?: FrontOpts["prop"]; tilt?: number } = {}) => {
    const mode = o.mode ?? "stand", blink = expr === "whistle" ? 0 : lidAt(t, who.i);
    const fo: FrontOpts = { phase: o.phase ?? 0, expr, mode, look: o.look ?? 0, blink, prop: o.prop ?? null, tilt: o.tilt ?? 0 };
    const so: SideOpts = { phase: o.phase ?? 0, expr, mode: mode === "march" ? "march" : "stand", blink };
    out.places.push(person(cam, who, at, o.walk ?? null, fo, so, golden));
  };
  const stepPh = (rate = 1) => ((t * rate) % 1 + 1) % 1;

  switch (id) {
    case 1: { // hook: Lundgren stares at the table behind the car, then shrugs
      const stuck = t > EV.tableStuck;
      put(WHO.lundgren, [TABLE0[0] + 1.0, 0, TABLE0[2] + 1.6], stuck ? "nervous" : "neutral");
      put(WHO.kamprad, [BOOT[0] + 0.6, 0, BOOT[2] - 1.5], stuck ? "stern" : "neutral", { look: -1 });
      break;
    }
    case 2: { // Kamprad at the catalogue desk, broken parcel arrives
      put(WHO.kamprad, [KAMPRAD_AT[0], 0, KAMPRAD_AT[2]], t < 8.5 ? "smile_closed" : "pained");
      put(WHO.driver, lerp3([-6, 0, -6], [-10.2, 0, -6.4], smooth((t - 8.2) / 1.5)), t < 9.5 ? "neutral" : "shock", { mode: t < 9.7 ? "stroll" : "stand", walk: [-1, 0], phase: stepPh(1.6) });
      break;
    }
    case 3: { // three rivals at the factory gate: one says no, the supplier shakes his head
      WHO.dealer.forEach((w, n) => put(w, [DEALERS_AT[0] + (n - 1) * 1.5, 0, DEALERS_AT[2] + (n === 1 ? 0.5 : 0)], t > EV.boycott ? (n === 1 ? "grin" : "stern") : "neutral", { look: n === 0 ? 1 : n === 2 ? -1 : 0 }));
      put(WHO.driver, [DEALERS_AT[0] + 4.2, 0, DEALERS_AT[2] - 1.2], "nervous", { look: -1 });
      break;
    }
    case 4: { // the fair gate: the guard lets rivals in, shuts the gate on Kamprad
      put(WHO.guard, [FAIR_GATE[0] - 0.2, 0, FAIR_GATE[2] + 0.8], t > EV.fairSlam - 0.1 ? "stern" : "neutral");
      put(WHO.kamprad, [FAIR_GATE[0] - 3.6, 0, FAIR_GATE[2] + 3.4], t > EV.fairSlam ? "shock" : "nervous", { look: 1 });
      put(WHO.dealer[0], [FAIR_GATE[0] + 2.4, 0, FAIR_GATE[2] - 1.6], "laugh");
      break;
    }
    case 5: { // supplier loads crates with fake labels; the driver winks
      put(WHO.driver, [TRUCK[0] + 3.2, 0, TRUCK[2] - 2.4], t > EV.neutralCrates ? "grin" : "smile_closed");
      break;
    }
    case 6: { // Lundgren and the table: tries, gives up, takes the legs off, slides it in
      const off = t > EV.legsOff, inn = t > EV.tableIn;
      const lx = TABLE0[0] + 1.1;
      put(WHO.lundgren, [lx, 0, TABLE0[2] + 1.3], inn ? "relief_open" : off ? "grin" : t < EV.legsOff - 2 ? "nervous" : "stern", { prop: off && !inn ? ["hammer", clamp01(((t - EV.legsOff) * 3) % 1)] : null });
      put(WHO.kamprad, [BOOT[0] + 0.9, 0, BOOT[2] - 1.9], inn ? "relief" : "neutral", { look: -1 });
      break;
    }
    case 7: { // Kamprad on the road east with his catalogue; the rivals sulk
      const k = smooth((t - 32.4) / 2.6);
      put(WHO.kamprad, lerp3([39, 0, 24], [48, 0, 24], k), t > EV.poland ? "grin" : "smile", { mode: "stroll", walk: [1, 0], phase: stepPh(1.8) });
      WHO.dealer.forEach((w, n) => put(w, [DEALERS_AT[0] + (n - 1) * 1.5, 0, DEALERS_AT[2]], "pained", { look: n - 1 }));
      break;
    }
    case 8: { // explanation set: a puzzled customer walks between the two boxes
      put(WHO.customer, [0.2, 0, 3.0], t > EV.airPuffs + 3 ? "smile" : "nervous", { look: t > EV.airPuffs + 3 ? 1 : -1 });
      break;
    }
    case 9: { // price tags drop, the customer walks off with the box
      const w = smooth((t - EV.boxCarry) / 2.2);
      put(WHO.customer, lerp3([SHOWROOM[0] - 1.4, 0, SHOWROOM[2] + 0.6], [SHOWROOM[0] + 1.6, 0, SHOWROOM[2] + 0.2], w), t < EV.boxCarry ? "smile" : "grin", { mode: w > 0 && w < 1 ? "stroll" : "stand", walk: [1, 0], phase: stepPh(1.8), tilt: w > 0 ? 4 : 0 });
      break;
    }
    case 10: { // last gag: the customer holds the Allen key, flat box open
      put(WHO.customer, [SHOWROOM[0] + 0.6, 0, SHOWROOM[2] + 0.4], t > EV.reissue + 2.2 ? "shock" : "grin", { look: 1 });
      break;
    }
  }
  return out;
};
