"use client";

import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";
import { Wrench, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { Markdown } from "@/components/Markdown";

const SUGGESTIONS = [
  "Finish photography edits by Friday, ~6 hours, plus 2h writeup",
  "Study 5 chapters for Wednesday's exam, 1h each",
  "Move the photo project to Monday, bump priority",
];

export function ChatHistory({
  messages,
  onSuggest,
}: {
  messages: UIMessage[];
  onSuggest?: (text: string) => void;
}) {
  if (!messages.length) {
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Sparkles className="size-5" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="display-wide text-[2.35rem] leading-tight">
            What&apos;s on your mind?
          </h1>
          <p className="text-[var(--muted)]">
            Brain-dump in plain language. I&apos;ll break it into tasks, place each block into a free
            slot, and nudge you when it&apos;s time.
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-xl">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggest?.(s)}
              className={cn(
                "group rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-sm transition-colors",
                "hover:border-[var(--accent)]/60 hover:bg-[var(--surface-soft)]",
              )}
            >
              <span className="text-[var(--text)]">{s}</span>
              <span className="ml-2 text-[var(--faint)] opacity-0 transition group-hover:opacity-100">↵</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      {messages.map((m, i) => (
        <Message key={m.id} message={m} isLast={i === messages.length - 1} />
      ))}
    </div>
  );
}

function Message({ message, isLast }: { message: UIMessage; isLast: boolean }) {
  const isUser = message.role === "user";
  if (isUser) return <UserMessage message={message} />;
  return <AssistantMessage message={message} isLast={isLast} />;
}

function UserMessage({ message }: { message: UIMessage }) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
          "bg-[var(--accent-soft)] text-[var(--text)]",
          "shadow-[0_1px_0_0_rgba(0,0,0,0.02)]",
        )}
      >
        {message.parts.map((part, i) =>
          part.type === "text" ? (
            <div key={i} className="whitespace-pre-wrap">
              {part.text}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

function AssistantMessage({ message, isLast }: { message: UIMessage; isLast: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
        <Sparkles className="size-3.5" />
      </div>
      <div className="flex-1 min-w-0 text-[15px] text-[var(--text)]">
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div key={i} className="mb-1 last:mb-0">
                <Markdown>{part.text}</Markdown>
              </div>
            );
          }
          if (typeof part.type === "string" && part.type.startsWith("tool-")) {
            return <ToolCallSummary key={i} part={part} />;
          }
          return null;
        })}
        {isLast && hasEmptyText(message) ? <TypingDots /> : null}
      </div>
    </div>
  );
}

function hasEmptyText(m: UIMessage) {
  return !m.parts.some((p) => p.type === "text" && "text" in p && p.text);
}

function TypingDots() {
  return (
    <div className="inline-flex items-center gap-1 text-[var(--muted)]">
      <span className="size-1.5 animate-pulse rounded-full bg-current" />
      <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
    </div>
  );
}

function ToolCallSummary({ part }: { part: any }) {
  const name = (part.type as string).replace(/^tool-/, "");
  const state = part.state;
  const running = state === "input-streaming" || state === "input-available" || state === "executing";
  const errored = state === "output-error";
  const output = part.output;
  const message =
    typeof output === "object" && output !== null ? (output.message as string | undefined) : undefined;

  return (
    <div
      className={cn(
        "my-1 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-2.5 py-1 text-[13px]",
        "text-[var(--muted)]",
      )}
    >
      {errored ? (
        <AlertCircle className="size-3.5 text-red-600" />
      ) : running ? (
        <Wrench className="size-3.5 animate-pulse text-[var(--accent)]" />
      ) : (
        <CheckCircle2 className="size-3.5 text-[var(--accent)]" />
      )}
      <code className="font-mono text-[12px]">{name}</code>
      {message ? <span className="truncate max-w-xs">— {message}</span> : null}
    </div>
  );
}
