import { NextResponse } from "next/server";
import { CreativeDNASchema } from "@/lib/dna/schema";
import { regenerateDNA, seedToDNA } from "@/lib/generation/claude";

export const maxDuration = 60;

/**
 * POST { prompt } → { dna, referenceNotes }              (first read)
 * POST { prompt, kept } → { dna, referenceNotes }        (regenerate the rest)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) {
      return NextResponse.json({ error: "Tell us about the artist first." }, { status: 400 });
    }
    const result = body.kept
      ? await regenerateDNA(prompt, CreativeDNASchema.omit({ seedPrompt: true }).partial().parse(body.kept))
      : await seedToDNA(prompt);
    return NextResponse.json(result);
  } catch (error) {
    console.error("dna route failed:", error);
    return NextResponse.json(
      { error: "We couldn't read that prompt right now — try again in a moment." },
      { status: 500 },
    );
  }
}
