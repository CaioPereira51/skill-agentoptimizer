# AgentOptimizer

AgentOptimizer is an IDE-independent, evidence-based audit engine for AI-assisted development workflows. It separates collection and normalization from rules, metrics, recommendations, reporting, persistence, and trend analysis.

## Install the Agent Skill

Install directly from GitHub into Cursor, Codex, Claude Code, or another agent supported by the open Skills CLI:

```bash
npx skills add CaioPereira51/agentoptimizer --skill agent-optimizer
```

For a non-interactive project installation specifically in Cursor:

```bash
npx skills add CaioPereira51/agentoptimizer --skill agent-optimizer --agent cursor --yes
```

Use `-g` to install globally instead of in the current project. After installation, invoke `/agent-optimizer` or ask the agent to audit the current AI-development workflow.

## Install the CLI

The npm package name is lowercase, as required by npm:

```bash
npm install --save-dev @caiopereira51/agentoptimizer
npx agent-optimizer audit --repository .
```

For a global CLI:

```bash
npm install --global @caiopereira51/agentoptimizer
agent-optimizer audit --repository .
```

## Development

Requires Node.js 20 or newer and has no runtime dependencies.

```bash
npm test
node bin/agent-optimizer.js audit --input examples/sessions.json
node bin/agent-optimizer.js audit --repository .
node bin/agent-optimizer.js audit --codex-history ~/.codex/history.jsonl --codex-sessions ~/.codex/sessions
node bin/agent-optimizer.js audit --claude-transcript transcript.jsonl
node bin/agent-optimizer.js audit --cursor-export conversations.json
node bin/agent-optimizer.js audit --interchange agentoptimizer.json
node bin/agent-optimizer.js audit --howiprompt metrics.json --ccusage usage.json --skillusage skills.json
node bin/agent-optimizer.js audit --otlp traces.json
node bin/agent-optimizer.js trends
node bin/agent-optimizer.js dashboard --output .agentoptimizer/dashboard.html
node bin/agent-optimizer.js eval --fixtures eval/fixtures.json
node bin/agent-optimizer.js serve-otlp --port 4318
```

Supported imported formats are JSON, JSONL/structured logs, Markdown, `agentoptimizer.interchange/v1`, Codex prompt history, Claude Code transcript JSONL, Cursor exports, How I Prompt exports/metrics, ccusage JSON, skillusage JSON, and OTLP/HTTP JSON traces. Multiple source flags may be supplied to one audit; records are joined by platform/session or project/time window with field provenance. Each adapter preserves source limitations instead of converting missing evidence into negative observations.

Audits include per-project metrics and baselines, minimum-sample trend guards, high-confidence reusable-artifact candidates, and normalized source evidence. The dependency-free local dashboard drills from a metric through related findings and sessions to source locations. `serve-otlp` is opt-in, binds to `127.0.0.1` by default, accepts JSON at `/v1/traces`, and does not require OpenLIT.

Rule plugins export `{ name, version?, rules }`; every rule must provide `{ id, analyze(context) }`, and every emitted finding is revalidated by the engine, including its required evidence. Use repeated `--plugin <module.js>` flags with `audit` or `eval`.

## Architecture

```text
Native histories / collectors / OTLP / Repository evidence
              ↓
       Importer / Adapter
              ↓
          Normalizer
              ↓
     Rule engine + Metrics
              ↓
Findings / Diagnostics / Patterns
              ↓
Recommendations / Report / History / Trends / Dashboard
```

The normalized model wraps every observable field as `known`, `unknown`, or `unavailable`. An observed empty list is therefore materially different from an unknown list.

See [docs/METRICS.md](docs/METRICS.md) for deterministic formulas, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for contracts and extension points, [docs/INTERCHANGE.md](docs/INTERCHANGE.md) for collector interoperability, and [docs/PUBLISHING.md](docs/PUBLISHING.md) for the release procedure.
