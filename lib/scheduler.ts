/**
 * v2.1 slimmed this file down. v2's block-placement scheduler
 * (scheduleAllPending + friends) is gone along with the duration-based
 * task model. Only the HH:MM parser survives — nudgePlanner + the cron
 * notifier import it to read settings.workHoursStart/End.
 */

export function parseHHMM(s: string | undefined | null, fallback: number) {
  if (!s) return fallback;
  const [h, m] = s.split(":").map((n) => Number(n));
  if (Number.isFinite(h)) return h + (Number.isFinite(m) ? m / 60 : 0);
  return fallback;
}
