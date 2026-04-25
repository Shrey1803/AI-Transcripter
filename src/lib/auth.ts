import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

export const auth = betterAuth({
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
