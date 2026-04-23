"use client";

import { cn } from "@/lib/utils";
import type { Project, Task } from "@/lib/db/schema";
import {
  ChevronRight,
  Circle,
  CheckCircle2,
  CircleDot,
  Plus,
  CalendarPlus,
  Trash2,
  ChevronLeft,
  Flag,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useClickOutside } from "@/lib/hooks";

type Props = {
  projects: Project[];
  tasks: Task[];
  onRefresh: () => Promise<void>;
};

type Refresh = () => Promise<void>;

async function patchTask(id: string, patch: Record<string, unknown>) {
  await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}
async function deleteTask(id: string) {
  await fetch(`/api/tasks/${id}`, { method: "DELETE" });
}
async function createTask(input: {
  title: string;
  projectId?: string | null;
  parentTaskId?: string | null;
  priority?: number;
}) {
  await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

type Menu = { task: Task; x: number; y: number } | null;
type ProjectMenu = { project: Project | null; x: number; y: number } | null;
type ExternalTrigger = { taskId: string; kind: "addSubtask" | "rename" | "setDeadline" } | null;

export function TaskList({ projects, tasks, onRefresh }: Props) {
  const [menu, setMenu] = useState<Menu>(null);
  const [projectMenu, setProjectMenu] = useState<ProjectMenu>(null);
  const [trigger, setTrigger] = useState<ExternalTrigger>(null);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renamingUnassigned, setRenamingUnassigned] = useState(false);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState<Project | null>(null);
  const [confirmClearUnassigned, setConfirmClearUnassigned] = useState(false);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState<Task | null>(null);

  const { grouped, groupKeys, subtasksByParent } = useMemo(() => {
    const byProject = new Map<string | null, Task[]>();
    const byParent = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.parentTaskId) {
        if (!byParent.has(t.parentTaskId)) byParent.set(t.parentTaskId, []);
        byParent.get(t.parentTaskId)!.push(t);
        continue;
      }
      const key = t.projectId ?? null;
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key)!.push(t);
    }
    // Sort project groups by projects[] order; New Task ("null") first.
    const orderIndex = new Map<string, number>(projects.map((p, i) => [p.id, i]));
    const keys = [...byProject.keys()].sort((a, b) => {
      if (a === b) return 0;
      if (a === null) return -1;
      if (b === null) return 1;
      return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
    });
    return { grouped: byProject, groupKeys: keys, subtasksByParent: byParent };
  }, [tasks, projects]);

  return (
    <div className="flex flex-col gap-8">
      {groupKeys.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
          No tasks yet. Add one below.
        </div>
      ) : null}

      {groupKeys.map((projectId) => {
        const project = projects.find((p) => p.id === projectId);
        const items = grouped.get(projectId)!;
        const open = items.filter((t) => t.status !== "done").length;
        const isRenaming = project
          ? renamingProjectId === project.id
          : renamingUnassigned;
        return (
          <section key={projectId ?? "inbox"}>
            <div
              className="group mb-2 flex items-baseline gap-2.5 pl-1"
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setProjectMenu({ project: project ?? null, x: e.clientX, y: e.clientY });
              }}
            >
              <span
                className="dot"
                style={{ color: project?.color ?? "var(--muted)" }}
                aria-hidden
              />
              {isRenaming ? (
                <ProjectRenameInput
                  value={project?.name ?? ""}
                  placeholder={project ? undefined : "Project name"}
                  onDone={async (v) => {
                    const trimmed = v.trim();
                    if (project) {
                      if (trimmed && trimmed !== project.name) {
                        await fetch(`/api/projects/${project.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name: trimmed }),
                        });
                        await onRefresh();
                      }
                      setRenamingProjectId(null);
                    } else {
                      if (trimmed) {
                        await fetch("/api/projects", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name: trimmed, absorbUnassigned: true }),
                        });
                        await onRefresh();
                      }
                      setRenamingUnassigned(false);
                    }
                  }}
                />
              ) : (
                <h3 className="display text-[15px]">{project?.name ?? "New Task"}</h3>
              )}
              {open > 0 ? (
                <span className="text-[11px] font-medium text-[var(--faint)]">{open} open</span>
              ) : (
                <span className="text-[11px] font-medium text-[var(--accent)]">all done</span>
              )}
            </div>
            <ul className="flex flex-col">
              {items.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  subtasksByParent={subtasksByParent}
                  refresh={onRefresh}
                  openMenu={(task, x, y) => setMenu({ task, x, y })}
                  trigger={trigger}
                  clearTrigger={() => setTrigger(null)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {menu ? (
        <ContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          refresh={onRefresh}
          onTrigger={(kind) => {
            setTrigger({ taskId: menu.task.id, kind });
            setMenu(null);
          }}
          onRequestDelete={() => {
            setConfirmDeleteTask(menu.task);
            setMenu(null);
          }}
        />
      ) : null}
      {projectMenu ? (
        <ProjectContextMenu
          menu={projectMenu}
          onClose={() => setProjectMenu(null)}
          refresh={onRefresh}
          onRename={() => {
            if (projectMenu.project) {
              setRenamingProjectId(projectMenu.project.id);
            } else {
              setRenamingUnassigned(true);
            }
            setProjectMenu(null);
          }}
          onRequestDelete={() => {
            if (projectMenu.project) {
              setConfirmDeleteProject(projectMenu.project);
            } else {
              setConfirmClearUnassigned(true);
            }
            setProjectMenu(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!confirmDeleteProject}
        options={{
          title: confirmDeleteProject ? `Delete "${confirmDeleteProject.name}"?` : "",
          description: confirmDeleteProject
            ? (() => {
                const n = tasks.filter(
                  (t) => t.projectId === confirmDeleteProject.id && !t.parentTaskId,
                ).length;
                return (
                  <>
                    This will permanently delete the project and all{" "}
                    <span className="font-medium text-[var(--text)]">
                      {n} task{n === 1 ? "" : "s"}
                    </span>{" "}
                    inside it, including any subtasks. This can&apos;t be undone.
                  </>
                );
              })()
            : null,
          confirmLabel: "Delete",
          danger: true,
        }}
        onCancel={() => setConfirmDeleteProject(null)}
        onConfirm={async () => {
          if (!confirmDeleteProject) return;
          await fetch(`/api/projects/${confirmDeleteProject.id}?cascade=true`, {
            method: "DELETE",
          });
          setConfirmDeleteProject(null);
          await onRefresh();
        }}
      />

      <ConfirmDialog
        open={confirmClearUnassigned}
        options={{
          title: "Delete all unassigned tasks?",
          description: (() => {
            const n = tasks.filter((t) => !t.projectId && !t.parentTaskId).length;
            return (
              <>
                This will permanently delete all{" "}
                <span className="font-medium text-[var(--text)]">
                  {n} task{n === 1 ? "" : "s"}
                </span>{" "}
                in the New Task section, including their subtasks. This can&apos;t be undone.
              </>
            );
          })(),
          confirmLabel: "Delete",
          danger: true,
        }}
        onCancel={() => setConfirmClearUnassigned(false)}
        onConfirm={async () => {
          await fetch("/api/tasks/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", projectId: null }),
          });
          setConfirmClearUnassigned(false);
          await onRefresh();
        }}
      />

      <ConfirmDialog
        open={!!confirmDeleteTask}
        options={{
          title: confirmDeleteTask ? `Delete "${confirmDeleteTask.title}"?` : "",
          description: confirmDeleteTask ? (
            (() => {
              const subCount = subtasksByParent.get(confirmDeleteTask.id)?.length ?? 0;
              return subCount
                ? `This will also delete ${subCount} subtask${subCount === 1 ? "" : "s"}. This can't be undone.`
                : "This can't be undone.";
            })()
          ) : null,
          confirmLabel: "Delete",
          danger: true,
        }}
        onCancel={() => setConfirmDeleteTask(null)}
        onConfirm={async () => {
          if (!confirmDeleteTask) return;
          await deleteTask(confirmDeleteTask.id);
          setConfirmDeleteTask(null);
          await onRefresh();
        }}
      />
    </div>
  );
}

function ProjectRenameInput({
  value,
  placeholder,
  onDone,
}: {
  value: string;
  placeholder?: string;
  onDone: (v: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (value) ref.current?.select();
    else ref.current?.focus();
  }, [value]);
  return (
    <input
      ref={ref}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onDone(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          onDone(value);
        }
      }}
      className="display text-[15px] rounded-md border border-[var(--accent)] bg-[var(--bg)] px-1.5 py-0 outline-none placeholder:text-[var(--faint)]"
    />
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  subtasksByParent,
  refresh,
  openMenu,
  trigger,
  clearTrigger,
  isSub,
}: {
  task: Task;
  subtasksByParent: Map<string, Task[]>;
  refresh: Refresh;
  openMenu: (task: Task, x: number, y: number) => void;
  trigger: ExternalTrigger;
  clearTrigger: () => void;
  isSub?: boolean;
}) {
  const subs = subtasksByParent.get(task.id) ?? [];
  const [open, setOpen] = useState(subs.length > 0);
  const [renaming, setRenaming] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState<string | null>(null);
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  // react to context-menu triggers
  useEffect(() => {
    if (!trigger || trigger.taskId !== task.id) return;
    if (trigger.kind === "rename") setRenaming(true);
    if (trigger.kind === "setDeadline") setEditingDeadline(true);
    if (trigger.kind === "addSubtask") {
      setOpen(true);
      setSubtaskDraft("");
      // focus happens after render
      setTimeout(() => subtaskInputRef.current?.focus(), 40);
    }
    clearTrigger();
  }, [trigger, task.id, clearTrigger]);

  const done = task.status === "done";
  const overdue = !done && task.deadline && isPast(task.deadline) && !isToday(task.deadline);

  async function toggleDone() {
    const next = done ? "todo" : "done";
    await patchTask(task.id, { status: next });
    await refresh();
  }

  async function submitSubtask() {
    const title = (subtaskDraft ?? "").trim();
    if (!title) {
      setSubtaskDraft(null);
      return;
    }
    await createTask({
      title,
      projectId: task.projectId,
      parentTaskId: task.id,
      priority: task.priority,
    });
    setSubtaskDraft("");
    await refresh();
  }

  return (
    <li>
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openMenu(task, e.clientX, e.clientY);
        }}
        className={cn(
          "group relative flex items-center gap-2 rounded-lg px-2 py-1.5 transition",
          "hover:bg-[var(--surface)]",
          isSub ? "text-[13.5px]" : "text-[14px]",
          done && "opacity-70",
        )}
      >
        {!isSub && (
          <button
            type="button"
            onClick={() => subs.length && setOpen((o) => !o)}
            className={cn(
              "shrink-0 rounded p-0.5 text-[var(--faint)] transition-colors hover:bg-stone-100 hover:text-[var(--muted)] dark:hover:bg-stone-800/60",
              !subs.length && "pointer-events-none opacity-0",
            )}
            aria-label={open ? "Collapse" : "Expand"}
          >
            <ChevronRight className={cn("size-3.5 transition", open && "rotate-90")} />
          </button>
        )}
        <button
          type="button"
          onClick={toggleDone}
          className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-stone-100 dark:hover:bg-stone-800/60"
          aria-label={done ? "Mark not done" : "Mark done"}
        >
          <StatusIcon status={task.status} size={isSub ? 13 : 15} />
        </button>

        <InlineTitle
          value={task.title}
          done={done}
          forceEditing={renaming}
          onEditingChange={setRenaming}
          onChange={async (v) => {
            if (v && v !== task.title) {
              await patchTask(task.id, { title: v });
              await refresh();
            }
          }}
        />

        <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--muted)]">
          <PriorityFlag priority={task.priority} />
          <DeadlineChip
            task={task}
            refresh={refresh}
            overdue={!!overdue}
            editing={editingDeadline}
            onEditingChange={setEditingDeadline}
          />
        </div>
      </div>

      {open && !isSub && (subs.length || subtaskDraft !== null) ? (
        <ul className="ml-6 flex flex-col border-l border-[var(--border)] pl-3 my-0.5">
          {subs.map((s) => (
            <TaskRow
              key={s.id}
              task={s}
              subtasksByParent={subtasksByParent}
              refresh={refresh}
              openMenu={openMenu}
              trigger={trigger}
              clearTrigger={clearTrigger}
              isSub
            />
          ))}
          {subtaskDraft !== null ? (
            <li>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitSubtask();
                }}
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] text-[var(--muted)]"
              >
                <Plus className="size-3.5 shrink-0" />
                <input
                  ref={subtaskInputRef}
                  value={subtaskDraft}
                  onChange={(e) => setSubtaskDraft(e.target.value)}
                  onBlur={() => submitSubtask()}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setSubtaskDraft(null);
                  }}
                  placeholder="Subtask…"
                  className="flex-1 bg-transparent outline-none placeholder:text-[var(--faint)]"
                />
              </form>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

// ─── Bits ──────────────────────────────────────────────────────────────────

function InlineTitle({
  value,
  done,
  forceEditing,
  onEditingChange,
  onChange,
}: {
  value: string;
  done?: boolean;
  forceEditing?: boolean;
  onEditingChange?: (b: boolean) => void;
  onChange: (v: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (forceEditing) setEditing(true);
  }, [forceEditing]);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  function stop() {
    setEditing(false);
    onEditingChange?.(false);
  }

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          stop();
          onChange(draft.trim() || value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "Escape") {
            setDraft(value);
            stop();
          }
        }}
        className="flex-1 min-w-0 rounded-md border border-[var(--accent)] bg-[var(--bg)] px-1.5 py-0.5 outline-none"
      />
    );
  }

  return (
    <span
      tabIndex={0}
      role="textbox"
      onDoubleClick={() => {
        setEditing(true);
        onEditingChange?.(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "F2" || e.key === "Enter") {
          setEditing(true);
          onEditingChange?.(true);
        }
      }}
      className={cn(
        "flex-1 min-w-0 cursor-text truncate rounded-sm px-0.5 transition-colors",
        "hover:bg-stone-100 dark:hover:bg-stone-800/60",
        done && "text-[var(--faint)] line-through decoration-[var(--faint)]",
      )}
    >
      {value}
    </span>
  );
}

function StatusIcon({ status, size = 16 }: { status: Task["status"]; size?: number }) {
  const base = { width: size, height: size };
  if (status === "done") return <CheckCircle2 style={base} className="text-[var(--accent)]" />;
  if (status === "doing") return <CircleDot style={base} className="text-[var(--accent)]" />;
  return <Circle style={base} strokeWidth={1.5} className="text-[var(--faint)]" />;
}

function ScheduledChip({ task, refresh }: { task: Task; refresh: () => Promise<void> }) {
  if (!task.scheduledStart) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        if (!confirm("Unschedule? It will be re-placed on the next scheduler pass.")) return;
        await patchTask(task.id, { scheduledStart: null, scheduledEnd: null });
        await refresh();
      }}
      className="rounded-md bg-[var(--accent-soft)]/40 px-1.5 py-0.5 font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]/70"
      title="Click to unschedule"
    >
      {format(task.scheduledStart, "EEE HH:mm")}
    </button>
  );
}

function DeadlineChip({
  task,
  refresh,
  overdue,
  editing,
  onEditingChange,
}: {
  task: Task;
  refresh: Refresh;
  overdue: boolean;
  editing: boolean;
  onEditingChange: (b: boolean) => void;
}) {
  const [value, setValue] = useState(task.deadline ? toLocalDateInput(task.deadline) : "");
  useEffect(() => setValue(task.deadline ? toLocalDateInput(task.deadline) : ""), [task.deadline]);

  if (editing) {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={async () => {
          onEditingChange(false);
          const newIso = value ? new Date(value + "T23:59").toISOString() : null;
          await patchTask(task.id, { deadline: newIso });
          await refresh();
        }}
        autoFocus
        className="rounded-md border border-[var(--accent)] bg-[var(--bg)] px-1 py-0.5 outline-none"
      />
    );
  }

  if (!task.deadline) {
    return (
      <button
        type="button"
        onClick={() => onEditingChange(true)}
        className="hover-reveal rounded-md p-1 text-[var(--faint)] hover:bg-[var(--border)]/70"
        aria-label="Set deadline"
      >
        <CalendarPlus className="size-3.5" />
      </button>
    );
  }

  const d = task.deadline;
  const label = isToday(d) ? "today" : isTomorrow(d) ? "tomorrow" : format(d, "MMM d");

  return (
    <button
      type="button"
      onClick={() => onEditingChange(true)}
      className={cn(
        "rounded-md px-1.5 py-0.5 font-medium transition-colors",
        overdue
          ? "bg-red-500/15 text-red-700 hover:bg-red-500/25 dark:text-red-400"
          : isToday(d)
          ? "bg-[var(--accent-soft)]/80 text-[var(--accent)] hover:bg-[var(--accent-soft)]"
          : "bg-[var(--border)]/60 text-[var(--muted)] hover:bg-[var(--border)]",
      )}
    >
      {label}
    </button>
  );
}

const PRIORITY_LEVELS = [
  { p: 1, label: "High", iconClass: "text-red-600 fill-red-500/40" },
  { p: 2, label: "Medium", iconClass: "text-amber-600 fill-amber-500/40" },
  { p: 3, label: "Low", iconClass: "text-emerald-600 fill-emerald-500/40" },
  { p: 4, label: "None", iconClass: "text-[var(--faint)]" },
] as const;

function PriorityFlag({ priority }: { priority: number }) {
  // Hidden on task rows for "None" — user sees a clean row.
  if (priority >= 4) return null;
  const lv = PRIORITY_LEVELS.find((l) => l.p === priority);
  if (!lv) return null;
  return (
    <span className="flex items-center" title={`Priority — ${lv.label}`}>
      <Flag className={cn("size-3.5", lv.iconClass)} strokeWidth={2} />
    </span>
  );
}

function toLocalDateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ─── Context menu ──────────────────────────────────────────────────────────

function ContextMenu({
  menu,
  onClose,
  refresh,
  onTrigger,
  onRequestDelete,
}: {
  menu: { task: Task; x: number; y: number };
  onClose: () => void;
  refresh: Refresh;
  onTrigger: (kind: "addSubtask" | "rename" | "setDeadline") => void;
  onRequestDelete: () => void;
}) {
  const [submenu, setSubmenu] = useState<"priority" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  const done = menu.task.status === "done";
  const doing = menu.task.status === "doing";

  const x = Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 220);
  const y = Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 1000) - 320);

  async function setStatus(status: "todo" | "doing" | "done") {
    await patchTask(menu.task.id, { status });
    await refresh();
    onClose();
  }
  async function setPriority(p: number) {
    await patchTask(menu.task.id, { priority: p });
    await refresh();
    onClose();
  }
  function del() {
    onRequestDelete();
  }

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-50 w-56 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 text-sm shadow-[0_8px_28px_-10px_rgba(0,0,0,0.25)]"
      role="menu"
    >
      {submenu === "priority" ? (
        <>
          <MenuRow onClick={() => setSubmenu(null)} icon={<ChevronLeft className="size-3.5" />}>
            Priority
          </MenuRow>
          <MenuSep />
          {PRIORITY_LEVELS.map((lv) => (
            <MenuRow
              key={lv.p}
              onClick={() => setPriority(lv.p)}
              check={menu.task.priority === lv.p}
            >
              <span className="inline-flex w-4 items-center justify-center">
                <Flag className={cn("size-3.5", lv.iconClass)} strokeWidth={2} />
              </span>
              <span className="flex-1">{lv.label}</span>
            </MenuRow>
          ))}
        </>
      ) : (
        <>
          <MenuRow onClick={() => onTrigger("addSubtask")}>Add subtask</MenuRow>
          <MenuRow onClick={() => onTrigger("rename")}>Rename</MenuRow>
          <MenuRow onClick={() => onTrigger("setDeadline")}>
            {menu.task.deadline ? "Change deadline…" : "Set deadline…"}
          </MenuRow>
          <MenuRow onClick={() => setSubmenu("priority")}>
            <span className="flex-1">Priority</span>
            <span className="inline-flex w-4 items-center justify-center">
              <Flag
                className={cn(
                  "size-3.5",
                  PRIORITY_LEVELS.find((l) => l.p === menu.task.priority)?.iconClass ??
                    "text-[var(--faint)]",
                )}
                strokeWidth={2}
              />
            </span>
            <span className="text-[var(--faint)]">
              {PRIORITY_LEVELS.find((l) => l.p === menu.task.priority)?.label ?? "None"}
            </span>
            <ChevronRight className="size-3.5 text-[var(--faint)]" />
          </MenuRow>
          <MenuSep />
          {!done ? (
            <MenuRow onClick={() => setStatus("done")}>Mark done</MenuRow>
          ) : (
            <MenuRow onClick={() => setStatus("todo")}>Mark not done</MenuRow>
          )}
          {!done ? (
            <MenuRow onClick={() => setStatus(doing ? "todo" : "doing")}>
              {doing ? "Clear in-progress" : "Mark in-progress"}
            </MenuRow>
          ) : null}
          <MenuSep />
          <MenuRow onClick={del} danger>
            <Trash2 className="size-3.5" /> Delete
          </MenuRow>
        </>
      )}
    </div>
  );
}

function MenuRow({
  children,
  onClick,
  icon,
  check,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
  check?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
        "hover:bg-stone-100 dark:hover:bg-stone-800/60",
        danger && "text-red-600 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950/50",
      )}
    >
      {icon ? <span className="text-[var(--muted)]">{icon}</span> : null}
      {check !== undefined ? (
        <span className={cn("w-3 text-[var(--accent)]", !check && "opacity-0")}>✓</span>
      ) : null}
      {children}
    </button>
  );
}

function MenuSep() {
  return <div className="my-1 h-px bg-[var(--border)]" />;
}

// ─── Project context menu ─────────────────────────────────────────────────

function ProjectContextMenu({
  menu,
  onClose,
  refresh,
  onRename,
  onRequestDelete,
}: {
  menu: { project: Project | null; x: number; y: number };
  onClose: () => void;
  refresh: Refresh;
  onRename: () => void;
  onRequestDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  const x = Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 240);
  const y = Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 1000) - 200);

  const isUnassigned = !menu.project;

  async function markAllDone() {
    if (menu.project) {
      await fetch(`/api/projects/${menu.project.id}/complete`, { method: "POST" });
    } else {
      await fetch("/api/tasks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", projectId: null }),
      });
    }
    await refresh();
    onClose();
  }

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-50 w-60 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 text-sm shadow-[0_8px_28px_-10px_rgba(0,0,0,0.25)]"
      role="menu"
    >
      <MenuRow onClick={onRename}>
        {isUnassigned ? "Name this project" : "Rename project"}
      </MenuRow>
      <MenuRow onClick={markAllDone}>Mark all tasks done</MenuRow>
      <MenuSep />
      <MenuRow onClick={onRequestDelete} danger>
        <Trash2 className="size-3.5" />
        {isUnassigned ? "Delete all tasks" : "Delete project"}
      </MenuRow>
    </div>
  );
}
