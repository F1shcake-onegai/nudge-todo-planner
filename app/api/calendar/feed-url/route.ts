import { ensureFeedToken, regenerateFeedToken } from "@/lib/ics";

function buildUrls(req: Request, token: string) {
  const origin = new URL(req.url).origin;
  const httpsUrl = `${origin}/api/calendar/feed/${token}`;
  const webcal = httpsUrl.replace(/^https?:\/\//, "webcal://");
  return { httpsUrl, webcal };
}

export async function GET(req: Request) {
  const token = await ensureFeedToken();
  return Response.json({ token, ...buildUrls(req, token) });
}

export async function POST(req: Request) {
  const token = await regenerateFeedToken();
  return Response.json({ token, ...buildUrls(req, token), rotated: true });
}
