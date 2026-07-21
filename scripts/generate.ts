import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { generateFullArtist } from "../lib/generation/generate";

/**
 * CLI entry point for the generation pipeline.
 *
 *   npm run generate -- --prompt "a rain-soaked synthpop recluse" --dry-run
 *   npm run generate -- --prompt "..." --out fixtures
 *
 * --dry-run stubs the media APIs (no audio, no images) and only calls Claude,
 * so prompt iteration costs cents and runs in a terminal.
 */

const { values } = parseArgs({
  options: {
    prompt: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    out: { type: "string", default: "fixtures" },
  },
});

if (!values.prompt) {
  console.error('Usage: npm run generate -- --prompt "<artist description>" [--dry-run] [--out dir]');
  process.exit(1);
}

const dryRun = values["dry-run"] ?? false;
console.log(`Generating artist${dryRun ? " (dry run — media APIs stubbed)" : ""}...`);
const startedAt = Date.now();

const artist = await generateFullArtist(values.prompt, { dryRun });

const slug = artist.profile.identity.name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
const dir = join(values.out ?? "fixtures", slug);
mkdirSync(join(dir, "tracks"), { recursive: true });

writeFileSync(join(dir, "dna.json"), JSON.stringify(artist.dna, null, 2));
writeFileSync(
  join(dir, "artist.json"),
  JSON.stringify(
    {
      identity: artist.profile.identity,
      referenceNotes: artist.referenceNotes,
      portraitProvenance: artist.profile.portrait.provenance,
      coverProvenance: artist.profile.cover.provenance,
    },
    null,
    2,
  ),
);

for (const t of artist.tracks) {
  writeFileSync(
    join(dir, "tracks", `track-${t.position}.json`),
    JSON.stringify(
      {
        title: t.seed.title,
        lyricSeed: t.seed.lyricSeed,
        compositionPlan: t.plan.plan,
        contextAdherence: t.plan.contextAdherence,
        provenance: t.plan.provenance,
        metadata: t.track?.metadata ?? null,
      },
      null,
      2,
    ),
  );
  if (t.track) {
    writeFileSync(join(dir, "tracks", `track-${t.position}.mp3`), t.track.audio);
  }
}
if (artist.profile.portrait.image) {
  writeFileSync(join(dir, "portrait.png"), artist.profile.portrait.image);
}
if (artist.profile.cover.image) {
  writeFileSync(join(dir, "cover.png"), artist.profile.cover.image);
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\n${artist.profile.identity.name} → ${dir} (${elapsed}s)`);
if (artist.referenceNotes.length > 0) {
  console.log("\nReference interpretations (surfaced, not silent):");
  for (const note of artist.referenceNotes) {
    console.log(`  "${note.original}" → ${note.styleSummary}`);
  }
}
for (const t of artist.tracks) {
  console.log(`  Track ${t.position}: ${t.seed.title} [adherence: ${t.plan.contextAdherence}]`);
}
