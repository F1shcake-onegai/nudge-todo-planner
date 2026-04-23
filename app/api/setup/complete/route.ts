import webpush from "web-push";
import {
  createAdmin,
  createSession,
  getAdmin,
  ipFromRequest,
  sessionCookie,
} from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { SETTINGS_ID } from "@/lib/db/schema";
import { setSecret, type SecretKey } from "@/lib/secrets";

type Payload = {
  username: string;
  password: string;
  timezone?: string;
  workHoursStart?: string;
  workHoursEnd?: string;
  notificationIntensity?: "off" | "light" | "balanced" | "intense";
  llmProvider?: "anthropic" | "openai" | "google";
  llmModel?: string;
  llmApiKey?: string;
  vapidEmail?: string; // optional — empty falls back to mailto:unset@example.com
};

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,30}$/i;
const INTENSITY = new Set(["off", "light", "balanced", "intense"]);
const PROVIDER_KEY: Record<string, SecretKey> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

export async function POST(req: Request) {
  const existing = await getAdmin();
  if (existing) return Response.json({ error: "Already bootstrapped" }, { status: 409 });

  const body = (await req.json()) as Payload;
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!USERNAME_RE.test(username)) {
    return Response.json({ error: "Invalid username" }, { status: 400 });
  }
  if (password.length < 10) {
    return Response.json({ error: "Password must be at least 10 characters" }, { status: 400 });
  }

  const provider = body.llmProvider ?? "anthropic";
  if (!PROVIDER_KEY[provider]) {
    return Response.json({ error: "Unknown LLM provider" }, { status: 400 });
  }
  const apiKey = (body.llmApiKey ?? "").trim();
  if (!apiKey) {
    return Response.json({ error: "An LLM API key is required" }, { status: 400 });
  }

  const settingsPatch: Partial<typeof schema.settings.$inferInsert> = {
    bootstrapped: true,
    llmProvider: provider,
  };
  if (body.timezone && typeof body.timezone === "string") settingsPatch.timezone = body.timezone;
  if (body.workHoursStart) settingsPatch.workHoursStart = body.workHoursStart;
  if (body.workHoursEnd) settingsPatch.workHoursEnd = body.workHoursEnd;
  if (body.notificationIntensity && INTENSITY.has(body.notificationIntensity)) {
    settingsPatch.notificationIntensity = body.notificationIntensity;
  }
  if (body.llmModel) settingsPatch.llmModel = body.llmModel;

  const currentSettings = await db.query.settings.findFirst();
  if (!currentSettings) {
    await db.insert(schema.settings).values({ id: SETTINGS_ID, ...settingsPatch });
  } else {
    await db.update(schema.settings).set(settingsPatch).where(eq(schema.settings.id, SETTINGS_ID));
  }

  // LLM key
  await setSecret(PROVIDER_KEY[provider], apiKey);

  // VAPID: auto-generate fresh pair. Subject: user email (if given) -> mailto:, else placeholder.
  const keys = webpush.generateVAPIDKeys();
  await setSecret("VAPID_PUBLIC_KEY", keys.publicKey);
  await setSecret("VAPID_PRIVATE_KEY", keys.privateKey);
  await setSecret("NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey);
  const email = (body.vapidEmail ?? "").trim();
  const subject = email ? `mailto:${email}` : "mailto:unset@example.com";
  await setSecret("VAPID_SUBJECT", subject);

  // Credentials + session
  await createAdmin(username, password);
  const session = await createSession({
    label: "browser",
    remember: true,
    ipAddress: ipFromRequest(req),
    userAgent: req.headers.get("user-agent"),
  });

  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", sessionCookie(session.id, session.ttlMs));
  return new Response(JSON.stringify({ ok: true, username }), { status: 200, headers });
}
