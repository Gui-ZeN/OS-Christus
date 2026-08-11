/**
 * Escopo do PATCH /api/tickets POR PAPEL.
 *
 * Antes existia UMA allow-list de campos para todos, e o unico recorte por papel
 * era o territorial. Na pratica o Diretor — que so deveria APROVAR, via comandos
 * transacionais de api/approvals.js — podia gravar prioridade, equipe, anexos,
 * checklist de encerramento e progresso de execucao de qualquer OS do territorio
 * dele. A matriz abaixo fecha isso:
 *
 *   Admin    todos os campos da allow-list, inclusive territoriais
 *   Gestor   operacionais (allow-list menos territoriais)
 *   Diretor  apenas viewingBy (estado de revisao da tela de Aprovacoes) e
 *            entradas NOVAS de history (o merge por id + sanitize ja forcam o
 *            sender ao ator, entao ele nao consegue reescrever entrada alheia)
 *   Usuario  nada — o handler ja barra o papel antes, isto e defesa em profundidade
 *
 * `status` nao aparece para o Diretor de proposito, e isso NAO e uma restricao
 * nova: canTransitionStatus() ja devolvia false para qualquer papel que nao fosse
 * Admin/Gestor. A tela de Aprovacoes so envia viewingBy pelo PATCH.
 */

// Reclassificacao territorial: move a OS para dentro/fora de um territorio, entao
// um perfil escopado poderia se dar acesso a OS que nao enxerga. So Admin.
export const TERRITORY_PATCH_FIELDS = new Set(['regionId', 'siteId', 'region', 'sede']);

export const DIRECTOR_PATCH_FIELDS = new Set(['viewingBy', 'history']);

// Allow-list dos campos que o PATCH do painel pode gravar. Enumerado a partir de
// TODAS as chamadas updateTicket() do front. Tudo fora daqui é descartado — em vez
// de uma deny-list (que só bloqueia o que alguém lembrou e deixava requesterEmail,
// requester, subject, time... editáveis por qualquer perfil com acesso à OS).
// id / trackingToken / createdAt / updatedAt ficam DE FORA de propósito
// (identidade e campos controlados pelo servidor).
export const ALLOWED_TICKET_PATCH_FIELDS = new Set([
  'status', 'priority', 'sector', 'location', 'time', 'waterIssue',
  'assignedTeam', 'assignedEmail',
  // Quem responde por a OS nao parar. Operacional, nao territorial: definir
  // responsavel nao move a OS de sede, entao Gestor grava.
  'responsible',
  'macroServiceId', 'macroServiceName', 'serviceCatalogId', 'serviceCatalogName',
  'directorIds', 'directorEmails', 'directorCcEmails', 'requesterCcEmails',
  'attachments', 'history', 'viewingBy',
  // Agenda operacional (versao nova). Campo fora desta lista e DESCARTADO EM
  // SILENCIO: a tela mostraria sucesso e o dado sumiria no reload.
  // `attentionOverride` é a correção humana sobre a atenção PROPOSTA pelo sistema.
  // `operationalAttention` fica FORA de propósito: é projeção do servidor, e deixar o
  // cliente gravá-la abriria caminho para uma tela dizer que a OS não precisa de nada.
  'nextAction', 'attention', 'attentionOverride',
  // Registro de quem esta esperando retorno. E declaracao da pessoa, nao projecao
  // do servidor — por isso o painel grava.
  'followUpRequestedAt',
  'preliminaryActions', 'closureChecklist', 'executionProgress', 'guarantee',
  ...TERRITORY_PATCH_FIELDS,
]);

const OPERATIONAL_PATCH_FIELDS = new Set(
  [...ALLOWED_TICKET_PATCH_FIELDS].filter(field => !TERRITORY_PATCH_FIELDS.has(field))
);

/** Campos que o papel pode gravar pelo PATCH operacional. */
export function patchFieldsForRole(role) {
  if (role === 'Admin') return ALLOWED_TICKET_PATCH_FIELDS;
  if (role === 'Gestor') return OPERATIONAL_PATCH_FIELDS;
  if (role === 'Diretor') return DIRECTOR_PATCH_FIELDS;
  return new Set();
}

/**
 * Filtra o payload ao que o papel pode gravar.
 *
 * `sentFields` e essencial e vem das chaves CRUAS do cliente: o normalizer injeta
 * `time: agora` quando ausente, entao sem esse guard todo PATCH parcial
 * sobrescreveria a data de abertura da OS.
 */
export function filterTicketPatchFields(role, normalizedUpdates, sentFields) {
  const allowed = patchFieldsForRole(role);
  const updates = {};
  for (const field of Object.keys(normalizedUpdates || {})) {
    if (allowed.has(field) && sentFields.has(field)) {
      updates[field] = normalizedUpdates[field];
    }
  }
  return updates;
}
