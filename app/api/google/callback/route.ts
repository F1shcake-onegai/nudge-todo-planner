import { exchangeCodeForTokens } from "@/lib/google";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error) return new Response(`OAuth error: ${error}`, { status: 400 });
  if (!code) return new Response("Missing code", { status: 400 });
  try {
    await exchangeCodeForTokens(code);
    return Response.redirect(new URL("/settings", url.origin).toString(), 302);
  } catch (e: any) {
    return new Response(`Token exchange failed: ${e.message}`, { status: 500 });
  }
}
