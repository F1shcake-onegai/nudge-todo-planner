import { db, schema } from "@/lib/db/client";
import { and, eq, sql } from "drizzle-orm";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  await db
    .update(schema.tasks)
    .set({ status: "done" })
    .where(and(eq(schema.tasks.projectId, id), sql`${schema.tasks.status} != 'done'`));
  return Response.json({ ok: true });
}
