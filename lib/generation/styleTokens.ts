import type { SonicAxis } from "@/lib/dna/schema";
import { ERAS } from "@/lib/dna/schema";

/**
 * Style token vocabulary, keyed by axis and pole. Deliberately OUTSIDE the DNA
 * schema so the vocabulary can be tuned between runs without a migration.
 *
 * `left` is the −1 pole, `right` the +1 pole, matching the axis field names
 * (pristineLofi: left=pristine, right=lofi). Tokens are ordered strongest-first:
 * magnitude decides how many are taken.
 */
export const AXIS_TOKENS: Record<SonicAxis, { left: string[]; right: string[] }> = {
  pristineLofi: {
    left: ["pristine production", "polished", "hi-fi clarity"],
    right: ["lo-fi", "tape saturation", "cassette hiss"],
  },
  sparseDense: {
    left: ["sparse arrangement", "minimal instrumentation", "negative space"],
    right: ["dense arrangement", "layered instrumentation", "wall of sound"],
  },
  coldWarm: {
    left: ["cold tone", "icy digital timbre", "detached"],
    right: ["warm tone", "analog warmth", "cozy timbre"],
  },
  improvisedStructured: {
    left: ["improvised feel", "loose performance", "jam-like spontaneity"],
    right: ["structured songwriting", "tight arrangement", "precise performance"],
  },
  loudQuiet: {
    left: ["loud", "aggressive dynamics", "in-the-red energy"],
    right: ["quiet", "hushed dynamics", "intimate"],
  },
  organicSynthetic: {
    left: ["organic instrumentation", "acoustic instruments", "live drums"],
    right: ["synthetic textures", "electronic synthesis", "drum machines"],
  },
  darkHopeful: {
    left: ["dark mood", "brooding", "ominous undertow"],
    right: ["hopeful mood", "uplifting", "radiant"],
  },
};

/** 2D vocal pad vocabulary: same left/right convention per pad axis. */
export const VOCAL_TOKENS = {
  whispersScreams: {
    left: ["whispered vocals", "breathy delivery"],
    right: ["screamed vocals", "throat-shredding intensity"],
  },
  cleanDamaged: {
    left: ["clean vocals", "pure vocal tone"],
    right: ["damaged vocal texture", "distorted vocals"],
  },
} as const;

/** Era → default BPM and production-era tokens. Index-aligned with ERAS. */
export const ERA_STYLES: Record<
  (typeof ERAS)[number],
  { bpm: number; tokens: string[] }
> = {
  "far-past": { bpm: 80, tokens: ["ancient folk tradition", "pre-industrial acoustics"] },
  "1950s": { bpm: 100, tokens: ["1950s rock and roll production", "mono-era recording"] },
  "1960s": { bpm: 110, tokens: ["1960s analog production", "vintage tube warmth"] },
  "1970s": { bpm: 105, tokens: ["1970s studio production", "analog tape sound"] },
  "1980s": { bpm: 118, tokens: ["1980s production", "gated reverb drums", "analog synths"] },
  "1990s": { bpm: 112, tokens: ["1990s production", "sampled breakbeats"] },
  "2000s": { bpm: 115, tokens: ["2000s digital production", "radio-polished mix"] },
  "2010s": { bpm: 120, tokens: ["2010s production", "sidechained pads", "trap hi-hats"] },
  "2020s": { bpm: 122, tokens: ["2020s contemporary production", "hyper-detailed mix"] },
  "2030s": { bpm: 126, tokens: ["near-future production", "AI-flavored sound design"] },
  "far-future": { bpm: 132, tokens: ["far-future sound design", "post-human textures"] },
};
