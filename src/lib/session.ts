import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function getServerSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export function isAdminUsername(username: string | null | undefined) {
  const adminUsername = process.env.ADMIN_USERNAME;
  if (!adminUsername) return false;
  return username?.toLowerCase() === adminUsername.toLowerCase();
}
