import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("tools");

export interface LinkPreviewResult {
  url: string;
  title: string;
  description: string;
  image?: string;
  fetchedAt: string;
}

const BLOCKED_HOSTS = new Set([
  "localhost", "127.0.0.1", "0.0.0.0", "::1",
  "169.254.169.254", "metadata.google.internal",
]);

function isBlockedUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    const host = u.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host)) return true;
    const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const [, a, b] = ipv4.map(Number) as [unknown, number, number];
      if (a === 10 || a === 127) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 169 && b === 254) return true;
    }
    return false;
  } catch { return true; }
}

function extractMeta(html: string): { title: string; description: string; image: string } {
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
  const metaTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "";
  const title = (ogTitle || metaTitle).trim().slice(0, 200);

  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
  const description = (ogDesc || metaDesc).trim().slice(0, 500);

  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";

  return { title, description, image: ogImage };
}

/**
 * Fetch a URL and extract its link preview metadata (title, description, og:image).
 */
export async function getLinkPreview(url: string): Promise<LinkPreviewResult> {
  if (isBlockedUrl(url)) throw new Error(`URL not allowed: ${url}`);

  log.debug("Fetching link preview", { url });

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "SandraBot/1.0 (link preview)" },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    return { url, title: url, description: "", fetchedAt: new Date().toISOString() };
  }

  const html = await response.text();
  const { title, description, image } = extractMeta(html);

  const result: LinkPreviewResult = {
    url,
    title: title || url,
    description,
    fetchedAt: new Date().toISOString(),
  };
  if (image) result.image = image;
  return result;
}

/** Extract all URLs from a text string */
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^[\]`]+/g;
  return [...new Set(text.match(urlRegex) ?? [])];
}
