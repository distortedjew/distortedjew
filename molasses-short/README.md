# The Molasses Flood — Remotion project

Short vertical (1080x1920, 30 fps, 66 s) in the "cartoon 3D" style of the claude-animated-shorts skill.

```bash
npm install
npm run preview                 # Remotion Studio, composition "MolassesShort"
COMP=MolassesShort node scripts/bridge-stills.mjs out/x_ 60,420,960 0.5   # quick stills
npm run render                  # -> out/video.mp4 (1440x2560, needs a GPU: ~4 fps)
npm run mux                     # adds voice/voice.wav -> out/final.mp4
```
Set `REMOTION_TMP` to a large drive (each bundle copies ~GBs).
Optional: Kenney Nature Kit .glb files in public/bridge/kenney/ (not used by the molasses scene).
Voice: voice/voice.wav (Kokoro, am_michael) + estimated word timings in voice/words.json. No SFX/music yet.
