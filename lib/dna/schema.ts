import { z } from "zod";

/**
 * Creative DNA — the single input state every generation path reads from.
 * Nothing generates from the raw seed prompt directly.
 *
 * Bipolar axes are signed −1..1: the SIGN says which pole (−1 = left/first-named
 * pole, +1 = right pole), the MAGNITUDE says how hard. 0 is neutral.
 * Style tokens live in lib/generation/styleTokens.ts, keyed by axis and pole —
 * never in this schema — so the vocabulary tunes between runs without a migration.
 *
 * Generated output is NOT part of the DNA. Keep flags are editing state and live
 * alongside the DNA in the client, not inside it. Provenance lives on artifacts.
 */

export const ERAS = [
  "far-past",
  "1950s",
  "1960s",
  "1970s",
  "1980s",
  "1990s",
  "2000s",
  "2010s",
  "2020s",
  "2030s",
  "far-future",
] as const;

const signedAxis = z.number().min(-1).max(1);

/** 7 bipolar axes. −1 = first pole, +1 = second pole. */
export const SonicPaletteSchema = z.object({
  pristineLofi: signedAxis, // pristine ←→ lo-fi
  sparseDense: signedAxis, // sparse ←→ dense
  coldWarm: signedAxis, // cold ←→ warm
  improvisedStructured: signedAxis, // improvised ←→ structured
  loudQuiet: signedAxis, // loud ←→ quiet
  organicSynthetic: signedAxis, // organic ←→ synthetic
  darkHopeful: signedAxis, // dark ←→ hopeful
});

export const InfluenceSchema = z.object({
  genre: z.string().min(1),
  weight: z.number().min(0).max(1),
});

const uniqueStrings = z
  .array(z.string().min(1))
  .refine((tags) => new Set(tags.map((t) => t.toLowerCase())).size === tags.length, {
    message: "tags must be unique",
  });

export const CreativeDNASchema = z.object({
  seedPrompt: z.string().min(1),
  /** Single ordinal index into ERAS. */
  era: z.number().int().min(0).max(ERAS.length - 1),
  /** Exactly 4 weighted genres; weights normalized to sum to 1. */
  influences: z
    .array(InfluenceSchema)
    .length(4)
    .refine((inf) => Math.abs(inf.reduce((s, i) => s + i.weight, 0) - 1) < 1e-6, {
      message: "influence weights must sum to 1",
    }),
  sonicPalette: SonicPaletteSchema,
  /** 2D pad: whispers(−1) ←→ screams(+1), clean(−1) ←→ damaged(+1). */
  vocalCharacter: z.object({
    whispersScreams: signedAxis,
    cleanDamaged: signedAxis,
  }),
  lyricalObsessions: uniqueStrings,
  visualStyle: uniqueStrings,
});

export type CreativeDNA = z.infer<typeof CreativeDNASchema>;
export type SonicPalette = z.infer<typeof SonicPaletteSchema>;
export type SonicAxis = keyof SonicPalette;

/** Rescale raw (possibly unnormalized) influence weights so they sum to 1. */
export function normalizeInfluences(
  influences: { genre: string; weight: number }[],
): { genre: string; weight: number }[] {
  const total = influences.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) {
    return influences.map((i) => ({ ...i, weight: 1 / influences.length }));
  }
  return influences.map((i) => ({ ...i, weight: i.weight / total }));
}
