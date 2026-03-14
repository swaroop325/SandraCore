import { db } from "./db.js";
import type { User } from "@sandra/core";

export async function upsertUserByTelegramId(
  telegramId: number,
  name: string,
  locale: string
): Promise<User> {
  const res = await db.query<User>(
    `INSERT INTO users (telegram_id, name, locale, status)
     VALUES ($1, $2, $3, 'pending')
     ON CONFLICT (telegram_id) DO UPDATE
       SET name = EXCLUDED.name,
           locale = EXCLUDED.locale
     RETURNING id, telegram_id AS "telegramId", phone, name, locale, status, created_at AS "createdAt"`,
    [telegramId, name, locale]
  );
  const row = res.rows[0];
  if (!row) throw new Error("upsertUserByTelegramId returned no rows");
  return row;
}

export async function getUserById(userId: string): Promise<User | null> {
  const res = await db.query<User>(
    `SELECT id, telegram_id AS "telegramId", phone, name, locale, status, created_at AS "createdAt"
     FROM users WHERE id = $1`,
    [userId]
  );
  return res.rows[0] ?? null;
}
