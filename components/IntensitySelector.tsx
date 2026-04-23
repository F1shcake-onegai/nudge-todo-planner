"use client";

import { useEffect, useState } from "react";
import { Bell, BellDot, BellOff, BellRing, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Intensity = "off" | "light" | "balanced" | "intense";

const OPTIONS: { value: Intensity; label: string; description: string; icon: React.ElementType }[] = [
  { value: "off", label: "Off", description: "No nudges.", icon: BellOff },
  { value: "light", label: "Light", description: "2 nudges per workday.", icon: Bell },
  { value: "balanced", label: "Balanced", description: "4 nudges per workday, across projects.", icon: BellRing },
  { value: "intense", label: "Intense", description: "8 nudges per workday.", icon: BellDot },
];

export function IntensitySelector() {
  const [value, setValue] = useState<Intensity | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => setValue((s.notificationIntensity ?? "light") as Intensity))
      .catch(() => setValue("light"));
  }, []);

  async function select(v: Intensity) {
    setValue(v);
    setBusy(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIntensity: v }),
      });
    } finally {
      setBusy(false);
    }
  }

  if (value === null) return <Loader2 className="size-4 animate-spin text-[var(--muted)]" />;

  return (
    <div className="flex flex-col gap-2">
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => select(o.value)}
            disabled={busy}
            className={cn(
              "flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
              active
                ? "border-[var(--accent)] bg-[var(--accent-soft)]/40"
                : "border-[var(--border)] bg-[var(--surface)] hover:bg-stone-100 dark:hover:bg-stone-800/60",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 size-4",
                active ? "text-[var(--accent)]" : "text-[var(--muted)]",
              )}
            />
            <div>
              <div className={cn("text-sm font-medium", active && "text-[var(--accent)]")}>
                {o.label}
              </div>
              <div className="text-xs text-[var(--muted)]">{o.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
