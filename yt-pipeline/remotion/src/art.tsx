import React from 'react';
import {Mood} from './types';

export const rng = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const PALETTES: Record<Mood, {sky: [string, string]; far: string; mid: string; near: string; accent: string}> = {
  calm: {sky: ['#f6e7c8', '#f3b98a'], far: '#d9a48a', mid: '#b97d6a', near: '#7d5a5a', accent: '#e4572e'},
  tense: {sky: ['#cdbfae', '#8f8a86'], far: '#827b7c', mid: '#5f5a60', near: '#3a3744', accent: '#c0392b'},
  joy: {sky: ['#ffeaa7', '#fab1a0'], far: '#f4a261', mid: '#e76f51', near: '#9c4a3c', accent: '#2a9d8f'},
  sad: {sky: ['#b8c6d4', '#7f93a8'], far: '#7c8ea0', mid: '#5a6c80', near: '#38475a', accent: '#d4a373'},
};
export const NIGHT = {sky: ['#1b2440', '#3d3a6b'] as [string, string], far: '#2c3558', mid: '#212944', near: '#141a30', accent: '#ffd166'};

export type Pal = typeof NIGHT;

export const Sky: React.FC<{pal: Pal; night?: boolean; w: number; h: number; t: number}> = ({pal, night, w, h, t}) => {
  const r = rng(7);
  return (
    <g>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal.sky[0]} /><stop offset="1" stopColor={pal.sky[1]} />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill="url(#sky)" />
      {night
        ? Array.from({length: 60}).map((_, i) => (
            <circle key={i} cx={r() * w} cy={r() * h * 0.6} r={1 + r() * 1.6} fill="#fff" opacity={0.5 + 0.5 * Math.sin(t * 0.08 + i)} />
          ))
        : null}
      <circle cx={w * (0.2 + 0.6 * t * 0.02)} cy={h * 0.22} r={night ? 46 : 62} fill={night ? '#f4f1de' : '#fff6d6'} opacity={night ? 0.95 : 0.9} />
    </g>
  );
};

export const Hills: React.FC<{seed: number; color: string; y: number; amp: number; w: number; h: number; off: number; freq?: number}> = ({seed, color, y, amp, w, h, off, freq = 1}) => {
  const r = rng(seed); const p1 = r() * 6, p2 = r() * 6, f1 = 0.004 * freq, f2 = 0.011 * freq;
  const pts: string[] = [];
  for (let x = -40; x <= w + 40; x += 16) {
    const X = x + off;
    pts.push(`${x},${y + Math.sin(X * f1 + p1) * amp + Math.sin(X * f2 + p2) * amp * 0.4}`);
  }
  return <polygon points={`-40,${h} ${pts.join(' ')} ${w + 40},${h}`} fill={color} />;
};

export const Skyline: React.FC<{seed: number; color: string; y: number; w: number; off: number; night?: boolean; accent: string}> = ({seed, color, y, w, off, night, accent}) => {
  const r = rng(seed); const out: React.ReactNode[] = []; let x = -200;
  while (x < w + 400) {
    const bw = 50 + r() * 70, bh = 80 + r() * 230; const px = x - off;
    out.push(<rect key={`b${x}`} x={px} y={y - bh} width={bw} height={bh} fill={color} />);
    if (r() > 0.55) out.push(<polygon key={`r${x}`} points={`${px},${y - bh} ${px + bw / 2},${y - bh - 30} ${px + bw},${y - bh}`} fill={color} />);
    for (let wy = y - bh + 14; wy < y - 20; wy += 24) for (let wx = px + 10; wx < px + bw - 14; wx += 20)
      if (r() > 0.5) out.push(<rect key={`w${x}${wy}${wx}`} x={wx} y={wy} width={8} height={12} fill={night ? accent : '#ffffff'} opacity={night ? 0.8 : 0.25} />);
    x += bw + 6 + r() * 20;
  }
  return <g>{out}</g>;
};

export const Mountains: React.FC<{seed: number; color: string; y: number; w: number; off: number; snow?: string}> = ({seed, color, y, w, off, snow}) => {
  const r = rng(seed); const out: React.ReactNode[] = []; let x = -300;
  while (x < w + 500) {
    const bw = 260 + r() * 260, bh = 160 + r() * 220; const px = x - off;
    out.push(<polygon key={x} points={`${px},${y} ${px + bw / 2},${y - bh} ${px + bw},${y}`} fill={color} />);
    if (snow) out.push(<polygon key={`s${x}`} points={`${px + bw / 2 - bh * 0.22},${y - bh * 0.78} ${px + bw / 2},${y - bh} ${px + bw / 2 + bh * 0.22},${y - bh * 0.78}`} fill={snow} />);
    x += bw * 0.65;
  }
  return <g>{out}</g>;
};

export const Tree: React.FC<{x: number; y: number; s: number; color: string}> = ({x, y, s, color}) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <rect x={-4} y={-30} width={8} height={30} fill="#5b3f3a" />
    <circle cx={0} cy={-50} r={28} fill={color} /><circle cx={-18} cy={-38} r={20} fill={color} /><circle cx={18} cy={-38} r={20} fill={color} />
  </g>
);

export const House: React.FC<{x: number; y: number; s: number; color: string; roof: string}> = ({x, y, s, color, roof}) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <rect x={-45} y={-60} width={90} height={60} fill={color} />
    <polygon points="-55,-60 0,-105 55,-60" fill={roof} />
    <rect x={-10} y={-34} width={20} height={34} fill="#3a2f33" opacity={0.7} />
  </g>
);

export const Waves: React.FC<{y: number; w: number; h: number; color: string; t: number; amp?: number}> = ({y, w, h, color, t, amp = 8}) => {
  const pts: string[] = [];
  for (let x = 0; x <= w; x += 16) pts.push(`${x},${y + Math.sin(x * 0.02 + t * 0.12) * amp}`);
  return <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={color} />;
};

export const Boat: React.FC<{x: number; y: number; s: number; t: number; color: string}> = ({x, y, s, t, color}) => (
  <g transform={`translate(${x},${y + Math.sin(t * 0.1) * 4}) rotate(${Math.sin(t * 0.08) * 3}) scale(${s})`}>
    <polygon points="-60,0 60,0 40,25 -40,25" fill={color} />
    <rect x={-2} y={-90} width={4} height={90} fill="#3a2f33" />
    <polygon points="4,-88 4,-10 55,-10" fill="#f4f1de" />
  </g>
);

// Personaggio senza volto, stile documentario minimale.
export const Person: React.FC<{x: number; y: number; s: number; color: string; skin: string; t: number; mood: Mood; walking?: boolean; flip?: boolean}> = ({x, y, s, color, skin, t, mood, walking, flip}) => {
  const bob = walking ? Math.abs(Math.sin(t * 0.3)) * 5 : Math.sin(t * 0.06) * 1.5;
  const swing = walking ? Math.sin(t * 0.3) * 14 : 0;
  const slump = mood === 'sad' ? 8 : 0; const raise = mood === 'joy' ? -40 : mood === 'tense' ? -12 : 14;
  return (
    <g transform={`translate(${x},${y - bob}) scale(${flip ? -s : s},${s})`}>
      <ellipse cx={0} cy={bob + 2} rx={30} ry={6} fill="#000" opacity={0.15} />
      <line x1={-8} y1={-55} x2={-8 + swing} y2={0} stroke="#2b2b3a" strokeWidth={11} strokeLinecap="round" />
      <line x1={8} y1={-55} x2={8 - swing} y2={0} stroke="#2b2b3a" strokeWidth={11} strokeLinecap="round" />
      <rect x={-20} y={-125 + slump} width={40} height={75} rx={18} fill={color} />
      <line x1={-18} y1={-112 + slump} x2={-34} y2={-70 + raise + (walking ? swing : 0) * 0.5} stroke={color} strokeWidth={10} strokeLinecap="round" />
      <line x1={18} y1={-112 + slump} x2={34} y2={-70 + raise - (walking ? swing : 0) * 0.5} stroke={color} strokeWidth={10} strokeLinecap="round" />
      <circle cx={slump ? 4 : 0} cy={-146 + slump * 1.4} r={20} fill={skin} />
    </g>
  );
};
