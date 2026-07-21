import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { CreativeDNASchema } from "../lib/dna/schema";
import { generateImage } from "../lib/generation/images";
import { buildCompositionPlan } from "../lib/generation/mapping";
import { generateTrack } from "../lib/generation/music";

/**
 * Fill real media into dry-run fixtures, reusing the already-reviewed text:
 * lyric seeds become audio via the composition-plan mapping, and the stored
 * image prompts become portrait/cover. Per-artist calls run in parallel.
 *
 *   npm run fill-media -- <slug> [<slug> ...]
 */

const { positionals } = parseArgs({ allowPositionals: true, options: {} });
if (positionals.length === 0) {
  console.error("Usage: npm run fill-media -- <slug> [<slug> ...]");
  process.exit(1);
}

for (const slug of positionals) {
  await fillArtist(slug);
}

async function fillArtist(slug: string) {
  const dir = join("fixtures", slug);
  const dna = CreativeDNASchema.parse(JSON.parse(readFileSync(join(dir, "dna.json"), "utf8")));
  const identity = JSON.parse(readFileSync(join(dir, "artist.json"), "utf8")).identity;
  const startedAt = Date.now();

  const trackJobs = readdirSync(join(dir, "tracks"))
    .filter((f) => f.endsWith(".json"))
    .map(async (f) => {
      const trackPath = join(dir, "tracks", f);
      const track = JSON.parse(readFileSync(trackPath, "utf8"));
      const plan = buildCompositionPlan(dna, track.lyricSeed);
      const generated = await generateTrack(plan.plan);
      writeFileSync(trackPath.replace(/\.json$/, ".mp3"), generated.audio);
      writeFileSync(
        trackPath,
        JSON.stringify({ ...track, metadata: generated.metadata }, null, 2),
      );
      return f;
    });

  const imageJobs = [
    generateImage(dna, "portrait", identity.portraitPrompt).then((img) =>
      writeFileSync(join(dir, "portrait.jpg"), img),
    ),
    generateImage(dna, "cover", identity.coverPrompt).then((img) =>
      writeFileSync(join(dir, "cover.jpg"), img),
    ),
  ];

  await Promise.all([...trackJobs, ...imageJobs]);
  console.log(`${slug}: 3 tracks + portrait + cover (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
}
