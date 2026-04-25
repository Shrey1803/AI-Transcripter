import { NextResponse } from "next/server";
import pool, { ensureAppSchema } from "@/lib/db";
import { getServerSession, isAdminUsername } from "@/lib/session";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user || !isAdminUsername(session.user.username)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureAppSchema();
    const result = await pool.query(
      "SELECT id, user_id, filename, transcript, created_at FROM transcripts WHERE user_id = $1 ORDER BY created_at DESC",
      [session.user.id],
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Error fetching transcripts:", error);
    return NextResponse.json({ error: "Failed to fetch transcripts" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user || !isAdminUsername(session.user.username)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid transcript id" }, { status: 400 });
    }

    await ensureAppSchema();
    const result = await pool.query("DELETE FROM transcripts WHERE id = $1 AND user_id = $2", [
      id,
      session.user.id,
    ]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting transcript:", error);
    return NextResponse.json({ error: "Failed to delete transcript" }, { status: 500 });
  }
}
