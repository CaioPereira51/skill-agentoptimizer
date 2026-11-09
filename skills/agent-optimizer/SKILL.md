---
name: agent-optimizer
description: Audit AI-assisted development workflows and provide longitudinal coaching from explicitly approved local histories, repository evidence, collector JSON, Cursor transcripts, or OTLP telemetry. Use whenever the user asks to improve how they prompt or work with an AI coding agent, review conversation/history habits, measure prompt quality, context alignment, validation, rework, first-pass success, spec discipline, or recurring automation opportunities.
---

# AgentOptimizer

Use the published `@caiopereira51/agentoptimizer` CLI as the single source of analysis logic. Do not reproduce rule heuristics in the skill.

## Intent routing

Select the smallest command that answers the user's request. Do not run multiple commands speculatively.

| User intent | Command | Preconditions and notes |
| --- | --- | --- |
| Audit an explicitly supplied session, transcript, export, telemetry file, or repository | `audit` | Use the matching source flag; ask before accessing personal history or telemetry not supplied by the user. |
| Coach the user's Codex prompting from local history | `coach --codex` | Ask for explicit consent first. Prefer a supplied `--codex-history` or `--codex-sessions` path when available. |
| List saved audits | `history` | Does not inspect new evidence. |
| Compare longitudinal results | `trends` | Use saved audits and state when there are fewer than three eligible samples. |
| Produce a local evidence dashboard | `dashboard --output <file>` | Only create the requested artifact; do not infer that a dashboard request authorizes new collection. |
| Measure labeled rule behavior | `eval --fixtures <file>` | Use fixtures, not user history. Report precision, recall, and F1 exactly as returned. |

When the intent is ambiguous, ask which evidence source or outcome the user wants rather than probing local data. Never use `coach --codex`, automatic history discovery, session directories, or OTLP inputs without explicit consent or an explicitly supplied path.

## Source discovery and authorization

Use sources in this order: files or paths supplied in the request, an explicitly named repository path, then an explicitly consented local history source. A repository audit may inspect repository evidence at the requested path, but it must not be treated as permission to inspect personal agent history. Ask for a file when the requested analysis needs evidence that is not present.

Do not request or invent credentials. Do not enable a receiver, create an automation, or configure continuous collection from a recommendation alone. Recommend the next action and wait for a separate request before changing external state.

## Execution and failure handling

Run the selected CLI command and check its exit status and output before reporting results. If the CLI is unavailable, a file is missing, a format is invalid, permissions are insufficient, or the source contains no auditable sessions, report the concrete failure and the smallest corrective action. Do not present a partial or invented audit as successful.

For incomplete or partially observable sources, continue only when the CLI returns a report; preserve its limitations and say what the source cannot prove. An empty result is not evidence of good or bad agent behavior unless the report explicitly marks the field as observed. If a command fails, do not substitute a different source or command without telling the user.

## Evidence validation

Before presenting a report, verify that:

1. every finding is traceable to the generated report's evidence or provenance;
2. unavailable, unknown, and observed-empty fields remain distinct;
3. limitations and confidence are included, especially for Cursor telemetry and incomplete transcripts;
4. recommendations are framed as evidence-based suggestions, not blame or certainty beyond the data;
5. inferences are labeled as inferences and are not written as direct observations.

If the generated output does not satisfy these checks, report the validation gap instead of filling it with model-generated conclusions.

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

## Personal coaching from conversation history

When the user asks for feedback on their own prompting or conversation habits, ask for consent to inspect local history if it has not already been given in the request. After consent, run `npx --yes @caiopereira51/agentoptimizer coach --codex`. This explicitly opts into discovery of the local Codex history or Desktop session logs and persists a baseline under `.agentoptimizer/`.

Use `coach --codex-history <history.jsonl>` or `coach --codex-sessions <directory>` when the user provides a specific source. The coaching report is prompt-focused even when a session log supplies visible assistant messages and tool calls: say plainly what the chosen source cannot prove. Do not claim continuous observation; re-run coaching when the user requests it or configure a separate, user-approved scheduled task.

## History and trends

Run `npx --yes @caiopereira51/agentoptimizer history` to list saved audits and `npx --yes @caiopereira51/agentoptimizer trends` to compare the latest two. Trends require at least three eligible samples when sample counts are available. Generate the local evidence dashboard with `dashboard --output <file>`.

Use `eval --fixtures <json>` to measure rule precision, recall, and F1. Live JSON OTLP ingestion is explicitly opt-in through `serve-otlp`, which accepts `/v1/traces`, `/v1/logs`, and `/v1/metrics`; Cursor logs and metrics are buffered by `cursor.conversation.id` until a short idle interval before auditing. Keep the default loopback binding unless remote access is intentionally configured.

## Reporting

Present the generated report as evidence, not as blame. Distinguish direct evidence from inference and state when native tool histories or model/cost metadata are unavailable. Recommend automations; do not create them unless the user separately asks.

## Compatibility contract

The same routing and authorization behavior is expected in Codex, Claude Code, and Cursor: explicit sources take precedence, personal-history inspection requires consent, CLI failures are surfaced, and reports preserve evidence limitations. Differences in native export format belong to the CLI adapters, not to ad-hoc logic in this skill.

## Skill contract fixtures

`eval/skill-contract-fixtures.json` contains scenario-level expectations for routing, authorization, failure handling, and evidence presentation. These fixtures evaluate the behavior of an agent using this skill; they are not a replacement for `eval/fixtures.json`, which measures the CLI rule engine's labeled precision, recall, and F1.
