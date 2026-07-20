# Tunz, AI Artist Studio

**Build an AI artist, not just a track**

AI music sites like Suno and Udio allow users to generate songs with a prompt. My hypothesis is that generating music this way misses important aspects of music culture:

1. Music doesn't materialize out of thin air. Every artist has a back story. Every song generated should be part of that story.
2. Music fans get obsessed with backstory, and AI music superfans (listeners who would have repeat streams and deep engagement) would therefore want fully fleshed out AI artists to engage with.
3. AI music creators are already doing this. We see AI music creators over and over again building full AI artist profiles and pages, uploading them to streaming sites like Spotify.

Tunz closes that gap by giving users creative control to build an AI artist and shape their Creative DNA, which in turn generates a backstory, artist page and profile, and accompanying tracks.

## Prototype

A simple user flow to validate the approach. The aim is a magical user experience around this concept, executed as thoughtfully and thoroughly as possible. Constrain this to a 1–2 hour build.

A user builds an AI artist from a prompt, then adjusts Creative DNA inputs to get meaningful creative leverage over iteration, variation, and refinement. That DNA drives generation of an artist profile with images, bio, one album cover with description, and 3 candidate tracks of 30 seconds, one of which the user sets as the single. All generated via API and persisted.

### Seed prompt

Free text box: "Tell me about the artist you want to create"

- If a user references an existing artist or band, remove the specific reference and substitute a summary of that artist's style.
- Handle this visibly, not silently. Show the user how the reference was interpreted and what style summary was substituted, so it reads as a feature rather than an unexplained edit.

### Creative DNA controls

- **Era:** slider. Far Past, …, 1950s, 1960s, …, 2020s, …, Far Future
- **Influences:** 4 weighted genre sliders, dynamically generated from the prompt
- **Sonic Palette:** 7 bipolar sliders with named poles
    - Pristine ←→ Lo-fi
    - Sparse ←→ Dense
    - Cold ←→ Warm
    - Improvised ←→ Structured
    - Loud ←→ Quiet
    - Organic ←→ Synthetic
    - Dark ←→ Hopeful
- **Vocal Character:** 2D pad — whispers ←→ screams, clean ←→ damaged
- **Lyrical obsessions:** tag chips, add/remove, freeform. Pre-populate 4 from the prompt.
- **Visual Style:** tag chips, add/remove, freeform. Pre-populate 2 from the prompt.

### Iteration mechanics

- **Keep:** every field carries a Keep toggle. Kept fields survive a regenerate and persist across many rounds as the user converges.
- **Regenerate:** the button reads "Regenerate the rest". Claude regenerates everything not marked Keep, staying coherent with what was kept.
- **Per-artifact regenerate:** regenerate this cover, track 2, the bio. Each artifact regenerates independently against the current DNA without disturbing the rest of the artist. This is the most common real iteration need, and it is nearly free once the generation module is a pure function per artifact.
- **Nudge:** freeform instruction on the whole artist ("make them meaner, move them five years later, less polished"). Claude returns a patch to the Creative DNA, not a fresh object, and the controls visibly move to their new positions so the change is legible.
- **Provenance:** each generated artifact is returned alongside the DNA fields that drove it. Hovering an artifact highlights those fields. This is the evidence that the controls have real leverage rather than the appearance of it.

### Creative DNA as an object

- Schema-validated JSON. Every generation path reads from it; nothing generates from the raw seed prompt directly.
- Persisted per revision rather than overwritten. One storage decision buys undo, the nudge diff, and a revision history on the artist page.
- The sonic palette renders as a read-only radar. It becomes the artist's signature silhouette on their card, and the nudge diff becomes a shape morphing. Display only; interactive radar dragging is not worth the build risk.

### DNA to generation parameters

- Controls must drive **structural generation parameters**, not only descriptive language inside a prompt. Vibe adjectives are weak levers; structural choices are strong ones. This is what stops the sliders having obvious leverage over the bio and images while having near zero leverage over the music, which is what users actually came for.
- Use ElevenLabs composition plans rather than one-shot prompts, and pin `model_id` to `music_v2`. A plan is `{positive_global_styles, negative_global_styles, chunks: [...]}`.
- The bipolar sliders map onto positive and negative styles almost exactly, which is the reason this control design earns its keep. A slider at the Lo-fi pole emits positive styles like "lo-fi, tape saturation" and negative styles like "pristine, polished". Distance from center becomes the weighting. That is a structural lever on the audio rather than an adjective in a prompt.
- Rest of the mapping: era to BPM and production-era style tokens, influences to how many style tokens each genre contributes, the vocal pad to vocal style tokens, lyrical obsessions to lyrics.
- Set `respect_sections_durations` to false. It trades precise timing for better audio quality, which is the right trade at 30 seconds.
- If a copyrighted artist reference survives our own stripping, the API returns a `bad_prompt` or `bad_composition_plan` error carrying a suggested replacement. Catch it, use the suggestion, and surface it the same visible way as the seed-prompt stripping. Belt and braces on the same requirement.
- Same principle for images: era and visual style drive model choice and aspect ratio, not only prompt text.

### Music API facts

Verified against the live API. Build to these rather than rediscovering them.

- **Use one 30-second chunk, not a multi-chunk plan.** Chunk boundaries land as abrupt hard cuts even with `respect_sections_durations: false`. A single chunk lets the model place the intro and vocal entry itself, which transitions naturally.
- **Chunk `text` is lyrics, not direction.** The model sings whatever `text` contains. Text carries the lyric seed only; all prose direction lives in the style arrays.
- **Chunk `text` over ~200 characters returns a bare 500.** 180 passes, 201 fails, and nothing in the docs hints at it. Clamp to 180 at a word boundary.
- **`context_adherence` is an enum** (`low` | `medium` | `high`), not a 0–1 float. Map from the improvised↔structured slider in thirds.
- **The response body is raw audio**, not JSON. Track metadata comes back on response headers.
- **A 30-second track generates in ~5–6s.** Set the music timeout to 90s: headroom for load variance, still fast enough to fail and retry inside a web request.

### Verification, hour one

Before building anything on top of the mapping, verify with the dry-run CLI that the controls reach the audio. Generate one artist twice, identical except one slider pushed to each extreme, and listen. Measure it as well as hearing it — 85% spectral rolloff is a good proxy for the organic↔synthetic axis. If the two tracks are indistinguishable then the controls are not reaching the audio layer, and the whole control design needs rethinking. That is a finding worth writing down either way; discovering it at hour six is the bad outcome.

### Generated profile (output, not controls)

- Bio, portrait, one album cover with description, 3 tracks at 30 seconds each.
- **Set as single:** the user picks one of the 3 candidates as the artist's single. The other two stay on the page as catalogue tracks. Called "single" in the UI, canonical in the schema. Framed to the user as the track that defines the artist.
- A user can play any track and explore any already-generated artist page.
- The site ships with a seeded roster, so a visitor lands on a populated, working site rather than an empty state and a spinner.

## Requirements, constraints, assumptions

- Deployed on the web, to Vercel via pushes to a main GitHub branch.
- **Design.** A visitor may know nothing about AI music and may only be a casual listener. The site should be clear about what this is and how to use it. Use Claude Design for the initial pass.
- **Persistence and storage.** Neon (Postgres) for Creative DNA revisions and artist metadata; DNA rows are small JSON, so store every revision and do not overwrite. One blob store for both images and audio — Vercel Blob — because splitting them across two providers doubles the integration surface for no benefit.
- Seeded artists are ordinary rows in the same schema, rendered by the same components. No demo-mode branching through the app: the browse page simply has artists in it because the database is not empty. The only genuine fallback is the narrow case where a live generation fails, which should say so gracefully and point at the existing roster.
- Seed assets are committed to the repo rather than held in blob storage.
- AI-artist disclosure on every public artist page.
- **Generation runs in two waves:** 3 single candidates, the user picks, then the rest of the artist. Calls parallelize within a wave. The waves exist so the user's pick is real, not as a technical constraint.
- **APIs.** Music: ElevenLabs. Images: `gpt-image-1` for portraits and covers both, so there is one image integration instead of two. Artist creative state and prompts: Claude API.

## Scope and build order

- Build the seeding script first, before any web UI. The demo corpus is not hand-authored, it is produced by the generation pipeline itself.
- Produce the Creative DNA schema first and give it to me for review.
    - Fields, and only these: seed prompt, era (single ordinal value), influences (4 weighted genres, normalized), sonic palette (7 signed bipolar axes), vocal character (2 signed pad coordinates), lyrical obsessions (string set), visual style (string set).
    - Generated output is not part of the DNA. The DNA is input state only.
    - Bipolar slider values are signed, −1 to 1, 0 neutral. The sign says which pole, the magnitude says how hard. This is what makes the mapping to positive and negative styles mechanical rather than a pile of conditionals.
    - Style tokens live in a separate mapping table keyed by axis and pole, not in the schema, so the token vocabulary tunes between runs without a migration.
    - A revision stores the full DNA rather than a diff. Rows are tiny and it keeps undo and the nudge diff trivial.
    - Keep flags are editing state, not artist identity. They live alongside the DNA, not inside it.
    - Provenance is stored on artifacts, not on the DNA.
- Claude Code writes a generation module with a CLI entry point: a pure function, DNA in, artifacts out. Not a web route.
- Give the CLI a `--dry-run` that stubs the media APIs and only calls Claude, so prompt iteration costs cents and runs in a terminal with no browser and no deploy.
- Run the CLI locally to produce the corpus and commit the results as fixtures.
- The web app is built on top of the same module.
- Curate in two stages so audio credits are only spent on keepers. Generate roughly 12 artists with `--dry-run`, pick the best 6 on the strength of their DNA and bio, then generate audio and images for those 6 only. The curation is a taste act and one of the few places human judgment is legibly visible in the artifact.
- Curate the roster around a contemporary-pop center of gravity, with spread across eras and moods. The target user is a casual listener, and the roster is the first thing they see.
- Budget check before the full run: 6 artists at 3 tracks of 30 seconds. Generate in two batches so one bad prompt cannot burn the allowance.

### Priorities

- **P0, must ship:** seed prompt, Creative DNA controls, Keep and Regenerate, per-artifact regenerate, DNA mapped to composition plan styles, 3 candidate tracks with set-as-single, one artist generated end to end, playback, browse the seeded roster, graceful failure on live generation.
- **P1:** Nudge with visible diff, provenance on hover.
- **P2, (optional) if time allows:** freeform round trip on individual fields, revision history UI, coherence scoring of artifacts against the DNA.

---

(Inspired by the William Gibson novel *Idoru*, featuring an AI pop star.)
