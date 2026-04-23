import { db, schema } from "@/lib/db/client";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { addMinutes, addDays, startOfDay, setHours, setMinutes, isBefore, isAfter, max as maxDate } from "date-fns";

type Busy = { start: Date; end: Date };

export type SchedulerOptions = {
  workStartHour?: number; // 0..23
  workEndHour?: number;   // 0..23
  maxBlockMinutes?: number;
  horizonDays?: number;
  now?: Date;
  externalBusy?: Busy[];  // reserved for future external calendar integrations
};

export function parseHHMM(s: string | undefined | null, fallback: number) {
  if (!s) return fallback;
  const [h, m] = s.split(":").map((n) => Number(n));
  if (Number.isFinite(h)) return h + (Number.isFinite(m) ? m / 60 : 0);
  return fallback;
}

/**
 * Rule-based scheduler. Places all unscheduled tasks into free slots
 * within work hours, respecting deadlines and existing scheduled blocks.
 */
export async function scheduleAllPending(opts: SchedulerOptions = {}) {
  const settings = await db.query.settings.findFirst();
  const {
    workStartHour = parseHHMM(settings?.workHoursStart, 9),
    workEndHour = parseHHMM(settings?.workHoursEnd, 18),
    maxBlockMinutes = 90,
    horizonDays = 14,
    now = new Date(),
    externalBusy = [],
  } = opts;

  const openTasks = await db.query.tasks.findMany({
    where: and(
      isNull(schema.tasks.parentTaskId),
      sql`${schema.tasks.status} != 'done'`,
      isNull(schema.tasks.scheduledStart),
    ),
  });

  // sort by deadline asc (no deadline last), then priority desc
  openTasks.sort((a, b) => {
    const da = a.deadline?.getTime() ?? Infinity;
    const db_ = b.deadline?.getTime() ?? Infinity;
    if (da !== db_) return da - db_;
    return b.priority - a.priority;
  });

  // gather existing scheduled blocks (including subtasks)
  const scheduled = await db.query.tasks.findMany({
    where: and(isNotNull(schema.tasks.scheduledStart), isNotNull(schema.tasks.scheduledEnd)),
  });
  const busy: Busy[] = [
    ...scheduled.map((t) => ({ start: t.scheduledStart!, end: t.scheduledEnd! })),
    ...externalBusy,
  ].sort((a, b) => a.start.getTime() - b.start.getTime());

  const placements: { id: string; start: Date; end: Date }[] = [];

  for (const task of openTasks) {
    let remaining = task.estimatedMinutes;
    let cursor = maxDate([now, task.scheduledStart ?? now]);

    while (remaining > 0) {
      const slot = nextFreeSlot(cursor, busy, { workStartHour, workEndHour, horizonDays, now });
      if (!slot) break;

      const chunk = Math.min(remaining, maxBlockMinutes, minutesBetween(slot.start, slot.end));
      if (chunk <= 0) {
        cursor = slot.end;
        continue;
      }
      const end = addMinutes(slot.start, chunk);

      // only place first chunk on the parent task itself (no subtask split yet)
      if (remaining === task.estimatedMinutes) {
        placements.push({ id: task.id, start: slot.start, end });
      }
      // insert into busy sorted
      insertBusy(busy, { start: slot.start, end });
      remaining -= chunk;
      cursor = end;

      // respect deadline — if past it, stop
      if (task.deadline && isAfter(end, task.deadline)) break;
    }
  }

  await Promise.all(
    placements.map((p) =>
      db
        .update(schema.tasks)
        .set({ scheduledStart: p.start, scheduledEnd: p.end })
        .where(eq(schema.tasks.id, p.id)),
    ),
  );

  return placements;
}

function minutesBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 60000);
}

function insertBusy(busy: Busy[], b: Busy) {
  const i = busy.findIndex((x) => x.start.getTime() > b.start.getTime());
  if (i === -1) busy.push(b);
  else busy.splice(i, 0, b);
}

function nextFreeSlot(
  from: Date,
  busy: Busy[],
  cfg: { workStartHour: number; workEndHour: number; horizonDays: number; now: Date },
): { start: Date; end: Date } | null {
  let cursor = from;
  const hardStop = addDays(cfg.now, cfg.horizonDays);

  while (isBefore(cursor, hardStop)) {
    const dayStart = setMinutes(setHours(startOfDay(cursor), cfg.workStartHour), 0);
    const dayEnd = setMinutes(setHours(startOfDay(cursor), cfg.workEndHour), 0);

    if (isBefore(cursor, dayStart)) cursor = dayStart;
    if (!isBefore(cursor, dayEnd)) {
      cursor = setMinutes(setHours(addDays(startOfDay(cursor), 1), cfg.workStartHour), 0);
      continue;
    }

    // first busy block that overlaps [cursor, dayEnd]
    const overlap = busy.find(
      (b) => isBefore(b.start, dayEnd) && isAfter(b.end, cursor),
    );

    if (!overlap || !isBefore(overlap.start, dayEnd)) {
      return { start: cursor, end: dayEnd };
    }

    if (isAfter(overlap.start, cursor)) {
      return { start: cursor, end: overlap.start };
    }

    // cursor inside a busy block — jump past it
    cursor = overlap.end;
  }

  return null;
}
