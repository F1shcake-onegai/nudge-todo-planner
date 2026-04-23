"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useState } from "react";
import { ChatInput } from "@/components/ChatInput";
import { ChatHistory } from "@/components/ChatHistory";
import { TaskList } from "@/components/TaskList";
import { AddTaskBar } from "@/components/AddTaskBar";
import type { Project, Task } from "@/lib/db/schema";
import Link from "next/link";
import { Settings, Sparkles, LogOut, ListTodo, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export default function Home() {
  const router = useRouter();
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadTasks = useCallback(async () => {
    const r = await fetch("/api/tasks", { cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json();
    setProjects(
      (data.projects ?? []).map((p: any) => ({ ...p, createdAt: new Date(p.createdAt) })),
    );
    setTasks(
      (data.tasks ?? []).map((t: any) => ({
        ...t,
        createdAt: new Date(t.createdAt),
        deadline: t.deadline ? new Date(t.deadline) : null,
        notifiedAt: t.notifiedAt ? new Date(t.notifiedAt) : null,
      })),
    );
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (status === "ready" && messages.length) loadTasks();
  }, [status, messages.length, loadTasks]);

  // Close the drawer when the viewport grows into the permanent-panel breakpoint.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && setDrawerOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const openCount = tasks.filter((t) => t.status !== "done" && !t.parentTaskId).length;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[var(--accent)]" />
          <span className="display-wide text-lg">nudge</span>
        </div>
        <div className="flex items-center gap-0.5">
          {/* Mobile / tablet: toggle task drawer */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="relative flex lg:hidden size-10 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface)]"
            aria-label="Tasks"
          >
            <ListTodo className="size-5" />
            {openCount > 0 ? (
              <span className="absolute top-1 right-1 min-w-[16px] rounded-full bg-[var(--accent)] px-1 text-[10px] font-medium leading-4 text-[var(--accent-fg)]">
                {openCount > 99 ? "99+" : openCount}
              </span>
            ) : null}
          </button>
          <Link
            href="/settings"
            className="flex size-10 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface)]"
            aria-label="Settings"
          >
            <Settings className="size-5" />
          </Link>
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.replace("/login");
              router.refresh();
            }}
            className="flex size-10 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface)]"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Chat column */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="scroll-fade flex-1 overflow-y-auto">
            <ChatHistory messages={messages} onSuggest={(s) => setInput(s)} />
          </div>
          <div className="px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-4 sm:pb-5">
            <div className="mx-auto max-w-3xl">
              <ChatInput
                value={input}
                onChange={setInput}
                onSubmit={() => {
                  if (!input.trim()) return;
                  sendMessage({ text: input });
                  setInput("");
                }}
                onStop={stop}
                status={status}
              />
            </div>
          </div>
        </section>

        {/* Task column — permanent on desktop, drawer on mobile/tablet */}
        <TaskPanel
          projects={projects}
          tasks={tasks}
          onRefresh={loadTasks}
          openCount={openCount}
          drawerOpen={drawerOpen}
          onCloseDrawer={() => setDrawerOpen(false)}
        />
      </div>
    </div>
  );
}

function TaskPanel({
  projects,
  tasks,
  onRefresh,
  openCount,
  drawerOpen,
  onCloseDrawer,
}: {
  projects: Project[];
  tasks: Task[];
  onRefresh: () => Promise<void>;
  openCount: number;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
}) {
  return (
    <>
      {/* Permanent sidebar ≥ lg */}
      <aside className="hidden lg:flex w-[480px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface-soft)]">
        <PanelHeader openCount={openCount} />
        <PanelBody projects={projects} tasks={tasks} onRefresh={onRefresh} />
        <PanelFooter projects={projects} onAdded={onRefresh} />
      </aside>

      {/* Drawer < lg */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Tasks"
        >
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[1px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
            onClick={onCloseDrawer}
          />
          <div
            className={cn(
              "absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--surface-soft)]",
              "motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-200",
            )}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
              <h2 className="display text-base">Tasks</h2>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--faint)]">{openCount} open</span>
                <button
                  type="button"
                  onClick={onCloseDrawer}
                  className="flex size-9 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface)]"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>
            <PanelBody projects={projects} tasks={tasks} onRefresh={onRefresh} />
            <PanelFooter projects={projects} onAdded={onRefresh} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function PanelHeader({ openCount }: { openCount: number }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
      <h2 className="display text-base">Tasks</h2>
      <span className="text-[11px] text-[var(--faint)]">{openCount} open</span>
    </div>
  );
}
function PanelBody({
  projects,
  tasks,
  onRefresh,
}: {
  projects: Project[];
  tasks: Task[];
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-3 py-4">
      <TaskList projects={projects} tasks={tasks} onRefresh={onRefresh} />
    </div>
  );
}
function PanelFooter({
  projects,
  onAdded,
}: {
  projects: Project[];
  onAdded: () => void | Promise<void>;
}) {
  return (
    <div className="border-t border-[var(--border)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <AddTaskBar projects={projects} onAdded={onAdded} />
    </div>
  );
}
