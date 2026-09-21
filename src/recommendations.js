const impactByCategory = {
  prompt_quality: "Reduzir ambiguidades e ciclos de esclarecimento.",
  context: "Aumentar a precisão sem ampliar desnecessariamente o contexto.",
  task_decomposition: "Reduzir falhas entre fases e facilitar validação incremental.",
  spec_discipline: "Melhorar rastreabilidade entre requisito e implementação.",
  validation: "Detectar regressões antes da entrega.",
  rework: "Aumentar First-Pass Success e reduzir tempo de correção.",
  agent_efficiency: "Reduzir operações/custo sem atribuir qualidade a rankings arbitrários de modelo."
};

export function buildRecommendations(findings, opportunities = []) {
  const seen = new Set();
  const recommendations = [];
  for (const finding of findings) {
    if (!finding.recommendation) continue;
    const key = `${finding.category}:${finding.recommendation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recommendations.push({
      id: `recommendation:${recommendations.length + 1}`,
      recommendation: finding.recommendation,
      evidence: finding.evidence,
      expectedImpact: impactByCategory[finding.category] ?? "Mitigar o problema evidenciado.",
      priority: finding.priority,
      confidence: finding.confidence,
      relatedFindings: [finding.id]
    });
  }
  return [...recommendations, ...opportunities];
}
