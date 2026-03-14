import {
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  InteractionType,
} from "discord.js";
import { createSubsystemLogger, db } from "@sandra/utils";
import { clearHistory } from "@sandra/memory";
import { t } from "@sandra/i18n";

const log = createSubsystemLogger("discord:slash");

const COMMANDS = [
  new SlashCommandBuilder()
    .setName("new")
    .setDescription("Start a fresh conversation (clears current session history)")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Reset your conversation history (alias for /new)")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show what Sandra can do")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("forget")
    .setDescription("Clear all of Sandra's memories about you")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show your account status and session info")
    .toJSON(),
];

/**
 * Register slash commands with Discord's API for a guild or globally.
 * Call once on bot startup.
 */
export async function registerSlashCommands(
  token: string,
  clientId: string,
  guildId?: string
): Promise<void> {
  const rest = new REST().setToken(token);
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: COMMANDS });
      log.info("Registered slash commands for guild", { guildId, count: COMMANDS.length });
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: COMMANDS });
      log.info("Registered global slash commands", { count: COMMANDS.length });
    }
  } catch (err) {
    log.error("Failed to register slash commands", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Handle a slash command interaction.
 * Returns true if the interaction was handled, false if unknown.
 */
export async function handleSlashCommand(
  interaction: ChatInputCommandInteraction,
  getUserId: (discordId: string) => Promise<string | null>
): Promise<void> {
  const { commandName } = interaction;

  // Defer reply so we have time to process
  await interaction.deferReply({ ephemeral: commandName === "forget" || commandName === "status" });

  const discordId = interaction.user.id;
  const userId = await getUserId(discordId);

  if (!userId) {
    await interaction.editReply(t("en", "not_approved"));
    return;
  }

  const sessionId = `dc:${discordId}`;

  switch (commandName) {
    case "new":
    case "reset": {
      try {
        await clearHistory(sessionId, userId);
        await interaction.editReply("✓ Conversation history cleared. Starting fresh!");
      } catch (err) {
        log.error("Failed to clear history", { error: err instanceof Error ? err.message : String(err) });
        await interaction.editReply(t("en", "error_retry"));
      }
      break;
    }

    case "help": {
      const helpText = [
        "**Sandra — your personal AI**",
        "",
        "Just send me a message to chat. I can also:",
        "• Remember important things across conversations",
        "• Search the web for current information",
        "• Set reminders and manage tasks",
        "• Analyze images and documents",
        "• Run code safely",
        "",
        "**Slash commands:**",
        "`/new` — Start a fresh conversation",
        "`/forget` — Clear all memories about you",
        "`/status` — Show your account status",
        "`/help` — This message",
      ].join("\n");
      await interaction.editReply(helpText);
      break;
    }

    case "forget": {
      try {
        const { forgetAllMemories } = await import("@sandra/memory");
        await forgetAllMemories(userId);
        await clearHistory(sessionId, userId);
        await interaction.editReply("✓ All memories and conversation history cleared.");
      } catch (err) {
        log.error("Failed to forget memories", { error: err instanceof Error ? err.message : String(err) });
        await interaction.editReply(t("en", "error_retry"));
      }
      break;
    }

    case "status": {
      try {
        const userRes = await db.query<{ name: string | null; status: string; locale: string; created_at: Date }>(
          "SELECT name, status, locale, created_at FROM users WHERE id = $1",
          [userId]
        );
        const user = userRes.rows[0];
        if (!user) {
          await interaction.editReply("Account not found.");
          return;
        }
        const msgCountRes = await db.query<{ count: string }>(
          "SELECT COUNT(*) as count FROM conversation_messages WHERE session_id = $1",
          [sessionId]
        );
        const msgCount = Number(msgCountRes.rows[0]?.count ?? 0);

        const statusText = [
          `**Status:** ${user.status}`,
          `**Name:** ${user.name ?? "(not set)"}`,
          `**Language:** ${user.locale}`,
          `**Account created:** ${new Date(user.created_at).toLocaleDateString()}`,
          `**Current session messages:** ${msgCount}`,
        ].join("\n");
        await interaction.editReply(statusText);
      } catch (err) {
        log.error("Status command error", { error: err instanceof Error ? err.message : String(err) });
        await interaction.editReply(t("en", "error_retry"));
      }
      break;
    }

    default:
      await interaction.editReply("Unknown command.");
  }
}
