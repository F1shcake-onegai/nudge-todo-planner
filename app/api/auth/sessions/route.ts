import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { currentSession, getTokenFromRequest, revokeAllSessions } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await currentSession(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.query.sessions.findMany();
  const currentId = session.id;
  return Response.json({
    sessions: rows
      .map((r) => ({
        id: r.id.slice(0, 8),
        label: r.label,
        createdAt: r.createdAt,
        lastSeenAt: r.lastSeenAt,
        expiresAt: r.expiresAt,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        current: r.id === currentId,
      }))
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime()),
  });
}

export async function DELETE(req: Request) {
  const session = await currentSession(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");
  if (scope === "all-others") {
    await revokeAllSessions(getTokenFromRequest(req) ?? undefined);
    return Response.json({ ok: true });
  }
  // default: revoke a specific session by id prefix
  const prefix = url.searchParams.get("id");
  if (!prefix) return Response.json({ error: "Missing id or scope" }, { status: 400 });
  const rows = await db.query.sessions.findMany();
  const match = rows.find((r) => r.id.startsWith(prefix));
  if (!match) return Response.json({ error: "Session not found" }, { status: 404 });
  await db.delete(schema.sessions).where(eq(schema.sessions.id, match.id));
  return Response.json({ ok: true });
}
