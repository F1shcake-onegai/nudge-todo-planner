import { clearSessionCookie, getTokenFromRequest, revokeSession } from "@/lib/auth";

export async function POST(req: Request) {
  const token = getTokenFromRequest(req);
  if (token) await revokeSession(token);
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", clearSessionCookie());
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
