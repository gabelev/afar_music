import { describe, expect, it } from "vitest";
import { CreativeDNASchema, ERAS, normalizeInfluences } from "./schema";

const validDNA = {
  seedPrompt: "a rain-soaked synthpop recluse",
  era: ERAS.indexOf("2020s"),
  influences: [
    { genre: "synthpop", weight: 0.4 },
    { genre: "shoegaze", weight: 0.3 },
    { genre: "trip-hop", weight: 0.2 },
    { genre: "ambient", weight: 0.1 },
  ],
  sonicPalette: {
    pristineLofi: 0.5,
    sparseDense: -0.2,
    coldWarm: 0,
    improvisedStructured: 0.9,
    loudQuiet: -1,
    organicSynthetic: 1,
    darkHopeful: -0.4,
  },
  vocalCharacter: { whispersScreams: -0.6, cleanDamaged: 0.3 },
  lyricalObsessions: ["rain", "elevators", "static", "missed calls"],
  visualStyle: ["neon fog", "grainy VHS"],
};

describe("CreativeDNASchema", () => {
  it("accepts a fully valid DNA", () => {
    expect(CreativeDNASchema.parse(validDNA)).toEqual(validDNA);
  });

  it("rejects bipolar values outside −1..1", () => {
    const bad = {
      ...validDNA,
      sonicPalette: { ...validDNA.sonicPalette, coldWarm: 1.2 },
    };
    expect(CreativeDNASchema.safeParse(bad).success).toBe(false);
  });

  it("requires exactly 4 influences", () => {
    const bad = { ...validDNA, influences: validDNA.influences.slice(0, 3) };
    expect(CreativeDNASchema.safeParse(bad).success).toBe(false);
  });

  it("rejects influence weights that do not sum to 1", () => {
    const bad = {
      ...validDNA,
      influences: validDNA.influences.map((i) => ({ ...i, weight: 0.4 })),
    };
    expect(CreativeDNASchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an era index outside the ordinal scale", () => {
    expect(CreativeDNASchema.safeParse({ ...validDNA, era: ERAS.length }).success).toBe(false);
    expect(CreativeDNASchema.safeParse({ ...validDNA, era: -1 }).success).toBe(false);
  });

  it("rejects duplicate tags regardless of case", () => {
    const bad = { ...validDNA, lyricalObsessions: ["Rain", "rain"] };
    expect(CreativeDNASchema.safeParse(bad).success).toBe(false);
  });

  it("rejects generated-output fields (DNA is input state only)", () => {
    const bad = { ...validDNA, bio: "an extensive backstory" };
    expect(CreativeDNASchema.strict().safeParse(bad).success).toBe(false);
  });
});

describe("normalizeInfluences", () => {
  it("rescales weights to sum to 1", () => {
    const normalized = normalizeInfluences([
      { genre: "a", weight: 2 },
      { genre: "b", weight: 2 },
    ]);
    expect(normalized.map((i) => i.weight)).toEqual([0.5, 0.5]);
  });

  it("splits evenly when all weights are zero", () => {
    const normalized = normalizeInfluences([
      { genre: "a", weight: 0 },
      { genre: "b", weight: 0 },
      { genre: "c", weight: 0 },
      { genre: "d", weight: 0 },
    ]);
    expect(normalized.map((i) => i.weight)).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
});
