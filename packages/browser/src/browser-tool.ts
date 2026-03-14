import { createCDPClient, getPages } from "./cdp-client.js";
import { PageController } from "./page-controller.js";
import { createSubsystemLogger } from "@sandra/utils";

// ---------------------------------------------------------------------------
// SSRF protection — block requests to private/loopback/metadata IP ranges.
// ---------------------------------------------------------------------------
const SSRF_HOSTNAME_BLOCKLIST = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,           // 127.0.0.0/8 loopback
  /^10\.\d+\.\d+\.\d+$/,            // 10.0.0.0/8 private
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // 172.16.0.0/12 private
  /^192\.168\.\d+\.\d+$/,           // 192.168.0.0/16 private
  /^169\.254\.\d+\.\d+$/,           // 169.254.0.0/16 link-local / AWS metadata
  /^::1$/,                           // IPv6 loopback
  /^\[::1\]$/,
  /^fd[0-9a-f]{2}:/i,                // IPv6 ULA (fc00::/7)
];

function isSsrfBlocked(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return SSRF_HOSTNAME_BLOCKLIST.some((re) => re.test(hostname));
  } catch {
    // Unparseable URL — block it to be safe
    return true;
  }
}

const log = createSubsystemLogger("browser");

export type BrowserAction =
  | "navigate"
  | "click"
  | "type"
  | "screenshot"
  | "get_text"
  | "evaluate"
  | "scroll";

export interface BrowserToolInput {
  action: BrowserAction;
  url?: string;
  x?: number;
  y?: number;
  text?: string;
  expression?: string;
  deltaY?: number;
}

export interface BrowserToolResult {
  success: boolean;
  data?: string;
  error?: string;
}

let _controller: PageController | null = null;

async function getController(): Promise<PageController> {
  if (_controller) return _controller;

  const host = process.env["CHROME_HOST"] ?? "localhost";
  const port = Number(process.env["CHROME_PORT"] ?? 9222);

  const pages = await getPages(host, port);
  const page = pages.find((p) => p.url.startsWith("http")) ?? pages[0];
  if (!page?.webSocketDebuggerUrl) throw new Error("No Chrome pages available. Start Chrome with --remote-debugging-port=9222");

  const cdp = await createCDPClient(page.webSocketDebuggerUrl);
  _controller = new PageController(cdp);
  log.info("Browser connected", { url: page.url });
  return _controller;
}

export function resetBrowserController(): void { _controller = null; }

/**
 * Execute a browser action via CDP.
 * Used as an agent tool.
 */
export async function browserAction(input: BrowserToolInput): Promise<BrowserToolResult> {
  try {
    const controller = await getController();

    switch (input.action) {
      case "navigate": {
        if (!input.url) return { success: false, error: "url required" };
        if (isSsrfBlocked(input.url)) {
          return { success: false, error: "Navigation blocked: URL targets a private or restricted address" };
        }
        await controller.navigate(input.url);
        const info = await controller.getInfo();
        return { success: true, data: `Navigated to: ${info.title} (${info.url})` };
      }
      case "screenshot": {
        const shot = await controller.screenshot();
        return { success: true, data: shot.data };
      }
      case "get_text": {
        const text = await controller.getTextContent();
        return { success: true, data: text.slice(0, 8000) };
      }
      case "click": {
        const x = input.x ?? 0;
        const y = input.y ?? 0;
        await controller.click(x, y);
        return { success: true, data: `Clicked at (${x}, ${y})` };
      }
      case "type": {
        if (!input.text) return { success: false, error: "text required" };
        await controller.type(input.text);
        return { success: true, data: `Typed: ${input.text}` };
      }
      case "evaluate": {
        if (process.env["BROWSER_EVAL_ENABLED"] !== "1") {
          return { success: false, error: "browser evaluate is disabled" };
        }
        if (!input.expression) return { success: false, error: "expression required" };
        const result = await controller.evaluate(input.expression);
        return { success: true, data: String(result) };
      }
      case "scroll": {
        await controller.scroll(input.deltaY ?? 500);
        return { success: true, data: "Scrolled" };
      }
      default:
        return { success: false, error: `Unknown action: ${input.action}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
