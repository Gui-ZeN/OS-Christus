// Máquina de estados do fluxo de OS — validação no backend.
// ESPELHO de src/constants/statusFlow.ts: manter os dois em sincronia.
//
// Por design (igual ao front): Admin/Gestor têm transição livre na Inbox.
// Decisões do Diretor passam exclusivamente pelos comandos transacionais
// de api/approvals.js.

export const TICKET_STATUS = {
  NEW: 'Nova OS',
  WAITING_TECH_OPINION: 'Aguardando Parecer Técnico',
  WAITING_SOLUTION_APPROVAL: 'Aguardando Aprovação da Solução',
  WAITING_BUDGET: 'Aguardando Orçamento',
  WAITING_BUDGET_APPROVAL: 'Aguardando Aprovação do Orçamento',
  WAITING_CONTRACT_UPLOAD: 'Aguardando Anexo de Contrato',
  WAITING_CONTRACT_APPROVAL: 'Aguardando aprovação do contrato',
  WAITING_PRELIM_ACTIONS: 'Aguardando Ações Preliminares',
  IN_PROGRESS: 'Em andamento',
  WAITING_MAINTENANCE_APPROVAL: 'Aguardando aprovação da manutenção',
  WAITING_PAYMENT: 'Aguardando pagamento',
  CLOSED: 'Encerrada',
  CANCELED: 'Cancelada',
};

const VALID_STATUSES = new Set(Object.values(TICKET_STATUS));

export function isValidStatus(status) {
  return VALID_STATUSES.has(String(status || ''));
}

/**
 * Etapas que ninguém mais ENTRA — espelho de `src/constants/statusFlow.ts`.
 *
 * A tela já não oferece, mas o servidor precisa recusar também: `canTransitionStatus`
 * libera Admin/Gestor para qualquer destino, então um cliente desatualizado (ou um
 * bundle em cache) recolocaria a OS numa etapa que não existe mais no fluxo.
 *
 * Continuam VÁLIDAS como valor: OS antigas ainda estão paradas nelas e precisam poder
 * sair. O que se recusa é a entrada.
 *
 * ⚠️ APROVAÇÃO DA SOLUÇÃO E DO ORÇAMENTO VOLTARAM (13/08/2026).
 *
 * Em 07/08 aposentei as três de uma vez, medindo que ninguém aprovava no sistema:
 * zero diretores cadastrados e `directorEmails` preenchido em 1 de 270 OS. A medição
 * estava certa sobre o MECANISMO (diretor cadastrado clicando "aprovar") e errada
 * sobre o PASSO. A planilha que a coordenação mantém em paralelo registra os dois
 * marcos — 226 datas de aprovação da solução, e 49 solicitações paradas nela hoje.
 *
 * O preço de ter fechado: o Serv3 recusava justamente a casa seguinte à visita
 * técnica. Das 85 saídas medidas de "Aguardando Parecer Técnico", 64 foram direto
 * para Encerrada e só 4 para Orçamento — a OS não tinha para onde ir.
 *
 * Entrar na etapa NÃO afirma que alguém aprovou dentro do sistema: afirma que a OS
 * espera uma aprovação que acontece por e-mail. Quem aprova continua fora daqui.
 *
 * Contrato segue aposentado: a planilha não acompanha esse marco.
 */
const APOSENTADAS = new Set([TICKET_STATUS.WAITING_CONTRACT_APPROVAL]);

export function isRetiredStatus(status) {
  return APOSENTADAS.has(String(status || ''));
}

/**
 * O carimbo PERMANENTE de quando a OS entrou em cada etapa.
 *
 * `stageEnteredAt` responde "há quanto tempo está NESTA etapa" e é sobrescrito a cada
 * transição — a data da etapa anterior era descartada. Medido em 13/08/2026: o Serv3
 * conseguia reconstruir do histórico a visita técnica em 97% das OS e a conclusão em
 * 36%, e as quatro etapas do meio em 1-3%. A carteira que a coordenação mantém numa
 * planilha existe justamente para ver as datas LADO A LADO — 226 aprovações de
 * solução, 177 orçamentos, 141 ações preliminares registrados lá. Sem este mapa, "o
 * que já aconteceu nesta OS" só se responde varrendo o histórico inteiro.
 *
 * MAPA no próprio documento, não subcoleção: no máximo uma chave por etapa (12), então
 * não corre o risco do `history[]`, que quase estourou 1 MiB. E sai na MESMA leitura da
 * listagem — que é o ponto, porque a tela de carteira mostra uma linha por OS.
 *
 * A PRIMEIRA entrada vence. Encerrar e reabrir é comum aqui (o fluxo permite, e o
 * `closedAt` é limpo na reabertura de propósito); sobrescrever faria a OS reaberta
 * perder a própria linha do tempo. As reentradas continuam no histórico, que é onde
 * "quantas vezes" se responde.
 *
 * @returns o mapa novo, ou `null` quando não há o que acrescentar — assim a transição
 *          repetida não reescreve o mapa inteiro à toa.
 */
export function addStageMarco(marcosAtuais, status, quando) {
  const etapa = String(status || '');
  if (!etapa || !quando) return null;
  const atuais =
    marcosAtuais && typeof marcosAtuais === 'object' && !Array.isArray(marcosAtuais) ? marcosAtuais : {};
  if (atuais[etapa]) return null;
  return { ...atuais, [etapa]: quando };
}

/**
 * A RÉGUA, na ordem — espelho de `MARCOS_DA_OS` em `src/utils/marcos.ts`.
 *
 * Os dois lados existem porque o servidor é quem ESCREVE e a tela é quem DESENHA.
 * Mudou um, muda o outro: `tests/unit/stageMarcos.test.ts` compara os dois.
 */
export const MARCOS_EM_ORDEM = [
  TICKET_STATUS.WAITING_TECH_OPINION,
  TICKET_STATUS.WAITING_SOLUTION_APPROVAL,
  TICKET_STATUS.WAITING_BUDGET,
  TICKET_STATUS.WAITING_PRELIM_ACTIONS,
  TICKET_STATUS.IN_PROGRESS,
  TICKET_STATUS.CLOSED,
];

/**
 * Até onde a etapa ATUAL diz que a OS chegou — índice do último marco ultrapassado.
 *
 * As sete etapas que não são marco também respondem, porque elas dizem posição: quem
 * está em "Aguardando pagamento" já passou do início da execução, ainda que nunca
 * tenha parado no marco "Em andamento". Sem isto, a OS que pula direto para o
 * pagamento não marcaria a execução — e é justamente ela que precisa.
 */
const ATE_ONDE_CHEGOU = {
  [TICKET_STATUS.NEW]: -1,
  [TICKET_STATUS.WAITING_TECH_OPINION]: 0,
  [TICKET_STATUS.WAITING_SOLUTION_APPROVAL]: 1,
  [TICKET_STATUS.WAITING_BUDGET]: 2,
  [TICKET_STATUS.WAITING_BUDGET_APPROVAL]: 2,
  [TICKET_STATUS.WAITING_CONTRACT_UPLOAD]: 3,
  [TICKET_STATUS.WAITING_CONTRACT_APPROVAL]: 3,
  [TICKET_STATUS.WAITING_PRELIM_ACTIONS]: 3,
  [TICKET_STATUS.IN_PROGRESS]: 4,
  [TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL]: 4,
  [TICKET_STATUS.WAITING_PAYMENT]: 4,
  [TICKET_STATUS.CLOSED]: 5,
  // Cancelada NÃO avança nada: a OS parou, não passou.
};

/**
 * OS MARCOS QUE ACONTECERAM SEM O SISTEMA VER.
 *
 * ⚠️ ISTO AFIRMA QUE ACONTECEU, e a afirmação é do dono do produto (03/09/2026):
 * *"a pessoa já fez isso tudo, só não tem a data"*. O dado sustenta: a planilha da
 * coordenação registra 226 aprovações de solução, 177 orçamentos e 141 ações
 * preliminares — contra 4, 4 e 5 datas dentro do Serv3, em 220 OS. Os marcos do meio
 * não estão vazios porque o trabalho não houve; estão vazios porque o trabalho
 * aconteceu por e-mail e telefone, antes de alguém mexer numa etapa aqui.
 *
 * Quem quiser a leitura estrita — "só sei o que carimbei" — tem ela intacta: este
 * conjunto mora FORA de `marcos`, então `contarMarcos` e a régua dos Indicadores
 * continuam contando só data de verdade, e as medianas de intervalo não veem nada
 * disto. O que muda é o que a tela mostra sobre andamento.
 *
 * A data manda: se o marco já tem carimbo, ele não entra aqui — e se um dia ganhar
 * carimbo, sai daqui (`removerDeSemData`).
 *
 * @param marcosAtuais  o mapa de datas DEPOIS do carimbo desta transição
 * @returns a lista nova, ou `null` quando nada muda — assim a transição repetida não
 *          reescreve o campo à toa, igual ao `addStageMarco`.
 */
export function aplicarMarcosSemData(marcosAtuais, semDataAtuais, status) {
  const ate = ATE_ONDE_CHEGOU[String(status || '')];
  const comData =
    marcosAtuais && typeof marcosAtuais === 'object' && !Array.isArray(marcosAtuais) ? marcosAtuais : {};
  const anteriores = Array.isArray(semDataAtuais) ? semDataAtuais.map(String) : [];

  // Cancelada (e qualquer etapa fora do mapa) não avança nada: a OS parou, não passou.
  // Mesmo assim a limpeza abaixo roda — um marco que ganhou data sai da lista.
  const alcancados = ate === undefined || ate < 0 ? [] : MARCOS_EM_ORDEM.slice(0, ate + 1);

  const uniao = new Set([...anteriores, ...alcancados]);
  // A DATA MANDA: marco carimbado sai da lista "sem data". É o que faz a OS que
  // finalmente registrou o orçamento parar de dizer "aconteceu, não sei quando".
  const proxima = MARCOS_EM_ORDEM.filter(marco => uniao.has(marco) && !comData[marco]);

  const igual =
    proxima.length === anteriores.length && proxima.every((marco, i) => marco === anteriores[i]);
  return igual ? null : proxima;
}

const FINISHED_STATUSES = new Set([TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED]);

/**
 * A OS ainda exige trabalho? Espelha `isTicketOpen` de src/constants/ticketLifecycle.
 * Status desconhecido conta como VIVA: sumir de uma tela de trabalho e pior que
 * aparecer a mais.
 */
export function isTicketOpen(status) {
  return !FINISHED_STATUSES.has(String(status || ''));
}

/**
 * True se o papel pode mover a OS de `currentStatus` para `nextStatus`.
 * Admin/Gestor: livre (mesma regra do painel).
 * Outros papéis não atualizam status pelo painel.
 */
export function canTransitionStatus(role, currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return true;
  if (role === 'Admin' || role === 'Gestor') return true;
  return false;
}
