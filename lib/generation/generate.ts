import type { CreativeDNA } from "@/lib/dna/schema";
import type { ArtistIdentity, ReferenceNote, TrackSeed } from "./claude";
import {
  generateIdentity,
  generateTrackSeed,
  generateTrackSeeds,
  seedToDNA,
} from "./claude";
import { generateImage } from "./images";
import type { PlanWithProvenance } from "./mapping";
import { buildCompositionPlan } from "./mapping";
import type { GeneratedTrack } from "./music";
import { generateTrack } from "./music";

/**
 * Pure generation module: DNA in, artifacts out. No storage, no web concerns —
 * the CLI and the web app both build on these functions.
 *
 * Latency: calls parallelize WITHIN a wave (Promise.all). Wave 1 (3 candidate
 * tracks) and wave 2 (identity + images) are sequential only as a product
 * decision — the user's single pick must be real.
 */

export interface GenerationOptions {
  /** Stub the media APIs (music, images); only Claude runs. Costs cents. */
  dryRun?: boolean;
}

export interface TrackArtifact {
  position: number;
  seed: TrackSeed;
  plan: PlanWithProvenance;
  /** Absent in dry runs. */
  track?: GeneratedTrack;
}

export interface ImageArtifact {
  kind: "portrait" | "cover";
  provenance: string[];
  /** Absent in dry runs. */
  image?: Buffer;
}

/** DNA fields that drive the text and image artifacts. */
export const BIO_PROVENANCE = ["seedPrompt", "era", "influences", "lyricalObsessions"];
export const IMAGE_PROVENANCE = ["era", "visualStyle"];

/** Wave 1: three candidate tracks. One Claude call for coherent distinct seeds, then audio in parallel. */
export async function generateCandidateTracks(
  dna: CreativeDNA,
  options: GenerationOptions = {},
): Promise<TrackArtifact[]> {
  const seeds = await generateTrackSeeds(dna);
  return Promise.all(
    seeds.map((seed, i) => materializeTrack(dna, seed, i + 1, options)),
  );
}

/** Per-artifact regenerate: one new track against the current DNA, nothing else disturbed. */
export async function regenerateTrack(
  dna: CreativeDNA,
  position: number,
  existingTitles: string[],
  options: GenerationOptions = {},
): Promise<TrackArtifact> {
  const seed = await generateTrackSeed(dna, position, existingTitles);
  return materializeTrack(dna, seed, position, options);
}

async function materializeTrack(
  dna: CreativeDNA,
  seed: TrackSeed,
  position: number,
  options: GenerationOptions,
): Promise<TrackArtifact> {
  const plan = buildCompositionPlan(dna, seed.lyricSeed);
  if (options.dryRun) return { position, seed, plan };
  const track = await generateTrack(plan.plan, plan.contextAdherence);
  return { position, seed, plan, track };
}

export interface ArtistProfile {
  identity: ArtistIdentity;
  portrait: ImageArtifact;
  cover: ImageArtifact;
}

/** Wave 2: identity text, then portrait + cover in parallel. */
export async function generateProfile(
  dna: CreativeDNA,
  options: GenerationOptions = {},
): Promise<ArtistProfile> {
  const identity = await generateIdentity(dna);
  const [portrait, cover] = await Promise.all([
    materializeImage(dna, "portrait", identity.portraitPrompt, options),
    materializeImage(dna, "cover", identity.coverPrompt, options),
  ]);
  return { identity, portrait, cover };
}

/** Per-artifact regenerate for a single image against the current DNA. */
export async function regenerateImage(
  dna: CreativeDNA,
  kind: "portrait" | "cover",
  basePrompt: string,
  options: GenerationOptions = {},
): Promise<ImageArtifact> {
  return materializeImage(dna, kind, basePrompt, options);
}

async function materializeImage(
  dna: CreativeDNA,
  kind: "portrait" | "cover",
  basePrompt: string,
  options: GenerationOptions,
): Promise<ImageArtifact> {
  if (options.dryRun) return { kind, provenance: IMAGE_PROVENANCE };
  const image = await generateImage(dna, kind, basePrompt);
  return { kind, provenance: IMAGE_PROVENANCE, image };
}

export interface FullArtist {
  dna: CreativeDNA;
  referenceNotes: ReferenceNote[];
  profile: ArtistProfile;
  tracks: TrackArtifact[];
}

/**
 * End-to-end for the CLI/seeding path (no human pick mid-way): DNA, then
 * profile and candidate tracks concurrently.
 */
export async function generateFullArtist(
  seedPrompt: string,
  options: GenerationOptions = {},
): Promise<FullArtist> {
  const { dna, referenceNotes } = await seedToDNA(seedPrompt);
  const [profile, tracks] = await Promise.all([
    generateProfile(dna, options),
    generateCandidateTracks(dna, options),
  ]);
  return { dna, referenceNotes, profile, tracks };
}
