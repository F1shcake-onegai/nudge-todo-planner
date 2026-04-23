"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  BellRing,
  Bell,
  BellDot,
  BellOff,
} from "lucide-react";

type Step = 0 | 1 | 2 | 3 | 4 | 5;
const STEP_TITLES = ["Welcome", "Account", "Schedule", "Nudge intensity", "AI provider", "Notifications"] as const;

type Intensity = "off" | "light" | "balanced" | "intense";
type Provider = "anthropic" | "openai" | "google";

const PROVIDER_MODELS: Record<Provider, string[]> = {
  anthropic: ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5-20251001"],
  openai: ["gpt-4o", "gpt-4o-mini"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash"],
};

const INTENSITY_OPTIONS: { value: Intensity; label: string; description: string; icon: React.ElementType }[] = [
  { value: "off", label: "Off", description: "No notifications. You manage the schedule yourself.", icon: BellOff },
  { value: "light", label: "Light", description: "2 nudges per workday. Quiet.", icon: Bell },
  { value: "balanced", label: "Balanced", description: "4 nudges per workday, spread across projects.", icon: BellRing },
  { value: "intense", label: "Intense", description: "8 nudges per workday. Frequent check-ins.", icon: BellDot },
];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect timezone on mount.
  const [timezone, setTimezone] = useState("UTC");
  useEffect(() => {
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    } catch {}
  }, []);

  const [username, setUsername] = useState("");
  const [ackPermanent, setAckPermanent] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");

  const [intensity, setIntensity] = useState<Intensity>("light");

  const [provider, setProvider] = useState<Provider>("anthropic");
  const [model, setModel] = useState(PROVIDER_MODELS.anthropic[0]);
  const [apiKey, setApiKey] = useState("");

  const [vapidEmail, setVapidEmail] = useState("");

  const usernameOk = /^[a-z0-9][a-z0-9._-]{1,30}$/i.test(username.trim());
  const passwordOk = password.length >= 10 && password === confirm;
  const canFinish = !!apiKey.trim();

  function canAdvance(from: Step): boolean {
    switch (from) {
      case 0:
        return true;
      case 1:
        return usernameOk && passwordOk && ackPermanent;
      case 2:
        return !!workStart && !!workEnd && workStart < workEnd;
      case 3:
        return true;
      case 4:
        return canFinish;
      case 5:
        return true;
    }
  }

  async function finish() {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          timezone,
          workHoursStart: workStart,
          workHoursEnd: workEnd,
          notificationIntensity: intensity,
          llmProvider: provider,
          llmModel: model,
          llmApiKey: apiKey.trim(),
          vapidEmail: vapidEmail.trim(),
        }),
      });
      if (r.ok) {
        router.replace("/");
        router.refresh();
      } else {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Setup failed (${r.status}).`);
      }
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!canAdvance(step)) return;
    if (step === 5) {
      finish();
      return;
    }
    setStep(((step as number) + 1) as Step);
    setError(null);
  }
  function back() {
    if (step === 0) return;
    setStep(((step as number) - 1) as Step);
    setError(null);
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <Sparkles className="size-5 text-[var(--accent)]" />
          <span className="display-wide text-xl">nudge</span>
        </div>

        <div className="mb-6 flex items-center gap-1">
          {STEP_TITLES.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i < step
                  ? "bg-[var(--accent)]"
                  : i === step
                  ? "bg-[var(--accent)]/60"
                  : "bg-[var(--border)]",
              )}
            />
          ))}
        </div>
        <div className="mb-4 text-xs uppercase tracking-wide text-[var(--muted)]">
          Step {step + 1} of {STEP_TITLES.length} · {STEP_TITLES[step]}
        </div>

        <div className="flex min-h-[24rem] flex-col">
          {step === 0 && <Welcome />}
          {step === 1 && (
            <Account
              username={username}
              onUsername={setUsername}
              password={password}
              onPassword={setPassword}
              confirm={confirm}
              onConfirm={setConfirm}
              ackPermanent={ackPermanent}
              onAckPermanent={setAckPermanent}
            />
          )}
          {step === 2 && (
            <Schedule
              timezone={timezone}
              onTimezone={setTimezone}
              workStart={workStart}
              onWorkStart={setWorkStart}
              workEnd={workEnd}
              onWorkEnd={setWorkEnd}
            />
          )}
          {step === 3 && <IntensityStep value={intensity} onChange={setIntensity} />}
          {step === 4 && (
            <AiStep
              provider={provider}
              onProvider={(p) => {
                setProvider(p);
                setModel(PROVIDER_MODELS[p][0]);
              }}
              model={model}
              onModel={setModel}
              apiKey={apiKey}
              onApiKey={setApiKey}
            />
          )}
          {step === 5 && <VapidStep email={vapidEmail} onEmail={setVapidEmail} />}
        </div>

        {error ? (
          <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={back}
            disabled={step === 0 || busy}
            className={cn(
              "flex items-center gap-1 rounded-xl px-3 py-2 text-sm transition",
              "text-[var(--muted)] hover:bg-stone-100 dark:hover:bg-stone-800/60",
              "disabled:opacity-0 disabled:pointer-events-none",
            )}
          >
            <ArrowLeft className="size-4" />
            Back
          </button>
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance(step) || busy}
            className={cn(
              "flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium transition",
              "bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-95",
              "disabled:bg-[var(--border)] disabled:text-[var(--faint)] disabled:cursor-not-allowed",
            )}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : step === 5 ? (
              <>Finish setup</>
            ) : (
              <>
                Next <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────

function Welcome() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="display-wide text-[2rem] leading-tight">Welcome to nudge.</h1>
      <p className="text-[var(--muted)] text-sm leading-relaxed">
        A few quick questions to get you running. You&apos;ll set up:
      </p>
      <ul className="text-sm text-[var(--muted)] leading-relaxed list-disc pl-5 space-y-1">
        <li>An admin username and password</li>
        <li>Your work hours and timezone</li>
        <li>How often nudge should remind you</li>
        <li>An LLM API key (Anthropic / OpenAI / Google)</li>
      </ul>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Takes about a minute. You can change everything later from Settings except your username.
      </p>
    </div>
  );
}

function Account({
  username,
  onUsername,
  password,
  onPassword,
  confirm,
  onConfirm,
  ackPermanent,
  onAckPermanent,
}: {
  username: string;
  onUsername: (v: string) => void;
  password: string;
  onPassword: (v: string) => void;
  confirm: string;
  onConfirm: (v: string) => void;
  ackPermanent: boolean;
  onAckPermanent: (b: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)] text-xs uppercase tracking-wide">Username</span>
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => onUsername(e.target.value)}
          autoFocus
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--accent)]"
          placeholder="e.g. me"
        />
      </label>
      <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        <AlertTriangle className="mr-1 inline size-3.5 -translate-y-[1px]" />
        This username is permanent. It&apos;s used for CalDAV sign-in too and can&apos;t be changed later.
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)] text-xs uppercase tracking-wide">Password (10+ characters)</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--accent)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)] text-xs uppercase tracking-wide">Confirm password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--accent)]"
        />
        {confirm && password !== confirm ? (
          <span className="text-xs text-red-600">Passwords don&apos;t match.</span>
        ) : null}
      </label>

      <label className="mt-1 flex items-start gap-2 text-sm text-[var(--muted)]">
        <input
          type="checkbox"
          checked={ackPermanent}
          onChange={(e) => onAckPermanent(e.target.checked)}
          className="mt-0.5 accent-[var(--accent)]"
        />
        <span>I understand the username can&apos;t be changed later.</span>
      </label>
    </div>
  );
}

function Schedule({
  timezone,
  onTimezone,
  workStart,
  onWorkStart,
  workEnd,
  onWorkEnd,
}: {
  timezone: string;
  onTimezone: (v: string) => void;
  workStart: string;
  onWorkStart: (v: string) => void;
  workEnd: string;
  onWorkEnd: (v: string) => void;
}) {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)] text-xs uppercase tracking-wide">Timezone</span>
        <input
          list="tzlist"
          value={timezone}
          onChange={(e) => onTimezone(e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--accent)] font-mono text-sm"
        />
        <datalist id="tzlist">
          {zones.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)] text-xs uppercase tracking-wide">Work starts</span>
          <input
            type="time"
            value={workStart}
            onChange={(e) => onWorkStart(e.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)] text-xs uppercase tracking-wide">Work ends</span>
          <input
            type="time"
            value={workEnd}
            onChange={(e) => onWorkEnd(e.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--accent)]"
          />
        </label>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Nudge only schedules blocks and fires notifications inside this window.
      </p>
    </div>
  );
}

function IntensityStep({
  value,
  onChange,
}: {
  value: Intensity;
  onChange: (v: Intensity) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="mb-1 text-sm text-[var(--muted)]">
        How often should nudge ping you during work hours?
      </p>
      {INTENSITY_OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
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

function AiStep({
  provider,
  onProvider,
  model,
  onModel,
  apiKey,
  onApiKey,
}: {
  provider: Provider;
  onProvider: (p: Provider) => void;
  model: string;
  onModel: (m: string) => void;
  apiKey: string;
  onApiKey: (k: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)] text-xs uppercase tracking-wide">Provider</span>
          <select
            value={provider}
            onChange={(e) => onProvider(e.target.value as Provider)}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--accent)]"
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="google">Google (Gemini)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)] text-xs uppercase tracking-wide">Model</span>
          <select
            value={model}
            onChange={(e) => onModel(e.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--accent)] font-mono text-xs"
          >
            {PROVIDER_MODELS[provider].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)] text-xs uppercase tracking-wide">API key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onApiKey(e.target.value)}
          autoComplete="off"
          placeholder={provider === "anthropic" ? "sk-ant-…" : provider === "openai" ? "sk-…" : "AIza…"}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--accent)] font-mono text-xs"
        />
      </label>
      <p className="text-xs text-[var(--muted)]">
        Stored encrypted (AES-256-GCM) on disk. You can change or rotate it in Settings anytime.
      </p>
    </div>
  );
}

function VapidStep({ email, onEmail }: { email: string; onEmail: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--muted)] leading-relaxed">
        Push services (Google / Mozilla / Apple) ask for a contact email so they can reach you if
        your server&apos;s push traffic ever misbehaves. No one emails this proactively — it&apos;s
        just an abuse-contact fallback.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)] text-xs uppercase tracking-wide">
          Contact email <span className="normal-case text-[var(--faint)]">(optional)</span>
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder="you@example.com"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--accent)]"
        />
      </label>
      <p className="text-xs text-[var(--muted)]">
        Leave blank to use a placeholder. Nudge will generate VAPID keys silently either way.
      </p>
    </div>
  );
}
