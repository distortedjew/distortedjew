import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {PAD} from './types';

const FONT = '"DejaVu Sans", "Helvetica Neue", Arial, sans-serif';

export const Caption: React.FC<{text: string; frames: number; offset?: number}> = ({text, frames, offset = 0}) => {
  const frame = useCurrentFrame() + offset;
  const words = text.split(/\s+/).filter(Boolean);
  const per = 6; const chunks: string[] = [];
  for (let i = 0; i < words.length; i += per) chunks.push(words.slice(i, i + per).join(' '));
  const total = chunks.reduce((a, c) => a + c.length, 0) || 1;
  const speech = Math.max(1, frames - PAD);
  let acc = 0, idx = chunks.length - 1;
  for (let i = 0; i < chunks.length; i++) { acc += chunks[i].length / total * speech; if (frame < acc) { idx = i; break; } }
  return (
    <div style={{position: 'absolute', bottom: 44, width: '100%', textAlign: 'center', fontFamily: FONT, fontWeight: 700,
      fontSize: 38, color: '#fff', padding: '0 80px', boxSizing: 'border-box', textShadow: '0 3px 10px rgba(0,0,0,.75), 0 0 3px #000'}}>
      {chunks[idx]}
    </div>
  );
};

export const Headline: React.FC<{text?: string}> = ({text}) => {
  const frame = useCurrentFrame();
  if (!text) return null;
  const x = interpolate(frame, [0, 14], [-60, 0], {extrapolateRight: 'clamp'});
  const o = interpolate(frame, [0, 14], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', top: 52, left: 56, transform: `translateX(${x}px)`, opacity: o, fontFamily: FONT, fontWeight: 800,
      fontSize: 30, letterSpacing: 3, textTransform: 'uppercase', color: '#fff', background: 'rgba(20,20,30,.72)', padding: '10px 22px', borderLeft: '8px solid #e4572e'}}>
      {text}
    </div>
  );
};

export const Center: React.FC<{children: React.ReactNode; bg?: string}> = ({children, bg = '#14141e'}) => (
  <div style={{position: 'absolute', inset: 0, background: bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, color: '#fff', textAlign: 'center'}}>
    {children}
  </div>
);

