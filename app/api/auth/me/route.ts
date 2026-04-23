import { currentSession, getAdmin } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await currentSession(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await getAdmin();
  return Response.json({
    username: admin?.username ?? null,
    sessionLabel: session.label,
    sessionExpiresAt: session.expiresAt,
  });
}
