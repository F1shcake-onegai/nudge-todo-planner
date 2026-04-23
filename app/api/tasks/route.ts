import { db, schema } from "@/lib/db/client";
import { desc } from "drizzle-orm";
import { newId } from "@/lib/utils";

export async function GET() {
  const [projects, tasks] = await Promise.all([
    db.query.projects.findMany({ orderBy: [desc(schema.projects.createdAt)] }),
    db.query.tasks.findMany({ orderBy: [desc(schema.tasks.createdAt)] }),
  ]);
  return Response.json({ projects, tasks });
}

export async function POST(req: Request) {
  const body = await req.json();
  const title: string = (body.title ?? "").trim();
  if (!title) return Response.json({ error: "title required" }, { status: 400 });

  const id = newId("tsk");
  await db.insert(schema.tasks).values({
    id,
    title,
    projectId: body.projectId ?? null,
    parentTaskId: body.parentTaskId ?? null,
    estimatedMinutes: Math.max(1, Math.floor(Number(body.estimatedMinutes) || 30)),
    priority: Math.max(1, Math.min(4, Math.floor(Number(body.priority) || 4))),
    deadline: body.deadline ? new Date(body.deadline) : undefined,
    notes: body.notes ?? null,
  });
  return Response.json({ id, ok: true });
}
