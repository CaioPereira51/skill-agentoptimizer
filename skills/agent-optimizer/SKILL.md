---
name: agent-optimizer
description: Audit AI-assisted development workflows from repository evidence, native histories, collector JSON, Cursor transcripts, or OTLP telemetry, producing evidence-backed metrics, findings, recommendations, history, dashboards, and trends. Use when the user asks to measure prompt quality, context alignment, validation, rework, first-pass success, spec discipline, or recurring automation opportunities.
---

# AgentOptimizer

Use the published `@caiopereira51/agentoptimizer` CLI as the single source of analysis logic. Do not reproduce rule heuristics in the skill.

## Audit

Choose one or more observable sources. Compatible records are merged with field-level provenance:

- Exported sessions: run `npx --yes @caiopereira51/agentoptimizer audit --input <file>` for JSON, JSONL, or Markdown.
- Repository evidence: run `npx --yes @caiopereira51/agentoptimizer audit --repository <path>`.
- Codex prompt history: run `npx --yes @caiopereira51/agentoptimizer audit --codex-history <history.jsonl> [--codex-sessions <dir>]`.
- Claude Code transcript: run `npx --yes @caiopereira51/agentoptimizer audit --claude-transcript <transcript.jsonl>`.
- Cursor conversation export: run `npx --yes @caiopereira51/agentoptimizer audit --cursor-export <conversations.json>`.
- Cursor Markdown transcript: run `npx --yes @caiopereira51/agentoptimizer audit --cursor-transcript <chat.md>`.
- Cursor OTLP logs and metrics export: run `npx --yes @caiopereira51/agentoptimizer audit --cursor-otel <logs-and-metrics.json>`. These are partial telemetry, not complete traces or model context.
- Collector interchange: run `npx --yes @caiopereira51/agentoptimizer audit --interchange <agentoptimizer.json>`.
- External collectors: add `--howiprompt <json>`, `--ccusage <json>`, and/or `--skillusage <json>`.
- OTLP trace file: add `--otlp <traces.json>`.

Use `--json` only when structured output is needed by another step. Audits persist under `.agentoptimizer/` unless `--no-persist` is explicitly appropriate.

Never infer that an unknown field is negative. In particular, unknown test execution is not equivalent to no tests. Preserve confidence and data limitations from the generated audit.

## History and trends

Run `npx --yes @caiopereira51/agentoptimizer history` to list saved audits and `npx --yes @caiopereira51/agentoptimizer trends` to compare the latest two. Trends require at least three eligible samples when sample counts are available. Generate the local evidence dashboard with `dashboard --output <file>`.

Use `eval --fixtures <json>` to measure rule precision, recall, and F1. Live JSON OTLP ingestion is explicitly opt-in through `serve-otlp`, which accepts `/v1/traces`, `/v1/logs`, and `/v1/metrics`; Cursor logs and metrics are buffered by `cursor.conversation.id` until a short idle interval before auditing. Keep the default loopback binding unless remote access is intentionally configured.

## Reporting

Present the generated report as evidence, not as blame. Distinguish direct evidence from inference and state when native tool histories or model/cost metadata are unavailable. Recommend automations; do not create them unless the user separately asks.
