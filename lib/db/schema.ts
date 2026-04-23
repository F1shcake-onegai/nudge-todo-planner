import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

/** The single-row-per-table id for settings. Single-user app. */
export const SETTINGS_ID = "singleton";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#c96442"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  parentTaskId: text("parent_task_id"),
  title: text("title").notNull(),
  notes: text("notes"),
  estimatedMinutes: integer("estimated_minutes").notNull().default(30),
  priority: integer("priority").notNull().default(4), // 1..4, 4 = none (default)
  deadline: integer("deadline", { mode: "timestamp_ms" }),
  scheduledStart: integer("scheduled_start", { mode: "timestamp_ms" }),
  scheduledEnd: integer("scheduled_end", { mode: "timestamp_ms" }),
  status: text("status", { enum: ["todo", "doing", "done"] }).notNull().default("todo"),
  notifiedAt: integer("notified_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  content: text("content").notNull(),
  toolCalls: text("tool_calls"), // JSON stringified
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  label: text("label"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey().default(SETTINGS_ID),
  workHoursStart: text("work_hours_start").notNull().default("09:00"),
  workHoursEnd: text("work_hours_end").notNull().default("18:00"),
  timezone: text("timezone").notNull().default("UTC"),
  llmProvider: text("llm_provider").notNull().default("anthropic"),
  llmModel: text("llm_model").notNull().default("claude-sonnet-4-6"),
  llmEditModel: text("llm_edit_model").default("claude-haiku-4-5-20251001"),
  feedToken: text("feed_token"), // random token protecting the iCal feed URL
  bootstrapped: integer("bootstrapped", { mode: "boolean" }).notNull().default(false),
  notificationIntensity: text("notification_intensity", {
    enum: ["off", "light", "balanced", "intense"],
  })
    .notNull()
    .default("light"),
});

export const credentials = sqliteTable("credentials", {
  id: text("id").primaryKey().default(SETTINGS_ID),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // random 32-byte hex token (acts as the session token)
  label: text("label", { enum: ["browser", "app", "caldav"] }).notNull().default("browser"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

export const providerKeys = sqliteTable("provider_keys", {
  provider: text("provider").primaryKey(), // anthropic | openai | google | ollama
  encryptedKey: text("encrypted_key").notNull(),
  baseUrl: text("base_url"),
});

// ---- Relations ----

export const projectsRelations = relations(projects, ({ many }) => ({
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  parent: one(tasks, { fields: [tasks.parentTaskId], references: [tasks.id], relationName: "subtasks" }),
  subtasks: many(tasks, { relationName: "subtasks" }),
}));

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type Credentials = typeof credentials.$inferSelect;
export type Session = typeof sessions.$inferSelect;
