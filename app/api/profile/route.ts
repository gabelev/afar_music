import { NextResponse } from "next/server";
import { CreativeDNASchema } from "@/lib/dna/schema";
import { storeMedia } from "@/lib/db/media";
import { regenerateImage } from "@/lib/generation/generate";
import { generateIdentity } from "@/lib/generation/claude";

export const maxDuration = 60;

/**
 * Wave 2 splits across requests so each response stays small and the browser
 * parallelizes the image fetches itself:
 *   POST { dna } → { identity }
 *   POST { dna, regenerate: "portrait" | "cover", basePrompt } → { image }
 *   POST { dna, regenerate: "bio" } → { identity }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dna = CreativeDNASchema.parse(body.dna);

    if (body.regenerate === "portrait" || body.regenerate === "cover") {
      const artifact = await regenerateImage(dna, body.regenerate, String(body.basePrompt ?? ""));
      const image = artifact.image ? await storeMedia(artifact.image, "image/jpeg") : "";
      return NextResponse.json({ image });
    }

    const identity = await generateIdentity(dna);
    return NextResponse.json({ identity });
  } catch (error) {
    console.error("profile route failed:", error);
    return NextResponse.json(
      { error: "Profile generation hit a snag — try again, or explore the roster meanwhile." },
      { status: 500 },
    );
  }
}

