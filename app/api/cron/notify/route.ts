import { runSchedulerTick } from "@/lib/notifications";
import { envOrFile } from "@/lib/env";

function authorized(req: Request) {
  const secret = envOrFile("CRON_SECRET");
  if (!secret) return true; // unset = no auth in dev (proxy keeps it out of public API anyway)
  const h = req.headers.get("authorization") ?? "";
  return h === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  const result = await runSchedulerTick();
  return Response.json(result);
}

// Vercel Cron hits GET; allow POST too for local testing.
export const POST = GET;
