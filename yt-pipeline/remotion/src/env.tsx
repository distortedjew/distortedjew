import React from 'react';
import {H, Scene, Setting, TimeOfDay, WW} from './types';

export const rng = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const h2 = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
export const mix = (a: string, b: string, t: number) => {
  const A = h2(a), B = h2(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

export const TOD: Record<TimeOfDay, {top: string; bot: string; tint: string; ta: number; dark: number; sun: string; sunY: number; stars: boolean; lights: boolean; ink: string}> = {
  dawn: {top: '#5b6fa8', bot: '#ffb38a', tint: '#ff9e80', ta: 0.22, dark: 0.08, sun: '#ffe0a8', sunY: 0.66, stars: false, lights: false, ink: '#1d1b26'},
  day: {top: '#5fb0e6', bot: '#eaf6ff', tint: '#ffffff', ta: 0, dark: 0, sun: '#fff6c8', sunY: 0.2, stars: false, lights: false, ink: '#1d1b26'},
  dusk: {top: '#34336f', bot: '#ff7b54', tint: '#ff7b54', ta: 0.28, dark: 0.2, sun: '#ffb36b', sunY: 0.6, stars: false, lights: true, ink: '#14121c'},
  night: {top: '#080c28', bot: '#2b3568', tint: '#2a3a78', ta: 0.55, dark: 0.45, sun: '#f4f1de', sunY: 0.2, stars: true, lights: true, ink: '#eee9dc'},
};

export interface EnvCtx {
  tod: typeof TOD.day; shade: (c: string) => string; haze: (c: string, d: number) => string;
  f: number; seed: number; time: TimeOfDay;
}
export const makeCtx = (time: TimeOfDay, f: number, seed: number): EnvCtx => {
  const tod = TOD[time];
  const shade = (c: string) => mix(mix(c, tod.tint, tod.ta), '#000000', tod.dark);
  const haze = (c: string, d: number) => mix(shade(c), mix(tod.bot, '#ffffff', time === 'night' ? 0 : 0.2), d);
  return {tod, shade, haze, f, seed, time};
};

export const GY = 560; // linea del terreno

const Layer: React.FC<{p: number; left: number; top: number; children: React.ReactNode}> = ({p, left, top, children}) => (
  <g transform={`translate(${(1 - p) * left},${(1 - p) * top * 0.7})`}>{children}</g>
);

// ---------- elementi ----------
const Sky: React.FC<{c: EnvCtx}> = ({c}) => {
  const r = rng(c.seed + 3);
  const night = c.time === 'night';
  return (
    <g>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c.tod.top} /><stop offset="1" stopColor={c.tod.bot} /></linearGradient>
        <radialGradient id="glow"><stop offset="0" stopColor="#fff" stopOpacity="0.9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <radialGradient id="warm"><stop offset="0" stopColor="#ffd166" stopOpacity="0.85" /><stop offset="1" stopColor="#ff9e00" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width={WW} height={H} fill="url(#sky)" />
      {c.tod.stars && Array.from({length: 90}).map((_, i) => <circle key={i} cx={r() * WW} cy={r() * H * 0.62} r={0.8 + r() * 1.6} fill="#fff" opacity={0.45 + 0.5 * Math.sin(c.f * 0.07 + i * 1.7)} />)}
      <circle cx={WW * 0.62} cy={H * c.tod.sunY} r={150} fill={c.tod.sun} opacity={night ? 0.14 : 0.3} />
      <circle cx={WW * 0.62} cy={H * c.tod.sunY} r={night ? 42 : 58} fill={c.tod.sun} />
      {night && <circle cx={WW * 0.62 - 14} cy={H * c.tod.sunY - 8} r={34} fill={c.tod.bot} opacity={0.25} />}
    </g>
  );
};

const Clouds: React.FC<{c: EnvCtx; n?: number; y?: number}> = ({c, n = 7, y = 160}) => {
  const r = rng(c.seed + 9);
  const col = c.time === 'night' ? mix(c.tod.bot, '#000000', 0.2) : mix('#ffffff', c.tod.tint, c.tod.ta + 0.1);
  return <g fill={col} opacity={c.time === 'night' ? 0.35 : 0.85}>{Array.from({length: n}).map((_, i) => {
    const x = ((r() * (WW + 500) + c.f * (0.25 + r() * 0.3)) % (WW + 500)) - 250; const yy = y + r() * 150; const s = 0.7 + r() * 0.9;
    return <g key={i} transform={`translate(${x},${yy}) scale(${s})`}><ellipse cx={0} cy={0} rx={70} ry={22} /><ellipse cx={-34} cy={-10} rx={34} ry={22} /><ellipse cx={22} cy={-18} rx={42} ry={28} /></g>;
  })}</g>;
};

const Birds: React.FC<{c: EnvCtx; n?: number}> = ({c, n = 5}) => {
  const r = rng(c.seed + 21);
  return <g stroke={c.shade('#222233')} strokeWidth={2.4} fill="none" strokeLinecap="round">{Array.from({length: n}).map((_, i) => {
    const x = ((r() * WW + c.f * (1.6 + r())) % (WW + 200)) - 100; const y = 130 + r() * 130 + Math.sin(c.f * 0.05 + i) * 12; const fl = Math.sin(c.f * 0.4 + i * 2) * 7;
    return <path key={i} d={`M${x - 12} ${y - fl} Q${x - 5} ${y - fl - 5} ${x} ${y} Q${x + 5} ${y - fl - 5} ${x + 12} ${y - fl}`} />;
  })}</g>;
};

const Ridge: React.FC<{c: EnvCtx; seed: number; base: number; amp: number; color: string; freq?: number; snow?: boolean; jag?: boolean}> = ({c, seed, base, amp, color, freq = 1, snow, jag}) => {
  const r = rng(seed); const pts: [number, number][] = []; const caps: React.ReactNode[] = [];
  for (let x = -60; x <= WW + 400; x += jag ? 90 : 40) {
    const y = base - (jag ? (0.35 + r() * 0.65) * amp * (0.5 + 0.5 * Math.sin(x * 0.004 * freq + seed)) : amp * (0.5 + 0.5 * Math.sin(x * 0.005 * freq + seed) + 0.25 * Math.sin(x * 0.013 * freq + seed * 2)) / 1.4);
    pts.push([x, y]);
  }
  if (snow) pts.forEach(([x, y], i) => { if (y < base - amp * 0.62 && i > 0) caps.push(<polygon key={i} points={`${x - 34},${y + 28} ${x},${y} ${x + 34},${y + 28} ${x + 12},${y + 20} ${x},${y + 30} ${x - 12},${y + 20}`} fill="#f4f6fb" opacity={0.9} />); });
  return <g><polygon points={`-60,${H} ${pts.map((p) => p.join(',')).join(' ')} ${WW + 400},${H}`} fill={color} />{caps}</g>;
};

const Pine: React.FC<{x: number; y: number; s: number; color: string; snow?: boolean}> = ({x, y, s, color, snow}) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <rect x={-5} y={-18} width={10} height={20} fill="#4a3428" />
    {[0, 1, 2, 3].map((i) => <polygon key={i} points={`${-44 + i * 6},${-18 - i * 40} 0,${-70 - i * 40} ${44 - i * 6},${-18 - i * 40}`} fill={color} />)}
    {snow && [0, 1, 2].map((i) => <polygon key={i} points={`${-26 + i * 6},${-46 - i * 40} 0,${-70 - i * 40} ${26 - i * 6},${-46 - i * 40}`} fill="#f4f6fb" opacity={0.85} />)}
  </g>
);

const RoundTree: React.FC<{x: number; y: number; s: number; color: string; trunk: string}> = ({x, y, s, color, trunk}) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <path d="M-8 0 L-5 -60 L5 -60 L8 0Z" fill={trunk} /><path d="M0 -50 L-28 -86 M0 -56 L26 -90" stroke={trunk} strokeWidth={6} />
    <circle cx={0} cy={-100} r={46} fill={color} /><circle cx={-34} cy={-80} r={32} fill={color} /><circle cx={34} cy={-82} r={34} fill={color} />
  </g>
);

const Building: React.FC<{c: EnvCtx; x: number; w: number; h: number; base: number; col: string; roof: 'flat' | 'gable' | 'tower'; seed: number; detail: boolean}> = ({c, x, w, h, base, col, roof, seed, detail}) => {
  const r = rng(seed); const lit = c.tod.lights; const top = base - h;
  const wins: React.ReactNode[] = [];
  const cols = Math.max(1, Math.floor(w / 38)); const rows = Math.max(1, Math.floor((h - 70) / 56));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const wx = x + 14 + i * ((w - 28) / cols); const wy = top + 22 + j * 56; const on = lit && r() > 0.45;
    wins.push(<g key={`${i}-${j}`}>
      <rect x={wx} y={wy} width={20} height={30} fill={on ? '#ffd166' : mix(col, '#000000', 0.35)} opacity={on ? 0.9 + 0.1 * Math.sin(c.f * 0.2 + i + j) : 0.9} />
      {detail && <><rect x={wx - 3} y={wy - 3} width={26} height={4} fill={mix(col, '#000000', 0.3)} /><path d={`M${wx + 10} ${wy} L${wx + 10} ${wy + 30}`} stroke={mix(col, '#000000', 0.35)} strokeWidth={1.5} /></>}
    </g>);
  }
  return (
    <g>
      <rect x={x} y={top} width={w} height={h} fill={col} />
      {roof === 'gable' && <polygon points={`${x - 8},${top} ${x + w / 2},${top - 52} ${x + w + 8},${top}`} fill={mix(col, '#7a3b2e', 0.55)} />}
      {roof === 'tower' && <><polygon points={`${x - 6},${top} ${x + w / 2},${top - 90} ${x + w + 6},${top}`} fill={mix(col, '#44505e', 0.6)} /><circle cx={x + w / 2} cy={top + 34} r={17} fill="#f4f1de" stroke="#333" strokeWidth={2} /><path d={`M${x + w / 2} ${top + 34} L${x + w / 2} ${top + 22} M${x + w / 2} ${top + 34} L${x + w / 2 + 9} ${top + 38}`} stroke="#333" strokeWidth={2} /></>}
      {roof === 'flat' && <rect x={x - 4} y={top - 8} width={w + 8} height={10} fill={mix(col, '#000000', 0.2)} />}
      {detail && r() > 0.4 && <rect x={x + w * 0.65} y={top - 36} width={14} height={36} fill={mix(col, '#000000', 0.25)} />}
      {wins}
      {detail && <><rect x={x + w / 2 - 14} y={base - 52} width={28} height={52} rx={14} fill={mix(col, '#000000', 0.45)} /><rect x={x + w / 2 - 20} y={base - 60} width={40} height={8} fill={mix('#c0392b', c.tod.tint, c.tod.ta)} opacity={0.9} /></>}
    </g>
  );
};

const Smoke: React.FC<{x: number; y: number; f: number; col: string}> = ({x, y, f, col}) => (
  <g>{[0, 1, 2, 3, 4].map((i) => { const t = ((f * 0.7 + i * 24) % 120) / 120; return <circle key={i} cx={x + t * 34 + Math.sin(t * 9 + i) * 6} cy={y - t * 130} r={9 + t * 24} fill={col} opacity={0.5 * (1 - t)} />; })}</g>
);

const Lamp: React.FC<{c: EnvCtx; x: number; y: number}> = ({c, x, y}) => (
  <g>
    <rect x={x - 4} y={y - 200} width={8} height={200} fill={c.shade('#2d2d38')} /><rect x={x - 16} y={y - 222} width={32} height={26} rx={5} fill={c.shade('#2d2d38')} />
    <rect x={x - 11} y={y - 218} width={22} height={18} fill={c.tod.lights ? '#ffe08a' : c.shade('#cfd8dc')} />
    {c.tod.lights && <><circle cx={x} cy={y - 208} r={110} fill="url(#warm)" opacity={0.75 + 0.1 * Math.sin(c.f * 0.3 + x)} /><polygon points={`${x - 12},${y - 196} ${x + 12},${y - 196} ${x + 90},${y} ${x - 90},${y}`} fill="#ffd166" opacity={0.08} /></>}
  </g>
);

const Fire: React.FC<{x: number; y: number; s: number; f: number}> = ({x, y, s, f}) => {
  const a = 1 + Math.sin(f * 0.9) * 0.14 + Math.sin(f * 1.9) * 0.08;
  return <g transform={`translate(${x},${y}) scale(${s})`}><circle cx={0} cy={-26} r={80} fill="url(#warm)" opacity={0.7} />
    <g transform={`scale(${a},${a})`}><path d="M0 -70 Q30 -30 18 0 L-18 0 Q-30 -30 0 -70Z" fill="#ff6b00" /><path d="M0 -48 Q16 -22 9 0 L-9 0 Q-16 -22 0 -48Z" fill="#ffd166" /></g></g>;
};

const Waves: React.FC<{c: EnvCtx; y: number; color: string; amp: number; sp: number; ph: number}> = ({c, y, color, amp, sp, ph}) => {
  const pts: string[] = []; for (let x = -40; x <= WW + 400; x += 24) pts.push(`${x},${y + Math.sin(x * 0.012 + c.f * sp + ph) * amp + Math.sin(x * 0.03 + c.f * sp * 1.6) * amp * 0.3}`);
  return <polygon points={`-40,${H} ${pts.join(' ')} ${WW + 400},${H}`} fill={color} />;
};

// ---------- ambienti ----------
const Street: React.FC<{c: EnvCtx; left: number; top: number}> = ({c, left, top}) => {
  const r = rng(c.seed + 1); const far: React.ReactNode[] = []; const mid: React.ReactNode[] = [];
  let x = -100; let i = 0;
  while (x < WW + 400) { const w = 70 + r() * 90, h = 160 + r() * 260; far.push(<Building key={i} c={c} x={x} w={w} h={h} base={GY - 20} col={c.haze('#8a8fa8', 0.55)} roof={r() > 0.5 ? 'gable' : 'flat'} seed={i + 40} detail={false} />); x += w + 4 + r() * 10; i++; }
  x = -60; i = 0;
  while (x < WW + 400) { const w = 130 + r() * 110, h = 230 + r() * 150; const pal = ['#b08968', '#a3a380', '#c98f6b', '#8e9aaf', '#b5838d'][i % 5];
    mid.push(<Building key={i} c={c} x={x} w={w} h={h} base={GY + 14} col={c.haze(pal, 0.12)} roof={i % 6 === 2 ? 'tower' : r() > 0.5 ? 'gable' : 'flat'} seed={i + 90} detail />);
    if (i % 3 === 0) mid.push(<Smoke key={`s${i}`} x={x + w * 0.7 + 7} y={GY - h - 38} f={c.f} col={c.shade('#dddddd')} />); x += w + 10 + r() * 20; i++; }
  const cob: React.ReactNode[] = []; for (let row = 0; row < 6; row++) for (let k = 0; k < 44; k++) cob.push(<rect key={`${row}-${k}`} x={k * 64 + (row % 2) * 32 - 20} y={GY + 40 + row * 25 + row * row * 2} width={58} height={20 + row * 2} rx={6} fill={c.shade(row % 2 ? '#6d6875' : '#5e5a68')} stroke={c.shade('#3d3a46')} strokeWidth={2} />);
  return (<>
    <Layer p={0.25} left={left} top={top}>{far}</Layer>
    <Layer p={0.6} left={left} top={top}>{mid}</Layer>
    <Layer p={1} left={left} top={top}>
      <rect x={0} y={GY + 14} width={WW + 400} height={H} fill={c.shade('#4a4658')} />{cob}
      <rect x={0} y={GY + 6} width={WW + 400} height={16} fill={c.shade('#8d8a99')} />
      {[300, 1100, 1900, 2500].map((lx) => <Lamp key={lx} c={c} x={lx} y={GY + 12} />)}
      {[640, 1500, 2200].map((bx, k) => <g key={bx}><rect x={bx} y={GY - 44} width={60} height={58} rx={8} fill={c.shade('#8b5e3c')} /><path d={`M${bx} ${GY - 24} h60 M${bx} ${GY - 4} h60`} stroke={c.shade('#5a3c26')} strokeWidth={3} /><rect x={bx + 70 + k * 6} y={GY - 20} width={40} height={34} fill={c.shade('#a97142')} stroke={c.shade('#5a3c26')} strokeWidth={2} /></g>)}
    </Layer></>);
};

const Village: React.FC<{c: EnvCtx; left: number; top: number}> = ({c, left, top}) => {
  const r = rng(c.seed + 2); const houses: React.ReactNode[] = []; const trees: React.ReactNode[] = [];
  for (let i = 0; i < 9; i++) { const x = i * 300 + r() * 120; const w = 120 + r() * 50; const col = ['#e9d8a6', '#d9b99b', '#ddc9b4', '#cbb2a0'][i % 4];
    houses.push(<g key={i}><rect x={x} y={GY - 90} width={w} height={90} fill={c.haze(col, 0.1)} /><polygon points={`${x - 14},${GY - 90} ${x + w / 2},${GY - 160} ${x + w + 14},${GY - 90}`} fill={c.haze('#b5543c', 0.1)} />
      <rect x={x + 18} y={GY - 66} width={24} height={26} fill={c.tod.lights ? '#ffd166' : c.shade('#6c8ea4')} /><rect x={x + w - 48} y={GY - 56} width={26} height={56} rx={4} fill={c.shade('#6b4a2f')} />
      <rect x={x + w * 0.65} y={GY - 190} width={14} height={40} fill={c.shade('#8a6f5a')} />{i % 2 === 0 && <Smoke x={x + w * 0.65 + 7} y={GY - 190} f={c.f} col={c.shade('#d9d9d9')} />}</g>);
    trees.push(<RoundTree key={i} x={x + 220} y={GY + 6} s={0.9 + r() * 0.5} color={c.haze('#5f9e5b', 0.05)} trunk={c.shade('#6b4a2f')} />); }
  const sail = c.f * 2.2;
  return (<>
    <Layer p={0.15} left={left} top={top}><Ridge c={c} seed={4} base={GY - 130} amp={150} color={c.haze('#7a9e7e', 0.6)} snow={false} /></Layer>
    <Layer p={0.3} left={left} top={top}>
      <Ridge c={c} seed={6} base={GY - 40} amp={90} color={c.haze('#6f9a62', 0.4)} />
      <g transform={`translate(1500,${GY - 150})`}><polygon points="-30,150 -18,20 18,20 30,150" fill={c.haze('#e8dcc4', 0.3)} /><polygon points="-26,20 0,-20 26,20" fill={c.haze('#9b5a42', 0.3)} />
        <g transform={`translate(0,12) rotate(${sail})`}>{[0, 90, 180, 270].map((a) => <g key={a} transform={`rotate(${a})`}><rect x={-3} y={-92} width={6} height={92} fill={c.shade('#6b4a2f')} /><rect x={3} y={-92} width={22} height={54} fill={c.haze('#f4f1de', 0.2)} opacity={0.95} /></g>)}</g></g>
    </Layer>
    <Layer p={0.7} left={left} top={top}>{houses}{trees}</Layer>
    <Layer p={1} left={left} top={top}>
      <rect x={0} y={GY} width={WW + 400} height={H} fill={c.shade('#6a994e')} />
      <path d={`M0 ${GY + 70} Q600 ${GY + 40} 1300 ${GY + 80} T2700 ${GY + 60} L2700 ${GY + 120} Q1300 ${GY + 140} 0 ${GY + 130}Z`} fill={c.shade('#c9a66b')} />
      {Array.from({length: 40}).map((_, i) => <path key={i} d={`M${i * 70 + (i % 3) * 9} ${GY + 150 + (i % 5) * 8} l-4 -14 M${i * 70 + (i % 3) * 9} ${GY + 150 + (i % 5) * 8} l5 -16`} stroke={c.shade('#3f6b32')} strokeWidth={3} />)}
      {Array.from({length: 30}).map((_, i) => <rect key={i} x={i * 90} y={GY + 14} width={5} height={30} fill={c.shade('#7b5a3c')} />)}
      <path d={`M0 ${GY + 22} H${WW + 400} M0 ${GY + 34} H${WW + 400}`} stroke={c.shade('#7b5a3c')} strokeWidth={4} />
    </Layer></>);
};

const Field: React.FC<{c: EnvCtx; left: number; top: number}> = ({c, left, top}) => {
  const r = rng(c.seed + 5);
  return (<>
    <Layer p={0.2} left={left} top={top}><Ridge c={c} seed={8} base={GY - 90} amp={130} color={c.haze('#7fb069', 0.55)} /></Layer>
    <Layer p={0.45} left={left} top={top}><Ridge c={c} seed={9} base={GY - 30} amp={80} color={c.haze('#6a994e', 0.35)} freq={1.3} />
      <g transform={`translate(1800,${GY - 100})`}><rect x={0} y={20} width={100} height={70} fill={c.haze('#c97b63', 0.3)} /><polygon points="-10,22 50,-30 110,22" fill={c.haze('#7b4b3a', 0.3)} /></g></Layer>
    <Layer p={0.8} left={left} top={top}>{[500, 1300, 2300].map((x, i) => <RoundTree key={i} x={x} y={GY + 4} s={1.3 - i * 0.2} color={c.shade('#4f8a4b')} trunk={c.shade('#6b4a2f')} />)}</Layer>
    <Layer p={1} left={left} top={top}>
      <rect x={0} y={GY} width={WW + 400} height={H} fill={c.shade('#7cb342')} />
      {Array.from({length: 7}).map((_, row) => <path key={row} d={`M0 ${GY + 30 + row * 26} Q${600 + row * 40} ${GY + 10 + row * 26} 1300 ${GY + 30 + row * 26} T2700 ${GY + 30 + row * 26}`} stroke={c.shade('#5f9a2e')} strokeWidth={5} fill="none" opacity={0.7} />)}
      {Array.from({length: 120}).map((_, i) => { const x = r() * (WW + 300), y = GY + 20 + r() * 150; const sw = Math.sin(c.f * 0.08 + i) * 3; return <path key={i} d={`M${x} ${y} q${sw} -16 ${sw * 2} -26`} stroke={c.shade(i % 9 === 0 ? '#f2c14e' : '#4f8a2b')} strokeWidth={i % 9 === 0 ? 5 : 3} fill="none" strokeLinecap="round" />; })}
    </Layer></>);
};

const Forest: React.FC<{c: EnvCtx; left: number; top: number}> = ({c, left, top}) => {
  const rows = [{p: 0.2, y: GY - 40, s: 0.9, d: 0.6, n: 26}, {p: 0.4, y: GY - 10, s: 1.2, d: 0.35, n: 20}, {p: 0.7, y: GY + 20, s: 1.7, d: 0.12, n: 12}];
  return (<>
    {rows.map((row, k) => { const r = rng(c.seed + 30 + k); return <Layer key={k} p={row.p} left={left} top={top}>{Array.from({length: row.n}).map((_, i) => <Pine key={i} x={i * (WW + 500) / row.n + r() * 40} y={row.y} s={row.s * (0.8 + r() * 0.5)} color={c.haze('#2d6a4f', row.d)} />)}</Layer>; })}
    <Layer p={0.7} left={left} top={top}>{[0, 1, 2, 3, 4, 5].map((i) => <polygon key={i} points={`${300 + i * 420},0 ${340 + i * 420},0 ${i * 420 + 160},${GY} ${i * 420 + 40},${GY}`} fill="#fff" opacity={c.time === 'night' ? 0.03 : 0.1} />)}</Layer>
    <Layer p={1} left={left} top={top}>
      <rect x={0} y={GY + 20} width={WW + 400} height={H} fill={c.shade('#3a5a40')} />
      <path d={`M300 ${H} Q700 ${GY + 60} 1300 ${GY + 50} T2600 ${GY + 40} L2600 ${GY + 90} Q1400 ${GY + 110} 800 ${H}Z`} fill={c.shade('#a68a64')} opacity={0.8} />
      {[240, 980, 1800, 2400].map((x, i) => <g key={i}><rect x={x - 26} y={GY - 160} width={52} height={190} fill={c.shade('#4a3428')} /><path d={`M${x - 10} ${GY - 160} v190 M${x + 12} ${GY - 150} v180`} stroke={c.shade('#2f2119')} strokeWidth={4} /></g>)}
      {[600, 1500, 2200].map((x, i) => <g key={i}><rect x={x} y={GY + 40} width={8} height={18} fill="#eee" /><ellipse cx={x + 4} cy={GY + 38} rx={16} ry={10} fill={c.shade('#c0392b')} /></g>)}
      {c.tod.lights && Array.from({length: 24}).map((_, i) => <circle key={i} cx={(i * 197) % WW + Math.sin(c.f * 0.03 + i) * 30} cy={GY - 120 + ((i * 53) % 220) + Math.cos(c.f * 0.04 + i) * 20} r={3.5} fill="#e9ff70" opacity={0.5 + 0.5 * Math.sin(c.f * 0.1 + i)} />)}
    </Layer></>);
};

const Sea: React.FC<{c: EnvCtx; left: number; top: number}> = ({c, left, top}) => (<>
  <Layer p={0.15} left={left} top={top}>
    <rect y={GY - 150} width={WW + 400} height={H} fill={c.haze('#3a7ca5', 0.55)} />
    <Ridge c={c} seed={12} base={GY - 148} amp={60} color={c.haze('#6c8ea4', 0.7)} />
    <g transform={`translate(1900,${GY - 148})`}><polygon points="-14,0 -9,-110 9,-110 14,0" fill={c.haze('#f4f1de', 0.3)} /><rect x={-11} y={-132} width={22} height={22} fill={c.haze('#c0392b', 0.3)} /><polygon points="-14,-132 0,-150 14,-132" fill={c.shade('#333')} />
      {c.tod.lights && <polygon points="0,-122 -420,-165 -420,-80" fill="#ffe08a" opacity={0.18} />}</g>
  </Layer>
  <Layer p={0.3} left={left} top={top}><Waves c={c} y={GY - 110} color={c.haze('#2f6f9e', 0.35)} amp={5} sp={0.07} ph={0} />
    <g transform={`translate(${900 + c.f * 0.4},${GY - 108 + Math.sin(c.f * 0.06) * 3})`}><polygon points="-70,0 70,0 50,22 -50,22" fill={c.shade('#4a3428')} /><rect x={-2} y={-120} width={4} height={120} fill={c.shade('#3a2a20')} /><polygon points="4,-116 4,-12 64,-12" fill={c.haze('#f4f1de', 0.15)} /><polygon points="-4,-100 -4,-12 -52,-12" fill={c.haze('#e8dcc4', 0.15)} /></g></Layer>
  <Layer p={0.55} left={left} top={top}><Waves c={c} y={GY - 60} color={c.haze('#26658f', 0.2)} amp={9} sp={0.09} ph={2} /></Layer>
  <Layer p={0.8} left={left} top={top}><Waves c={c} y={GY - 10} color={c.shade('#1f5a80')} amp={12} sp={0.1} ph={4} /></Layer>
  <Layer p={1} left={left} top={top}>
    <rect x={0} y={GY + 40} width={WW + 400} height={H} fill={c.shade('#7b5a3c')} />
    {Array.from({length: 42}).map((_, i) => <g key={i}><rect x={i * 70} y={GY + 40} width={66} height={H} fill={c.shade(i % 2 ? '#7b5a3c' : '#6b4a2f')} /><circle cx={i * 70 + 10} cy={GY + 56} r={2.5} fill={c.shade('#3a2a20')} /></g>)}
    <rect x={0} y={GY + 36} width={WW + 400} height={10} fill={c.shade('#a68a64')} />
    {[200, 900, 1700, 2400].map((x) => <g key={x}><rect x={x} y={GY - 40} width={18} height={80} fill={c.shade('#4a3428')} /><path d={`M${x + 9} ${GY - 30} q-60 30 -120 10`} stroke={c.shade('#c9a66b')} strokeWidth={5} fill="none" /></g>)}
  </Layer></>);

const Mountain: React.FC<{c: EnvCtx; left: number; top: number}> = ({c, left, top}) => (<>
  <Layer p={0.12} left={left} top={top}><Ridge c={c} seed={14} base={GY - 40} amp={430} color={c.haze('#8d99ae', 0.6)} snow jag /></Layer>
  <Layer p={0.3} left={left} top={top}><Ridge c={c} seed={15} base={GY} amp={330} color={c.haze('#6c7a89', 0.4)} snow jag /></Layer>
  <Layer p={0.6} left={left} top={top}>{(() => { const r = rng(c.seed + 77); return Array.from({length: 22}).map((_, i) => <Pine key={i} x={i * 130 + r() * 60} y={GY + 20} s={0.8 + r() * 0.7} color={c.haze('#2d5a4a', 0.2)} snow />); })()}</Layer>
  <Layer p={1} left={left} top={top}>
    <rect x={0} y={GY + 20} width={WW + 400} height={H} fill={c.shade('#e8eef4')} />
    <path d={`M0 ${GY + 80} Q500 ${GY + 50} 1000 ${GY + 90} T2700 ${GY + 70} L2700 ${H} L0 ${H}Z`} fill={c.shade('#cfdbe6')} />
    {[300, 1250, 2100].map((x, i) => <g key={i}><polygon points={`${x},${GY + 40} ${x + 50},${GY - 20} ${x + 110},${GY + 40}`} fill={c.shade('#6b7280')} /><polygon points={`${x + 36},${GY - 4} ${x + 50},${GY - 20} ${x + 66},${GY - 2}`} fill="#f4f6fb" /></g>)}
  </Layer></>);

const Desert: React.FC<{c: EnvCtx; left: number; top: number}> = ({c, left, top}) => (<>
  <Layer p={0.15} left={left} top={top}><Ridge c={c} seed={16} base={GY - 60} amp={90} color={c.haze('#e0b077', 0.6)} freq={0.6} />
    <g transform={`translate(1700,${GY - 70})`}><polygon points="-120,70 0,-80 120,70" fill={c.haze('#d9a066', 0.5)} /><polygon points="0,-80 120,70 40,70" fill={c.haze('#b9814d', 0.5)} /></g></Layer>
  <Layer p={0.4} left={left} top={top}><Ridge c={c} seed={17} base={GY - 10} amp={80} color={c.haze('#d9a066', 0.3)} freq={0.8} />
    {[400, 1100, 2000].map((x, i) => <g key={i} transform={`translate(${x},${GY - 10})`}><rect x={-14} y={-130} width={28} height={130} fill={c.haze('#cdb892', 0.25)} /><rect x={-20} y={-142} width={40} height={14} fill={c.haze('#cdb892', 0.25)} /></g>)}</Layer>
  <Layer p={1} left={left} top={top}>
    <rect x={0} y={GY + 20} width={WW + 400} height={H} fill={c.shade('#e3b778')} />
    <Ridge c={c} seed={18} base={GY + 70} amp={70} color={c.shade('#d9a066')} freq={0.7} />
    {Array.from({length: 18}).map((_, i) => <path key={i} d={`M${i * 160} ${GY + 150 + (i % 4) * 18} q40 -14 80 0`} stroke={c.shade('#c58f55')} strokeWidth={3} fill="none" />)}
    {[350, 1500, 2300].map((x, i) => <g key={i} transform={`translate(${x},${GY + 70})`} stroke={c.shade('#2f7d4f')} strokeWidth={14} strokeLinecap="round" fill="none"><path d="M0 0 V-110" /><path d="M0 -50 q-36 0 -36 -36 V-70" /><path d="M0 -70 q34 0 34 -30 V-90" /></g>)}
    {Array.from({length: 30}).map((_, i) => <circle key={i} cx={((c.f * (2 + (i % 3)) + i * 97) % (WW + 300))} cy={GY + 30 + (i * 41) % 160} r={2} fill="#fff" opacity={0.25} />)}
  </Layer></>);

const Room: React.FC<{c: EnvCtx; left: number; top: number; fireplace: boolean}> = ({c, left, top, fireplace}) => {
  const r = rng(c.seed + 11);
  return (<Layer p={1} left={left} top={top}>
    <rect x={0} y={0} width={WW + 400} height={GY + 40} fill={c.shade('#a98467')} />
    {Array.from({length: 60}).map((_, i) => <rect key={i} x={i * 56} y={0} width={28} height={GY - 60} fill={c.shade('#9c7a5d')} opacity={0.5} />)}
    <rect x={0} y={GY - 60} width={WW + 400} height={100} fill={c.shade('#6f4e37')} /><rect x={0} y={GY - 66} width={WW + 400} height={8} fill={c.shade('#8a6a4e')} />
    <rect x={0} y={GY + 40} width={WW + 400} height={H} fill={c.shade('#5a3e2b')} />
    {Array.from({length: 40}).map((_, i) => <path key={i} d={`M${i * 90} ${GY + 40} L${i * 90 - 60 - i % 3 * 10} ${H}`} stroke={c.shade('#3d2a1c')} strokeWidth={3} />)}
    {/* finestra con luce */}
    <g transform="translate(900,90)"><rect width={260} height={300} fill={c.tod.top} stroke={c.shade('#3d2a1c')} strokeWidth={12} /><rect y={150} width={260} height={150} fill={c.tod.bot} /><path d="M130 0 V300 M0 150 H260" stroke={c.shade('#3d2a1c')} strokeWidth={8} />
      {c.time === 'night' && <circle cx={190} cy={70} r={26} fill="#f4f1de" />}
      <polygon points="20,300 240,300 480,640 -200,640" fill="#fff6c8" opacity={c.time === 'night' ? 0.06 : 0.16} />
      <path d="M-30 -10 Q40 150 -30 320 L10 320 Q80 150 10 -10Z" fill={c.shade('#8e3b46')} /><path d="M290 -10 Q220 150 290 320 L250 320 Q180 150 250 -10Z" fill={c.shade('#8e3b46')} /></g>
    {/* libreria */}
    <g transform="translate(120,120)"><rect width={340} height={440} fill={c.shade('#5a3e2b')} />{[0, 1, 2, 3].map((row) => <g key={row}><rect y={row * 108 + 100} width={340} height={8} fill={c.shade('#3d2a1c')} />{Array.from({length: 10}).map((_, k) => <rect key={k} x={12 + k * 31} y={row * 108 + 14 + (k % 3) * 6} width={24} height={86 - (k % 3) * 6} fill={c.shade(['#b5838d', '#6d6875', '#e5989b', '#355070', '#9c6644'][(k + row) % 5])} />)}</g>)}</g>
    {/* quadri */}
    {[600, 1500, 1900].map((x, i) => <g key={i} transform={`translate(${x},${150 + (i % 2) * 40})`}><rect width={110} height={140} fill={c.shade('#3d2a1c')} /><rect x={8} y={8} width={94} height={124} fill={c.shade(['#c9ada7', '#a3b18a', '#98c1d9'][i])} /><circle cx={55} cy={60} r={22} fill={c.shade('#6d6875')} /></g>)}
    {/* orologio */}
    <g transform="translate(1300,160)"><rect x={-40} y={0} width={80} height={380} rx={8} fill={c.shade('#6f4e37')} stroke={c.shade('#3d2a1c')} strokeWidth={4} /><circle cy={50} r={30} fill="#f4f1de" stroke="#333" strokeWidth={3} /><path d={`M0 50 L0 28 M0 50 L${14 * Math.cos(c.f * 0.02)} ${50 + 14 * Math.sin(c.f * 0.02)}`} stroke="#333" strokeWidth={3} /><g transform={`translate(0,300) rotate(${Math.sin(c.f * 0.25) * 12} 0 -60)`}><rect x={-2} y={-60} width={4} height={90} fill="#c9a66b" /><circle cy={32} r={16} fill="#c9a66b" /></g></g>
    {/* camino */}
    {fireplace && <g transform="translate(1650,230)"><rect width={300} height={330} fill={c.shade('#7a746e')} /><rect x={50} y={90} width={200} height={240} rx={4} fill="#1d1612" /><Fire x={150} y={320} s={1.5} f={c.f} /></g>}
    {/* tappeto + tavolo */}
    <ellipse cx={1000} cy={GY + 100} rx={420} ry={50} fill={c.shade('#8e3b46')} opacity={0.85} /><ellipse cx={1000} cy={GY + 100} rx={360} ry={36} fill="none" stroke={c.shade('#e5989b')} strokeWidth={5} />
    <g transform={`translate(2250,${GY - 20})`}><rect x={-130} width={260} height={18} fill={c.shade('#8a6a4e')} /><rect x={-110} y={18} width={14} height={110} fill={c.shade('#6f4e37')} /><rect x={96} y={18} width={14} height={110} fill={c.shade('#6f4e37')} />
      <rect x={-8} y={-40} width={16} height={40} fill="#f4f1de" /><Fire x={0} y={-40} s={0.35} f={c.f + 5} /></g>
    {Array.from({length: 24}).map((_, i) => <circle key={i} cx={(r() * 800 + 700 + Math.sin(c.f * 0.02 + i) * 20)} cy={((r() * 600 + c.f * 0.3) % 600) + 60} r={1.6} fill="#fff" opacity={0.35} />)}
  </Layer>);
};

const Castle: React.FC<{c: EnvCtx; left: number; top: number}> = ({c, left, top}) => (
  <Layer p={1} left={left} top={top}>
    <rect width={WW + 400} height={GY + 40} fill={c.shade('#6b7280')} />
    {Array.from({length: 12}).map((_, row) => Array.from({length: 30}).map((__, k) => <rect key={`${row}-${k}`} x={k * 100 + (row % 2) * 50 - 30} y={row * 48} width={96} height={44} rx={3} fill={c.shade((row + k) % 3 ? '#737a88' : '#686f7c')} stroke={c.shade('#4b5160')} strokeWidth={2} />))}
    {[420, 1180, 1940].map((x, i) => <g key={i} transform={`translate(${x},110)`}><path d="M0 330 V90 Q0 0 70 0 Q140 0 140 90 V330Z" fill={c.tod.top} stroke={c.shade('#3c4250')} strokeWidth={10} /><path d="M70 0 V330 M0 150 H140" stroke={c.shade('#3c4250')} strokeWidth={5} />
      <polygon points="-30,330 170,330 360,560 -230,560" fill="#fff6c8" opacity={c.time === 'night' ? 0.05 : 0.12} /></g>)}
    {[800, 1560, 2320].map((x, i) => <g key={i} transform={`translate(${x},70)`}><rect x={-4} width={8} height={300} fill={c.shade('#3c4250')} /><path d={`M4 6 h120 q-30 ${22 + Math.sin(c.f * 0.1 + i) * 6} 0 ${50} h-120Z`} fill={c.shade(['#8e3b46', '#355070', '#6a4c93'][i])} /></g>)}
    {[300, 1060, 1820, 2500].map((x) => <g key={x} transform={`translate(${x},330)`}><rect x={-5} width={10} height={50} fill={c.shade('#3c4250')} /><Fire x={0} y={4} s={0.5} f={c.f + x} /></g>)}
    <rect x={0} y={GY - 20} width={WW + 400} height={H} fill={c.shade('#4b5160')} />
    {Array.from({length: 6}).map((_, row) => Array.from({length: 18}).map((__, k) => <rect key={`${row}-${k}`} x={k * 170 + (row % 2) * 85 - row * 40} y={GY + row * 26} width={160} height={22 + row * 2} fill={c.shade((row + k) % 2 ? '#5a6170' : '#525968')} stroke={c.shade('#3c4250')} strokeWidth={2} />))}
    {[0, 1, 2].map((i) => <rect key={i} x={560 + i * 760} y={0} width={70} height={GY} fill={c.shade('#7a8190')} stroke={c.shade('#4b5160')} strokeWidth={3} />)}
  </Layer>);

const Lab: React.FC<{c: EnvCtx; left: number; top: number}> = ({c, left, top}) => (
  <Layer p={1} left={left} top={top}>
    <rect width={WW + 400} height={GY + 40} fill={c.shade('#a8c0b8')} />
    {Array.from({length: 40}).map((_, k) => Array.from({length: 10}).map((__, row) => <rect key={`${row}-${k}`} x={k * 80} y={row * 60} width={78} height={58} fill={c.shade('#b9d0c8')} />))}
    <rect y={GY - 40} width={WW + 400} height={H} fill={c.shade('#5d6b6b')} />
    <g transform="translate(180,110)"><rect width={520} height={290} rx={6} fill={c.shade('#2f4a3e')} stroke={c.shade('#8a6a4e')} strokeWidth={14} />
      <path d="M40 80 q40 -40 80 0 t80 0 M40 150 h200 M260 150 l30 -30 l30 30 M60 220 q60 -60 120 0" stroke="#f4f1de" strokeWidth={4} fill="none" opacity={0.85} /><text x={330} y={90} fill="#f4f1de" fontSize={46} fontFamily="DejaVu Sans" opacity={0.85}>E=?</text></g>
    {[900, 1500].map((x, k) => <g key={x} transform={`translate(${x},150)`}><rect width={440} height={14} fill={c.shade('#6f4e37')} y={140} /><rect width={440} height={14} fill={c.shade('#6f4e37')} y={290} />
      {[0, 1, 2, 3].map((i) => <g key={i}><path d={`M${50 + i * 100} 140 v-30 h-14 l-14 -50 h56 l-14 50 h-14z`} fill={['#e76f51', '#2a9d8f', '#e9c46a', '#9b5de5'][(i + k) % 4]} opacity={0.85} transform={`translate(0,0)`} />
        {Array.from({length: 3}).map((__, b) => <circle key={b} cx={50 + i * 100 - 4 + b * 4} cy={130 - ((c.f * 0.9 + b * 17 + i * 9) % 38)} r={3} fill="#fff" opacity={0.6} />)}</g>)}</g>)}
    <g transform={`translate(2050,${GY - 120})`}><rect width={320} height={22} fill={c.shade('#8a6a4e')} /><rect x={20} y={22} width={20} height={130} fill={c.shade('#6f4e37')} /><rect x={280} y={22} width={20} height={130} fill={c.shade('#6f4e37')} />
      <path d="M100 0 v-50 q0 -20 20 -20 h40" stroke="#333" strokeWidth={6} fill="none" /><circle cx={170} cy={-60} r={24} fill="#ffe08a" opacity={0.8} /></g>
  </Layer>);

const Cave: React.FC<{c: EnvCtx; left: number; top: number}> = ({c, left, top}) => {
  const r = rng(c.seed + 13);
  return (<>
    <Layer p={0.4} left={left} top={top}><rect width={WW + 400} height={H} fill={c.shade('#2a2438')} />
      {Array.from({length: 14}).map((_, i) => { const x = i * 220 + r() * 80, h = 90 + r() * 200; return <polygon key={i} points={`${x},0 ${x + 40 + r() * 30},0 ${x + 30},${h}`} fill={c.shade('#3d3552')} />; })}</Layer>
    <Layer p={1} left={left} top={top}>
      <rect y={GY - 10} width={WW + 400} height={H} fill={c.shade('#3a3248')} />
      {Array.from({length: 12}).map((_, i) => { const x = i * 240 + r() * 90; const h = 60 + r() * 110; return <polygon key={i} points={`${x},${GY} ${x + 22},${GY - h} ${x + 48},${GY}`} fill={c.shade('#4a4060')} />; })}
      {[500, 1450, 2250].map((x, i) => <g key={i} transform={`translate(${x},${GY - 10})`}>{[0, 1, 2].map((k) => <polygon key={k} points={`${k * 26 - 14},0 ${k * 26 - 4},${-70 - k * 16 - (i % 2) * 20} ${k * 26 + 8},0`} fill={['#7bdff2', '#b8f2e6', '#c77dff'][(i + k) % 3]} opacity={0.9} />)}
        <circle cy={-40} r={90} fill={['#7bdff2', '#b8f2e6', '#c77dff'][i % 3]} opacity={0.12 + 0.05 * Math.sin(c.f * 0.1 + i)} /></g>)}
      {[700, 1700].map((x, k) => <g key={k}><circle cx={x} cy={((c.f * 5 + k * 40) % 220) + 80} r={4} fill="#7bdff2" opacity={0.7} /></g>)}
      <g transform="translate(1250,120)"><rect x={-4} width={8} height={70} fill="#6b4a2f" /><Fire x={0} y={4} s={0.8} f={c.f} /></g>
    </Layer></>);
};

export const Env: React.FC<{scene: Scene; f: number; seed: number; left: number; top: number}> = ({scene, f, seed, left, top}) => {
  const time = scene.time ?? 'day'; const c = makeCtx(time, f, seed);
  const setting: Setting = scene.setting ?? 'field';
  const indoor = setting === 'room' || setting === 'castle' || setting === 'lab' || setting === 'cave';
  return (<>
    {!indoor && <Layer p={0} left={left} top={top}><Sky c={c} /><Layer p={0.08} left={0} top={0}><Clouds c={c} /></Layer>{time === 'day' || time === 'dawn' ? <Birds c={c} n={setting === 'sea' ? 7 : 4} /> : null}</Layer>}
    {indoor && <rect x={left} y={top} width={WW} height={H} fill="#111" />}
    {setting === 'street' && <Street c={c} left={left} top={top} />}
    {setting === 'village' && <Village c={c} left={left} top={top} />}
    {setting === 'field' && <Field c={c} left={left} top={top} />}
    {setting === 'forest' && <Forest c={c} left={left} top={top} />}
    {setting === 'sea' && <Sea c={c} left={left} top={top} />}
    {setting === 'mountain' && <Mountain c={c} left={left} top={top} />}
    {setting === 'desert' && <Desert c={c} left={left} top={top} />}
    {setting === 'room' && <Room c={c} left={left} top={top} fireplace={scene.weather === 'fire' || seed % 2 === 0} />}
    {setting === 'castle' && <Castle c={c} left={left} top={top} />}
    {setting === 'lab' && <Lab c={c} left={left} top={top} />}
    {setting === 'cave' && <Cave c={c} left={left} top={top} />}
  </>);
};

// Silhouette in primo piano (parallax > 1)
export const Foreground: React.FC<{scene: Scene; f: number; seed: number; left: number; top: number}> = ({scene, f, seed, left, top}) => {
  const c = makeCtx(scene.time ?? 'day', f, seed); const r = rng(seed + 55); const col = mix(c.shade('#1d2a1d'), '#000000', 0.3);
  const setting = scene.setting ?? 'field';
  const p = 1.18;
  let kids: React.ReactNode = null;
  if (['field', 'village', 'forest'].includes(setting)) kids = Array.from({length: 26}).map((_, i) => { const x = r() * 3200, h = 40 + r() * 70, sw = Math.sin(f * 0.06 + i) * 6; return <path key={i} d={`M${x} ${H + 4} Q${x + sw} ${H - h * 0.6} ${x + sw * 2 + 8} ${H - h}`} stroke={col} strokeWidth={6} fill="none" strokeLinecap="round" />; });
  else if (['mountain', 'cave', 'desert'].includes(setting)) kids = Array.from({length: 4}).map((_, i) => <ellipse key={i} cx={r() * 3200} cy={H + 18} rx={90 + r() * 80} ry={34 + r() * 20} fill={col} />);
  else if (setting === 'sea') kids = [0, 1].map((i) => <g key={i}><rect x={400 + i * 1500} y={H - 130} width={16} height={140} fill={col} /><circle cx={408 + i * 1500} cy={H - 134} r={10} fill={col} /></g>);
  if (!kids) return null;
  return <g transform={`translate(${(1 - p) * left},0)`}>{kids}</g>;
};
