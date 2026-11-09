import React from 'react';
import {Boat, Hills, House, Mountains, NIGHT, PALETTES, Person, Pal, Sky, Skyline, Tree, Waves, rng} from './art';
import {Scene, W, H} from './types';

const SKIN = ['#f1c9a5', '#d9a47a', '#8d5a3b', '#f6d9bd'];
const CLOTH = ['#e4572e', '#2a9d8f', '#f2c14e', '#6a4c93', '#3d5a80'];

export const Background: React.FC<{scene: Scene; frame: number; seed: number; progress: number}> = ({scene, frame, seed, progress}) => {
  const mood = scene.mood ?? 'calm';
  const base = PALETTES[mood];
  const pal: Pal = scene.night ? NIGHT : base;
  const setting = scene.setting ?? 'countryside';
  const pan = progress * 120;               // camera lenta
  const ground = H * 0.78;
  const r = rng(seed + scene.text.length);
  const n = Math.min(scene.people ?? 1, 3);
  const walking = mood !== 'sad' && setting !== 'interior';

  if (setting === 'interior') {
    return (
      <g>
        <rect width={W} height={H} fill={pal.far} />
        <rect y={H * 0.72} width={W} height={H * 0.28} fill={pal.near} />
        <rect x={W * 0.62} y={90} width={220} height={260} fill={pal.sky[0]} stroke={pal.near} strokeWidth={10} />
        <line x1={W * 0.62 + 110} y1={90} x2={W * 0.62 + 110} y2={350} stroke={pal.near} strokeWidth={6} />
        <rect x={120} y={H * 0.5} width={260} height={H * 0.22} rx={14} fill={pal.mid} />
        <circle cx={W * 0.45} cy={150} r={22} fill={pal.accent} opacity={0.7} />
        {Array.from({length: n}).map((_, i) => (
          <Person key={i} x={560 + i * 130 - progress * 30} y={H * 0.82} s={1.5} color={CLOTH[(i + seed) % 5]} skin={SKIN[(i + seed) % 4]} t={frame} mood={mood} />
        ))}
      </g>
    );
  }

  return (
    <g>
      <Sky pal={pal} night={scene.night} w={W} h={H} t={frame} />
      {setting === 'mountain' && <Mountains seed={seed} color={pal.far} y={ground - 40} w={W} off={pan * 0.2} snow="#f4f1de" />}
      {setting === 'city' && <Skyline seed={seed} color={pal.far} y={ground - 20} w={W} off={pan * 0.3} night={scene.night} accent={pal.accent} />}
      <Hills seed={seed + 1} color={pal.mid} y={ground - 60} amp={30} w={W} h={H} off={pan * 0.5} />
      {setting === 'city' && <Skyline seed={seed + 5} color={pal.mid} y={ground + 10} w={W} off={pan * 0.7} night={scene.night} accent={pal.accent} />}
      {setting === 'sea' && (<>
        <Waves y={ground - 40} w={W} h={H} color={pal.mid} t={frame} />
        <Boat x={W * 0.35 + progress * 200} y={ground - 25} s={1.3} t={frame} color={pal.near} />
        <Waves y={ground + 20} w={W} h={H} color={pal.near} t={frame + 20} amp={12} />
      </>)}
      {setting !== 'sea' && <Hills seed={seed + 2} color={pal.near} y={ground} amp={14} w={W} h={H} off={pan} freq={1.6} />}
      {setting === 'countryside' && Array.from({length: 7}).map((_, i) => {
        const x = ((i * 230 + r() * 90 - pan) % (W + 300) + (W + 300)) % (W + 300) - 100;
        return i % 3 === 0 ? <House key={i} x={x} y={ground + 6} s={1.1} color={pal.far} roof={pal.accent} /> : <Tree key={i} x={x} y={ground + 8} s={1.2} color={pal.far} />;
      })}
      {setting === 'desert' && <Hills seed={seed + 9} color={pal.accent} y={ground + 10} amp={22} w={W} h={H} off={pan * 0.9} freq={0.6} />}
      {Array.from({length: n}).map((_, i) => (
        <Person key={i} x={420 + i * 150 + (walking ? progress * 160 : 0)} y={setting === 'sea' ? ground - 20 : ground + 52}
          s={1.5} color={CLOTH[(i + seed) % 5]} skin={SKIN[(i * 3 + seed) % 4]} t={frame} mood={mood} walking={walking} />
      ))}
    </g>
  );
};
