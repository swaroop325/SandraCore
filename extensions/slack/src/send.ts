import type { App } from "@slack/bolt";

let _app: App | null = null;

/** Register the Bolt App instance so sendSlack can use its web client. */
export function registerApp(a: App): void {
  _app = a;
}

function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxLen));
    i += maxLen;
  }
  return chunks;
}

/** Post text to a Slack channel, splitting at 3000 chars if needed. */
export async function sendSlack(channelId: string, text: string): Promise<void> {
  if (!_app) throw new Error("Slack app not registered — call registerApp() first");
  const chunks = chunkText(text, 3000);
  for (const chunk of chunks) {
    await _app.client.chat.postMessage({ channel: channelId, text: chunk });
  }
}
