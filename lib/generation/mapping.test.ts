import { describe, expect, it } from "vitest";
import type { CreativeDNA } from "@/lib/dna/schema";
import { ERAS } from "@/lib/dna/schema";
import {
  buildCompositionPlan,
  clampLyrics,
  contextAdherenceFor,
  influenceTokens,
  mapBipolarAxis,
  LYRICS_MAX_CHARS,
  TRACK_DURATION_MS,
} from "./mapping";
import { AXIS_TOKENS } from "./styleTokens";

const neutralPalette = {
  pristineLofi: 0,
  sparseDense: 0,
  coldWarm: 0,
  improvisedStructured: 0,
  loudQuiet: 0,
  organicSynthetic: 0,
  darkHopeful: 0,
};

function dnaWith(overrides: Partial<CreativeDNA>): CreativeDNA {
  return {
    seedPrompt: "test artist",
    era: ERAS.indexOf("2020s"),
    influences: [
      { genre: "synthpop", weight: 0.4 },
      { genre: "shoegaze", weight: 0.3 },
      { genre: "trip-hop", weight: 0.2 },
      { genre: "ambient", weight: 0.1 },
    ],
    sonicPalette: { ...neutralPalette },
    vocalCharacter: { whispersScreams: 0, cleanDamaged: 0 },
    lyricalObsessions: ["rain"],
    visualStyle: ["neon fog"],
    ...overrides,
  };
}

describe("mapBipolarAxis", () => {
  it("at the right pole emits right tokens as positive and left tokens as negative", () => {
    const { positive, negative } = mapBipolarAxis(1, AXIS_TOKENS.pristineLofi);
    expect(positive).toContain("lo-fi");
    expect(negative).toContain("pristine production");
  });

  it("at the left pole the arrays swap", () => {
    const { positive, negative } = mapBipolarAxis(-1, AXIS_TOKENS.pristineLofi);
    expect(positive).toContain("pristine production");
    expect(negative).toContain("lo-fi");
  });

  it("magnitude controls token count (distance from center is the weighting)", () => {
    const hard = mapBipolarAxis(1, AXIS_TOKENS.organicSynthetic);
    const soft = mapBipolarAxis(0.3, AXIS_TOKENS.organicSynthetic);
    expect(hard.positive.length).toBeGreaterThan(soft.positive.length);
    expect(soft.positive.length).toBeGreaterThan(0);
  });

  it("neutral values inside the deadzone contribute nothing", () => {
    expect(mapBipolarAxis(0, AXIS_TOKENS.coldWarm)).toEqual({ positive: [], negative: [] });
    expect(mapBipolarAxis(0.1, AXIS_TOKENS.coldWarm)).toEqual({ positive: [], negative: [] });
  });
});

describe("influenceTokens", () => {
  it("higher weight contributes more tokens", () => {
    expect(influenceTokens("jazz", 1).length).toBe(4);
    expect(influenceTokens("jazz", 0.5).length).toBe(2);
    expect(influenceTokens("jazz", 0.25).length).toBe(1);
  });

  it("negligible weight contributes nothing", () => {
    expect(influenceTokens("jazz", 0.1)).toEqual([]);
  });
});

describe("contextAdherenceFor (thirds of improvised↔structured)", () => {
  it.each([
    [-1, "low"],
    [-0.4, "low"],
    [-0.2, "medium"],
    [0, "medium"],
    [0.33, "medium"],
    [0.4, "high"],
    [1, "high"],
  ])("maps %s → %s", (value, expected) => {
    expect(contextAdherenceFor(value as number)).toBe(expected);
  });
});

describe("clampLyrics", () => {
  it("leaves short lyrics untouched", () => {
    expect(clampLyrics("rain on the elevator glass")).toBe("rain on the elevator glass");
  });

  it("clamps long lyrics to the limit at a word boundary", () => {
    const long = Array(60).fill("rain").join(" "); // 299 chars
    const clamped = clampLyrics(long);
    expect(clamped.length).toBeLessThanOrEqual(LYRICS_MAX_CHARS);
    expect(clamped.endsWith("rain")).toBe(true); // no mid-word cut
  });

  it("hard-cuts a single unbroken word rather than exceeding the limit", () => {
    expect(clampLyrics("a".repeat(300)).length).toBe(LYRICS_MAX_CHARS);
  });
});

describe("buildCompositionPlan", () => {
  it("always emits exactly one 30-second chunk whose text is the lyrics", () => {
    const { plan } = buildCompositionPlan(dnaWith({}), "rain keeps its own time");
    expect(plan.chunks).toHaveLength(1);
    expect(plan.chunks[0]).toEqual({
      text: "rain keeps its own time",
      duration_ms: TRACK_DURATION_MS,
      positive_styles: [],
      negative_styles: [],
    });
  });

  it("era drives BPM and production tokens", () => {
    const { plan } = buildCompositionPlan(dnaWith({ era: ERAS.indexOf("1980s") }), "x");
    expect(plan.positive_global_styles).toContain("118 BPM");
    expect(plan.positive_global_styles).toContain("big analog reverb");
  });

  it("the loud↔quiet slider modulates the era BPM", () => {
    // Quiet artists slow down (up to 20%); loud artists speed up (up to 10%).
    const quiet = buildCompositionPlan(
      dnaWith({ era: ERAS.indexOf("1970s"), sonicPalette: { ...neutralPalette, loudQuiet: 0.8 } }),
      "x",
    );
    expect(quiet.plan.positive_global_styles).toContain("88 BPM"); // 105 × 0.84
    const loud = buildCompositionPlan(
      dnaWith({ era: ERAS.indexOf("1970s"), sonicPalette: { ...neutralPalette, loudQuiet: -1 } }),
      "x",
    );
    expect(loud.plan.positive_global_styles).toContain("116 BPM"); // 105 × 1.1, rounded
  });

  it("era and organic tokens never force genre or instrumentation", () => {
    // Regression: "1950s rock and roll production" and "live drums" were
    // dragging quiet folk artists toward full-band rock.
    const { plan } = buildCompositionPlan(
      dnaWith({
        era: ERAS.indexOf("1950s"),
        sonicPalette: { ...neutralPalette, organicSynthetic: -1 },
      }),
      "x",
    );
    const all = plan.positive_global_styles.join(" | ");
    expect(all).not.toMatch(/rock and roll|live drums|trap hi-hats/);
    expect(plan.positive_global_styles).toContain("organic instrumentation");
  });

  it("a pushed slider lands in BOTH style arrays and in provenance", () => {
    const { plan, provenance } = buildCompositionPlan(
      dnaWith({ sonicPalette: { ...neutralPalette, organicSynthetic: 1 } }),
      "x",
    );
    expect(plan.positive_global_styles).toContain("synthetic textures");
    expect(plan.negative_global_styles).toContain("organic instrumentation");
    expect(provenance).toContain("sonicPalette.organicSynthetic");
  });

  it("neutral axes stay out of provenance", () => {
    const { provenance } = buildCompositionPlan(dnaWith({}), "x");
    expect(provenance.some((p) => p.startsWith("sonicPalette."))).toBe(false);
  });

  it("moderate vocal-pad positions emit moderate tokens, not the extremes", () => {
    // Regression: any value past the deadzone used to emit "screamed vocals" /
    // "damaged vocal texture" at full strength — the whole right/bottom half of
    // the pad read as screaming over distortion (metal, regardless of genre).
    const { plan } = buildCompositionPlan(
      dnaWith({ vocalCharacter: { whispersScreams: 0.3, cleanDamaged: 0.3 } }),
      "x",
    );
    expect(plan.positive_global_styles).not.toContain("screamed vocals");
    expect(plan.positive_global_styles).not.toContain("damaged vocal texture");
    expect(plan.positive_global_styles.join(" ")).toMatch(/belted|powerful/);
    expect(plan.positive_global_styles.join(" ")).toMatch(/rasp/);
  });

  it("extreme vocal-pad positions still reach the extremes", () => {
    const { plan } = buildCompositionPlan(
      dnaWith({ vocalCharacter: { whispersScreams: 0.9, cleanDamaged: 0.9 } }),
      "x",
    );
    expect(plan.positive_global_styles).toContain("screamed vocals");
    expect(plan.positive_global_styles).toContain("damaged vocal texture");
  });

  it("sparse + quiet + organic together read as a solo performance", () => {
    // Vocab tuning: aligned soft axes should say 'solo, no band' outright,
    // not leave the model free to add a rhythm section.
    const { plan } = buildCompositionPlan(
      dnaWith({
        sonicPalette: { ...neutralPalette, sparseDense: -0.7, loudQuiet: 0.8, organicSynthetic: -0.9 },
      }),
      "x",
    );
    expect(plan.positive_global_styles).toContain("intimate solo performance");
    expect(plan.negative_global_styles).toContain("full band arrangement");
    expect(plan.negative_global_styles).toContain("percussion");
  });

  it("the solo-performance combo needs all three axes aligned", () => {
    const { plan } = buildCompositionPlan(
      dnaWith({
        sonicPalette: { ...neutralPalette, sparseDense: -0.7, loudQuiet: -0.5, organicSynthetic: -0.9 },
      }),
      "x",
    );
    expect(plan.positive_global_styles).not.toContain("intimate solo performance");
    expect(plan.negative_global_styles).not.toContain("full band arrangement");
  });

  it("the lead influence always anchors the genre with at least two tokens", () => {
    // A folk artist whose weights are spread thin still needs 'folk' to
    // outweigh palette adjectives.
    const { plan } = buildCompositionPlan(
      dnaWith({
        influences: [
          { genre: "folk", weight: 0.28 },
          { genre: "americana", weight: 0.24 },
          { genre: "chamber pop", weight: 0.24 },
          { genre: "ambient", weight: 0.24 },
        ],
      }),
      "x",
    );
    expect(plan.positive_global_styles).toContain("folk");
    expect(plan.positive_global_styles).toContain("folk instrumentation");
  });

  it("vocal pad emits vocal tokens", () => {
    const { plan } = buildCompositionPlan(
      dnaWith({ vocalCharacter: { whispersScreams: -0.9, cleanDamaged: 0 } }),
      "x",
    );
    expect(plan.positive_global_styles).toContain("whispered vocals");
    expect(plan.negative_global_styles).toContain("screamed vocals");
  });

  it("exposes context adherence from the improvised↔structured axis", () => {
    const result = buildCompositionPlan(
      dnaWith({ sonicPalette: { ...neutralPalette, improvisedStructured: -1 } }),
      "x",
    );
    expect(result.contextAdherence).toBe("low");
  });
});
