function metricValue(metric) { return metric.value == null ? "insufficient_data" : `${metric.value}%`; }
function evidenceLine(item) { return `  - ${item.sessionId ?? "source"}/${item.field ?? item.type ?? "evidence"}: ${item.excerpt ?? item.location ?? JSON.stringify(item)}`; }

export function renderMarkdown(audit) {
  const lines = [
    "# AgentOptimizer Audit", "", `Audit: ${audit.id}`, `Period: ${audit.period.start ?? "unknown"} → ${audit.period.end ?? "unknown"}`,
    "", "## Summary", "", `${audit.summary.sessions} session(s), ${audit.summary.findings} finding(s), ${audit.summary.recommendations} recommendation(s).`,
    "", "## Metrics", ""
  ];
  for (const metric of audit.metrics) lines.push(`- ${metric.label}: **${metricValue(metric)}** — ${metric.formula}`);
  lines.push("", "## Findings", "");
  if (!audit.findings.length) lines.push("No evidence-backed findings.");
  for (const finding of audit.findings) {
    lines.push(`### [${finding.priority}] ${finding.title}`, "", finding.description, "", `Confidence: ${finding.confidence}`, "", "Evidence:", ...finding.evidence.map(evidenceLine), "", `Recommendation: ${finding.recommendation ?? "See recommendations."}`, "");
  }
  lines.push("## Top Problems", "");
  for (const finding of audit.findings.slice().sort((a, b) => ["CRITICAL", "HIGH", "MEDIUM", "LOW"].indexOf(a.priority) - ["CRITICAL", "HIGH", "MEDIUM", "LOW"].indexOf(b.priority)).slice(0, 5)) lines.push(`- [${finding.priority}] ${finding.title}`);
  lines.push("", "## Recommendations", "");
  for (const item of audit.recommendations) lines.push(`- **${item.priority}** ${item.recommendation} Impact: ${item.expectedImpact}`);
  lines.push("", "## Automation Opportunities", "");
  if (!audit.automationOpportunities.length) lines.push("No recurring pattern met the minimum evidence threshold.");
  for (const item of audit.automationOpportunities) lines.push(`- ${item.type}: ${item.recommendation} (${item.confidence})`);
  lines.push("", "## Diagnostics", "");
  for (const item of audit.diagnostics) lines.push(`- ${item.cause} — confidence ${item.confidence}; ${item.evidence.length} evidence item(s).`);
  lines.push("", "## Confidence / Data Limitations", "");
  if (!audit.limitations.length) lines.push("No source limitations were reported.");
  for (const item of audit.limitations) lines.push(`- ${item}`);
  if (audit.trends?.length) {
    lines.push("", "## Trends", "");
    for (const trend of audit.trends) lines.push(`- ${trend.metricId}: ${trend.status}${trend.delta == null ? "" : ` (${trend.delta > 0 ? "+" : ""}${trend.delta} pp)`}`);
  }
  return `${lines.join("\n")}\n`;
}
