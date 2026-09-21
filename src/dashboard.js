import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

function renderEvidence(evidence) {
  return `<ul>${evidence.map((item) => `<li>${escapeHtml(item.sessionId ?? "source")} — ${escapeHtml(item.location ?? item.excerpt ?? item.field ?? item.type ?? JSON.stringify(item))}</li>`).join("")}</ul>`;
}

export function generateDashboard(audits) {
  const sections = audits.slice().reverse().map((audit) => {
    const sessionMap = new Map((audit.sessionEvidence ?? []).map((session) => [session.id, session]));
    const metrics = audit.metrics.map((metric) => {
      const sessions = (metric.evidenceSessions ?? []).map((id) => sessionMap.get(id)).filter(Boolean);
      const sessionIds = new Set(metric.evidenceSessions ?? []);
      const relatedFindings = audit.findings.filter((finding) => finding.relatedSessions.some((id) => sessionIds.has(id)));
      const bar = metric.value == null ? "" : `<div class="track" role="img" aria-label="${escapeHtml(metric.label)}: ${escapeHtml(metric.value)} percent"><i style="width:${Math.max(0, Math.min(100, Number(metric.value)))}%"></i></div>`;
      return `<details class="card"><summary><strong>${escapeHtml(metric.label)}</strong><span>${metric.value == null ? "insufficient data" : `${escapeHtml(metric.value)}%`}</span></summary>${bar}<p>${escapeHtml(metric.formula)}</p><p>Numerator: ${escapeHtml(metric.numerator ?? "n/a")} · Denominator: ${escapeHtml(metric.denominator ?? "n/a")}</p>${relatedFindings.map((finding) => `<details><summary>Finding: ${escapeHtml(finding.title)}</summary>${renderEvidence(finding.evidence)}</details>`).join("")}${sessions.map((session) => `<details><summary>Session ${escapeHtml(session.id)}</summary><p>${escapeHtml(session.source)} / ${escapeHtml(session.sourceFormat)}</p>${renderEvidence(session.rawEvidence ?? [])}</details>`).join("")}</details>`;
    }).join("");
    const findings = audit.findings.map((finding) => `<details class="finding"><summary>[${escapeHtml(finding.priority)}] ${escapeHtml(finding.title)}</summary><p>${escapeHtml(finding.description)}</p>${renderEvidence(finding.evidence)}</details>`).join("");
    return `<section><h2>${escapeHtml(audit.id)}</h2><p>${escapeHtml(audit.createdAt)} · ${escapeHtml(audit.summary.sessions)} sessions</p><div class="grid">${metrics}</div><h3>Findings</h3>${findings || "<p>No evidence-backed findings.</p>"}</section>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AgentOptimizer Dashboard</title><style>:root{color-scheme:dark;background:#10151c;color:#e8eef7;font:16px system-ui}body{max-width:1200px;margin:auto;padding:2rem}h1{color:#7ee787}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem}.card,.finding{background:#18212c;border:1px solid #334154;border-radius:12px;padding:1rem;margin:.75rem 0}summary{cursor:pointer;display:flex;justify-content:space-between;gap:1rem}span{color:#79c0ff}.track{height:8px;background:#273445;border-radius:9px;margin:1rem 0;overflow:hidden}.track i{display:block;height:100%;background:#2f81f7}li{overflow-wrap:anywhere}</style></head><body><h1>AgentOptimizer Dashboard</h1>${sections || "<p>No persisted audits.</p>"}</body></html>`;
}

export async function writeDashboard(audits, path) {
  const html = generateDashboard(audits);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, html, "utf8");
  return path;
}
