import { normalizeMany } from "../normalize.js";

function anyValue(value) {
  if (!value || typeof value !== "object") return value;
  for (const key of ["stringValue", "intValue", "doubleValue", "boolValue"]) if (key in value) return value[key];
  return value;
}

function attributes(items = []) {
  return Object.fromEntries(items.map((item) => [item.key, anyValue(item.value)]));
}

function toIso(nanos) {
  if (nanos == null) return undefined;
  const millis = Number(BigInt(String(nanos)) / 1_000_000n);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : undefined;
}

function recordFor(groups, attrs, resource, evidence, timestamp, body, metric) {
  const session = attrs["cursor.conversation.id"];
  if (!session) return;
  const key = String(session);
  if (!groups.has(key)) groups.set(key, { session: key, resource, events: [], usage: {}, cost: undefined, automationEvidence: [], timestamps: [] });
  const group = groups.get(key);
  if (timestamp) group.timestamps.push(timestamp);
  const text = [body, metric, attrs["cursor.event.name"], attrs["event.name"]].filter((value) => typeof value === "string").join(" ");
  group.events.push({ text, attributes: attrs, evidence });
  const numeric = (names) => names.map((name) => Number(attrs[name])).find(Number.isFinite);
  const input = numeric(["cursor.token.usage.input", "cursor.token.usage.prompt", "gen_ai.usage.input_tokens"]);
  const output = numeric(["cursor.token.usage.output", "cursor.token.usage.completion", "gen_ai.usage.output_tokens"]);
  const cost = numeric(["cursor.cost.usage", "gen_ai.usage.cost"]);
  if (input != null) group.usage.inputTokens = (group.usage.inputTokens ?? 0) + input;
  if (output != null) group.usage.outputTokens = (group.usage.outputTokens ?? 0) + output;
  if (cost != null) group.cost = (group.cost ?? 0) + cost;
  const metricValue = metric == null ? undefined : Number(attrs[`cursor.metric.${metric}`]);
  if (Number.isFinite(metricValue)) {
    if (/cost/i.test(metric)) group.cost = (group.cost ?? 0) + metricValue;
    else if (/token/i.test(metric) && /(?:input|prompt)/i.test(metric)) group.usage.inputTokens = (group.usage.inputTokens ?? 0) + metricValue;
    else if (/token/i.test(metric) && /(?:output|completion)/i.test(metric)) group.usage.outputTokens = (group.usage.outputTokens ?? 0) + metricValue;
    else if (/token/i.test(metric)) group.usage.totalTokens = (group.usage.totalTokens ?? 0) + metricValue;
  }
  if (attrs["skill.activated"] || attrs["hook.execution_complete"]) group.automationEvidence.push({ pattern: String(attrs["cursor.workflow.pattern"] ?? "cursor-workflow"), automated: true });
}

export function importCursorOtlp(input, options = {}) {
  const document = typeof input === "string" ? JSON.parse(input) : input;
  const groups = new Map();
  for (const resourceLog of document.resourceLogs ?? []) {
    const resource = attributes(resourceLog.resource?.attributes);
    for (const scope of resourceLog.scopeLogs ?? resourceLog.instrumentationLibraryLogs ?? []) for (const log of scope.logRecords ?? []) {
      const attrs = { ...resource, ...attributes(log.attributes) };
      const body = anyValue(log.body);
      recordFor(groups, attrs, resource, { type: "cursor-otlp-log", location: `conversation:${attrs["cursor.conversation.id"] ?? "unknown"}` }, toIso(log.timeUnixNano ?? log.observedTimeUnixNano), typeof body === "string" ? body : undefined);
    }
  }
  for (const resourceMetric of document.resourceMetrics ?? []) {
    const resource = attributes(resourceMetric.resource?.attributes);
    for (const scope of resourceMetric.scopeMetrics ?? resourceMetric.instrumentationLibraryMetrics ?? []) for (const metric of scope.metrics ?? []) {
      const points = metric.sum?.dataPoints ?? metric.gauge?.dataPoints ?? metric.histogram?.dataPoints ?? [];
      for (const point of points) {
        const attrs = { ...resource, ...attributes(point.attributes) };
        const value = point.asDouble ?? point.asInt ?? point.sum;
        if (value != null) attrs[`cursor.metric.${metric.name}`] = value;
        recordFor(groups, attrs, resource, { type: "cursor-otlp-metric", location: `conversation:${attrs["cursor.conversation.id"] ?? "unknown"}/metric:${metric.name}` }, toIso(point.timeUnixNano), undefined, metric.name);
      }
    }
  }
  return normalizeMany([...groups.values()].map((group) => {
    const interactions = group.events.filter((event) => event.text).map((event) => ({ role: "unknown", text: event.text }));
    const usage = Object.keys(group.usage).length ? { ...group.usage, totalTokens: group.usage.totalTokens ?? (group.usage.inputTokens ?? 0) + (group.usage.outputTokens ?? 0) } : undefined;
    return {
      id: `cursor-otel:${group.session}`, tool: "cursor", session: group.session,
      project: group.resource["project.name"] ?? group.resource["service.name"], interactions,
      operations: group.events.map((event) => ({ name: "cursor-otel", attributes: event.attributes })), usage,
      cost: group.cost == null ? undefined : { amount: group.cost, currency: "USD" },
      automationEvidence: group.automationEvidence, timestamp: group.timestamps.sort()[0],
      observability: { context: "unavailable", prompts: "unavailable", task: "unavailable", commands: "unavailable", filesRead: "unavailable", filesChanged: "unavailable", testsExecuted: "unavailable", validation: "unavailable", result: "unknown", specArtifacts: "unavailable", model: "unavailable", ...(usage ? {} : { usage: "unavailable" }), ...(group.cost == null ? { cost: "unavailable" } : {}) },
      evidence: group.events.flatMap((event) => event.evidence)
    };
  }), { source: options.source ?? "cursor", format: "cursor-otlp-logs-metrics", limitations: { context: "Cursor OTLP logs and metrics do not provide complete model context.", prompts: "Cursor OTLP does not provide transcript prompts.", commands: "Cursor OTLP logs and metrics do not prove command execution.", filesRead: "Cursor OTLP logs and metrics do not prove file reads.", filesChanged: "Cursor OTLP logs and metrics do not prove file changes.", testsExecuted: "Cursor OTLP logs and metrics do not prove validation execution.", result: "No outcome is inferred from Cursor OTLP logs or metrics." } });
}
