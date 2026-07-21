import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { CreativeDNASchema } from "@/lib/dna/schema";
import { sql } from "@/lib/db";
import { BIO_PROVENANCE, IMAGE_PROVENANCE } from "@/lib/generation/generate";

export const maxDuration = 60;

/**
 * Save a finished artist to the roster: artist + dna_revision (rev 1, full
 * copy) + artifacts; media data URLs land in the media table and stream from
 * /api/media/[id]. Same schema as the seeds — no special casing anywhere.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dna = CreativeDNASchema.parse(body.dna);
    const identity = body.identity;
    const tracks: {
      position: number;
      title: string;
      lyricSeed: string;
      provenance: string[];
      audio: string;
    }[] = body.tracks;
    const singlePosition = Number(body.singlePosition);
    if (!identity?.name || !Array.isArray(tracks) || tracks.length === 0 || !singlePosition) {
      return NextResponse.json({ error: "Incomplete artist." }, { status: 400 });
    }

    const db = sql();
    const slug = await uniqueSlug(identity.name);
    const artistId = randomUUID();
    const revisionId = randomUUID();

    // Media was persisted at generation time; the client sends /api/media URLs.
    const mediaUrl = (value: string): string =>
      typeof value === "string" && value.startsWith("/api/media/") ? value : "";

    await db.query("INSERT INTO artists (id, slug, name, status) VALUES ($1, $2, $3, 'complete')", [
      artistId,
      slug,
      identity.name,
    ]);
    await db.query(
      "INSERT INTO dna_revisions (id, artist_id, rev, dna, note) VALUES ($1, $2, 1, $3, 'created in studio')",
      [revisionId, artistId, JSON.stringify(dna)],
    );

    const insertArtifact = async (
      kind: string,
      position: number,
      content: string,
      blobUrl: string,
      provenance: string[],
      metadata: object,
    ): Promise<string> => {
      const id = randomUUID();
      await db.query(
        `INSERT INTO artifacts (id, artist_id, revision_id, kind, position, content, blob_url, provenance, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, artistId, revisionId, kind, position, content, blobUrl, JSON.stringify(provenance), JSON.stringify(metadata)],
      );
      return id;
    };

    const portraitUrl = mediaUrl(String(body.portrait ?? ""));
    const coverUrl = mediaUrl(String(body.cover ?? ""));
    const trackUrls = tracks.map((t) => mediaUrl(t.audio));

    await insertArtifact("bio", 0, String(identity.bio ?? ""), "", BIO_PROVENANCE, {});
    await insertArtifact("portrait", 0, String(identity.portraitPrompt ?? ""), portraitUrl, IMAGE_PROVENANCE, {});
    await insertArtifact("cover", 0, String(identity.coverDescription ?? ""), coverUrl, IMAGE_PROVENANCE, {
      title: String(identity.coverTitle ?? ""),
    });

    let singleArtifactId: string | null = null;
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const id = await insertArtifact("track", t.position, t.lyricSeed, trackUrls[i], t.provenance ?? [], {
        title: t.title,
      });
      if (t.position === singlePosition) singleArtifactId = id;
    }

    await db.query(
      "UPDATE artists SET current_revision_id = $1, single_artifact_id = $2 WHERE id = $3",
      [revisionId, singleArtifactId, artistId],
    );

    return NextResponse.json({ slug });
  } catch (error) {
    console.error("save route failed:", error);
    return NextResponse.json(
      { error: "Saving didn't go through — your artist is still here; try again." },
      { status: 500 },
    );
  }
}

async function uniqueSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "artist";
  const db = sql();
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const existing = (await db.query("SELECT 1 FROM artists WHERE slug = $1", [candidate])) as
      | { rows?: unknown[] }
      | unknown[];
    const rows = Array.isArray(existing) ? existing : (existing.rows ?? []);
    if (rows.length === 0) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}
