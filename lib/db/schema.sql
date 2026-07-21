-- AFAR Music schema. Rows are small; DNA revisions are full copies, never overwritten.

CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | complete
  current_revision_id TEXT,
  single_artifact_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dna_revisions (
  id TEXT PRIMARY KEY,
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  rev INTEGER NOT NULL,
  dna JSONB NOT NULL,
  note TEXT NOT NULL DEFAULT '', -- e.g. the nudge instruction that produced this revision
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (artist_id, rev)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL REFERENCES dna_revisions(id),
  kind TEXT NOT NULL, -- bio | portrait | cover | track
  position INTEGER NOT NULL DEFAULT 0, -- track ordering (1..3)
  content TEXT NOT NULL DEFAULT '', -- bio text, cover description, track title/lyrics
  blob_url TEXT NOT NULL DEFAULT '', -- media location in Vercel Blob (empty for text artifacts)
  provenance JSONB NOT NULL DEFAULT '[]', -- DNA field paths that drove this artifact
  metadata JSONB NOT NULL DEFAULT '{}', -- e.g. composition plan, image params
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS artifacts_artist_idx ON artifacts (artist_id, kind, position);
CREATE INDEX IF NOT EXISTS dna_revisions_artist_idx ON dna_revisions (artist_id, rev DESC);
