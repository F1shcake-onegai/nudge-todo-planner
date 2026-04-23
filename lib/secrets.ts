import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";

export const SECRET_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];

/** DB first, env as fallback. */
export async function getSecret(name: SecretKey): Promise<string | undefined> {
  const row = await db.query.providerKeys.findFirst({
    where: eq(schema.providerKeys.provider, name),
  });
  const v = row?.encryptedKey;
  if (v && v.length > 0) return v;
  return process.env[name];
}

export async function setSecret(name: SecretKey, value: string | null) {
  const existing = await db.query.providerKeys.findFirst({
    where: eq(schema.providerKeys.provider, name),
  });
  if (value === null || value === "") {
    if (existing) await db.delete(schema.providerKeys).where(eq(schema.providerKeys.provider, name));
    return;
  }
  if (existing) {
    await db
      .update(schema.providerKeys)
      .set({ encryptedKey: value })
      .where(eq(schema.providerKeys.provider, name));
  } else {
    await db.insert(schema.providerKeys).values({ provider: name, encryptedKey: value });
  }
}

/** List all secrets with presence state (don't leak values back to client). */
export async function listSecretsStatus() {
  const rows = await db.query.providerKeys.findMany();
  const byName = new Map(rows.map((r) => [r.provider, r.encryptedKey]));
  return SECRET_KEYS.map((k) => {
    const dbValue = byName.get(k);
    const envValue = process.env[k];
    const hasDb = !!(dbValue && dbValue.length > 0);
    const hasEnv = !!(envValue && envValue.length > 0);
    return {
      name: k,
      hasDb,
      hasEnv,
      source: hasDb ? ("db" as const) : hasEnv ? ("env" as const) : ("none" as const),
      // surface non-secret values for UX (e.g. VAPID_SUBJECT, the public key)
      value:
        k === "VAPID_SUBJECT" || k === "NEXT_PUBLIC_VAPID_PUBLIC_KEY" || k === "VAPID_PUBLIC_KEY"
          ? dbValue ?? envValue ?? ""
          : "",
    };
  });
}
