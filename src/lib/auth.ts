import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
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
    // Limit idle connections so a broken DB doesn't hold open many sockets
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Prevent unhandled 'error' events on idle clients from crashing the process.
  // pg emits these when the DB drops a connection while it is sitting in the pool.
  pool.on("error", (err) => {
    console.error("[auth] Idle pool client error (non-fatal):", err.message);
  });

  // Verify connectivity with retries so a transient startup race doesn't crash
  // the app. We probe the connection here rather than letting better-auth do it
  // silently, so we can log progress and keep the process alive.
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log("[auth] Database connection established.");
      return pool;
    } catch (err: any) {
      const isLast = attempt === MAX_RETRIES;
      console.error(
        `[auth] Database connection attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}${isLast ? " — giving up, requests will fail until DB is reachable." : ` — retrying in ${RETRY_DELAY_MS}ms…`}`,
      );
      if (!isLast) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  // Return the pool anyway so the app can start. Individual requests will
  // receive a 503 / error response rather than the whole process crashing.
  return pool;
}

// Initialise the pool asynchronously. The promise is stored so that the auth
// handler can await it on the first request instead of blocking module load.
let poolPromise: Promise<Pool> = createPoolWithRetry();

// Lazily-resolved auth instance — created once the pool is ready.
let authInstance: ReturnType<typeof betterAuth> | null = null;
let authInitPromise: Promise<ReturnType<typeof betterAuth>> | null = null;

function buildAuth(pool: Pool) {
  return betterAuth({
    database: pool,
    emailAndPassword: {
      enabled: true,
      disableSignUp: process.env.AUTH_DISABLE_SIGNUP !== "false",
    },
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [process.env.BETTER_AUTH_URL || "http://localhost:3000"],
    plugins: [username()],
  });
}

async function getAuth(): Promise<ReturnType<typeof betterAuth>> {
  if (authInstance) return authInstance;
  if (!authInitPromise) {
    authInitPromise = poolPromise.then((pool) => {
      authInstance = buildAuth(pool);
      return authInstance;
    });
  }
  return authInitPromise;
}

// Export a proxy so existing call-sites (`auth.api.getSession(…)`) keep working
// without any changes. Each property access awaits the real instance.
export const auth = new Proxy({} as ReturnType<typeof betterAuth>, {
  get(_target, prop) {
    // Return a proxy for nested objects (e.g. auth.api) so callers can do
    // `auth.api.getSession(…)` and still get a thenable chain.
    return new Proxy(
      {},
      {
        get(_t, method) {
          return async (...args: any[]) => {
            const instance = await getAuth();
            const obj = (instance as any)[prop as string];
            if (typeof obj?.[method as string] === "function") {
              return obj[method as string](...args);
            }
            throw new Error(`[auth] ${String(prop)}.${String(method)} is not a function`);
          };
        },
      },
    );
  },
});
