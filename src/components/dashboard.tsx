"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { Transcript } from "@/types/transcript";

type DashboardProps = {
  username: string;
  onLoggedOut: () => Promise<void> | void;
};

export function Dashboard({ username, onLoggedOut }: DashboardProps) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [checkingAudio, setCheckingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [fetchingTranscripts, setFetchingTranscripts] = useState(true);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);

  const loadTranscripts = async () => {
    setFetchingTranscripts(true);
    setRequestError(null);
    const response = await fetch("/api/transcripts");
    const payload = await response.json();

    if (!response.ok) {
      setRequestError(payload?.error || "Failed to load transcripts");
      setFetchingTranscripts(false);
      return;
    }

    setTranscripts(payload);
    setFetchingTranscripts(false);
  };

  useEffect(() => {
    void loadTranscripts();
  }, []);

  const validateDuration = async (file: File) => {
    setCheckingAudio(true);
    setAudioError(null);

    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = objectUrl;

    const duration = await new Promise<number>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => reject(new Error("Invalid audio file"));
    }).finally(() => {
      URL.revokeObjectURL(objectUrl);
    });

    if (!Number.isFinite(duration) || duration > 60) {
      setAudioError("Audio must be under 1 minute.");
      setAudioFile(null);
      setCheckingAudio(false);
      return;
    }

    setAudioFile(file);
    setCheckingAudio(false);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setAudioFile(null);
      setAudioError(null);
      return;
    }

    try {
      await validateDuration(file);
    } catch {
      setAudioError("Could not read this audio file.");
      setAudioFile(null);
      setCheckingAudio(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!audioFile) {
      setRequestError("Please select an audio file under 1 minute.");
      return;
    }

    setLoading(true);
    setRequestError(null);

    const formData = new FormData();
    formData.append("audio", audioFile);

    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json();
    if (!response.ok) {
      setRequestError(payload?.error || "Failed to transcribe audio");
      setLoading(false);
      return;
    }

    setLastTranscript(payload.transcript);
    setAudioFile(null);
    const fileInput = document.getElementById("audio-input") as HTMLInputElement | null;
    if (fileInput) fileInput.value = "";
    await loadTranscripts();
    setLoading(false);
  };

  const logout = async () => {
    await authClient.signOut();
    await onLoggedOut();
  };

  const deleteTranscript = async (id: number) => {
    setDeletingId(id);
    setRequestError(null);

    const response = await fetch("/api/transcripts", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setRequestError(payload?.error || "Failed to delete transcript");
      setDeletingId(null);
      return;
    }

    setTranscripts((prev) => prev.filter((item) => item.id !== id));
    setDeletingId(null);
  };

  return (
    <main className="neo-page">
      <section className="neo-header">
        <div>
          <h1>VoiceAI Dashboard</h1>
          <p className="muted">Logged in as {username}</p>
        </div>
        <button className="neo-button secondary" onClick={logout}>
          Logout
        </button>
      </section>

      <section className="neo-card neo-stack">
        <h2>Upload Audio File</h2>
        <p className="muted">Accepted: any audio format, strictly under 60 seconds.</p>
        <form onSubmit={handleSubmit} className="neo-stack">
          <input
            id="audio-input"
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="neo-file"
            disabled={loading || checkingAudio}
            required
          />
          {audioError ? <p className="error">{audioError}</p> : null}
          {requestError ? <p className="error">{requestError}</p> : null}
          <button className="neo-button" type="submit" disabled={loading || checkingAudio}>
            {checkingAudio ? "Validating..." : loading ? "Transcribing..." : "Transcribe"}
          </button>
        </form>
        {lastTranscript ? (
          <div className="neo-output">
            <h3>Latest Transcript</h3>
            <p>{lastTranscript}</p>
          </div>
        ) : null}
      </section>

      <section className="neo-card neo-stack">
        <h2>Your Transcripts</h2>
        {requestError ? <p className="error">{requestError}</p> : null}
        {fetchingTranscripts ? <p>Loading transcripts...</p> : null}
        {!fetchingTranscripts && transcripts.length === 0 ? <p>No transcripts yet.</p> : null}
        <ul className="neo-list">
          {transcripts.map((item) => (
            <li key={item.id} className="neo-list-item">
              <p>
                <strong>File:</strong> {item.filename || "Unknown file"}
              </p>
              <p className="time">{new Date(item.created_at).toLocaleString()}</p>
              <p>{item.transcript}</p>
              <button
                className="neo-button secondary"
                disabled={deletingId === item.id}
                onClick={() => void deleteTranscript(item.id)}
                type="button"
              >
                {deletingId === item.id ? "Deleting..." : "Delete"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
