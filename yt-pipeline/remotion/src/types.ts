export type Mood = 'calm' | 'tense' | 'joy' | 'sad';
export type Setting = 'city' | 'countryside' | 'sea' | 'mountain' | 'desert' | 'interior';
export type Kind = 'title' | 'narrate' | 'map' | 'timeline' | 'stat' | 'quote';

export interface Scene {
  kind: Kind;
  text: string;            // narrazione (diventa anche sottotitolo)
  frames: number;          // durata in frame (calcolata dal TTS)
  audio: string;           // file in public/audio
  headline?: string;       // etichetta a video es. "Londra, 1666"
  setting?: Setting;
  night?: boolean;
  mood?: Mood;
  people?: number;         // 0-3 personaggi
  title?: string; subtitle?: string;                 // title
  points?: string[];                                  // map: luoghi in ordine
  items?: {year: string; label: string}[];           // timeline
  value?: number; unit?: string; label?: string;     // stat
  quote?: string; by?: string;                       // quote
}

export type StoryProps = {
  scenes: Scene[];
  seed: number;
  music?: string;          // file in public/music
  musicVolume?: number;
};

export const FPS = 25;
export const W = 1280;
export const H = 720;
