import { normalizeMany } from "../normalize.js";

function parse(input) { return typeof input === "string" ? JSON.parse(input) : input; }
function array(value) { return Array.isArray(value) ? value : value == null ? [] : [value]; }

function unavailableActivity() {
  return {
    task: "unavailable", prompts: "unavailable", context: "unavailable", commands: "unavailable",
    filesRead: "unavailable", filesChanged: "unavailable", testsExecuted: "unavailable",
    result: "unavailable", interactions: "unavailable", specArtifacts: "unavailable",
    validation: "unavailable", operations: "unavailable"
  };
}

function ccusageRows(document) {
  if (Array.isArray(document.session)) return document.session;
  if (Array.isArray(document.sessions)) return document.sessions;
  if (document.type === "session" && Array.isArray(document.data)) return document.data;
  if (Array.isArray(document.data) && document.data.some((row) => row.session)) return document.data;
  if (document.projects && typeof document.projects === "object") {
    return Object.entries(document.projects).flatMap(([project, rows]) => array(rows).map((row) => ({ ...row, project })));
  }
  const periodRows = document.daily ?? document.weekly ?? document.monthly ?? document.data;
  return array(periodRows ?? document.totals ?? document.summary).map((row, index) => ({ ...row, aggregateIndex: index }));
}

export function importCcusage(input, options = {}) {
  const document = parse(input);
  const records = ccusageRows(document).map((row, index) => {
    const sessionId = row.session ?? row.sessionId ?? row.period;
    const agent = row.agent === "claude" ? "claude-code" : row.agent;
    const costValue = row.costUSD ?? row.totalCost ?? row.cost;
    const models = array(row.models ?? row.modelsUsed ?? array(row.modelBreakdowns).map((item) => item.modelName).filter(Boolean));
    return {
      id: `ccusage:${sessionId ?? row.date ?? row.month ?? index + 1}`,
      tool: agent ?? options.tool ?? "unknown",
      session: sessionId,
      project: row.project ?? row.projectPath ?? row.metadata?.project,
      timestamp: row.lastActivity ?? row.metadata?.lastActivity ?? row.firstActivity ?? row.date ?? row.month,
      model: models.length === 1 ? models[0] : models,
      usage: {
        inputTokens: row.inputTokens ?? row.totalInputTokens,
        outputTokens: row.outputTokens ?? row.totalOutputTokens,
        cacheCreationTokens: row.cacheCreationTokens,
        cacheReadTokens: row.cacheReadTokens,
        reasoningOutputTokens: row.reasoningOutputTokens ?? row.metadata?.reasoningOutputTokens,
        totalTokens: row.totalTokens,
        modelBreakdowns: row.modelBreakdowns
      },
      cost: costValue == null ? undefined : { amount: costValue, currency: "USD", pricingUnknown: Boolean(row.missingPricing) },
      observability: { ...unavailableActivity(), ...(costValue == null ? { cost: "unavailable" } : {}) },
      evidence: [{ type: "ccusage-json", location: `row:${index + 1}`, reportType: document.type ?? "unified" }]
    };
  });
  return normalizeMany(records, {
    source: options.source ?? "ccusage",
    format: "ccusage-json",
    limitations: {
      prompts: "ccusage reports usage and cost, not prompt text.",
      cost: "The selected ccusage output omitted cost data.",
      interactions: "ccusage aggregate output is not a transcript."
    }
  });
}

function howIPromptConversations(document) {
  return document.conversations ?? document.sessions ?? document.data?.conversations ?? document.data?.sessions;
}

export function importHowIPrompt(input, options = {}) {
  const document = parse(input);
  const conversations = howIPromptConversations(document);
  if (!Array.isArray(conversations)) {
    return normalizeMany([{
      id: "howiprompt:metrics",
      tool: "multi-agent",
      promptAnalytics: document,
      timestamp: document.generatedAt ?? document.updatedAt,
      observability: { ...unavailableActivity(), model: "unavailable", cost: "unavailable" },
      evidence: [{ type: "howiprompt-metrics", location: "metrics.json" }]
    }], { source: options.source ?? "howiprompt", format: "howiprompt-metrics-json" });
  }
  const records = conversations.map((conversation, index) => {
    const messages = conversation.messages ?? conversation.turns ?? [];
    const interactions = messages.map((message) => ({
      role: message.role ?? message.author,
      text: message.content ?? message.text ?? message.message,
      timestamp: message.timestamp
    })).filter((message) => typeof message.text === "string" && message.text.trim());
    const prompts = interactions.filter((message) => ["user", "human"].includes(message.role)).map((message) => message.text);
    return {
      id: `howiprompt:${conversation.id ?? conversation.sessionId ?? index + 1}`,
      tool: conversation.source ?? conversation.tool ?? "unknown",
      session: String(conversation.id ?? conversation.sessionId ?? index + 1),
      project: conversation.project ?? conversation.cwd,
      task: prompts[0], prompts, interactions,
      model: conversation.model,
      timestamp: conversation.startedAt ?? conversation.createdAt ?? interactions[0]?.timestamp,
      promptAnalytics: conversation.metrics ?? conversation.analytics,
      observability: {
        context: "unavailable", commands: "unavailable", filesRead: "unavailable", filesChanged: "unavailable",
        testsExecuted: "unavailable", result: "unavailable", cost: "unavailable", specArtifacts: "unavailable",
        validation: "unavailable", operations: "unavailable"
      },
      evidence: [{ type: "howiprompt-conversation", location: `conversation:${conversation.id ?? index + 1}` }]
    };
  });
  return normalizeMany(records, { source: options.source ?? "howiprompt", format: "howiprompt-message-export-json" });
}

function skillRows(document) {
  if (Array.isArray(document)) return document;
  return document.skills ?? document.data ?? document.rows ?? [];
}

export function importSkillusage(input, options = {}) {
  const document = parse(input);
  const rows = skillRows(document);
  const byProject = new Map();
  for (const row of rows) {
    const projects = row.projects && typeof row.projects === "object" ? Object.entries(row.projects) : [["all", row.total ?? row.count ?? 0]];
    for (const [project, count] of projects) {
      if (!byProject.has(project)) byProject.set(project, []);
      byProject.get(project).push({
        skill: row.skill ?? row.name,
        total: typeof count === "number" ? count : count?.total ?? row.total,
        manual: row.manual,
        auto: row.auto ?? row.automatic,
        inferred: row.inferred,
        daily: row.daily,
        sources: row.sources,
        aliases: row.aliases
      });
    }
  }
  const records = [...byProject.entries()].map(([project, skills]) => ({
    id: `skillusage:${project}`,
    tool: options.tool ?? "multi-agent",
    project,
    skillUsage: skills,
    automationEvidence: skills.filter((item) => typeof item.auto === "number").map((item) => ({ pattern: item.skill, automated: item.auto > 0 })),
    timestamp: document.generatedAt,
    observability: { ...unavailableActivity(), model: "unavailable", cost: "unavailable" },
    evidence: [{ type: "skillusage-json", location: `project:${project}` }]
  }));
  return normalizeMany(records, {
    source: options.source ?? "skillusage",
    format: "skillusage-json",
    limitations: { interactions: "skillusage reports deduplicated invocation counts, not full transcripts." }
  });
}
