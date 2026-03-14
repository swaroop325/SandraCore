import type { Server } from "http";
import { closeDB } from "@sandra/utils";
import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("api");

export function registerGracefulShutdown(server: Server): void {
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${signal} — starting graceful shutdown`);

    // Stop accepting new connections
    server.close(async (err) => {
      if (err) log.error("Error closing HTTP server", { error: err.message });
      else log.info("HTTP server closed");

      // Close DB pool
      try {
        await closeDB();
        log.info("Database pool closed");
      } catch (e) {
        log.error("Error closing DB pool", { error: e instanceof Error ? e.message : String(e) });
      }

      log.info("Shutdown complete");
      process.exit(0);
    });

    // Force exit after 15s if graceful shutdown stalls
    setTimeout(() => {
      log.warn("Graceful shutdown timed out after 15s — forcing exit");
      process.exit(1);
    }, 15_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("uncaughtException", (err) => {
    log.error("Uncaught exception", { error: err.message, stack: err.stack });
    shutdown("uncaughtException").catch(() => process.exit(1));
  });
  process.on("unhandledRejection", (reason) => {
    log.error("Unhandled rejection", { reason: String(reason) });
  });
}
