"use client";

import { useEffect, useState } from "react";
import { Copy, RefreshCw, Smartphone, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type FeedInfo = { token: string; httpsUrl: string; webcal: string };

export function PhoneCalendarSubscribe() {
  const [info, setInfo] = useState<FeedInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  async function load() {
    const r = await fetch("/api/calendar/feed-url").then((r) => r.json());
    setInfo(r);
  }
  useEffect(() => {
    load();
  }, []);

  async function doRotate() {
    setRotating(true);
    try {
      const r = await fetch("/api/calendar/feed-url", { method: "POST" }).then((r) => r.json());
      setInfo(r);
    } finally {
      setRotating(false);
    }
  }

  async function copy() {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  if (!info) return <Loader2 className="size-4 animate-spin text-[var(--muted)]" />;

  return (
    <div className="flex flex-col gap-3">
      <a
        href={info.webcal}
        className={cn(
          "inline-flex w-fit items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
          "bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90",
        )}
      >
        <Smartphone className="size-4" />
        Add to phone calendar
      </a>

      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-mono">
          {info.httpsUrl}
        </code>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--muted)] hover:bg-[var(--bg)]"
          aria-label="Copy"
        >
          {copied ? <Check className="size-4 text-[var(--accent)]" /> : <Copy className="size-4" />}
        </button>
        <button
          type="button"
          onClick={() => setConfirmRotate(true)}
          disabled={rotating}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--muted)] hover:bg-[var(--bg)]"
          aria-label="Rotate token"
        >
          {rotating ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </button>
      </div>

      <ConfirmDialog
        open={confirmRotate}
        options={{
          title: "Regenerate feed URL?",
          description:
            "The current URL will stop working. Any devices subscribed to it will stop receiving updates until you share the new URL with them.",
          confirmLabel: "Regenerate",
          danger: true,
        }}
        onCancel={() => setConfirmRotate(false)}
        onConfirm={async () => {
          setConfirmRotate(false);
          await doRotate();
        }}
      />

      <details className="text-sm text-[var(--muted)]">
        <summary className="cursor-pointer">How does this work?</summary>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>
            <b>iPhone / iPad</b>: tap the orange button above — iOS will prompt &quot;Subscribe&quot; → picks an account → done.
          </li>
          <li>
            <b>Android</b> (Google Calendar app doesn&apos;t handle <code className="font-mono text-xs">webcal://</code> directly): open{" "}
            <a
              className="underline"
              href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl"
              target="_blank"
              rel="noreferrer"
            >
              calendar.google.com
            </a>{" "}
            → Other calendars → From URL → paste the link above.
          </li>
          <li>
            Calendar clients refresh every 15 min – few hours (set by the OS, not by us). Push notifications from nudge
            still fire instantly and independently.
          </li>
          <li>
            The URL contains a secret token. Don&apos;t share it. Use <b>Rotate</b> to invalidate all subscriptions.
          </li>
        </ul>
      </details>
    </div>
  );
}
