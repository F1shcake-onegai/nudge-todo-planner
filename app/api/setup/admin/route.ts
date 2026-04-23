import {
  createAdmin,
  createSession,
  getAdmin,
  ipFromRequest,
  sessionCookie,
} from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { SETTINGS_ID } from "@/lib/db/schema";

/**
 * Phase 1 bootstrap: create the admin credentials if none exist, mark
 * settings.bootstrapped=true, and issue a session cookie so the user
 * lands logged-in. Phase 3 will chain additional setup steps in front
 * of this (timezone, work hours, intensity, LLM key, VAPID email).
 */
export async function POST(req: Request) {
  const existing = await getAdmin();
  if (existing) {
    return Response.json({ error: "Already bootstrapped" }, { status: 409 });
  }

  const body = (await req.json()) as { username?: string; password?: string };
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!/^[a-z0-9][a-z0-9._-]{1,30}$/i.test(username)) {
    return Response.json({ error: "Invalid username" }, { status: 400 });
  }
  if (password.length < 10) {
    return Response.json({ error: "Password must be at least 10 characters" }, { status: 400 });
  }

  // ensure settings row exists, then mark bootstrapped
  const s = await db.query.settings.findFirst();
  if (!s) await db.insert(schema.settings).values({ id: SETTINGS_ID, bootstrapped: true });
  else await db.update(schema.settings).set({ bootstrapped: true }).where(eq(schema.settings.id, SETTINGS_ID));

  await createAdmin(username, password);

  const session = await createSession({
    label: "browser",
    remember: true,
    ipAddress: ipFromRequest(req),
    userAgent: req.headers.get("user-agent"),
  });

  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", sessionCookie(session.id, session.ttlMs));
  return new Response(JSON.stringify({ ok: true, username }), { status: 200, headers });
}
