import { Pool } from "pg";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createPoolWithRetry(): Promise<Pool> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Prevent unhandled 'error' events on idle clients from crashing the process.
  pool.on("error", (err) => {
    console.error("[db] Idle pool client error (non-fatal):", err.message);
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log("[db] Database connection established.");
      return pool;
    } catch (err: any) {
      const isLast = attempt === MAX_RETRIES;
      console.error(
        `[db] Database connection attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}${isLast ? " — giving up, requests will fail until DB is reachable." : ` — retrying in ${RETRY_DELAY_MS}ms…`}`,
      );
      if (!isLast) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  // Return the pool anyway — individual requests will surface the error rather
  // than the whole process crashing on startup.
  return pool;
}

// Resolved once on first import; shared across all request handlers.
const poolPromise: Promise<Pool> = createPoolWithRetry();

let schemaReady = false;

export async function ensureAppSchema() {
  if (schemaReady) return;

  const pool = await poolPromise;

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

// Convenience helper — awaits the pool so callers don't need to import the promise.
export async function getPool(): Promise<Pool> {
  return poolPromise;
}

export default {
  query: async (...args: Parameters<Pool["query"]>) => {
    const pool = await poolPromise;
    return pool.query(...(args as [any]));
  },
} as Pick<Pool, "query">;
