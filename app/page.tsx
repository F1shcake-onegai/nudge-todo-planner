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
import { Settings, Sparkles, LogOut, ListTodo, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type MobileView = "chat" | "tasks";

export default function Home() {
  const router = useRouter();
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mobileView, setMobileView] = useState<MobileView>("chat");

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

  // When the viewport grows into the dual-panel breakpoint, reset to the
  // chat page so re-shrinking doesn't re-enter on the tasks view.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && setMobileView("chat");
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
          <button
            type="button"
            onClick={() => setMobileView((v) => (v === "chat" ? "tasks" : "chat"))}
            className="relative flex lg:hidden size-10 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface)]"
            aria-label={mobileView === "chat" ? "Tasks" : "Chat"}
          >
            {mobileView === "chat" ? (
              <ListTodo className="size-5" />
            ) : (
              <MessageSquare className="size-5" />
            )}
            {mobileView === "chat" && openCount > 0 ? (
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
        {/* Chat column: full width < lg when view=chat, flex-1 at lg+ (always visible with task sidebar). */}
        <section
          className={cn(
            "min-w-0 flex-1 flex-col",
            mobileView === "chat" ? "flex" : "hidden lg:flex",
          )}
        >
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

        {/* Task column: full width < lg when view=tasks, permanent 480px sidebar at lg+. */}
        <aside
          className={cn(
            "flex-col bg-[var(--surface-soft)]",
            "flex-1 lg:flex-none lg:w-[480px] lg:shrink-0 lg:border-l lg:border-[var(--border)]",
            mobileView === "tasks" ? "flex" : "hidden lg:flex",
          )}
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
            <h2 className="display text-base">Tasks</h2>
            <span className="text-[11px] text-[var(--faint)]">{openCount} open</span>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <TaskList projects={projects} tasks={tasks} onRefresh={loadTasks} />
          </div>
          <div className="border-t border-[var(--border)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <AddTaskBar projects={projects} onAdded={loadTasks} />
          </div>
        </aside>
      </div>
    </div>
  );
}
