import "dotenv/config";

process.env.AUTH_DISABLE_SIGNUP = "false";

async function main() {
  const { getPool } = await import("../src/lib/db");
  const pool = await getPool();  
  const { auth } = await import("../src/lib/auth");

  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";

  if (!adminUsername || !adminPassword) {
    throw new Error("Missing ADMIN_USERNAME or ADMIN_PASSWORD in environment variables.");
  }

  const existing = await pool.query('SELECT id FROM "user" WHERE username = $1 LIMIT 1', [
    adminUsername,
  ]);

  if (existing.rowCount && existing.rowCount > 0) {
    console.log("Admin already exists. Skipping seed.");
    await pool.end();
    return;
  }

  await auth.api.signUpEmail({
    body: {
      email: adminEmail,
      name: "Admin",
      username: adminUsername,
      password: adminPassword,
    },
  });

  console.log("Admin account created successfully.");
  await pool.end();
}

main().catch((error) => {
  console.error("Failed to seed admin:", error);
  process.exit(1);
});
