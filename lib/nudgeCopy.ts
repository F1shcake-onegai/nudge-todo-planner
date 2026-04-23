/**
 * Title and body template pools for smart nudges.
 * {{taskTitle}}, {{projectName}}, {{deadlineRelative}} are substituted at render time.
 */

export const TITLE_POOL = [
  "Time to work!",
  "Quick nudge.",
  "Hey, about that task…",
  "{{projectName}} checkpoint",
  "One step closer.",
  "Tap back in.",
  "Small progress time.",
  "You got this — block time.",
  "Don't forget {{projectName}}.",
  "Deep breath, back to it.",
  "Momentum check.",
  "Chip away at it.",
] as const;

export const BODY_POOL = [
  "Your **{{taskTitle}}** is due {{deadlineRelative}}. Don't forget to work on it!",
  "Ready to chip away at **{{taskTitle}}**? {{deadlineRelative}} until it's due.",
  "**{{taskTitle}}** — {{deadlineRelative}}. Progress counts.",
  "Small win time: **{{taskTitle}}** ({{deadlineRelative}}).",
  "You've got this. **{{taskTitle}}**, due {{deadlineRelative}}.",
  "Check back in on **{{taskTitle}}**. Deadline: {{deadlineRelative}}.",
  "A few minutes on **{{taskTitle}}** now saves panic later. ({{deadlineRelative}})",
  "**{{taskTitle}}**. Keep the momentum going — {{deadlineRelative}}.",
  "Even 15 minutes on **{{taskTitle}}** counts. Due {{deadlineRelative}}.",
  "**{{taskTitle}}** is waiting. {{deadlineRelative}}.",
] as const;

const NO_DEADLINE_BODY_POOL = [
  "Nudge on **{{taskTitle}}** — no deadline, but momentum matters.",
  "**{{taskTitle}}** is on your plate. A few minutes now?",
  "Circle back to **{{taskTitle}}** while it's fresh.",
  "Quick check-in on **{{taskTitle}}**.",
] as const;

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function deadlineRelative(deadline: Date | null, now: Date = new Date()): string {
  if (!deadline) return "no deadline";
  const ms = deadline.getTime() - now.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (ms < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return `in ${days} days`;
  return deadline.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function renderCopy(input: {
  taskTitle: string;
  projectName: string | null;
  deadline: Date | null;
  now?: Date;
}): { title: string; body: string } {
  const relative = deadlineRelative(input.deadline, input.now);
  const pool = input.deadline ? BODY_POOL : NO_DEADLINE_BODY_POOL;
  const title = pickRandom(TITLE_POOL).replaceAll("{{projectName}}", input.projectName ?? "your work");
  const body = pickRandom(pool)
    .replaceAll("{{taskTitle}}", input.taskTitle)
    .replaceAll("{{projectName}}", input.projectName ?? "")
    .replaceAll("{{deadlineRelative}}", relative);
  return { title, body };
}
