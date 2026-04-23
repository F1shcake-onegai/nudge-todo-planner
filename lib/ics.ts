import { db, schema } from "@/lib/db/client";
import { eq, isNotNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { SETTINGS_ID } from "@/lib/db/schema";

function fmtDate(d: Date) {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/** YYYYMMDD for DTSTART;VALUE=DATE (all-day event). */
function fmtDateOnly(d: Date) {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate())
  );
}

function addDayUtc(d: Date, days: number) {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + days);
  return n;
}

function escape(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function fold(line: string) {
  const out: string[] = [];
  while (line.length > 75) {
    out.push(line.slice(0, 75));
    line = " " + line.slice(75);
  }
  out.push(line);
  return out.join("\r\n");
}

/**
 * Emit one all-day VEVENT per task that has a deadline. Tasks without a
 * deadline produce no events. v2.1 dropped scheduled block placement, so
 * this feed is now a deadlines-only view for external calendar clients.
 */
export async function buildIcsFeed(_origin: string) {
  const [tasks, projects] = await Promise.all([
    db.query.tasks.findMany({ where: isNotNull(schema.tasks.deadline) }),
    db.query.projects.findMany(),
  ]);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const now = fmtDate(new Date());

  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//nudge//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push("X-WR-CALNAME:nudge deadlines");
  lines.push("X-WR-TIMEZONE:UTC");
  lines.push("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
  lines.push("X-PUBLISHED-TTL:PT1H");

  for (const t of tasks) {
    if (!t.deadline) continue;
    const project = t.projectId ? projectById.get(t.projectId) : undefined;
    const title = project ? `${project.name}: ${t.title}` : t.title;
    // All-day event on the deadline date. DTEND is exclusive per RFC 5545,
    // so add 1 day for a single-day span.
    const dtStart = fmtDateOnly(t.deadline);
    const dtEnd = fmtDateOnly(addDayUtc(t.deadline, 1));
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${t.id}@nudge`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
    lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
    lines.push(fold(`SUMMARY:${escape(title)} · due`));
    if (t.notes) lines.push(fold(`DESCRIPTION:${escape(t.notes)}`));
    if (t.status === "done") lines.push("STATUS:COMPLETED");
    lines.push("TRANSP:TRANSPARENT");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export async function ensureFeedToken() {
  const existing = await db.query.settings.findFirst();
  if (existing?.feedToken) return existing.feedToken;
  if (!existing) {
    await db.insert(schema.settings).values({ id: SETTINGS_ID });
  }
  const token = randomBytes(24).toString("base64url");
  await db.update(schema.settings).set({ feedToken: token }).where(eq(schema.settings.id, SETTINGS_ID));
  return token;
}

export async function regenerateFeedToken() {
  await db.update(schema.settings).set({ feedToken: null }).where(eq(schema.settings.id, SETTINGS_ID));
  return ensureFeedToken();
}
