import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { buildIcsFeed } from "@/lib/ics";
import { SETTINGS_ID } from "@/lib/db/schema";
import { getAdmin, validateSession, verifyPassword } from "@/lib/auth";

const AUTH_REALM = 'Basic realm="nudge calendar", charset="UTF-8"';

function parseBasic(req: Request): { username: string; secret: string } | null {
  const h = req.headers.get("authorization") ?? "";
  if (!h.toLowerCase().startsWith("basic ")) return null;
  try {
    const decoded = Buffer.from(h.slice(6).trim(), "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return { username: decoded.slice(0, idx), secret: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

/**
 * Accept HTTP Basic credentials as an alternative to the URL token.
 * Two valid secret forms:
 *   - the admin password (convenient for manual setup)
 *   - a session/app bearer token (revocable per-device)
 *
 * If Basic is supplied it must succeed — we don't silently fall back to URL
 * token on failed Basic, to avoid confusing error states on misconfigured clients.
 */
async function authorize(req: Request, urlToken: string): Promise<boolean> {
  const basic = parseBasic(req);
  if (basic) {
    const admin = await getAdmin();
    if (!admin || admin.username !== basic.username) return false;
    // Try password first, then session/app token.
    if (await verifyPassword(basic.secret, admin.passwordHash)) return true;
    const session = await validateSession(basic.secret);
    if (session) return true;
    return false;
  }
  // No Basic header — fall back to URL token.
  const settings = await db.query.settings.findFirst({
    where: eq(schema.settings.id, SETTINGS_ID),
  });
  return !!settings?.feedToken && settings.feedToken === urlToken;
}

function unauthorized() {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": AUTH_REALM },
  });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!(await authorize(req, token))) return unauthorized();
  const origin = new URL(req.url).origin;
  const ics = await buildIcsFeed(origin);
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="nudge.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}

export async function HEAD(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!(await authorize(req, token))) return unauthorized();
  return new Response(null, {
    status: 200,
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
  });
}
