import { db, schema } from "@/lib/db/client";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { sendPush } from "@/lib/push";
import { subMinutes } from "date-fns";
import { parseHHMM } from "@/lib/scheduler";
import { planToday, pruneOldNotifications } from "@/lib/nudgePlanner";

const LATE_TOLERANCE_MIN = 15; // don't fire nudges more than 15 min late

/**
 * Fire any pending notifications whose scheduledAt is in [now-15min, now].
 * Safe to call repeatedly — rows are marked sentAt after a successful push.
 * Quiet hours (outside workStart..workEnd) short-circuit to zero sends.
 */
export async function runNotifications() {
  const now = new Date();

  // Respect quiet hours.
  const settings = await db.query.settings.findFirst();
  const workStart = parseHHMM(settings?.workHoursStart, 9);
  const workEnd = parseHHMM(settings?.workHoursEnd, 18);
  const nowFrac = now.getHours() + now.getMinutes() / 60;
  if (nowFrac < workStart || nowFrac >= workEnd) {
    return { sent: 0, matched: 0, reason: "outside-work-hours" as const };
  }

  const lowerBound = subMinutes(now, LATE_TOLERANCE_MIN);
  const due = await db.query.notifications.findMany({
    where: and(
      isNull(schema.notifications.sentAt),
      gte(schema.notifications.scheduledAt, lowerBound),
      lte(schema.notifications.scheduledAt, now),
    ),
  });
  if (!due.length) return { sent: 0, matched: 0 };

  const subs = await db.query.subscriptions.findMany();
  if (!subs.length) {
    // Still mark as attempted so they don't fire stale after a late subscribe.
    await db
      .update(schema.notifications)
      .set({ sentAt: now })
      .where(inArray(schema.notifications.id, due.map((n) => n.id)));
    return { sent: 0, matched: due.length, reason: "no-subscriptions" as const };
  }

  const results = await Promise.all(
    due.flatMap((n) =>
      subs.map(async (s) => {
        const r = await sendPush(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          {
            title: n.copyTitle,
            body: n.copyBody,
            url: "/",
            tag: `ntf-${n.id}`,
          },
        );
        return { r, endpoint: s.endpoint };
      }),
    ),
  );

  const sent = results.filter((x) => x.r.ok).length;
  const deadEndpoints = [
    ...new Set(
      results
        .filter((x) => !x.r.ok && (x.r.statusCode === 404 || x.r.statusCode === 410))
        .map((x) => x.endpoint),
    ),
  ];

  const cleanup: Promise<unknown>[] = [];
  if (deadEndpoints.length) {
    cleanup.push(
      db.delete(schema.subscriptions).where(inArray(schema.subscriptions.endpoint, deadEndpoints)),
    );
  }
  cleanup.push(
    db
      .update(schema.notifications)
      .set({ sentAt: now })
      .where(inArray(schema.notifications.id, due.map((n) => n.id))),
  );
  await Promise.all(cleanup);

  return { sent, matched: due.length };
}

/**
 * Daily-ish tick: replan today, run pending notifications, prune old rows.
 * Called from the internal scheduler every 5 minutes. Replanning is cheap
 * because planToday() diffs on the current state each time.
 */
export async function runSchedulerTick() {
  try {
    await planToday();
  } catch (e) {
    console.error("[nudge] planToday failed:", (e as Error).message);
  }
  const result = await runNotifications();
  // once a day (loose — probability-based since ticks are 5 min apart)
  if (Math.random() < 1 / 288) {
    pruneOldNotifications(7).catch((e) =>
      console.error("[nudge] prune failed:", (e as Error).message),
    );
  }
  return result;
}
