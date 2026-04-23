/**
 * One-off reset of admin credentials.
 * Usage: `npx tsx scripts/reset-admin.ts <username> <password>`
 * Wipes all sessions, replaces credentials, leaves tasks/projects/settings untouched.
 */

import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../lib/db/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { SETTINGS_ID } from "../lib/db/schema";

async function main() {
  const [, , username, password] = process.argv;
  if (!username || !password) {
    console.error("Usage: npx tsx scripts/reset-admin.ts <username> <password>");
    process.exit(1);
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,30}$/i.test(username)) {
    console.error("Invalid username (must match /^[a-z0-9][a-z0-9._-]{1,30}$/i)");
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("Password must be at least 10 characters");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL ?? "file:./local.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  const client = createClient({ url, authToken });
  const db = drizzle(client, { schema });

  await db.delete(schema.sessions);
  await db.delete(schema.credentials);
  const hash = await bcrypt.hash(password, 12);
  await db.insert(schema.credentials).values({
    id: SETTINGS_ID,
    username,
    passwordHash: hash,
  });
  await db.update(schema.settings).set({ bootstrapped: true }).where(eq(schema.settings.id, SETTINGS_ID));

  console.log(`Reset admin to: ${username}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
