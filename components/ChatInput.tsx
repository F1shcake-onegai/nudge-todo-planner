"use client";

import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  status: "submitted" | "streaming" | "ready" | "error";
};

export function ChatInput({ value, onChange, onSubmit, onStop, status }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const busy = status === "submitted" || status === "streaming";
  // Touch devices have no Shift key, so Enter sending would lock out newlines.
  // Fall back to Send-button-only submit there.
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = Math.min(ref.current.scrollHeight, 260) + "px";
  }, [value]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && value.trim()) onSubmit();
      }}
      className={cn(
        "relative flex flex-col gap-2 rounded-[22px] p-2.5 pl-4 transition",
        "bg-[var(--surface)]",
        "shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_12px_28px_-16px_rgba(0,0,0,0.12)]",
      )}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (coarse) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!busy && value.trim()) onSubmit();
          }
        }}
        rows={1}
        placeholder="Brain-dump, edit, or ask…"
        className={cn(
          "w-full resize-none bg-transparent pt-1 pb-0.5 text-[15px] leading-6 outline-none",
          "placeholder:text-[var(--faint)]",
        )}
      />
      <div className="flex items-center justify-between pl-[2px]">
        <span className="text-[11px] text-[var(--faint)]">
          {coarse ? "tap → send" : "⏎ send · ⇧⏎ newline"}
        </span>
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-full p-2 text-[var(--muted)] transition hover:bg-[var(--border)]/60"
            aria-label="Stop"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim()}
            className={cn(
              "rounded-full p-2 transition",
              "bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-95",
              "disabled:bg-[var(--border)] disabled:text-[var(--faint)] disabled:cursor-not-allowed",
            )}
            aria-label="Send"
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </div>
    </form>
  );
}
