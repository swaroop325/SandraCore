export type Channel = "telegram" | "whatsapp" | "discord" | "slack" | "web" | "msteams" | "internal" | "gmail";

export interface AssistantInput {
  id: string;
  text: string;
  userId: string;
  sessionId: string;
  channel: Channel;
  locale: string;
  timestamp: number;
}

export interface AssistantOutput {
  reply: string;
  intent?: string;
  taskId?: string;
}

export type UserStatus = "pending" | "approved" | "blocked";

export interface User {
  id: string;
  telegramId?: bigint;
  phone?: string;
  name?: string;
  locale: string;
  status: UserStatus;
  createdAt: Date;
}

export type MessageRole = "user" | "assistant";

export interface ConversationMessage {
  id: string;
  sessionId: string;
  userId: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
}

export type TaskStatus = "pending" | "in_progress" | "done" | "cancelled";

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  dueDate?: Date;
  priority: number;
  createdAt: Date;
}

export interface Reminder {
  id: string;
  userId: string;
  taskId?: string;
  triggerTime: Date;
  sent: boolean;
}

export type Intent =
  | "task_create"
  | "research"
  | "code_generate"
  | "recall"
  | "conversation";

export type Complexity = "simple" | "complex" | "deep";

export interface Classification {
  intent: Intent;
  complexity: Complexity;
}
