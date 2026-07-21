import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { CreativeDNA } from "@/lib/dna/schema";
import {
  CreativeDNASchema,
  ERAS,
  SonicPaletteSchema,
  normalizeInfluences,
} from "@/lib/dna/schema";

/**
 * Claude drives all creative state: seed prompt → DNA (with visible artist-
 * reference stripping), artist identity text, per-track lyric seeds, and nudge
 * patches. Every function reads from the schema-validated DNA — never the raw
 * seed prompt directly (the seed prompt is itself a DNA field).
 */

const MODEL = "claude-opus-4-8";

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}

const signedAxis = z.number().min(-1).max(1);

/** How an artist/band reference in the seed prompt was interpreted — shown to the user. */
export interface ReferenceNote {
  original: string;
  styleSummary: string;
}

const SeedResponseSchema = z.object({
  referenceNotes: z.array(
    z.object({
      original: z.string(),
      styleSummary: z.string(),
    }),
  ),
  era: z.enum(ERAS),
  influences: z.array(z.object({ genre: z.string(), weight: z.number().min(0).max(1) })),
  sonicPalette: SonicPaletteSchema,
  vocalCharacter: z.object({ whispersScreams: signedAxis, cleanDamaged: signedAxis }),
  lyricalObsessions: z.array(z.string()),
  visualStyle: z.array(z.string()),
});

/**
 * Seed prompt → Creative DNA. Artist/band references are stripped and replaced
 * with a style summary; each substitution is returned so the UI can show it as
 * a feature, not a silent edit.
 */
export async function seedToDNA(
  seedPrompt: string,
): Promise<{ dna: CreativeDNA; referenceNotes: ReferenceNote[] }> {
  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: [
      "You translate a listener's free-text description of an imagined musical artist into Creative DNA controls.",
      "If the prompt references a real artist or band, do NOT carry the name into any output field. Substitute a concise summary of that artist's style, and record the substitution in referenceNotes (original = the referenced name, styleSummary = how you interpreted their style). If there are no references, return an empty referenceNotes array.",
      "Bipolar axes are signed -1..1: -1 is the first-named pole (pristine, sparse, cold, improvised, loud, organic, dark, whispers, clean), +1 the second (lo-fi, dense, warm, structured, quiet, synthetic, hopeful, screams, damaged), 0 neutral. Use the full range; timid mid-range values everywhere make the controls meaningless.",
      "Return exactly 4 influences with weights that roughly sum to 1, exactly 4 lyricalObsessions (short evocative noun phrases), and exactly 2 visualStyle tags.",
    ].join("\n"),
    messages: [{ role: "user", content: seedPrompt }],
    output_config: { format: zodOutputFormat(SeedResponseSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Claude returned an unparseable DNA response");

  const dna = CreativeDNASchema.parse({
    seedPrompt,
    era: ERAS.indexOf(parsed.era),
    influences: normalizeInfluences(parsed.influences.slice(0, 4)),
    sonicPalette: parsed.sonicPalette,
    vocalCharacter: parsed.vocalCharacter,
    lyricalObsessions: dedupe(parsed.lyricalObsessions).slice(0, 4),
    visualStyle: dedupe(parsed.visualStyle).slice(0, 2),
  });
  return { dna, referenceNotes: parsed.referenceNotes };
}

const IdentitySchema = z.object({
  name: z.string(),
  bio: z.string(),
  coverTitle: z.string(),
  coverDescription: z.string(),
  portraitPrompt: z.string(),
  coverPrompt: z.string(),
});
export type ArtistIdentity = z.infer<typeof IdentitySchema>;

/** DNA → artist name, bio, album cover description, and image prompts. */
export async function generateIdentity(dna: CreativeDNA): Promise<ArtistIdentity> {
  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: [
      "You are the creative director of AFAR Music, building a fully-realized AI artist from Creative DNA. Every artist needs a backstory a music fan could get obsessed with.",
      "Write: a distinctive artist name; a bio of 2-3 paragraphs with a concrete, evocative backstory consistent with every DNA field; an album title and one-paragraph cover description; and two image-generation prompts (portrait of the artist, album cover) that translate the visualStyle tags and era into concrete photographic/illustrative direction. Image prompts must not name real people or artists.",
    ].join("\n"),
    messages: [{ role: "user", content: dnaBrief(dna) }],
    output_config: { format: zodOutputFormat(IdentitySchema) },
  });
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Claude returned an unparseable identity response");
  return parsed;
}

const TrackSeedSchema = z.object({
  title: z.string(),
  lyricSeed: z.string(),
});
export type TrackSeed = z.infer<typeof TrackSeedSchema>;

/**
 * DNA → one track's title + lyric seed. The lyric seed is the ONLY prose that
 * reaches the music model's chunk text, so it must be lyrics — never direction.
 */
export async function generateTrackSeed(
  dna: CreativeDNA,
  position: number,
  existingTitles: string[] = [],
): Promise<TrackSeed> {
  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 2048,
    system: [
      "You write song material for an AI artist. Return a track title and a lyricSeed.",
      "The lyricSeed is sung verbatim by a music model over a 30-second track: it must be pure lyrics (no stage direction, no section labels), at most 170 characters, built from the artist's lyrical obsessions and mood.",
      "Each track for an artist should be a distinct song, not a variation of the same one.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: `${dnaBrief(dna)}\n\nTrack ${position} of 3.${
          existingTitles.length > 0 ? ` Existing track titles: ${existingTitles.join(", ")}.` : ""
        }`,
      },
    ],
    output_config: { format: zodOutputFormat(TrackSeedSchema) },
  });
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Claude returned an unparseable track seed");
  return parsed;
}

const TrackSeedsSchema = z.object({ tracks: z.array(TrackSeedSchema) });

/**
 * DNA → all three candidate track seeds in ONE Claude call, so the songs are
 * distinct and coherent with each other; audio generation then parallelizes.
 */
export async function generateTrackSeeds(dna: CreativeDNA): Promise<TrackSeed[]> {
  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 2048,
    system: [
      "You write song material for an AI artist. Return exactly 3 tracks, each with a title and a lyricSeed.",
      "Each lyricSeed is sung verbatim by a music model over a 30-second track: pure lyrics (no stage direction, no section labels), at most 170 characters, built from the artist's lyrical obsessions and mood.",
      "The three tracks must be three distinct songs — different angles on the artist, not variations of one song.",
    ].join("\n"),
    messages: [{ role: "user", content: dnaBrief(dna) }],
    output_config: { format: zodOutputFormat(TrackSeedsSchema) },
  });
  const parsed = response.parsed_output;
  if (!parsed || parsed.tracks.length < 3) {
    throw new Error("Claude returned an unparseable or incomplete track seed set");
  }
  return parsed.tracks.slice(0, 3);
}

const NudgePatchSchema = z.object({
  explanation: z.string(),
  era: z.enum(ERAS).nullable(),
  influences: z
    .array(z.object({ genre: z.string(), weight: z.number().min(0).max(1) }))
    .nullable(),
  sonicPalette: SonicPaletteSchema.partial().nullable(),
  vocalCharacter: z
    .object({ whispersScreams: signedAxis, cleanDamaged: signedAxis })
    .partial()
    .nullable(),
  lyricalObsessions: z.array(z.string()).nullable(),
  visualStyle: z.array(z.string()).nullable(),
});

/**
 * Freeform nudge → a PATCH to the DNA, not a fresh object. Null fields are
 * untouched; the merged result is validated and returned with Claude's
 * explanation so the moved controls are legible.
 */
export async function nudgeDNA(
  dna: CreativeDNA,
  instruction: string,
): Promise<{ dna: CreativeDNA; explanation: string }> {
  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 2048,
    system: [
      "You adjust an AI artist's Creative DNA according to a freeform instruction. Return a MINIMAL patch: set a field only if the instruction implies changing it, otherwise return null for it. sonicPalette and vocalCharacter patches may be partial (only the axes that move).",
      "Bipolar axes are signed -1..1 (-1 = first pole, +1 = second pole). Explain in one or two sentences how you interpreted the instruction.",
    ].join("\n"),
    messages: [
      { role: "user", content: `${dnaBrief(dna)}\n\nInstruction: ${instruction}` },
    ],
    output_config: { format: zodOutputFormat(NudgePatchSchema) },
  });
  const patch = response.parsed_output;
  if (!patch) throw new Error("Claude returned an unparseable nudge patch");

  const merged = CreativeDNASchema.parse({
    ...dna,
    era: patch.era !== null ? ERAS.indexOf(patch.era) : dna.era,
    influences:
      patch.influences !== null
        ? normalizeInfluences(patch.influences.slice(0, 4))
        : dna.influences,
    sonicPalette: { ...dna.sonicPalette, ...(patch.sonicPalette ?? {}) },
    vocalCharacter: { ...dna.vocalCharacter, ...(patch.vocalCharacter ?? {}) },
    lyricalObsessions:
      patch.lyricalObsessions !== null ? dedupe(patch.lyricalObsessions) : dna.lyricalObsessions,
    visualStyle: patch.visualStyle !== null ? dedupe(patch.visualStyle) : dna.visualStyle,
  });
  return { dna: merged, explanation: patch.explanation };
}

/** Render the DNA as a compact brief for creative prompts. */
export function dnaBrief(dna: CreativeDNA): string {
  const palette = Object.entries(dna.sonicPalette)
    .map(([axis, v]) => `${axis}: ${v.toFixed(2)}`)
    .join(", ");
  return [
    `Seed prompt: ${dna.seedPrompt}`,
    `Era: ${ERAS[dna.era]}`,
    `Influences: ${dna.influences.map((i) => `${i.genre} (${i.weight.toFixed(2)})`).join(", ")}`,
    `Sonic palette (-1 first pole, +1 second pole): ${palette}`,
    `Vocal character: whispers↔screams ${dna.vocalCharacter.whispersScreams.toFixed(2)}, clean↔damaged ${dna.vocalCharacter.cleanDamaged.toFixed(2)}`,
    `Lyrical obsessions: ${dna.lyricalObsessions.join(", ")}`,
    `Visual style: ${dna.visualStyle.join(", ")}`,
  ].join("\n");
}

function dedupe(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
