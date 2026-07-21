"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Radar } from "@/components/Radar";
import { TrackPlayer } from "@/components/TrackPlayer";
import type { CreativeDNA, SonicPalette } from "@/lib/dna/schema";
import { ERAS } from "@/lib/dna/schema";

/**
 * The creation studio: prompt → Creative DNA controls (with Keep toggles and
 * "Regenerate the rest") → wave 1 (3 candidate singles, pick one) → wave 2
 * (bio, portrait, cover) → save to the roster. Nothing persists until save.
 */

interface ReferenceNote {
  original: string;
  styleSummary: string;
}

interface CandidateTrack {
  position: number;
  title: string;
  lyricSeed: string;
  provenance: string[];
  audio: string;
}

interface Identity {
  name: string;
  bio: string;
  coverTitle: string;
  coverDescription: string;
  portraitPrompt: string;
  coverPrompt: string;
}

type KeepField = "era" | "influences" | "sonicPalette" | "vocalCharacter" | "lyricalObsessions" | "visualStyle";

/** Provenance for text/image artifacts (mirrors lib/generation/generate.ts). */
const BIO_PROV = ["seedPrompt", "era", "influences", "lyricalObsessions"];
const IMAGE_PROV = ["era", "visualStyle"];

const AXIS_META: { key: keyof SonicPalette; left: string; right: string }[] = [
  { key: "pristineLofi", left: "Pristine", right: "Lo-fi" },
  { key: "sparseDense", left: "Sparse", right: "Dense" },
  { key: "coldWarm", left: "Cold", right: "Warm" },
  { key: "improvisedStructured", left: "Improvised", right: "Structured" },
  { key: "loudQuiet", left: "Loud", right: "Quiet" },
  { key: "organicSynthetic", left: "Organic", right: "Synthetic" },
  { key: "darkHopeful", left: "Dark", right: "Hopeful" },
];

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
  return json as T;
}

export function CreateStudio() {
  const router = useRouter();
  const [step, setStep] = useState<"prompt" | "dna" | "pick" | "profile">("prompt");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [dna, setDNA] = useState<CreativeDNA | null>(null);
  const [referenceNotes, setReferenceNotes] = useState<ReferenceNote[]>([]);
  const [keep, setKeep] = useState<Record<KeepField, boolean>>({
    era: false,
    influences: false,
    sonicPalette: false,
    vocalCharacter: false,
    lyricalObsessions: false,
    visualStyle: false,
  });
  const [tracks, setTracks] = useState<CandidateTrack[]>([]);
  const [singlePosition, setSinglePosition] = useState<number | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [portrait, setPortrait] = useState("");
  const [cover, setCover] = useState("");
  const [highlight, setHighlight] = useState<string[]>([]);
  const [nudge, setNudge] = useState("");
  const [nudgeResult, setNudgeResult] = useState<{ explanation: string; changed: string[] } | null>(null);

  /**
   * Wave-2 prefetch: identity + images start the moment tracks are requested,
   * so by the time the user has listened and picked a single they're usually
   * already done. Keyed by DNA object identity — any DNA edit creates a new
   * object, which makes a stale prefetch miss and pickSingle regenerate fresh.
   * Failures resolve to null (never surfaced mid-listen); pickSingle falls
   * back to generating on demand.
   */
  const profilePrefetch = useRef<{
    dna: CreativeDNA;
    identity: Promise<Identity | null>;
    images: Promise<{ portrait: string; cover: string } | null>;
  } | null>(null);

  const fetchImages = (forDNA: CreativeDNA, id: Identity) =>
    Promise.all([
      post<{ image: string }>("/api/profile", { dna: forDNA, regenerate: "portrait", basePrompt: id.portraitPrompt }),
      post<{ image: string }>("/api/profile", { dna: forDNA, regenerate: "cover", basePrompt: id.coverPrompt }),
    ]).then(([p, c]) => ({ portrait: p.image, cover: c.image }));

  const startProfilePrefetch = (forDNA: CreativeDNA) => {
    if (profilePrefetch.current?.dna === forDNA) return; // same DNA → already in flight
    const identity = post<{ identity: Identity }>("/api/profile", { dna: forDNA })
      .then((r) => r.identity)
      .catch(() => null);
    const images = identity.then((id) => (id ? fetchImages(forDNA, id) : null)).catch(() => null);
    profilePrefetch.current = { dna: forDNA, identity, images };
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const readPrompt = () =>
    run("Reading your prompt…", async () => {
      const result = await post<{ dna: CreativeDNA; referenceNotes: ReferenceNote[] }>("/api/dna", { prompt });
      setDNA(result.dna);
      setReferenceNotes(result.referenceNotes);
      setStep("dna");
    });

  const regenerateRest = () =>
    run("Regenerating everything you didn't keep…", async () => {
      if (!dna) return;
      const kept: Record<string, unknown> = {};
      (Object.keys(keep) as KeepField[]).forEach((field) => {
        if (keep[field]) kept[field] = dna[field];
      });
      const result = await post<{ dna: CreativeDNA; referenceNotes: ReferenceNote[] }>("/api/dna", {
        prompt,
        kept,
      });
      setDNA(result.dna);
      if (result.referenceNotes.length > 0) setReferenceNotes(result.referenceNotes);
    });

  const generateTracks = () =>
    run("Writing three candidate singles… (~20 seconds)", async () => {
      if (!dna) return;
      startProfilePrefetch(dna); // wave 2 warms up while the user listens
      const result = await post<{ tracks: CandidateTrack[] }>("/api/tracks", { dna });
      setTracks(result.tracks);
      setSinglePosition(null);
      setStep("pick");
    });

  const regenerateOneTrack = (position: number) =>
    run(`Rewriting track ${position}…`, async () => {
      if (!dna) return;
      const result = await post<{ tracks: CandidateTrack[] }>("/api/tracks", {
        dna,
        regenerate: { position, existingTitles: tracks.filter((t) => t.position !== position).map((t) => t.title) },
      });
      setTracks((prev) => prev.map((t) => (t.position === position ? result.tracks[0] : t)));
    });

  const pickSingle = (position: number) =>
    run("Building the rest of the artist…", async () => {
      if (!dna) return;
      setSinglePosition(position);
      const prefetch = profilePrefetch.current?.dna === dna ? profilePrefetch.current : null;
      const id = (await prefetch?.identity) ?? (await post<{ identity: Identity }>("/api/profile", { dna })).identity;
      setIdentity(id);
      setStep("profile");
      // Images stream in behind the text; usually already resolved by the prefetch.
      const images = (await prefetch?.images) ?? (await fetchImages(dna, id));
      setPortrait(images.portrait);
      setCover(images.cover);
    });

  const regenerateProfilePiece = (kind: "bio" | "portrait" | "cover") =>
    run(`Regenerating the ${kind}…`, async () => {
      if (!dna || !identity) return;
      if (kind === "bio") {
        const result = await post<{ identity: Identity }>("/api/profile", { dna, regenerate: "bio" });
        setIdentity({ ...result.identity, name: identity.name });
      } else {
        const result = await post<{ image: string }>("/api/profile", {
          dna,
          regenerate: kind,
          basePrompt: kind === "portrait" ? identity.portraitPrompt : identity.coverPrompt,
        });
        if (kind === "portrait") setPortrait(result.image);
        else setCover(result.image);
      }
    });

  const applyNudge = () =>
    run("Nudging the whole artist…", async () => {
      if (!dna || !nudge.trim()) return;
      const result = await post<{ dna: CreativeDNA; explanation: string }>("/api/nudge", {
        dna,
        instruction: nudge,
      });
      setNudgeResult({ explanation: result.explanation, changed: diffDNA(dna, result.dna) });
      setDNA(result.dna);
      setNudge("");
    });

  const save = () =>
    run("Saving to the roster…", async () => {
      if (!dna || !identity || singlePosition === null) return;
      const result = await post<{ slug: string }>("/api/save", {
        dna,
        identity,
        tracks,
        singlePosition,
        portrait,
        cover,
      });
      router.push(`/artist/${result.slug}`);
    });

  const setPalette = (key: keyof SonicPalette, value: number) =>
    dna && setDNA({ ...dna, sonicPalette: { ...dna.sonicPalette, [key]: value } });

  return (
    <div className="page fade-up" style={{ maxWidth: 860 }}>
      {step === "prompt" && (
        <section>
          <p className="kicker">Create an artist</p>
          <h1 style={{ fontWeight: 400, fontSize: 48, margin: "0 0 var(--space-4)" }}>
            Tell me about the artist you want to create.
          </h1>
          <textarea
            className="input"
            style={{ minHeight: 120, fontSize: 16 }}
            placeholder="A rain-soaked synthpop recluse… a gravel-voiced country storyteller… anyone you can imagine."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: "var(--space-3)", fontSize: 16 }}
            onClick={readPrompt}
            disabled={!prompt.trim() || busy !== null}
          >
            Shape their Creative DNA →
          </button>
        </section>
      )}

      {step === "dna" && dna && (
        <section>
          <p className="kicker">Creative DNA</p>
          <h1 style={{ fontWeight: 400, fontSize: 42, margin: "0 0 var(--space-2)" }}>
            Everything below is set from your prompt.
          </h1>
          <p className="text-muted">
            Generate right away, or fine-tune anything first. Keep what you love — kept fields survive a
            regenerate.
          </p>

          {referenceNotes.length > 0 && (
            <div className="card" style={{ margin: "var(--space-4) 0" }}>
              <span className="card-kicker">How we read your prompt</span>
              {referenceNotes.map((note) => (
                <p key={note.original} className="card-body" style={{ fontSize: 14 }}>
                  You mentioned <strong>{note.original}</strong> — we can&apos;t copy an artist, so we translated
                  their style instead: <em>{note.styleSummary}</em>
                </p>
              ))}
            </div>
          )}

          <Group label="When does their music live?" kept={keep.era} onKeep={() => setKeep({ ...keep, era: !keep.era })}>
            <input
              type="range"
              min={0}
              max={ERAS.length - 1}
              step={1}
              value={dna.era}
              onChange={(e) => setDNA({ ...dna, era: Number(e.target.value) })}
              style={{ width: "100%", accentColor: "var(--color-accent)" }}
              aria-label="Era"
            />
            <div className="flex justify-between card-meta">
              <span>FAR PAST</span>
              <span className="tag tag-accent">{ERAS[dna.era]}</span>
              <span>FAR FUTURE</span>
            </div>
          </Group>

          <Group
            label="Influences — four genres, weighted"
            kept={keep.influences}
            onKeep={() => setKeep({ ...keep, influences: !keep.influences })}
          >
            {dna.influences.map((inf, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  className="input"
                  style={{ maxWidth: 220 }}
                  value={inf.genre}
                  onChange={(e) => {
                    const influences = dna.influences.map((x, j) => (j === i ? { ...x, genre: e.target.value } : x));
                    setDNA({ ...dna, influences });
                  }}
                  aria-label={`Genre ${i + 1}`}
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={inf.weight}
                  onChange={(e) => {
                    const raw = dna.influences.map((x, j) =>
                      j === i ? { ...x, weight: Number(e.target.value) } : x,
                    );
                    const total = raw.reduce((s, x) => s + x.weight, 0) || 1;
                    setDNA({ ...dna, influences: raw.map((x) => ({ ...x, weight: x.weight / total })) });
                  }}
                  style={{ flex: 1, accentColor: "var(--color-accent)" }}
                  aria-label={`${inf.genre} weight`}
                />
                <span className="card-meta" style={{ width: 38, textAlign: "right" }}>
                  {Math.round(inf.weight * 100)}%
                </span>
              </div>
            ))}
          </Group>

          <Group
            label="Sonic palette — seven dials between opposites; this shapes the sound most"
            kept={keep.sonicPalette}
            onKeep={() => setKeep({ ...keep, sonicPalette: !keep.sonicPalette })}
          >
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] items-start" style={{ gap: "var(--space-4)" }}>
              <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
                {AXIS_META.map((axis) => (
                  <div key={axis.key} className="flex items-center gap-3">
                    <span className="card-meta" style={{ width: 84, textAlign: "right" }}>
                      {axis.left}
                    </span>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={dna.sonicPalette[axis.key]}
                      onChange={(e) => setPalette(axis.key, Number(e.target.value))}
                      style={{ flex: 1, accentColor: "var(--color-accent)" }}
                      aria-label={`${axis.left} to ${axis.right}`}
                    />
                    <span className="card-meta" style={{ width: 84 }}>
                      {axis.right}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-center">
                <Radar palette={dna.sonicPalette} size={150} />
                <p className="card-meta" style={{ justifyContent: "center" }}>
                  This shape becomes their signature.
                </p>
              </div>
            </div>
          </Group>

          <Group
            label="Vocal character — drag the dot: how do they sing?"
            kept={keep.vocalCharacter}
            onKeep={() => setKeep({ ...keep, vocalCharacter: !keep.vocalCharacter })}
          >
            <VocalPad
              value={dna.vocalCharacter}
              onChange={(vocalCharacter) => setDNA({ ...dna, vocalCharacter })}
            />
          </Group>

          <Group
            label="Lyrical obsessions — what they can't stop writing about"
            kept={keep.lyricalObsessions}
            onKeep={() => setKeep({ ...keep, lyricalObsessions: !keep.lyricalObsessions })}
          >
            <TagEditor
              tags={dna.lyricalObsessions}
              onChange={(lyricalObsessions) => setDNA({ ...dna, lyricalObsessions })}
            />
          </Group>

          <Group
            label="Visual style — how they look; drives the portrait and cover"
            kept={keep.visualStyle}
            onKeep={() => setKeep({ ...keep, visualStyle: !keep.visualStyle })}
          >
            <TagEditor tags={dna.visualStyle} onChange={(visualStyle) => setDNA({ ...dna, visualStyle })} />
          </Group>

          <div className="flex flex-wrap items-center" style={{ gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
            <button type="button" className="btn btn-secondary" onClick={regenerateRest} disabled={busy !== null}>
              ↻ Regenerate the rest
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: 16 }}
              onClick={generateTracks}
              disabled={busy !== null}
            >
              Generate my artist →
            </button>
            <span className="card-meta">We&apos;ll write 3 candidate singles first — you pick the one that defines them.</span>
          </div>
        </section>
      )}

      {step === "pick" && (
        <section>
          <p className="kicker">The pick</p>
          <h1 style={{ fontWeight: 400, fontSize: 42, margin: "0 0 var(--space-2)" }}>
            Three ways this artist could sound.
          </h1>
          <p className="text-muted">
            Play each one. The track you pick becomes their <strong>single</strong> — the song that defines
            them. The other two stay on their page.
          </p>
          <div className="flex flex-col" style={{ gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
            {tracks.map((track) => (
              <div key={track.position} className="card">
                <TrackPlayer title={track.title} audioUrl={track.audio} subtitle={`“${track.lyricSeed.slice(0, 90)}…”`} />
                <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => pickSingle(track.position)}
                    disabled={busy !== null}
                  >
                    Make this the single
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => regenerateOneTrack(track.position)}
                    disabled={busy !== null}
                  >
                    ↻ Regenerate this track
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: "var(--space-3)" }}
            onClick={() => setStep("dna")}
            disabled={busy !== null}
          >
            ← Back to the DNA
          </button>
        </section>
      )}

      {step === "profile" && identity && dna && (
        <section>
          <p className="kicker">Your AI artist · Made on AFAR</p>
          <h1 style={{ fontWeight: 400, fontSize: 48, margin: "0 0 var(--space-4)" }}>{identity.name}</h1>
          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]" style={{ gap: "var(--space-6)" }}>
            <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
              <Hoverable provenance={IMAGE_PROV} onHover={setHighlight}>
                {portrait ? (
                  // eslint-disable-next-line @next/next/no-img-element -- generated preview
                  <img src={portrait} alt={`Portrait of ${identity.name}`} className="plate" />
                ) : (
                  <div className="card text-muted" style={{ aspectRatio: "2/3", justifyContent: "center", textAlign: "center" }}>
                    Painting the portrait…
                  </div>
                )}
              </Hoverable>
              <button type="button" className="btn btn-ghost" onClick={() => regenerateProfilePiece("portrait")} disabled={busy !== null}>
                ↻ Regenerate portrait
              </button>
              <Hoverable provenance={IMAGE_PROV} onHover={setHighlight}>
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- generated preview
                  <img src={cover} alt={`Album cover: ${identity.coverTitle}`} className="plate" />
                ) : (
                  <div className="card text-muted" style={{ aspectRatio: "1/1", justifyContent: "center", textAlign: "center" }}>
                    Pressing the cover…
                  </div>
                )}
              </Hoverable>
              <button type="button" className="btn btn-ghost" onClick={() => regenerateProfilePiece("cover")} disabled={busy !== null}>
                ↻ Regenerate cover
              </button>
            </div>
            <div>
              <Hoverable provenance={BIO_PROV} onHover={setHighlight}>
                {identity.bio.split("\n").filter(Boolean).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </Hoverable>
              <button type="button" className="btn btn-ghost" onClick={() => regenerateProfilePiece("bio")} disabled={busy !== null}>
                ↻ Regenerate bio
              </button>

              <div style={{ marginTop: "var(--space-4)" }}>
                <p className="kicker">The single</p>
                {tracks
                  .filter((t) => t.position === singlePosition)
                  .map((t) => (
                    <Hoverable key={t.position} provenance={t.provenance} onHover={setHighlight}>
                      <TrackPlayer title={t.title} audioUrl={t.audio} isSingle />
                    </Hoverable>
                  ))}
              </div>

              <div className="card" style={{ marginTop: "var(--space-4)" }}>
                <span className="card-kicker">Creative DNA — hover anything above to see which DNA drove it</span>
                <DNASummary dna={dna} highlight={highlight} changed={nudgeResult?.changed ?? []} />
              </div>

              <div className="card" style={{ marginTop: "var(--space-4)" }}>
                <span className="card-kicker">Nudge the whole artist</span>
                <div className="flex items-center gap-2">
                  <input
                    className="input"
                    placeholder="Make them meaner… move them five years later… less polished…"
                    value={nudge}
                    onChange={(e) => setNudge(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyNudge()}
                  />
                  <button type="button" className="btn btn-primary" onClick={applyNudge} disabled={busy !== null || !nudge.trim()}>
                    Nudge
                  </button>
                </div>
                {nudgeResult && (
                  <p className="card-body">
                    <strong>The DNA moved:</strong> {nudgeResult.explanation}{" "}
                    <span className="text-muted">
                      Regenerate any artifact above to hear and see the change.
                    </span>
                  </p>
                )}
              </div>

              <div className="flex items-center" style={{ gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
                <button type="button" className="btn btn-primary" style={{ fontSize: 16 }} onClick={save} disabled={busy !== null}>
                  Save to the roster
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setStep("pick")} disabled={busy !== null}>
                  ← Back to the candidates
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {busy && (
        <p className="tag tag-accent" style={{ marginTop: "var(--space-4)" }}>
          {busy}
        </p>
      )}
      {error && (
        <div className="card" style={{ marginTop: "var(--space-4)", borderColor: "var(--color-accent)" }}>
          <span className="card-kicker">That didn&apos;t work</span>
          <p className="card-body">{error} If it keeps happening, the seeded roster is always playable.</p>
        </div>
      )}
    </div>
  );
}

/** Which top-level DNA field paths changed between two DNAs (for the nudge diff). */
function diffDNA(before: CreativeDNA, after: CreativeDNA): string[] {
  const changed: string[] = [];
  if (before.era !== after.era) changed.push("era");
  if (JSON.stringify(before.influences) !== JSON.stringify(after.influences)) changed.push("influences");
  (Object.keys(before.sonicPalette) as (keyof SonicPalette)[]).forEach((axis) => {
    if (before.sonicPalette[axis] !== after.sonicPalette[axis]) changed.push(`sonicPalette.${axis}`);
  });
  if (
    before.vocalCharacter.whispersScreams !== after.vocalCharacter.whispersScreams ||
    before.vocalCharacter.cleanDamaged !== after.vocalCharacter.cleanDamaged
  )
    changed.push("vocalCharacter");
  if (JSON.stringify(before.lyricalObsessions) !== JSON.stringify(after.lyricalObsessions))
    changed.push("lyricalObsessions");
  if (JSON.stringify(before.visualStyle) !== JSON.stringify(after.visualStyle)) changed.push("visualStyle");
  return changed;
}

/** Wraps an artifact; hovering reports its provenance so the DNA panel can light up. */
function Hoverable({
  provenance,
  onHover,
  children,
}: {
  provenance: string[];
  onHover: (paths: string[]) => void;
  children: React.ReactNode;
}) {
  return (
    <div onMouseEnter={() => onHover(provenance)} onMouseLeave={() => onHover([])}>
      {children}
    </div>
  );
}

/** Compact DNA chip panel; chips glow when a hovered artifact's provenance covers them. */
function DNASummary({
  dna,
  highlight,
  changed,
}: {
  dna: CreativeDNA;
  highlight: string[];
  changed: string[];
}) {
  const isLit = (path: string) =>
    highlight.some((h) => h === path || h.startsWith(`${path}.`) || path.startsWith(`${h}.`));
  const chip = (path: string, label: string) => (
    <span
      key={path}
      className={isLit(path) ? "tag tag-outline" : changed.includes(path) ? "tag tag-accent" : "tag tag-neutral"}
      style={{ transition: "all 0.15s ease" }}
      title={changed.includes(path) ? "Moved by your nudge" : undefined}
    >
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
      {chip("era", ERAS[dna.era])}
      {dna.influences.map((inf) =>
        chip(`influences.${inf.genre}`, `${inf.genre} ${Math.round(inf.weight * 100)}%`),
      )}
      {AXIS_META.map((axis) => {
        const v = dna.sonicPalette[axis.key];
        const pole = v < 0 ? axis.left : axis.right;
        return chip(`sonicPalette.${axis.key}`, `${pole} ${Math.abs(v).toFixed(1)}`);
      })}
      {chip("vocalCharacter", "vocals")}
      {chip("lyricalObsessions", dna.lyricalObsessions.join(" · "))}
      {chip("visualStyle", dna.visualStyle.join(" · "))}
      <span style={{ marginLeft: "auto" }}>
        <Radar palette={dna.sonicPalette} size={72} />
      </span>
    </div>
  );
}

function Group({
  label,
  kept,
  onKeep,
  children,
}: {
  label: string;
  kept: boolean;
  onKeep: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ marginTop: "var(--space-3)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="card-kicker">{label}</span>
        <button
          type="button"
          className={kept ? "tag tag-outline" : "tag tag-neutral"}
          onClick={onKeep}
          style={{ cursor: "pointer", border: kept ? undefined : "1px solid transparent" }}
          aria-pressed={kept}
        >
          {kept ? "✓ Kept" : "Keep"}
        </button>
      </div>
      {children}
    </div>
  );
}

function VocalPad({
  value,
  onChange,
}: {
  value: { whispersScreams: number; cleanDamaged: number };
  onChange: (v: { whispersScreams: number; cleanDamaged: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const setFromPointer = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    onChange({ whispersScreams: x * 2 - 1, cleanDamaged: y * 2 - 1 });
  };

  const dotX = ((value.whispersScreams + 1) / 2) * 100;
  const dotY = ((value.cleanDamaged + 1) / 2) * 100;

  return (
    <div>
      <div
        ref={ref}
        role="slider"
        aria-label="Vocal character pad"
        aria-valuetext={`whispers-screams ${value.whispersScreams.toFixed(2)}, clean-damaged ${value.cleanDamaged.toFixed(2)}`}
        tabIndex={0}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setFromPointer(e);
        }}
        onPointerMove={(e) => e.buttons === 1 && setFromPointer(e)}
        style={{
          position: "relative",
          height: 180,
          border: "1px solid var(--color-divider)",
          borderRadius: "var(--radius-md)",
          cursor: "crosshair",
          touchAction: "none",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: `${dotX}%`,
            top: `${dotY}%`,
            transform: "translate(-50%, -50%)",
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "var(--color-accent)",
            pointerEvents: "none",
          }}
        />
      </div>
      <div className="flex justify-between card-meta" style={{ marginTop: 4 }}>
        <span>WHISPERS · CLEAN(top)</span>
        <span>SCREAMS · DAMAGED(bottom)</span>
      </div>
    </div>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim();
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) onChange([...tags, tag]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
      {tags.map((tag) => (
        <span key={tag} className="tag tag-accent">
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            aria-label={`Remove ${tag}`}
            style={{ marginLeft: 6, border: 0, background: "none", cursor: "pointer", color: "inherit" }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="input"
        style={{ maxWidth: 180, minHeight: 30 }}
        placeholder="Add your own…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        onBlur={add}
      />
    </div>
  );
}
