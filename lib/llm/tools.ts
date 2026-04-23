import { tool } from "ai";
import { z } from "zod";
import { and, eq, gt, inArray, like, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { newId } from "@/lib/utils";
import { replanAfterMutation } from "@/lib/nudgePlanner";

// ---- Shared sub-schemas ----

const SubtaskIn = z.object({
  title: z.string(),
  notes: z.string().optional(),
});

const TaskIn = z.object({
  projectName: z.string().describe("Project this task belongs to. Will be created if new."),
  title: z.string(),
  notes: z.string().optional(),
  priority: z
    .number()
    .int()
    .min(1)
    .max(4)
    .default(4)
    .describe("1 = high, 2 = medium, 3 = low, 4 = none (default). Only raise when the user signals urgency."),
  deadlineIso: z
    .string()
    .datetime()
    .optional()
    .describe("ISO 8601 deadline in the user's timezone. Leave empty if none."),
  subtasks: z.array(SubtaskIn).default([]),
});

const Selector = z
  .object({
    ids: z.array(z.string()).optional(),
    titleMatches: z.string().optional().describe("Substring of the task title (case-insensitive)."),
    projectName: z.string().optional(),
    status: z
      .enum(["todo", "doing", "done"])
      .optional()
      .describe("Match only tasks in this status."),
    createdBefore: z
      .string()
      .datetime()
      .optional()
      .describe("ISO 8601. Match tasks with createdAt strictly before this time (e.g. 'a week ago')."),
    createdAfter: z
      .string()
      .datetime()
      .optional()
      .describe("ISO 8601. Match tasks with createdAt strictly after this time (e.g. 'today')."),
  })
  .describe("How to find tasks. Provide at least one field; fields AND together.");

// ---- Helpers ----

async function upsertProject(name: string) {
  const existing = await db.query.projects.findFirst({
    where: eq(schema.projects.name, name),
  });
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
    const p = await db.query.projects.findFirst({
      where: eq(schema.projects.name, sel.projectName),
    });
    if (p) conds.push(eq(schema.tasks.projectId, p.id));
    else return [];
  }
  if (sel.status) conds.push(eq(schema.tasks.status, sel.status));
  if (sel.createdBefore) conds.push(lt(schema.tasks.createdAt, new Date(sel.createdBefore)));
  if (sel.createdAfter) conds.push(gt(schema.tasks.createdAt, new Date(sel.createdAfter)));
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
    const projectsByName = new Map<string, { id: string; name: string }>();
    const uniqueNames = [...new Set(tasks.map((t) => t.projectName))];
    const resolved = await Promise.all(uniqueNames.map((n) => upsertProject(n)));
    resolved.forEach((p) => projectsByName.set(p.name, p));

    const rows: (typeof schema.tasks.$inferInsert)[] = [];
    const created: { id: string; title: string; project: string }[] = [];

    for (const t of tasks) {
      const project = projectsByName.get(t.projectName)!;
      const id = newId("tsk");
      rows.push({
        id,
        projectId: project.id,
        title: t.title,
        notes: t.notes,
        priority: t.priority,
        deadline: t.deadlineIso ? new Date(t.deadlineIso) : undefined,
      });
      for (const s of t.subtasks) {
        rows.push({
          id: newId("tsk"),
          projectId: project.id,
          parentTaskId: id,
          title: s.title,
          notes: s.notes,
          priority: t.priority,
        });
      }
      created.push({ id, title: t.title, project: project.name });
    }

    if (rows.length) await db.insert(schema.tasks).values(rows);
    replanAfterMutation();
    return {
      created,
      message: `Created ${created.length} task(s).`,
    };
  },
});

export const update_tasks = tool({
  description:
    "Update existing tasks by selector. Use when the user says things like 'move the photo project deadline to Monday', 'mark chapter 3 done', or 'set priority high on the overdue ones'.",
  inputSchema: z.object({
    selector: Selector,
    patch: z.object({
      title: z.string().optional(),
      notes: z.string().optional(),
      deadlineIso: z.string().datetime().nullable().optional(),
      priority: z.number().int().min(1).max(4).optional(),
      status: z.enum(["todo", "doing", "done"]).optional(),
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
    if (patch.status !== undefined) values.status = patch.status;

    await db
      .update(schema.tasks)
      .set(values)
      .where(inArray(schema.tasks.id, matches.map((m) => m.id)));

    replanAfterMutation();
    return { updated: matches.length, message: `Updated ${matches.length} task(s).` };
  },
});

export const delete_tasks = tool({
  description:
    "Delete tasks by selector. Set confirm=true only after the user has clearly authorized deletion in THIS turn. " +
    "If confirm=false, the app will surface a confirmation dialog before executing. " +
    "Supports filtering by status + creation date, so 'delete all completed tasks older than a week' resolves cleanly.",
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
    replanAfterMutation();
    return { deleted: matches.length, message: `Deleted ${matches.length} task(s).` };
  },
});

export const tools = {
  create_tasks,
  update_tasks,
  delete_tasks,
};
