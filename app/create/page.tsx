import Link from "next/link";

export default function CreatePage() {
  return (
    <div className="page fade-up" style={{ maxWidth: 720 }}>
      <p className="kicker">Create an artist</p>
      <h1 style={{ fontWeight: 400, fontSize: 44, margin: "0 0 var(--space-3)" }}>
        Tell me about the artist you want to create.
      </h1>
      <p className="text-muted">
        The creation studio is being wired up right now — check back in a few minutes. In the
        meantime, the roster is live and every artist on it is playable.
      </p>
      <Link href="/" className="btn btn-primary">
        ← Back to the roster
      </Link>
    </div>
  );
}
