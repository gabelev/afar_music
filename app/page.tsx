import Image from "next/image";
import Link from "next/link";
import { Radar } from "@/components/Radar";
import { ERAS } from "@/lib/dna/schema";
import { listArtists } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const artists = await listArtists();

  return (
    <div className="page fade-up">
      <section style={{ padding: "var(--space-8) 0 var(--space-6)" }}>
        <h1
          style={{
            fontWeight: 400,
            fontSize: 60,
            lineHeight: 1.04,
            maxWidth: 760,
            margin: "0 0 var(--space-4)",
          }}
        >
          Build an AI artist,
          <br />
          not just a track.
        </h1>
        <p className="text-muted" style={{ maxWidth: 560, fontSize: 17, marginBottom: "var(--space-4)" }}>
          Describe an artist, shape their Creative DNA, and hear the songs that define them.
          Every artist below was made this way — by a person, with taste.
        </p>
        <Link href="/create" className="btn btn-primary" style={{ fontSize: 16 }}>
          Create an artist →
        </Link>
      </section>

      <hr className="hr" />

      <section>
        <p className="kicker">The roster</p>
        <p className="text-muted" style={{ marginBottom: "var(--space-4)" }}>
          Artists made here, by people like you. Tap one to hear them.
        </p>
        {artists.length === 0 ? (
          <p className="text-muted">The roster is empty — be the first to create an artist.</p>
        ) : (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            style={{ gap: "var(--space-4)" }}
          >
            {artists.map((artist) => (
              <Link
                key={artist.id}
                href={`/artist/${artist.slug}`}
                className="card elev-sm"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                {artist.portraitUrl && (
                  <div className="plate" style={{ position: "relative", aspectRatio: "1/1" }}>
                    <Image
                      src={artist.portraitUrl}
                      alt={`Portrait of ${artist.name}`}
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      style={{ objectFit: "cover", objectPosition: "top" }}
                    />
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="card-kicker">{ERAS[artist.era]}</span>
                    <h3 className="card-title" style={{ fontSize: 22 }}>
                      {artist.name}
                    </h3>
                  </div>
                  <Radar palette={artist.dna.sonicPalette} size={56} />
                </div>
                <div className="flex flex-wrap" style={{ gap: 6 }}>
                  {artist.genres.slice(0, 3).map((genre) => (
                    <span key={genre} className="tag tag-neutral">
                      {genre}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
