import { NextResponse } from "next/server";
import { CreativeDNASchema } from "@/lib/dna/schema";
import { nudgeDNA } from "@/lib/generation/claude";

export const maxDuration = 60;

/**
 * POST { dna, instruction } → { dna, explanation }
 * Claude returns a PATCH merged server-side; the client diffs old vs new to
 * show which controls moved (docs/SPEC.md: the change must be legible).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dna = CreativeDNASchema.parse(body.dna);
    const instruction = String(body.instruction ?? "").trim();
    if (!instruction) {
      return NextResponse.json({ error: "Tell us how to nudge them first." }, { status: 400 });
    }
    const result = await nudgeDNA(dna, instruction);
    return NextResponse.json(result);
  } catch (error) {
    console.error("nudge route failed:", error);
    return NextResponse.json(
      { error: "The nudge didn't land — try phrasing it differently." },
      { status: 500 },
    );
  }
}
