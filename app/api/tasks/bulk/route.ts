import { db, schema } from "@/lib/db/client";
import { and, eq, isNull, sql } from "drizzle-orm";

type Body = {
  action: "complete" | "delete";
  projectId: string | null;
};

export async function POST(req: Request) {
  const { action, projectId } = (await req.json()) as Body;

  const projectCond =
    projectId === null ? isNull(schema.tasks.projectId) : eq(schema.tasks.projectId, projectId);

  if (action === "complete") {
    await db
      .update(schema.tasks)
      .set({ status: "done" })
      .where(and(projectCond, sql`${schema.tasks.status} != 'done'`));
    return Response.json({ ok: true });
  }
  if (action === "delete") {
    await db.delete(schema.tasks).where(projectCond);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
