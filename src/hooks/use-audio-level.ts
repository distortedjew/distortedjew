"use client";

import { useEffect, useRef, useState } from "react";

/** Returns a smoothed 0..1 volume level for a MediaStream's audio track. */
export function useAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      // Nothing to tear down; level is already at its default/last value,
      // which the previous effect run's cleanup (below) already reset.
      return;
    }

    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextCtor();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
      setLevel(Math.min(1, avg / 100));
      frameRef.current = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      source.disconnect();
      analyser.disconnect();
      ctx.close().catch(() => undefined);
      setLevel(0);
    };
  }, [stream]);

  return level;
}
