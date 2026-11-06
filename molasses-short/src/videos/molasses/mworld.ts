// The molasses flood as one three.js scene (sky/light rig reused from the bridge world; geometry is new).
import * as THREE from "three";
import { Batch, boxGeo, V, lam, house, Kit } from "../bridge/build";
import { ctex, cobbleHD, cloudHD } from "../bridge/paint";
import { Pen } from "../bridge/toon";
import { LIGHTS, LOOK, LightPreset } from "../bridge/lights";
import { TONE, CHAR, untone } from "../bridge/shade";
import { NOINK } from "../bridge/ink";
import { Pool, Actor, Fx } from "./mcast";
import { stage } from "./mcast";
import { FPS, SHOTS, TANK, TANK_R, TANK_H, POP, bulge, zFront, waveH, camAt, ShotDef, V3 } from "./mstory";

export const loadKit = async () => ({} as Kit);
const SUN_SHOT: Record<number, { az?: number; el?: number }> = { 11: { az: -70, el: 14 }, 13: { az: 135, el: 36 }, 9: { az: 150, el: 40 }, 12: { az: 150, el: 40 } };
type Mats = Record<string, THREE.Material>;
const discTex = () => ctex("sunDisc", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const haloTex = () => ctex("sunHalo", 256, 256, (g) => {
  const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.hypot(x - 127.5, y - 127.5) / 128;
    const a = (0.55 * Math.exp(-((u / 0.25) ** 2)) + 0.35 * Math.exp(-((u / 0.6) ** 2))) * (1 - Math.min(1, Math.max(0, (u - 0.8) / 0.2)));
    const i = (y * 256 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(im, 0, 0);
});
const rngf = (i: number) => { const v = Math.sin(i * 127.1) * 43758.5453; return v - Math.floor(v); };
const tankTex = () => ctex("tankPaint", 1024, 512, (g) => {
  g.fillStyle = "#7d4d2c"; g.fillRect(0, 0, 1024, 512);
  for (let k = 0; k < 5; k++) { g.fillStyle = k % 2 ? "#85532f" : "#744626"; g.fillRect(0, k * 102, 1024, 102); g.fillStyle = "#3a2112"; g.fillRect(0, k * 102, 1024, 5); }
  for (let k = 0; k < 16; k++) { g.fillStyle = "#4a2b16"; g.fillRect(k * 64, 0, 4, 512); }
  g.fillStyle = "#c9a07a";
  for (let k = 0; k < 16; k++) for (let j = 0; j < 20; j++) { g.beginPath(); g.arc(k * 64 + 8, j * 25.6 + 10, 3.2, 0, 7); g.fill(); }
  for (let i = 0; i < 26; i++) { const x = rngf(i) * 1024, y0 = rngf(i + 50) * 300, len = 80 + rngf(i + 9) * 200; g.fillStyle = "#2c180b"; g.fillRect(x, y0, 5 + rngf(i + 3) * 6, len); g.beginPath(); g.arc(x + 3, y0 + len, 6, 0, 7); g.fill(); }
});
const wallTex = () => ctex("tankPaintWall", 64, 64, (g) => { g.fillStyle = "#7d4d2c"; g.fillRect(0, 0, 64, 64); });
const NXW = 49, NZW = 146, XW0 = -11.5, ZW0 = -72;

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight; private fill: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<"day" | "golden", THREE.Texture[]>;
  private clouds: THREE.Mesh[] = [];
  private tank: THREE.Group; private wave: THREE.Mesh; private waveGeo: THREE.PlaneGeometry; private harbor: THREE.Mesh;
  private rivets: THREE.Mesh[] = []; private drips: THREE.Mesh[] = []; private streaks: THREE.Mesh[] = [];
  private jar: THREE.Group; private honey: THREE.Mesh[] = []; private pool2: THREE.Mesh[] = [];
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(_kit: Kit) {
    const R = this.root, M: Mats = {};
    // ---- sky + light ----
    // sky: 5 colour stops by elevation (textures.md 5.2 #5 + depth.md 2/6.5), written as tone-map-inverted linear values
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
          c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el));
          c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(), color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(1, 1, 1), fog: false, depthWrite: false, depthTest: true,
      transparent: true, blending: THREE.AdditiveBlending }));
    this.sunDisc.renderOrder = -0.5; this.sunHalo.renderOrder = 5;
    for (const m of [this.sunDisc, this.sunHalo]) { m.frustumCulled = false; m.layers.set(NOINK); R.add(m); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.fill = new THREE.DirectionalLight("#9fb8ff", 0.35);
    R.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)) };
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 130 + (i % 4) * 30;
      m.position.set(Math.cos(a) * d, 120 + (i % 4) * 38, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK);
      this.clouds.push(m); R.add(m);
    }

    // ---- ground + street ----
    M.cobble = lam("cobbleHD", () => ({ map: cobbleHD() }));
    const gt = cobbleHD(); void gt;
    const ground = new THREE.PlaneGeometry(500, 290); ground.rotateX(-Math.PI / 2); ground.translate(0, 0, 60);
    const cm = M.cobble as THREE.MeshLambertMaterial; if (cm.map) { cm.map.repeat.set(160, 100); cm.map.wrapS = cm.map.wrapT = THREE.RepeatWrapping; cm.map.needsUpdate = true; }
    const gm = new THREE.Mesh(ground, cm); gm.receiveShadow = true; R.add(gm);
    // ---- houses ----
    const b = new Batch();
    const sz = [7, 9], hs = [7, 8.4, 9.8];
    for (const sx of [-1, 1]) for (const row of [0, 1]) {
      let z = -78 + row * 5;
      while (z < 118) {
        const w = sz[Math.floor(rngf(z * 3 + sx + row * 7) * 2)], h = hs[Math.floor(rngf(z + 11 + row) * 3)];
        const cx = sx * (10 + row * 17), cz = z + w / 2;
        const tankZone = sx < 0 && cz > 40 && cz < 80;
        if (!tankZone && !(sx > 0 && cz > -2 && cz < 4 && row === 0 && false)) house(b, cx, cz, sx < 0 ? Math.PI / 2 : -Math.PI / 2, w, 8, h, Math.floor(rngf(z) * 8), 0);
        z += w + (rngf(z + 5) < 0.25 ? 2.5 : 0.3);
      }
    }
    b.build(R);
    // ---- the tank ----
    const tm = lam("tankPaint", () => ({ map: tankTex() }));
    this.tank = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(TANK_R, TANK_R, TANK_H, 56, 1, true).translate(0, TANK_H / 2, 0), tm);
    body.castShadow = true; body.receiveShadow = true; this.tank.add(body);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(TANK_R, TANK_R, 0.5, 56).translate(0, TANK_H + 0.25, 0), lam("tankLid", () => ({ color: "#5c3920" })));
    lid.castShadow = true; this.tank.add(lid);
    this.tank.position.set(TANK[0], 0, TANK[2]); R.add(this.tank);
    const rivM = lam("rivet", () => ({ color: "#d8c2a0" }));
    const ang = (k: number) => 0.12 * (k - 2);
    for (let k = 0; k < 5; k++) {
      const r = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), rivM); r.castShadow = true; r.userData.k = k; this.rivets.push(r); R.add(r);
      void ang;
    }
    const dm = lam("drip", () => ({ color: "#2e1a0c" }));
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1, 0.05), dm); this.streaks.push(s); R.add(s);
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), dm); this.drips.push(d); R.add(d);
    }
    // pipe from the wall + cold-side hose
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 8, 14).rotateZ(Math.PI / 2).translate(-8.5, 1.2, 56), lam("pipe", () => ({ color: "#4a4d56" }))); pipe.castShadow = true; R.add(pipe);
    // ---- the wave (heightfield rewritten each frame) ----
    this.waveGeo = new THREE.PlaneGeometry(1, 1, NXW - 1, NZW - 1);
    this.waveGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NXW * NZW * 3), 3));
    const wi: number[] = [];
    for (let j = 0; j < NZW - 1; j++) for (let i = 0; i < NXW - 1; i++) { const a = j * NXW + i, c = a + NXW; wi.push(a, c, a + 1, a + 1, c, c + 1); }
    this.waveGeo.setIndex(wi);
    const wuv: number[] = []; for (let j = 0; j < NZW; j++) for (let i = 0; i < NXW; i++) wuv.push(i / 6, j / 6);
    this.waveGeo.setAttribute("uv", new THREE.Float32BufferAttribute(wuv, 2)); this.waveGeo.deleteAttribute("normal");
    this.waveGeo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(NXW * NZW * 3), 3));
    this.wave = new THREE.Mesh(this.waveGeo, lam("molasses", () => ({ color: "#4a2610" })));
    (this.wave.material as any).vertexColors = true; this.waveGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(NXW * NZW * 3), 3)); this.wave.castShadow = true; this.wave.receiveShadow = true; this.wave.frustumCulled = false; R.add(this.wave);
    // ---- harbour ----
    this.harbor = new THREE.Mesh(new THREE.PlaneGeometry(500, 200).rotateX(-Math.PI / 2).translate(0, -0.15, -190), lam("harbor", () => ({ color: "#2f7aa3" })));
    this.harbor.receiveShadow = true; R.add(this.harbor);
    // ---- honey shelf (shot 9) and engineer office (shot 12), built far from the street ----
    this.jar = new THREE.Group(); R.add(this.jar);
    const bg = (x: number, col: string) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 3), lam("bg" + col, () => ({ color: col }))); m.position.set(x, 1.8, 1.2); m.rotation.y = Math.PI; m.receiveShadow = true; R.add(m); };
    bg(79.6, "#9ec8e8"); bg(80.6, "#f4b86a");
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 1.0), lam("shelf", () => ({ color: "#8a5a34" }))); shelf.position.set(80.1, 1.6, 0.2); shelf.castShadow = true; R.add(shelf);
    const floor2 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.1, 1.6), lam("shelf", () => ({ color: "#8a5a34" }))); floor2.position.set(80.1, 0.1, 0.2); R.add(floor2);
    const jarM = lam("jarGlass", () => ({ color: "#d8861c" }));
    for (const x of [79.65, 80.55]) {
      const j = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.62, 20), jarM); j.position.set(x, 1.97, 0.2); j.castShadow = true; R.add(j);
      const lidm = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 20), lam("jarLid", () => ({ color: "#c93a2a" }))); lidm.position.set(x, 2.33, 0.2); R.add(lidm);
      const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 8), jarM); this.honey.push(strand); R.add(strand);
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), jarM); this.honey.push(bead); R.add(bead);
      const puddle = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.04, 20), jarM); this.pool2.push(puddle); R.add(puddle);
    }
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 1.4), lam("desk", () => ({ color: "#7a4b2a" }))); desk.position.set(60.2, 0.78, 0.0); desk.castShadow = true; R.add(desk);
    for (const dx of [-1.15, 1.15]) for (const dz of [-0.55, 0.55]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.78, 0.1), lam("desk", () => ({ color: "#7a4b2a" }))); l.position.set(60.2 + dx, 0.39, dz); R.add(l); }
    const paper = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.8), lam("paper", () => ({ color: "#f3ecd8" }))); paper.position.set(60.2, 0.85, 0.0); R.add(paper);
    const wallb = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), lam("officeWall", () => ({ color: "#4b6f94" }))); wallb.position.set(60.2, 2.6, 3.4); wallb.rotation.y = Math.PI; wallb.receiveShadow = true; R.add(wallb);
    void wallTex; void NOINK; void V; void boxGeo;
  }

  /** camera-relative sun, frozen per shot: the shot's mean view direction turned by az toward screen right, lifted by el */
  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const ss = s as ShotDef & { sunAz?: number; sunEl?: number };
    const az = THREE.MathUtils.degToRad(ss.sunAz ?? SUN_SHOT[id]?.az ?? (s.light === "day" ? 140 : L.az)), el = THREE.MathUtils.degToRad(ss.sunEl ?? SUN_SHOT[id]?.el ?? L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az); // screen right = (-fz, fx)
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }

  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], tau = s.tau(t), L = LIGHTS[s.light];
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.2; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK); // sky, clouds, smoke and sun sprites live on the no-ink layer but are still rendered
    // ---- light rig (lighting.md 9.4): camera-relative sun frozen per shot, two-tone uniforms, shadow fit ----
    const K = LOOK[s.light], sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 95);
    if (s.light === "golden") Rr = Math.max(Rr, 30); // el 7: 2 m cards throw ~16 m shadows, houses much longer
    this.sun.position.copy(focus).addScaledVector(sunDir, 220); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 480; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    this.fill.intensity = 0; // not used by the two-tone shading
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...LOOK[s.light].bounce); TONE.uSat.value = LOOK[s.light].sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    // ---- sky, fog (colour = horizon colour, linear fogNear -> fogFar), sun disc + halo, clouds ----
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
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      mat.map = this.cloudMaps[s.light][i % 4];
    }
    // ---- tank, rivets, drips ----
    const bl = bulge(t), burst = tau > 0;
    this.tank.visible = tau < 0.35;
    this.tank.scale.set(1 + bl, tau > 0 ? Math.max(0.04, 1 - tau * 4) : 1, 1 + bl);
    this.rivets.forEach((r, k) => {
      const a = (k - 2) * 0.1, h = 5 + k * 1.9 + (k % 2) * 0.6, rr = (TANK_R + bl * TANK_R);
      const base: V3 = [TANK[0] + rr * Math.cos(a), h, TANK[2] + rr * Math.sin(a)];
      const dt = t - POP[k];
      if (dt < 0 || id === 1) { r.visible = tau < 0.35; r.position.set(...base); r.scale.setScalar(1); }
      else { r.visible = dt < 2.2; r.position.set(base[0] + 14 * dt, base[1] + 5 * dt - 9.8 * dt * dt * 0.5, base[2] + (k - 2) * 2 * dt); r.scale.setScalar(1 + 1.2 * Math.max(0, 1 - dt * 3)); }
    });
    const showDrip = id === 3 || id === 13 || id === 4;
    this.streaks.forEach((m, k) => {
      m.visible = false;
      const a = (k - 1) * 0.07, len = 2.4 + k * 0.7, top = 3.9 - k * 0.2;
      m.scale.set(1, len, 1); m.position.set(TANK[0] + (TANK_R + 0.03) * Math.cos(a), top - len / 2, TANK[2] + (TANK_R + 0.03) * Math.sin(a));
      const d = this.drips[k]; d.visible = showDrip;
      const u = (t * 0.55 + k * 0.37) % 1;
      d.position.set(m.position.x + 0.05, top - len - u * 1.6, m.position.z); d.scale.setScalar(0.6 + 0.7 * (1 - u));
    });
    // ---- wave heightfield ----
    this.wave.visible = tau > 0;
    this.harbor.material = this.harbor.material;
    (this.harbor.material as THREE.MeshLambertMaterial).color.set(s.light === "golden" && id === 11 ? "#6a4120" : "#2f7aa3");
    if (tau > 0) {
      const pos = this.waveGeo.getAttribute("position") as THREE.BufferAttribute, nor = this.waveGeo.getAttribute("normal") as THREE.BufferAttribute;
      const col = this.waveGeo.getAttribute("color") as THREE.BufferAttribute; const zf = zFront(tau), H = waveH(tau), Lw = Math.min(22, 4 + 10 * tau), res = 0.5 * THREE.MathUtils.smoothstep(tau, 0, 6);
      for (let j = 0; j < NZW; j++) for (let i = 0; i < NXW; i++) {
        const x = XW0 + (i * 23) / (NXW - 1), z = ZW0 + j, d = z - zf;
        let h = 0;
        if (d >= -0.8) {
          const dd = Math.max(0, d), edge = THREE.MathUtils.smoothstep(11.5 - Math.abs(x), 0, 2);
          const body2 = H * (1 - Math.exp(-dd / 1.1)) * (1 - THREE.MathUtils.smoothstep(dd, Lw, Lw + 14)) + res * THREE.MathUtils.smoothstep(dd, Lw - 4, Lw + 14);
          h = (Math.max(body2, res * THREE.MathUtils.smoothstep(dd, 0, 2)) * (1 + 0.07 * Math.sin(x * 0.9 + dd * 0.7 - t * 3))) * (0.2 + 0.8 * edge);
          if (d < 0) h *= 1 + d / 0.8;
        }
        pos.setXYZ(j * NXW + i, x, h, z); const kk = Math.min(1, h / 5) ** 0.7; col.setXYZ(j * NXW + i, 0.9 + 0.5 * kk, 0.9 + 0.35 * kk, 0.9 + 0.1 * kk);
      }
      pos.needsUpdate = true; col.needsUpdate = true; this.waveGeo.computeVertexNormals(); void nor; void burst;
    }
    // ---- honey (cold left creeps, warm right pours) ----
    const hm = Math.max(0, t - 41.67);
    const dripLen = (cold: boolean) => (cold ? Math.min(0.55, 0.05 + 0.07 * hm) : Math.min(1.5, 0.1 + 2.2 * Math.max(0, hm - 3)));
    [0, 1].forEach((k) => {
      const x = k ? 80.55 : 79.65, len = dripLen(!k), top = 1.56;
      const st = this.honey[k * 2], bd = this.honey[k * 2 + 1], pl = this.pool2[k];
      st.scale.set(k ? 1.5 : 0.8, Math.max(0.02, len), k ? 1.5 : 0.8); st.position.set(x, top - len / 2, 0.62);
      bd.position.set(x, top - len - 0.04, 0.62); bd.scale.setScalar(k ? 0.6 : 1.4);
      const pr = k ? 0.1 + 0.55 * Math.min(1, Math.max(0, hm - 4.5) / 3) : 0.001; pl.scale.set(pr, 1, pr); pl.position.set(x, 0.17, 0.62); pl.visible = pr > 0.01;
    });
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, { pos: cam.position, right });
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const tint = s.light === "golden" ? "#ffcf9e" : "#ffffff";
    let ai = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5))) continue;
      const a = this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(p.mirror ? -sc2 : sc2, sc2, sc2);
      if (a.mat.emissiveMap) a.mat.emissive.set(tint); // legacy emissive card until the CHAR agent's cardShade lands
      a.mesh.castShadow = L.actorShadow; // day: soft contact blobs instead (CHAR agent)
      used.push(a);
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const e = this.fx(fi++);
      e.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e.use(!!p.soft);
      e.mesh.visible = true;
      e.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e.mesh.quaternion.copy(cam.quaternion); e.mesh.rotateZ(p.rot ?? 0); }
      e.mesh.scale.set(p.w, p.h, 1);
      fused.push(e);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const e of fused) e.bind();
    return focus;
  }
}
