import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ────────────────────────────────────────────────────────────────────
// Known secret keys. Kept here so the Settings UI can enumerate them
// and the startup migration knows what to touch.
// ────────────────────────────────────────────────────────────────────

export const SECRET_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];

/** Values the Settings UI is allowed to show in plain text (not true secrets). */
const PUBLIC_DISPLAY: ReadonlySet<SecretKey> = new Set<SecretKey>([
  "VAPID_SUBJECT",
  "VAPID_PUBLIC_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
]);

// ────────────────────────────────────────────────────────────────────
// Master key resolution
//   1. NUDGE_MASTER_KEY env  (hex or base64, 32 bytes)
//   2. MASTER_KEY_FILE       (path to a file containing the key — Docker secrets)
//   3. ./data/.master_key    (auto-generated dev fallback)
// ────────────────────────────────────────────────────────────────────

let cachedKey: Buffer | null = null;

function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const buf = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "NUDGE_MASTER_KEY must decode to exactly 32 bytes (hex or base64). " +
        `Got ${buf.length} bytes.`,
    );
  }
  return buf;
}

function devFallbackPath() {
  return resolve(process.cwd(), "data", ".master_key");
}

function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;

  const envVal = process.env.NUDGE_MASTER_KEY;
  if (envVal) {
    cachedKey = parseKey(envVal);
    return cachedKey;
  }

  const fileEnv = process.env.MASTER_KEY_FILE;
  if (fileEnv && existsSync(fileEnv)) {
    cachedKey = parseKey(readFileSync(fileEnv, "utf8"));
    return cachedKey;
  }

  // Dev fallback: auto-generate once and persist in ./data/.master_key.
  // Gitignored by /data pattern. Production deployments should set
  // NUDGE_MASTER_KEY or MASTER_KEY_FILE explicitly.
  const devPath = devFallbackPath();
  if (!existsSync(devPath)) {
    mkdirSync(dirname(devPath), { recursive: true });
    const generated = randomBytes(32).toString("base64");
    writeFileSync(devPath, generated, { mode: 0o600 });
    console.warn(
      `[nudge] Generated dev master key at ${devPath}. Set NUDGE_MASTER_KEY or MASTER_KEY_FILE in production.`,
    );
  }
  cachedKey = parseKey(readFileSync(devPath, "utf8"));
  return cachedKey;
}

// ────────────────────────────────────────────────────────────────────
// AES-256-GCM wrap  —  format:  v1:<iv_b64url>:<tag_b64url>:<ct_b64url>
// ────────────────────────────────────────────────────────────────────

const FORMAT = "v1";

export function encrypt(plain: string): string {
  const key = getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${FORMAT}:${iv.toString("base64url")}:${tag.toString("base64url")}:${ct.toString("base64url")}`;
}

export function decrypt(blob: string): string {
  const key = getMasterKey();
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== FORMAT) {
    throw new Error("Invalid ciphertext format");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ct = Buffer.from(parts[3], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString("utf8");
}

function isCiphertext(v: string | null | undefined): boolean {
  return !!v && v.startsWith(`${FORMAT}:`);
}

// ────────────────────────────────────────────────────────────────────
// Public API (same shape as before — drop-in for callers)
// ────────────────────────────────────────────────────────────────────

export async function getSecret(name: SecretKey): Promise<string | undefined> {
  const row = await db.query.providerKeys.findFirst({
    where: eq(schema.providerKeys.provider, name),
  });
  const stored = row?.encryptedKey;

  if (stored) {
    if (isCiphertext(stored)) {
      try {
        return decrypt(stored);
      } catch (e) {
        console.error(`[nudge] Failed to decrypt secret ${name}:`, (e as Error).message);
        return undefined;
      }
    }
    // Legacy plaintext: migrate in place, then return.
    try {
      const wrapped = encrypt(stored);
      await db
        .update(schema.providerKeys)
        .set({ encryptedKey: wrapped })
        .where(eq(schema.providerKeys.provider, name));
    } catch (e) {
      console.error(`[nudge] Failed to re-encrypt ${name}:`, (e as Error).message);
    }
    return stored;
  }

  return process.env[name];
}

export async function setSecret(name: SecretKey, value: string | null) {
  const existing = await db.query.providerKeys.findFirst({
    where: eq(schema.providerKeys.provider, name),
  });
  if (value === null || value === "") {
    if (existing) {
      await db
        .delete(schema.providerKeys)
        .where(eq(schema.providerKeys.provider, name));
    }
    return;
  }
  const wrapped = encrypt(value);
  if (existing) {
    await db
      .update(schema.providerKeys)
      .set({ encryptedKey: wrapped })
      .where(eq(schema.providerKeys.provider, name));
  } else {
    await db.insert(schema.providerKeys).values({ provider: name, encryptedKey: wrapped });
  }
}

export async function listSecretsStatus() {
  // Opportunistic bulk migration: any plaintext row gets encrypted on this pass.
  // Ensures a single visit to Settings upgrades all legacy rows without
  // requiring an explicit migration script.
  const rows = await db.query.providerKeys.findMany();
  for (const row of rows) {
    if (!isCiphertext(row.encryptedKey)) {
      try {
        row.encryptedKey = encrypt(row.encryptedKey);
        await db
          .update(schema.providerKeys)
          .set({ encryptedKey: row.encryptedKey })
          .where(eq(schema.providerKeys.provider, row.provider));
      } catch (e) {
        console.error(`[nudge] migrate ${row.provider}:`, (e as Error).message);
      }
    }
  }
  const byName = new Map(rows.map((r) => [r.provider, r.encryptedKey]));
  return Promise.all(
    SECRET_KEYS.map(async (k) => {
      const dbValue = byName.get(k);
      const envValue = process.env[k];
      const hasDb = !!dbValue;
      const hasEnv = !!envValue;
      let displayValue = "";
      if (PUBLIC_DISPLAY.has(k)) {
        if (hasDb) {
          try {
            displayValue = isCiphertext(dbValue!) ? decrypt(dbValue!) : dbValue!;
          } catch {
            displayValue = "";
          }
        } else if (hasEnv) {
          displayValue = envValue!;
        }
      }
      return {
        name: k,
        hasDb,
        hasEnv,
        source: hasDb ? ("db" as const) : hasEnv ? ("env" as const) : ("none" as const),
        value: displayValue,
      };
    }),
  );
}
