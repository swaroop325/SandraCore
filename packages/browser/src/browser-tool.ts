import { createCDPClient, getPages } from "./cdp-client.js";
import { PageController } from "./page-controller.js";
import { createSubsystemLogger } from "@sandra/utils";

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
