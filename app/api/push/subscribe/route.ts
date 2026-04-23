import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { newId } from "@/lib/utils";

export async function POST(req: Request) {
  const sub = await req.json();
  const { endpoint, keys, label } = sub as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    label?: string;
  };
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return Response.json({ error: "Invalid subscription" }, { status: 400 });
  }
  const existing = await db.query.subscriptions.findFirst({
    where: eq(schema.subscriptions.endpoint, endpoint),
  });
  if (existing) return Response.json({ ok: true, id: existing.id });

  const id = newId("sub");
  await db.insert(schema.subscriptions).values({
    id,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    label: label ?? null,
  });
  return Response.json({ ok: true, id });
}

export async function DELETE(req: Request) {
  const { endpoint } = await req.json();
  if (!endpoint) return Response.json({ error: "endpoint required" }, { status: 400 });
  await db.delete(schema.subscriptions).where(eq(schema.subscriptions.endpoint, endpoint));
  return Response.json({ ok: true });
}
