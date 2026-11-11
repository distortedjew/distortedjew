import React from "react";
import { Composition } from "remotion";
// TODO: dopo aver adattato story.ts (vedi SHOTLIST.md) rinomina BridgeShort/BRIDGE_FRAMES in IkeaShort/IKEA_FRAMES.
import { BridgeShort, BRIDGE_FRAMES } from "./videos/ikea/Bridge";

export const Root: React.FC = () => (
  <Composition id="IkeaShort" component={BridgeShort} durationInFrames={BRIDGE_FRAMES} fps={30} width={1080} height={1920} />
);
