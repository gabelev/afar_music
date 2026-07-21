import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { neon } from "@neondatabase/serverless";
import { CreativeDNASchema } from "../lib/dna/schema";
import { BIO_PROVENANCE, IMAGE_PROVENANCE } from "../lib/generation/generate";

/**
 * Seed the database from committed fixtures produced by scripts/generate.ts.
 * Media uploads to Vercel Blob; rows are ordinary artists in the same schema
 * the app writes — no demo-mode branching anywhere.
 *
 *   npm run seed                      # seeds every artist under fixtures/
 *   npm run seed -- --only <slug>     # one artist
 *
 * Re-seeding a slug replaces that artist (delete + insert), so the script is
 * safe to re-run after regenerating a fixture.
 */

const { values } = parseArgs({
  options: {
    dir: { type: "string", default: "fixtures" },
    only: { type: "string" },
  },
});

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (run via: npm run seed)");
  process.exit(1);
}
const sql = neon(url);
const fixturesDir = values.dir ?? "fixtures";

const slugs = readdirSync(fixturesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((slug) => !values.only || slug === values.only);

if (slugs.length === 0) {
  console.error(`No fixture artists found in ${fixturesDir}/`);
  process.exit(1);
}

for (const slug of slugs) {
  await seedArtist(slug);
}
console.log(`\nSeeded ${slugs.length} artist(s).`);

async function seedArtist(slug: string) {
  const dir = join(fixturesDir, slug);
  const dna = CreativeDNASchema.parse(JSON.parse(readFileSync(join(dir, "dna.json"), "utf8")));
  const artistMeta = JSON.parse(readFileSync(join(dir, "artist.json"), "utf8"));
  const identity = artistMeta.identity;

  console.log(`\nSeeding ${identity.name} (${slug})...`);

  const artistId = randomUUID();
  const revisionId = randomUUID();

  // Seed assets are committed to the repo and served statically from public/
  // (docs/SPEC.md). Live-generated media goes to Vercel Blob; this column just
  // holds a URL either way, so components stay uniform.
  const trackFiles = readdirSync(join(dir, "tracks")).filter((f) => f.endsWith(".json"));
  const blobUrls: Record<string, string> = {};
  mkdirSync(join("public", "artists", slug, "tracks"), { recursive: true });

  const copyIf = (label: string, path: string) => {
    if (!existsSync(path)) return;
    copyFileSync(path, join("public", "artists", slug, label));
    blobUrls[label] = `/artists/${slug}/${label}`;
  };

  // Fixtures may carry either extension (early runs wrote PNG, later JPEG).
  copyIf("portrait.png", join(dir, "portrait.png"));
  copyIf("portrait.jpg", join(dir, "portrait.jpg"));
  copyIf("cover.png", join(dir, "cover.png"));
  copyIf("cover.jpg", join(dir, "cover.jpg"));
  for (const f of trackFiles) {
    const mp3 = f.replace(/\.json$/, ".mp3");
    copyIf(`tracks/${mp3}`, join(dir, "tracks", mp3));
  }

  // Replace any prior seed of this slug, then insert.
  await sql.query("DELETE FROM artists WHERE slug = $1", [slug]);
  await sql.query(
    "INSERT INTO artists (id, slug, name, status) VALUES ($1, $2, $3, 'complete')",
    [artistId, slug, identity.name],
  );
  await sql.query(
    "INSERT INTO dna_revisions (id, artist_id, rev, dna, note) VALUES ($1, $2, 1, $3, 'seed')",
    [revisionId, artistId, JSON.stringify(dna)],
  );

  const insertArtifact = (
    kind: string,
    position: number,
    content: string,
    blobUrl: string,
    provenance: string[],
    metadata: object,
  ) => {
    const id = randomUUID();
    return sql
      .query(
        `INSERT INTO artifacts (id, artist_id, revision_id, kind, position, content, blob_url, provenance, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          artistId,
          revisionId,
          kind,
          position,
          content,
          blobUrl,
          JSON.stringify(provenance),
          JSON.stringify(metadata),
        ],
      )
      .then(() => id);
  };

  await insertArtifact("bio", 0, identity.bio, "", BIO_PROVENANCE, {});
  await insertArtifact(
    "portrait",
    0,
    identity.portraitPrompt,
    blobUrls["portrait.png"] ?? blobUrls["portrait.jpg"] ?? "",
    IMAGE_PROVENANCE,
    {},
  );
  await insertArtifact(
    "cover",
    0,
    identity.coverDescription,
    blobUrls["cover.png"] ?? blobUrls["cover.jpg"] ?? "",
    IMAGE_PROVENANCE,
    { title: identity.coverTitle },
  );

  let singleArtifactId: string | null = null;
  const singlePosition: number = artistMeta.single ?? 1;
  for (const f of trackFiles.sort()) {
    const track = JSON.parse(readFileSync(join(dir, "tracks", f), "utf8"));
    const position = Number(f.match(/track-(\d+)/)?.[1] ?? 0);
    const id = await insertArtifact(
      "track",
      position,
      track.lyricSeed,
      blobUrls[`tracks/track-${position}.mp3`] ?? "",
      track.provenance ?? [],
      {
        title: track.title,
        compositionPlan: track.compositionPlan,
        contextAdherence: track.contextAdherence,
      },
    );
    if (position === singlePosition) singleArtifactId = id;
  }

  await sql.query(
    "UPDATE artists SET current_revision_id = $1, single_artifact_id = $2 WHERE id = $3",
    [revisionId, singleArtifactId, artistId],
  );
  console.log(`  ${trackFiles.length} tracks, single = track ${singlePosition}`);
}
