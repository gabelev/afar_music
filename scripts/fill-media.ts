import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { CreativeDNASchema } from "../lib/dna/schema";
import { generateTrackSeeds } from "../lib/generation/claude";
import { generateImage } from "../lib/generation/images";
import { buildCompositionPlan } from "../lib/generation/mapping";
import { generateTrack } from "../lib/generation/music";

/**
 * Fill real media into dry-run fixtures, reusing the already-reviewed text:
 * lyric seeds become audio via the composition-plan mapping, and the stored
 * image prompts become portrait/cover. Per-artist calls run in parallel.
 *
 *   npm run fill-media -- <slug> [<slug> ...]
 *
 * --reseed-tracks regenerates titles + lyric seeds with Claude first (use
 * after a lyric-format change); --tracks-only skips the image jobs (use when
 * the mapping changed but the visual identity didn't).
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "reseed-tracks": { type: "boolean", default: false },
    "tracks-only": { type: "boolean", default: false },
  },
});
if (positionals.length === 0) {
  console.error("Usage: npm run fill-media -- [--reseed-tracks] [--tracks-only] <slug> [<slug> ...]");
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

  const trackJobs = values["reseed-tracks"]
    ? (await generateTrackSeeds(dna)).map((seed, i) =>
        materializeTrack(dir, `track-${i + 1}`, dna, seed),
      )
    : readdirSync(join(dir, "tracks"))
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
          const track = JSON.parse(readFileSync(join(dir, "tracks", f), "utf8"));
          return materializeTrack(dir, f.replace(/\.json$/, ""), dna, {
            title: track.title,
            lyricSeed: track.lyricSeed,
          });
        });

  const imageJobs = values["tracks-only"]
    ? []
    : [
        generateImage(dna, "portrait", identity.portraitPrompt).then((img) =>
          writeFileSync(join(dir, "portrait.jpg"), img),
        ),
        generateImage(dna, "cover", identity.coverPrompt).then((img) =>
          writeFileSync(join(dir, "cover.jpg"), img),
        ),
      ];

  await Promise.all([...trackJobs, ...imageJobs]);
  const images = values["tracks-only"] ? "" : " + portrait + cover";
  console.log(`${slug}: ${trackJobs.length} tracks${images} (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
}

/** Build the plan, generate audio, and write the full track artifact (json + mp3). */
async function materializeTrack(
  dir: string,
  name: string,
  dna: ReturnType<typeof CreativeDNASchema.parse>,
  seed: { title: string; lyricSeed: string },
) {
  const plan = buildCompositionPlan(dna, seed.lyricSeed);
  const generated = await generateTrack(plan.plan);
  writeFileSync(join(dir, "tracks", `${name}.mp3`), generated.audio);
  writeFileSync(
    join(dir, "tracks", `${name}.json`),
    JSON.stringify(
      {
        title: seed.title,
        lyricSeed: seed.lyricSeed,
        compositionPlan: plan.plan,
        contextAdherence: plan.contextAdherence,
        provenance: plan.provenance,
        metadata: generated.metadata,
      },
      null,
      2,
    ),
  );
}
