# AFAR Music — Build an AI artist, not just a track

AFAR lets anyone build a fully-realized AI artist: describe them in a sentence, shape their **Creative DNA**, hear three candidate singles, pick the one that defines them, and get a complete artist — backstory, portrait, debut record, and catalogue — on a public page. Every artist and song on AFAR is AI-generated, shaped by a human, and labeled as such.

The product spec lives in [docs/SPEC.md](docs/SPEC.md); running decisions in [docs/DECISIONS.md](docs/DECISIONS.md).

## Product features

- **Seed prompt** — free text ("a rain-soaked synthpop recluse"). References to real artists are stripped and replaced with a style summary, shown to the user as a feature ("How we read your prompt"), never silently.
- **Creative DNA controls** — era slider (Far Past → Far Future), 4 weighted genre influences, 7 bipolar sonic-palette sliders (Pristine↔Lo-fi, Sparse↔Dense, Cold↔Warm, Improvised↔Structured, Loud↔Quiet, Organic↔Synthetic, Dark↔Hopeful), a 2D vocal pad (whispers↔screams / clean↔damaged), and tag chips for lyrical obsessions and visual style.
- **Keep + Regenerate the rest** — every control group has a Keep toggle; regeneration rebuilds everything else coherently around kept fields.
- **Two waves** — wave 1 writes 3 candidate singles (parallel); the user picks one as **the single**; wave 2 builds bio + portrait + cover (parallel). The pick is real: nothing downstream is generated before it.
- **Per-artifact regenerate** — any single track, the bio, the portrait, or the cover regenerates independently against the current DNA.
- **Nudge** — freeform instruction on the whole artist ("make them meaner"); Claude returns a *patch* to the DNA, the moved fields are shown, and the radar silhouette morphs.
- **Provenance** — every artifact carries the DNA fields that drove it; hovering an artifact highlights them.
- **The roster** — a seeded, fully playable set of 6 curated artists; visitors land on a working site, never an empty state. Live-created artists are ordinary rows in the same schema (no demo-mode branching).

## Architecture

```
                    ┌──────────────────────────────────────────────┐
seed prompt ──────► │  lib/generation  (pure: DNA in → artifacts)  │
                    │  claude.ts   seed→DNA, identity, lyrics,     │
                    │              nudge patch (Claude API)        │
                    │  mapping.ts  DNA → ElevenLabs composition    │
                    │              plan (structural, not vibes)    │
                    │  music.ts    music_v2, 1×30s chunk, 2-slot   │
                    │              concurrency semaphore           │
                    │  images.ts   gpt-image-1, kind→aspect,       │
                    │              era→medium, JPEG output         │
                    └──────┬────────────────────────┬──────────────┘
                           │                        │
              scripts/ (CLI, --dry-run)      app/api/* (thin wrappers)
              generate │ fill-media │ seed    dna │ tracks │ profile │
                           │                  nudge │ save │ media
                           ▼                        ▼
                    fixtures/ + public/       Neon Postgres
                    (committed seed corpus)   artists │ dna_revisions │
                                              artifacts │ media
```

Key principles (see the spec):

- **Every generation path reads schema-validated Creative DNA** (`lib/dna/schema.ts`, Zod). Nothing generates from the raw prompt directly.
- **Controls are structural levers.** Bipolar slider sign picks a pole, magnitude ranks its tokens; everything competes for the `music_v2` chunk's style budget (`chunks[0].positive_styles`, ~7 tokens — the location and count the API docs actually specify). BPM, era, the lead genre, and active vocal axes hold guaranteed slots; only strong leans (≥0.6) emit a negative ban, capped at 4. Era sets a base BPM (modulated by loud↔quiet: quiet −20%, loud +10%) plus production-era tokens; improvised↔structured maps to the chunk's `context_adherence` enum. Vocal-pad axes use mild→extreme intensity bands (belted/raspy before screamed/damaged) so a dot near center never reads as screaming. Cross-axis combos add explicit structure: sparse + quiet + organic together emits "intimate solo performance" and pushes band/percussion into the negatives; the heaviest influence always anchors the genre with two tokens.
- **DNA revisions are full copies, never overwritten** (`dna_revisions`), which makes undo, the nudge diff, and revision history trivial.
- **Style token vocabulary lives in a mapping table** (`lib/generation/styleTokens.ts`), not the schema — tunable without a migration.
- **Waves parallelize internally** (`Promise.all`); only the wave boundary is sequential, and that's a product decision.

## Tech stack & dependencies

| Concern | Choice |
| --- | --- |
| Web | Next.js (App Router) + TypeScript + Tailwind, "Classical" design system from the Claude Design handoff (`designs/`, tokens in `app/design-system.css`) |
| Creative state & prompts | Claude API (`@anthropic-ai/sdk`, structured outputs via Zod) |
| Music | ElevenLabs `music_v2` composition plans (plain `fetch`; raw-audio responses) |
| Images | OpenAI `gpt-image-1` (portraits + covers, JPEG) |
| Database | Neon Postgres via `@neondatabase/serverless` (raw SQL, `lib/db/schema.sql`) |
| Live media | `media` table streamed by `/api/media/[id]` (the linked Blob store is private; see DECISIONS.md) |
| Seed media | Committed to the repo, served from `public/artists/` |
| Tests | Vitest (`lib/dna`, `lib/generation/mapping`) |
| Hosting | Vercel, deploying `main` |

## Getting started

```bash
npm install                 # also wires the pre-commit hook (core.hooksPath)
cp .env.example .env        # or bring your own: ANTHROPIC_API_KEY, ELEVENLABS_API_KEY,
                            # OPENAI_API_KEY, DATABASE_URL (Neon)
npm run db:migrate          # apply lib/db/schema.sql
npm run seed                # load the committed fixtures into the DB
npm run dev
```

### CLI (the same module the web app uses)

```bash
npm run generate -- --prompt "a gravel-voiced country storyteller" --dry-run   # Claude only, costs cents
npm run generate -- --prompt "..."                                             # full artist with media
npm run fill-media -- <fixture-slug> ...                                       # add audio+images to a dry-run fixture
npm run ab-test -- --dna fixtures/<slug>/dna.json --lyrics "..." --out t.mp3 --set organicSynthetic=1
npm run ab-test -- --measure a.mp3 b.mp3                                       # mean 85% spectral rolloff (needs ffmpeg)
```

## Verification

Pre-commit (enforced, versioned in `.githooks/`): `npx tsc --noEmit && npm run lint && npm test && npm run build`. The create flow is verified end-to-end against a local prod server (see PR descriptions); keep `main` deployable at every commit — Vercel tracks it.

## Repo map

```
app/            pages (roster, artist/[slug], create studio) + API routes
components/     Radar (sonic-signature SVG), TrackPlayer
lib/dna/        Creative DNA Zod schema (input state only)
lib/generation/ pure generation module: claude, mapping, styleTokens, music, images
lib/db/         schema.sql, client, typed queries, media store
scripts/        generate (CLI), fill-media, seed, ab-test, db-migrate
fixtures/       committed corpus: 12 dry-run artists, 6 with media
public/artists/ seed media served statically
designs/        Claude Design handoff (design system + mockup)
docs/           SPEC.md, DECISIONS.md
```
