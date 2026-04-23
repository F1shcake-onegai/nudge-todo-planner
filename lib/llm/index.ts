import { streamText, stepCountIs, type ModelMessage, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { tools } from "./tools";
import { buildContext, buildSystemPrompt } from "./prompt";
import { db, schema } from "@/lib/db/client";
import { getSecret } from "@/lib/secrets";

type ProviderId = "anthropic" | "openai" | "google";

async function resolveModel(override?: { provider?: ProviderId; model?: string }): Promise<LanguageModel> {
  const settings = await db.query.settings.findFirst();
  const provider = (override?.provider ?? settings?.llmProvider ?? process.env.NUDGE_DEFAULT_PROVIDER ?? "anthropic") as ProviderId;
  const modelId = override?.model ?? settings?.llmModel ?? process.env.NUDGE_DEFAULT_MODEL ?? "claude-sonnet-4-6";

  switch (provider) {
    case "anthropic": {
      const key = await getSecret("ANTHROPIC_API_KEY");
      if (!key) throw new Error("ANTHROPIC_API_KEY is not set (add it in Settings → API keys)");
      return createAnthropic({ apiKey: key })(modelId);
    }
    case "openai": {
      const key = await getSecret("OPENAI_API_KEY");
      if (!key) throw new Error("OPENAI_API_KEY is not set (add it in Settings → API keys)");
      return createOpenAI({ apiKey: key })(modelId);
    }
    case "google": {
      const key = await getSecret("GOOGLE_GENERATIVE_AI_API_KEY");
      if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set (add it in Settings → API keys)");
      return createGoogleGenerativeAI({ apiKey: key })(modelId);
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Pick a cheaper model for short edit messages.
 * Heuristic: messages under 120 chars that don't look like a brain-dump.
 */
function shouldRouteToEditModel(lastUserContent: string) {
  return (
    lastUserContent.length < 120 &&
    !/\n/.test(lastUserContent) &&
    /(move|delete|mark|rename|change|reschedule|done|finish|cancel|update)/i.test(lastUserContent)
  );
}

export async function runAgent(userMessages: ModelMessage[]) {
  const ctx = await buildContext();
  const systemText = buildSystemPrompt(ctx);

  const settings = await db.query.settings.findFirst();
  const lastUserMsg = [...userMessages].reverse().find((m) => m.role === "user");
  const lastContent = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";

  const override = shouldRouteToEditModel(lastContent) && settings?.llmEditModel
    ? { model: settings.llmEditModel }
    : undefined;

  const model = await resolveModel(override);

  // Build messages with system + prompt caching (Anthropic only reads providerOptions).
  const messages: ModelMessage[] = [
    {
      role: "system",
      content: systemText,
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    ...userMessages,
  ];

  return streamText({
    model,
    tools,
    messages,
    stopWhen: stepCountIs(8),
  });
}
