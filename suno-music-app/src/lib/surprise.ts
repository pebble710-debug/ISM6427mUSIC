/**
 * "Surprise Me" — builds a random, original song idea from curated fragments.
 * Runs entirely in the browser: it never calls SunoAPI and never spends credits.
 */
interface Idea {
  genre: string;
  scene: string;
  sound: string;
}

const IDEAS: Idea[] = [
  { genre: 'Synthwave', scene: 'a midnight drive along a neon-lit coastline, chasing a memory that keeps slipping away', sound: 'pulsing analog synths, gated drums, shimmering arpeggios' },
  { genre: 'Lo-fi', scene: 'a rainy Sunday in a tiny apartment filled with plants and half-read books', sound: 'dusty vinyl crackle, mellow Rhodes chords, lazy boom-bap drums' },
  { genre: 'Cinematic', scene: 'the moment a lone explorer reaches the summit and sees a hidden valley for the first time', sound: 'soaring strings, thunderous taiko, a heroic French horn theme' },
  { genre: 'Folk', scene: 'two old friends reuniting at a small-town train station after twenty years', sound: 'fingerpicked acoustic guitar, warm harmonies, gentle harmonica' },
  { genre: 'House', scene: 'the first warm night of summer on a rooftop as the city lights flicker on', sound: 'four-on-the-floor groove, filtered piano stabs, euphoric vocal chops' },
  { genre: 'Jazz', scene: 'a candlelit corner booth in a smoky basement club after closing time', sound: 'brushed drums, walking upright bass, a sultry muted trumpet' },
  { genre: 'Pop', scene: 'finally deciding to leave a comfort zone and chase a dream in a brand-new city', sound: 'bright synth hooks, punchy drums, an anthemic sing-along chorus' },
  { genre: 'Ambient', scene: 'floating weightlessly above Earth, watching auroras ripple across the night side', sound: 'evolving pads, distant chimes, slow-blooming textures' },
  { genre: 'R&B', scene: 'a late-night phone call that turns into a confession neither person expected', sound: 'silky vocals, deep sub bass, lush layered harmonies' },
  { genre: 'Rock', scene: 'a garage band playing its first real show to a crowd that sings every word back', sound: 'crunchy guitars, driving bass, explosive live drums' },
  { genre: 'Hip-Hop', scene: 'growing up on the same block and finally coming back home as someone new', sound: 'hard-hitting drums, soulful sample loop, confident flow' },
  { genre: 'Country', scene: 'a dusty back road at golden hour with the windows down and nowhere to be', sound: 'twangy telecaster, pedal steel, a stomping backbeat' },
  { genre: 'Electronic', scene: 'a futuristic city waking up as drones carry the first light between towers', sound: 'glitchy percussion, wide supersaws, a hypnotic bassline' },
  { genre: 'Classical', scene: 'snow falling softly over an empty palace garden at dawn', sound: 'delicate solo piano, a string quartet, graceful waltz rhythm' },
  { genre: 'Reggaeton', scene: 'a beach festival where strangers become friends under the stars', sound: 'dembow rhythm, tropical plucks, smooth catchy vocals' },
  { genre: 'Funk', scene: 'a roller-disco night where everyone forgets their worries', sound: 'slap bass, wah guitar, tight horn section' },
  { genre: 'K-Pop', scene: 'a dazzling comeback stage where the lights drop and the beat switches up', sound: 'glossy production, dynamic beat drops, layered group vocals' },
  { genre: 'Metal', scene: 'an ancient fortress under siege during a lightning storm', sound: 'down-tuned riffs, double-kick drums, epic choir' },
];

const MOODS = ['hopeful', 'bittersweet', 'euphoric', 'dreamy', 'nostalgic', 'triumphant', 'mysterious', 'tender', 'rebellious', 'serene'];
const TEMPOS = ['slow-burning', 'mid-tempo', 'upbeat', 'driving', 'laid-back'];

export interface SurpriseIdea {
  prompt: string;
  genre: string;
  /** Short sound description suitable for the Custom-mode style field. */
  sound: string;
}

export function surpriseIdea(rand: () => number = Math.random, previous?: string): SurpriseIdea {
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length) % arr.length];
  let result: SurpriseIdea;
  let attempts = 0;
  do {
    const idea = pick(IDEAS);
    const mood = pick(MOODS);
    const tempo = pick(TEMPOS);
    result = {
      genre: idea.genre,
      sound: `${mood}, ${tempo}, ${idea.sound}`,
      prompt: `A ${mood}, ${tempo} ${idea.genre.toLowerCase()} song about ${idea.scene}, with ${idea.sound}.`,
    };
    attempts++;
  } while (previous && result.prompt === previous && attempts < 5);
  return result;
}

export const SURPRISE_IDEA_COUNT = IDEAS.length;
