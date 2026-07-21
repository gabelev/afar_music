# Handoff: AFAR Music — AI Artist Studio

## Overview
Initial design for AFAR Music (see `docs/SPEC.md` in the repo): a site where a user builds an AI artist from a seed prompt, shapes its **Creative DNA** with structural controls, and generates an artist profile (bio, portrait, album cover, 3 candidate tracks with a user-picked single). This handoff covers the full P0/P1 user flow: landing + roster browse, the 3-step creation studio, and the artist page.

Target audience is a **casual listener new to AI music** — the design leans on plain-language copy, pre-filled controls, and progressive explanation rather than onboarding overlays.

## About the Design Files
`AFAR Music.dc.html` is a **design reference created in HTML** — an interactive prototype showing intended look and behavior, not production code. Recreate it in the target stack from the spec (Next.js/React on Vercel, Neon Postgres, Vercel Blob, ElevenLabs / gpt-image-1 / Claude APIs) using that codebase's patterns. All generation in the prototype is mocked with canned data and timeouts; the spec's generation module replaces it.

The visual language comes from the bundled **Classical design system** (`_ds/classical-…/styles.css` + `readme.md`) — treat its tokens and component classes as the source of truth for styling.

## Fidelity
**High-fidelity** for layout, typography, spacing, color, and interaction design — recreate closely.
**Placeholders**: artist portraits and album covers render as muted two-tone `oklch` gradient tiles with the artist's initials; in production these are `gpt-image-1` images. Track playback is simulated (30s timer); production plays real ElevenLabs audio.

## Screens / Views

### 1. Home (landing + roster)
- **Purpose**: explain what AFAR is in one glance; browse and play seeded artists.
- **Layout**: sticky header; hero (max-width 1040px, 76px top padding): 60px Cormorant Garamond h1 ("Build an AI artist, *not just a track.*", second line italic), 17px sub-paragraph (max 600px), primary CTA. Below a hairline rule: 3-column "how it works" (01 Describe / 02 Shape their Creative DNA / 03 Meet your artist) — gold 30px numerals, 20px semibold headings, 13.5px body. Roster: rule-bounded section head ("The roster" 34px + "N ARTISTS" kicker), 3-column card grid (gap `--space-6`).
- **Roster card**: 1px divider border, radius 4px; inner gradient tile (aspect 1:1, matted with `--space-2` padding) with italic serif initials + small white radar polygon (52px, bottom-right); below: 22px serif name + era kicker, 13px muted tagline. Hover: `--shadow-md` + accent border.
- **Footer line**: letterspaced 10.5px AI-disclosure: "EVERY ARTIST AND SONG ON AFAR IS AI-GENERATED, SHAPED BY A HUMAN."

### 2. Artist page
- **Layout**: `grid-template-columns: 360px 1fr; gap:56px`. Left: matted portrait tile; "SONIC SIGNATURE" card — 7-axis radar (SVG polygon, accent stroke 1.5px, 10% accent fill, 3 hairline rings, axis labels = right-pole names at 7.5px). Right: era + genre tags, 52px serif name, gold kicker "AI ARTIST · MADE ON AFAR" (mandatory disclosure), bio paragraph (15.5px/1.65), single card, catalogue list, debut record row.
- **Single card**: 1px **accent** border (never filled), kicker "THE SINGLE — THE TRACK THAT DEFINES THEM", 52px round outlined play button, 24px serif title, 2px progress hairline, tabular time.
- **Catalogue**: 2 rows separated by hairlines; 36px outlined play buttons.
- **Debut record**: 120px matted cover tile + kicker/title/description.

### 3. Studio — step 1 (Describe)
- Stepper pills (1 Describe / 2 Shape the DNA / 3 Meet your artist): active = accent border + accent-100 tint; done = ink text.
- 44px serif prompt heading, explainer paragraph (includes the "we never copy anyone" promise), `.input` textarea (min-height 130px), 4 example prompt chips (`tag-outline`, one triggers the reference-strip demo), primary CTA "Shape their Creative DNA →" (45% opacity until prompt > 3 chars).

### 4. Studio — step 2 (Creative DNA)
- **Interpretation card** (always shown, top): accent-100 fill, 3px accent left rule, kicker "HOW WE READ YOUR PROMPT". If a real artist was referenced: "You mentioned X. We don't copy real artists, so we translated that into a style instead: '…'". This is the spec's *visible* reference-stripping.
- **Layout**: `1fr 300px` grid. Left: six sections stacked between hairline rules, **all pre-opened**; header row = 19px serif title + 12.5px muted hint, right-aligned live value summary in accent-700 + chevron (rotates 180° when open). Sections: Era (0–10 ordinal slider, FAR PAST→FAR FUTURE endpoints), Influences (4 weighted sliders, uppercase genre labels 110px + tabular %), Sonic palette (7 bipolar sliders, center notch, fill grows from center, pole labels 88px each side, per-axis Keep), Vocal character (240×200 2D pad, crosshair cursor, accent dot 16px, WHISPERS↔SCREAMS / CLEAN↔DAMAGED axis labels), Lyrical obsessions + Visual style (accent tag chips with ✕ remove, add input + button).
- **Sliders**: 1px hairline track (`--color-neutral-400`), 1px accent fill, 15px thumb (bg fill, 1.5px accent border, translateX(-50%)). Pointer-drag anywhere on track.
- **Keep toggles**: pill button per field (era, influences, each palette axis ×7, vocal, obsessions, visual). Off: divider border, muted text, "Keep". On: accent border, accent-100 fill, accent-700 text, "✓ Kept". 150ms transition.
- **Right rail** (sticky, top 92px): live radar card ("This shape becomes their signature."), and an action card: kept-field count sentence, secondary "↻ Regenerate the rest" (rerolls only non-kept fields), primary "Generate my artist →", kicker note "WE'LL WRITE 3 CANDIDATE SINGLES FIRST…".

### 5. Studio — step 3 (Meet your artist)
- **Generating state** (per wave): 5 pulsing 3px accent bars (staggered `pulseBar` 1s), 30px serif message, muted sub-line. Wave one: "Writing three candidate singles…" Wave two (after pick): "Great choice. Painting their portrait, writing their story…"
- **Candidates**: heading "Three ways this artist could sound.", hairline-separated rows: 48px outlined play, 22px serif title, italic provenance note ("Leans hopeful — closest to the palette as set"), progress hairline, 0:30, secondary button "Make this the single".
- **Profile**: top DNA strip (bordered card: "CREATIVE DNA" kicker + 6 chips: era/influences/palette/vocal/obsessions/visual + hint "Hover anything below to see which DNA drove it."). Grid `320px 1fr`: left portrait (matted) + regen button + debut record card; right name, single card, 2 catalogue rows with inline "↻ regenerate" per track, bio with "↻ Rewrite the bio".
- **Provenance hover (P1)**: hovering portrait/cover/bio/tracks sets a 2px accent outline (45% alpha, 3px offset) on the artifact and lights the driving DNA chips (accent border + accent-100 fill). Map: portrait←[visual, era]; cover←[visual, palette]; bio←[obsessions, era, influences]; tracks←[palette, vocal, influences, era].
- **Nudge bar (P1)**: bordered card, input + primary "Nudge". Applies a **patch** to the DNA; shows diff chips ("dark ▲", "era → 2030s", "vocals: harsher") + "See the controls →" link back to step 2 where controls sit at their new positions (all control styles have 150ms transitions so moves are legible).
- **Footer actions**: primary "Save to the roster" (prepends artist to roster, navigates to their page), secondary "← Back to the DNA".
- **Per-artifact regenerate**: 900ms busy state (artifact at 40% opacity, label swaps to "Repainting…"/"Rewriting…"), then only that artifact changes.

## Interactions & Behavior
- View switching is client state (`home` / `studio` / `artist`), no page reloads; `fadeUp` 0.4–0.5s ease on view entry.
- Sliders/pad: pointerdown sets value from pointer x (and y for pad), window-level pointermove/up during drag, `touch-action:none`.
- Playback: one track at a time; play button ▶ ⇄ ❚❚; hairline progress + counting tabular time; auto-stops at 0:30. (Production: real audio element.)
- Two-wave generation per spec: candidates first, pick is real, then the rest.
- "Regenerate the rest" preserves every field marked Keep (Keep flags are editing state, stored alongside — not inside — the DNA).
- Card/button hovers per design system: accent-100 tints on outlined buttons, accent border + shadow-md on cards; `:focus-visible` = 2px accent outline (from styles.css).

## State Management
Prototype state (maps to spec schema): `view, artistId, roster[], step, prompt, interp, dna {era: 0–10 ordinal, influences: 4×{name, w 0–1}, pal: 7 signed floats −1…1, voc: {x,y} signed, obs: string[], vis: string[]}, keep{}, phase, candidates[], picked, prof, playing, prog, nudgeDiff, hoverProv, regen{}`.
Spec alignment: DNA is input-state only; bipolar values signed −1…1 (sign = pole, magnitude = weight → positive/negative style arrays); revisions persist whole-DNA per round; provenance stored on artifacts.

## Design Tokens
All from `_ds/classical-…/styles.css` — use the variables, never raw values:
- Ground `--color-bg` #f3f2f2; surface #eae9e9; text #201f1d; accent #b68235 (gold, **stroke only** — never large fills); divider = 16% ink; ramps `--color-neutral/accent-100…900`.
- Type: headings `--font-heading` Cormorant Garamond (max weight 600; display sizes weight 400); body **overridden to 'Instrument Sans'** (Google Fonts, 400/500/600) per client feedback — override `--font-body` at the app root; tabular numerals (`font-variant-numeric: tabular-nums`) on all figures/times/counts.
- Spacing `--space-1…8` (4.6/9.2/13.8/18.4/27.6/36.8px); radius sm 2 / md 4 / lg 7px; shadows `--shadow-sm/md/lg`.
- Letterspaced kickers: 9.5–11px, 1.2–1.8px tracking, neutral-600 (accent-700 when branded).
- Gradient placeholder tiles: `linear-gradient(135deg, oklch(0.55 0.07 H1), oklch(0.36 0.06 H2))` per-artist hue pairs.
- Radar geometry: 7 axes from 12 o'clock clockwise (Lo-fi, Dense, Warm, Structured, Quiet, Synthetic, Hopeful); radius = r × (0.2 + 0.4 × (v+1)) for v ∈ −1…1.

## Copy (exact strings matter — warm, plain-spoken)
Key lines to keep: hero + sub; "Tell me about the artist you want to create."; "we never copy anyone"; interpretation-card sentences; "Everything below is already set from your prompt — you can generate right away…"; "This shape becomes their signature."; kept-fields sentence; "Three ways this artist could sound." + single explanation; nudge placeholder "Try 'make them meaner', 'move them ten years later', 'less polished'…"; AI-disclosure footer. All UI says **single** (canonical in schema).

## Assets
No external assets. Radars are inline SVG polygons; portraits/covers are CSS gradients standing in for generated images. Fonts via Google Fonts (Cormorant Garamond + Lora load from styles.css; Instrument Sans added by the app). Icons: design system specifies Lucide — the prototype uses text glyphs (▶ ❚❚ ↻ ✕ ▾ ←); swap for Lucide `play/pause/rotate-ccw/x/chevron-down/arrow-left` in production.

## Files
- `AFAR Music.dc.html` — the interactive prototype (all three views; template markup + a `Component` logic class with the mock data and all interaction handlers).
- `design-system/styles.css` + `design-system/readme.md` — the Classical design system tokens, component classes, and usage guidance.
