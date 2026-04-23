"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useState } from "react";
import { ChatInput } from "@/components/ChatInput";
import { ChatHistory } from "@/components/ChatHistory";
import { TaskList } from "@/components/TaskList";
import { AddTaskBar } from "@/components/AddTaskBar";
import { CalendarSubscribeBanner } from "@/components/CalendarSubscribeBanner";
import type { Project, Task } from "@/lib/db/schema";
import Link from "next/link";
import { Settings, Sparkles } from "lucide-react";

export default function Home() {
  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

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
        scheduledStart: t.scheduledStart ? new Date(t.scheduledStart) : null,
        scheduledEnd: t.scheduledEnd ? new Date(t.scheduledEnd) : null,
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

  const openCount = tasks.filter((t) => t.status !== "done" && !t.parentTaskId).length;

  return (
    <div className="flex h-dvh flex-col">
      <CalendarSubscribeBanner />

      <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[var(--accent)]" />
          <span className="display-wide text-lg">nudge</span>
        </div>
        <Link
          href="/settings"
          className="rounded-xl p-2 text-[var(--muted)] hover:bg-[var(--surface)]"
          aria-label="Settings"
        >
          <Settings className="size-4" />
        </Link>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Chat column */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="scroll-fade flex-1 overflow-y-auto">
            <ChatHistory messages={messages} onSuggest={(s) => setInput(s)} />
          </div>
          <div className="px-4 pb-5 pt-2">
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

        {/* Task column */}
        <aside className="hidden lg:flex w-[480px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface-soft)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
            <h2 className="display text-base">Tasks</h2>
            <span className="text-[11px] text-[var(--faint)]">{openCount} open</span>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <TaskList projects={projects} tasks={tasks} onRefresh={loadTasks} />
          </div>
          <div className="border-t border-[var(--border)] p-3">
            <AddTaskBar projects={projects} onAdded={loadTasks} />
          </div>
        </aside>
      </div>
    </div>
  );
}
