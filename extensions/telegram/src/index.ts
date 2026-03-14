import { Bot, webhookCallback } from "grammy";
import { handleMessage } from "@sandra/agent";
import { upsertUserByTelegramId, redeemPairingCode, createPairingRequest, auditLog } from "@sandra/utils";
import { t } from "@sandra/i18n";
import { registerBot, sendTelegram } from "./send.js";

export { sendTelegram };

export let bot: Bot;

export function createBot(token: string): Bot {
  bot = new Bot(token);
  registerBot(bot);

  // /pair <CODE> — user redeems a pairing code
  bot.command("pair", async (ctx) => {
    const tgId = ctx.from!.id;
    const locale = ctx.from!.language_code ?? "en";
    const code = ctx.match?.trim();

    if (!code) {
      await ctx.reply(t(locale, "pairing_required"));
      return;
    }

    const user = await upsertUserByTelegramId(
      tgId,
      ctx.from!.first_name ?? "User",
      locale
    );

    if (user.status === "approved") {
      await ctx.reply("You are already approved.");
      return;
    }

    const approved = await redeemPairingCode(code, tgId);
    if (approved) {
      void auditLog({ action: "pairing.redeemed", channel: "telegram", details: { telegramId: String(ctx.from?.id) } });
      await ctx.reply("Pairing successful! You can now chat with Sandra.");
    } else {
      await ctx.reply("Invalid or expired pairing code. Ask the admin for a new one.");
    }
  });

  bot.on("message:text", async (ctx) => {
    const tgId = ctx.from!.id;
    const text = ctx.message.text;
    const locale = ctx.from!.language_code ?? "en";
    const sessionId = `tg:${tgId}`;

    const user = await upsertUserByTelegramId(
      tgId,
      ctx.from!.first_name ?? "User",
      locale
    );

    if (user.status === "pending") {
      void auditLog({ action: "auth.failure", channel: "telegram", details: { telegramId: String(tgId), status: user.status } });
      await ctx.reply(t(locale, "pairing_required"));
      return;
    }
    if (user.status === "blocked") {
      void auditLog({ action: "auth.failure", channel: "telegram", details: { telegramId: String(tgId), status: user.status } });
      await ctx.reply(t(locale, "user_blocked"));
      return;
    }

    void auditLog({ action: "message.received", userId: user.id, sessionId, channel: "telegram" });
    const { reply } = await handleMessage({
      id: crypto.randomUUID(),
      text,
      userId: user.id,
      sessionId,
      channel: "telegram",
      locale,
      timestamp: Date.now(),
    });

    await sendTelegram(tgId, reply);
  });

  return bot;
}

export function getWebhookHandler(b: Bot) {
  return webhookCallback(b, "express");
}
