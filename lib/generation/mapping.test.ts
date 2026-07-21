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
    });
  });

  it("era drives BPM and production tokens", () => {
    const { plan } = buildCompositionPlan(dnaWith({ era: ERAS.indexOf("1980s") }), "x");
    expect(plan.positive_global_styles).toContain("118 BPM");
    expect(plan.positive_global_styles).toContain("gated reverb drums");
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
