import React from 'react';
import {Composition} from 'remotion';
import {plan} from './plan';
import {Story} from './Story';
import {FPS, H, StoryProps, W} from './types';

const defaults: StoryProps = {scenes: [], characters: [], seed: 1};

export const Root: React.FC = () => (
  <Composition id="Story" component={Story} width={W} height={H} fps={FPS} durationInFrames={FPS * 10} defaultProps={defaults}
    calculateMetadata={({props}) => ({durationInFrames: plan(props.scenes).total})} />
);
