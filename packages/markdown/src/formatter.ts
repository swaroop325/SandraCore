export type Channel = "telegram" | "whatsapp" | "discord" | "api" | "web";

export interface FormatOptions {
  channel: Channel;
  /** Max message length before splitting. Default: 0 (no split) */
  maxLength?: number;
}

/**
 * Format markdown text for a specific channel.
 * - telegram: supports *bold*, _italic_, `code`, ```blocks```, [links](url)
 * - whatsapp: *bold*, _italic_, ~strikethrough~, ```monospace``` — NO links embedded
 * - discord: **bold**, *italic*, `code`, ```blocks```, [links](url), > blockquotes
 * - api/web: pass-through (full markdown)
 */
export function formatForChannel(text: string, options: FormatOptions): string {
  const { channel } = options;
  switch (channel) {
    case "telegram": return formatTelegram(text);
    case "whatsapp": return formatWhatsApp(text);
    case "discord":  return formatDiscord(text);
    default:         return text;
  }
}

/** Split text into chunks at maxLength, preferring paragraph/sentence breaks */
export function splitIntoChunks(text: string, maxLength: number): string[] {
  if (maxLength <= 0 || text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    // Try to split at paragraph break
    let splitAt = remaining.lastIndexOf("\n\n", maxLength);
    if (splitAt < maxLength * 0.5) {
      // Try sentence break
      splitAt = remaining.lastIndexOf(". ", maxLength);
    }
    if (splitAt < maxLength * 0.3) {
      // Hard split — splitAt - 1 so slice(0, splitAt + 1) = exactly maxLength chars
      splitAt = maxLength - 1;
    }
    chunks.push(remaining.slice(0, splitAt + 1).trimEnd());
    remaining = remaining.slice(splitAt + 1).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks.filter(Boolean);
}

function formatTelegram(text: string): string {
  // Telegram HTML mode: convert markdown to plain with Telegram-supported formatting
  // Telegram supports: *bold* -> <b>, _italic_ -> <i>, `code` -> <code>, ```block``` -> <pre>
  // But we use MarkdownV2 escape approach: keep as-is, just fix unsupported syntax
  return text
    .replace(/^#{1,6}\s+/gm, "*")        // headings → bold prefix
    .replace(/\*\*(.+?)\*\*/g, "*$1*")   // **bold** → *bold*
    .replace(/~~(.+?)~~/g, "~$1~")       // strikethrough keep
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)"); // flatten links to text (url)
}

function formatWhatsApp(text: string): string {
  return text
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")   // headings → bold
    .replace(/\*\*(.+?)\*\*/g, "*$1*")       // **bold** → *bold*
    .replace(/__(.+?)__/g, "_$1_")           // __italic__ → _italic_
    .replace(/~~(.+?)~~/g, "~$1~")           // strikethrough
    .replace(/`{3}[\w]*\n?([\s\S]*?)`{3}/g, "```$1```") // code blocks keep
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1"); // strip links (WhatsApp can't render)
}

function formatDiscord(text: string): string {
  return text
    .replace(/^#{1,6}\s+(.+)$/gm, "**$1**")  // headings → bold
    .replace(/\*\*(.+?)\*\*/g, "**$1**")      // keep bold
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "*$1*") // keep italic
    .replace(/`{3}[\w]*\n?([\s\S]*?)`{3}/g, "```$1```")      // keep code blocks
    .replace(/^>\s/gm, "> ");                  // keep blockquotes
}
