import {Camera, H, W, WW} from './types';

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface Cam { left: number; top: number; vw: number; vh: number; zoom: number }

export function camera(kind: Camera, p: number, f: number, focus: {x: number; y: number}): Cam {
  const e = ease(clamp(p, 0, 1)); const mid = WW / 2;
  let cx = mid, cy = H / 2, zoom = 1.0, sx = 0, sy = 0;
  switch (kind) {
    case 'push_in': zoom = lerp(1.0, 1.32, e); cx = lerp(mid, focus.x, e); cy = lerp(H / 2, focus.y, e); break;
    case 'pull_out': zoom = lerp(1.38, 1.0, e); cx = lerp(focus.x, mid, e); cy = lerp(focus.y, H / 2, e); break;
    case 'pan_right': zoom = 1.1; cx = lerp(mid - 330, mid + 330, e); cy = H / 2 + 20; break;
    case 'pan_left': zoom = 1.1; cx = lerp(mid + 330, mid - 330, e); cy = H / 2 + 20; break;
    case 'tilt_up': zoom = 1.28; cx = mid; cy = lerp(H - 190, 200, e); break;
    case 'tilt_down': zoom = 1.28; cx = mid; cy = lerp(200, H - 190, e); break;
    case 'follow': zoom = 1.18; cx = focus.x; cy = lerp(H / 2 + 30, focus.y, 0.6); break;
    case 'shake': { zoom = lerp(1.05, 1.16, e); cx = focus.x * 0.5 + mid * 0.5; const a = 11 * (0.35 + 0.65 * Math.exp(-f / 35)); sx = Math.sin(f * 2.1) * a; sy = Math.cos(f * 2.9) * a; break; }
    default: zoom = lerp(1.0, 1.04, e);
  }
  sx += Math.sin(f * 0.031) * 3; sy += Math.cos(f * 0.043) * 2;   // handheld leggero
  const vw = W / zoom, vh = H / zoom;
  return {left: clamp(cx - vw / 2 + sx, 0, WW - vw), top: clamp(cy - vh / 2 + sy, 0, H - vh), vw, vh, zoom};
}
