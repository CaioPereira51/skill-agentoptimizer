import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export class FileHistoryStore {
  constructor(root = ".agentoptimizer") {
    this.root = resolve(root);
    this.auditsDir = join(this.root, "audits");
  }

  async save(audit, markdown) {
    await mkdir(this.auditsDir, { recursive: true });
    const jsonPath = join(this.auditsDir, `${audit.id}.json`);
    const markdownPath = join(this.auditsDir, `${audit.id}.md`);
    await writeFile(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, markdown, "utf8");
    await writeFile(join(this.root, "metrics.json"), `${JSON.stringify({ auditId: audit.id, period: audit.period, metrics: audit.metrics }, null, 2)}\n`, "utf8");
    await writeFile(join(this.root, "patterns.json"), `${JSON.stringify({ auditId: audit.id, patterns: audit.patterns }, null, 2)}\n`, "utf8");
    const recommendationText = audit.recommendations.map((item) => `- [${item.priority}] ${item.recommendation}`).join("\n");
    await writeFile(join(this.root, "recommendations.md"), `# Recommendations\n\n${recommendationText || "No recommendations."}\n`, "utf8");
    return { jsonPath, markdownPath };
  }

  async list() {
    try {
      const files = (await readdir(this.auditsDir)).filter((file) => file.endsWith(".json")).sort();
      return Promise.all(files.map(async (file) => JSON.parse(await readFile(join(this.auditsDir, file), "utf8"))));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }
}
