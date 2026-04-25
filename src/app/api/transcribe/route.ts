import { NextResponse } from "next/server";
import pool, { ensureAppSchema } from "@/lib/db";
import { getServerSession, isAdminUsername } from "@/lib/session";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function extractTranscript(response: any): string {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user || !isAdminUsername(session.user.username)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
    }

    const formData = await request.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    if (audio.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Audio file is too large" }, { status: 400 });
    }

    const bytes = await audio.arrayBuffer();
    const base64Audio = Buffer.from(bytes).toString("base64");
    const mimeType = audio.type || "audio/mpeg";
    const filename = audio.name || "uploaded-audio";

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: "Transcribe this audio exactly. Return plain text only.",
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Audio,
                  },
                },
              ],
            },
          ],
        }),
      },
    );

    const payload = await geminiResponse.json();
    if (!geminiResponse.ok) {
      console.error("Gemini error:", payload);
      return NextResponse.json({ error: "Gemini transcription failed" }, { status: 502 });
    }

    const transcript = extractTranscript(payload);
    if (!transcript) {
      return NextResponse.json({ error: "No transcript returned by Gemini" }, { status: 502 });
    }

    await ensureAppSchema();
    await pool.query("INSERT INTO transcripts (user_id, filename, transcript) VALUES ($1, $2, $3)", [
      session.user.id,
      filename,
      transcript,
    ]);

    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("Transcribe error:", error);
    return NextResponse.json({ error: "Failed to transcribe audio" }, { status: 500 });
  }
}
