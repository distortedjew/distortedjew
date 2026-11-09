import React from 'react';
import {H, Mood, Scene, W} from './types';

export const Weather: React.FC<{scene: Scene; f: number}> = ({scene, f}) => {
  const w = scene.weather ?? 'none';
  if (w === 'none') return null;
  if (w === 'rain') return <svg width={W} height={H} style={{position: 'absolute'}}>{Array.from({length: 150}).map((_, i) => {
    const x = (i * 97 + f * 7) % (W + 200) - 100; const y = (i * 53 + f * 38) % (H + 100) - 50; return <line key={i} x1={x} y1={y} x2={x - 9} y2={y + 26} stroke="#cfe8ff" strokeWidth={1.6} opacity={0.5} />; })}
    <rect width={W} height={H} fill="#1a2a44" opacity={0.18} /></svg>;
  if (w === 'snow') return <svg width={W} height={H} style={{position: 'absolute'}}>{Array.from({length: 130}).map((_, i) => {
    const x = (i * 83 + Math.sin(f * 0.04 + i) * 30 + f * 0.8) % (W + 40); const y = (i * 61 + f * (1.4 + (i % 4) * 0.5)) % (H + 20); return <circle key={i} cx={x} cy={y} r={1.6 + (i % 3)} fill="#fff" opacity={0.85} />; })}</svg>;
  if (w === 'fog') return <svg width={W} height={H} style={{position: 'absolute'}}><defs><radialGradient id="fg"><stop offset="0" stopColor="#e8eef2" stopOpacity="0.55" /><stop offset="1" stopColor="#e8eef2" stopOpacity="0" /></radialGradient></defs>
    {[0, 1, 2, 3, 4].map((i) => <ellipse key={i} cx={((f * (0.4 + i * 0.25) + i * 330) % (W + 1000)) - 400} cy={H * 0.5 + (i % 3) * 70} rx={520} ry={110} fill="url(#fg)" />)}<rect width={W} height={H} fill="#cfd8dc" opacity={0.1} /></svg>;
  return <svg width={W} height={H} style={{position: 'absolute'}}>{Array.from({length: 55}).map((_, i) => {
    const t = ((f * (0.8 + (i % 5) * 0.2) + i * 31) % 160) / 160; return <circle key={i} cx={(i * 119) % W + Math.sin(t * 9 + i) * 20} cy={H - t * H * 0.9} r={1.5 + (i % 3)} fill="#ffb347" opacity={0.8 * (1 - t)} />; })}
    <rect width={W} height={H} fill="#ff6b00" opacity={0.07} /></svg>;
};

const GRADE: Record<Mood, {c: string; o: number}> = {calm: {c: '#ffd9a0', o: 0.06}, tense: {c: '#35384a', o: 0.2}, joy: {c: '#ffc46b', o: 0.1}, sad: {c: '#5a76a0', o: 0.18}};

export const Grade: React.FC<{mood: Mood; flash: number}> = ({mood, flash}) => (
  <svg width={W} height={H} style={{position: 'absolute', pointerEvents: 'none'}}>
    <defs><radialGradient id="vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.62" /></radialGradient></defs>
    <rect width={W} height={H} fill={GRADE[mood].c} opacity={GRADE[mood].o} />
    <rect width={W} height={H} fill="url(#vig)" />
    {flash > 0 && <rect width={W} height={H} fill="#fff" opacity={flash} />}
  </svg>
);
