import { NextResponse } from "next/server";
import { CreativeDNASchema } from "@/lib/dna/schema";
import { storeMedia } from "@/lib/db/media";
import { generateCandidateTracks, regenerateTrack } from "@/lib/generation/generate";
import { MusicPromptError } from "@/lib/generation/music";

export const maxDuration = 60;

/**
 * Wave 1 — POST { dna } → { tracks: [{position, title, lyricSeed, provenance, audio}] }
 * Per-artifact — POST { dna, regenerate: { position, existingTitles } } → { tracks: [one] }
 * Audio travels as data URLs so nothing is persisted until the user saves.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dna = CreativeDNASchema.parse(body.dna);
    const artifacts = body.regenerate
      ? [
          await regenerateTrack(
            dna,
            Number(body.regenerate.position),
            (body.regenerate.existingTitles ?? []).map(String),
          ),
        ]
      : await generateCandidateTracks(dna);

    return NextResponse.json({
      tracks: await Promise.all(
        artifacts.map(async (t) => ({
          position: t.position,
          title: t.seed.title,
          lyricSeed: t.seed.lyricSeed,
          provenance: t.plan.provenance,
          contextAdherence: t.plan.contextAdherence,
          audio: t.track ? await storeMedia(t.track.audio, t.track.contentType) : "",
        })),
      ),
    });
  } catch (error) {
    if (error instanceof MusicPromptError) {
      // Copyright belt-and-braces: surface the API's suggestion visibly.
      return NextResponse.json(
        {
          error: "The music model flagged a copyrighted reference.",
          suggestion: error.suggestion,
        },
        { status: 422 },
      );
    }
    console.error("tracks route failed:", error);
    return NextResponse.json(
      { error: "Track generation hit a snag — the roster is still fully playable while we recover." },
      { status: 500 },
    );
  }
}
