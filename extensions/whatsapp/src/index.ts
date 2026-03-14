import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  type WAMessage,
  type WASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { createSubsystemLogger, db, auditLog } from "@sandra/utils";
import { handleMessage } from "@sandra/agent";

const log = createSubsystemLogger("whatsapp");

let _sock: WASocket | null = null;

function getJid(jid: string): string {
  return jid.replace(/:[0-9]+@/, "@");
}

function getPhone(jid: string): string {
  return jid.replace(/@.+$/, "");
}

async function upsertUserByPhone(phone: string): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO users (phone, status) VALUES ($1, 'pending')
     ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
     RETURNING id`,
    [phone]
  );
  return res.rows[0]!.id;
}

async function isApproved(userId: string): Promise<boolean> {
  const res = await db.query<{ status: string }>(
    `SELECT status FROM users WHERE id = $1`,
    [userId]
  );
  return res.rows[0]?.status === "approved";
}

export async function startWhatsApp(): Promise<void> {
  const authDir = process.env["WA_AUTH_DIR"] ?? "./wa-auth";
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, log as any),
    },
    printQRInTerminal: true,
    logger: { level: "silent", child: () => ({ level: "silent" }) } as any,
    generateHighQualityLinkPreview: false,
  });

  _sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update: { connection?: string; lastDisconnect?: { error?: unknown }; qr?: string }) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) log.info("Scan this QR code with WhatsApp", { qr });
    if (connection === "close") {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      log.warn("Connection closed", { code, reconnect: shouldReconnect });
      if (shouldReconnect) {
        setTimeout(() => startWhatsApp(), 5000);
      }
    } else if (connection === "open") {
      log.info("WhatsApp connected");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }: { messages: WAMessage[]; type: string }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      await handleIncomingMessage(msg);
    }
  });
}

async function handleIncomingMessage(msg: WAMessage): Promise<void> {
  if (!msg.message) return;
  if (msg.key.fromMe) return; // skip self-sent messages

  const jid = msg.key.remoteJid;
  if (!jid) return;

  // Only handle DMs (not group chats)
  if (jid.includes("@g.us")) {
    log.debug("Skipping group message", { jid });
    return;
  }

  const normalizedJid = getJid(jid);
  const phone = getPhone(normalizedJid);

  const text =
    msg.message.conversation ??
    msg.message.extendedTextMessage?.text ??
    msg.message.ephemeralMessage?.message?.conversation;

  if (!text) return;

  try {
    const userId = await upsertUserByPhone(phone);
    const approved = await isApproved(userId);

    if (!approved) {
      void auditLog({ action: "auth.failure", channel: "whatsapp", details: { phone } });
      await sendWhatsApp(normalizedJid, "You are not yet approved to use this assistant. Contact the administrator.");
      return;
    }

    const sessionId = `wa:${normalizedJid}`;
    void auditLog({ action: "message.received", userId, channel: "whatsapp" });
    const response = await handleMessage({
      id: crypto.randomUUID(),
      text,
      userId,
      sessionId,
      channel: "whatsapp",
      locale: "en",
      timestamp: Date.now(),
    });

    if (response.reply) {
      await sendWhatsApp(normalizedJid, response.reply);
    }
  } catch (err) {
    log.error("Error handling WhatsApp message", {
      error: err instanceof Error ? err.message : String(err),
      phone,
    });
  }
}

export async function sendWhatsApp(jid: string, text: string): Promise<void> {
  if (!_sock) throw new Error("WhatsApp socket not initialized");
  await _sock.sendMessage(jid, { text });
}

export function getSocket(): WASocket | null {
  return _sock;
}
