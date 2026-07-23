import { normalizeKey } from './text.js';

// Casamento do [SEDE] do assunto de e-mail com uma sede do catálogo. Lógica PURA
// (recebe o array de sites já carregado) — extraída de mail.js para ficar testável
// e isolada (foi a origem de vários bugs de inbound: CESIU, PRÉ SUL, DT1, PQL 2/3).

// Apelidos que o pessoal REALMENTE escreve no [ ] do assunto e que não são o
// código da sede no catálogo. Sem isto o e-mail não casa nenhuma sede e a OS não
// é criada. Chave já em `tightKey` (sem acento/espaço/pontuação); valor = código
// canônico da sede.
export const SITE_ALIASES = {
  cesiu: 'ALD',
  cvu: 'ALD',
  presul: 'PSUL',
  prenunes: 'PNV',
  dt1: 'DT',
  sul: 'SUL1',
  jv: 'PJF',
  prejovita: 'PJF',
  pql23: 'PQL3',
};

// Casamento "apertado": remove tudo que não é letra/dígito e zera leading zeros
// nos grupos numéricos, para que "PQL 3", "PQL03", "PQL 03" e "D.L" casem com os
// códigos canônicos "PQL3" e "DL" do catálogo.
export function tightKey(value) {
  return normalizeKey(value)
    .replace(/[^a-z0-9]/g, '')
    .replace(/\d+/g, match => String(Number(match)));
}

// Resolve um código de sede (o que veio no [ ] do assunto) para o doc da sede.
// Ordem: exato → apertado → apelido conhecido → fallback aproximado por substring.
// Retorna o item de `sites` ou null.
export function matchSiteCode(siteCode, sites) {
  const normalized = normalizeKey(siteCode);
  if (!normalized || !Array.isArray(sites)) return null;
  const normalizedTight = tightKey(siteCode);

  const exact =
    sites.find(item =>
      [item.id, item.code, item.name].some(value => normalizeKey(value) === normalized)
    ) ||
    (normalizedTight
      ? sites.find(item => [item.id, item.code].some(value => tightKey(value) === normalizedTight))
      : null);
  if (exact) return exact;

  // Apelido conhecido (CESIU/CVU → ALD, PRÉ SUL → PSUL, ...): resolve direto no
  // código canônico. Vem antes do fallback por substring, que é aproximado.
  const aliasCode = SITE_ALIASES[normalizedTight];
  if (aliasCode) {
    const aliased = sites.find(item => tightKey(item.code) === tightKey(aliasCode));
    if (aliased) return aliased;
  }

  // Fallback para assuntos com nome de sede parcial/completo (ex.: "(aldeota)").
  const ranked = sites
    .map(item => {
      const id = normalizeKey(item.id);
      const code = normalizeKey(item.code);
      const name = normalizeKey(item.name);
      let score = 0;
      if (code && normalized.includes(code)) score = Math.max(score, 95);
      if (name && normalized.includes(name)) score = Math.max(score, 92);
      if (name && name.includes(normalized)) score = Math.max(score, 90);
      if (code && code.includes(normalized)) score = Math.max(score, 88);
      if (id && (id === normalized || normalized.includes(id) || id.includes(normalized))) score = Math.max(score, 85);
      return { item, score };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.item || null;
}
