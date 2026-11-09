export type Mood = 'calm' | 'tense' | 'joy' | 'sad';
export type Setting = 'street' | 'village' | 'field' | 'forest' | 'sea' | 'mountain' | 'desert' | 'room' | 'castle' | 'lab' | 'cave';
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type Weather = 'none' | 'rain' | 'snow' | 'fog' | 'fire';
export type Camera = 'static' | 'push_in' | 'pull_out' | 'pan_left' | 'pan_right' | 'tilt_up' | 'tilt_down' | 'shake' | 'follow';
export type Transition = 'cut' | 'fade' | 'slide_left' | 'slide_right' | 'wipe' | 'flip' | 'clock';
export type Kind = 'title' | 'narrate' | 'map' | 'timeline' | 'stat' | 'quote';

export type Emotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'scared' | 'surprised' | 'thinking' | 'smug';
export type Action = 'idle' | 'walk' | 'run' | 'wave' | 'point' | 'shrug' | 'think' | 'cower' | 'celebrate';
export type Trait = 'nervous' | 'confident' | 'grumpy' | 'cheerful' | 'wise' | 'energetic';
export type Prop = 'none' | 'letter' | 'torch' | 'lantern' | 'book';

export interface Look {
  id: string; name?: string; trait?: Trait;
  hat?: 'none' | 'top' | 'cap' | 'crown' | 'hood' | 'helmet' | 'beret';
  hair?: 'none' | 'short' | 'long' | 'messy';
  glasses?: boolean; beard?: boolean; mustache?: boolean;
  scarf?: string; hatColor?: string; hairColor?: string; scale?: number;
}
export interface CastMember {
  id: string; x?: number;            // 0..1 posizione nell'inquadratura iniziale
  emotion?: Emotion; action?: Action; face?: 'l' | 'r'; prop?: Prop;
}
export interface SfxEvent { name: string; at: number }  // at = frazione della scena (0..1)

export interface Scene {
  kind: Kind;
  text: string; frames: number; audio: string;
  headline?: string;
  setting?: Setting; time?: TimeOfDay; weather?: Weather; mood?: Mood;
  camera?: Camera; transition?: Transition;
  cast?: CastMember[]; sfx?: SfxEvent[];
  title?: string; subtitle?: string;
  points?: string[];
  items?: {year: string; label: string}[];
  value?: number; unit?: string; label?: string;
  quote?: string; by?: string;
}

export type StoryProps = {
  scenes: Scene[];
  characters: Look[];
  seed: number;
  musicVolume?: number;
  musicTracks?: Record<string, string>;   // mood -> file in public/music
};

export const FPS = 25;
export const W = 1280;
export const H = 720;
export const WW = 2560;                  // larghezza del "mondo" (camera può spostarsi)
export const TD = 8;                     // durata transizioni in frame
export const PAD = 14;                   // pausa dopo la voce (frame)
