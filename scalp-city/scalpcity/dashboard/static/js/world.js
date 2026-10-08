// The 3D city: sky, ground, skyline, roads and traffic, towers (one per bot), the vault, links and effects.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import * as S from "./shaders.js";

const FOG = { color: new THREE.Color(0x1a2296), near: 60, far: 230 };
const VAULT = new THREE.Vector3(0, 0, 6);
const TITLE_SPOT = new THREE.Vector3(0, 22, -62);
/** Where district billboard i stands: alternating left/right behind the towers. */
function districtSpot(i) {
  const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
  return new THREE.Vector3(side * (30 + row * 6), 10 + row * 5, -24 - row * 10);
}
const SIGN_LOTS = [TITLE_SPOT, ...Array.from({ length: 6 }, (_, i) => districtSpot(i))];

export const COLORS = {
  green: new THREE.Color(0x33ff99), red: new THREE.Color(0xff4d6d), gold: new THREE.Color(0xffd84d),
  cyan: new THREE.Color(0x5fd3ff), idle: new THREE.Color(0x7d8cff), grey: new THREE.Color(0x6a6f9a),
};
const STATUS_TINT = { watching: COLORS.cyan, call: COLORS.green, put: COLORS.red, "target hit": COLORS.gold, halted: COLORS.red, closed: COLORS.grey };

let seeded = 1;
const rand = (a = 0, b = 1) => { seeded = (seeded * 16807) % 2147483647; return a + ((seeded - 1) / 2147483646) * (b - a); };
const fogUniforms = () => ({ uFogColor: { value: FOG.color }, uFogNear: { value: FOG.near }, uFogFar: { value: FOG.far } });

function buildingMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: S.building.vertex, fragmentShader: S.building.fragment,
    uniforms: {
      uTime: { value: 0 }, uSeed: { value: opts.seed ?? 1 }, uTint: { value: (opts.tint ?? COLORS.cyan).clone() },
      uTintMix: { value: opts.tintMix ?? 0 }, uLit: { value: opts.lit ?? 0.45 }, uGlow: { value: opts.glow ?? 0 }, ...fogUniforms(),
    },
  });
}
const unitBox = () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0); // base at y=0, scale.y = height

export class World {
  constructor(host, { quality = "high", onPick = () => {} } = {}) {
    this.host = host;
    this.onPick = onPick;
    this.towers = new Map();
    this.time = 0;
    this.materials = []; // every material with a uTime uniform
    this.packets = [];
    this.anim = null;
    this.autoRotate = false;
    this.lastInput = performance.now();

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }));
    r.setClearColor(0x05072a);
    host.appendChild(r.domElement);
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "labels-layer";
    host.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 900);
    this.controls = new OrbitControls(this.camera, this.labels.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: Math.PI * 0.47, minDistance: 10, maxDistance: 140, autoRotateSpeed: 0.35 });
    this.controls.target.set(0, 6, 0);
    this.controls.addEventListener("start", () => { this.anim = null; this.lastInput = performance.now(); });

    this.scene.add(new THREE.AmbientLight(0x8899ff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 40, 20);
    this.scene.add(sun);

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.45, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this._sky(); this._ground(); this._skyline(); this._roads(); this._traffic(); this._lamps(); this._trees();
    this._drones(); this._dust(); this._sparks(); this._vault(); this._signs();
    this.setQuality(quality);
    this._picking();
    addEventListener("resize", () => this.resize());
    this.resize();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ------------------------------------------------------------------ setup
  _track(mat) { this.materials.push(mat); return mat; }

  _sky() {
    const m = this._track(new THREE.ShaderMaterial({ vertexShader: S.sky.vertex, fragmentShader: S.sky.fragment, uniforms: { uTime: { value: 0 } }, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), m));
  }

  _ground() {
    this.groundMat = this._track(new THREE.ShaderMaterial({
      vertexShader: S.ground.vertex, fragmentShader: S.ground.fragment,
      uniforms: { uTime: { value: 0 }, uPulse: { value: COLORS.cyan.clone() }, uCenter: { value: new THREE.Vector2(VAULT.x, VAULT.z) }, ...fogUniforms() },
    }));
    const g = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), this.groundMat);
    g.rotation.x = -Math.PI / 2;
    this.scene.add(g);
  }

  _skyline() {
    seeded = 7;
    const spots = [];
    for (let i = 0; spots.length < 230 && i < 4000; i++) {
      const a = rand(0, Math.PI * 2), rr = rand(33, 120);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (z > 18 && rr < 70) continue; // keep the camera's foreground open
      if (SIGN_LOTS.some((p) => Math.hypot(p.x - x, p.z - z) < (p === TITLE_SPOT ? 16 : 8) || (p === TITLE_SPOT && Math.abs(x) < 15 && z < -30 && z > -95))) continue; // sight lines to the signs
      const far = rr > 70 ? 1.6 : 1;
      spots.push([x, z, rand(2.2, 5.5) * far, rand(4, 22) * far * (rr > 45 ? 1.25 : 1), rand(2.2, 5.5) * far]);
    }
    for (let i = 0; i < 46; i++) spots.push([rand(-30, 30), rand(30, 52), rand(1, 2.4), rand(0.8, 2.6), rand(1, 2.4)]); // low suburb in front
    const mat = this._track(buildingMaterial({ lit: 0.42 }));
    const mesh = new THREE.InstancedMesh(unitBox(), mat, spots.length);
    // axis-aligned on purpose: the window shader lays its grid out in world X/Z
    const seeds = new Float32Array(spots.length), m = new THREE.Matrix4(), q = new THREE.Quaternion();
    spots.forEach(([x, z, w, h, d], i) => {
      mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(w, h, d)));
      seeds[i] = rand(0, 100);
    });
    mesh.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    this.scene.add(mesh);
    this.skyline = mesh;
  }

  _roads() {
    const road = new THREE.Mesh(new THREE.RingGeometry(23.0, 25.8, 160, 1), new THREE.MeshBasicMaterial({ color: 0x080b38 }));
    road.rotation.x = -Math.PI / 2; road.position.y = 0.04; this.scene.add(road);
    for (const [rad, col, w] of [[23.0, 0x9fd8ff, 0.12], [25.8, 0x6a86ff, 0.12]]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(rad, w, 6, 200), new THREE.MeshBasicMaterial({ color: col }));
      t.rotation.x = Math.PI / 2; t.position.y = 0.1; this.scene.add(t);
    }
    const n = 110, dash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.03, 0.09), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2);
      dash.setMatrixAt(i, m.compose(new THREE.Vector3(Math.cos(a) * 24.4, 0.08, Math.sin(a) * 24.4), q, new THREE.Vector3(1, 1, 1)));
    }
    this.scene.add(dash);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(8.5, 64), new THREE.MeshBasicMaterial({ color: 0x070930 }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(VAULT.x, 0.05, VAULT.z); this.scene.add(plaza);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.08, 6, 120), new THREE.MeshBasicMaterial({ color: 0xffd84d }));
    edge.rotation.x = Math.PI / 2; edge.position.set(VAULT.x, 0.1, VAULT.z); this.scene.add(edge);
  }

  _traffic() {
    seeded = 21;
    this.cars = [];
    const n = 30, mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.85, 0.32, 0.42).translate(0, 0.16, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.cars.push({ a: rand(0, Math.PI * 2), r: dir > 0 ? 24.0 : 24.85, v: dir * rand(0.07, 0.13) });
      mesh.setColorAt(i, dir > 0 ? new THREE.Color(2.2, 0.35, 0.45) : new THREE.Color(2.2, 2.2, 2.4)); // tail lights / headlights
    }
    this.carMesh = mesh;
    this.scene.add(mesh);
  }

  _lamps() {
    const n = 40, poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 2.4, 6).translate(0, 1.2, 0), new THREE.MeshBasicMaterial({ color: 0x1b2266 }), n);
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.1, 1.5) }), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = Math.cos(a) * 26.5, z = Math.sin(a) * 26.5;
      poles.setMatrixAt(i, m.makeTranslation(x, 0, z));
      bulbs.setMatrixAt(i, m.makeTranslation(x, 2.45, z));
    }
    this.scene.add(poles, bulbs);
  }

  _trees() {
    seeded = 33;
    const n = 70, mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.42, 1.3, 7).translate(0, 0.65, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), rr = i < 36 ? rand(20.5, 22.2) : rand(27.5, 30);
      const s = rand(0.7, 1.3);
      mesh.setMatrixAt(i, m.compose(new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
      mesh.setColorAt(i, new THREE.Color().setHSL(0.52 + rand(-0.03, 0.06), 0.9, rand(0.45, 0.6)));
    }
    this.scene.add(mesh);
  }

  _drones() {
    seeded = 44;
    this.drones = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.7), new THREE.MeshBasicMaterial({ color: 0x2a3399 })));
      const red = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.3, 0.4) }));
      const grn = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 3, 1) }));
      red.position.set(-0.4, 0, 0); grn.position.set(0.4, 0, 0); g.add(red, grn);
      this.scene.add(g);
      this.drones.push({ g, red, grn, r: rand(14, 34), y: rand(15, 27), v: rand(0.06, 0.14) * (i % 2 ? 1 : -1), a: rand(0, 6.28), ph: rand(0, 6) });
    }
  }

  _pointsMaterial() {
    return new THREE.ShaderMaterial({
      vertexShader: S.points.vertex, fragmentShader: S.points.fragment, uniforms: { uScale: { value: 300 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
  }

  _dust() {
    seeded = 55;
    const n = 420, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set([rand(-70, 70), rand(0, 38), rand(-70, 50)], i * 3);
      const c = new THREE.Color().setHSL(rand(0.5, 0.78), 0.9, 0.7);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = rand(0.6, 1.6); alpha[i] = rand(0.15, 0.5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    this.dust = new THREE.Points(g, this._pointsMaterial());
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  _sparks() {
    const n = 900;
    this.sp = { n, next: 0, life: new Float32Array(n), max: new Float32Array(n), vel: new Float32Array(n * 3) };
    const g = new THREE.BufferGeometry();
    for (const [name, k] of [["position", 3], ["aColor", 3], ["aSize", 1], ["aAlpha", 1]]) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(n * k), k));
    this.sparks = new THREE.Points(g, this._pointsMaterial());
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
  }

  /** Emit `count` sparks at `pos` with an upward fountain spread. */
  burst(pos, color, count = 40, speed = 4, size = 2.2, life = 1.4) {
    const { sp } = this, g = this.sparks.geometry;
    const P = g.attributes.position.array, C = g.attributes.aColor.array, Z = g.attributes.aSize.array;
    for (let k = 0; k < count; k++) {
      const i = sp.next; sp.next = (sp.next + 1) % sp.n;
      P.set([pos.x, pos.y, pos.z], i * 3);
      const a = Math.random() * Math.PI * 2, up = 0.4 + Math.random();
      sp.vel.set([Math.cos(a) * speed * Math.random(), up * speed, Math.sin(a) * speed * Math.random()], i * 3);
      C.set([color.r, color.g, color.b], i * 3);
      Z[i] = size * (0.6 + Math.random() * 0.8);
      sp.life[i] = sp.max[i] = life * (0.6 + Math.random() * 0.6);
    }
  }

  _vault() {
    const v = (this.vault = new THREE.Group());
    v.position.copy(VAULT);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.7, 3, 48).translate(0, 1.5, 0), new THREE.MeshLambertMaterial({ color: 0x8f7fd6, emissive: 0x2a1f66 }));
    const band = new THREE.Mesh(new THREE.TorusGeometry(4.25, 0.09, 6, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 0.5) }));
    band.rotation.x = Math.PI / 2; band.position.y = 3;
    v.add(band);
    this.domeMat = this._track(new THREE.ShaderMaterial({ vertexShader: S.dome.vertex, fragmentShader: S.dome.fragment, uniforms: { uTime: { value: 0 }, uColor: { value: COLORS.cyan.clone() } } }));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(4.2, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), this.domeMat);
    dome.position.y = 3;
    v.add(base, dome);
    for (let i = 0; i < 10; i++) { // pillars of light around the plaza
      const a = (i / 10) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.6, 0.22).translate(0, 0.8, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.7, 0.6) }));
      p.position.set(Math.cos(a) * 7.2, 0, Math.sin(a) * 7.2);
      v.add(p);
    }
    this.vaultRing = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.05, 6, 120), new THREE.MeshBasicMaterial({ color: 0xffd84d, transparent: true, opacity: 0.8 }));
    this.vaultRing.rotation.x = Math.PI / 2; this.vaultRing.position.y = 7.6;
    v.add(this.vaultRing);
    v.userData.pick = "vault";
    this.scene.add(v);
    const el = document.createElement("div");
    el.className = "vault-label";
    this.vaultLabel = new CSS2DObject(el);
    this.vaultLabel.position.set(VAULT.x, 10.5, VAULT.z);
    this.scene.add(this.vaultLabel);
    el.addEventListener("click", () => this.onPick("vault"));
    this.vaultEl = el;
  }

  /** A neon billboard: canvas-drawn text on a plane, on two posts. White text blooms; the frame glows in `color`. */
  _billboard(text, color, { w = 12, h = 3, posts = true } = {}) {
    const cv = document.createElement("canvas"), k = 64;
    cv.width = w * k; cv.height = h * k;
    const g = cv.getContext("2d");
    const draw = (t) => {
      g.clearRect(0, 0, cv.width, cv.height);
      g.fillStyle = "rgba(10,16,80,0.82)";
      g.beginPath(); g.roundRect(10, 10, cv.width - 20, cv.height - 20, 18); g.fill();
      g.lineWidth = 9; g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = 26; g.stroke();
      g.shadowBlur = 22; g.shadowColor = "#9ff";
      g.fillStyle = "#f4f8ff";
      let size = cv.height * 0.56;
      g.font = `900 ${size}px system-ui, sans-serif`;
      while (g.measureText(t).width > cv.width - 70 && size > 10) { size -= 4; g.font = `900 ${size}px system-ui, sans-serif`; }
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(t, cv.width / 2, cv.height / 2 + size * 0.05);
      tex.needsUpdate = true;
    };
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    draw(text);
    const grp = new THREE.Group();
    const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, fog: false }));
    grp.add(board);
    if (posts) for (const x of [-w * 0.32, w * 0.32]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 6).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0x1d2680 }));
      post.position.set(x, -h / 2, -0.05);
      grp.add(post);
      grp.userData.posts = (grp.userData.posts || []).concat(post);
    }
    grp.userData.setText = draw;
    return grp;
  }

  _signs() {
    this.title = this._billboard("Scalp City", "#66ffff", { w: 26, h: 5.2 });
    this.title.position.copy(TITLE_SPOT);
    this.title.lookAt(0, 33, 56);
    this.title.userData.posts.forEach((p) => (p.scale.y = TITLE_SPOT.y - 2.6));
    this.scene.add(this.title);
    this.districts = new Map();
  }

  setTitle(text) {
    if (text !== this.titleText) { this.titleText = text; this.title.userData.setText(text); }
  }

  /** District billboards stand behind the towers, alternating left and right, facing the default camera. */
  setDistricts(names) {
    names.forEach((d, i) => {
      if (this.districts.has(d)) return;
      const hot = /0DTE/i.test(d);
      const b = this._billboard(d, hot ? "#ff4d6d" : "#33ff99", { w: 9, h: 2.2 });
      const p = districtSpot(i);
      b.position.copy(p);
      b.lookAt(0, 33, 56); // face the default camera
      b.userData.posts.forEach((post) => (post.scale.y = p.y - 1.1));
      this.scene.add(b);
      this.districts.set(d, b);
    });
  }

  setLabelsVisible(on) { for (const b of this.districts.values()) b.visible = on; }

  // ------------------------------------------------------------------ towers
  _towerSpot(i, n) {
    const a = n === 1 ? Math.PI * 1.5 : Math.PI * (1.08 + (0.84 * i) / (n - 1));
    return new THREE.Vector3(Math.cos(a) * 17, 0, Math.sin(a) * 17);
  }

  ensureTowers(workers) {
    workers.forEach((w, i) => { if (!this.towers.has(w.name)) this.towers.set(w.name, this._makeTower(w, i, workers.length)); });
  }

  _makeTower(w, i, n) {
    seeded = 100 + i * 17;
    const pos = this._towerSpot(i, n);
    const g = new THREE.Group();
    g.position.copy(pos);
    g.userData.pick = w.name;
    const tint = COLORS.cyan.clone();

    const podium = new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 9).translate(0, 0.3, 0), new THREE.MeshBasicMaterial({ color: 0x0a1050 }));
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(podium.geometry), new THREE.LineBasicMaterial({ color: tint }));
    g.add(podium, rim);

    const annexMat = this._track(buildingMaterial({ seed: i * 3.3 + 1, lit: 0.5 }));
    for (let k = 0; k < 6; k++) {
      const x = rand(-3.6, 3.6), z = rand(-3.6, 3.6);
      if (Math.hypot(x, z) < 2.4) continue;
      const b = new THREE.Mesh(unitBox(), annexMat);
      b.scale.set(rand(1.2, 2.2), rand(1.5, 5.5), rand(1.2, 2.2));
      b.position.set(x, 0.6, z);
      g.add(b);
    }

    const mat = this._track(buildingMaterial({ seed: i * 7.1 + 2, tint, tintMix: 0.9, lit: 0.62, glow: 0.4 }));
    const tiers = [3.6, 2.8, 2.0].map((wd) => { const m = new THREE.Mesh(unitBox(), mat); m.scale.set(wd, 1, wd); g.add(m); return m; });
    const crownMat = new THREE.MeshBasicMaterial({ color: tint.clone().multiplyScalar(1.6) });
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.15, 0.7, 8).translate(0, 0.35, 0), crownMat);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.18, 3.2, 6).translate(0, 1.6, 0), new THREE.MeshBasicMaterial({ color: 0xbfe0ff }));
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.3), transparent: true }));
    g.add(crown, spire, blink);

    const ringMat = this._track(new THREE.ShaderMaterial({
      vertexShader: S.progressRing.vertex, fragmentShader: S.progressRing.fragment,
      uniforms: { uProgress: { value: 0 }, uTime: { value: 0 }, uWin: { value: COLORS.green }, uLoss: { value: COLORS.red } },
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
    }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.25, 2.6, 128), ringMat);
    ring.rotation.x = -Math.PI / 2;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.03, 6, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
    halo.rotation.x = Math.PI / 2;
    g.add(ring, halo);

    const beamMat = this._track(new THREE.ShaderMaterial({
      vertexShader: S.beam.vertex, fragmentShader: S.beam.fragment,
      uniforms: { uTime: { value: 0 }, uColor: { value: COLORS.green.clone() }, uFlash: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 70, 24, 1, true).translate(0, 35, 0), beamMat);
    beam.visible = false;
    g.add(beam);

    // flowing link to the vault
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(pos.x, 0.7, pos.z), new THREE.Vector3(pos.x * 0.45, 7, (pos.z + VAULT.z) * 0.5), new THREE.Vector3(VAULT.x, 3.2, VAULT.z));
    const pts = curve.getPoints(60), dist = new Float32Array(pts.length);
    for (let k = 1; k < pts.length; k++) dist[k] = dist[k - 1] + pts[k].distanceTo(pts[k - 1]);
    const lg = new THREE.BufferGeometry().setFromPoints(pts);
    lg.setAttribute("aDist", new THREE.BufferAttribute(dist, 1));
    const linkMat = this._track(new THREE.ShaderMaterial({ vertexShader: S.flowLine.vertex, fragmentShader: S.flowLine.fragment, uniforms: { uTime: { value: 0 }, uColor: { value: tint.clone() }, uSpeed: { value: 0.4 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(new THREE.Line(lg, linkMat));

    const el = document.createElement("div");
    el.className = "tower-label";
    el.addEventListener("click", (e) => { e.stopPropagation(); this.onPick(w.name); });
    const label = new CSS2DObject(el);
    g.add(label);

    this.scene.add(g);
    return { g, pos, tiers, crown, crownMat, spire, blink, ring, ringMat, halo, beam, beamMat, mat, rim, linkMat, curve, label, el, tint, h: 7, targetH: 7, lift: (i % 2) * 2.6, flash: 0 };
  }

  /** Push one worker's live numbers into its tower. */
  updateTower(w) {
    const t = this.towers.get(w.name);
    if (!t) return;
    const pnl = w.pnl_today + (w.unrealized || 0);
    t.targetH = 7 + Math.max(-3, Math.min(15, pnl / 90));
    const prog = pnl >= 0 ? (w.target > 0 ? pnl / w.target : 0) : (w.max_loss > 0 ? pnl / w.max_loss : 0);
    t.ringMat.uniforms.uProgress.value = Math.max(-1, Math.min(1.0001, prog));
    const st = w.position ? w.position.right : w.status;
    const tint = STATUS_TINT[st] || COLORS.idle;
    t.tint.copy(tint);
    t.mat.uniforms.uTint.value.copy(tint);
    t.mat.uniforms.uGlow.value = w.position ? 1 : st === "target hit" ? 0.6 : st === "closed" || st === "halted" ? 0 : 0.35;
    t.mat.uniforms.uLit.value = st === "closed" || st === "halted" ? 0.25 : 0.62;
    t.crownMat.color.copy(tint).multiplyScalar(1.6);
    t.rim.material.color.copy(tint);
    t.linkMat.uniforms.uColor.value.copy(tint);
    t.linkMat.uniforms.uSpeed.value = w.position ? 1.2 : 0.35;
    t.beam.visible = !!w.position;
    if (w.position) t.beamMat.uniforms.uColor.value.copy(w.position.right === "call" ? COLORS.green : COLORS.red);
  }

  towerLabel(name) { return this.towers.get(name)?.el; }

  setSelected(name) {
    for (const [n, t] of this.towers) {
      t.el.classList.toggle("selected", n === name);
      t.el.classList.toggle("dimmed", !!name && n !== name);
    }
  }

  /** A trade just closed: a glowing packet flies tower -> vault (profit) or vault -> tower (loss). */
  tradeClosed(name, pnl) {
    const t = this.towers.get(name);
    if (!t) return;
    const color = pnl >= 0 ? COLORS.gold : COLORS.red;
    const top = t.pos.clone().setY(t.h + 1);
    this.burst(top, pnl >= 0 ? COLORS.green : COLORS.red, 50, 3.5);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.5) }));
    this.scene.add(mesh);
    const from = pnl >= 0 ? top : VAULT.clone().setY(7), to = pnl >= 0 ? VAULT.clone().setY(7) : top;
    const mid = from.clone().lerp(to, 0.5).setY(Math.max(from.y, to.y) + 7);
    this.packets.push({ mesh, curve: new THREE.QuadraticBezierCurve3(from, mid, to), t: 0, color, profit: pnl >= 0 });
  }

  tradeOpened(name) {
    const t = this.towers.get(name);
    if (t) { t.flash = 1; this.burst(t.pos.clone().setY(t.h + 1), COLORS.cyan, 30, 3); }
  }

  setVault(pnl, html) {
    this.vaultEl.innerHTML = html;
    const c = pnl > 0 ? COLORS.green : pnl < 0 ? COLORS.red : COLORS.cyan;
    this.domeMat.uniforms.uColor.value.copy(c);
    this.groundMat.uniforms.uPulse.value.copy(c);
    this.vaultPnl = pnl;
  }

  // ------------------------------------------------------------------ camera
  _defaultView() {
    // portrait phones look down from higher up, so the foreground skyline doesn't block the towers
    if (this.camera.aspect < 0.8) return { pos: new THREE.Vector3(0, 82, 84), target: new THREE.Vector3(0, 2, -4) };
    const k = Math.max(1, 1.25 / this.camera.aspect);
    return { pos: new THREE.Vector3(0, 33 * Math.min(k, 1.9), 56 * Math.min(k, 2.1)), target: new THREE.Vector3(0, 9, -2) };
  }

  resetView() { this._flyTo(this._defaultView()); }

  /** Fly to a tower, framing it in the part of the screen the panel leaves free. */
  focus(name) {
    const t = this.towers.get(name);
    if (!t) return;
    const portrait = this.camera.aspect < 1;
    const k = portrait ? 1.7 : 1;
    const look = t.pos.clone().setY(t.h * 0.55);
    const pos = look.clone().add(new THREE.Vector3(t.pos.x * 0.25, 12 * k, 30 * k));
    // desktop: the panel covers the right side, so aim right of the tower; phone: the sheet covers the bottom, aim below it
    const target = portrait ? look.clone().add(new THREE.Vector3(0, -9, 0)) : look.clone().add(new THREE.Vector3(10, 0, 0));
    pos.add(target.clone().sub(look));
    this._flyTo({ pos, target });
  }

  _flyTo({ pos, target }) {
    this.anim = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: target, k: 0 };
  }

  setAutoRotate(on) { this.autoRotate = on; this.controls.autoRotate = on; }

  setQuality(q) {
    this.quality = q;
    const dpr = Math.min(devicePixelRatio || 1, q === "high" ? 2 : q === "medium" ? 1.5 : 1);
    this.renderer.setPixelRatio(dpr);
    this.bloom.enabled = q !== "low";
    this.dust.visible = q !== "low";
    this.resize();
  }

  resize() {
    const w = this.host.clientWidth || innerWidth, h = this.host.clientHeight || innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.placed) { const v = this._defaultView(); this.camera.position.copy(v.pos); this.controls.target.copy(v.target); this.placed = true; }
    const s = h / 2 / Math.tan((this.camera.fov * Math.PI) / 360);
    for (const p of [this.dust, this.sparks]) p.material.uniforms.uScale.value = s * 0.12;
  }

  _picking() {
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    let down = null;
    const el = this.labels.domElement;
    el.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; this.lastInput = performance.now(); });
    el.addEventListener("pointerup", (e) => {
      if (e.target.closest?.(".tower-label, .vault-label")) return; // the label's own click handler picks
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const rect = el.getBoundingClientRect();
      mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(mouse, this.camera);
      const targets = [this.vault, ...[...this.towers.values()].map((t) => t.g)];
      for (const hit of ray.intersectObjects(targets, true)) {
        let o = hit.object;
        while (o && !o.userData.pick) o = o.parent;
        if (o) return this.onPick(o.userData.pick);
      }
    });
  }

  // ------------------------------------------------------------------ loop
  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.time += dt;
    const T = this.time;
    for (const m of this.materials) if (m.uniforms.uTime) m.uniforms.uTime.value = T;

    if (this.anim) {
      const a = this.anim;
      a.k = Math.min(1, a.k + dt / 1.1);
      const e = a.k < 0.5 ? 4 * a.k ** 3 : 1 - (-2 * a.k + 2) ** 3 / 2;
      this.camera.position.lerpVectors(a.p0, a.p1, e);
      this.controls.target.lerpVectors(a.t0, a.t1, e);
      if (a.k >= 1) this.anim = null;
    }
    this.controls.update();

    for (const t of this.towers.values()) {
      t.h += (t.targetH - t.h) * Math.min(1, dt * 2.5);
      const hs = [t.h * 0.46, t.h * 0.34, t.h * 0.2];
      let y = 0.6;
      t.tiers.forEach((m, k) => { m.position.y = y; m.scale.y = hs[k]; y += hs[k]; });
      t.crown.position.y = y; t.spire.position.y = y + 0.7; t.blink.position.y = y + 4.0;
      t.blink.material.opacity = Math.sin(T * 3 + t.pos.x) > 0.6 ? 1 : 0.15;
      t.ring.position.y = y + 0.2; t.halo.position.y = y + 0.2 + Math.sin(T * 1.5 + t.pos.x) * 0.25;
      t.halo.rotation.z = T * 0.5;
      t.beam.position.y = y + 0.7;
      t.flash = Math.max(0, t.flash - dt * 1.2);
      t.beamMat.uniforms.uFlash.value = t.flash;
      t.label.position.set(0, y + 5.2 + t.lift, 0);
      t.top = y;
    }

    // traffic
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    this.cars.forEach((c, i) => {
      c.a += (c.v * dt * 10) / c.r;
      q.setFromAxisAngle(up, -c.a + (c.v > 0 ? -Math.PI / 2 : Math.PI / 2));
      this.carMesh.setMatrixAt(i, m.compose(new THREE.Vector3(Math.cos(c.a) * c.r, 0.06, Math.sin(c.a) * c.r), q, one));
    });
    this.carMesh.instanceMatrix.needsUpdate = true;

    for (const d of this.drones) {
      d.a += d.v * dt;
      d.g.position.set(Math.cos(d.a) * d.r, d.y + Math.sin(T * 0.8 + d.ph) * 0.8, Math.sin(d.a) * d.r - 4);
      d.g.rotation.y = -d.a;
      const on = Math.sin(T * 4 + d.ph) > 0.7;
      d.red.visible = on; d.grn.visible = !on;
    }

    // dust drifts upward and wraps
    if (this.dust.visible) {
      const P = this.dust.geometry.attributes.position.array;
      for (let i = 1; i < P.length; i += 3) { P[i] += dt * 0.35; if (P[i] > 38) P[i] = 0; }
      this.dust.geometry.attributes.position.needsUpdate = true;
    }

    // vault fountain while the city is green
    this.vaultRing.rotation.z = T * 0.3;
    if (this.vaultPnl > 0 && Math.random() < dt * 6) this.burst(VAULT.clone().setY(6.5), COLORS.gold, 2, 2.5, 1.6, 1.8);

    // packets
    this.packets = this.packets.filter((p) => {
      p.t += dt / 1.4;
      const pt = p.curve.getPoint(Math.min(p.t, 1));
      p.mesh.position.copy(pt);
      this.burst(pt, p.color, 2, 0.6, 1.4, 0.6);
      if (p.t >= 1) {
        this.burst(pt, p.color, 70, 5, 2.4, 1.6);
        this.scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose();
        return false;
      }
      return true;
    });

    // spark physics
    const { sp } = this, g = this.sparks.geometry;
    const P = g.attributes.position.array, A = g.attributes.aAlpha.array;
    for (let i = 0; i < sp.n; i++) {
      if (sp.life[i] <= 0) { A[i] = 0; continue; }
      sp.life[i] -= dt;
      sp.vel[i * 3 + 1] -= 6 * dt;
      P[i * 3] += sp.vel[i * 3] * dt; P[i * 3 + 1] += sp.vel[i * 3 + 1] * dt; P[i * 3 + 2] += sp.vel[i * 3 + 2] * dt;
      if (P[i * 3 + 1] < 0.1) { P[i * 3 + 1] = 0.1; sp.vel[i * 3 + 1] *= -0.3; }
      A[i] = Math.max(0, sp.life[i] / sp.max[i]);
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;

    this.composer.render();
    this.labels.render(this.scene, this.camera);
  }
}
