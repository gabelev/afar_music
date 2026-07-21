import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompositionPlan } from "./mapping";
import { generateTrack } from "./music";

const plan: CompositionPlan = {
  chunks: [
    {
      text: "rain keeps its own time",
      duration_ms: 30_000,
      positive_styles: ["folk", "90 BPM"],
      negative_styles: ["drum machines"],
      context_adherence: "medium",
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("generateTrack", () => {
  it("POSTs a music_v2 body whose only keys are model_id and composition_plan", async () => {
    // Regression: the body used to carry top-level context_adherence and
    // respect_sections_durations — the first is a per-chunk field, the second
    // is music_v1-only; both were silently ignored by the API.
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    let captured: { url: string; init: RequestInit } | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        captured = { url, init };
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "audio/mpeg", "x-song-id": "song-123" },
        });
      }),
    );

    const result = await generateTrack(plan);

    expect(captured).toBeDefined();
    const body = JSON.parse(String(captured!.init.body));
    expect(Object.keys(body).sort()).toEqual(["composition_plan", "model_id"]);
    expect(body.model_id).toBe("music_v2");
    expect(body.composition_plan).toEqual(plan);
    expect(result.metadata["x-song-id"]).toBe("song-123");
    expect(result.contentType).toBe("audio/mpeg");
  });
});
