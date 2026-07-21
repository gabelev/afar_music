import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (run via: npm run db:migrate)");
  process.exit(1);
}

const schema = readFileSync(new URL("../lib/db/schema.sql", import.meta.url), "utf8");
const sql = neon(url);

// neon() runs one statement per call; split on top-level semicolons.
const statements = schema
  .split(/;\s*(?:\n|$)/)
  .map((s) => s.trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(statement);
}
console.log(`Applied ${statements.length} statements to Neon.`);
