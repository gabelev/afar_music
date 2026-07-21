import type { CompositionPlan } from "./mapping";

/**
 * ElevenLabs music client. Built to the verified API facts in docs/SPEC.md:
 * - model pinned to music_v2; composition plan, not a one-shot prompt
 * - the body carries ONLY model_id + composition_plan: all style direction and
 *   context_adherence live inside the plan's chunks (music_v2 schema);
 *   respect_sections_durations is music_v1-only and is not sent
 * - the response BODY is raw audio; track metadata is on response headers
 * - ~5-6s generation for 30s; 90s timeout leaves headroom inside a web request
 * - bad_prompt / bad_composition_plan errors carry a suggested replacement —
 *   caught here and surfaced so the UI can show it like seed-prompt stripping
 */

const MUSIC_URL = "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128";
const MUSIC_TIMEOUT_MS = 90_000;

/**
 * The ElevenLabs subscription allows 2 concurrent music generations; a third
 * concurrent call 429s (concurrent_limit_exceeded). Callers still fire whole
 * waves with Promise.all — this semaphore queues the overflow transparently.
 */
const MAX_CONCURRENT = 2;
let active = 0;
const waiters: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}

function release(): void {
  active--;
  waiters.shift()?.();
}

/** A copyrighted-content rejection carrying the API's suggested replacement. */
export class MusicPromptError extends Error {
  constructor(
    public code: "bad_prompt" | "bad_composition_plan",
    public suggestion: string | null,
    message: string,
  ) {
    super(message);
    this.name = "MusicPromptError";
  }
}

export interface GeneratedTrack {
  audio: Buffer;
  contentType: string;
  /** Metadata from response headers (the body is the audio itself). */
  metadata: Record<string, string>;
}

export async function generateTrack(plan: CompositionPlan): Promise<GeneratedTrack> {
  await acquire();
  try {
    return await requestTrack(plan);
  } catch (error) {
    // One retry for transient rate limiting; MusicPromptError is not transient.
    if (error instanceof Error && !(error instanceof MusicPromptError) && error.message.includes("429")) {
      await new Promise((r) => setTimeout(r, 3000));
      return await requestTrack(plan);
    }
    throw error;
  } finally {
    release();
  }
}

async function requestTrack(plan: CompositionPlan): Promise<GeneratedTrack> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  const response = await fetch(MUSIC_URL, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      model_id: "music_v2",
      composition_plan: plan,
    }),
    signal: AbortSignal.timeout(MUSIC_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    let detail: { status?: string; message?: string; suggestion?: string } | undefined;
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.detail ?? parsed;
    } catch {
      // bare 500s (e.g. chunk text over ~200 chars) have no JSON body
    }
    const status = detail?.status;
    if (status === "bad_prompt" || status === "bad_composition_plan") {
      throw new MusicPromptError(
        status,
        detail?.suggestion ?? null,
        detail?.message ?? `ElevenLabs rejected the composition plan (${status})`,
      );
    }
    throw new Error(`ElevenLabs music request failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const metadata: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (key.startsWith("x-")) metadata[key] = value;
  });

  return {
    audio: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "audio/mpeg",
    metadata,
  };
}
