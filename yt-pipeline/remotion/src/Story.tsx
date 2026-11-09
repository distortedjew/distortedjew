import React from 'react';
import {AbsoluteFill, Audio, Series, staticFile, useCurrentFrame} from 'remotion';
import {Background} from './Background';
import {Caption, Headline, useFade} from './Overlays';
import {MapCard, QuoteCard, StatCard, TimelineCard, TitleCard} from './scenes/Special';
import {H, Scene, StoryProps, W} from './types';

const SceneView: React.FC<{scene: Scene; seed: number; index: number}> = ({scene, seed, index}) => {
  const frame = useCurrentFrame();
  const fade = useFade(scene.frames);
  const progress = frame / Math.max(scene.frames, 1);
  const s = seed + index * 11;
  let body: React.ReactNode;
  switch (scene.kind) {
    case 'title': body = <TitleCard s={scene} />; break;
    case 'quote': body = <QuoteCard s={scene} />; break;
    case 'stat': body = <StatCard s={scene} frames={scene.frames} />; break;
    case 'timeline': body = <TimelineCard s={scene} frames={scene.frames} />; break;
    case 'map': body = <MapCard s={scene} frames={scene.frames} seed={s} />; break;
    default:
      body = <svg width={W} height={H}><Background scene={scene} frame={frame} seed={s} progress={progress} /></svg>;
  }
  return (
    <AbsoluteFill style={{opacity: fade}}>
      {body}
      <Headline text={scene.headline} />
      <Caption text={scene.text} frames={scene.frames} />
      <Audio src={staticFile(`audio/${scene.audio}`)} />
    </AbsoluteFill>
  );
};

export const Story: React.FC<StoryProps> = ({scenes, seed, music, musicVolume}) => (
  <AbsoluteFill style={{background: '#000'}}>
    {music ? <Audio src={staticFile(`music/${music}`)} loop volume={musicVolume ?? 0.07} /> : null}
    <Series>
      {scenes.map((sc, i) => (
        <Series.Sequence key={i} durationInFrames={sc.frames}>
          <SceneView scene={sc} seed={seed} index={i} />
        </Series.Sequence>
      ))}
    </Series>
  </AbsoluteFill>
);
