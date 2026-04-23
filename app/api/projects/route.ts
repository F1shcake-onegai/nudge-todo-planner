import { db, schema } from "@/lib/db/client";
import { isNull } from "drizzle-orm";
import { newId } from "@/lib/utils";

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "name required" }, { status: 400 });

  const color = typeof body.color === "string" && body.color ? body.color : "#c96442";
  const absorb = !!body.absorbUnassigned;

  const id = newId("prj");
  await db.insert(schema.projects).values({ id, name, color });

  if (absorb) {
    await db
      .update(schema.tasks)
      .set({ projectId: id })
      .where(isNull(schema.tasks.projectId));
  }

  return Response.json({ id, name, color, ok: true });
}
