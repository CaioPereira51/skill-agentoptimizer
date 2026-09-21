import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentOptimizer, collectRepositorySession, valueOf } from "../src/index.js";

test("repository mode separates discoverable capabilities from agent activity", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-optimizer-repository-"));
  await mkdir(join(root, "src"));
  await mkdir(join(root, "test"));
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test", lint: "node lint.js" } }), "utf8");
  await writeFile(join(root, "src", "index.js"), "export const value = 1;", "utf8");
  await writeFile(join(root, "test", "index.test.js"), "", "utf8");
  await writeFile(join(root, "TECH_SPEC.md"), "# Architecture", "utf8");

  const session = await collectRepositorySession(root);
  assert.deepEqual(valueOf(session.fields.validationCapabilities), ["test", "lint", "tests-present"]);
  assert.ok(valueOf(session.fields.repositoryInventory).includes("src/index.js"));
  assert.equal(session.fields.filesRead.status, "unavailable");
  assert.equal(session.fields.filesChanged.status, "unavailable");
  assert.equal(session.fields.testsExecuted.status, "unavailable");
  assert.equal(session.fields.validation.status, "unavailable");
  assert.equal(session.fields.specArtifacts.status, "unavailable");
  assert.equal(valueOf(session.fields.repositorySpecArtifacts)[0].name, "TECH_SPEC.md");

  const audit = new AgentOptimizer().analyze([session]).audit;
  assert.equal(audit.metrics.find((item) => item.id === "validation_coverage").status, "insufficient_data");
  assert.equal(audit.metrics.find((item) => item.id === "spec_discipline").status, "insufficient_data");
  assert.equal(audit.findings.some((item) => item.id.includes("changed-without-read")), false);
});
