import { valueOf } from "./domain.js";

export function projectKey(session) {
  const project = valueOf(session.fields.project);
  return project == null || String(project).trim() === "" ? "unscoped" : String(project);
}

export function groupSessionsByProject(sessions) {
  const groups = new Map();
  for (const session of sessions) {
    const key = projectKey(session);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(session);
  }
  return groups;
}

export function buildProjectBaselines(audits, { minimumSamples = 3 } = {}) {
  const observations = new Map();
  for (const audit of audits) for (const project of audit.projectMetrics ?? []) {
    for (const metric of project.metrics ?? []) {
      if (metric.value == null) continue;
      const key = `${project.project}\0${metric.id}`;
      if (!observations.has(key)) observations.set(key, []);
      observations.get(key).push({ auditId: audit.id, value: metric.value });
    }
  }
  return [...observations.entries()].map(([key, samples]) => {
    const [project, metricId] = key.split("\0");
    const enough = samples.length >= minimumSamples;
    return {
      project,
      metricId,
      status: enough ? "calculated" : "insufficient_data",
      sampleSize: samples.length,
      minimumSamples,
      value: enough ? Math.round((samples.reduce((sum, item) => sum + item.value, 0) / samples.length) * 100) / 100 : null,
      auditIds: samples.map((item) => item.auditId)
    };
  });
}
