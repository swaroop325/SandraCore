import type { CDPClient } from "./cdp-client.js";

export interface ClickOptions {
  /** Wait for navigation after click (ms). Default 0 = don't wait */
  waitForNavMs?: number;
}

export interface ScreenshotResult {
  /** Base64-encoded PNG */
  data: string;
  width: number;
  height: number;
}

export interface PageInfo {
  url: string;
  title: string;
}

/**
 * High-level browser page controller.
 * Wraps CDP commands into ergonomic methods.
 */
export class PageController {
  constructor(private readonly cdp: CDPClient) {}

  /** Navigate to a URL and wait for load */
  async navigate(url: string): Promise<void> {
    await this.cdp.send("Page.enable");
    await this.cdp.send("Page.navigate", { url });
    await this.waitForLoad();
  }

  private waitForLoad(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 5_000); // max wait 5s
      this.cdp.on("Page.loadEventFired", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /** Get current URL and title */
  async getInfo(): Promise<PageInfo> {
    const result = await this.cdp.send<{ result: { value: string } }>(
      "Runtime.evaluate",
      { expression: "JSON.stringify({url: location.href, title: document.title})", returnByValue: true }
    );
    return JSON.parse(result.result.value) as PageInfo;
  }

  /** Take a screenshot. Returns base64 PNG. */
  async screenshot(): Promise<ScreenshotResult> {
    const result = await this.cdp.send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    // Get viewport size
    const layout = await this.cdp.send<{ layoutViewport: { clientWidth: number; clientHeight: number } }>(
      "Page.getLayoutMetrics"
    );
    return {
      data: result.data,
      width: layout.layoutViewport.clientWidth,
      height: layout.layoutViewport.clientHeight,
    };
  }

  /** Click at (x, y) coordinates */
  async click(x: number, y: number, options: ClickOptions = {}): Promise<void> {
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    if (options.waitForNavMs && options.waitForNavMs > 0) {
      await new Promise((r) => setTimeout(r, options.waitForNavMs));
    }
  }

  /** Type text at current focus */
  async type(text: string): Promise<void> {
    for (const char of text) {
      await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", text: char });
      await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", text: char });
    }
  }

  /** Evaluate JavaScript and return the result */
  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.cdp.send<{ result: { value: T; type: string }; exceptionDetails?: { text: string } }>(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true }
    );
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }

  /** Get the full page text content */
  async getTextContent(): Promise<string> {
    return this.evaluate<string>("document.body?.innerText ?? ''");
  }

  /** Scroll the page */
  async scroll(deltaY: number): Promise<void> {
    await this.cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 0,
      y: 0,
      deltaX: 0,
      deltaY,
    });
  }
}
