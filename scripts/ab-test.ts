import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { CreativeDNASchema } from "../lib/dna/schema";
import { buildCompositionPlan, clampLyrics } from "../lib/generation/mapping";
import { generateTrack } from "../lib/generation/music";

/**
 * Hour-one verification (docs/SPEC.md): prove the sliders reach the audio.
 *
 * Generate a track from a DNA file, optionally forcing one axis:
 *   npm run ab-test -- --dna fixtures/x/dna.json --lyrics "..." --out organic.mp3 --set organicSynthetic=-1
 *
 * Measure mean 85% spectral rolloff (proxy for the organic↔synthetic axis):
 *   npm run ab-test -- --measure organic.mp3 synthetic.mp3
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    dna: { type: "string" },
    lyrics: { type: "string" },
    out: { type: "string" },
    set: { type: "string", multiple: true, default: [] },
    measure: { type: "boolean", default: false },
  },
});

if (values.measure) {
  for (const file of positionals) {
    console.log(`${file}: mean 85% spectral rolloff = ${rolloff(file).toFixed(0)} Hz`);
  }
  process.exit(0);
}

if (!values.dna || !values.lyrics || !values.out) {
  console.error("Usage: --dna <dna.json> --lyrics <text> --out <file.mp3> [--set axis=value ...] | --measure <a.mp3> <b.mp3>");
  process.exit(1);
}

const dna = CreativeDNASchema.parse(JSON.parse(readFileSync(values.dna, "utf8")));
for (const override of values.set ?? []) {
  const [axis, raw] = override.split("=");
  const value = Number(raw);
  if (!(axis in dna.sonicPalette) || Number.isNaN(value)) {
    console.error(`Bad --set override: ${override}`);
    process.exit(1);
  }
  dna.sonicPalette[axis as keyof typeof dna.sonicPalette] = value;
}

const plan = buildCompositionPlan(dna, clampLyrics(values.lyrics));
console.log("positive:", plan.plan.positive_global_styles.join(" | "));
console.log("negative:", plan.plan.negative_global_styles.join(" | "));
console.log(`context_adherence: ${plan.contextAdherence}`);

const startedAt = Date.now();
const track = await generateTrack(plan.plan, plan.contextAdherence);
writeFileSync(values.out, track.audio);
console.log(`\nWrote ${values.out} (${track.audio.length} bytes, ${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
console.log("metadata:", JSON.stringify(track.metadata));

/** Mean 85% spectral rolloff via ffmpeg aspectralstats. */
function rolloff(file: string): number {
  const output = execFileSync(
    "ffmpeg",
    ["-i", file, "-af", "aspectralstats=measure=rolloff,ametadata=mode=print:file=-", "-f", "null", "-"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 },
  );
  const matches = [...output.matchAll(/rolloff=([0-9.]+)/g)].map((m) => Number(m[1]));
  if (matches.length === 0) throw new Error(`No rolloff frames parsed from ${file}`);
  return matches.reduce((s, v) => s + v, 0) / matches.length;
}
