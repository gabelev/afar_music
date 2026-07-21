import { sql } from "@/lib/db";

/** Stream live-generated media (audio/images) stored in the media table. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = (await sql().query("SELECT content_type, bytes FROM media WHERE id = $1", [
    id,
  ])) as { rows?: { content_type: string; bytes: Buffer | Uint8Array | string }[] } | { content_type: string; bytes: Buffer | Uint8Array | string }[];
  const rows = Array.isArray(result) ? result : (result.rows ?? []);
  if (rows.length === 0) return new Response("Not found", { status: 404 });

  const raw = rows[0].bytes;
  // Neon returns bytea as a \x-prefixed hex string over HTTP.
  const bytes =
    typeof raw === "string" && raw.startsWith("\\x")
      ? Buffer.from(raw.slice(2), "hex")
      : Buffer.from(raw as Uint8Array);

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": rows[0].content_type,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
