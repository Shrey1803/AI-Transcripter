"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { LoginForm } from "@/components/login";
import { Dashboard } from "@/components/dashboard";

export default function Home() {
  const [session, setSession] = useState<{
    user: { username?: string | null };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const publicAdminUsername = process.env.NEXT_PUBLIC_ADMIN_USERNAME;

  const checkSession = async () => {
    const response = await authClient.getSession();
    setSession(
      response.data
        ? {
            user: {
              username: response.data.user.username ?? null,
            },
          }
        : null,
    );
    setLoading(false);
  };

  useEffect(() => {
    void checkSession();
  }, []);

  if (loading) return <div className="center-screen">Loading...</div>;

  if (!session) {
    return (
      <div className="center-screen">
        <div className="container-sm">
          <LoginForm onLoggedIn={checkSession} />
        </div>
      </div>
    );
  }

  if (
    publicAdminUsername &&
    (session.user.username || "").toLowerCase() !== publicAdminUsername.toLowerCase()
  ) {
    return (
      <div className="center-screen">
        <div className="card container-sm">
          <h2>Unauthorized</h2>
          <p>This account is not allowed to access admin transcription features.</p>
          <button
            className="button"
            onClick={async () => {
              await authClient.signOut();
              await checkSession();
            }}
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  return <Dashboard username={session.user.username || "admin"} onLoggedOut={checkSession} />;
}
