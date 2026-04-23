import { db, schema } from "@/lib/db/client";
import { and, eq, gt, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { sendPush } from "@/lib/push";
import { addMinutes } from "date-fns";
import { parseHHMM } from "@/lib/scheduler";

const WINDOW_MINUTES = 15;

/**
 * Fire push notifications for tasks whose scheduled start falls in the next
 * WINDOW_MINUTES. Respects the user's work-hour window so we never push
 * at 3am. Safe to call repeatedly: rows are marked notifiedAt after success.
 */
export async function runNotifications() {
  const now = new Date();
  const upper = addMinutes(now, WINDOW_MINUTES);

  const settings = await db.query.settings.findFirst();
  const workStart = parseHHMM(settings?.workHoursStart, 9);
  const workEnd = parseHHMM(settings?.workHoursEnd, 18);
  const nowFrac = now.getHours() + now.getMinutes() / 60;
  const upperFrac = nowFrac + WINDOW_MINUTES / 60;
  if (upperFrac < workStart || nowFrac >= workEnd) {
    return { sent: 0, matched: 0, reason: "outside-work-hours" as const };
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

  const results = await Promise.all(
    due.flatMap((task) =>
      subs.map(async (s) => {
        const r = await sendPush(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          {
            title: task.title,
            body: "Starts in a few minutes.",
            url: "/",
            tag: `task-${task.id}`,
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
      .update(schema.tasks)
      .set({ notifiedAt: new Date() })
      .where(inArray(schema.tasks.id, due.map((t) => t.id))),
  );
  await Promise.all(cleanup);

  return { sent, matched: due.length };
}
