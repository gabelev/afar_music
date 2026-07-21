import { describe, expect, it } from "vitest";
import type { CreativeDNA } from "@/lib/dna/schema";
import { ERAS } from "@/lib/dna/schema";
import {
  buildCompositionPlan,
  clampLyrics,
  contextAdherenceFor,
  influenceTokens,
  mapBipolarAxis,
  LYRIC_LINE_MAX_CHARS,
  LYRIC_MAX_LINES,
  NEGATIVE_STYLE_BUDGET,
  POSITIVE_STYLE_BUDGET,
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

function chunk(dna: CreativeDNA, lyrics = "x") {
  return buildCompositionPlan(dna, lyrics).plan.chunks[0];
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

  it("magnitude controls positive token count (distance from center is the weighting)", () => {
    const hard = mapBipolarAxis(1, AXIS_TOKENS.organicSynthetic);
    const soft = mapBipolarAxis(0.3, AXIS_TOKENS.organicSynthetic);
    expect(hard.positive.length).toBeGreaterThan(soft.positive.length);
    expect(soft.positive.length).toBeGreaterThan(0);
  });

  it("a mild lean states a preference without banning the opposite pole", () => {
    // Regression: improvisedStructured −0.2 used to hard-ban "structured
    // songwriting" — every slightly-off-center slider produced a negation as
    // strong as its positive.
    const { negative } = mapBipolarAxis(0.3, AXIS_TOKENS.coldWarm);
    expect(negative).toEqual([]);
  });

  it("a strong lean bans only the opposing pole's strongest token", () => {
    const { negative } = mapBipolarAxis(0.8, AXIS_TOKENS.coldWarm);
    expect(negative).toEqual(["cold tone"]);
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

  it("any nonzero weight contributes at least one token", () => {
    // Regression: Math.round quantized weights under 0.125 to zero tokens —
    // a genre shown as "10%" in the UI contributed nothing.
    expect(influenceTokens("jazz", 0.1).length).toBe(1);
    expect(influenceTokens("jazz", 0.01).length).toBe(1);
  });

  it("zero weight contributes nothing", () => {
    expect(influenceTokens("jazz", 0)).toEqual([]);
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

  it("preserves line breaks (the API limit is per line, not per text)", () => {
    const lyrics = "rain on the glass\nwires hum in the dark\nnobody calls back";
    expect(clampLyrics(lyrics)).toBe(lyrics);
  });

  it("clamps each line independently at a word boundary", () => {
    const longLine = Array(60).fill("rain").join(" "); // 299 chars
    const clamped = clampLyrics(`${longLine}\nshort line`);
    const [first, second] = clamped.split("\n");
    expect(first.length).toBeLessThanOrEqual(LYRIC_LINE_MAX_CHARS);
    expect(first.endsWith("rain")).toBe(true); // no mid-word cut
    expect(second).toBe("short line");
  });

  it("drops empty lines and surrounding whitespace", () => {
    expect(clampLyrics("  first line  \n\n\n  second line \n")).toBe("first line\nsecond line");
  });

  it("caps the number of lines", () => {
    const lyrics = Array(20).fill("la la la").join("\n");
    expect(clampLyrics(lyrics).split("\n")).toHaveLength(LYRIC_MAX_LINES);
  });

  it("hard-cuts a single unbroken word rather than exceeding the limit", () => {
    expect(clampLyrics("a".repeat(300)).length).toBe(LYRIC_LINE_MAX_CHARS);
  });
});

describe("buildCompositionPlan", () => {
  it("emits exactly one 30-second chunk carrying lyrics, styles, and context adherence", () => {
    const { plan } = buildCompositionPlan(dnaWith({}), "rain keeps its own time");
    expect(plan.chunks).toHaveLength(1);
    const c = plan.chunks[0];
    expect(c.text).toBe("rain keeps its own time");
    expect(c.duration_ms).toBe(TRACK_DURATION_MS);
    expect(c.positive_styles.length).toBeGreaterThan(0);
    expect(c.context_adherence).toBe("medium");
  });

  it("sends no music_v1 keys: styles live on the chunk, not global arrays", () => {
    // Regression: positive_global_styles / negative_global_styles are the
    // music_v1 MusicPrompt schema. music_v2's CompositionPlan is chunks-only,
    // so everything in those keys was silently ignored by the API.
    const { plan } = buildCompositionPlan(dnaWith({}), "x");
    expect(plan).not.toHaveProperty("positive_global_styles");
    expect(plan).not.toHaveProperty("negative_global_styles");
  });

  it("respects the documented style budget even with every control pushed to an extreme", () => {
    const c = chunk(
      dnaWith({
        sonicPalette: {
          pristineLofi: 1,
          sparseDense: 1,
          coldWarm: -1,
          improvisedStructured: 1,
          loudQuiet: -1,
          organicSynthetic: 1,
          darkHopeful: -1,
        },
        vocalCharacter: { whispersScreams: 1, cleanDamaged: 1 },
      }),
    );
    expect(c.positive_styles.length).toBeLessThanOrEqual(POSITIVE_STYLE_BUDGET);
    expect(c.negative_styles.length).toBeLessThanOrEqual(NEGATIVE_STYLE_BUDGET);
  });

  it("era drives BPM and the lead production token", () => {
    const c = chunk(dnaWith({ era: ERAS.indexOf("1980s") }));
    expect(c.positive_styles).toContain("118 BPM");
    expect(c.positive_styles).toContain("1980s production");
  });

  it("the loud↔quiet slider modulates the era BPM", () => {
    // Quiet artists slow down (up to 20%); loud artists speed up (up to 10%).
    const quiet = chunk(
      dnaWith({ era: ERAS.indexOf("1970s"), sonicPalette: { ...neutralPalette, loudQuiet: 0.8 } }),
    );
    expect(quiet.positive_styles).toContain("88 BPM"); // 105 × 0.84
    const loud = chunk(
      dnaWith({ era: ERAS.indexOf("1970s"), sonicPalette: { ...neutralPalette, loudQuiet: -1 } }),
    );
    expect(loud.positive_styles).toContain("116 BPM"); // 105 × 1.1, rounded
  });

  it("the lead influence always anchors the genre with two tokens", () => {
    const c = chunk(
      dnaWith({
        influences: [
          { genre: "folk", weight: 0.28 },
          { genre: "americana", weight: 0.24 },
          { genre: "chamber pop", weight: 0.24 },
          { genre: "ambient", weight: 0.24 },
        ],
      }),
    );
    expect(c.positive_styles).toContain("folk");
    expect(c.positive_styles).toContain("folk instrumentation");
  });

  it("a pushed slider lands in both chunk style arrays and in provenance", () => {
    const { plan, provenance } = buildCompositionPlan(
      dnaWith({ sonicPalette: { ...neutralPalette, organicSynthetic: 1 } }),
      "x",
    );
    expect(plan.chunks[0].positive_styles).toContain("synthetic textures");
    expect(plan.chunks[0].negative_styles).toContain("organic instrumentation");
    expect(provenance).toContain("sonicPalette.organicSynthetic");
  });

  it("a mildly leaning slider produces no negative ban", () => {
    const c = chunk(
      dnaWith({ sonicPalette: { ...neutralPalette, improvisedStructured: -0.2 } }),
    );
    expect(c.negative_styles).toEqual([]);
  });

  it("neutral axes stay out of provenance", () => {
    const { provenance } = buildCompositionPlan(dnaWith({}), "x");
    expect(provenance.some((p) => p.startsWith("sonicPalette."))).toBe(false);
  });

  it("active vocal-pad axes always claim a style slot", () => {
    // The pad is a headline control: it must not be crowded out of the budget
    // by influence and axis tokens.
    const c = chunk(dnaWith({ vocalCharacter: { whispersScreams: 0.3, cleanDamaged: 0.3 } }));
    expect(c.positive_styles.join(" ")).toMatch(/belted|powerful/);
    expect(c.positive_styles.join(" ")).toMatch(/rasp/);
  });

  it("moderate vocal-pad positions emit moderate tokens, not the extremes", () => {
    // Regression: whispersScreams 0.6 fell in the two-token band and emitted
    // "screamed vocals" as a positive style for a soul belter.
    const c = chunk(dnaWith({ vocalCharacter: { whispersScreams: 0.6, cleanDamaged: 0.3 } }));
    expect(c.positive_styles).toContain("powerful belted vocals");
    expect(c.positive_styles).not.toContain("screamed vocals");
    expect(c.positive_styles).not.toContain("damaged vocal texture");
  });

  it("extreme vocal-pad positions still reach the extremes", () => {
    const c = chunk(dnaWith({ vocalCharacter: { whispersScreams: 0.9, cleanDamaged: 0.9 } }));
    expect(c.positive_styles).toContain("screamed vocals");
    expect(c.positive_styles).toContain("damaged vocal texture");
  });

  it("a strong whisper lean bans screaming, and vice versa", () => {
    const c = chunk(dnaWith({ vocalCharacter: { whispersScreams: -0.9, cleanDamaged: 0 } }));
    expect(c.positive_styles).toContain("whispered vocals");
    expect(c.negative_styles).toContain("screamed vocals");
  });

  it("sparse + quiet + organic together read as a solo performance", () => {
    const c = chunk(
      dnaWith({
        sonicPalette: { ...neutralPalette, sparseDense: -0.7, loudQuiet: 0.8, organicSynthetic: -0.9 },
      }),
    );
    expect(c.positive_styles).toContain("intimate solo performance");
    expect(c.negative_styles).toContain("full band arrangement");
    expect(c.negative_styles.length).toBeLessThanOrEqual(NEGATIVE_STYLE_BUDGET);
  });

  it("the solo-performance combo needs all three axes aligned", () => {
    const c = chunk(
      dnaWith({
        sonicPalette: { ...neutralPalette, sparseDense: -0.7, loudQuiet: -0.5, organicSynthetic: -0.9 },
      }),
    );
    expect(c.positive_styles).not.toContain("intimate solo performance");
    expect(c.negative_styles).not.toContain("full band arrangement");
  });

  it("era and organic tokens never force genre or instrumentation", () => {
    // Regression: "1950s rock and roll production" and "live drums" were
    // dragging quiet folk artists toward full-band rock.
    const c = chunk(
      dnaWith({
        era: ERAS.indexOf("1950s"),
        sonicPalette: { ...neutralPalette, organicSynthetic: -1 },
      }),
    );
    const all = c.positive_styles.join(" | ");
    expect(all).not.toMatch(/rock and roll|live drums|trap hi-hats/);
    expect(c.positive_styles).toContain("organic instrumentation");
  });

  it("context adherence rides inside the chunk, where music_v2 reads it", () => {
    // Regression: context_adherence was sent as a top-level request key, which
    // the API ignores — every chunk silently ran at the documented default
    // ("high") regardless of the improvised↔structured slider.
    const result = buildCompositionPlan(
      dnaWith({ sonicPalette: { ...neutralPalette, improvisedStructured: -1 } }),
      "x",
    );
    expect(result.plan.chunks[0].context_adherence).toBe("low");
    expect(result.contextAdherence).toBe("low");
  });
});
