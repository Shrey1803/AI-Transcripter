import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

let schemaReady = false;

export async function ensureAppSchema() {
  if (schemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transcripts (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL DEFAULT '',
      transcript TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE transcripts
    ADD COLUMN IF NOT EXISTS filename TEXT NOT NULL DEFAULT ''
  `);

  schemaReady = true;
}

export default pool;
