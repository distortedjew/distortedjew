import React from "react";
import { Composition } from "remotion";
import { IkeaShort, IKEA_FRAMES } from "./videos/ikea/Ikea";

export const Root: React.FC = () => (
  <Composition id="IkeaShort" component={IkeaShort} durationInFrames={IKEA_FRAMES} fps={30} width={1080} height={1920} />
);
