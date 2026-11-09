import React from 'react';
import {Action, Emotion, Look, Prop, Trait} from './types';

const rad = (a: number) => (a * Math.PI) / 180;
const pt = (x: number, y: number, l: number, a: number): [number, number] => [x + l * Math.sin(rad(a)), y + l * Math.cos(rad(a))];
const limb = (ox: number, oy: number, l1: number, l2: number, a1: number, a2: number) => {
  const j = pt(ox, oy, l1, a1); const e = pt(j[0], j[1], l2, a1 + a2); return {j, e};
};

interface Pose {
  hipDy: number; lean: number; tilt: number;
  la: [number, number]; ra: [number, number]; ll: [number, number]; rl: [number, number];
}

const TRAITS: Record<Trait, {bounce: number; speed: number; jitter: number; lean: number; emotion: Emotion; slump: number}> = {
  nervous: {bounce: 0.6, speed: 6.5, jitter: 1.6, lean: -3, emotion: 'scared', slump: 2},
  confident: {bounce: 0.8, speed: 2.2, jitter: 0, lean: -5, emotion: 'smug', slump: -3},
  grumpy: {bounce: 0.3, speed: 1.6, jitter: 0, lean: 6, emotion: 'angry', slump: 6},
  cheerful: {bounce: 2.2, speed: 4, jitter: 0, lean: 0, emotion: 'happy', slump: 0},
  wise: {bounce: 0.4, speed: 1.4, jitter: 0, lean: 2, emotion: 'neutral', slump: 1},
  energetic: {bounce: 3, speed: 5.5, jitter: 0.4, lean: 3, emotion: 'happy', slump: 0},
};

function computePose(action: Action, f: number, trait: Trait, walkPhase: number): Pose {
  const T = TRAITS[trait]; const s = f / 25;
  const idleBob = Math.sin(s * T.speed) * T.bounce;
  const jit = T.jitter ? Math.sin(s * 31) * T.jitter : 0;
  const base: Pose = {
    hipDy: -idleBob * 0.5, lean: T.lean + jit, tilt: Math.sin(s * 1.3) * 2 + T.slump * 0.5,
    la: [-10 - idleBob, 6], ra: [10 + idleBob, 6], ll: [-3, 0], rl: [3, 0],
  };
  switch (action) {
    case 'walk': case 'run': {
      const run = action === 'run'; const sw = Math.sin(walkPhase); const A = run ? 55 : 32;
      return {hipDy: -Math.abs(Math.cos(walkPhase)) * (run ? 10 : 4), lean: (run ? 14 : 4) + T.lean * 0.3, tilt: 0,
        ll: [sw * A, Math.max(0, -sw) * A * 1.4], rl: [-sw * A, Math.max(0, sw) * A * 1.4],
        la: [-sw * (run ? 60 : 30) - 5, run ? -70 : 10], ra: [sw * (run ? 60 : 30) + 5, run ? -70 : 10]};
    }
    case 'wave': return {...base, ra: [150 + Math.sin(s * 9) * 14, Math.sin(s * 9) * 25 - 10], tilt: 4, lean: base.lean - 2};
    case 'point': return {...base, ra: [96, -4], la: [-8, 8], lean: base.lean + 4, tilt: -3};
    case 'shrug': { const u = Math.min(1, f / 8); return {...base, hipDy: -3 * u, ra: [50 * u, -110 * u], la: [-50 * u, 110 * u], tilt: 6 * u}; }
    case 'think': return {...base, ra: [50, -175], la: [-12, 8], tilt: 7, lean: base.lean + 1};
    case 'cower': return {hipDy: 28, lean: -12, tilt: -6, la: [-100, -80], ra: [100, 80], ll: [-48, 85], rl: [48, -85]};
    case 'celebrate': { const j = Math.abs(Math.sin(s * 7)); return {hipDy: -j * 26, lean: 0, tilt: Math.sin(s * 7) * 5,
      la: [-160 - j * 10, -8], ra: [160 + j * 10, 8], ll: [-6 - j * 10, 0], rl: [6 + j * 10, 0]}; }
    default: return base;
  }
}

const Face: React.FC<{emotion: Emotion; f: number; look: number; seed: number; ink: string}> = ({emotion, f, look, seed, ink}) => {
  const blink = (f + seed * 17) % 118 < 4;
  const big = emotion === 'surprised' || emotion === 'scared';
  const brows: Record<Emotion, [number, number, number, number, number, number, number, number]> = {
    neutral: [-11, -10, -3, -10, 3, -10, 11, -10], happy: [-11, -11, -3, -12, 3, -12, 11, -11],
    sad: [-11, -7, -3, -12, 3, -12, 11, -7], angry: [-11, -13, -3, -8, 3, -8, 11, -13],
    scared: [-11, -8, -3, -13, 3, -13, 11, -8], surprised: [-11, -14, -3, -16, 3, -16, 11, -14],
    thinking: [-11, -9, -3, -10, 3, -14, 11, -16], smug: [-11, -9, -3, -9, 3, -12, 11, -13],
  };
  const b = brows[emotion];
  const mouth: Record<Emotion, React.ReactNode> = {
    neutral: <path d="M-6 9 L6 9" />, happy: <path d="M-8 6 Q0 17 8 6" />, sad: <path d="M-7 13 Q0 5 7 13" />,
    angry: <path d="M-7 12 Q0 7 7 12" />, scared: <path d="M-6 11 Q-3 8 0 11 Q3 14 6 11" />,
    surprised: <ellipse cx={0} cy={10} rx={4} ry={5.5} fill={ink} />, thinking: <path d="M-6 11 L5 8" />,
    smug: <path d="M-7 9 Q2 13 8 5" />,
  };
  return (
    <g stroke={ink} strokeWidth={2.4} fill="none" strokeLinecap="round">
      {[-7, 7].map((x, i) => blink ? <path key={i} d={`M${x - 4} -2 L${x + 4} -2`} /> : big
        ? <g key={i}><circle cx={x} cy={-2} r={5.2} fill="#fff" /><circle cx={x + look * 0.4} cy={-2} r={2} fill={ink} stroke="none" /></g>
        : <circle key={i} cx={x + look} cy={-2} r={2.8} fill={ink} stroke="none" />)}
      <path d={`M${b[0]} ${b[1]} L${b[2]} ${b[3]}`} /><path d={`M${b[4]} ${b[5]} L${b[6]} ${b[7]}`} />
      {mouth[emotion]}
    </g>
  );
};

const Hat: React.FC<{look: Look; ink: string}> = ({look, ink}) => {
  const c = look.hatColor ?? '#6a4c93';
  switch (look.hat) {
    case 'top': return <g fill={c} stroke={ink} strokeWidth={2}><rect x={-26} y={-24} width={52} height={6} rx={2} /><rect x={-15} y={-52} width={30} height={30} rx={2} /><rect x={-15} y={-31} width={30} height={6} fill="#e4572e" stroke="none" /></g>;
    case 'cap': return <g fill={c} stroke={ink} strokeWidth={2}><path d="M-21 -8 Q-20 -30 2 -30 Q22 -28 21 -8 Z" /><path d="M10 -9 L32 -6 L10 -3 Z" /></g>;
    case 'crown': return <g fill="#f2c14e" stroke={ink} strokeWidth={2}><path d="M-17 -18 L-19 -40 L-9 -30 L0 -44 L9 -30 L19 -40 L17 -18 Z" /></g>;
    case 'hood': return <path d="M-25 8 Q-28 -34 0 -34 Q28 -34 25 8 Q20 -12 0 -14 Q-20 -12 -25 8 Z" fill={c} stroke={ink} strokeWidth={2} />;
    case 'helmet': return <g fill="#9aa5b1" stroke={ink} strokeWidth={2}><path d="M-23 -6 Q-23 -34 0 -34 Q23 -34 23 -6 Z" /><rect x={-2} y={-34} width={4} height={26} fill="#6b7580" /></g>;
    case 'beret': return <g fill={c} stroke={ink} strokeWidth={2}><ellipse cx={-3} cy={-22} rx={24} ry={9} /><circle cx={-3} cy={-31} r={3} /></g>;
    default: return null;
  }
};

const Hair: React.FC<{look: Look}> = ({look}) => {
  const c = look.hairColor ?? '#4a3428';
  if (look.hair === 'short') return <path d="M-21 -4 Q-24 -26 0 -24 Q24 -26 21 -4 Q12 -16 0 -15 Q-12 -16 -21 -4 Z" fill={c} />;
  if (look.hair === 'long') return <path d="M-22 6 Q-28 -28 0 -26 Q28 -28 22 6 L16 20 Q18 -6 0 -14 Q-18 -6 -16 20 Z" fill={c} />;
  if (look.hair === 'messy') return <path d="M-21 -4 L-26 -18 L-14 -14 L-12 -28 L-4 -17 L4 -30 L9 -17 L20 -26 L19 -12 L26 -10 L21 -4 Q10 -15 0 -14 Q-10 -15 -21 -4 Z" fill={c} />;
  return null;
};

const PropDraw: React.FC<{prop: Prop; f: number}> = ({prop, f}) => {
  if (prop === 'letter') return <g><rect x={-9} y={-13} width={26} height={17} fill="#f6f1e7" stroke="#333" strokeWidth={1.5} /><path d="M-9 -13 L4 -3 L17 -13" fill="none" stroke="#333" strokeWidth={1.5} /></g>;
  if (prop === 'book') return <g><rect x={-10} y={-15} width={24} height={18} fill="#8b3a3a" stroke="#333" strokeWidth={1.5} /><rect x={-7} y={-12} width={18} height={12} fill="#f6f1e7" /></g>;
  if (prop === 'torch') { const fl = 1 + Math.sin(f * 0.9) * 0.15 + Math.sin(f * 1.7) * 0.1; return (
    <g><rect x={-3} y={-40} width={6} height={44} fill="#6b4a2f" /><g transform={`translate(0,-46) scale(${fl})`}>
      <ellipse cx={0} cy={0} rx={30} ry={30} fill="#ffb347" opacity={0.18} /><path d="M0 -30 Q14 -8 0 6 Q-14 -8 0 -30Z" fill="#ff7b00" /><path d="M0 -18 Q7 -6 0 3 Q-7 -6 0 -18Z" fill="#ffd166" /></g></g>); }
  if (prop === 'lantern') return <g><path d="M0 0 L0 -12" stroke="#333" strokeWidth={2} /><rect x={-9} y={0} width={18} height={24} rx={4} fill="#ffd166" stroke="#333" strokeWidth={2} /><circle cx={0} cy={12} r={34} fill="#ffd166" opacity={0.15 + Math.sin(f * 0.4) * 0.04} /></g>;
  return null;
};

const Emote: React.FC<{emotion: Emotion; trait: Trait; f: number}> = ({emotion, trait, f}) => {
  const pop = Math.min(1, f / 6); const bob = Math.sin(f * 0.3) * 2;
  if (emotion === 'surprised' || emotion === 'scared') return <text x={26} y={-34 + bob} fontSize={36} fontWeight={900} fill="#e4572e" transform={`scale(${pop})`} fontFamily="DejaVu Sans">!</text>;
  if (emotion === 'thinking') return <text x={26} y={-34 + bob} fontSize={34} fontWeight={900} fill="#2a9d8f" transform={`scale(${pop})`} fontFamily="DejaVu Sans">?</text>;
  if (emotion === 'angry') return <path d="M16 -22 l6 -6 m0 0 l6 4 m-6 -4 l-2 -8" stroke="#d62828" strokeWidth={3} fill="none" strokeLinecap="round" transform={`scale(${pop})`} />;
  if (trait === 'nervous' || emotion === 'sad') return <path d="M24 -8 q-6 10 0 14 q6 -4 0 -14z" fill="#6ec1e4" transform={`translate(0,${(f % 40) * 0.4})`} />;
  return null;
};

export interface StickProps {
  look: Look; x: number; y: number; s: number; f: number; flip: boolean; ink: string;
  emotion?: Emotion; action?: Action; prop?: Prop; walkPhase?: number; seed?: number;
}

export const Stickman: React.FC<StickProps> = ({look, x, y, s, f, flip, ink, emotion, action = 'idle', prop = 'none', walkPhase = 0, seed = 0}) => {
  const trait = look.trait ?? 'wise';
  const emo = emotion ?? TRAITS[trait].emotion;
  const p = computePose(action, f, trait, walkPhase);
  const hip: [number, number] = [0, -92 + p.hipDy];
  const neck = pt(hip[0], hip[1], 0, 0); const torsoTop: [number, number] = [hip[0] + 58 * Math.sin(rad(p.lean)), hip[1] - 58 * Math.cos(rad(p.lean))];
  const sh: [number, number] = [torsoTop[0], torsoTop[1] + 8];
  const L = limb(hip[0], hip[1], 46, 46, p.ll[0], p.ll[1]); const R = limb(hip[0], hip[1], 46, 46, p.rl[0], p.rl[1]);
  const LA = limb(sh[0], sh[1], 36, 34, p.la[0], p.la[1]); const RA = limb(sh[0], sh[1], 36, 34, p.ra[0], p.ra[1]);
  const headC: [number, number] = [torsoTop[0] + 2 * Math.sin(rad(p.lean)), torsoTop[1] - 22];
  void neck;
  const line = (a: [number, number], b: [number, number], c: [number, number]) => `M${a[0]} ${a[1]} L${b[0]} ${b[1]} L${c[0]} ${c[1]}`;
  const sc = look.scale ?? 1;
  return (
    <g transform={`translate(${x},${y}) scale(${(flip ? -1 : 1) * s * sc},${s * sc})`}>
      <ellipse cx={0} cy={2} rx={34} ry={6} fill="#000" opacity={0.22} />
      <g stroke={ink} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d={line(hip, L.j, L.e)} /><path d={line(hip, R.j, R.e)} />
        <path d={`M${hip[0]} ${hip[1]} L${torsoTop[0]} ${torsoTop[1]}`} />
        <path d={line(sh, LA.j, LA.e)} /><path d={line(sh, RA.j, RA.e)} />
      </g>
      {look.scarf && <g><path d={`M${torsoTop[0] - 12} ${torsoTop[1] - 2} L${torsoTop[0] + 12} ${torsoTop[1] - 2} L${torsoTop[0] + 12} ${torsoTop[1] + 8} L${torsoTop[0] - 12} ${torsoTop[1] + 8}Z`} fill={look.scarf} />
        <path d={`M${torsoTop[0] - 8} ${torsoTop[1] + 6} q-10 ${14 + Math.sin(f * 0.25) * 4} -22 ${10 + Math.sin(f * 0.3) * 6} l4 -6z`} fill={look.scarf} /></g>}
      <g transform={`translate(${RA.e[0]},${RA.e[1]})`}><PropDraw prop={prop} f={f} /></g>
      <g transform={`translate(${headC[0]},${headC[1]}) rotate(${p.tilt})`}>
        <circle r={21} fill="#f6f1e7" stroke={ink} strokeWidth={4} />
        <Hair look={look} />
        <Face emotion={emo} f={f} look={3} seed={seed} ink="#1a1a24" />
        {look.mustache && <path d="M-10 6 Q-5 2 0 6 Q5 2 10 6 Q5 10 0 7 Q-5 10 -10 6Z" fill={look.hairColor ?? '#4a3428'} />}
        {look.beard && <path d="M-18 6 Q-18 30 0 30 Q18 30 18 6 Q10 18 0 18 Q-10 18 -18 6Z" fill={look.hairColor ?? '#4a3428'} />}
        {look.glasses && <g fill="none" stroke="#1a1a24" strokeWidth={2.2}><circle cx={-7} cy={-2} r={7} /><circle cx={7} cy={-2} r={7} /><path d="M0 -2 L0 -2" /></g>}
        <Hat look={look} ink={ink} />
        <Emote emotion={emo} trait={trait} f={f} />
      </g>
    </g>
  );
};
