import type { TicketStatus } from '../constants/ticketStatus';
import type {
  AttentionState,
  CommitmentKind,
  CommitmentOutcome,
  CommitmentState,
  RescheduleReason,
  SuspensionReason,
} from '../constants/agenda';
export type { TicketStatus } from '../constants/ticketStatus';
export type {
  AttentionState,
  CommitmentKind,
  CommitmentOutcome,
  CommitmentState,
  RescheduleReason,
  SuspensionReason,
};

export type ViewState = 'landing' | 'login' | 'password-reset' | 'home' | 'today' | 'inbox' | 'os-board' | 'users' | 'kpi' | 'settings' | 'tracking' | 'public-form' | 'finance' | 'email-health' | 'audit-logs';

/**
 * Filtros do quadro de Gestão. Vivem no contexto (e não em `useState` da view)
 * porque a view desmonta ao abrir uma OS — sem isto, voltar da OS perde o filtro
 * e a pessoa refaz a seleção toda vez.
 */
/**
 * COMPROMISSO — a entidade nova da agenda operacional.
 *
 * ⚠️ **Nasce ligado a VÁRIAS OS de propósito** (`ticketIds`, não `ticketId`). Uma
 * visita que atende três OS é UM compromisso: é esse corte que impede três alertas
 * possivelmente contraditórios no mesmo dia, e é o que segura o volume de e-mail.
 * A auditoria foi explícita — nascer 1:1 e virar N:N depois é migração de dados,
 * não refactor.
 *
 * Na tela, cada OS exibe UMA ação primária para ordenar a agenda. Isso é regra de
 * foco da interface, não cardinalidade do domínio.
 */
export interface Commitment {
  id: string;
  kind: CommitmentKind;
  /** As OS atendidas por este compromisso. Sempre ao menos uma. */
  ticketIds: string[];
  siteId?: string;
  sede?: string;
  /** Quem prometeu comparecer. */
  vendorId?: string;
  vendorName?: string;
  /** Janela, não instante: sem `endAt` não há tolerância nem checkpoint possível. */
  startAt: Date;
  endAt?: Date | null;
  toleranceMinutes?: number;
  state: CommitmentState;
  /** Só existe depois de `compareceu`. Chegada e resultado são coisas diferentes. */
  outcome?: CommitmentOutcome | null;
  /** Quem confirmou (coordenador da sede) e quando. */
  confirmedBy?: string | null;
  confirmedAt?: Date | null;
  /** Encadeamento de remarcação — preserva o histórico em vez de sobrescrever. */
  supersedes?: string | null;
  supersededBy?: string | null;
  rescheduleReason?: RescheduleReason | null;
  createdAt: Date;
  createdBy?: string;
  updatedAt?: Date | null;
}

/**
 * PRÓXIMA AÇÃO — o que sustenta a regra única.
 *
 * Pode ser interna (analisar orçamento, mandar contrato) e por isso NÃO depende de
 * compromisso: trabalho que não envolve fornecedor ficaria invisível num modelo só
 * de visitas.
 */
export interface NextAction {
  /** O que vai acontecer, em uma linha. */
  what: string;
  /** Quando. É a data que ordena a agenda. */
  dueAt: Date;
  /** Quem responde. */
  ownerEmail?: string;
  ownerName?: string;
  /** Preenchido quando a ação É um compromisso com fornecedor. */
  commitmentId?: string | null;
  createdAt?: Date;
  createdBy?: string;
}

/**
 * SUSPENSÃO — a resposta honesta para "esta OS não tem próxima ação, e tudo bem".
 *
 * Três coisas juntas, ou não vale: o MOTIVO (de uma lista, para poder ser contado), a
 * DATA DE REVISÃO (quando alguém olha de novo) e quem suspendeu. Sem a data, a
 * suspensão viraria a gaveta nova — e a gaveta antiga já tem 163 OS dentro.
 *
 * Quando a revisão vence, a suspensão simplesmente deixa de valer: a OS volta para
 * "sem próxima ação", que é onde ela precisa aparecer para alguém decidir.
 */
export interface TicketAttention {
  state: AttentionState;
  reason: SuspensionReason;
  /** Detalhe curto, opcional — o motivo em lista é o que conta. */
  note?: string;
  /** Quando olhar de novo. É o que impede a suspensão de ser esquecimento. */
  reviewAt: Date;
  setBy?: string;
  setByName?: string;
  setAt?: Date;
}

export interface OsBoardFilter {
  search: string;
  sede: string;
  macroService: string;
  service: string;
  team: string;
  status: string;
  /** E-mail do responsável, `all`, ou `none` para "sem responsável". */
  responsible: string;
  showClosed: boolean;
}

export interface InboxFilter {
  status: string[];
  priority: string[];
  region: string[];
  site: string[];
  type: string[];
}

export interface HistoryItem {
  id: string;
  type: 'customer' | 'system' | 'tech' | 'internal' | 'field_change';
  sender?: string;
  time: Date;
  text?: string;
  visibility?: 'public' | 'internal';
  attachments?: TicketAttachment[];
  field?: string;
  from?: string;
  to?: string;
}

export interface TicketAttachment {
  id: string;
  name: string;
  path: string;
  url: string;
  contentType?: string | null;
  size?: number | null;
  uploadedAt?: Date | null;
  category?: 'closure_report' | 'closure_evidence' | 'attachment';
  /**
   * Arquivamento no Drive: `driveFileId` identifica o arquivo privado e `path`
   * preserva a origem e o vínculo com a OS. A interface baixa o conteúdo pela API
   * autenticada; `url` só permanece para compatibilidade com anexos legados.
   */
  archived?: boolean;
  driveFileId?: string | null;
  archivedAt?: Date | null;
}

export interface PreliminaryActions {
  materialRequested: boolean;
  materialEta?: Date | null;
  teamConfirmed: boolean;
  sitePrepared: boolean;
  scheduleDefined: boolean;
  stakeholderAligned: boolean;
  accessReleased: boolean;
  plannedStartAt?: Date | null;
  actualStartAt?: Date | null;
  blockerNotes?: string;
  updatedAt?: Date | null;
}

export interface ClosureChecklist {
  requesterApproved: boolean;
  requesterApprovedBy?: string | null;
  requesterApprovedAt?: Date | null;
  infrastructureApprovalPrimary: boolean;
  infrastructureApprovalSecondary: boolean;
  infrastructureApprovedByRafael?: boolean;
  infrastructureApprovedByFernando?: boolean;
  closureNotes?: string;
  serviceStartedAt?: Date | null;
  serviceCompletedAt?: Date | null;
  closedAt?: Date | null;
  documents?: TicketAttachment[];
}

export interface GuaranteeInfo {
  startAt?: Date | null;
  endAt?: Date | null;
  months: number;
  status: 'pending' | 'active' | 'expired';
}

export interface ExecutionProgress {
  paymentFlowParts: number;
  currentPercent: number;
  releasedPercent: number;
  measurementSheetUrl?: string | null;
  startedAt?: Date | null;
  lastUpdatedAt?: Date | null;
}

export interface QuoteProposalHeader {
  unitName?: string | null;
  location?: string | null;
  folderLink?: string | null;
  contractedVendor?: string | null;
  totalQuantity?: string | null;
  totalEstimatedValue?: string | null;
}

export interface Ticket {
  id: string;
  trackingToken: string;
  subject: string;
  requester: string;
  requesterEmail?: string;
  requesterCcEmails?: string[];
  directorCcEmails?: string[];
  directorIds?: string[];
  directorEmails?: string[];
  time: Date;
  /** Carimbo do backend a cada escrita; usado p/ detectar mudança barata no poll. */
  updatedAt?: string | Date | null;
  status: TicketStatus;
  /**
   * Quando a OS entrou na etapa ATUAL. Carimbado pelo servidor a cada transição.
   *
   * Separado da última movimentação de propósito: "parada" e "parada nesta etapa"
   * são perguntas diferentes, e responder as duas com o mesmo carimbo dá precisão
   * aparente com semântica errada.
   */
  stageEnteredAt?: string | Date | null;
  type: string;
  macroServiceId?: string;
  macroServiceName?: string;
  serviceCatalogId?: string;
  serviceCatalogName?: string;
  regionId?: string;
  region: string;
  siteId?: string;
  sede: string;
  assignedTeam?: string;
  assignedEmail?: string;
  /**
   * Quem responde por esta OS não parar.
   *
   * Não é quem executa — para isso existe `assignedTeam`, preenchido em 180 das 195
   * OS vivas. Ter equipe não moveu nenhuma das 155 paradas há 39 dias (mediana), e
   * o motivo é que equipe responde pelo trabalho e pessoa responde pelo prazo:
   * "Construtora" não abre o sistema nem é cobrada por uma OS específica.
   *
   * `setAt` existe porque uma REGRA depende dele, não para exibir: assumir uma OS é
   * um evento, e ele reinicia o relógio. Sem isso, "com responsável e sem progresso"
   * dispararia no instante em que alguém assumisse uma OS parada há 39 dias — punindo
   * exatamente quem acabou de fazer a coisa certa.
   */
  responsible?: { email: string; name: string; setAt?: Date | null } | null;
  /**
   * Desde quando alguém REGISTROU que espera retorno nesta OS.
   *
   * Declaração da pessoa, não verificação do sistema: o Serv3 não checa se ela
   * realmente pediu, nem fala com quem deve responder. Ele guarda a data e devolve a
   * OS para a vista dela alguns dias depois. Some sozinho quando chega mensagem
   * posterior ao pedido — retorno que chegou não é retorno pendente.
   */
  followUpRequestedAt?: string | Date | null;
  sector: string;
  location?: string;
  priority: string;
  waterIssue?: boolean;
  history: HistoryItem[];
  historySubcollectionReady?: boolean;
  historyPagination?: {
    nextCursor: string | null;
    isComplete: boolean;
  };
  viewingBy?: { name: string; at: Date } | null;
  preliminaryActions?: PreliminaryActions;
  closureChecklist?: ClosureChecklist;
  attachments?: TicketAttachment[];
  guarantee?: GuaranteeInfo;
  executionProgress?: ExecutionProgress;

  // ——— agenda operacional (versão nova) ———
  /**
   * A próxima ação desta OS. Ausência é a EXCEÇÃO da regra única, e é ela que
   * aparece na tela — por isso o campo é opcional: o vazio é informação.
   */
  nextAction?: NextAction | null;
  /**
   * Suspensão vigente, quando houver. Ausente = OS ativa — é assim que 268 OS
   * antigas continuam na agenda sem backfill nenhum.
   */
  attention?: TicketAttention | null;
  /**
   * O que o SISTEMA propõe, calculado no servidor a partir de eventos estruturados.
   * O front só apresenta — nunca deriva por conta própria.
   */
  operationalAttention?: OperationalAttention | null;
  /** A correção humana sobre a proposta. Morre quando chega evento novo. */
  attentionOverride?: AttentionOverride | null;
  /** Carimbos que alimentam a projeção. Ver `api/_lib/operationalAttention.js`. */
  lastInboundAt?: Date | null;
  lastOutboundAt?: Date | null;
}

export interface OperationalAttention {
  kind: string;
  dueAt: Date;
  /** De onde veio: a mensagem, a visita, a suspensão. É o que permite explicar. */
  sourceId: string;
  ruleVersion?: number;
  /**
   * Atraso velho demais para ser pauta de hoje. Fica fora da tela e vai para a
   * revisão administrativa — 82 das 102 OS calculadas caem aqui hoje.
   */
  legacy?: boolean;
  computedAt?: Date | null;
}

export interface AttentionOverride {
  /** Amarra a correção ao evento que a originou: evento novo invalida a correção. */
  sourceId: string;
  dueAt?: Date | null;
  kind?: string;
  dismissed?: boolean;
  /**
   * POR QUE a pessoa corrigiu. Não muda o cálculo — existe para dizer se as regras
   * prestam. "Feito" e "não se aplica" somem da tela do mesmo jeito, mas significam
   * coisas opostas: um diz que a regra acertou e alguém resolveu; o outro, que ela
   * classificou mal. Sem separar, não dá para saber qual dos dois está crescendo.
   */
  resolution?: 'feito' | 'adiado' | 'nao-se-aplica';
  changedBy?: string;
  changedAt?: Date | null;
}

export interface QuoteItem {
  id: string;
  section?: string | null;
  description: string;
  materialId?: string | null;
  materialName?: string | null;
  unit?: string | null;
  quantity?: number | null;
  costUnitPrice?: string | null;
  unitPrice?: string | null;
  totalPrice?: string | null;
}

export interface Quote {
  id: number | string;
  vendor: string;
  value: string;
  laborValue?: string | null;
  materialValue?: string | null;
  totalValue?: string | null;
  category?: 'initial' | 'additive';
  initialRoundIndex?: number | null;
  additiveIndex?: number | null;
  additiveReason?: string | null;
  recommended: boolean;
  status?: string;
  attachmentName?: string | null;
  attachmentUrl?: string | null;
  attachmentPath?: string | null;
  proposalHeader?: QuoteProposalHeader | null;
  items?: QuoteItem[];
  classification?: ProcurementClassificationSnapshot;
}

export interface ContractRecord {
  id: string;
  vendor: string;
  value: string;
  initialPlannedValue?: string | null;
  realizedValue?: string | null;
  status: string;
  viewingBy?: string | null;
  signedFileName?: string | null;
  signedFileUrl?: string | null;
  signedFilePath?: string | null;
  signedFileContentType?: string | null;
  signedFileSize?: number | null;
  items?: QuoteItem[];
  classification?: ProcurementClassificationSnapshot;
}

export interface MeasurementRecord {
  id: string;
  label: string;
  progressPercent: number;
  releasePercent: number;
  grossValue?: string | null;
  budgetSource?: 'initial' | 'additive' | null;
  status: 'pending' | 'approved' | 'paid';
  notes?: string;
  attachments?: TicketAttachment[];
  requestedAt?: Date | null;
  approvedAt?: Date | null;
  classification?: ProcurementClassificationSnapshot;
}

export interface PaymentRecord {
  id: string;
  vendor: string;
  value: string;
  grossValue?: string | null;
  budgetSource?: 'initial' | 'additive' | null;
  taxValue?: string | null;
  netValue?: string | null;
  progressPercent?: number | null;
  expectedBaselineValue?: string | null;
  status: string;
  label?: string | null;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  dueAt?: Date | null;
  measurementId?: string | null;
  releasedPercent?: number | null;
  milestonePercent?: number | null;
  receiptFileName?: string | null;
  attachments?: TicketAttachment[];
  paidAt?: Date | null;
  classification?: ProcurementClassificationSnapshot;
}

export interface ProcurementClassificationSnapshot {
  ticketType?: string | null;
  macroServiceId?: string | null;
  macroServiceName?: string | null;
  serviceCatalogId?: string | null;
  serviceCatalogName?: string | null;
  regionId?: string | null;
  regionName?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  sector?: string | null;
}

export interface User {
  id: string;
  name: string;
  role: string;
  email: string;
  status: 'Ativo' | 'Inativo';
}

export interface AppNotification {
  id: string;
  type: 'info' | 'actionable' | 'alert' | 'requester-message' | 'email-bounce';
  title: string;
  body: string;
  time: Date;
  read: boolean;
  ticketId?: string;
  action?: {
    label: string;
    view: ViewState;
    ticketId?: string;
  };
}
