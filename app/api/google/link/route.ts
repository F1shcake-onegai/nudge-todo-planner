import { buildAuthUrl } from "@/lib/google";

export async function GET() {
  try {
    const url = await buildAuthUrl();
    return Response.redirect(url, 302);
  } catch (e: any) {
    return new Response(
      `Google Calendar OAuth is not configured.\n\nSet GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.\n\nError: ${e.message}`,
      { status: 400, headers: { "Content-Type": "text/plain" } },
    );
  }
}
