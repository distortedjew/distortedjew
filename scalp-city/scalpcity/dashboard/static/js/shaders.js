// GLSL for the city. Colours are authored in sRGB and converted to linear at the end (toLinear),
// because the frame goes through OutputPass, which converts back to sRGB. Colours that arrive as
// THREE.Color uniforms or attributes are already linear, so they go through toSRGB first.
const srgb = /* glsl */ `vec3 toSRGB(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }`;

const common = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
  ${srgb}
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  vec3 applyFog(vec3 col, vec3 world) {
    float d = length(world - cameraPosition);
    return mix(col, toSRGB(uFogColor), smoothstep(uFogNear, uFogFar, d));
  }
`;

// Buildings: procedural lit windows (some flicker on and off), glowing vertical edges and roof rim.
export const building = {
  vertex: /* glsl */ `
    uniform float uSeed;
    #ifdef USE_INSTANCING
      attribute float aSeed;
    #endif
    varying vec3 vWorld;
    varying vec3 vNormalW;
    varying vec3 vLocal;
    varying float vSeed;
    void main() {
      mat4 m = modelMatrix;
      #ifdef USE_INSTANCING
        m = m * instanceMatrix;
        vSeed = aSeed;
      #else
        vSeed = uSeed;
      #endif
      vec4 w = m * vec4(position, 1.0);
      vWorld = w.xyz;
      vNormalW = normalize(mat3(m) * normal);
      vLocal = position;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragment: /* glsl */ `
    uniform float uTime;
    uniform vec3 uTint;
    uniform float uLit;
    uniform float uGlow;
    uniform float uTintMix;
    varying vec3 vWorld;
    varying vec3 vNormalW;
    varying vec3 vLocal;
    varying float vSeed;
    ${common}
    void main() {
      vec3 n = normalize(vNormalW);
      vec3 tint = mix(mix(vec3(0.35, 0.85, 1.0), vec3(0.75, 0.45, 1.0), hash(vec2(vSeed, 3.7))), toSRGB(uTint), uTintMix);
      vec3 col = vec3(0.03, 0.045, 0.17);
      if (abs(n.y) > 0.5) {
        col = vec3(0.05, 0.06, 0.2) + tint * 0.04;
      } else {
        bool sideX = abs(n.x) > 0.5;
        vec2 uv = sideX ? vec2(vWorld.z, vWorld.y) : vec2(vWorld.x, vWorld.y);
        vec2 g = uv / vec2(0.5, 0.72);
        vec2 id = floor(g);
        vec2 f = fract(g);
        float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.24, f.y) * step(f.y, 0.76);
        float face = sideX ? sign(n.x) * 3.0 : sign(n.z) * 7.0;
        float r = hash(id + vec2(vSeed * 13.1 + face, vSeed * 5.3));
        float lit = step(1.0 - uLit, r);
        // a few windows switch on/off every few seconds
        float flip = step(0.965, hash(id + floor(uTime * 0.15 + r * 40.0) + vSeed));
        lit = abs(lit - flip);
        lit *= step(0.9, vWorld.y);                       // no lit windows at street level
        vec3 wc = mix(vec3(1.0, 0.94, 0.82), vec3(0.62, 0.92, 1.0), step(0.72, hash(id * 1.7 + vSeed)));
        col += win * lit * wc * (0.72 + 0.22 * uGlow);   // stays under the bloom threshold
        col += win * (1.0 - lit) * vec3(0.05, 0.08, 0.28);
        float e = smoothstep(0.455, 0.5, sideX ? abs(vLocal.z) : abs(vLocal.x));
        col += tint * e * (0.35 + 0.5 * uGlow);
      }
      col += tint * smoothstep(0.965, 1.0, vLocal.y) * (0.45 + 0.6 * uGlow);   // roof rim
      col *= mix(0.45, 1.0, smoothstep(0.0, 5.0, vWorld.y));
      col = applyFog(col, vWorld);
      gl_FragColor = vec4(toLinear(col), 1.0);
    }`,
};

// Ground: fine + major grid lines, a radar pulse rolling out of the vault, darker towards the horizon.
export const ground = {
  vertex: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragment: /* glsl */ `
    uniform float uTime;
    uniform vec3 uPulse;
    uniform vec2 uCenter;
    varying vec3 vWorld;
    ${common}
    float grid(vec2 p, float size) {
      vec2 g = abs(fract(p / size - 0.5) - 0.5) / fwidth(p / size);
      return 1.0 - min(min(g.x, g.y), 1.0);
    }
    void main() {
      vec2 p = vWorld.xz;
      float r = length(p - uCenter);
      vec3 col = vec3(0.045, 0.065, 0.36);
      col += vec3(0.18, 0.26, 1.0) * grid(p, 2.5) * 0.35;
      col += vec3(0.35, 0.5, 1.0) * grid(p, 12.5) * 0.45;
      float w = fract(r * 0.035 - uTime * 0.12);
      float ring = exp(-pow((w - 0.5) * 30.0, 2.0));
      col += toSRGB(uPulse) * ring * 0.55 * (1.0 - smoothstep(8.0, 80.0, r));
      col += vec3(0.25, 0.3, 1.0) * 0.18 * (1.0 - smoothstep(0.0, 30.0, r));   // city glow pooled in the centre
      col = applyFog(col, vWorld);
      gl_FragColor = vec4(toLinear(col), 1.0);
    }`,
};

// Sky dome: gradient, twinkling stars, a slow aurora near the horizon.
export const sky = {
  vertex: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragment: /* glsl */ `
    uniform float uTime;
    varying vec3 vDir;
    float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
    void main() {
      float h = clamp(vDir.y, -0.2, 1.0);
      vec3 col = mix(vec3(0.16, 0.2, 0.78), vec3(0.02, 0.025, 0.14), smoothstep(-0.02, 0.6, h));
      vec3 cell = floor(vDir * 220.0);
      float s = hash3(cell);
      float star = step(0.9975, s) * smoothstep(0.05, 0.25, h);
      star *= 0.55 + 0.45 * sin(uTime * (1.0 + s * 4.0) + s * 60.0);
      col += vec3(0.85, 0.92, 1.0) * star;
      float a = sin(atan(vDir.z, vDir.x) * 5.0 + uTime * 0.07) * 0.5 + 0.5;
      float band = exp(-pow((h - 0.14 - 0.05 * a) * 14.0, 2.0));
      col += mix(vec3(0.2, 1.0, 0.75), vec3(0.65, 0.35, 1.0), a) * band * 0.16;
      gl_FragColor = vec4(toLinear(col), 1.0);
    }`,
};

// Trade beams: an energy column with stripes streaming upward, bright core, fading with height.
export const beam = {
  vertex: /* glsl */ `
    varying vec2 vUv;
    varying float vFacing;
    void main() {
      vUv = uv;
      vec3 n = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vFacing = abs(dot(n, normalize(-mv.xyz)));
      gl_Position = projectionMatrix * mv;
    }`,
  fragment: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uFlash;
    varying vec2 vUv;
    varying float vFacing;
    vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
    ${srgb}
    void main() {
      float stripes = 0.55 + 0.45 * sin(vUv.y * 70.0 - uTime * 7.0);
      float fade = pow(1.0 - vUv.y, 1.6);
      float core = pow(vFacing, 2.5);
      float a = (0.25 + 0.75 * core) * fade * (0.55 + 0.45 * stripes) * (1.0 + uFlash * 2.0);
      gl_FragColor = vec4(uColor * (1.0 + core * 1.5 + uFlash), clamp(a, 0.0, 1.0));   // uColor is already linear
    }`,
};

// Daily-target ring around a tower top: green arc = progress to the profit target, red arc = progress to the loss limit.
export const progressRing = {
  vertex: /* glsl */ `
    varying vec2 vPos;
    void main() {
      vPos = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragment: /* glsl */ `
    uniform float uProgress;   // -1..1+  (negative = toward the loss limit)
    uniform float uTime;
    uniform vec3 uWin;
    uniform vec3 uLoss;
    varying vec2 vPos;
    vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
    ${srgb}
    void main() {
      float ang = atan(vPos.x, vPos.y) / 6.28318 + 0.5;    // 0..1 clockwise from the front
      float p = clamp(abs(uProgress), 0.0, 1.0);
      float on = uProgress >= 0.0 ? step(ang, p) : step(1.0 - p, ang);
      vec3 c = toSRGB(uProgress >= 0.0 ? uWin : uLoss);
      if (uProgress >= 1.0) c = vec3(1.0, 0.85, 0.3) * (1.0 + 0.3 * sin(uTime * 4.0));
      float track = 0.18;
      vec3 col = mix(vec3(0.5, 0.6, 1.0) * track, c * 1.6, on);
      float alpha = mix(0.35, 0.95, on);
      gl_FragColor = vec4(toLinear(col), alpha);
    }`,
};

// Vault dome: fresnel glow, scan bands, tinted by today's P&L.
export const dome = {
  vertex: /* glsl */ `
    varying vec3 vN;
    varying vec3 vView;
    varying float vY;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      vY = position.y;
      gl_Position = projectionMatrix * mv;
    }`,
  fragment: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec3 vN;
    varying vec3 vView;
    varying float vY;
    vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
    ${srgb}
    void main() {
      vec3 uC = toSRGB(uColor);
      float fres = pow(1.0 - max(dot(vN, vView), 0.0), 2.2);
      float bands = 0.5 + 0.5 * sin(vY * 9.0 - uTime * 2.2);
      vec3 col = mix(vec3(0.92, 0.95, 1.0), uC, 0.35) * 0.75;
      col += uC * fres * 1.4 + uC * bands * 0.12;
      gl_FragColor = vec4(toLinear(col), 1.0);
    }`,
};

// Animated dashes flowing along tower -> vault links.
export const flowLine = {
  vertex: /* glsl */ `
    attribute float aDist;
    varying float vDist;
    void main() {
      vDist = aDist;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragment: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uSpeed;
    varying float vDist;
    vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
    void main() {
      float d = fract(vDist * 0.6 - uTime * uSpeed);
      float a = smoothstep(0.0, 0.15, d) * (1.0 - smoothstep(0.35, 0.5, d));
      gl_FragColor = vec4(uColor * 1.4, 0.15 + a * 0.75);   // uColor is already linear
    }`,
};

// Soft round glowing points (dust, sparks, coins).
export const points = {
  vertex: /* glsl */ `
    attribute float aSize;
    attribute vec3 aColor;
    attribute float aAlpha;
    uniform float uScale;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vColor = aColor;
      vAlpha = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uScale / -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragment: /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;
    vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, d);
      a = a * a * vAlpha;
      if (a < 0.01) discard;
      gl_FragColor = vec4(vColor * 1.6, a);   // attribute colours come from THREE.Color: already linear
    }`,
};
