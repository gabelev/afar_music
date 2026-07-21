import type { CreativeDNA, SonicAxis } from "@/lib/dna/schema";
import { ERAS } from "@/lib/dna/schema";
import { AXIS_TOKENS, ERA_STYLES, VOCAL_TOKENS } from "./styleTokens";

/**
 * DNA → ElevenLabs composition plan. Structural levers, not adjectives:
 * bipolar sliders emit BOTH positive and negative global styles (sign picks the
 * pole, magnitude picks how many tokens), era sets BPM + production tokens,
 * influence weights set token counts per genre, the vocal pad emits vocal
 * tokens, and improvised↔structured maps to the context_adherence enum.
 *
 * Verified API facts (docs/SPEC.md "Music API facts"):
 * - ONE 30s chunk; chunk text is LYRICS ONLY, clamped to 180 chars at a word
 *   boundary; context_adherence is an enum; respect_sections_durations false.
 */

/** Below this magnitude an axis is considered neutral and contributes nothing. */
const NEUTRAL_DEADZONE = 0.15;
export const LYRICS_MAX_CHARS = 180;
export const TRACK_DURATION_MS = 30_000;

export type ContextAdherence = "low" | "medium" | "high";

export interface CompositionPlan {
  positive_global_styles: string[];
  negative_global_styles: string[];
  chunks: { text: string; duration_ms: number }[];
}

export interface PlanWithProvenance {
  plan: CompositionPlan;
  contextAdherence: ContextAdherence;
  /** DNA field paths that contributed tokens — stored on the track artifact. */
  provenance: string[];
}

/** Take the strongest `count` tokens for a magnitude in (0,1]. */
function takeByMagnitude(tokens: readonly string[], magnitude: number): string[] {
  const count = Math.min(tokens.length, Math.ceil(Math.abs(magnitude) * tokens.length));
  return tokens.slice(0, count);
}

/**
 * One bipolar value → tokens for the active pole (goes to positive styles) and
 * tokens for the opposing pole (goes to negative styles).
 */
export function mapBipolarAxis(
  value: number,
  poles: { left: readonly string[]; right: readonly string[] },
): { positive: string[]; negative: string[] } {
  if (Math.abs(value) < NEUTRAL_DEADZONE) return { positive: [], negative: [] };
  const active = value < 0 ? poles.left : poles.right;
  const opposing = value < 0 ? poles.right : poles.left;
  return {
    positive: takeByMagnitude(active, value),
    negative: takeByMagnitude(opposing, value),
  };
}

/** Influence weight → how many style tokens that genre contributes (0–4). */
export function influenceTokens(genre: string, weight: number): string[] {
  const candidates = [
    genre,
    `${genre} instrumentation`,
    `${genre} rhythms`,
    `${genre} songwriting sensibility`,
  ];
  const count = Math.min(candidates.length, Math.round(weight * 4));
  return candidates.slice(0, count);
}

/** improvised↔structured in thirds → the context_adherence enum. */
export function contextAdherenceFor(improvisedStructured: number): ContextAdherence {
  if (improvisedStructured < -1 / 3) return "low";
  if (improvisedStructured <= 1 / 3) return "medium";
  return "high";
}

/** Clamp lyrics to LYRICS_MAX_CHARS at a word boundary (>200 chars 500s the API). */
export function clampLyrics(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= LYRICS_MAX_CHARS) return trimmed;
  const cut = trimmed.slice(0, LYRICS_MAX_CHARS + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, LYRICS_MAX_CHARS)).trimEnd();
}

/**
 * Build the full composition plan for one track.
 * `lyricSeed` comes from Claude (driven by lyricalObsessions + mood); it is the
 * only prose that lands in chunk text — all direction lives in the style arrays.
 */
export function buildCompositionPlan(dna: CreativeDNA, lyricSeed: string): PlanWithProvenance {
  const positive: string[] = [];
  const negative: string[] = [];
  const provenance: string[] = [];

  const era = ERAS[dna.era];
  const eraStyle = ERA_STYLES[era];
  positive.push(`${eraStyle.bpm} BPM`, ...eraStyle.tokens);
  provenance.push("era");

  for (const influence of dna.influences) {
    const tokens = influenceTokens(influence.genre, influence.weight);
    if (tokens.length > 0) {
      positive.push(...tokens);
      provenance.push(`influences.${influence.genre}`);
    }
  }

  for (const axis of Object.keys(AXIS_TOKENS) as SonicAxis[]) {
    const mapped = mapBipolarAxis(dna.sonicPalette[axis], AXIS_TOKENS[axis]);
    if (mapped.positive.length > 0 || mapped.negative.length > 0) {
      positive.push(...mapped.positive);
      negative.push(...mapped.negative);
      provenance.push(`sonicPalette.${axis}`);
    }
  }

  for (const padAxis of ["whispersScreams", "cleanDamaged"] as const) {
    const mapped = mapBipolarAxis(dna.vocalCharacter[padAxis], VOCAL_TOKENS[padAxis]);
    if (mapped.positive.length > 0 || mapped.negative.length > 0) {
      positive.push(...mapped.positive);
      negative.push(...mapped.negative);
      provenance.push(`vocalCharacter.${padAxis}`);
    }
  }

  if (lyricSeed.trim().length > 0) provenance.push("lyricalObsessions");

  return {
    plan: {
      positive_global_styles: [...new Set(positive)],
      negative_global_styles: [...new Set(negative)],
      chunks: [{ text: clampLyrics(lyricSeed), duration_ms: TRACK_DURATION_MS }],
    },
    contextAdherence: contextAdherenceFor(dna.sonicPalette.improvisedStructured),
    provenance,
  };
}
