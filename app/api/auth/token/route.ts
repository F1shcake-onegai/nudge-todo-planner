import {
  createSession,
  getAdmin,
  ipFromRequest,
  verifyPassword,
} from "@/lib/auth";

/**
 * Mint a long-lived bearer token for a mobile / external client.
 * Password-gated even if a session cookie is present — adding a device is a
 * higher-trust action than normal logged-in browsing.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as { password?: string; label?: string };
  const admin = await getAdmin();
  if (!admin) return Response.json({ error: "No admin configured" }, { status: 500 });

  const pw = body.password ?? "";
  if (!pw) return Response.json({ error: "Password required" }, { status: 400 });
  const ok = await verifyPassword(pw, admin.passwordHash);
  if (!ok) return Response.json({ error: "Invalid password" }, { status: 401 });

  const session = await createSession({
    label: "app",
    remember: true,
    ipAddress: ipFromRequest(req),
    userAgent: req.headers.get("user-agent"),
  });

  return Response.json({
    token: session.id,
    expiresAt: session.expiresAt,
    usage: "Send as 'Authorization: Bearer <token>' header.",
  });
}
