import React from 'react';
import {AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
import {flip} from '@remotion/transitions/flip';
import {clockWipe} from '@remotion/transitions/clock-wipe';
import {Caption, Headline} from './Overlays';
import {Illustrated} from './scenes/Illustrated';
import {MapCard, QuoteCard, StatCard, TimelineCard, TitleCard} from './scenes/Special';
import {ambienceFor, hasTrans, plan, sfxCues} from './plan';
import {H, Look, Scene, StoryProps, TD, Transition, W} from './types';

const SceneView: React.FC<{scene: Scene; seed: number; index: number; looks: Look[]}> = ({scene, seed, index, looks}) => {
  const s = seed + index * 11;
  let body: React.ReactNode;
  switch (scene.kind) {
    case 'title': body = <TitleCard s={scene} />; break;
    case 'quote': body = <QuoteCard s={scene} />; break;
    case 'stat': body = <StatCard s={scene} frames={scene.frames} />; break;
    case 'timeline': body = <TimelineCard s={scene} frames={scene.frames} />; break;
    case 'map': body = <MapCard s={scene} frames={scene.frames} seed={s} />; break;
    default: body = <Illustrated scene={scene} seed={s} looks={looks} />;
  }
  return <AbsoluteFill>{body}</AbsoluteFill>;
};

const presentation = (t: Transition): any => {
  switch (t) {
    case 'slide_left': return slide({direction: 'from-left'});
    case 'slide_right': return slide({direction: 'from-right'});
    case 'wipe': return wipe({direction: 'from-left'});
    case 'flip': return flip();
    case 'clock': return clockWipe({width: W, height: H});
    default: return fade();
  }
};

const Snd: React.FC<{src: string; from: number; dur: number; vol: number; loop?: boolean; fade?: number}> = ({src, from, dur, vol, loop, fade: fd = 0}) => {
  if (dur < 1) return null;
  return (
    <Sequence from={Math.max(0, from)} durationInFrames={Math.max(1, dur)} layout="none">
      <Audio src={staticFile(src)} loop={loop}
        volume={(fr) => (fd ? vol * interpolate(fr, [0, fd, Math.max(fd + 1, dur - fd), Math.max(fd + 2, dur)], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : vol)} />
    </Sequence>
  );
};

function musicBlocks(scenes: Scene[], starts: number[], total: number) {
  const blocks: {mood: string; from: number; to: number}[] = [];
  for (let i = 0; i < scenes.length; i += 5) {
    const grp = scenes.slice(i, i + 5); const count: Record<string, number> = {};
    grp.forEach((s) => { const m = s.mood ?? 'calm'; count[m] = (count[m] ?? 0) + 1; });
    const mood = Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
    const from = starts[i]; const last = Math.min(i + 5, scenes.length) - 1; const to = starts[last] + scenes[last].frames;
    const prev = blocks[blocks.length - 1];
    if (prev && prev.mood === mood) prev.to = to; else blocks.push({mood, from, to});
  }
  return blocks.map((b, k) => ({...b, from: k ? b.from - 40 : 0, to: k === blocks.length - 1 ? total : b.to + 40}));
}

const Fades: React.FC<{total: number}> = ({total}) => {
  const f = useCurrentFrame();
  const o = Math.max(interpolate(f, [0, 12], [1, 0], {extrapolateRight: 'clamp'}), interpolate(f, [total - 25, total], [0, 1], {extrapolateLeft: 'clamp'}));
  return <AbsoluteFill style={{background: '#000', opacity: o, pointerEvents: 'none'}} />;
};

export const Story: React.FC<StoryProps> = ({scenes, characters, seed, musicVolume, musicTracks}) => {
  const {starts, total} = plan(scenes);
  const cues = sfxCues(scenes, starts);
  const kids: React.ReactNode[] = [];
  scenes.forEach((sc, i) => {
    if (hasTrans(sc, i)) kids.push(<TransitionSeries.Transition key={`t${i}`} presentation={presentation(sc.transition ?? 'fade')} timing={linearTiming({durationInFrames: TD})} />);
    kids.push(<TransitionSeries.Sequence key={`s${i}`} durationInFrames={sc.frames}><SceneView scene={sc} seed={seed} index={i} looks={characters} /></TransitionSeries.Sequence>);
  });
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <TransitionSeries>{kids}</TransitionSeries>
      {/* sottotitoli e titoletti: globali, visibili solo quando la scena è in primo piano (niente doppioni nelle transizioni) */}
      {scenes.map((sc, i) => {
        const inD = hasTrans(sc, i) ? TD : 0; const outD = i < scenes.length - 1 && hasTrans(scenes[i + 1], i + 1) ? TD : 0;
        const dur = sc.frames - inD - outD; if (dur < 1) return null;
        return <Sequence key={`c${i}`} from={starts[i] + inD} durationInFrames={dur}><Headline text={sc.headline} /><Caption text={sc.text} frames={sc.frames} offset={inD} /></Sequence>;
      })}
      <Fades total={total} />
      {/* voce */}
      {scenes.map((sc, i) => <Snd key={`v${i}`} src={`audio/${sc.audio}`} from={starts[i]} dur={sc.frames} vol={1} />)}
      {/* musica per blocchi di umore, con crossfade */}
      {musicBlocks(scenes, starts, total).map((b, k) => (
        <Snd key={`m${k}`} src={`music/${musicTracks?.[b.mood] ?? `${b.mood}.mp3`}`} from={b.from} dur={b.to - b.from} vol={musicVolume ?? 0.13} loop fade={50} />
      ))}
      {/* ambienti */}
      {scenes.flatMap((sc, i) => ambienceFor(sc).map((a, k) => <Snd key={`a${i}-${k}`} src={`sfx/${a}.mp3`} from={starts[i] - 6} dur={sc.frames + 12} vol={0.2} loop fade={18} />))}
      {/* passi */}
      {scenes.map((sc, i) => {
        const run = (sc.cast ?? []).some((m) => m.action === 'run'); const walk = (sc.cast ?? []).some((m) => m.action === 'walk');
        return run || walk ? <Snd key={`w${i}`} src={`sfx/${run ? 'steps_run' : 'steps'}.mp3`} from={starts[i]} dur={sc.frames} vol={0.22} loop fade={10} /> : null;
      })}
      {/* effetti */}
      {cues.map((c, i) => <Snd key={`x${i}`} src={`sfx/${c.name}.mp3`} from={c.at} dur={110} vol={c.vol} />)}
    </AbsoluteFill>
  );
};
