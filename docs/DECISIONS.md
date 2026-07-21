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

## 2026-07-20 — Tests with Vitest
Standard, fast, zero-config with TS. Business-logic tests target the DNA schema and the DNA→composition-plan mapping, per the working agreement.
