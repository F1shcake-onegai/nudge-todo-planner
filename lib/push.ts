import webpush from "web-push";
import { getSecret } from "@/lib/secrets";

let configuredFor: string | null = null;

async function ensureConfigured() {
  const pub = await getSecret("VAPID_PUBLIC_KEY");
  const priv = await getSecret("VAPID_PRIVATE_KEY");
  const subject = (await getSecret("VAPID_SUBJECT")) || "mailto:unset@example.com";
  if (!pub || !priv) {
    throw new Error("VAPID keys missing. Generate them in Settings → API keys (or run `npm run vapid:gen`).");
  }
  // reconfigure if keys changed
  if (configuredFor !== pub) {
    webpush.setVapidDetails(subject, pub, priv);
    configuredFor = pub;
  }
}

export async function sendPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body?: string; url?: string; tag?: string },
) {
  await ensureConfigured();
  try {
    await webpush.sendNotification(subscription as any, JSON.stringify(payload));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, statusCode: e?.statusCode, error: e?.message };
  }
}
