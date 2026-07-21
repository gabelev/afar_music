import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Radar } from "@/components/Radar";
import { TrackPlayer } from "@/components/TrackPlayer";
import { ERAS } from "@/lib/dna/schema";
import { getArtist } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artist = await getArtist(slug);
  if (!artist) notFound();

  const single = artist.tracks.find((t) => t.isSingle);
  const catalogue = artist.tracks.filter((t) => !t.isSingle);

  return (
    <div className="page fade-up">
      <Link href="/" className="btn btn-ghost">
        ← Back to the roster
      </Link>

      <section
        className="grid grid-cols-1 md:grid-cols-[320px_1fr]"
        style={{ gap: "var(--space-8)", marginTop: "var(--space-4)" }}
      >
        <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
          {artist.portraitUrl && (
            <div className="plate" style={{ position: "relative", aspectRatio: "2/3" }}>
              <Image
                src={artist.portraitUrl}
                alt={`Portrait of ${artist.name}`}
                fill
                sizes="(max-width: 768px) 100vw, 320px"
                style={{ objectFit: "cover" }}
                priority
              />
            </div>
          )}
          <div>
            <p className="kicker" style={{ marginBottom: "var(--space-1)" }}>
              Sonic signature
            </p>
            <Radar palette={artist.dna.sonicPalette} size={230} showLabels />
          </div>
        </div>

        <div>
          <p className="kicker">AI artist · Made on AFAR</p>
          <h1 style={{ fontWeight: 400, fontSize: 52, margin: "0 0 var(--space-2)" }}>
            {artist.name}
          </h1>
          <div className="flex flex-wrap items-center" style={{ gap: 6, marginBottom: "var(--space-4)" }}>
            <span className="tag tag-accent">{ERAS[artist.era]}</span>
            {artist.genres.map((genre) => (
              <span key={genre} className="tag tag-neutral">
                {genre}
              </span>
            ))}
          </div>
          {artist.bio.split("\n").filter(Boolean).map((para, i) => (
            <p key={i} style={{ maxWidth: 640 }}>
              {para}
            </p>
          ))}

          {single && (
            <div style={{ marginTop: "var(--space-6)" }}>
              <p className="kicker">The single — the track that defines them</p>
              <TrackPlayer
                title={single.title}
                audioUrl={single.audioUrl}
                isSingle
                subtitle={`“${single.lyricSeed.slice(0, 80)}…”`}
              />
            </div>
          )}

          {catalogue.length > 0 && (
            <div style={{ marginTop: "var(--space-4)" }}>
              <p className="kicker">Also on their page</p>
              <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
                {catalogue.map((track) => (
                  <TrackPlayer key={track.id} title={track.title} audioUrl={track.audioUrl} />
                ))}
              </div>
            </div>
          )}

          {artist.coverUrl && (
            <div
              className="grid grid-cols-1 sm:grid-cols-[200px_1fr] items-start"
              style={{ gap: "var(--space-4)", marginTop: "var(--space-6)" }}
            >
              <div className="plate" style={{ position: "relative", aspectRatio: "1/1" }}>
                <Image
                  src={artist.coverUrl}
                  alt={`Album cover: ${artist.coverTitle}`}
                  fill
                  sizes="200px"
                  style={{ objectFit: "cover" }}
                />
              </div>
              <div>
                <p className="kicker">Debut record</p>
                <h3 style={{ fontSize: 25, margin: "0 0 var(--space-2)" }}>{artist.coverTitle}</h3>
                <p className="text-muted" style={{ maxWidth: 480 }}>
                  {artist.coverDescription}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
