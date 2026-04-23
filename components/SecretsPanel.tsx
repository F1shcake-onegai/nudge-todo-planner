"use client";

import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type SecretRow = {
  name: string;
  hasDb: boolean;
  hasEnv: boolean;
  source: "db" | "env" | "none";
  value: string;
};

const GROUPS: { title: string; description?: string; keys: string[] }[] = [
  {
    title: "LLM providers",
    description: "At least one is required. The active provider is picked in the section above.",
    keys: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  },
  {
    title: "Google Calendar OAuth",
    description: "Required to link Google Calendar. Create OAuth credentials in Google Cloud Console.",
    keys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  },
  {
    title: "Web Push (VAPID)",
    description: "Use Generate to create a fresh key pair. Subject is typically 'mailto:you@domain'.",
    keys: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
  },
];

const PLAIN_TEXT_KEYS = new Set([
  "VAPID_PUBLIC_KEY",
  "VAPID_SUBJECT",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "GOOGLE_CLIENT_ID",
]);

export function SecretsPanel() {
  const [rows, setRows] = useState<SecretRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/secrets").then((r) => r.json());
    setRows(r.secrets);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(name: string, value: string | null) {
    setBusy(name);
    try {
      await fetch("/api/secrets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [name]: value }),
      });
      setDrafts((d) => ({ ...d, [name]: "" }));
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function generateVapid() {
    setBusy("VAPID");
    try {
      await fetch("/api/push/vapid", { method: "POST" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!rows) return <Loader2 className="size-4 animate-spin text-[var(--muted)]" />;

  const byName = new Map(rows.map((r) => [r.name, r]));

  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((g) => (
        <div key={g.title} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{g.title}</h3>
            {g.title === "Web Push (VAPID)" ? (
              <button
                type="button"
                onClick={generateVapid}
                disabled={busy === "VAPID"}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs hover:bg-[var(--bg)]"
              >
                {busy === "VAPID" ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                Generate
              </button>
            ) : null}
          </div>
          {g.description ? <p className="text-xs text-[var(--muted)]">{g.description}</p> : null}
          <div className="flex flex-col gap-2">
            {g.keys.map((k) => {
              const row = byName.get(k);
              if (!row) return null;
              const isPlain = PLAIN_TEXT_KEYS.has(k);
              const displayValue = isPlain ? row.value : undefined;
              const draft = drafts[k] ?? "";
              const show = reveal[k] ?? false;
              return (
                <div
                  key={k}
                  className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <div className="flex items-center justify-between">
                    <code className="font-mono text-xs">{k}</code>
                    <SourceBadge source={row.source} />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type={isPlain || show ? "text" : "password"}
                      value={
                        draft !== ""
                          ? draft
                          : displayValue !== undefined
                          ? displayValue
                          : row.hasDb
                          ? "••••••••"
                          : ""
                      }
                      onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
                      placeholder={row.hasEnv ? "(using env value)" : "paste value"}
                      className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm font-mono outline-none focus:border-[var(--accent)]"
                    />
                    {!isPlain ? (
                      <button
                        type="button"
                        onClick={() => setReveal((r) => ({ ...r, [k]: !show }))}
                        className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--bg)]"
                        aria-label={show ? "Hide" : "Show"}
                      >
                        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => save(k, draft)}
                      disabled={busy === k || draft === ""}
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 text-sm transition",
                        "bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90",
                        "disabled:opacity-40 disabled:cursor-not-allowed",
                      )}
                    >
                      {busy === k ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    </button>
                    {row.hasDb ? (
                      <button
                        type="button"
                        onClick={() => save(k, null)}
                        className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--bg)]"
                        aria-label="Clear"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-[var(--muted)]">
        DB values take precedence over <code className="font-mono">.env.local</code>. Clearing a DB value falls back to
        the env var if one is set.
      </p>
    </div>
  );
}

function SourceBadge({ source }: { source: "db" | "env" | "none" }) {
  const label = source === "db" ? "saved" : source === "env" ? "from env" : "not set";
  const tone =
    source === "db"
      ? "bg-[var(--accent)]/15 text-[var(--accent)]"
      : source === "env"
      ? "bg-[var(--border)] text-[var(--muted)]"
      : "bg-transparent text-[var(--muted)]";
  return <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide", tone)}>{label}</span>;
}
