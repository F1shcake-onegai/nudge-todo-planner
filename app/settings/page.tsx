"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NotificationsToggle } from "@/components/NotificationsToggle";
import { SecretsPanel } from "@/components/SecretsPanel";
import { PhoneCalendarSubscribe } from "@/components/PhoneCalendarSubscribe";
import { SecuritySection } from "@/components/SecuritySection";
import { cn } from "@/lib/utils";

type Settings = {
  workHoursStart: string;
  workHoursEnd: string;
  timezone: string;
  llmProvider: string;
  llmModel: string;
  llmEditModel: string | null;
};

const PROVIDER_MODELS: Record<string, string[]> = {
  anthropic: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  openai: ["gpt-4o", "gpt-4o-mini"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash"],
};

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setS);
  }, []);

  async function patch(p: Partial<Settings>) {
    if (!s) return;
    setSaving(true);
    try {
      const r = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (r.ok) setS(await r.json());
    } finally {
      setSaving(false);
    }
  }

  if (!s) return null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="display mt-4 text-3xl">Settings</h1>

      <Section title="Security">
        <SecuritySection />
      </Section>

      <Section title="Notifications">
        <NotificationsToggle />
        <p className="mt-2 text-sm text-[var(--muted)]">
          Install nudge as a PWA on your phone to receive push notifications when you&apos;re away from your laptop.
        </p>
      </Section>

      <Section title="Phone calendar (iCal feed)">
        <PhoneCalendarSubscribe />
      </Section>

      <Section title="Work hours">
        <div className="flex items-center gap-3">
          <TimeInput value={s.workHoursStart} onChange={(v) => patch({ workHoursStart: v })} />
          <span className="text-[var(--muted)]">to</span>
          <TimeInput value={s.workHoursEnd} onChange={(v) => patch({ workHoursEnd: v })} />
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Nudge only schedules tasks and fires notifications inside this window.
        </p>
      </Section>

      <Section title="LLM provider & model">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Provider"
            value={s.llmProvider}
            onChange={(v) => patch({ llmProvider: v, llmModel: PROVIDER_MODELS[v]?.[0] ?? s.llmModel })}
            options={Object.keys(PROVIDER_MODELS)}
          />
          <Select
            label="Model (brain-dumps)"
            value={s.llmModel}
            onChange={(v) => patch({ llmModel: v })}
            options={PROVIDER_MODELS[s.llmProvider] ?? []}
          />
          <Select
            label="Edit model (short changes)"
            value={s.llmEditModel ?? ""}
            onChange={(v) => patch({ llmEditModel: v })}
            options={PROVIDER_MODELS[s.llmProvider] ?? []}
          />
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Short edits like &ldquo;move X to Monday&rdquo; are routed to the cheaper edit model automatically.
        </p>
      </Section>

      <Section title="API keys">
        <SecretsPanel />
      </Section>

      {saving ? <p className="mt-4 text-xs text-[var(--muted)]">Saving…</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 border-t border-[var(--border)] pt-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</h2>
      {children}
    </section>
  );
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
    />
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[var(--muted)] text-xs uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
