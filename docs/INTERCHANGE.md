# AgentOptimizer Interchange

`agentoptimizer.interchange/v1` is the stable boundary between source-specific collectors and the audit Core. Every field carries an explicit observability state, and may carry field-level provenance.

The machine-readable contract is available at `schemas/agentoptimizer-interchange-v1.schema.json`.

```json
{
  "schema": "agentoptimizer.interchange/v1",
  "source": "collector-name",
  "sessions": [
    {
      "id": "session-1",
      "source": { "adapter": "collector-name", "format": "export-v1" },
      "fields": {
        "prompts": {
          "status": "known",
          "value": ["Implement the change"],
          "provenance": { "location": "export.json:12" }
        },
        "testsExecuted": {
          "status": "unavailable",
          "reason": "the export omits tool results"
        }
      }
    }
  ]
}
```

Missing fields normalize to `unknown`. Use `unavailable` when the source contract cannot provide a field. Collectors must not translate missing observations into empty arrays or negative evidence.
