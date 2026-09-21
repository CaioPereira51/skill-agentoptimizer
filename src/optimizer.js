import { RuleEngine } from "./rules/engine.js";
import { promptQualityRule } from "./rules/prompt-quality.js";
import { contextRule } from "./rules/context.js";
import { taskDecompositionRule } from "./rules/task-decomposition.js";
import { specDisciplineRule, validationRule } from "./rules/spec-validation.js";
import { agentEfficiencyRule, reworkRule } from "./rules/rework-agent.js";
import { classifyAll } from "./rework.js";
import { detectPatterns, automationOpportunities } from "./patterns.js";
import { calculateMetrics } from "./metrics.js";
import { diagnose } from "./diagnostics.js";
import { buildRecommendations } from "./recommendations.js";
import { renderMarkdown } from "./report.js";
import { analyzeTrends } from "./trends.js";

const defaultRules = [promptQualityRule, contextRule, taskDecompositionRule, specDisciplineRule, validationRule, reworkRule, agentEfficiencyRule];

function limitationSummary(sessions) {
  const counts = new Map();
  for (const session of sessions) for (const [field, value] of Object.entries(session.fields)) {
    if (value.status === "known") continue;
    const key = `${field}: ${value.status}${value.reason ? ` (${value.reason})` : ""}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([text, count]) => `${text} in ${count}/${sessions.length} session(s)`);
}

function auditPeriod(sessions) {
  const values = sessions.map((session) => session.fields.timestamp).filter((field) => field.status === "known").map((field) => new Date(field.value)).filter((date) => !Number.isNaN(date.valueOf())).sort((a, b) => a - b);
  return { start: values[0]?.toISOString() ?? null, end: values.at(-1)?.toISOString() ?? null };
}

function prioritizeByRecurrence(findings) {
  const counts = new Map();
  for (const finding of findings) {
    const key = `${finding.ruleId}:${finding.title}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return findings.map((finding) => {
    const recurrence = counts.get(`${finding.ruleId}:${finding.title}`);
    if (recurrence >= 3 && ["LOW", "MEDIUM"].includes(finding.priority)) return { ...finding, priority: "HIGH", recurrence };
    return { ...finding, recurrence };
  });
}

export class AgentOptimizer {
  constructor({ rules = defaultRules, clock = () => new Date() } = {}) {
    this.engine = new RuleEngine(rules);
    this.clock = clock;
  }

  analyze(sessions, { previousAudits = [] } = {}) {
    if (!Array.isArray(sessions) || sessions.length === 0) throw new Error("At least one normalized session is required");
    const context = { sessions };
    const findings = prioritizeByRecurrence(this.engine.analyze(context));
    const rework = classifyAll(sessions);
    const patterns = detectPatterns(sessions);
    const opportunities = automationOpportunities(patterns);
    const metrics = calculateMetrics({ sessions, findings, rework, patterns });
    const timestamp = this.clock();
    const audit = {
      schemaVersion: 1,
      id: timestamp.toISOString().replace(/[:.]/g, "-") ,
      createdAt: timestamp.toISOString(),
      period: auditPeriod(sessions),
      summary: { sessions: sessions.length, findings: findings.length, recommendations: 0 },
      sourceSummary: [...new Set(sessions.map((session) => `${session.source}:${session.sourceFormat}`))],
      metrics,
      findings,
      rework,
      patterns,
      automationOpportunities: opportunities,
      diagnostics: diagnose(findings),
      recommendations: [],
      limitations: limitationSummary(sessions),
      trends: []
    };
    audit.recommendations = buildRecommendations(findings, opportunities);
    audit.summary.recommendations = audit.recommendations.length;
    audit.trends = analyzeTrends([...previousAudits, audit]);
    return { audit, markdown: renderMarkdown(audit) };
  }
}
