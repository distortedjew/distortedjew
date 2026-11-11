// The IKEA short's world (replaces world.ts): Almhult yard with car, Lovet table, red cottage, supplier workshop, fair gate,
// lorry and road, plus two studio sets (shot 8 "air vs flat box", shots 9-10 showroom). Sky, fog, light rig, ink layer and the
// character card pool are the same machinery as the bridge world; only the scenery and its per-frame posing are new.
// update(id, f, camera, scene) is a pure function of (id, f), like before.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { staticFile } from "remotion";
import { Batch, boxGeo, V, lam, house, setSight, kitClone, Kit, Ray } from "./build";
import { ctex, grassHD, cloudHD } from "./paint";
import { fxCloud, fxContact } from "./toon";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx } from "./cast";
import { stage } from "./cast_ikea";
import {
  FPS, SHOTS, EV, CAR, BOOT, TABLE0, COTTAGE, KAMPRAD_AT, FACTORY, DEALERS_AT, FAIR_GATE, TRUCK, ROAD_EAST, SHOWROOM, EXPLAIN,
  camAt, tableState, smooth, clamp01, FOREGROUND, ShotDef, V3,
} from "./story_ikea";

// ---------------- assets ----------------
// Kenney CC0 nature kit (optional: missing files are skipped). Download from kenney.nl into public/ikea/kenney/
const KENNEY = ["tree_oak", "tree_default", "tree_detailed", "tree_fat", "plant_bushLarge", "plant_bushDetailed", "plant_bush", "hedge", "flower_redA",
  "flower_yellowA", "flower_purpleA", "grass_large", "grass", "lantern", "cart", "stall-red", "stall-green", "banner-red", "banner-green"];
let kitP: Promise<Kit> | null = null;
export const loadKit = () => {
  if (!kitP) {
    const loader = new GLTFLoader();
    kitP = Promise.all(KENNEY.map((n) => loader.loadAsync(staticFile(`ikea/kenney/${n}.glb`)).then((g) => [n, g.scene] as const).catch(() => [n, null] as const)))
      .then((list) => Object.fromEntries(list.filter((e) => e[1]).map(([n, s]) => [n, s!])) as Kit);
  }
  return kitP;
};

// ---------------- small builders ----------------
const col = (key: string, color: string) => lam(key, () => ({ color }));
const M = {
  car: col("carBody", "#4f8fa6"), carTop: col("carTop", "#e8dcc0"), glass: col("glass", "#9ec7d8"), tyre: col("tyre", "#262228"), chrome: col("chrome", "#c8cdd2"),
  wood: col("woodTable", "#b57a45"), woodDark: col("woodDark2", "#7a4f33"), cardboard: col("cardboard", "#c9a36b"), tape: col("tape", "#e8d8b0"),
  stone: col("gateStone", "#b9b09f"), iron: col("gateIron", "#3d414c"), shed: col("shedWall", "#8c5a3c"), roofShed: col("shedRoof", "#5a4a44"),
  cab: col("truckCab", "#3f6fb5"), bed: col("truckBed", "#8a6a4a"), crate: col("crateM", "#a8794a"), dirt: col("dirtM", "#b99a6b"), road: col("roadM", "#9a8468"),
  floor: new THREE.MeshBasicMaterial({ color: "#f1e8d6" }), wall: new THREE.MeshBasicMaterial({ color: "#eadcc0" }), tag: col("tagRed", "#c0353a"), tagW: col("tagWhite", "#f7f1e1"),
  desk: col("deskM", "#7a4f33"), paper: col("paperM", "#f4efe3"), pole: col("polePole", "#d23b3b"), poleW: col("poleWhite", "#f4efe3"),
  tentR: col("tentRed", "#c25a4a"), tentB: col("tentBlue", "#3f6fb5"), tentY: col("tentYellow", "#d9a441"), shelf: col("shelfM", "#d9c7a4"),
};
const GROUND = lam("groundIkea", () => ({ map: grassHD() }));
const DIRT = lam("dirtTexM", () => ({ map: ctex("dirtTex", 256, 256, (g, r) => {
  g.fillStyle = "#a99d84"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? "#988c74" : "#bcb096"; g.fillRect(r() * 256, r() * 256, 2 + r() * 5, 1 + r() * 3); }
}) }));
const bx = (b: Batch, m: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => b.add(boxGeo(V(x0, y0, z0), V(x1, y1, z1)), m);
const cyl = (b: Batch, m: THREE.Material, x: number, y: number, z: number, r: number, h: number, axis: "x" | "y" | "z" = "y", seg = 14) => {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  if (axis === "x") g.rotateZ(Math.PI / 2); else if (axis === "z") g.rotateX(Math.PI / 2);
  b.add(g, m, new THREE.Matrix4().makeTranslation(x, y, z));
};
const slab = (b: Batch, m: THREE.Material, cx: number, cz: number, w: number, d: number, y = 0.01, tile = 6) => {
  const g = new THREE.PlaneGeometry(w, d, 1, 1); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (d / tile));
  b.add(g, m, new THREE.Matrix4().makeTranslation(cx, y, cz));
};
const roofGable = (b: Batch, m: THREE.Material, cx: number, y: number, cz: number, w: number, d: number, rh: number) => {
  const hw = w / 2 + 0.3, hd = d / 2 + 0.3;
  for (const s of [-1, 1]) {
    const a = V(cx - hw, y, cz + s * hd), c = V(cx + hw, y, cz + s * hd), top1 = V(cx + hw, y + rh, cz), top0 = V(cx - hw, y + rh, cz);
    const g = new THREE.BufferGeometry();
    const pts = s > 0 ? [a, c, top1, a, top1, top0] : [c, a, top0, c, top0, top1];
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
    g.computeVertexNormals(); b.add(g, m);
  }
};

// ---------------- scenery ----------------
const buildCar = (b: Batch) => {
  const [cx, , cz] = CAR;
  bx(b, M.car, cx - 2.1, 0.32, cz - 0.85, cx + 2.1, 0.95, cz + 0.85);              // body
  bx(b, M.car, cx + 0.9, 0.95, cz - 0.82, cx + 2.05, 1.1, cz + 0.82);               // bonnet
  bx(b, M.carTop, cx - 1.1, 0.95, cz - 0.8, cx + 0.9, 1.55, cz + 0.8);              // cabin
  bx(b, M.glass, cx - 1.0, 1.02, cz - 0.82, cx + 0.8, 1.48, cz + 0.82);             // windows
  bx(b, M.carTop, cx - 1.05, 1.55, cz - 0.82, cx + 0.95, 1.62, cz + 0.82);           // roof
  bx(b, M.chrome, cx + 2.05, 0.42, cz - 0.7, cx + 2.2, 0.62, cz + 0.7);             // front bumper
  bx(b, M.chrome, cx - 2.2, 0.42, cz - 0.7, cx - 2.05, 0.62, cz + 0.7);             // rear bumper
  // open boot: floor + side walls, lid raised, no back wall (the table must NOT fit)
  bx(b, M.car, cx - 2.1, 0.95, cz - 0.85, cx - 1.1, 1.0, cz + 0.85);
  for (const s of [-1, 1]) bx(b, M.car, cx - 2.1, 1.0, cz + s * 0.8 - 0.05, cx - 1.1, 1.3, cz + s * 0.8 + 0.05);
  const lid = new THREE.Matrix4().makeRotationZ(-1.1).setPosition(cx - 2.1, 1.05, cz);
  b.add(boxGeo(V(0, 0, -0.84), V(1.0, 0.06, 0.84)), M.car, lid);
  for (const [dx, dz] of [[1.35, 0.85], [1.35, -0.85], [-1.35, 0.85], [-1.35, -0.85]]) { cyl(b, M.tyre, cx + dx, 0.34, cz + dz, 0.34, 0.2, "z"); cyl(b, M.chrome, cx + dx, 0.34, cz + dz + Math.sign(dz) * 0.11, 0.14, 0.02, "z"); }
};
const buildCottage = (b: Batch) => {
  house(b, COTTAGE[0], COTTAGE[2], 0, 9, 7, 4.2, 2, 0);
  // catalogue desk in front of the door, with a stack of white catalogues
  bx(b, M.desk, KAMPRAD_AT[0] - 0.9, 0.7, KAMPRAD_AT[2] - 0.4, KAMPRAD_AT[0] + 0.9, 0.78, KAMPRAD_AT[2] + 0.4);
  for (const [dx, dz] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]]) bx(b, M.desk, KAMPRAD_AT[0] + dx - 0.04, 0, KAMPRAD_AT[2] + dz - 0.04, KAMPRAD_AT[0] + dx + 0.04, 0.7, KAMPRAD_AT[2] + dz + 0.04);
  for (let i = 0; i < 4; i++) bx(b, M.paper, KAMPRAD_AT[0] + 0.1, 0.78 + i * 0.03, KAMPRAD_AT[2] - 0.2, KAMPRAD_AT[0] + 0.55, 0.81 + i * 0.03, KAMPRAD_AT[2] + 0.2);
  // the broken parcel: a crate with planks sprung out (shot 2 close-up)
  const px = KAMPRAD_AT[0] - 0.7, pz = KAMPRAD_AT[2] + 0.8;
  bx(b, M.cardboard, px - 0.5, 0, pz - 0.35, px + 0.5, 0.45, pz + 0.35);
  for (const [a, s] of [[0.5, 1], [-0.35, -1], [0.9, 1]] as const) {
    const m = new THREE.Matrix4().makeRotationZ(a * s).setPosition(px + s * 0.45, 0.45, pz + (a - 0.3));
    b.add(boxGeo(V(0, 0, 0), V(0.7, 0.05, 0.12)), M.woodDark, m);
  }
};
const buildFactory = (b: Batch) => {
  house(b, FACTORY[0], FACTORY[2], 0, 14, 10, 5, 1, 0);
  bx(b, M.woodDark, FACTORY[0] - 1.4, 0, FACTORY[2] + 5.02, FACTORY[0] + 1.4, 3.2, FACTORY[2] + 5.12); // big workshop door
  for (let i = 0; i < 5; i++) cyl(b, M.woodDark, DEALERS_AT[0] + 3.3 + (i % 3) * 0.7, 0.4, DEALERS_AT[2] - 2 + (i >> 1) * 0.7, 0.3, 0.8);
};
const buildFair = (b: Batch) => {
  const [gx, , gz] = FAIR_GATE;
  for (const s of [-1, 1]) { bx(b, M.stone, gx + s * 2.2 - 0.35, 0, gz - 0.35, gx + s * 2.2 + 0.35, 3, gz + 0.35); bx(b, M.stone, gx + s * 2.2 - 0.45, 3, gz - 0.45, gx + s * 2.2 + 0.45, 3.2, gz + 0.45); }
  bx(b, M.stone, gx - 2.65, 3.2, gz - 0.3, gx + 2.65, 3.6, gz + 0.3); // lintel (no text on it)
  // tents behind the gate
  [[-4, -9, M.tentR], [2, -12, M.tentB], [8, -8, M.tentY]].forEach(([dx, dz, m], i) => {
    const x = gx + (dx as number), z = gz + (dz as number);
    bx(b, M.poleW, x - 2, 0, z - 2, x + 2, 2, z + 2);
    const g = new THREE.ConeGeometry(3.2, 1.8, 4); g.rotateY(Math.PI / 4);
    b.add(g, m as THREE.Material, new THREE.Matrix4().makeTranslation(x, 2.9, z));
    void i;
  });
};
const buildRoad = (b: Batch) => {
  slab(b, M.road, 35, TRUCK[2], 120, 7, 0.012);
  // truck: cab + bed + crates (nose toward +x)
  const [tx, , tz] = TRUCK;
  bx(b, M.cab, tx + 1.0, 0.5, tz - 1.0, tx + 2.8, 2.3, tz + 1.0);
  bx(b, M.glass, tx + 2.5, 1.4, tz - 0.9, tx + 2.85, 2.1, tz + 0.9);
  bx(b, M.bed, tx - 3.4, 0.5, tz - 1.05, tx + 0.9, 0.8, tz + 1.05);
  for (const [dx, dz] of [[2.0, 1.0], [2.0, -1.0], [-0.4, 1.05], [-0.4, -1.05], [-2.4, 1.05], [-2.4, -1.05]]) cyl(b, M.tyre, tx + dx, 0.5, tz + dz, 0.5, 0.3, "z");
  for (let i = 0; i < 6; i++) bx(b, M.crate, tx - 3.2 + (i % 3) * 1.35, 0.8 + (i >> 1 === 1 ? 0.9 : 0), tz - 0.9 + (i % 2) * 0.95, tx - 2.0 + (i % 3) * 1.35, 1.7 + (i >> 1 === 1 ? 0.9 : 0), tz - 0.05 + (i % 2) * 0.95);
  // striped border pole + fence far east (shot 7)
  for (let i = 0; i < 6; i++) bx(b, i % 2 ? M.poleW : M.pole, ROAD_EAST[0] - 0.08, i * 0.5, ROAD_EAST[2] - 3.5, ROAD_EAST[0] + 0.08, i * 0.5 + 0.5, ROAD_EAST[2] - 3.34);
};
const buildYard = (b: Batch) => {
  slab(b, DIRT, 0, 0, 40, 30, 0.012, 8);
  buildCar(b); buildCottage(b); buildFactory(b); buildFair(b); buildRoad(b);
  // the road to the fair, a few fence posts to give depth
  for (let i = 0; i < 12; i++) bx(b, M.woodDark, -30 + i * 2.2 - 0.05, 0, 14 - 0.05, -30 + i * 2.2 + 0.05, 1.1, 14 + 0.05);
};
const buildStudio = (b: Batch, [cx, , cz]: V3, w: number, d: number) => {
  slab(b, M.floor, cx, cz, w, d, 0.014, 6);
  bx(b, M.wall, cx - w / 2, 0, cz - d / 2 - 0.3, cx + w / 2, 5, cz - d / 2);
};
const buildShowroom = (b: Batch) => {
  buildStudio(b, SHOWROOM, 26, 16);
  const [sx, , sz] = SHOWROOM;
  for (const s of [-1, 1]) for (let r = 0; r < 3; r++) bx(b, M.shelf, sx + s * 8 - 1.2, 0.4 + r * 1.1, sz - 6, sx + s * 8 + 1.2, 0.5 + r * 1.1, sz - 5);
  for (const s of [-1, 1]) for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) bx(b, M.cardboard, sx + s * 8 - 1.1 + k * 0.78, 0.5 + r * 1.1, sz - 5.9, sx + s * 8 - 0.4 + k * 0.78, 0.9 + r * 1.1, sz - 5.1);
};
const buildExplain = (b: Batch) => {
  buildStudio(b, EXPLAIN, 24, 14);
};

// ---------------- table + flat box meshes (dynamic) ----------------
const boxMesh = (m: THREE.Material, w: number, h: number, d: number) => {
  const g = boxGeo(V(-w / 2, -h / 2, -d / 2), V(w / 2, h / 2, d / 2), 0, true);
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
};
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => { o.position.set(x, y, z); return o; };
const TOP = [1.4, 0.06, 0.8] as const, LEG_H = 0.72, LEG_XZ: [number, number][] = [[0.6, 0.32], [-0.6, 0.32], [0.6, -0.32], [-0.6, -0.32]];
class Table {
  g = new THREE.Group(); top = boxMesh(M.wood, ...TOP); legs: THREE.Mesh[] = LEG_XZ.map(() => boxMesh(M.woodDark, 0.07, LEG_H, 0.07));
  constructor() { this.g.add(this.top, ...this.legs); }
  /** assembled upright at (x, z) facing the camera */
  assembled(x: number, z: number) {
    this.top.position.set(0, LEG_H + 0.03, 0); this.top.rotation.set(0, 0, 0);
    this.legs.forEach((l, i) => { l.position.set(LEG_XZ[i][0], LEG_H / 2, LEG_XZ[i][1]); l.rotation.set(0, 0, 0); });
    this.g.position.set(x, 0, z); this.g.rotation.set(0, 0, 0);
  }
  /** story pose at time t: standing -> legs pop off -> top slides into the boot */
  story(t: number) {
    const s = tableState(t), off = 1 - s.legs, gx = TABLE0[0], gz = TABLE0[2];
    // legs: stay on until legsOff, then hop out and lie beside the top
    this.legs.forEach((l, i) => {
      const lx = LEG_XZ[i][0], lz = LEG_XZ[i][1];
      const hop = Math.sin(Math.min(1, off) * Math.PI) * 0.35;
      if (off <= 0) { l.position.set(lx, LEG_H / 2, lz); l.rotation.set(0, 0, 0); }
      else {
        l.position.set(lx * (1 - off) + (0.2 + i * 0.12) * off, LEG_H / 2 * (1 - off) + 0.04 * off + hop, lz * (1 - off) + (1.2 + i * 0.12) * off);
        l.rotation.set(0, 0, off * Math.PI / 2);
      }
    });
    // top: on legs, then dropped flat, then tilted and slid into the boot opening
    const ground = LEG_H * s.legs + 0.03;
    const slide = s.inBoot;
    const x = gx + (BOOT[0] + 1.1 - gx) * slide, y = ground + (BOOT[1] + 0.12 - ground) * slide, z = gz + (BOOT[2] - gz) * slide;
    this.top.position.set(x - gx, y, z - gz);
    this.top.rotation.set(0, 0, -0.35 * Math.sin(slide * Math.PI));
    this.g.position.set(gx, 0, gz); this.g.rotation.set(0, 0, 0);
  }
}

// ---------------- the world ----------------
export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight; private fill: THREE.DirectionalLight;
  private skyMat: THREE.ShaderMaterial; private sky: THREE.Mesh;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<"day" | "golden", THREE.Texture[]>;
  private clouds: THREE.Mesh[] = [];
  private fgs: { o: THREE.Object3D; a: number; b: number }[] = [];
  private groups = { main: new THREE.Group(), explain: new THREE.Group(), showroom: new THREE.Group() };
  private table = new Table(); private tableExplain = new Table();
  private flatBox: THREE.Mesh; private flatStack = new THREE.Group(); private bed2 = new THREE.Group(); private bubble: THREE.Mesh;
  private leaves: THREE.Mesh[] = []; private tags: THREE.Mesh[] = []; private showBox: THREE.Mesh; private showTable = new Table();
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(kit: Kit) {
    const R = this.root;
    setSight([] as Ray[]);
    // ---- sky + light (same rig as the bridge world) ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() }, c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el)); c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el)); c = mix(c, c4, smoothstep(e.z, e.w, el)); gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK); R.add(this.sky);
    const disc = ctex("sunDiscI", 128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: new THREE.Color(1, 1, 1), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.35 }));
    this.sunDisc.renderOrder = -0.5; this.sunHalo.renderOrder = 5;
    for (const m of [this.sunDisc, this.sunHalo]) { m.frustumCulled = false; m.layers.set(NOINK); R.add(m); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6); this.sun.castShadow = true; this.sun.shadow.mapSize.set(4096, 4096);
    this.fill = new THREE.DirectionalLight("#9fb8ff", 0.35);
    R.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)) };
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 130 + (i % 4) * 30; m.position.set(Math.cos(a) * d, 120 + (i % 4) * 38, Math.sin(a) * d); m.scale.set(w, w / 2, 1); m.layers.set(NOINK);
      this.clouds.push(m); R.add(m);
    }
    // ---- ground (everywhere) ----
    const gb = new Batch();
    slab(gb, GROUND, 0, 0, 1800, 1800, 0, 4);
    gb.build(R);
    // ---- scenery groups ----
    const mainB = new Batch(); buildYard(mainB); mainB.build(this.groups.main);
    const exB = new Batch(); buildExplain(exB); exB.build(this.groups.explain);
    const shB = new Batch(); buildShowroom(shB); shB.build(this.groups.showroom);
    R.add(this.groups.main, this.groups.explain, this.groups.showroom);
    // ---- dynamic pieces ----
    this.groups.main.add(this.table.g);
    // fair gate leaves (hinged at the pillars; swing shut at EV.fairSlam)
    for (const s of [-1, 1]) {
      const leaf = boxMesh(M.iron, 2.0, 2.6, 0.08);
      leaf.geometry.translate(s * -1.0, 0, 0); // hinge at the mesh origin
      leaf.position.set(FAIR_GATE[0] + s * 2.2, 1.4, FAIR_GATE[2]);
      this.leaves.push(leaf); this.groups.main.add(leaf);
    }
    // explain set: assembled table in a bubble of "air" vs the same table as a flat box
    this.tableExplain.assembled(EXPLAIN[0] - 3.2, EXPLAIN[2]); this.groups.explain.add(this.tableExplain.g);
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.75, 28, 18), new THREE.MeshBasicMaterial({ color: "#a9c7ee", transparent: true, opacity: 0.28, depthWrite: false }));
    this.bubble.position.set(EXPLAIN[0] - 3.2, 0.95, EXPLAIN[2]); this.bubble.layers.set(NOINK); this.groups.explain.add(this.bubble);
    this.flatBox = boxMesh(M.cardboard, 1.5, 0.16, 0.9); this.flatBox.position.set(EXPLAIN[0] + 3.2, 0.09, EXPLAIN[2]); this.groups.explain.add(this.flatBox);
    // shot 8c: two lorry beds, 2 assembled tables vs a neat stack of 8 flat boxes
    for (const [s, n] of [[-1, 2], [1, 8]] as const) {
      const bed = new THREE.Group();
      bed.add(at(boxMesh(M.bed, 5.0, 0.3, 2.6), 0, 0.15, 0));
      if (n === 2) for (const dx of [-1.2, 1.2]) { const t = new Table(); t.assembled(dx, 0); bed.add(t.g); bed.position.y = 0; }
      else for (let i = 0; i < n; i++) bed.add(at(boxMesh(M.cardboard, 1.5, 0.16, 0.9), ((i % 2) - 0.5) * 1.6, 0.38 + (i >> 1) * 0.18, 0));
      bed.position.set(EXPLAIN[0] + s * 4.2, 0, EXPLAIN[2] - 7);
      this.bed2.add(bed);
    }
    this.groups.explain.add(this.bed2);
    // showroom: price tags (drop at EV.priceDrop) + the flat box (shot 10 shows the reissued table next to it)
    for (let i = 0; i < 3; i++) {
      const tag = boxMesh(i % 2 ? M.tag : M.tagW, 0.5, 0.3, 0.04);
      tag.position.set(SHOWROOM[0] - 2.2 + i * 2.2, 2.6, SHOWROOM[2] - 3); this.tags.push(tag); this.groups.showroom.add(tag);
    }
    this.showBox = boxMesh(M.cardboard, 1.5, 0.16, 0.9); this.showBox.position.set(SHOWROOM[0] - 1.2, 0.09, SHOWROOM[2] + 0.2); this.groups.showroom.add(this.showBox);
    this.showTable.assembled(SHOWROOM[0] + 1.6, SHOWROOM[2] - 0.4); this.groups.showroom.add(this.showTable.g);
    // ---- foreground props ----
    for (const fg of FOREGROUND) {
      let o: THREE.Object3D | null = null;
      if (fg.kit === "crate") { o = boxMesh(M.crate, 0.8, 0.8, 0.8); o.position.y = 0.4; }
      else if (fg.kit === "barrel") { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 14), M.woodDark); m.position.y = 0.45; o = m; }
      else if (fg.kit === "toolbox") { o = boxMesh(M.iron, 0.5, 0.25, 0.3); o.position.y = 0.125; }
      else o = kitClone(kit, fg.kit, fg.s ?? 1);
      if (!o) continue;
      const g = new THREE.Group(); g.add(o); g.position.set(...fg.pos); g.rotation.y = fg.yaw ?? 0; g.visible = false;
      if (["crate", "barrel", "toolbox"].includes(fg.kit) && fg.s) g.scale.setScalar(fg.s / (fg.kit === "toolbox" ? 0.25 : 0.8));
      this.fgs.push({ o: g, a: fg.a, b: fg.b }); R.add(g);
    }
  }

  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1; fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const az = THREE.MathUtils.degToRad(L.az), el = THREE.MathUtils.degToRad(L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }
  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], L = LIGHTS[s.light], K = LOOK[s.light];
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.2; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- scene visibility ----
    const sc = s.scene;
    this.groups.main.visible = sc !== "explain" && sc !== "showroom";
    this.groups.explain.visible = sc === "explain"; this.groups.showroom.visible = sc === "showroom";
    this.table.g.visible = id === 1 || id === 6;
    if (this.table.g.visible) this.table.story(t);
    // fair gate: wide open (hinge angle 1.2 rad) until the slam at EV.fairSlam, then shut
    const shut = smooth((t - (EV.fairSlam - 0.5)) / 0.5);
    this.leaves.forEach((l, i) => { l.rotation.y = (i ? -1 : 1) * 1.25 * (1 - shut); });
    this.bed2.visible = f >= 1563; this.flatBox.visible = this.tableExplain.g.visible = this.bubble.visible = f < 1563;
    this.tags.forEach((tag, i) => { const u = smooth((t - EV.priceDrop - i * 0.25) / 0.5); tag.position.y = 2.6 - 1.1 * u; tag.rotation.z = 0.1 * Math.sin(t * 2 + i) * (1 - u * 0.5); });
    this.showTable.g.visible = id === 10;
    for (const g of this.fgs) g.o.visible = f >= g.a && f < g.b && g.a < s.b && g.b > s.a;
    // ---- light rig ----
    const sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 95);
    if (s.light === "golden") Rr = Math.max(Rr, 30);
    this.sun.position.copy(focus).addScaledVector(sunDir, 220); this.sun.target.position.copy(focus);
    const scam = this.sun.shadow.camera;
    scam.left = -Rr; scam.right = Rr; scam.top = Rr; scam.bottom = -Rr; scam.near = 20; scam.far = 480; scam.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    this.fill.intensity = 0;
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    // ---- sky, fog, sun disc, clouds ----
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    scene.fog = this.fog; scene.background = null;
    const showSun = s.light === "golden";
    this.sunDisc.visible = this.sunHalo.visible = showSun;
    if (showSun) {
      this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900);
      this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(1.7)));
      this.sunHalo.position.copy(this.sunDisc.position); this.sunHalo.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(24)));
      (this.sunHalo.material as THREE.SpriteMaterial).color.set(L.sunDisc).multiplyScalar(1.3);
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i], mat = m.material as THREE.MeshBasicMaterial;
      m.lookAt(cam.position.x, m.position.y, cam.position.z); mat.map = this.cloudMaps[s.light][i % 4];
    }
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, { pos: cam.position, right });
    const fxList: { key: string; cw: number; ch: number; draw: (p: import("./toon").Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean }[] = [];
    for (const p of st.places) { // soft contact pool under every character
      fxList.push({ key: "blob|contact|#3a3550", cw: 128, ch: 128, draw: (pen) => fxContact(pen, "#4a4260"), x: p.x, y: p.y + 0.022, z: p.z, w: 0.6, h: 0.45, flat: true });
    }
    if (id === 8 && t > EV.airPuffs - 0.3) { // puffs of air out of the bubble: the point of the shot
      for (let n = 0; n < 5; n++) {
        const u = ((t - EV.airPuffs + n * 0.5) % 2.5) / 2.5;
        fxList.push({ key: `cloud${n}`, cw: 400, ch: 260, draw: (pen) => fxCloud(pen, n), x: EXPLAIN[0] - 3.2 + (n - 2) * 0.9, y: 2.2 + u * 1.5, z: EXPLAIN[2] + 0.6, w: 1.1 * (1 - 0.3 * u), h: 0.7 * (1 - 0.3 * u), soft: true });
      }
    }
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const tint = s.light === "golden" ? "#ffcf9e" : "#ffffff";
    let ai = 0;
    for (const p of st.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5))) continue;
      const a = this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true; a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(p.mirror ? -sc2 : sc2, sc2, sc2);
      if (a.mat.emissiveMap) a.mat.emissive.set(tint);
      a.mesh.castShadow = L.actorShadow;
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    let fi = 0;
    for (const p of fxList) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const e2 = this.fx(fi++);
      e2.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e2.use(!!p.soft); e2.mesh.visible = true; e2.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e2.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0); else { e2.mesh.quaternion.copy(cam.quaternion); e2.mesh.rotateZ(p.rot ?? 0); }
      e2.mesh.scale.set(p.w, p.h, 1);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (let i = 0; i < ai; i++) this.actors[i].bind();
    for (let i = 0; i < fi; i++) this.fxs[i].bind();
    void clamp01; void ROAD_EAST;
    return focus;
  }
}
