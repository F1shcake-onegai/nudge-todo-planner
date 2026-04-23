import { db, schema } from "@/lib/db/client";
import { and, eq, gt, isNotNull, isNull, lte } from "drizzle-orm";
import { sendPush } from "@/lib/push";
import { addMinutes } from "date-fns";
import { parseHHMM } from "@/lib/scheduler";

/**
 * Runs every 5 minutes (Vercel Cron). Finds tasks whose scheduledStart
 * is within the next WINDOW_MINUTES, hasn't been notified yet, and
 * sends a web push to every registered subscription.
 */
const WINDOW_MINUTES = 15;

async function runNotifications() {
  const now = new Date();
  const upper = addMinutes(now, WINDOW_MINUTES);

  // Respect the user's quiet hours — never push outside work window.
  const settings = await db.query.settings.findFirst();
  const workStart = parseHHMM(settings?.workHoursStart, 9);
  const workEnd = parseHHMM(settings?.workHoursEnd, 18);
  const nowFrac = now.getHours() + now.getMinutes() / 60;
  const upperFrac = nowFrac + WINDOW_MINUTES / 60;
  if (upperFrac < workStart || nowFrac >= workEnd) {
    return { sent: 0, matched: 0, reason: "outside-work-hours" };
  }

  const due = await db.query.tasks.findMany({
    where: and(
      isNull(schema.tasks.notifiedAt),
      isNotNull(schema.tasks.scheduledStart),
      lte(schema.tasks.scheduledStart, upper),
      gt(schema.tasks.scheduledStart, now),
    ),
  });

  if (!due.length) return { sent: 0, matched: 0 };

  const subs = await db.query.subscriptions.findMany();
  let sent = 0;
  for (const task of due) {
    for (const s of subs) {
      const r = await sendPush(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        {
          title: task.title,
          body: `Starts in a few minutes.`,
          url: "/",
          tag: `task-${task.id}`,
        },
      );
      if (r.ok) sent++;
      // prune dead subscriptions
      if (!r.ok && (r.statusCode === 404 || r.statusCode === 410)) {
        await db.delete(schema.subscriptions).where(eq(schema.subscriptions.endpoint, s.endpoint));
      }
    }
    await db
      .update(schema.tasks)
      .set({ notifiedAt: new Date() })
      .where(eq(schema.tasks.id, task.id));
  }

  return { sent, matched: due.length };
}

function auth(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // allow in dev when no secret configured
  const h = req.headers.get("authorization") ?? "";
  return h === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!auth(req)) return new Response("Unauthorized", { status: 401 });
  const result = await runNotifications();
  return Response.json(result);
}

// Vercel Cron hits GET; allow POST too for local testing
export const POST = GET;
