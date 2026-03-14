import type { WASocket } from "@whiskeysockets/baileys";

export type MessageKey = {
  id?: string;
  remoteJid?: string;
  fromMe?: boolean;
};

/** Mark a message as read. */
export async function markMessageRead(
  sock: WASocket,
  jid: string,
  messageKey: MessageKey
): Promise<void> {
  await sock.readMessages([
    {
      ...(messageKey.id !== undefined ? { id: messageKey.id } : {}),
      ...(messageKey.remoteJid !== undefined ? { remoteJid: messageKey.remoteJid } : {}),
      ...(messageKey.fromMe !== undefined ? { fromMe: messageKey.fromMe } : {}),
    },
  ]);
}

/** Send a reaction emoji to a message. */
export async function sendReaction(
  sock: WASocket,
  jid: string,
  messageKey: MessageKey,
  emoji: string
): Promise<void> {
  await sock.sendMessage(jid, {
    react: {
      text: emoji,
      key: {
        ...(messageKey.id !== undefined ? { id: messageKey.id } : {}),
        ...(messageKey.remoteJid !== undefined ? { remoteJid: messageKey.remoteJid } : {}),
        ...(messageKey.fromMe !== undefined ? { fromMe: messageKey.fromMe } : {}),
      },
    },
  });
}

/** Delete a message for everyone in the chat. */
export async function deleteMessageForEveryone(
  sock: WASocket,
  jid: string,
  messageKey: MessageKey
): Promise<void> {
  await sock.sendMessage(jid, {
    delete: {
      ...(messageKey.id !== undefined ? { id: messageKey.id } : {}),
      ...(messageKey.remoteJid !== undefined ? { remoteJid: messageKey.remoteJid } : {}),
      ...(messageKey.fromMe !== undefined ? { fromMe: messageKey.fromMe } : {}),
    },
  });
}
