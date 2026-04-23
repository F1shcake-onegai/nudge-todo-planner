"use client";

import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";

const DISMISS_KEY = "nudge.calendar-banner.dismissed";

export function CalendarSubscribeBanner() {
  const [show, setShow] = useState(false);
  const [webcal, setWebcal] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari
      !!window.navigator.standalone;
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!(standalone || mobile)) return;
    fetch("/api/calendar/feed-url")
      .then((r) => r.json())
      .then((d) => {
        setWebcal(d.webcal);
        setShow(true);
      })
      .catch(() => {});
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  if (!show || !webcal) return null;

  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--accent)]/10 px-4 py-2 text-sm">
      <Smartphone className="size-4 text-[var(--accent)] shrink-0" />
      <span className="flex-1">
        See your task blocks next to your other calendars.{" "}
        <a
          href={webcal}
          onClick={dismiss}
          className="font-semibold text-[var(--accent)] underline underline-offset-2 transition-colors hover:text-[var(--accent-2)] hover:no-underline"
        >
          Add to phone calendar
        </a>
        .
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--bg)]"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
