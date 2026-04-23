import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { buildIcsFeed } from "@/lib/ics";
import { SETTINGS_ID } from "@/lib/db/schema";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const settings = await db.query.settings.findFirst({ where: eq(schema.settings.id, SETTINGS_ID) });
  if (!settings?.feedToken || settings.feedToken !== token) {
    return new Response("Not found", { status: 404 });
  }
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

// HEAD so calendar clients can probe without downloading
export async function HEAD(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const settings = await db.query.settings.findFirst({ where: eq(schema.settings.id, SETTINGS_ID) });
  if (!settings?.feedToken || settings.feedToken !== token) {
    return new Response(null, { status: 404 });
  }
  return new Response(null, { status: 200, headers: { "Content-Type": "text/calendar; charset=utf-8" } });
}
