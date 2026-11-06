import React from "react";
import { Composition, registerRoot } from "remotion";
import { BridgeShort, BRIDGE_FRAMES } from "./videos/bridge/Bridge";
import { MolassesShort, MOLASSES_FRAMES } from "./videos/molasses/Molasses";
const Root: React.FC = () => React.createElement(React.Fragment, null,
  React.createElement(Composition as any, { id: "BridgeShort", component: BridgeShort, durationInFrames: BRIDGE_FRAMES, fps: 30, width: 1080, height: 1920 }),
  React.createElement(Composition as any, { id: "MolassesShort", component: MolassesShort, durationInFrames: MOLASSES_FRAMES, fps: 30, width: 1080, height: 1920 }));
registerRoot(Root);
