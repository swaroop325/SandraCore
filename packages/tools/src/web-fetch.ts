export interface WebFetchResult {
  success: boolean;
  url?: string;
  title?: string;
  text?: string;
  fetchedAt?: string;
  error?: string;
}

/**
 * Block URLs that target private/loopback/link-local addresses or
 * non-http/https protocols (SSRF protection).
 * Returns a string describing why the URL is blocked, or null if it is allowed.
 */
function isBlockedUrl(urlStr: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return "Invalid URL";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `Protocol ${parsed.protocol} not allowed`;
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  // Block localhost variants
  if (hostname === "localhost" || hostname === "0.0.0.0" || hostname === "::1") {
    return "Access to localhost is not allowed";
  }
  // Parse as IPv4
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b, c] = ipv4.map(Number) as [unknown, number, number, number];
    if (a === 127) return "Access to loopback is not allowed";
    if (a === 10) return "Access to private network is not allowed";
    if (a === 172 && b >= 16 && b <= 31) return "Access to private network is not allowed";
    if (a === 192 && b === 168) return "Access to private network is not allowed";
    if (a === 169 && b === 254) return "Access to link-local (metadata) is not allowed";
    if (a === 0) return "Access to 0.0.0.0 is not allowed";
  }
  // Block cloud metadata endpoints
  if (
    hostname === "metadata.google.internal" ||
    hostname === "169.254.169.254" ||
    hostname.endsWith(".internal")
  ) {
    return "Access to cloud metadata endpoints is not allowed";
  }
  return null;
}

/**
 * Fetch a URL and return its readable text content.
 * Strips HTML tags, collapses whitespace.
 * Returns a result object — never throws for expected error conditions.
 */
export async function webFetch(url: string): Promise<WebFetchResult> {
  const blockReason = isBlockedUrl(url);
  if (blockReason) {
    return { success: false, error: blockReason };
  }

  const key = process.env["PERPLEXITY_API_KEY"];
  if (!key) {
    return { success: false, error: "PERPLEXITY_API_KEY not set — cannot fetch URLs" };
  }

  // Safe to parse again — isBlockedUrl already validated it
  const parsed = new URL(url);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "Sandra-AI/1.0 (personal assistant)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Fetch failed: ${message}` };
  }

  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status} fetching ${url}` };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/")) {
    return { success: false, error: `URL returned non-text content type: ${contentType}` };
  }

  const html = await res.text();
  const text = extractReadableText(html).slice(0, 8000);
  const title = extractTitle(html) ?? parsed.hostname;
  const fetchedAt = new Date().toISOString();

  return { success: true, url, title, text, fetchedAt };
}

function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return match?.[1]?.trim() ?? null;
}

function extractReadableText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}
