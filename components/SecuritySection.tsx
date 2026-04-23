"use client";

import { useEffect, useState } from "react";
import { Loader2, LogOut, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type SessionRow = {
  id: string;
  label: "browser" | "app" | "caldav";
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
};

export function SecuritySection() {
  const [username, setUsername] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);

  const [oldP, setOldP] = useState("");
  const [newP, setNewP] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busyPw, setBusyPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);

  async function loadMe() {
    const r = await fetch("/api/auth/me").then((r) => r.json()).catch(() => null);
    if (r?.username) setUsername(r.username);
  }
  async function loadSessions() {
    const r = await fetch("/api/auth/sessions").then((r) => r.json()).catch(() => null);
    if (r?.sessions) setSessions(r.sessions);
  }

  useEffect(() => {
    loadMe();
    loadSessions();
  }, []);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (busyPw) return;
    setPwMsg(null);
    if (newP !== confirm) {
      setPwMsg({ tone: "err", text: "New password confirmation does not match." });
      return;
    }
    if (newP.length < 10) {
      setPwMsg({ tone: "err", text: "New password must be at least 10 characters." });
      return;
    }
    setBusyPw(true);
    try {
      const r = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: oldP, newPassword: newP, confirm }),
      });
      if (r.ok) {
        setPwMsg({ tone: "ok", text: "Password updated. Other sessions signed out." });
        setOldP("");
        setNewP("");
        setConfirm("");
        await loadSessions();
      } else {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setPwMsg({ tone: "err", text: j.error ?? "Password change failed." });
      }
    } finally {
      setBusyPw(false);
    }
  }

  async function revokeSession(idPrefix: string) {
    await fetch(`/api/auth/sessions?id=${encodeURIComponent(idPrefix)}`, { method: "DELETE" });
    await loadSessions();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Username</div>
        <div className="mt-1 font-mono text-sm">{username ?? "…"}</div>
        <p className="mt-1 text-xs text-[var(--faint)]">Permanent. Also used for CalDAV sign-in.</p>
      </div>

      <form onSubmit={submitPassword} className="flex flex-col gap-2">
        <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Change password</div>
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Current password"
          value={oldP}
          onChange={(e) => setOldP(e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="New password (10+ chars)"
          value={newP}
          onChange={(e) => setNewP(e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        {pwMsg ? (
          <div
            className={cn(
              "rounded-xl px-3 py-2 text-sm",
              pwMsg.tone === "ok"
                ? "bg-[var(--accent-soft)]/60 text-[var(--text)]"
                : "border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
            )}
          >
            {pwMsg.text}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={busyPw || !oldP || !newP || !confirm}
          className={cn(
            "w-fit rounded-xl px-3 py-2 text-sm transition",
            "bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-95",
            "disabled:bg-[var(--border)] disabled:text-[var(--faint)] disabled:cursor-not-allowed",
          )}
        >
          {busyPw ? <Loader2 className="inline size-4 animate-spin" /> : "Update password"}
        </button>
      </form>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Active sessions</div>
          <button
            type="button"
            onClick={() => setConfirmLogoutAll(true)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:bg-stone-100 dark:hover:bg-stone-800/60"
          >
            <LogOut className="size-3.5" />
            Sign out everywhere
          </button>
        </div>
        {sessions === null ? (
          <Loader2 className="size-4 animate-spin text-[var(--muted)]" />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No sessions.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-[var(--border)]/60 px-1.5 py-0.5 font-mono text-[11px] uppercase">
                      {s.label}
                    </span>
                    {s.current ? (
                      <span className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                        this device
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 truncate text-xs text-[var(--muted)]">
                    {s.userAgent ?? "unknown client"}
                  </div>
                  <div className="text-[11px] text-[var(--faint)]">
                    ip {s.ipAddress ?? "unknown"} · last seen {new Date(s.lastSeenAt).toLocaleString()} · expires{" "}
                    {new Date(s.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                {!s.current ? (
                  <button
                    type="button"
                    onClick={() => revokeSession(s.id)}
                    className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                    aria-label="Revoke"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmLogoutAll}
        options={{
          title: "Sign out all other devices?",
          description:
            "Every session except this one will be revoked immediately. Other devices will have to log in again.",
          confirmLabel: "Sign out others",
          danger: true,
        }}
        onCancel={() => setConfirmLogoutAll(false)}
        onConfirm={async () => {
          await fetch("/api/auth/sessions?scope=all-others", { method: "DELETE" });
          setConfirmLogoutAll(false);
          await loadSessions();
        }}
      />
    </div>
  );
}
