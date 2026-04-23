import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";

async function loadOrInit() {
  const existing = await db.query.settings.findFirst();
  if (existing) return existing;
  await db.insert(schema.settings).values({ id: "singleton" });
  return (await db.query.settings.findFirst())!;
}

export async function GET() {
  const s = await loadOrInit();
  return Response.json(s);
}

export async function PATCH(req: Request) {
  const body = await req.json();
  await loadOrInit();
  const allowed: (keyof typeof schema.settings.$inferInsert)[] = [
    "workHoursStart",
    "workHoursEnd",
    "timezone",
    "llmProvider",
    "llmModel",
    "llmEditModel",
    "googleReadCalendarIds",
    "googleWriteCalendarId",
  ];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];
  await db.update(schema.settings).set(patch).where(eq(schema.settings.id, "singleton"));
  const s = await db.query.settings.findFirst();
  return Response.json(s);
}
