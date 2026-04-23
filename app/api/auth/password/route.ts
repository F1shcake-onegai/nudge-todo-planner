import {
  currentSession,
  getAdmin,
  getTokenFromRequest,
  revokeAllSessions,
  setAdminPassword,
  verifyPassword,
} from "@/lib/auth";

export async function POST(req: Request) {
  const session = await currentSession(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    oldPassword?: string;
    newPassword?: string;
    confirm?: string;
  };
  const oldP = body.oldPassword ?? "";
  const newP = body.newPassword ?? "";
  const confirm = body.confirm ?? "";

  if (!oldP || !newP) return Response.json({ error: "Old and new password required" }, { status: 400 });
  if (newP !== confirm) return Response.json({ error: "New password confirmation does not match" }, { status: 400 });
  if (newP.length < 10) return Response.json({ error: "New password must be at least 10 characters" }, { status: 400 });

  const admin = await getAdmin();
  if (!admin) return Response.json({ error: "No admin configured" }, { status: 500 });
  const ok = await verifyPassword(oldP, admin.passwordHash);
  if (!ok) return Response.json({ error: "Current password is incorrect" }, { status: 400 });

  await setAdminPassword(newP);
  const current = getTokenFromRequest(req);
  await revokeAllSessions(current ?? undefined);

  return Response.json({ ok: true });
}
