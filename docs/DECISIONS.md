# Decisions

Lightweight ADR. Newest entries last.

## 2026-07-20 — Stack: Next.js (App Router) + TypeScript + Tailwind
Confirmed with Gabe. First-class on Vercel, matches Claude Design output, one repo hosts both the CLI generation pipeline and the web app.

## 2026-07-20 — DB access: @neondatabase/serverless with raw SQL
Confirmed with Gabe over Drizzle/Prisma. Three small JSONB-heavy tables don't justify an ORM in a 2-hour build. Hand-written `lib/db/schema.sql`, applied by `npm run db:migrate`.

## 2026-07-20 — API clients: official SDKs for Claude and OpenAI, plain fetch for ElevenLabs
Anthropic and OpenAI SDKs are well-typed and save time. ElevenLabs music is one endpoint returning raw audio with metadata in headers — a typed SDK adds nothing over fetch there.

## 2026-07-20 — Pre-commit via versioned .githooks/ + core.hooksPath
Zero dependencies (no husky). `npm install` wires it through the `prepare` script, so every contributor gets the CLAUDE.md-required check: tsc, lint, test, build.

## 2026-07-20 — Parallelize generation calls within each wave
Gabe's directive: latency is a UX risk. Wave 1 fires 3 candidate tracks concurrently; wave 2 fires bio + portrait + cover concurrently. Only the wave boundary itself is sequential (product decision — the user's pick must be real).

## 2026-07-20 — tsx (dev dependency) for CLI scripts
Node 25 strips TS types natively but can't resolve the `@/` path alias the app code uses. `node --import tsx` runs the CLI scripts with full tsconfig resolution; zero impact on the deployed app (devDependency only).

## 2026-07-20 — ElevenLabs concurrency is capped at 2 by the subscription
A third concurrent music call returns 429 concurrent_limit_exceeded. The music client now carries a 2-slot semaphore plus one retry, so waves still fire with Promise.all and the overflow queues transparently. Note: the semaphore is per-process — on serverless, parallel instances could still collide, which the retry absorbs.

## 2026-07-20 — Seed media served from public/, not Blob
The linked Vercel Blob store is configured private, so public uploads fail. The spec wants seed assets committed to the repo anyway: the seed script copies media into public/artists/<slug>/ and stores root-relative URLs in the same blob_url column live generation uses — components stay uniform, no demo branching. Live generation still targets Blob; the store needs flipping to public access (or a small authenticated proxy route) before the create flow ships.

## 2026-07-20 — Metal-drift fix: vocal bands, production-only tokens, quiet-aware BPM
Live creations skewed heavy metal while fixtures sounded right. Root causes (found from stored DNA + reconstructed plans, not guesswork): (1) the vocal pad's vocabulary had no gradation — any value past the 0.15 deadzone emitted "screamed vocals"/"damaged vocal texture" at full strength, so half the pad meant screaming; (2) era/axis tokens forced genre and instrumentation ("1950s rock and roll production", "live drums", "trap hi-hats") onto every artist; (3) era BPM was fixed, pinning quiet artists to radio tempo. Decisions: vocal axes use mild→extreme bands (belted/raspy at ≤0.55, extremes only past 0.8); era/axis tokens are production descriptors only; loud↔quiet modulates BPM (quiet −20%, loud +10%). Ruled out with controlled A/Bs: negative_global_styles works (2888 vs 7007 Hz rolloff with/without), and the React controls write DNA faithfully. All in the token table — no schema change, which is exactly why the vocabulary lives outside the schema.

## 2026-07-20 — Cross-axis combo tokens + lead-genre anchor
Single-axis tokens can't express "solo, no band", and a genre with spread-thin weights was getting outvoted by palette adjectives. Sparse ≤ −0.4 + quiet ≥ 0.4 + organic ≤ −0.4 now adds "intimate solo performance" to positives and band/drum-kit/percussion to negatives; the heaviest influence always contributes at least two genre tokens. Confirmed by ear on Wren Halloway's stored DNA.

## 2026-07-20 — Tests with Vitest
Standard, fast, zero-config with TS. Business-logic tests target the DNA schema and the DNA→composition-plan mapping, per the working agreement.

## 2026-07-21 — Fix: send styles and context_adherence where music_v2 reads them
A docs audit (api-reference/music/compose + music/create-composition-plan) showed our request used the music_v1 shape under a music_v2 pin: `positive/negative_global_styles` and top-level `context_adherence` / `respect_sections_durations` are not part of the v2 schema, while the fields v2 does read — `chunks[].positive_styles/negative_styles/context_adherence` — went empty. The API 200s on unknown keys, so this failed silently. Styles now live on the chunk under a ranked budget (7 positives per the docs' 6–7 recommendation; BPM, era, lead genre, and active vocal axes guaranteed, rest by magnitude), negatives capped at 4 and emitted only for leans ≥0.6, context_adherence inside the chunk, respect_sections_durations dropped (v1-only). Also fixed while in the mapping: influence token count uses ceil (a 10% genre no longer quantizes to zero tokens), and the vocal band at 0.6 no longer emits "screamed vocals". Lyrics are now multi-line (the ~200-char limit is per line): Claude writes 4–8 lines / 45–70 words for 30s, clamped per line at 180.
Caveat to re-verify: the 2026-07-20 metal-drift ADR recorded an A/B where negative_global_styles appeared to move rolloff (2888 vs 7007 Hz) — either the server leniently merges v1 keys or that was single-sample noise. Re-run the extreme-slider A/B (`npm run ab-test`) against the new chunk-style payload before regenerating fixtures.
