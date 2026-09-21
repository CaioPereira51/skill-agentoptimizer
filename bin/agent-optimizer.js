#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import process from "node:process";
import { AgentOptimizer, FileHistoryStore, analyzeTrends, collectRepositorySession, importText } from "../src/index.js";

function usage() {
  return `AgentOptimizer

Usage:
  agent-optimizer audit --input <sessions.json|jsonl|md> [--history <dir>] [--no-persist] [--json]
  agent-optimizer audit --repository [path] [--history <dir>] [--json]
  agent-optimizer history [--history <dir>]
  agent-optimizer trends [--history <dir>] [--json]
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
    } else args[key] = argv[++index];
  }
  return args;
}

async function auditCommand(args) {
  const store = new FileHistoryStore(args.history ?? ".agentoptimizer");
  const previousAudits = await store.list();
  let sessions;
  if (args.repository) sessions = [await collectRepositorySession(args.repository)];
  else if (args.input) {
    const file = resolve(args.input);
    const format = extname(file).slice(1).toLowerCase();
    sessions = importText(await readFile(file, "utf8"), format, file);
  } else throw new Error("audit requires --input <file> or --repository [path]");
  const result = new AgentOptimizer().analyze(sessions, { previousAudits });
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
  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

main().catch((error) => {
  process.stderr.write(`agent-optimizer: ${error.message}\n`);
  process.exitCode = 1;
});
