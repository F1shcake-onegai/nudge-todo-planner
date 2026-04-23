import {
  checkLoginRateLimit,
  createSession,
  getAdmin,
  ipFromRequest,
  sessionCookie,
  verifyPassword,
} from "@/lib/auth";

export async function POST(req: Request) {
  const ip = ipFromRequest(req);
  const rl = checkLoginRateLimit(ip);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many attempts. Try again shortly." }),
      {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfterSec) },
      },
    );
  }

  let body: { username?: string; password?: string; remember?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return Response.json({ error: "Username and password required" }, { status: 400 });
  }

  const admin = await getAdmin();
  if (!admin || admin.username !== username) {
    return Response.json({ error: "Invalid username or password" }, { status: 401 });
  }
  const ok = await verifyPassword(password, admin.passwordHash);
  if (!ok) {
    return Response.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const session = await createSession({
    label: "browser",
    remember: !!body.remember,
    ipAddress: ip,
    userAgent: req.headers.get("user-agent"),
  });

  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", sessionCookie(session.id, session.ttlMs));
  return new Response(JSON.stringify({ ok: true, username }), { status: 200, headers });
}
