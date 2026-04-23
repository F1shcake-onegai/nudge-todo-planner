"use client";

import type { Project } from "@/lib/db/schema";
import { Plus, Loader2, ChevronDown, Check, Inbox } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function AddTaskBar({
  projects,
  onAdded,
}: {
  projects: Project[];
  onAdded: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, projectId: projectId || null }),
      });
      setTitle("");
      await onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn(
        "flex items-center gap-1 rounded-xl bg-[var(--surface)] p-1.5 pl-3",
        "shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_6px_16px_-10px_rgba(0,0,0,0.10)]",
      )}
    >
      <Plus className="size-4 shrink-0 text-[var(--muted)]" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task…"
        disabled={busy}
        className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-[var(--faint)]"
      />
      <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
      <button
        type="submit"
        disabled={!title.trim() || busy}
        className={cn(
          "rounded-lg px-2.5 py-1 text-sm transition",
          "bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-95",
          "disabled:bg-[var(--border)] disabled:text-[var(--faint)] disabled:cursor-not-allowed",
        )}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : "Add"}
      </button>
    </form>
  );
}

function ProjectPicker({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      window.addEventListener("mousedown", onDoc);
      window.addEventListener("keydown", onKey);
      return () => {
        window.removeEventListener("mousedown", onDoc);
        window.removeEventListener("keydown", onKey);
      };
    }
  }, [open]);

  const selected = value ? projects.find((p) => p.id === value) : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition",
          "text-[var(--muted)] hover:bg-[var(--bg)]",
          open && "bg-[var(--bg)]",
        )}
      >
        {selected ? (
          <span className="dot" style={{ color: selected.color }} aria-hidden />
        ) : (
          <Inbox className="size-3 text-[var(--faint)]" />
        )}
        <span className="max-w-[8rem] truncate">{selected?.name ?? "New Task"}</span>
        <ChevronDown className={cn("size-3 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          role="listbox"
          className={cn(
            "absolute bottom-full right-0 mb-1 w-56 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1",
            "shadow-[0_8px_28px_-10px_rgba(0,0,0,0.25)]",
          )}
        >
          <PickerOption
            selected={!value}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            icon={<Inbox className="size-3.5 text-[var(--faint)]" />}
            label="New Task"
          />
          {projects.length ? (
            <div className="my-1 h-px bg-[var(--border)]" />
          ) : null}
          {projects.map((p) => (
            <PickerOption
              key={p.id}
              selected={value === p.id}
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
              icon={<span className="dot" style={{ color: p.color }} aria-hidden />}
              label={p.name}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PickerOption({
  selected,
  onClick,
  icon,
  label,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="option"
      aria-selected={selected}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors",
        "hover:bg-stone-100 dark:hover:bg-stone-800/60",
      )}
    >
      <span className="inline-flex size-3.5 items-center justify-center">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint ? <span className="text-[var(--faint)] text-[11px]">{hint}</span> : null}
      {selected ? <Check className="size-3.5 text-[var(--accent)]" /> : null}
    </button>
  );
}
