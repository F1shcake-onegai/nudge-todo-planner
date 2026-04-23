import { db, schema } from "@/lib/db/client";
import { eq, lt } from "drizzle-orm";
import { SETTINGS_ID } from "@/lib/db/schema";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

export const SESSION_COOKIE = "nudge_session";
const BCRYPT_ROUNDS = 12;
const SHORT_SESSION_MS = 8 * 60 * 60 * 1000; // 8 hours
const LONG_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const APP_TOKEN_MS = 365 * 24 * 60 * 60 * 1000; // 1 year (revocable)

export type SessionLabel = "browser" | "app" | "caldav";

// ─── Credentials ──────────────────────────────────────────────────────────

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function getAdmin() {
  return db.query.credentials.findFirst();
}

export async function setAdminPassword(newPassword: string) {
  const hash = await hashPassword(newPassword);
  const existing = await getAdmin();
  if (!existing) throw new Error("No admin credentials row — run setup first");
  await db.update(schema.credentials).set({ passwordHash: hash }).where(eq(schema.credentials.id, SETTINGS_ID));
}

export async function createAdmin(username: string, password: string) {
  const existing = await getAdmin();
  if (existing) throw new Error("Admin already exists");
  const hash = await hashPassword(password);
  await db.insert(schema.credentials).values({
    id: SETTINGS_ID,
    username,
    passwordHash: hash,
  });
}

// ─── Sessions ─────────────────────────────────────────────────────────────

export async function createSession(opts: {
  label?: SessionLabel;
  remember?: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const label: SessionLabel = opts.label ?? "browser";
  const ttl =
    label === "app" ? APP_TOKEN_MS : opts.remember ? LONG_SESSION_MS : SHORT_SESSION_MS;
  const id = randomBytes(32).toString("base64url");
  const now = new Date();
  await db.insert(schema.sessions).values({
    id,
    label,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + ttl),
    ipAddress: opts.ipAddress ?? null,
    userAgent: opts.userAgent ?? null,
  });
  return { id, expiresAt: new Date(now.getTime() + ttl), label, ttlMs: ttl };
}

export async function getSession(token: string) {
  if (!token) return null;
  const row = await db.query.sessions.findFirst({ where: eq(schema.sessions.id, token) });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, token));
    return null;
  }
  // lightweight last-seen update (non-critical; skip on token-bucket churn later if needed)
  await db.update(schema.sessions).set({ lastSeenAt: new Date() }).where(eq(schema.sessions.id, token));
  return row;
}

export async function revokeSession(token: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, token));
}

export async function revokeAllSessions(exceptToken?: string) {
  if (exceptToken) {
    const all = await db.query.sessions.findMany();
    const ids = all.filter((s) => s.id !== exceptToken).map((s) => s.id);
    for (const id of ids) await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
  } else {
    await db.delete(schema.sessions);
  }
}

export async function pruneExpiredSessions() {
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
}

// ─── Request helpers ──────────────────────────────────────────────────────

/** Extract session token from cookie or Authorization: Bearer header. */
export function getTokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function currentSession(req: Request) {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  return getSession(token);
}

export function sessionCookie(token: string, ttlMs: number) {
  const maxAge = Math.floor(ttlMs / 1000);
  // In dev over http, Secure blocks the cookie entirely. Honor it only on https.
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=0`;
}

// ─── Rate limiting (simple in-memory token bucket, per IP) ────────────────

type Bucket = { count: number; resetAt: number };
const loginBuckets = new Map<string, Bucket>();
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 60 * 1000;

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = loginBuckets.get(ip);
  if (!b || b.resetAt < now) {
    loginBuckets.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (b.count >= LOGIN_LIMIT) {
    return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count++;
  return { allowed: true, retryAfterSec: 0 };
}

export function ipFromRequest(req: Request): string {
  // Behind a reverse proxy — honor forwarded headers. Otherwise unknown.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
