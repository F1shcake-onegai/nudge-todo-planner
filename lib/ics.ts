import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { isNotNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";

function fmtDate(d: Date) {
  // UTC basic format: YYYYMMDDTHHMMSSZ
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

function escape(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function fold(line: string) {
  // RFC 5545 line folding at 75 octets
  const out: string[] = [];
  while (line.length > 75) {
    out.push(line.slice(0, 75));
    line = " " + line.slice(75);
  }
  out.push(line);
  return out.join("\r\n");
}

export async function buildIcsFeed(origin: string) {
  const tasks = await db.query.tasks.findMany({
    where: isNotNull(schema.tasks.scheduledStart),
  });
  const projects = await db.query.projects.findMany();
  const now = fmtDate(new Date());

  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//nudge//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push("X-WR-CALNAME:nudge");
  lines.push("X-WR-TIMEZONE:UTC");
  lines.push("REFRESH-INTERVAL;VALUE=DURATION:PT15M");
  lines.push("X-PUBLISHED-TTL:PT15M");

  for (const t of tasks) {
    if (!t.scheduledStart || !t.scheduledEnd) continue;
    const project = projects.find((p) => p.id === t.projectId);
    const title = project ? `${project.name}: ${t.title}` : t.title;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${t.id}@nudge`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${fmtDate(t.scheduledStart)}`);
    lines.push(`DTEND:${fmtDate(t.scheduledEnd)}`);
    lines.push(fold(`SUMMARY:${escape(title)}`));
    if (t.notes) lines.push(fold(`DESCRIPTION:${escape(t.notes)}`));
    if (t.status === "done") lines.push("STATUS:COMPLETED");
    if (t.status === "doing") lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export async function ensureFeedToken() {
  const existing = await db.query.settings.findFirst();
  if (existing?.feedToken) return existing.feedToken;
  if (!existing) {
    await db.insert(schema.settings).values({ id: "singleton" });
  }
  const token = randomBytes(24).toString("base64url");
  await db.update(schema.settings).set({ feedToken: token }).where(eq(schema.settings.id, "singleton"));
  return token;
}

export async function regenerateFeedToken() {
  await db.update(schema.settings).set({ feedToken: null }).where(eq(schema.settings.id, "singleton"));
  return ensureFeedToken();
}
