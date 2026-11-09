import {Scene, TD} from './types';

export const hasTrans = (s: Scene, i: number) => i > 0 && (s.transition ?? 'fade') !== 'cut';

// Con le transizioni le scene si sovrappongono di TD frame: calcolo gli start assoluti (usati per voce, sfx, musica).
export function plan(scenes: Scene[]) {
  const starts: number[] = []; let t = 0;
  scenes.forEach((s, i) => { if (hasTrans(s, i)) t -= TD; starts.push(Math.max(0, t)); t = Math.max(0, t) + s.frames; });
  return {starts, total: Math.max(1, t)};
}

const AMB: Record<string, string> = {street: 'amb_city', village: 'amb_birds', field: 'amb_birds', forest: 'amb_forest', sea: 'amb_waves',
  mountain: 'amb_wind', desert: 'amb_wind', room: 'amb_room', castle: 'amb_wind', lab: 'amb_room', cave: 'amb_cave'};

export function ambienceFor(s: Scene): string[] {
  if (s.kind !== 'narrate') return [];
  const out: string[] = []; const set = s.setting ?? 'field';
  if (s.time === 'night' && ['village', 'field', 'forest'].includes(set)) out.push('amb_crickets'); else out.push(AMB[set] ?? 'amb_wind');
  if (s.weather === 'rain') out.push('amb_rain'); if (s.weather === 'fire') out.push('amb_fire'); if (s.weather === 'snow') out.push('amb_wind');
  return out;
}

export interface SfxCue { name: string; at: number; vol: number }   // at = frame assoluto
export function sfxCues(scenes: Scene[], starts: number[]): SfxCue[] {
  const cues: SfxCue[] = [];
  scenes.forEach((s, i) => {
    const st = starts[i];
    (s.sfx ?? []).forEach((e) => cues.push({name: e.name, at: st + Math.round(e.at * s.frames), vol: 0.7}));
    if (hasTrans(s, i) && s.transition !== 'fade') cues.push({name: 'whoosh', at: st, vol: 0.55});
    if (s.kind === 'title') cues.push({name: 'boom', at: st + 4, vol: 0.8});
    if (s.kind === 'stat') cues.push({name: 'ding', at: st + 66, vol: 0.6});
    if (s.kind === 'map') cues.push({name: 'paper', at: st + 2, vol: 0.5});
    if (s.kind === 'quote') cues.push({name: 'bell', at: st + 6, vol: 0.4});
    if (s.kind === 'timeline') (s.items ?? []).forEach((_, k, a) => cues.push({name: 'tick', at: st + 5 + Math.round(((k + 0.5) / a.length) * (s.frames - 35)), vol: 0.6}));
  });
  return cues;
}
