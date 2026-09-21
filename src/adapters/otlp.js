import { normalizeMany } from "../normalize.js";

function anyValue(value) {
  if (!value || typeof value !== "object") return value;
  for (const key of ["stringValue", "intValue", "doubleValue", "boolValue", "bytesValue"]) if (key in value) return value[key];
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(anyValue);
  if (value.kvlistValue) return attributes(value.kvlistValue.values ?? []);
  return value;
}

function attributes(items = []) {
  return Object.fromEntries(items.map((item) => [item.key, anyValue(item.value)]));
}

function parseMessages(value) {
  if (typeof value === "string") {
    try { return parseMessages(JSON.parse(value)); } catch { return [{ role: "user", text: value }]; }
  }
  if (!Array.isArray(value)) return [];
  return value.map((message) => ({
    role: message.role ?? message.author ?? "user",
    text: message.content ?? message.text ?? message.message
  })).filter((message) => typeof message.text === "string" && message.text.trim());
}

function toIso(nanos) {
  if (nanos == null) return undefined;
  const millis = Number(BigInt(String(nanos)) / 1_000_000n);
  const date = new Date(millis);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function allSpans(document) {
  return (document.resourceSpans ?? []).flatMap((resourceSpan) => {
    const resource = attributes(resourceSpan.resource?.attributes);
    return (resourceSpan.scopeSpans ?? resourceSpan.instrumentationLibrarySpans ?? []).flatMap((scope) =>
      (scope.spans ?? []).map((span) => ({ span, resource, scope: scope.scope ?? scope.instrumentationLibrary }))
    );
  });
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function importOtlpTraces(input, options = {}) {
  const document = typeof input === "string" ? JSON.parse(input) : input;
  const groups = new Map();
  for (const item of allSpans(document)) {
    const traceId = item.span.traceId;
    if (!traceId) continue;
    if (!groups.has(traceId)) groups.set(traceId, []);
    groups.get(traceId).push(item);
  }
  const records = [...groups.entries()].map(([traceId, items]) => {
    const operations = [];
    const interactions = [];
    const commands = [];
    const filesRead = [];
    const filesChanged = [];
    const testsExecuted = [];
    const models = [];
    let inputTokens = 0; let outputTokens = 0; let totalCost = 0;
    let outcome;
    for (const item of items) {
      const attrs = attributes(item.span.attributes);
      operations.push({ name: item.span.name, spanId: item.span.spanId, attributes: attrs, status: item.span.status });
      const messages = parseMessages(attrs["gen_ai.input.messages"] ?? attrs["llm.prompts"] ?? attrs["gen_ai.prompt"]);
      interactions.push(...messages);
      const completion = parseMessages(attrs["gen_ai.output.messages"] ?? attrs["llm.completions"] ?? attrs["gen_ai.completion"]);
      interactions.push(...completion.map((message) => ({ ...message, role: message.role === "user" ? "assistant" : message.role })));
      const command = attrs["process.command_line"] ?? attrs["shell.command"] ?? attrs["tool.command"];
      if (command) commands.push(String(command));
      const file = attrs["code.file.path"] ?? attrs["file.path"];
      if (file && /read|grep|search/i.test(item.span.name)) filesRead.push(String(file));
      if (file && /write|edit|patch|create/i.test(item.span.name)) filesChanged.push(String(file));
      if (/test|lint|typecheck|build|validation/i.test(`${item.span.name} ${command ?? ""}`)) testsExecuted.push(String(command ?? item.span.name));
      const model = attrs["gen_ai.response.model"] ?? attrs["gen_ai.request.model"] ?? attrs["llm.model_name"];
      if (model) models.push(model);
      inputTokens += number(attrs["gen_ai.usage.input_tokens"] ?? attrs["llm.usage.prompt_tokens"]);
      outputTokens += number(attrs["gen_ai.usage.output_tokens"] ?? attrs["llm.usage.completion_tokens"]);
      totalCost += number(attrs["gen_ai.usage.cost"] ?? attrs["llm.usage.total_cost"]);
      if (attrs["agentoptimizer.outcome"]) outcome = attrs["agentoptimizer.outcome"];
      else if ([2, "2", "STATUS_CODE_ERROR"].includes(item.span.status?.code)) outcome = { status: "error", message: item.span.status.message };
    }
    const first = items[0];
    const firstAttrs = attributes(first.span.attributes);
    const resource = first.resource;
    const sessionId = firstAttrs["gen_ai.conversation.id"] ?? firstAttrs["session.id"] ?? firstAttrs["agentoptimizer.session.id"] ?? traceId;
    const prompts = interactions.filter((message) => ["user", "human"].includes(message.role)).map((message) => message.text);
    const costObserved = totalCost > 0 || items.some((item) => {
      const attrs = attributes(item.span.attributes);
      return "gen_ai.usage.cost" in attrs || "llm.usage.total_cost" in attrs;
    });
    return {
      id: `otlp:${traceId}`,
      tool: firstAttrs["gen_ai.system"] ?? resource["agent.name"] ?? resource["service.name"] ?? "otel-agent",
      session: String(sessionId),
      project: resource["project.name"] ?? resource["service.namespace"] ?? resource["service.name"],
      task: prompts[0], prompts, interactions, commands,
      filesRead: [...new Set(filesRead)], filesChanged: [...new Set(filesChanged)],
      testsExecuted: [...new Set(testsExecuted)], validation: [...new Set(testsExecuted)],
      operations,
      result: outcome,
      model: [...new Set(models)].length === 1 ? models[0] : [...new Set(models)],
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      cost: costObserved ? { amount: totalCost, currency: "USD" } : undefined,
      timestamp: toIso(items.map((item) => item.span.startTimeUnixNano).filter(Boolean).reduce((minimum, value) => minimum == null || BigInt(String(value)) < BigInt(String(minimum)) ? value : minimum, null)),
      observability: {
        context: "unavailable", specArtifacts: "unavailable",
        ...(!prompts.length ? { prompts: "unavailable", interactions: "unavailable", task: "unavailable" } : {}),
        ...(!commands.length ? { commands: "unavailable" } : {}),
        ...(!filesRead.length ? { filesRead: "unavailable" } : {}),
        ...(!filesChanged.length ? { filesChanged: "unavailable" } : {}),
        ...(!testsExecuted.length ? { testsExecuted: "unavailable", validation: "unavailable" } : {}),
        ...(!models.length ? { model: "unavailable" } : {}),
        ...(!outcome ? { result: "unknown" } : {}),
        ...(!costObserved ? { cost: "unavailable" } : {})
      },
      evidence: items.map((item) => ({ type: "otlp-span", location: `trace:${traceId}/span:${item.span.spanId}`, spanName: item.span.name }))
    };
  });
  return normalizeMany(records, {
    source: options.source ?? "otlp",
    format: "otlp-json-traces",
    limitations: {
      context: "OTLP spans expose only instrumented context attributes.",
      specArtifacts: "Specification use requires explicit instrumentation.",
      cost: "No cost attribute was observed in this trace.",
      result: "No outcome or error status was observed in this trace."
    }
  });
}
