import { readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

async function files(root, result = []) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (["node_modules", ".agentoptimizer", "graphify-out"].includes(entry.name)) continue;
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) await files(path, result);
    else if (extname(entry.name) === ".js") result.push(path);
  }
  return result;
}

let failed = false;
for (const file of await files(process.cwd())) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) { failed = true; process.stderr.write(result.stderr); }
}
if (failed) process.exitCode = 1;
else process.stdout.write("Syntax lint passed.\n");
