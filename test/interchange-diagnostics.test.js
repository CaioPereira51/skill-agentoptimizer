import test from "node:test";
import assert from "node:assert/strict";
import { AgentOptimizer, INTERCHANGE_SCHEMA, importInterchange, valueOf } from "../src/index.js";

test("interchange preserves availability and field provenance", () => {
  const [session] = importInterchange({
    schema: INTERCHANGE_SCHEMA,
    source: "fixture",
    sessions: [{
      id: "i1",
      source: { adapter: "fixture-adapter" },
      fields: {
        prompts: { status: "known", value: ["Implement x"], provenance: { location: "fixture.json:4" } },
        testsExecuted: { status: "unavailable", reason: "source omits tools" }
      }
    }]
  });
  assert.deepEqual(valueOf(session.fields.prompts), ["Implement x"]);
  assert.deepEqual(session.fields.testsExecuted, { status: "unavailable", reason: "source omits tools" });
  assert.ok(session.rawEvidence.some((item) => item.field === "prompts" && item.location === "fixture.json:4"));
});

test("interchange rejects unsupported schemas", () => {
  assert.throws(() => importInterchange({ schema: "other/v1", sessions: [] }), /Unsupported interchange schema/);
});

test("rework diagnostics expose hypotheses without assigning implementation fault", () => {
  const session = importInterchange({
    schema: INTERCHANGE_SCHEMA,
    sessions: [{ id: "d1", fields: {
      interactions: { status: "known", value: [
        { type: "implementation", role: "assistant", text: "done" },
        { type: "correction", role: "user", text: "wrong behavior" },
        { type: "implementation", role: "assistant", text: "fixed" },
        { type: "acceptance", role: "user", text: "accepted" }
      ] }
    } }]
  })[0];
  const diagnostic = new AgentOptimizer().analyze([session]).audit.diagnostics.find((item) => item.category === "rework");
  assert.ok(diagnostic);
  assert.equal(diagnostic.hypotheses.find((item) => item.category === "implementation").support, "INSUFFICIENT_DATA");
  assert.equal(Object.hasOwn(diagnostic, "cause"), false);
});
