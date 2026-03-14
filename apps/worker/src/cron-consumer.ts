import { loadSecrets, createSubsystemLogger } from "@sandra/utils";
import { initOtel } from "@sandra/otel";
import { createScheduler, createDbCronStore, createAgentExecutor } from "@sandra/cron";
import { registerWorkerShutdown } from "./graceful-shutdown.js";

const log = createSubsystemLogger("cron-consumer");

await loadSecrets();
initOtel("sandra-cron-worker");
registerWorkerShutdown();

const store = createDbCronStore();
const executor = createAgentExecutor();

const scheduler = createScheduler({
  store,
  executor,
  pollIntervalMs: 30_000, // check every 30 seconds
});

scheduler.start();
log.info("Cron consumer started");

// Keep process alive — scheduler runs via setInterval
process.on("SIGTERM", () => {
  scheduler.stop();
  log.info("Cron consumer stopped");
  process.exit(0);
});
