import { normalizeMany } from "./normalize.js";

function parseJson(text) {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.sessions)) return data.sessions;
  return [data];
}

function parseJsonLines(text) {
  const records = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try { records.push(JSON.parse(line)); }
    catch (error) { throw new SyntaxError(`Invalid JSON log at line ${index + 1}: ${error.message}`); }
  }
  return records;
}

function parseFrontmatter(block) {
  const result = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([\w-]+):\s*(.*)$/);
    if (match) result[match[1]] = match[2].trim();
  }
  return result;
}

function parseMarkdown(text) {
  const matches = [...text.matchAll(/^##+\s+Session\s*:?\s*([^\r\n]*)\r?\n([\s\S]*?)(?=^##+\s+Session\b|(?![\s\S]))/gim)];
  const sections = matches.length ? matches.map((match) => ({ heading: match[1].trim(), body: match[2].trim() })) : [{ heading: "", body: text.trim() }];
  return sections.map(({ heading, body: section }, index) => {
    const frontmatter = section.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    const meta = frontmatter ? parseFrontmatter(frontmatter[1]) : {};
    const prompts = [...section.matchAll(/(?:^|\n)(?:Prompt|User)\s*:\s*([\s\S]*?)(?=\n(?:Assistant|Result|Prompt|User|Context|Command|Files? (?:Read|Changed)|Tests?)\s*:|$)/gi)].map((m) => m[1].trim());
    const result = section.match(/(?:^|\n)(?:Assistant|Result)\s*:\s*([\s\S]*?)(?=\n(?:Prompt|User|Context|Command|Files? (?:Read|Changed)|Tests?)\s*:|$)/i)?.[1]?.trim();
    const collect = (label) => [...section.matchAll(new RegExp(`(?:^|\\n)${label}\\s*:\\s*(.+)`, "gi"))].flatMap((m) => m[1].split(",").map((v) => v.trim()).filter(Boolean));
    return {
      id: (meta.id ?? heading) || `markdown-${index + 1}`,
      tool: meta.tool,
      model: meta.model,
      timestamp: meta.timestamp,
      task: meta.task ?? heading,
      prompts: prompts.length ? prompts : undefined,
      result,
      context: collect("Context"),
      commands: collect("Command"),
      filesRead: collect("Files? Read"),
      filesChanged: collect("Files? Changed"),
      testsExecuted: collect("Tests?"),
      evidence: [{ type: "source", location: `markdown session ${index + 1}` }]
    };
  });
}

export const importers = {
  json: { id: "json", parse: parseJson },
  jsonl: { id: "structured-log", parse: parseJsonLines },
  log: { id: "structured-log", parse: parseJsonLines },
  md: { id: "markdown", parse: parseMarkdown },
  markdown: { id: "markdown", parse: parseMarkdown }
};

export function importText(text, format, source = "imported") {
  const importer = importers[format.toLowerCase().replace(/^\./, "")];
  if (!importer) throw new Error(`Unsupported import format: ${format}`);
  return normalizeMany(importer.parse(text), { source, format: importer.id });
}
