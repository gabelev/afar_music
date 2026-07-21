import { randomUUID } from "node:crypto";
import { sql } from "./index";

/**
 * Store one media buffer and return the URL it streams from. Live-generated
 * media is written here at generation time so API payloads carry URLs, not
 * megabytes of base64 (serverless request/response bodies cap at ~4.5MB).
 */
export async function storeMedia(bytes: Buffer, contentType: string): Promise<string> {
  const id = randomUUID();
  await sql().query("INSERT INTO media (id, content_type, bytes) VALUES ($1, $2, $3)", [
    id,
    contentType,
    bytes,
  ]);
  return `/api/media/${id}`;
}
