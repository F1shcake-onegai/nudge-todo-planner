import { db, schema } from "@/lib/db/client";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { startOfDay, endOfDay } from "date-fns";
import { parseHHMM } from "@/lib/scheduler";
import { renderCopy } from "@/lib/nudgeCopy";
import { newId } from "@/lib/utils";
import type { Task, Project } from "@/lib/db/schema";

const INTENSITY_COUNT: Record<string, number> = {
  off: 0,
  light: 2,
  balanced: 4,
  intense: 8,
};

// Jitter scales with slot density: ±20% of the inter-slot gap, clamped so
// sparse schedules don't drift wildly and dense ones stay noticeably random.
const JITTER_RATIO = 0.2;
const JITTER_MIN_MS = 8 * 60 * 1000; // 8 minutes
const JITTER_MAX_MS = 45 * 60 * 1000; // 45 minutes

function slotTimes(now: Date, workStart: number, workEnd: number, count: number): Date[] {
  if (count <= 0 || workEnd <= workStart) return [];
  const day = startOfDay(now);
  const windowHours = workEnd - workStart;
  const slotHours = windowHours / count;
  const gapMs = slotHours * 3_600_000;
  const jitterMs = Math.max(JITTER_MIN_MS, Math.min(JITTER_MAX_MS, gapMs * JITTER_RATIO));
  return Array.from({ length: count }, (_, i) => {
    const hour = workStart + slotHours * (i + 0.5);
    const base = new Date(day);
    base.setHours(0, 0, 0, 0);
    const ms = base.getTime() + hour * 3_600_000;
    const jitter = (Math.random() - 0.5) * 2 * jitterMs;
    return new Date(ms + jitter);
  });
}

function taskUrgency(t: Task, now: Date): number {
  let score = 0;
  if (t.deadline) {
    const days = (t.deadline.getTime() - now.getTime()) / 86_400_000;
    if (days < 0) score += 1000;
    else if (days < 1) score += 500;
    else if (days <= 7) score += 100;
  }
  // priority: 1 = high … 4 = none. lower p = more urgent.
  score += 50 * (4 - (t.priority ?? 4));
  return score;
}

function pickProjectAndTask(
  openTasks: Task[],
  projects: Project[],
  usedProjectIds: Set<string | null>,
  now: Date,
): { project: Project | null; task: Task } | null {
  if (openTasks.length === 0) return null;

  // group by project (null = "New Task" bucket)
  const byProject = new Map<string | null, Task[]>();
  for (const t of openTasks) {
    const key = t.projectId ?? null;
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key)!.push(t);
  }

  const available = [...byProject.keys()].filter((k) => !usedProjectIds.has(k));
  const pool = available.length ? available : [...byProject.keys()];

  // score each candidate project by its single most-urgent task
  const scored = pool.map((k) => {
    const tasks = byProject.get(k)!;
    const best = tasks.reduce((a, b) => (taskUrgency(b, now) > taskUrgency(a, now) ? b : a));
    return { projectId: k, score: taskUrgency(best, now), task: best };
  });
  scored.sort((a, b) => b.score - a.score);

  const winner = scored[0];
  const project = winner.projectId ? projects.find((p) => p.id === winner.projectId) ?? null : null;
  return { project, task: winner.task };
}

/**
 * Rebuild today's future notifications. Called at startup, on intensity change,
 * and after any task/project mutation that affects what should be nudged about.
 * Destructively clears unsent future rows for today first, then re-plans.
 */
export async function planToday(now: Date = new Date()) {
  const settings = await db.query.settings.findFirst();
  const intensity = settings?.notificationIntensity ?? "light";
  const count = INTENSITY_COUNT[intensity] ?? 0;

  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  // wipe unsent future rows in today's window
  await db
    .delete(schema.notifications)
    .where(
      and(
        isNull(schema.notifications.sentAt),
        gte(schema.notifications.scheduledAt, dayStart),
        lte(schema.notifications.scheduledAt, dayEnd),
      ),
    );

  if (count === 0) return { planned: 0, skipped: "intensity=off" as const };

  const workStart = parseHHMM(settings?.workHoursStart, 9);
  const workEnd = parseHHMM(settings?.workHoursEnd, 18);

  const openTasks = await db.query.tasks.findMany({
    where: and(sql`${schema.tasks.status} != 'done'`, isNull(schema.tasks.parentTaskId)),
  });
  if (openTasks.length === 0) return { planned: 0, skipped: "no-open-tasks" as const };

  const projects = await db.query.projects.findMany();

  const slots = slotTimes(now, workStart, workEnd, count).filter((s) => s > now);
  if (slots.length === 0) return { planned: 0, skipped: "end-of-workday" as const };

  const usedProjectIds = new Set<string | null>();
  const rows: (typeof schema.notifications.$inferInsert)[] = [];

  for (const slot of slots) {
    const pick = pickProjectAndTask(openTasks, projects, usedProjectIds, slot);
    if (!pick) break;
    usedProjectIds.add(pick.task.projectId ?? null);
    const copy = renderCopy({
      taskTitle: pick.task.title,
      projectName: pick.project?.name ?? null,
      deadline: pick.task.deadline,
      now: slot,
    });
    rows.push({
      id: newId("ntf"),
      taskId: pick.task.id,
      projectId: pick.task.projectId,
      scheduledAt: slot,
      copyTitle: copy.title,
      copyBody: copy.body,
    });
  }

  if (rows.length) await db.insert(schema.notifications).values(rows);
  return { planned: rows.length };
}

/** Fire-and-forget re-plan after any mutation that could affect the plan. */
export function replanAfterMutation() {
  planToday().catch((e) => {
    console.error("[nudge] replanAfterMutation failed:", (e as Error).message);
  });
}

/** Clean up sent notifications older than N days (called periodically). */
export async function pruneOldNotifications(days = 7) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  await db.delete(schema.notifications).where(lte(schema.notifications.scheduledAt, cutoff));
}
