import webpush from "web-push";
import { getSecret, setSecret } from "@/lib/secrets";

// GET: returns the public key for client-side push subscription
export async function GET() {
  const publicKey = await getSecret("VAPID_PUBLIC_KEY");
  return Response.json({ publicKey: publicKey ?? null });
}

// POST: generates a fresh VAPID key pair and stores it
export async function POST() {
  const keys = webpush.generateVAPIDKeys();
  await setSecret("VAPID_PUBLIC_KEY", keys.publicKey);
  await setSecret("VAPID_PRIVATE_KEY", keys.privateKey);
  await setSecret("NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey);
  const subject = await getSecret("VAPID_SUBJECT");
  if (!subject) await setSecret("VAPID_SUBJECT", "mailto:owner@example.com");
  return Response.json({ publicKey: keys.publicKey });
}
