import webpush from "web-push";
import { getSecret, setSecret } from "@/lib/secrets";
import { db, schema } from "@/lib/db/client";

export async function GET() {
  const publicKey = await getSecret("VAPID_PUBLIC_KEY");
  return Response.json({ publicKey: publicKey ?? null });
}

export async function POST() {
  const keys = webpush.generateVAPIDKeys();
  await setSecret("VAPID_PUBLIC_KEY", keys.publicKey);
  await setSecret("VAPID_PRIVATE_KEY", keys.privateKey);
  await setSecret("NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey);
  const subject = await getSecret("VAPID_SUBJECT");
  if (!subject) await setSecret("VAPID_SUBJECT", "mailto:owner@example.com");

  // Every existing subscription is bound to the previous VAPID public key at
  // the push service; rotating keys orphans them permanently. Clear the table
  // so the client re-subscribes cleanly on next toggle.
  const { rowsAffected } = await db.delete(schema.subscriptions);

  return Response.json({ publicKey: keys.publicKey, clearedSubscriptions: rowsAffected });
}
