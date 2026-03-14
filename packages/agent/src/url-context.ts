import { extractUrls, webFetch } from "@sandra/tools";
import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("agent");

/** Max chars of fetched content to inject as context */
const MAX_CONTENT_CHARS = 3000;

/**
 * If the message contains URLs, fetch the first one and return a
 * context string to prepend to the user message. Returns null if
 * no URLs found or fetch fails.
 */
export async function buildUrlContext(text: string): Promise<string | null> {
  try {
    const urls = extractUrls(text);
    if (urls.length === 0) return null;

    const url = urls[0]!;
    const result = await webFetch(url);

    if (!result.success || !result.text) return null;

    const trimmedContent = result.text.slice(0, MAX_CONTENT_CHARS);

    return `[Context from ${url}]\n${trimmedContent}\n[End context]`;
  } catch (err: unknown) {
    log.warn("buildUrlContext failed", { err });
    return null;
  }
}
