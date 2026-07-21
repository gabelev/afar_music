import type { CreativeDNA, SonicAxis } from "@/lib/dna/schema";
import { ERAS } from "@/lib/dna/schema";
import { AXIS_TOKENS, ERA_STYLES, SOLO_PERFORMANCE_COMBO, VOCAL_TOKENS } from "./styleTokens";

/**
 * DNA → ElevenLabs music_v2 composition plan. Structural levers, not
 * adjectives: era sets BPM + production tokens, influences and bipolar sliders
 * contribute ranked style tokens, the vocal pad claims guaranteed slots, and
 * improvised↔structured maps to the chunk's context_adherence enum.
 *
 * Shape verified against the current API reference (api-reference/music/compose):
 * - music_v2's CompositionPlan is chunks-only. positive_global_styles /
 *   negative_global_styles are the music_v1 MusicPrompt schema and are ignored
 *   by music_v2 — chunk positive_styles/negative_styles are what the model
 *   reads ("styles for the first chunk are the most important").
 * - The docs recommend ~6–7 positive styles and say empty negatives are
 *   typical, so tokens compete for a small budget instead of all being sent.
 * - context_adherence is a per-chunk enum (documented default "high").
 * - Chunk text is lyrics; the ~200-char limit is per LINE (multi-line is fine).
 */

/** Below this magnitude an axis is considered neutral and contributes nothing. */
const NEUTRAL_DEADZONE = 0.15;
/** Only leans at least this strong ban the opposing pole. */
const NEGATIVE_LEAN_THRESHOLD = 0.6;
/** Docs recommend 6–7 styles on the first chunk; more dilutes all of them. */
export const POSITIVE_STYLE_BUDGET = 7;
/** Docs: leaving negatives empty is typical — send only the strongest few bans. */
export const NEGATIVE_STYLE_BUDGET = 4;
export const LYRIC_LINE_MAX_CHARS = 180;
export const LYRIC_MAX_LINES = 8;
export const TRACK_DURATION_MS = 30_000;

export type ContextAdherence = "low" | "medium" | "high";

export interface CompositionPlan {
  chunks: {
    text: string;
    duration_ms: number;
    positive_styles: string[];
    negative_styles: string[];
    context_adherence: ContextAdherence;
  }[];
}

export interface PlanWithProvenance {
  plan: CompositionPlan;
  contextAdherence: ContextAdherence;
  /** DNA field paths whose tokens made the transmitted plan — stored on the track artifact. */
  provenance: string[];
}

/** Take the strongest `count` tokens for a magnitude in (0,1]. */
function takeByMagnitude(tokens: readonly string[], magnitude: number): string[] {
  const count = Math.min(tokens.length, Math.ceil(Math.abs(magnitude) * tokens.length));
  return tokens.slice(0, count);
}

/**
 * One bipolar value → candidate tokens for the active pole and, only when the
 * lean is strong, a single ban on the opposing pole's strongest token. Mild
 * leans state a preference without negating anything.
 */
export function mapBipolarAxis(
  value: number,
  poles: { left: readonly string[]; right: readonly string[] },
): { positive: string[]; negative: string[] } {
  if (Math.abs(value) < NEUTRAL_DEADZONE) return { positive: [], negative: [] };
  const active = value < 0 ? poles.left : poles.right;
  const opposing = value < 0 ? poles.right : poles.left;
  return {
    positive: takeByMagnitude(active, value),
    negative: Math.abs(value) >= NEGATIVE_LEAN_THRESHOLD ? [opposing[0]] : [],
  };
}

/**
 * Vocal axes use MILD→EXTREME banded lists (see VOCAL_TOKENS): the band decides
 * which tokens a value reaches, so a pad dot at 0.6 emits "powerful belted
 * vocals" — never "screamed vocals", which needs a lean past 0.6. Extreme
 * positions (>0.85) drop the mild token and speak in the pole's extremes.
 * Only strong leans (≥0.6) ban the opposing pole's unmistakable token.
 */
export function mapVocalAxis(
  value: number,
  poles: { left: readonly string[]; right: readonly string[] },
): { positive: string[]; negative: string[] } {
  const magnitude = Math.abs(value);
  if (magnitude < NEUTRAL_DEADZONE) return { positive: [], negative: [] };
  const active = value < 0 ? poles.left : poles.right;
  const opposing = value < 0 ? poles.right : poles.left;
  const positive =
    magnitude > 0.85
      ? active.slice(-2)
      : magnitude > NEGATIVE_LEAN_THRESHOLD
        ? active.slice(0, 2)
        : [active[0]];
  const negative =
    magnitude >= NEGATIVE_LEAN_THRESHOLD
      ? [opposing[Math.min(1, opposing.length - 1)]]
      : [];
  return { positive: [...positive], negative };
}

/** Influence weight → how many style tokens that genre contributes (1–4 for any nonzero weight). */
export function influenceTokens(genre: string, weight: number): string[] {
  if (weight <= 0) return [];
  const candidates = [
    genre,
    `${genre} instrumentation`,
    `${genre} rhythms`,
    `${genre} songwriting sensibility`,
  ];
  const count = Math.min(candidates.length, Math.ceil(weight * 4));
  return candidates.slice(0, count);
}

/** improvised↔structured in thirds → the context_adherence enum. */
export function contextAdherenceFor(improvisedStructured: number): ContextAdherence {
  if (improvisedStructured < -1 / 3) return "low";
  if (improvisedStructured <= 1 / 3) return "medium";
  return "high";
}

/**
 * Clamp lyrics line by line: the API's ~200-char limit is per LINE (200/line
 * 500s; 180 is the verified-safe clamp), and multi-line text is how a 30s
 * chunk carries a singable word count.
 */
export function clampLyrics(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, LYRIC_MAX_LINES)
    .map(clampLine)
    .join("\n");
}

function clampLine(line: string): string {
  if (line.length <= LYRIC_LINE_MAX_CHARS) return line;
  const cut = line.slice(0, LYRIC_LINE_MAX_CHARS + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, LYRIC_LINE_MAX_CHARS)).trimEnd();
}

/** A style token competing for a budget slot, tagged with its DNA source. */
interface Candidate {
  token: string;
  score: number;
  source: string;
}

/**
 * Build the full composition plan for one track.
 * `lyricSeed` comes from Claude (driven by lyricalObsessions + mood); it is the
 * only prose that lands in chunk text — all direction lives in the style arrays.
 *
 * Selection: a few tokens are guaranteed (BPM, era, lead genre, active vocal
 * axes, the solo combo), the rest compete on magnitude for the remaining
 * budget. Influence scores are boosted ×1.5 because weights sum to 1 across
 * four genres while axes reach ±1.
 */
export function buildCompositionPlan(dna: CreativeDNA, lyricSeed: string): PlanWithProvenance {
  const guaranteed: Candidate[] = [];
  const pool: Candidate[] = [];
  const negatives: Candidate[] = [];

  const era = ERAS[dna.era];
  const eraStyle = ERA_STYLES[era];
  // Era sets the base tempo; the loud↔quiet slider modulates it so a hushed
  // artist isn't pinned to their era's radio tempo (quiet slows up to 20%,
  // loud pushes up to 10%).
  const lq = dna.sonicPalette.loudQuiet;
  const bpm = Math.round(eraStyle.bpm * (lq > 0 ? 1 - 0.2 * lq : 1 + 0.1 * -lq));
  guaranteed.push({ token: `${bpm} BPM`, score: Infinity, source: "era" });
  guaranteed.push({ token: eraStyle.tokens[0], score: Infinity, source: "era" });
  for (const token of eraStyle.tokens.slice(1)) {
    pool.push({ token, score: 0.35, source: "era" });
  }

  // The heaviest influence anchors the genre with two guaranteed tokens, so
  // spread-thin weights can't let palette adjectives outvote it.
  const leadGenre = dna.influences.reduce((a, b) => (b.weight > a.weight ? b : a));
  for (const influence of dna.influences) {
    const source = `influences.${influence.genre}`;
    const tokens =
      influence === leadGenre
        ? [influence.genre, `${influence.genre} instrumentation`]
        : influenceTokens(influence.genre, influence.weight);
    tokens.forEach((token, k) => {
      const candidate = { token, score: influence.weight * 1.5 - 0.15 * k, source };
      if (influence === leadGenre) guaranteed.push({ ...candidate, score: Infinity });
      else pool.push(candidate);
    });
  }

  for (const axis of Object.keys(AXIS_TOKENS) as SonicAxis[]) {
    const value = dna.sonicPalette[axis];
    const mapped = mapBipolarAxis(value, AXIS_TOKENS[axis]);
    const source = `sonicPalette.${axis}`;
    mapped.positive.forEach((token, k) =>
      pool.push({ token, score: Math.abs(value) - 0.25 * k, source }),
    );
    mapped.negative.forEach((token) =>
      negatives.push({ token, score: Math.abs(value), source }),
    );
  }

  for (const padAxis of ["whispersScreams", "cleanDamaged"] as const) {
    const value = dna.vocalCharacter[padAxis];
    const mapped = mapVocalAxis(value, VOCAL_TOKENS[padAxis]);
    const source = `vocalCharacter.${padAxis}`;
    // The pad is a headline control: its lead token must not be crowded out.
    mapped.positive.forEach((token, k) => {
      if (k === 0) guaranteed.push({ token, score: Infinity, source });
      else pool.push({ token, score: Math.abs(value) - 0.1 * k, source });
    });
    mapped.negative.forEach((token) =>
      negatives.push({ token, score: Math.abs(value), source }),
    );
  }

  const t = SOLO_PERFORMANCE_COMBO.threshold;
  if (
    dna.sonicPalette.sparseDense <= -t &&
    dna.sonicPalette.loudQuiet >= t &&
    dna.sonicPalette.organicSynthetic <= -t
  ) {
    for (const token of SOLO_PERFORMANCE_COMBO.positive) {
      guaranteed.push({ token, score: Infinity, source: "sonicPalette.sparseDense" });
    }
    for (const token of SOLO_PERFORMANCE_COMBO.negative) {
      negatives.unshift({ token, score: Infinity, source: "sonicPalette.sparseDense" });
    }
  }

  const positive = selectByBudget(
    [...guaranteed, ...pool.sort((a, b) => b.score - a.score)],
    POSITIVE_STYLE_BUDGET,
  );
  const positiveTokens = new Set(positive.map((c) => c.token));
  const negative = selectByBudget(
    negatives.sort((a, b) => b.score - a.score).filter((c) => !positiveTokens.has(c.token)),
    NEGATIVE_STYLE_BUDGET,
  );

  const provenance = [...new Set([...positive, ...negative].map((c) => c.source))];
  if (lyricSeed.trim().length > 0) provenance.push("lyricalObsessions");

  const contextAdherence = contextAdherenceFor(dna.sonicPalette.improvisedStructured);
  return {
    plan: {
      chunks: [
        {
          text: clampLyrics(lyricSeed),
          duration_ms: TRACK_DURATION_MS,
          positive_styles: positive.map((c) => c.token),
          negative_styles: negative.map((c) => c.token),
          context_adherence: contextAdherence,
        },
      ],
    },
    contextAdherence,
    provenance,
  };
}

/** First `budget` distinct tokens, preserving order. */
function selectByBudget(candidates: Candidate[], budget: number): Candidate[] {
  const seen = new Set<string>();
  const selected: Candidate[] = [];
  for (const candidate of candidates) {
    if (selected.length >= budget) break;
    if (seen.has(candidate.token)) continue;
    seen.add(candidate.token);
    selected.push(candidate);
  }
  return selected;
}
