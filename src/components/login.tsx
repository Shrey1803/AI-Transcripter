"use client";

import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

type LoginFormProps = {
  onLoggedIn: () => Promise<void> | void;
};

export function LoginForm({ onLoggedIn }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await authClient.signIn.username({
      username,
      password,
    });

    if (signInError) {
      setError(signInError.message || "Login failed");
      setSubmitting(false);
      return;
    }

    await onLoggedIn();
    setSubmitting(false);
  };

  return (
    <form className="neo-card neo-stack" onSubmit={handleSubmit}>
      <div className="neo-brand">
        <div className="neo-logo">VA</div>
        <div>
          <h2>VoiceAI Admin</h2>
          <p>Gemini Audio Transcription</p>
        </div>
      </div>

      <label className="label" htmlFor="username">
        Username
      </label>
      <input
        id="username"
        className="neo-input"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="username"
        placeholder="Enter your username"
        required
      />

      <label className="label" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        type="password"
        className="neo-input"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        placeholder="Enter your password"
        required
      />

      {error ? <p className="error">{error}</p> : null}

      <button className="neo-button" type="submit" disabled={submitting}>
        {submitting ? "Signing in..." : "Access Dashboard"}
      </button>
    </form>
  );
}
