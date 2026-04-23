import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { getSecret } from "@/lib/secrets";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

function getRedirectUri() {
  const base = process.env.AUTH_URL ?? "http://localhost:3000";
  return `${base}/api/google/callback`;
}

async function oauthClient(): Promise<OAuth2Client> {
  const clientId = await getSecret("GOOGLE_CLIENT_ID");
  const clientSecret = await getSecret("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured (add them in Settings → API keys)");
  }
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

export async function buildAuthUrl() {
  const c = await oauthClient();
  return c.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const c = await oauthClient();
  const { tokens } = await c.getToken(code);
  await db.delete(schema.googleTokens).where(eq(schema.googleTokens.id, "singleton"));
  await db.insert(schema.googleTokens).values({
    id: "singleton",
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? null,
    scope: tokens.scope ?? null,
    tokenType: tokens.token_type ?? null,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  });
  await db.update(schema.settings).set({ googleLinked: true }).where(eq(schema.settings.id, "singleton"));
}

async function getAuthorizedClient(): Promise<OAuth2Client | null> {
  const row = await db.query.googleTokens.findFirst();
  if (!row) return null;
  const c = await oauthClient();
  c.setCredentials({
    access_token: row.accessToken,
    refresh_token: row.refreshToken ?? undefined,
    expiry_date: row.expiryDate ? row.expiryDate.getTime() : undefined,
  });
  // persist refreshed tokens
  c.on("tokens", async (t) => {
    await db
      .update(schema.googleTokens)
      .set({
        accessToken: t.access_token ?? row.accessToken,
        refreshToken: t.refresh_token ?? row.refreshToken,
        expiryDate: t.expiry_date ? new Date(t.expiry_date) : row.expiryDate,
      })
      .where(eq(schema.googleTokens.id, "singleton"));
  });
  return c;
}

export async function listCalendars() {
  const auth = await getAuthorizedClient();
  if (!auth) return [];
  const cal = google.calendar({ version: "v3", auth });
  const res = await cal.calendarList.list({ minAccessRole: "writer" });
  return (res.data.items ?? []).map((c) => ({
    id: c.id!,
    summary: c.summary ?? c.id!,
    primary: !!c.primary,
    backgroundColor: c.backgroundColor ?? undefined,
    accessRole: c.accessRole ?? undefined,
  }));
}

async function settings() {
  return db.query.settings.findFirst();
}

export async function getBusyWindows(fromIso: string, toIso: string) {
  const auth = await getAuthorizedClient();
  if (!auth) return [];
  const s = await settings();
  const calIds: string[] = s?.googleReadCalendarIds
    ? (JSON.parse(s.googleReadCalendarIds) as string[])
    : ["primary"];
  const cal = google.calendar({ version: "v3", auth });
  const res = await cal.freebusy.query({
    requestBody: {
      timeMin: fromIso,
      timeMax: toIso,
      items: calIds.map((id) => ({ id })),
    },
  });
  const out: { start: Date; end: Date }[] = [];
  for (const key of Object.keys(res.data.calendars ?? {})) {
    for (const b of res.data.calendars![key].busy ?? []) {
      if (b.start && b.end) out.push({ start: new Date(b.start), end: new Date(b.end) });
    }
  }
  return out;
}

export async function createCalendarEvent(args: {
  taskId: string;
  start: Date;
  end: Date;
  title: string;
}) {
  const auth = await getAuthorizedClient();
  if (!auth) return { skipped: true, message: "Google Calendar not linked — stored locally only." };
  const s = await settings();
  const calendarId = s?.googleWriteCalendarId ?? "primary";
  const cal = google.calendar({ version: "v3", auth });
  const res = await cal.events.insert({
    calendarId,
    requestBody: {
      summary: args.title,
      start: { dateTime: args.start.toISOString() },
      end: { dateTime: args.end.toISOString() },
      extendedProperties: { private: { nudgeTaskId: args.taskId } },
    },
  });
  await db
    .update(schema.tasks)
    .set({ googleEventId: res.data.id ?? null })
    .where(eq(schema.tasks.id, args.taskId));
  return { ok: true, eventId: res.data.id, message: "Event created." };
}

export async function updateCalendarEvent(
  taskId: string,
  patch: { startIso?: string; endIso?: string; title?: string },
) {
  const auth = await getAuthorizedClient();
  if (!auth) return { skipped: true };
  const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) });
  if (!task?.googleEventId) return { skipped: true, message: "No linked event." };
  const s = await settings();
  const calendarId = s?.googleWriteCalendarId ?? "primary";
  const cal = google.calendar({ version: "v3", auth });
  const requestBody: Record<string, unknown> = {};
  if (patch.title) requestBody.summary = patch.title;
  if (patch.startIso) requestBody.start = { dateTime: patch.startIso };
  if (patch.endIso) requestBody.end = { dateTime: patch.endIso };
  await cal.events.patch({ calendarId, eventId: task.googleEventId, requestBody });
  return { ok: true, message: "Event updated." };
}

export async function deleteCalendarEvent(taskId: string) {
  const auth = await getAuthorizedClient();
  if (!auth) return { skipped: true };
  const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) });
  if (!task?.googleEventId) return { skipped: true };
  const s = await settings();
  const calendarId = s?.googleWriteCalendarId ?? "primary";
  const cal = google.calendar({ version: "v3", auth });
  await cal.events.delete({ calendarId, eventId: task.googleEventId });
  await db.update(schema.tasks).set({ googleEventId: null }).where(eq(schema.tasks.id, taskId));
  return { ok: true, message: "Event deleted." };
}

export async function unlink() {
  await db.delete(schema.googleTokens).where(eq(schema.googleTokens.id, "singleton"));
  await db.update(schema.settings).set({ googleLinked: false }).where(eq(schema.settings.id, "singleton"));
}
