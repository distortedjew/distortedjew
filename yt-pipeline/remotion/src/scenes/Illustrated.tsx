import React from 'react';
import {useCurrentFrame} from 'remotion';
import {camera} from '../camera';
import {Env, Foreground, GY, TOD} from '../env';
import {Grade, Weather} from '../Fx';
import {Stickman} from '../stick';
import {CastMember, H, Look, Scene, W, WW} from '../types';

const DEFAULT_SPEED = {walk: 1.9, run: 5};

export const Illustrated: React.FC<{scene: Scene; seed: number; looks: Look[]}> = ({scene, seed, looks}) => {
  const f = useCurrentFrame(); const p = f / Math.max(1, scene.frames);
  const cast: CastMember[] = (scene.cast ?? []).slice(0, 3);
  const time = scene.time ?? 'day'; const setting = scene.setting ?? 'field';
  const indoor = ['room', 'castle', 'lab', 'cave'].includes(setting);
  const ink = setting === 'cave' ? '#eee9dc' : TOD[time].ink;
  const placed = cast.map((m, i) => {
    const a = m.action ?? 'idle'; const face = m.face ?? (i % 2 === 0 ? 'r' : 'l'); const dir = face === 'l' ? -1 : 1;
    const x0 = 640 + (m.x ?? (cast.length === 1 ? 0.5 : 0.28 + i * 0.3)) * 1280;
    const sp = a === 'walk' ? DEFAULT_SPEED.walk : a === 'run' ? DEFAULT_SPEED.run : 0;
    const x = Math.max(80, Math.min(WW - 80, x0 + dir * sp * f));
    return {m, i, a, face, x, y: GY + 64 + i * 14 - (indoor ? 6 : 0), phase: f * (a === 'run' ? 0.5 : 0.28)};
  });
  const lead = placed[0];
  const focus = lead ? {x: lead.x, y: lead.y - 150} : {x: WW / 2, y: H / 2};
  const cam = camera(scene.camera ?? 'static', p, f, focus);
  const flashCue = (scene.sfx ?? []).find((e) => (e.name === 'thunder' || e.name === 'impact') && Math.abs(p * scene.frames - e.at * scene.frames) < 5);
  const flash = flashCue ? 0.55 * (1 - Math.abs(p - flashCue.at) * scene.frames / 5) : 0;
  return (
    <div style={{position: 'absolute', inset: 0}}>
      <svg width={W} height={H} viewBox={`${cam.left} ${cam.top} ${cam.vw} ${cam.vh}`} style={{position: 'absolute'}}>
        <Env scene={scene} f={f} seed={seed} left={cam.left} top={cam.top} />
        {[...placed].sort((a, b) => a.y - b.y).map(({m, i, a, face, x, y, phase}) => (
          <Stickman key={m.id + i} look={looks.find((l) => l.id === m.id) ?? {id: m.id}} x={x} y={y} s={1.32 + i * 0.03}
            f={f + i * 9} flip={face === 'l'} ink={ink} emotion={m.emotion} action={a} prop={m.prop} walkPhase={phase} seed={seed + i} />
        ))}
        <Foreground scene={scene} f={f} seed={seed} left={cam.left} top={cam.top} />
      </svg>
      <Weather scene={scene} f={f} />
      <Grade mood={scene.mood ?? 'calm'} flash={flash} />
    </div>
  );
};
