import OpenAI from "openai";
import type { CreativeDNA } from "@/lib/dna/schema";
import { ERAS } from "@/lib/dna/schema";

/**
 * gpt-image-1 for portraits and covers both — one image integration.
 * Era and visual style drive structural parameters (aspect ratio per artifact
 * kind, era-anchored medium in the prompt), not only descriptive text.
 */

let _client: OpenAI | null = null;
function client() {
  if (!_client) _client = new OpenAI();
  return _client;
}

export type ImageKind = "portrait" | "cover";

const SIZE_BY_KIND: Record<ImageKind, "1024x1536" | "1024x1024"> = {
  portrait: "1024x1536", // portrait orientation for the artist
  cover: "1024x1024", // album covers are square
};

/** Era → photographic/print medium the image should read as. */
function eraMedium(eraIndex: number): string {
  const era = ERAS[eraIndex];
  switch (era) {
    case "far-past":
      return "painted portrait, aged canvas texture";
    case "1950s":
    case "1960s":
      return "vintage film photograph, period-accurate grain and color";
    case "1970s":
    case "1980s":
      return "analog film photograph with era-typical color grading";
    case "1990s":
    case "2000s":
      return "35mm photograph, era-typical styling";
    case "2010s":
    case "2020s":
      return "contemporary editorial photograph";
    default:
      return "futuristic rendered portrait, speculative fashion";
  }
}

export async function generateImage(
  dna: CreativeDNA,
  kind: ImageKind,
  basePrompt: string,
): Promise<Buffer> {
  const prompt = [
    basePrompt,
    `Medium: ${eraMedium(dna.era)}.`,
    `Visual style: ${dna.visualStyle.join(", ")}.`,
    kind === "cover" ? "Album cover composition; no readable text." : "Artist portrait.",
  ].join(" ");

  const result = await client().images.generate({
    model: "gpt-image-1",
    prompt,
    size: SIZE_BY_KIND[kind],
    quality: "medium",
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error(`gpt-image-1 returned no image data for ${kind}`);
  return Buffer.from(b64, "base64");
}
