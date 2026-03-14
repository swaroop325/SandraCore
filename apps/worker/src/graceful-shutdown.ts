import { closeDB } from "@sandra/utils";
import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("worker");

export function registerWorkerShutdown(): void {
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${signal} — worker shutting down`);

    try {
      await closeDB();
      log.info("Database pool closed");
    } catch (e) {
      log.error("Error closing DB pool", { error: e instanceof Error ? e.message : String(e) });
    }

    process.exit(0);
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
