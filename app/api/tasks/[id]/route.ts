import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { replanAfterMutation } from "@/lib/nudgePlanner";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await req.json();
  const values: Partial<typeof schema.tasks.$inferInsert> = {};

  if (body.title !== undefined) values.title = body.title;
  if (body.notes !== undefined) values.notes = body.notes;
  if (body.status !== undefined) values.status = body.status;
  if (body.priority !== undefined) {
    const p = Math.floor(Number(body.priority));
    if (Number.isFinite(p)) values.priority = Math.max(1, Math.min(4, p));
  }
  if (body.deadline !== undefined)
    values.deadline = body.deadline ? new Date(body.deadline) : null;
  if (body.projectId !== undefined) values.projectId = body.projectId;
  if (body.parentTaskId !== undefined) values.parentTaskId = body.parentTaskId;

  if (Object.keys(values).length === 0) {
    return Response.json({ ok: true, noop: true });
  }

  await db.update(schema.tasks).set(values).where(eq(schema.tasks.id, id));
  replanAfterMutation();
  return Response.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
  replanAfterMutation();
  return Response.json({ ok: true });
}
