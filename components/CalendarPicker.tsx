"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Cal = {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor?: string;
  accessRole?: string;
};

type Props = {
  readIds: string[];
  writeId: string | null;
  onReadChange: (ids: string[]) => void;
  onWriteChange: (id: string) => void;
};

export function CalendarPicker({ readIds, writeId, onReadChange, onWriteChange }: Props) {
  const [cals, setCals] = useState<Cal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/google/calendars")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        setCals(d.calendars ?? []);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-red-600">Couldn&apos;t load calendars: {error}</p>;
  if (!cals) return <Loader2 className="size-4 animate-spin text-[var(--muted)]" />;
  if (!cals.length)
    return <p className="text-sm text-[var(--muted)]">No writable calendars found on this account.</p>;

  function toggleRead(id: string) {
    const s = new Set(readIds);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    onReadChange([...s]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">
          Read busy slots from
        </div>
        <ul className="flex flex-col gap-1">
          {cals.map((c) => {
            const checked = readIds.includes(c.id);
            return (
              <li key={c.id}>
                <label className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--bg)]")}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRead(c.id)}
                    className="accent-[var(--accent)]"
                  />
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-full"
                    style={{ background: c.backgroundColor ?? "var(--accent)" }}
                  />
                  <span className="text-sm">{c.summary}</span>
                  {c.primary ? <span className="text-[10px] uppercase text-[var(--muted)]">primary</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <div className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">Write task blocks to</div>
        <select
          value={writeId ?? ""}
          onChange={(e) => onWriteChange(e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        >
          <option value="">(select)</option>
          {cals.map((c) => (
            <option key={c.id} value={c.id}>
              {c.summary}
              {c.primary ? " — primary" : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
