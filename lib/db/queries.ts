import { CreativeDNASchema, type CreativeDNA } from "@/lib/dna/schema";
import { sql } from "./index";

/**
 * Typed read queries. Seeded and live-created artists are the same rows —
 * every page renders through these with no demo-mode branching.
 */

export interface ArtistSummary {
  id: string;
  slug: string;
  name: string;
  dna: CreativeDNA;
  portraitUrl: string;
  genres: string[];
  era: number;
}

export interface Track {
  id: string;
  position: number;
  title: string;
  lyricSeed: string;
  audioUrl: string;
  provenance: string[];
  isSingle: boolean;
}

export interface ArtistDetail extends ArtistSummary {
  bio: string;
  bioProvenance: string[];
  coverUrl: string;
  coverTitle: string;
  coverDescription: string;
  tracks: Track[];
}

interface ArtifactRow {
  id: string;
  kind: string;
  position: number;
  content: string;
  blob_url: string;
  provenance: string[];
  metadata: Record<string, unknown>;
}

export async function listArtists(): Promise<ArtistSummary[]> {
  const rows = (await sql().query(
    `SELECT a.id, a.slug, a.name, r.dna,
            (SELECT blob_url FROM artifacts p WHERE p.artist_id = a.id AND p.kind = 'portrait' AND p.revision_id = a.current_revision_id LIMIT 1) AS portrait_url
     FROM artists a
     JOIN dna_revisions r ON r.id = a.current_revision_id
     WHERE a.status = 'complete'
     ORDER BY a.created_at ASC`,
  )) as { rows?: Record<string, unknown>[] } | Record<string, unknown>[];
  const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
  return list.map((row) => {
    const dna = CreativeDNASchema.parse(row.dna);
    return {
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string,
      dna,
      portraitUrl: (row.portrait_url as string) ?? "",
      genres: dna.influences.map((i) => i.genre),
      era: dna.era,
    };
  });
}

export async function getArtist(slug: string): Promise<ArtistDetail | null> {
  const artistRes = (await sql().query(
    `SELECT a.id, a.slug, a.name, a.single_artifact_id, r.dna
     FROM artists a JOIN dna_revisions r ON r.id = a.current_revision_id
     WHERE a.slug = $1`,
    [slug],
  )) as { rows?: Record<string, unknown>[] } | Record<string, unknown>[];
  const artists = Array.isArray(artistRes) ? artistRes : (artistRes.rows ?? []);
  if (artists.length === 0) return null;
  const artist = artists[0];
  const dna = CreativeDNASchema.parse(artist.dna);

  const artifactRes = (await sql().query(
    `SELECT id, kind, position, content, blob_url, provenance, metadata
     FROM artifacts WHERE artist_id = $1 ORDER BY kind, position`,
    [artist.id],
  )) as { rows?: ArtifactRow[] } | ArtifactRow[];
  const artifacts = (Array.isArray(artifactRes) ? artifactRes : (artifactRes.rows ?? [])) as ArtifactRow[];

  const bio = artifacts.find((a) => a.kind === "bio");
  const portrait = artifacts.find((a) => a.kind === "portrait");
  const cover = artifacts.find((a) => a.kind === "cover");
  const tracks = artifacts
    .filter((a) => a.kind === "track")
    .sort((a, b) => a.position - b.position)
    .map((a) => ({
      id: a.id,
      position: a.position,
      title: String(a.metadata?.title ?? `Track ${a.position}`),
      lyricSeed: a.content,
      audioUrl: a.blob_url,
      provenance: a.provenance ?? [],
      isSingle: a.id === artist.single_artifact_id,
    }));

  return {
    id: artist.id as string,
    slug: artist.slug as string,
    name: artist.name as string,
    dna,
    portraitUrl: portrait?.blob_url ?? "",
    genres: dna.influences.map((i) => i.genre),
    era: dna.era,
    bio: bio?.content ?? "",
    bioProvenance: bio?.provenance ?? [],
    coverUrl: cover?.blob_url ?? "",
    coverTitle: String(cover?.metadata?.title ?? ""),
    coverDescription: cover?.content ?? "",
    tracks,
  };
}
