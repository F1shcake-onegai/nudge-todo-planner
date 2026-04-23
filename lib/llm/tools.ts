import { tool } from "ai";
import { z } from "zod";
import { and, eq, inArray, like } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { newId } from "@/lib/utils";
import { scheduleAllPending } from "@/lib/scheduler";
import { addDays } from "date-fns";

async function externalBusy() {
  try {
    const { getBusyWindows } = await import("@/lib/google");
    const now = new Date();
    return await getBusyWindows(now.toISOString(), addDays(now, 14).toISOString());
  } catch {
    return [];
  }
}

// ---- Shared sub-schemas ----

const SubtaskIn = z.object({
  title: z.string(),
  estimatedMinutes: z.number().int().positive().default(30),
  notes: z.string().optional(),
});

const TaskIn = z.object({
  projectName: z.string().describe("Project this task belongs to. Will be created if new."),
  title: z.string(),
  notes: z.string().optional(),
  estimatedMinutes: z.number().int().positive().default(30),
  priority: z.number().int().min(1).max(4).default(4).describe("1 = high, 2 = medium, 3 = low, 4 = none (default). Only raise when the user signals urgency."),
  deadlineIso: z.string().datetime().optional().describe("ISO 8601 deadline in the user's timezone. Leave empty if none."),
  subtasks: z.array(SubtaskIn).default([]),
});

const Selector = z
  .object({
    ids: z.array(z.string()).optional(),
    titleMatches: z.string().optional().describe("Substring of the task title (case-insensitive)."),
    projectName: z.string().optional(),
  })
  .describe("How to find tasks. Provide at least one field.");

// ---- Helpers ----

async function upsertProject(name: string) {
  const existing = await db.query.projects.findFirst({ where: eq(schema.projects.name, name) });
  if (existing) return existing;
  const id = newId("prj");
  await db.insert(schema.projects).values({ id, name });
  return { id, name, color: "#c96442", createdAt: new Date() };
}

async function resolveSelector(sel: z.infer<typeof Selector>) {
  const conds = [];
  if (sel.ids?.length) conds.push(inArray(schema.tasks.id, sel.ids));
  if (sel.titleMatches) conds.push(like(schema.tasks.title, `%${sel.titleMatches}%`));
  if (sel.projectName) {
    const p = await db.query.projects.findFirst({ where: eq(schema.projects.name, sel.projectName) });
    if (p) conds.push(eq(schema.tasks.projectId, p.id));
    else return [];
  }
  if (!conds.length) return [];
  return db.query.tasks.findMany({ where: and(...conds) });
}

// ---- Tools ----

export const create_tasks = tool({
  description:
    "Create one or more tasks. Each task can have subtasks. Projects are auto-created if missing. " +
    "Call this when the user brain-dumps new work.",
  inputSchema: z.object({ tasks: z.array(TaskIn).min(1) }),
  execute: async ({ tasks }) => {
    const created: { id: string; title: string; project: string }[] = [];
    for (const t of tasks) {
      const project = await upsertProject(t.projectName);
      const id = newId("tsk");
      await db.insert(schema.tasks).values({
        id,
        projectId: project.id,
        title: t.title,
        notes: t.notes,
        estimatedMinutes: t.estimatedMinutes,
        priority: t.priority,
        deadline: t.deadlineIso ? new Date(t.deadlineIso) : undefined,
      });
      for (const s of t.subtasks) {
        await db.insert(schema.tasks).values({
          id: newId("tsk"),
          projectId: project.id,
          parentTaskId: id,
          title: s.title,
          notes: s.notes,
          estimatedMinutes: s.estimatedMinutes,
          priority: t.priority,
        });
      }
      created.push({ id, title: t.title, project: project.name });
    }
    const placed = await scheduleAllPending({ externalBusy: await externalBusy() });
    return {
      created,
      scheduled: placed.length,
      message: `Created ${created.length} task(s) and scheduled ${placed.length} block(s).`,
    };
  },
});

export const update_tasks = tool({
  description:
    "Update existing tasks by selector. Use when the user says things like 'move the photo project to Monday' or 'mark chapter 3 done'.",
  inputSchema: z.object({
    selector: Selector,
    patch: z.object({
      title: z.string().optional(),
      notes: z.string().optional(),
      deadlineIso: z.string().datetime().nullable().optional(),
      priority: z.number().int().min(1).max(4).optional(),
      estimatedMinutes: z.number().int().positive().optional(),
      status: z.enum(["todo", "doing", "done"]).optional(),
      rescheduleNow: z.boolean().optional().describe("If true, clear existing scheduledStart/End so the scheduler re-places it."),
    }),
  }),
  execute: async ({ selector, patch }) => {
    const matches = await resolveSelector(selector);
    if (!matches.length) return { updated: 0, message: "No tasks matched that selector." };

    const values: Partial<typeof schema.tasks.$inferInsert> = {};
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.notes !== undefined) values.notes = patch.notes;
    if (patch.deadlineIso !== undefined)
      values.deadline = patch.deadlineIso ? new Date(patch.deadlineIso) : null;
    if (patch.priority !== undefined) values.priority = patch.priority;
    if (patch.estimatedMinutes !== undefined) values.estimatedMinutes = patch.estimatedMinutes;
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.rescheduleNow) {
      values.scheduledStart = null;
      values.scheduledEnd = null;
    }

    await db
      .update(schema.tasks)
      .set(values)
      .where(inArray(schema.tasks.id, matches.map((m) => m.id)));

    if (patch.rescheduleNow || patch.deadlineIso !== undefined) {
      await scheduleAllPending({ externalBusy: await externalBusy() });
    }

    return { updated: matches.length, message: `Updated ${matches.length} task(s).` };
  },
});

export const delete_tasks = tool({
  description:
    "Delete tasks by selector. Set confirm=true only after the user has clearly authorized deletion. " +
    "If confirm=false, the app will surface a confirmation dialog before executing.",
  inputSchema: z.object({
    selector: Selector,
    confirm: z.boolean().default(false),
  }),
  execute: async ({ selector, confirm }) => {
    const matches = await resolveSelector(selector);
    if (!matches.length) return { deleted: 0, message: "No tasks matched that selector." };

    if (!confirm) {
      return {
        pending: true,
        matchedIds: matches.map((m) => m.id),
        message: `Would delete ${matches.length} task(s). Awaiting confirmation.`,
      };
    }

    await db.delete(schema.tasks).where(inArray(schema.tasks.id, matches.map((m) => m.id)));
    return { deleted: matches.length, message: `Deleted ${matches.length} task(s).` };
  },
});

// ---- Calendar event tools (stubbed when Google not linked) ----

export const create_event = tool({
  description:
    "Create a Google Calendar event for a scheduled task block. Only works if Google Calendar is linked.",
  inputSchema: z.object({
    taskId: z.string(),
    startIso: z.string().datetime(),
    endIso: z.string().datetime(),
    title: z.string(),
  }),
  execute: async ({ taskId, startIso, endIso, title }) => {
    const { createCalendarEvent } = await import("@/lib/google");
    const res = await createCalendarEvent({ taskId, start: new Date(startIso), end: new Date(endIso), title });
    return res;
  },
});

export const update_event = tool({
  description: "Update a Google Calendar event linked to a task.",
  inputSchema: z.object({
    taskId: z.string(),
    patch: z.object({
      startIso: z.string().datetime().optional(),
      endIso: z.string().datetime().optional(),
      title: z.string().optional(),
    }),
  }),
  execute: async ({ taskId, patch }) => {
    const { updateCalendarEvent } = await import("@/lib/google");
    return updateCalendarEvent(taskId, patch);
  },
});

export const delete_event = tool({
  description: "Delete a Google Calendar event linked to a task.",
  inputSchema: z.object({ taskId: z.string(), confirm: z.boolean().default(false) }),
  execute: async ({ taskId, confirm }) => {
    if (!confirm) return { pending: true, message: "Awaiting confirmation." };
    const { deleteCalendarEvent } = await import("@/lib/google");
    return deleteCalendarEvent(taskId);
  },
});

export const tools = {
  create_tasks,
  update_tasks,
  delete_tasks,
  create_event,
  update_event,
  delete_event,
};
