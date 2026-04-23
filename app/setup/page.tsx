"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sparkles, Loader2, AlertTriangle } from "lucide-react";

/**
 * Minimal bootstrap wizard. Phase 3 expands this into a multi-step wizard
 * (timezone, work hours, intensity, LLM key, VAPID email). For Phase 1 we
 * only need enough to create an admin so the login gate has a target.
 */
export default function SetupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameOk = /^[a-z0-9][a-z0-9._-]{1,30}$/i.test(username.trim());
  const passwordOk = password.length >= 10 && password === confirm;
  const canSubmit = acknowledged && usernameOk && passwordOk;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/setup/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
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

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <Sparkles className="size-5 text-[var(--accent)]" />
          <span className="display-wide text-xl">nudge</span>
        </div>

        <h1 className="display-wide text-[1.9rem] leading-tight">Welcome.</h1>
        <p className="mt-2 text-[var(--muted)] text-sm">
          Set your admin credentials to finish the first-time setup. You can
          configure work hours, notification intensity, and LLM providers
          afterwards from the settings page.
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)] text-xs uppercase tracking-wide">
              Username
            </span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--accent)]"
              placeholder="e.g. me"
            />
          </label>

          <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="mr-1 inline size-3.5 -translate-y-[1px]" />
            This username is permanent. It&apos;s used for CalDAV login too and
            can&apos;t be changed later.
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)] text-xs uppercase tracking-wide">
              Password (10+ characters)
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--accent)]"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)] text-xs uppercase tracking-wide">
              Confirm password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--accent)]"
            />
            {confirm && password !== confirm ? (
              <span className="text-xs text-red-600">Passwords don&apos;t match.</span>
            ) : null}
          </label>

          <label className="mt-1 flex items-start gap-2 text-sm text-[var(--muted)]">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>I understand the username can&apos;t be changed later.</span>
          </label>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit || busy}
            className={cn(
              "mt-2 rounded-xl px-3 py-2.5 text-sm font-medium transition",
              "bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-95",
              "disabled:bg-[var(--border)] disabled:text-[var(--faint)] disabled:cursor-not-allowed",
            )}
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Finishing…
              </span>
            ) : (
              "Finish setup"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
