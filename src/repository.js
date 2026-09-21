import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { normalizeSession } from "./normalize.js";

const IGNORED = new Set([".git", "node_modules", "dist", "build", "coverage", ".agentoptimizer", "graphify-out"]);
const SPEC_NAMES = /^(prd|tech[-_ ]?spec|tasks?|plan|requirements?|agents|claude)(\.|$)/i;
const TEST_NAMES = /(?:^|[._-])(test|spec)s?(?:[._-]|$)/i;
const CONFIG_NAMES = /^(package\.json|pyproject\.toml|cargo\.toml|go\.mod|.*config\.(js|cjs|mjs|ts|json|ya?ml))$/i;

async function walk(root, current = root, result = [], limit = 5000) {
  if (result.length >= limit) return result;
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const full = resolve(current, entry.name);
    if (entry.isDirectory()) await walk(root, full, result, limit);
    else if (entry.isFile()) result.push(relative(root, full).replaceAll("\\", "/"));
    if (result.length >= limit) break;
  }
  return result;
}

function git(root, args) {
  try { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
}

async function readSmall(root, file) {
  const full = resolve(root, file);
  if ((await stat(full)).size > 200_000) return "";
  return readFile(full, "utf8");
}

function inferValidations(packageText, files) {
  const validations = [];
  if (packageText) {
    try {
      const scripts = JSON.parse(packageText).scripts ?? {};
      for (const name of ["test", "lint", "typecheck", "build", "e2e"]) if (scripts[name]) validations.push(`available:${name}`);
    } catch { /* invalid package is evidence only through warning */ }
  }
  if (files.some((file) => TEST_NAMES.test(file))) validations.push("tests-present");
  return validations;
}

export async function collectRepositorySession(rootPath = process.cwd()) {
  const root = resolve(rootPath);
  const files = await walk(root);
  const specFiles = files.filter((file) => SPEC_NAMES.test(file.split("/").at(-1)));
  const configFiles = files.filter((file) => CONFIG_NAMES.test(file.split("/").at(-1)));
  const testFiles = files.filter((file) => TEST_NAMES.test(file));
  const packageFile = files.find((file) => file === "package.json");
  const packageText = packageFile ? await readSmall(root, packageFile) : "";
  const changed = (git(root, ["diff", "--name-only", "HEAD"]) ?? git(root, ["diff", "--name-only"]) ?? "").split(/\r?\n/).filter(Boolean);
  const commits = git(root, ["log", "-20", "--pretty=format:%h|%aI|%s"]);
  const branch = git(root, ["branch", "--show-current"]);
  const now = new Date().toISOString();
  const specArtifacts = [];
  for (const file of specFiles.slice(0, 30)) specArtifacts.push({ name: file, content: await readSmall(root, file) });
  return normalizeSession({
    id: `repository-${now}`,
    tool: "repository",
    session: branch || undefined,
    task: "Repository evidence audit",
    context: files,
    filesRead: [...specFiles, ...configFiles, ...testFiles],
    filesChanged: changed,
    testsExecuted: undefined,
    specArtifacts,
    validation: inferValidations(packageText, files),
    timestamp: now,
    result: commits ? { recentCommits: commits.split(/\r?\n/) } : undefined,
    observability: {
      prompts: "unavailable", commands: "unavailable", interactions: "unavailable", model: "unavailable",
      cost: "unavailable", operations: "unavailable", testsExecuted: "unknown"
    },
    evidence: [
      { type: "repository", location: root },
      { type: "inventory", files: files.length, specs: specFiles.length, tests: testFiles.length, configs: configFiles.length }
    ]
  }, { source: "repository", format: "repository", limitations: { testsExecuted: "Repository state cannot prove which validations ran in a past AI session." } });
}
