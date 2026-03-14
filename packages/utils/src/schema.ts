import {
  pgTable,
  uuid,
  bigint,
  text,
  timestamp,
  boolean,
  integer,
  real,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id:         uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  telegramId: bigint("telegram_id", { mode: "bigint" }).unique(),
  phone:      text("phone").unique(),
  name:       text("name"),
  locale:     text("locale").default("en").notNull(),
  status:     text("status").default("pending").notNull(),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});

export const userSettings = pgTable("user_settings", {
  userId:       uuid("user_id").primaryKey().references(() => users.id),
  timezone:     text("timezone").default("UTC").notNull(),
  soulOverride: text("soul_override"),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
});

export const channelSessions = pgTable("channel_sessions", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:    uuid("user_id").notNull().references(() => users.id),
  sessionId: text("session_id").unique().notNull(),
  channel:   text("channel").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSeen:  timestamp("last_seen").defaultNow().notNull(),
});

export const conversationMessages = pgTable("conversation_messages", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull(),
  userId:    uuid("user_id").notNull().references(() => users.id),
  role:      text("role").notNull(),
  content:   text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:    uuid("user_id").notNull().references(() => users.id),
  name:      text("name").notNull(),
  goal:      text("goal"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id:          uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:      uuid("user_id").notNull().references(() => users.id),
  title:       text("title").notNull(),
  description: text("description"),
  status:      text("status").default("pending").notNull(),
  dueDate:     timestamp("due_date"),
  priority:    integer("priority").default(0).notNull(),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

export const reminders = pgTable("reminders", {
  id:          uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:      uuid("user_id").notNull().references(() => users.id),
  taskId:      uuid("task_id").references(() => tasks.id),
  triggerTime: timestamp("trigger_time").notNull(),
  sent:        boolean("sent").default(false).notNull(),
});

export const commitments = pgTable("commitments", {
  id:            uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:        uuid("user_id").notNull().references(() => users.id),
  projectId:     uuid("project_id").references(() => projects.id),
  taskId:        uuid("task_id").references(() => tasks.id),
  confidence:    real("confidence"),
  sourceMessage: text("source_message"),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
});

// ── LLM usage tracking ────────────────────────────────────────────────────

export const llmUsage = pgTable("llm_usage", {
  id:               uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:           uuid("user_id").notNull().references(() => users.id),
  sessionId:        text("session_id").notNull(),
  modelId:          text("model_id").notNull(),
  inputTokens:      integer("input_tokens").notNull(),
  outputTokens:     integer("output_tokens").notNull(),
  estimatedCostUsd: doublePrecision("estimated_cost_usd").notNull(),
  recordedAt:       timestamp("recorded_at").defaultNow().notNull(),
});

// ── Security: pairing + allowlist ─────────────────────────────────────────

export const pairingRequests = pgTable("pairing_requests", {
  id:         uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code:       text("code").unique().notNull(),
  telegramId: bigint("telegram_id", { mode: "bigint" }).notNull(),
  channel:    text("channel").default("telegram").notNull(),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
  expiresAt:  timestamp("expires_at").notNull(),
  usedAt:     timestamp("used_at"),
});

export const userAllowlist = pgTable("user_allowlist", {
  id:      uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:  uuid("user_id").notNull().references(() => users.id),
  channel: text("channel").notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});
