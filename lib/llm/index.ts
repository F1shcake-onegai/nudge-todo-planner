import { streamText, stepCountIs, type ModelMessage, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { tools } from "./tools";
import { buildContext, buildSystemPrompt, buildTurnContext } from "./prompt";
import type { Settings } from "@/lib/db/schema";
import { getSecret } from "@/lib/secrets";

type ProviderId = "anthropic" | "openai" | "google";

async function resolveModel(
  settings: Settings | undefined,
  override?: { provider?: ProviderId; model?: string },
): Promise<LanguageModel> {
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
 * Route short edit messages to the cheaper edit model.
 * Heuristic: single-line, < 120 chars, contains an edit verb.
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

  const lastUserMsg = [...userMessages].reverse().find((m) => m.role === "user");
  const lastContent = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";

  const override = shouldRouteToEditModel(lastContent) && ctx.settings?.llmEditModel
    ? { model: ctx.settings.llmEditModel }
    : undefined;

  const model = await resolveModel(ctx.settings ?? undefined, override);

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: systemText,
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    { role: "user", content: buildTurnContext(ctx.settings?.timezone) },
    ...userMessages,
  ];

  return streamText({
    model,
    tools,
    messages,
    stopWhen: stepCountIs(8),
  });
}
