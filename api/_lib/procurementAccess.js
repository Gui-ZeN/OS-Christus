import { HttpError } from './http.js';

// As ações de APROVAÇÃO saíram junto com a rota `?route=approvals` e a tela de
// Aprovações: não havia diretor cadastrado, e a aprovação real acontece por e-mail
// (ver `api/_lib/authorization.js`). Guardar permissão para ação sem rota só confunde
// quem ler depois.
const EDIT_ACTIONS = new Set(['quotes', 'contract', 'payment', 'measurement']);
export function assertProcurementMutationAllowed(role, action) {
  const normalizedRole = String(role || '').trim();
  const normalizedAction = String(action || '').trim();

  if (EDIT_ACTIONS.has(normalizedAction)) {
    if (normalizedRole === 'Admin' || normalizedRole === 'Gestor') return;
    throw new HttpError(403, 'Apenas Admin ou Gestor podem editar dados de compras.');
  }

  if (normalizedAction === 'seedDefaults') {
    if (normalizedRole === 'Admin') return;
    throw new HttpError(403, 'Apenas Admin pode criar dados financeiros padrão.');
  }

  throw new HttpError(400, 'Ação de compras inválida.');
}

// Papéis que operam o fluxo de compras. `Usuario` é solicitante/representante de
// unidade: acompanha a OS e os indicadores operacionais, mas não recebe contrato,
// pagamento, medição, fornecedor nem valor.
const FINANCIAL_READER_ROLES = new Set(['Admin', 'Gestor', 'Diretor']);

/**
 * PONTO UNICO de decisão sobre quem lê dados financeiros.
 *
 * O gate existia só no cliente (KpiView escondia a aba), enquanto o GET de
 * compras entregava contratos e pagamentos do território para qualquer
 * autenticado — uma requisição de distância.
 *
 * Para liberar alguém no futuro, o caminho é uma permissão EXPLÍCITA no usuário
 * (`canViewFinancials`), não ampliar a lista de papéis em silêncio: por isso a
 * flag é consultada aqui antes do papel.
 */
export function canUserReadFinancials(user) {
  if (user?.canViewFinancials === true) return true;
  return FINANCIAL_READER_ROLES.has(String(user?.role || '').trim());
}

export function assertCanReadFinancials(user) {
  if (canUserReadFinancials(user)) return;
  throw new HttpError(403, 'Seu perfil não tem acesso a dados financeiros da OS.');
}

