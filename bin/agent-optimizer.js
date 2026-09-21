#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import process from "node:process";
import { AgentOptimizer, FileHistoryStore, analyzeTrends, collectRepositorySession, evaluateFixtures, importCcusage, importClaudeCodeTranscript, importCodexHistory, importCursorExport, importHowIPrompt, importInterchange, importOtlpTraces, importSkillusage, importText, loadCodexSessionModels, loadRulePlugin, mergeSessions, startOtlpReceiver, writeDashboard } from "../src/index.js";

function usage() {
  return `AgentOptimizer

Usage:
  agent-optimizer audit --input <sessions.json|jsonl|md> [--history <dir>] [--no-persist] [--json]
  agent-optimizer audit --repository [path] [--history <dir>] [--json]
  agent-optimizer audit --codex-history <history.jsonl> [--codex-sessions <dir>] [--history <dir>] [--json]
  agent-optimizer audit --interchange <agentoptimizer.json> [--history <dir>] [--json]
  agent-optimizer audit --claude-transcript <transcript.jsonl> [--history <dir>] [--json]
  agent-optimizer audit --cursor-export <conversations.json> [--history <dir>] [--json]
  agent-optimizer audit --ccusage <report.json> --howiprompt <metrics.json> --skillusage <report.json> --otlp <traces.json> [--plugin <module.js>]
  agent-optimizer history [--history <dir>]
  agent-optimizer trends [--history <dir>] [--json]
  agent-optimizer dashboard [--history <dir>] [--output <dashboard.html>]
  agent-optimizer eval --fixtures <fixtures.json> [--plugin <module.js>] [--json]
  agent-optimizer serve-otlp [--host 127.0.0.1] [--port 4318] [--history <dir>] [--raw-dir <dir>]
`;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) { args._.push(item); continue; }
    const key = item.slice(2);
    if (["json", "no-persist"].includes(key)) args[key] = true;
    else if (key === "repository") {
      const next = argv[index + 1];
      args.repository = next && !next.startsWith("--") ? argv[++index] : ".";
    } else {
      const value = argv[++index];
      if (key === "plugin") args[key] = [...(args[key] ?? []), value];
      else args[key] = value;
    }
  }
  return args;
}

async function auditCommand(args) {
  const store = new FileHistoryStore(args.history ?? ".agentoptimizer");
  const previousAudits = await store.list();
  const collected = [];
  if (args.repository) collected.push(await collectRepositorySession(args.repository));
  if (args["codex-history"]) {
    const file = resolve(args["codex-history"]);
    const models = await loadCodexSessionModels(args["codex-sessions"]);
    collected.push(...importCodexHistory(await readFile(file, "utf8"), { source: file, models }));
  }
  if (args.interchange) {
    const file = resolve(args.interchange);
    collected.push(...importInterchange(await readFile(file, "utf8")));
  }
  if (args["claude-transcript"]) {
    const file = resolve(args["claude-transcript"]);
    collected.push(...importClaudeCodeTranscript(await readFile(file, "utf8"), { source: file }));
  }
  if (args["cursor-export"]) {
    const file = resolve(args["cursor-export"]);
    collected.push(...importCursorExport(await readFile(file, "utf8"), { source: file }));
  }
  if (args.ccusage) {
    const file = resolve(args.ccusage);
    collected.push(...importCcusage(await readFile(file, "utf8"), { source: file }));
  }
  if (args.howiprompt) {
    const file = resolve(args.howiprompt);
    collected.push(...importHowIPrompt(await readFile(file, "utf8"), { source: file }));
  }
  if (args.skillusage) {
    const file = resolve(args.skillusage);
    collected.push(...importSkillusage(await readFile(file, "utf8"), { source: file }));
  }
  if (args.otlp) {
    const file = resolve(args.otlp);
    collected.push(...importOtlpTraces(await readFile(file, "utf8"), { source: file }));
  }
  if (args.input) {
    const file = resolve(args.input);
    const format = extname(file).slice(1).toLowerCase();
    collected.push(...importText(await readFile(file, "utf8"), format, file));
  }
  if (!collected.length) throw new Error("audit requires at least one supported evidence source");
  const sessions = mergeSessions(collected);
  if (sessions.length === 0) throw new Error("No auditable sessions were found in the selected source");
  const plugins = await Promise.all((args.plugin ?? []).map((file) => loadRulePlugin(resolve(file))));
  const result = new AgentOptimizer({ plugins }).analyze(sessions, { previousAudits });
  if (!args["no-persist"]) await store.save(result.audit, result.markdown);
  process.stdout.write(args.json ? `${JSON.stringify(result.audit, null, 2)}\n` : result.markdown);
}

async function main() {
  const [command = "help", ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const store = new FileHistoryStore(args.history ?? ".agentoptimizer");
  if (["help", "--help", "-h"].includes(command)) return process.stdout.write(usage());
  if (command === "audit") return auditCommand(args);
  if (command === "history") {
    const audits = await store.list();
    return process.stdout.write(`${audits.map((audit) => `${audit.id}\t${audit.createdAt}\t${audit.summary.sessions} sessions`).join("\n")}${audits.length ? "\n" : ""}`);
  }
  if (command === "trends") {
    const trends = analyzeTrends(await store.list());
    return process.stdout.write(args.json ? `${JSON.stringify(trends, null, 2)}\n` : `${trends.map((item) => `${item.metricId}: ${item.status}${item.delta == null ? "" : ` (${item.delta} pp)`}`).join("\n")}${trends.length ? "\n" : ""}`);
  }
  if (command === "dashboard") {
    const output = resolve(args.output ?? "agentoptimizer-dashboard.html");
    await writeDashboard(await store.list(), output);
    return process.stdout.write(`${output}\n`);
  }
  if (command === "eval") {
    if (!args.fixtures) throw new Error("eval requires --fixtures");
    const fixtures = JSON.parse(await readFile(resolve(args.fixtures), "utf8"));
    const plugins = await Promise.all((args.plugin ?? []).map((file) => loadRulePlugin(resolve(file))));
    const result = evaluateFixtures(fixtures, { plugins });
    return process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : `Precision: ${result.precision.toFixed(3)}\nRecall: ${result.recall.toFixed(3)}\nF1: ${result.f1.toFixed(3)}\n`);
  }
  if (command === "serve-otlp") {
    const receiver = await startOtlpReceiver({ host: args.host ?? "127.0.0.1", port: Number(args.port ?? 4318), historyDir: args.history, rawDir: args["raw-dir"] });
    process.stdout.write(`OTLP receiver listening at ${receiver.url}/v1/traces\n`);
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

main().catch((error) => {
  process.stderr.write(`agent-optimizer: ${error.message}\n`);
  process.exitCode = 1;
});
