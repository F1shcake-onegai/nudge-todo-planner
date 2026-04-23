import { convertToModelMessages, type UIMessage } from "ai";
import { runAgent } from "@/lib/llm";
import { currentSession, ipFromRequest } from "@/lib/auth";
import { checkLimit } from "@/lib/rateLimit";

export const maxDuration = 60;

export async function POST(req: Request) {
  // The proxy already enforces auth, but also require it here so we get
  // a reliable session id for the rate-limit bucket.
  const session = await currentSession(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const key = `chat:${session.id ?? ipFromRequest(req)}`;
  const rl = checkLimit(key, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "Chat rate limit exceeded. Try again shortly." }),
      {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfterSec) },
      },
    );
  }

  try {
    const { messages }: { messages: UIMessage[] } = await req.json();
    const modelMessages = await convertToModelMessages(messages);
    const result = await runAgent(modelMessages);
    return result.toUIMessageStreamResponse();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
