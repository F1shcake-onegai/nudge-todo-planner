import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await req.json();
  const values: Partial<typeof schema.projects.$inferInsert> = {};
  if (body.name !== undefined) values.name = String(body.name).trim();
  if (body.color !== undefined) values.color = body.color;
  if (Object.keys(values).length === 0) return Response.json({ ok: true, noop: true });
  await db.update(schema.projects).set(values).where(eq(schema.projects.id, id));
  return Response.json({ ok: true });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const cascade = url.searchParams.get("cascade") === "true";

  // libSQL doesn't enforce FK cascade by default — handle explicitly.
  if (cascade) {
    // subtasks share projectId with their parent, so one delete covers both
    await db.delete(schema.tasks).where(eq(schema.tasks.projectId, id));
  } else {
    await db.update(schema.tasks).set({ projectId: null }).where(eq(schema.tasks.projectId, id));
  }
  await db.delete(schema.projects).where(eq(schema.projects.id, id));
  return Response.json({ ok: true });
}
