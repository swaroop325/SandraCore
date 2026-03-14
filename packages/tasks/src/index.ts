import { db } from "@sandra/utils";

export async function createTask(
  description: string,
  userId: string
): Promise<string> {
  const id = crypto.randomUUID();

  await db.execute(
    `INSERT INTO tasks (id, user_id, title, status) VALUES ($1, $2, $3, 'pending')`,
    [id, userId, description]
  );

  return `Task created: "${description}"`;
}

export { scheduleReminder } from "./reminders.js";
