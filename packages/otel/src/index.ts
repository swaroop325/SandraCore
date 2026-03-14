import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { trace as apiTrace, context, SpanStatusCode, type Span, metrics as apiMetrics } from "@opentelemetry/api";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

export function initOtel(serviceName: string): void {
  const endpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  if (!endpoint) return; // no-op if not configured

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      exportIntervalMillis: 30_000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false }, // too noisy
      }),
    ],
    serviceName,
  });
  sdk.start();
}

const tracer = apiTrace.getTracer("sandra");

export async function trace<T>(
  name: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const span = tracer.startSpan(name);
  return context.with(apiTrace.setSpan(context.active(), span), async () => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
      throw err;
    } finally {
      span.end();
    }
  });
}

const _meter = apiMetrics.getMeter("sandra");

export const metrics = {
  /** Increment message counter */
  messageCount: _meter.createCounter("sandra.messages.total", {
    description: "Total messages processed",
  }),
  /** Record message processing latency (ms) */
  messageLatency: _meter.createHistogram("sandra.messages.latency_ms", {
    description: "Message processing latency in milliseconds",
    unit: "ms",
  }),
  /** Increment error counter */
  errorCount: _meter.createCounter("sandra.errors.total", {
    description: "Total errors encountered",
  }),
  /** Token usage histogram */
  tokenUsage: _meter.createHistogram("sandra.llm.tokens", {
    description: "LLM token usage per call",
    unit: "tokens",
  }),
  /** Reminder delivery counter */
  reminderCount: _meter.createCounter("sandra.reminders.total", {
    description: "Total reminders delivered",
  }),
};
