/**
 * Next.js 16 instrumentation hook. Runs once per Node.js server process at
 * startup. Used here to start the internal 5-minute scheduler that drives
 * push notifications — avoids requiring an external cron service.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runSchedulerTick } = await import("./lib/notifications");

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runSchedulerTick();
    } catch (e) {
      console.error("[nudge] scheduler tick failed:", (e as Error).message);
    } finally {
      running = false;
    }
  };

  // Kick off 30s after start (let everything warm up), then every 5 min.
  setTimeout(tick, 30_000);
  setInterval(tick, 5 * 60 * 1000);
  console.log("[nudge] internal notification scheduler started (5 min tick)");
}
