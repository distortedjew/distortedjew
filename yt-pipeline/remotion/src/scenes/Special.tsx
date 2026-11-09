import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {Center} from '../Overlays';
import {Scene, W, H} from '../types';

const ease = Easing.out(Easing.cubic);

export const TitleCard: React.FC<{s: Scene}> = ({s}) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 20], [0, 1], {extrapolateRight: 'clamp'});
  const y = interpolate(f, [0, 25], [30, 0], {easing: ease, extrapolateRight: 'clamp'});
  return (
    <Center bg="#1d1b2f">
      <div style={{opacity: o, transform: `translateY(${y}px)`, fontSize: 78, fontWeight: 800, padding: '0 90px', lineHeight: 1.1}}>{s.title}</div>
      <div style={{marginTop: 26, width: interpolate(f, [10, 40], [0, 260], {extrapolateRight: 'clamp'}), height: 6, background: '#e4572e'}} />
      {s.subtitle && <div style={{marginTop: 26, fontSize: 32, opacity: o * 0.85, letterSpacing: 4, textTransform: 'uppercase'}}>{s.subtitle}</div>}
    </Center>
  );
};

export const QuoteCard: React.FC<{s: Scene}> = ({s}) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 25], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <Center bg="#2b2438">
      <div style={{fontSize: 120, color: '#e4572e', lineHeight: 0.6, opacity: o}}>“</div>
      <div style={{opacity: o, fontSize: 50, fontStyle: 'italic', padding: '0 130px', lineHeight: 1.3}}>{s.quote}</div>
      {s.by && <div style={{marginTop: 30, fontSize: 28, opacity: o * 0.8}}>— {s.by}</div>}
    </Center>
  );
};

export const StatCard: React.FC<{s: Scene; frames: number}> = ({s, frames}) => {
  const f = useCurrentFrame();
  const v = Math.round(interpolate(f, [8, Math.min(frames - 20, 70)], [0, s.value ?? 0], {easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  return (
    <Center bg="#1b2a3a">
      <div style={{fontSize: 190, fontWeight: 800, color: '#f2c14e'}}>{v.toLocaleString('it-IT')}<span style={{fontSize: 70, marginLeft: 12}}>{s.unit}</span></div>
      <div style={{fontSize: 40, opacity: 0.9, padding: '0 120px', marginTop: 10}}>{s.label}</div>
    </Center>
  );
};

export const TimelineCard: React.FC<{s: Scene; frames: number}> = ({s, frames}) => {
  const f = useCurrentFrame();
  const items = s.items ?? []; const n = Math.max(items.length, 1);
  const lineW = interpolate(f, [5, frames - 30], [0, W - 240], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <Center bg="#232a2f">
      <svg width={W} height={H} style={{position: 'absolute'}}>
        <line x1={120} y1={H / 2} x2={120 + lineW} y2={H / 2} stroke="#fff" strokeWidth={6} strokeLinecap="round" />
        {items.map((it, i) => {
          const x = 120 + (n === 1 ? (W - 240) / 2 : (i / (n - 1)) * (W - 240));
          const show = x - 120 <= lineW;
          const up = i % 2 === 0;
          return show ? (
            <g key={i}>
              <circle cx={x} cy={H / 2} r={16} fill="#e4572e" />
              <line x1={x} y1={H / 2} x2={x} y2={H / 2 + (up ? -70 : 70)} stroke="#fff" strokeWidth={3} />
              <text x={x} y={H / 2 + (up ? -150 : 150)} textAnchor="middle" fill="#f2c14e" fontSize={52} fontWeight={800} fontFamily="DejaVu Sans">{it.year}</text>
              <text x={x} y={H / 2 + (up ? -100 : 195)} textAnchor="middle" fill="#fff" fontSize={26} fontFamily="DejaVu Sans">{it.label}</text>
            </g>
          ) : null;
        })}
      </svg>
    </Center>
  );
};

// Mappa astratta: "isole" procedurali, pin e rotta tratteggiata che si disegna.
export const MapCard: React.FC<{s: Scene; frames: number; seed: number}> = ({s, frames, seed}) => {
  const f = useCurrentFrame();
  const pts = (s.points ?? ['A', 'B']).slice(0, 5);
  const coords = pts.map((_, i) => {
    const a = (seed * 13 + i * 97) % 100 / 100;
    return {x: 200 + (i / Math.max(pts.length - 1, 1)) * (W - 400), y: H / 2 + Math.sin(i * 1.9 + seed) * 150 + (a - 0.5) * 60};
  });
  const path = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x},${c.y}`).join(' ');
  const draw = interpolate(f, [10, frames - 25], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const blobs = Array.from({length: 7}).map((_, i) => ({cx: ((seed * 31 + i * 197) % W), cy: ((seed * 17 + i * 131) % H), r: 110 + (i * 37) % 120}));
  return (
    <div style={{position: 'absolute', inset: 0, background: '#cfe0e8'}}>
      <svg width={W} height={H}>
        {blobs.map((b, i) => <ellipse key={i} cx={b.cx} cy={b.cy} rx={b.r * 1.4} ry={b.r} fill="#e9dfc3" stroke="#c9b98f" strokeWidth={4} />)}
        <path d={path} fill="none" stroke="#e4572e" strokeWidth={8} strokeDasharray="22 14" pathLength={1} strokeDashoffset={0}
          style={{clipPath: `inset(0 ${(1 - draw) * 100}% 0 0)`}} />
        {coords.map((c, i) => {
          const shown = draw >= (pts.length === 1 ? 0 : i / (pts.length - 1)) - 0.02;
          return shown ? (
            <g key={i}>
              <circle cx={c.x} cy={c.y} r={16} fill="#e4572e" stroke="#fff" strokeWidth={5} />
              <text x={c.x} y={c.y - 30} textAnchor="middle" fontSize={34} fontWeight={800} fill="#2b2b3a" fontFamily="DejaVu Sans" stroke="#fff" strokeWidth={6} paintOrder="stroke">{pts[i]}</text>
            </g>
          ) : null;
        })}
      </svg>
    </div>
  );
};
