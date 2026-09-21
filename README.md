# AgentOptimizer

AgentOptimizer is an IDE-independent, evidence-based audit engine for AI-assisted development workflows. It separates collection and normalization from rules, metrics, recommendations, reporting, persistence, and trend analysis.

## Quick start

Requires Node.js 20 or newer and has no runtime dependencies.

```bash
npm test
node bin/agent-optimizer.js audit --input examples/sessions.json
node bin/agent-optimizer.js audit --repository .
node bin/agent-optimizer.js trends
```

Supported imported formats are JSON, JSONL/structured logs, and Markdown session exports. Repository mode observes files, Git metadata when available, specs, configuration, and test presence. It does not claim access to private IDE histories.

## Architecture

```text
Imported data / Repository evidence
              ↓
       Importer / Adapter
              ↓
          Normalizer
              ↓
     Rule engine + Metrics
              ↓
Findings / Diagnostics / Patterns
              ↓
Recommendations / Report / History / Trends
```

The normalized model wraps every observable field as `known`, `unknown`, or `unavailable`. An observed empty list is therefore materially different from an unknown list.

See [docs/METRICS.md](docs/METRICS.md) for deterministic formulas and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for contracts and extension points.
