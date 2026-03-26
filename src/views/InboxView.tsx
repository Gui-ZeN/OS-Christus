import React, { useState, useRef, useEffect, useMemo } from 'react';
import { CheckCircle, Loader2, FileText, Shield, List, Play, CheckSquare, Paperclip, Clock, User, Image as ImageIcon, ChevronDown, Plus, MoreHorizontal, Lock, Bold, Italic, ExternalLink, Copy, X, DollarSign, RefreshCw, Trash2 } from 'lucide-react';
import { TicketListItem } from '../components/ui/TicketListItem';
import { PropertyField } from '../components/ui/PropertyField';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ModalShell } from '../components/ui/ModalShell';
import { FloatingToast } from '../components/ui/FloatingToast';
import { useApp } from '../context/AppContext';
import { useClickOutside } from '../hooks/useClickOutside';
import { ContractRecord, InboxFilter, HistoryItem, MeasurementRecord, PaymentRecord, PreliminaryActions, Quote, QuoteItem, Ticket, TicketAttachment } from '../types';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { canTransitionStatus, getAllowedNextStatuses, type AppActorRole } from '../constants/statusFlow';
import { notifyTicketDirectorReply, notifyTicketPublicReply } from '../services/ticketEmail';
import { CatalogMacroService, CatalogMaterial, CatalogRegion, CatalogServiceItem, CatalogSite, CatalogVendorPreference, fetchCatalog } from '../services/catalogApi';
import { DirectoryTeam, DirectoryVendor, fetchDirectory, upsertVendor } from '../services/directoryApi';
import { fetchProcurementData, saveContract, saveMeasurement, savePayment, saveQuotes } from '../services/procurementApi';
import { fetchSettings, saveSettings } from '../services/settingsApi';
import { uploadContractAttachment, uploadMessageAttachment, uploadQuoteAttachment } from '../services/ticketStorage';
import { deleteTicketInApi } from '../services/ticketsApi';
import { getAuthenticatedActorHeaders } from '../services/actorHeaders';
import { buildBudgetHistorySummary, formatBudgetHistoryValue } from '../utils/budgetHistory';
import { buildValidationClosureChecklist } from '../utils/closureChecklist';
import { getApprovedReleasePercent, getNextMilestonePercentByProgress, getPaymentFlowMilestones } from '../utils/executionFlow';
import { buildProcurementClassification } from '../utils/procurementClassification';
import { formatDateTimeSafe } from '../utils/date';
import { getTicketRegionLabel, getTicketSiteLabel } from '../utils/ticketTerritory';

type QuoteDraft = {
  vendor: string;
  value: string;
  laborValue?: string;
  materialValue?: string;
  totalValue?: string;
  items: QuoteItem[];
};

type ProposalHeaderDraft = {
  unitName: string;
  location: string;
  folderLink: string;
  contractedVendor: string;
  totalQuantity: string;
  totalEstimatedValue: string;
};

const QUOTE_SECTION_OPTIONS = [
  { value: 'material', label: 'Material' },
  { value: 'mao-de-obra', label: 'Mão de obra' },
  { value: 'materiais-complementares', label: 'Materiais complementares' },
  { value: 'servicos-complementares', label: 'Serviços complementares' },
] as const;

const DEFAULT_QUOTE_UNIT_OPTIONS = [
  'UN',
  'PÇ',
  'CX',
  'PC',
  'CT',
  'PR',
  'RL',
  'DZ',
  'GS',
  'CENTO',
  'KG',
  'G',
  'SC60',
  'L',
  'ML',
  'M3',
  'M',
  'CM',
  'M2',
] as const;

const CUSTOM_QUOTE_UNIT_VALUE = '__custom_unit__';
const INITIAL_MIN_QUOTE_SLOTS = 2;
const INITIAL_MAX_QUOTE_SLOTS = 3;
const ADDITIVE_FIXED_QUOTE_SLOTS = 1;

const TRIAGE_VISIBLE_STATUSES = [
  TICKET_STATUS.NEW,
  TICKET_STATUS.WAITING_TECH_OPINION,
  TICKET_STATUS.WAITING_SOLUTION_APPROVAL,
  TICKET_STATUS.WAITING_BUDGET,
  TICKET_STATUS.WAITING_BUDGET_APPROVAL,
  TICKET_STATUS.WAITING_CONTRACT_UPLOAD,
  TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
] as const;

function normalizeUnitAbbreviation(value?: string | null) {
  if (!value) return '';
  return value.trim().toUpperCase();
}

const EMPTY_TICKET: Ticket = {
  id: '',
  trackingToken: '',
  subject: '',
  requester: '',
  requesterEmail: '',
  time: new Date(),
  status: TICKET_STATUS.NEW,
  type: '',
  region: '',
  sede: '',
  sector: '',
  priority: '',
  history: [],
  viewingBy: null,
};

const PRELIMINARY_ITEMS = [
  { id: 'materialRequested', label: 'Compra de material solicitada' },
  { id: 'teamConfirmed', label: 'Equipe responsável confirmada' },
  { id: 'sitePrepared', label: 'Local organizado para manutenção' },
  { id: 'scheduleDefined', label: 'Cronograma de atividades definido' },
  { id: 'stakeholderAligned', label: 'Alinhamento com direção/supervisão concluído' },
  { id: 'accessReleased', label: 'Acesso ao local liberado pela unidade' },
] as const;

const ALL_INBOX_STATUS_OPTIONS = [
  TICKET_STATUS.NEW,
  TICKET_STATUS.WAITING_TECH_OPINION,
  TICKET_STATUS.WAITING_SOLUTION_APPROVAL,
  TICKET_STATUS.WAITING_BUDGET,
  TICKET_STATUS.WAITING_BUDGET_APPROVAL,
  TICKET_STATUS.WAITING_CONTRACT_UPLOAD,
  TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
  TICKET_STATUS.WAITING_PRELIM_ACTIONS,
  TICKET_STATUS.IN_PROGRESS,
  TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL,
  TICKET_STATUS.WAITING_PAYMENT,
  TICKET_STATUS.CLOSED,
  TICKET_STATUS.CANCELED,
] as const;

function resolveActorRole(role?: string | null): AppActorRole {
  if (role === 'Admin' || role === 'Diretor') return role;
  return 'Usuario';
}

type PreliminaryChecklistKey = (typeof PRELIMINARY_ITEMS)[number]['id'];

interface PreliminaryFormState {
  materialRequested: boolean;
  materialEta: string;
  teamConfirmed: boolean;
  sitePrepared: boolean;
  scheduleDefined: boolean;
  stakeholderAligned: boolean;
  accessReleased: boolean;
  plannedStartAt: string;
  blockerNotes: string;
}

interface ExecutionSetupFormState {
  paymentFlowParts: string;
  measurementSheetUrl: string;
  notes: string;
}

interface ProgressUpdateFormState {
  grossAmount: string;
  notes: string;
}

interface TicketDetailsFormState {
  subject: string;
  requester: string;
  requesterEmail: string;
  sector: string;
  macroServiceId: string;
  serviceCatalogId: string;
}

function formatInputDate(value?: Date | null) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  return value.toISOString().slice(0, 10);
}

function formatShortDate(value?: Date | null) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return 'Não definido';
  return value.toLocaleDateString('pt-BR');
}

function createPreliminaryFormState(preliminaryActions?: PreliminaryActions): PreliminaryFormState {
  return {
    materialRequested: preliminaryActions?.materialRequested ?? false,
    materialEta: formatInputDate(preliminaryActions?.materialEta),
    teamConfirmed: preliminaryActions?.teamConfirmed ?? false,
    sitePrepared: preliminaryActions?.sitePrepared ?? false,
    scheduleDefined: preliminaryActions?.scheduleDefined ?? false,
    stakeholderAligned: preliminaryActions?.stakeholderAligned ?? false,
    accessReleased: preliminaryActions?.accessReleased ?? false,
    plannedStartAt: formatInputDate(preliminaryActions?.plannedStartAt),
    blockerNotes: preliminaryActions?.blockerNotes ?? '',
  };
}

function createExecutionSetupFormState(ticket?: Ticket): ExecutionSetupFormState {
  return {
    paymentFlowParts: String(ticket?.executionProgress?.paymentFlowParts || 5),
    measurementSheetUrl: ticket?.executionProgress?.measurementSheetUrl || '',
    notes: '',
  };
}

function createProgressUpdateFormState(_ticket?: Ticket): ProgressUpdateFormState {
  return {
    grossAmount: '',
    notes: '',
  };
}

function createTicketDetailsFormState(ticket?: Ticket): TicketDetailsFormState {
  return {
    subject: ticket?.subject || '',
    requester: ticket?.requester || '',
    requesterEmail: ticket?.requesterEmail || '',
    sector: ticket?.sector || '',
    macroServiceId: ticket?.macroServiceId || '',
    serviceCatalogId: ticket?.serviceCatalogId || '',
  };
}

function arePreliminaryActionsReady(form: PreliminaryFormState) {
  return PRELIMINARY_ITEMS.every(item => form[item.id]);
}

function buildPreliminarySummary(preliminaryActions?: PreliminaryActions) {
  if (!preliminaryActions) return 'Nenhuma ação preliminar registrada.';

  const completed = PRELIMINARY_ITEMS.filter(item => preliminaryActions[item.id]).length;
  const parts = [`${completed}/${PRELIMINARY_ITEMS.length} itens concluídos`];

  if (preliminaryActions.materialEta) {
    parts.push(`material previsto para ${formatShortDate(preliminaryActions.materialEta)}`);
  }
  if (preliminaryActions.plannedStartAt) {
    parts.push(`início previsto em ${formatShortDate(preliminaryActions.plannedStartAt)}`);
  }
  if (preliminaryActions.blockerNotes?.trim()) {
    parts.push('há impedimentos registrados');
  }

  return parts.join(' | ');
}

function createEmptyQuoteItem(defaultDescription = '', defaultUnit = ''): QuoteItem {
  return {
    id: crypto.randomUUID(),
    section: 'material',
    description: defaultDescription,
    materialId: null,
    materialName: null,
    unit: defaultUnit || null,
    quantity: null,
    costUnitPrice: null,
    unitPrice: null,
    totalPrice: null,
  };
}

function createEmptyQuoteDraft(): QuoteDraft {
  return {
    vendor: '',
    value: '',
    laborValue: '',
    materialValue: '',
    totalValue: '',
    items: [createEmptyQuoteItem()],
  };
}

function createProposalHeaderDraft(ticket?: Ticket, siteLabel?: string): ProposalHeaderDraft {
  return {
    unitName: siteLabel || ticket?.sede || '',
    location: '',
    folderLink: '',
    contractedVendor: '',
    totalQuantity: '',
    totalEstimatedValue: '',
  };
}

function getQuoteSections(items: QuoteItem[]) {
  const values = new Set<string>();
  for (const item of items) {
    values.add(normalizeQuoteSection(item.section));
  }
  if (values.size === 0) values.add('material');
  return Array.from(values);
}

function getQuoteSectionLabel(section: string) {
  return QUOTE_SECTION_OPTIONS.find(option => option.value === section)?.label || section;
}

function parseCurrencyInput(value: string) {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrencyInput(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function isLegacyFlowPlaceholderPayment(payment: PaymentRecord) {
  const hasGross = parseCurrencyInput(payment.grossValue || '') > 0;
  const hasValue = parseCurrencyInput(payment.value || '') > 0;
  const hasTax = parseCurrencyInput(payment.taxValue || '') > 0;
  const hasNet = parseCurrencyInput(payment.netValue || '') > 0;
  const hasMeasurementLink = Boolean(payment.measurementId);
  const hasAttachments = Array.isArray(payment.attachments) && payment.attachments.length > 0;
  const hasReceipt = Boolean(payment.receiptFileName);
  const isUnpaidStatus = payment.status === 'pending' || payment.status === 'approved';
  return isUnpaidStatus && !hasGross && !hasValue && !hasTax && !hasNet && !hasMeasurementLink && !hasAttachments && !hasReceipt;
}

function stripLegacyFlowPlaceholders(payments: PaymentRecord[]) {
  return payments.filter(payment => !isLegacyFlowPlaceholderPayment(payment));
}

function normalizeCurrencyInput(value: string) {
  const parsed = parseCurrencyInput(value);
  return parsed > 0 ? formatCurrencyInput(parsed) : '';
}

function sanitizeCurrencyTypingInput(value: string) {
  return String(value || '').replace(/[^\d,.-]/g, '');
}

function normalizeTagValue(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function roundProgressPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function resolveExpectedBaselineValue(contract?: ContractRecord, payments: PaymentRecord[] = []) {
  const contractInitial = parseCurrencyInput(contract?.initialPlannedValue || '');
  if (contractInitial > 0) return contractInitial;

  const paymentBaseline = parseCurrencyInput(payments[0]?.expectedBaselineValue || '');
  if (paymentBaseline > 0) return paymentBaseline;

  const contractValue = parseCurrencyInput(contract?.value || '');
  if (contractValue > 0) return contractValue;

  return parseCurrencyInput(payments[0]?.value || '');
}

function calculateProgressPercentFromGross(grossAmount: number, baselineValue: number) {
  if (!Number.isFinite(grossAmount) || grossAmount < 0 || baselineValue <= 0) return 0;
  return roundProgressPercent((grossAmount / baselineValue) * 100);
}

function normalizeQuoteSection(section?: string | null) {
  const normalized = String(section || '').trim();
  if (!normalized || normalized === 'material-mao-de-obra') return 'material';
  return normalized;
}

function isLaborSection(section?: string | null) {
  const normalized = normalizeQuoteSection(section).toLowerCase();
  return normalized.includes('mao-de-obra') || normalized.includes('servico');
}

function summarizeQuoteDraft(draft: QuoteDraft) {
  const totals = draft.items.reduce(
    (acc, item) => {
      const lineTotal = parseCurrencyInput(item.totalPrice || '');
      if (lineTotal <= 0) return acc;
      if (isLaborSection(item.section)) {
        acc.labor += lineTotal;
      } else {
        acc.material += lineTotal;
      }
      return acc;
    },
    { labor: 0, material: 0 }
  );
  const total = totals.labor + totals.material;
  return {
    laborValue: totals.labor > 0 ? formatCurrencyInput(totals.labor) : '',
    materialValue: totals.material > 0 ? formatCurrencyInput(totals.material) : '',
    totalValue: total > 0 ? formatCurrencyInput(total) : '',
  };
}

function getAvailableAdditiveRounds(quotes: Quote[]) {
  return Array.from(
    new Set(
      (Array.isArray(quotes) ? quotes : [])
        .filter(quote => quote.category === 'additive')
        .map(quote => Number(quote.additiveIndex || 0))
        .filter(value => Number.isFinite(value) && value > 0)
    )
  ).sort((a, b) => a - b);
}

function getQuotesByRound(quotes: Quote[], roundType: 'initial' | 'additive', additiveIndex: number) {
  const list = Array.isArray(quotes) ? quotes : [];
  const filtered = list.filter(quote => {
    const category = quote.category === 'additive' ? 'additive' : 'initial';
    if (roundType !== category) return false;
    if (roundType === 'additive') {
      return Number(quote.additiveIndex || 1) === Number(additiveIndex || 1);
    }
    return true;
  });

  return filtered.sort((a, b) => String(a.id).localeCompare(String(b.id), 'pt-BR'));
}

function getRoundMinQuoteSlots(roundType: 'initial' | 'additive') {
  return roundType === 'additive' ? ADDITIVE_FIXED_QUOTE_SLOTS : INITIAL_MIN_QUOTE_SLOTS;
}

function getRoundMaxQuoteSlots(roundType: 'initial' | 'additive') {
  return roundType === 'additive' ? ADDITIVE_FIXED_QUOTE_SLOTS : INITIAL_MAX_QUOTE_SLOTS;
}

function getExecutionNextActionLabel(ticket: Ticket) {
  if (ticket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS) return 'Concluir ações preliminares e liberar o início da execução.';
  if (ticket.status === TICKET_STATUS.IN_PROGRESS) return 'Atualizar o andamento da obra e liberar os próximos marcos.';
  if (ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL) return 'Aguardar validação do solicitante para avançar para o financeiro.';
  if (ticket.status === TICKET_STATUS.WAITING_PAYMENT) return 'Concluir lançamentos pendentes e finalizar o encerramento financeiro.';
  if (ticket.status === TICKET_STATUS.CLOSED) return 'Acompanhar garantia e documentos finais, se necessário.';
  return 'Sem ação operacional pendente nesta etapa.';
}

export function InboxView() {
  const {
    currentView,
    navigateTo,
    openAttachment,
    activeTicketId,
    setActiveTicketId,
    inboxFilter,
    setInboxFilter,
    tickets,
    refreshTickets,
    updateTicket,
    addTicket,
    currentUser,
  } = useApp();

  const [replyMode, setReplyMode] = useState<'public' | 'internal' | 'director'>('internal');
  const [replyText, setReplyText] = useState('');
  const [techTeam, setTechTeam] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [ticketPriority, setTicketPriority] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [sidebarSections, setSidebarSections] = useState({
    summary: true,
    classification: true,
    execution: true,
  });
  const [ticketDetailsForm, setTicketDetailsForm] = useState<TicketDetailsFormState>(createTicketDetailsFormState());
  const [teams, setTeams] = useState<DirectoryTeam[]>([]);
  const [vendors, setVendors] = useState<DirectoryVendor[]>([]);
  const [sharedThirdPartyTags, setSharedThirdPartyTags] = useState<string[]>([]);
  const [thirdPartyTag, setThirdPartyTag] = useState('');
  const [selectedThirdPartyIds, setSelectedThirdPartyIds] = useState<string[]>([]);
  const [thirdPartySelectDraftId, setThirdPartySelectDraftId] = useState('');
  const [newThirdPartyName, setNewThirdPartyName] = useState('');
  const [newThirdPartyEmail, setNewThirdPartyEmail] = useState('');
  const [newThirdPartyTags, setNewThirdPartyTags] = useState<string[]>([]);
  const [newSharedTagDraft, setNewSharedTagDraft] = useState('');
  const [newSharedTagSaving, setNewSharedTagSaving] = useState(false);
  const [showThirdPartyModal, setShowThirdPartyModal] = useState(false);
  const [quickPanelExpanded, setQuickPanelExpanded] = useState(true);
  const [catalogRegions, setCatalogRegions] = useState<CatalogRegion[]>([]);
  const [catalogSites, setCatalogSites] = useState<CatalogSite[]>([]);
  const [catalogMacroServices, setCatalogMacroServices] = useState<CatalogMacroService[]>([]);
  const [catalogMaterials, setCatalogMaterials] = useState<CatalogMaterial[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<CatalogServiceItem[]>([]);
  const [vendorPreferences, setVendorPreferences] = useState<CatalogVendorPreference[]>([]);
  const displayActor = currentUser?.name || 'Gestor';
  const displayActorLabel = currentUser?.role ? `${displayActor} (${currentUser.role})` : displayActor;
  const canManageStatus = currentUser?.role === 'Admin';
  const canDeleteTicket = currentUser?.role === 'Admin';
  const canMessageDirector = currentUser?.role === 'Admin' || currentUser?.role === 'Diretor';

  const replyFileRef = useRef<HTMLInputElement>(null);
  const replyTextRef = useRef<HTMLTextAreaElement>(null);
  const lastMailSyncAtRef = useRef(0);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);

  useEffect(() => {
    if (currentView !== 'inbox') return undefined;

    const runSilentRefresh = async () => {
      if (document.visibilityState !== 'visible') return;
      await refreshTickets({ silent: true });

      const canRunMailSync = currentUser?.role === 'Admin';
      if (!canRunMailSync) return;

      const now = Date.now();
      const elapsed = now - lastMailSyncAtRef.current;
      if (elapsed < 60000) return;
      lastMailSyncAtRef.current = now;

      try {
        await fetch('/api/mail?route=gmail-sync', {
          method: 'POST',
          headers: await getAuthenticatedActorHeaders(),
        });
      } catch {
        // Sync silencioso: erro não deve bloquear atualização da inbox.
      }
    };

    const interval = window.setInterval(() => {
      void runSilentRefresh();
    }, 10000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void runSilentRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser?.role, currentView, refreshTickets]);

  // Estado derivado: usa tickets do contexto (mutável)
  const hasTickets = tickets.length > 0;
  const activeTicket = tickets.find(t => t.id === activeTicketId) ?? tickets[0] ?? EMPTY_TICKET;
  const isClosed = !hasTickets || activeTicket.status === TICKET_STATUS.CLOSED || activeTicket.status === TICKET_STATUS.CANCELED;
  const canEditQuickPanel = canManageStatus || activeTicket.status === TICKET_STATUS.NEW;
  const actorRole = resolveActorRole(currentUser?.role);
  const statusOptions = useMemo(() => {
    const current = activeTicket.status;
    if (!current) return [...ALL_INBOX_STATUS_OPTIONS];
    const allowed = getAllowedNextStatuses(actorRole, 'inbox', current);
    const next = new Set<Ticket['status']>([current, ...allowed]);
    if (current === TICKET_STATUS.CLOSED) {
      next.add(TICKET_STATUS.IN_PROGRESS);
    }
    if (current === TICKET_STATUS.CANCELED) {
      next.add(TICKET_STATUS.NEW);
    }
    const ordered = [...ALL_INBOX_STATUS_OPTIONS].filter(status => next.has(status));
    return ordered.length > 0 ? ordered : [...ALL_INBOX_STATUS_OPTIONS];
  }, [activeTicket.status, actorRole]);

  // Reseta os campos ao trocar de ticket
  useEffect(() => {
    setReplyText('');
    setTechTeam(activeTicket.assignedTeam || '');
    setCustomEmail(activeTicket.assignedEmail || '');
    setTicketPriority(activeTicket.status === TICKET_STATUS.NEW ? '' : activeTicket.priority || '');
    setStatusDraft(activeTicket.status || '');
    setTicketDetailsForm(createTicketDetailsFormState(activeTicket));
    setExecutionSetupForm(createExecutionSetupFormState(activeTicket));
    setProgressUpdateForm(createProgressUpdateFormState(activeTicket));
    setThirdPartyTag('');
    if (activeTicket.assignedEmail) {
      const assignedEmails = String(activeTicket.assignedEmail || '')
        .split(',')
        .map(item => item.trim().toLowerCase())
        .filter(Boolean);
      const matchedIds = vendors
        .filter(vendor => assignedEmails.includes(String(vendor.email || '').trim().toLowerCase()))
        .map(vendor => vendor.id);
      setSelectedThirdPartyIds(matchedIds);
    } else {
      setSelectedThirdPartyIds([]);
    }
    setThirdPartySelectDraftId('');
    setQuickPanelExpanded(activeTicket.status === TICKET_STATUS.NEW);
    setNewThirdPartyName('');
    setNewThirdPartyEmail('');
    setNewThirdPartyTags([]);
    setReplyFiles([]);
    setContractDispatchFile(null);
    if (replyFileRef.current) replyFileRef.current.value = '';
  }, [
    activeTicketId,
    activeTicket.assignedEmail,
    activeTicket.assignedTeam,
    activeTicket.priority,
    activeTicket.status,
    activeTicket.subject,
    activeTicket.requester,
    activeTicket.requesterEmail,
    activeTicket.sector,
    activeTicket.macroServiceId,
    activeTicket.serviceCatalogId,
    activeTicket.executionProgress?.paymentFlowParts,
    activeTicket.executionProgress?.currentPercent,
    vendors,
  ]);

  useEffect(() => {
    setSidebarSections({
      summary: true,
      classification: true,
      execution: [
        TICKET_STATUS.WAITING_PRELIM_ACTIONS,
        TICKET_STATUS.IN_PROGRESS,
        TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL,
        TICKET_STATUS.WAITING_PAYMENT,
        TICKET_STATUS.CLOSED,
      ].includes(activeTicket.status),
    });
  }, [activeTicket.id, activeTicket.status]);

  useEffect(() => {
    setPrelimForm(createPreliminaryFormState(activeTicket.preliminaryActions));
  }, [activeTicket.id, activeTicket.preliminaryActions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const directory = await fetchDirectory();
        if (!cancelled) {
          setTeams((directory.teams || []).filter(team => team.active !== false));
          setVendors((directory.vendors || []).filter(vendor => vendor.active !== false));
        }
      } catch {
        if (!cancelled) {
          setTeams([]);
          setVendors([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await fetchSettings();
        if (!cancelled) {
          setSharedThirdPartyTags(
            Array.isArray(settings.thirdPartyTags?.tags)
              ? settings.thirdPartyTags.tags.map(tag => String(tag || '').trim()).filter(Boolean)
              : []
          );
        }
      } catch {
        if (!cancelled) {
          setSharedThirdPartyTags([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const catalog = await fetchCatalog();
        if (!cancelled) {
          setCatalogRegions(catalog.regions);
          setCatalogSites(catalog.sites);
          setCatalogMacroServices(catalog.macroServices);
          setCatalogMaterials(catalog.materials);
          setServiceCatalog(catalog.serviceCatalog);
          setVendorPreferences(catalog.vendorPreferences);
        }
      } catch {
        if (!cancelled) {
          setCatalogRegions([]);
          setCatalogSites([]);
          setCatalogMacroServices([]);
          setCatalogMaterials([]);
          setServiceCatalog([]);
          setVendorPreferences([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const procurement = await fetchProcurementData();
        if (!cancelled) {
          setStoredQuotesByTicket(procurement.quotesByTicket);
          setContractsByTicket(procurement.contractsByTicket);
          setPaymentsByTicket(procurement.paymentsByTicket);
        }
      } catch {
        if (!cancelled) {
          setStoredQuotesByTicket({});
          setContractsByTicket({});
          setPaymentsByTicket({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleTechTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setTechTeam(newValue);
    if (newValue !== techTeam) {
      setShowThirdPartyModal(false);
      setCustomEmail('');
      setSelectedThirdPartyIds([]);
      setThirdPartySelectDraftId('');
      setThirdPartyTag('');
    }
  };

  const handleCreateThirdParty = async () => {
    const name = newThirdPartyName.trim();
    if (!name) {
      setToast('Informe o nome do terceiro para cadastrar.');
      setTimeout(() => setToast(null), 2500);
      return;
    }

    const tags = newThirdPartyTags
      .map(tag => normalizeTagValue(tag))
      .filter(Boolean);

    try {
      const response = await upsertVendor({
        name,
        email: newThirdPartyEmail.trim(),
        tags,
        active: true,
      });
      const nextVendor = response.vendor || {
        id: normalizeTagValue(name).replace(/[^a-z0-9-]/g, '-') || `terceiro-${Date.now()}`,
        name,
        email: newThirdPartyEmail.trim(),
        tags,
        active: true,
      };
      setVendors(current => {
        const withoutCurrent = current.filter(item => item.id !== nextVendor.id);
        return [...withoutCurrent, nextVendor].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      });
      setSelectedThirdPartyIds(current =>
        current.some(item => item === nextVendor.id) ? current : [...current, nextVendor.id]
      );
      setThirdPartySelectDraftId('');
      if (tags.length > 0) {
        setThirdPartyTag(tags[0]);
      }
      setNewThirdPartyName('');
      setNewThirdPartyEmail('');
      setNewThirdPartyTags([]);
      setToast('Terceiro cadastrado com sucesso.');
      setTimeout(() => setToast(null), 2500);
    } catch (error) {
      setToast(`Erro ao cadastrar terceiro: ${error instanceof Error ? error.message : 'falha inesperada.'}`);
      setTimeout(() => setToast(null), 3500);
    }
  };

  const handleCreateSharedTagInline = async () => {
    const normalized = String(newSharedTagDraft || '').trim();
    if (!normalized) return;
    const exists = sharedThirdPartyTags.some(tag => tag.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      setToast('Essa tag já existe.');
      setTimeout(() => setToast(null), 2500);
      return;
    }

    const nextTags = [...sharedThirdPartyTags, normalized].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    setNewSharedTagSaving(true);
    try {
      await saveSettings('thirdPartyTags', { tags: nextTags });
      setSharedThirdPartyTags(nextTags);
      setNewThirdPartyTags(prev => (prev.some(item => item.toLowerCase() === normalized.toLowerCase()) ? prev : [...prev, normalized]));
      setNewSharedTagDraft('');
      setToast('Tag compartilhada cadastrada.');
      setTimeout(() => setToast(null), 2500);
    } catch (error) {
      setToast(`Erro ao salvar tag: ${error instanceof Error ? error.message : 'falha inesperada.'}`);
      setTimeout(() => setToast(null), 3500);
    } finally {
      setNewSharedTagSaving(false);
    }
  };

  const handlePriorityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setTicketPriority(newValue);
  };

  const selectedTeam = teams.find(team => team.name === techTeam);
  const isExternalTeam = selectedTeam?.type === 'external';
  const selectedThirdParties = vendors.filter(vendor => selectedThirdPartyIds.includes(vendor.id));
  const selectedThirdPartyEmails = selectedThirdParties
    .map(vendor => String(vendor.email || '').trim())
    .filter(Boolean);
  const resolveAssignedEmails = () => {
    const manualEmails = customEmail
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
    return Array.from(new Set([...selectedThirdPartyEmails, ...manualEmails])).join(', ');
  };
  const quickPanelCollapsed = activeTicket.status !== TICKET_STATUS.NEW && !quickPanelExpanded;
  const thirdPartyTagOptions = useMemo(() => {
    return (Array.from(new Set(sharedThirdPartyTags.map(tag => String(tag || '').trim()).filter(Boolean))) as string[]).sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
  }, [sharedThirdPartyTags]);
  const sharedThirdPartyTagSet = useMemo(() => new Set(thirdPartyTagOptions.map(tag => normalizeTagValue(tag))), [thirdPartyTagOptions]);
  const resolveVendorSharedTags = (vendor: DirectoryVendor) =>
    (vendor.tags || []).filter(tag => sharedThirdPartyTagSet.has(normalizeTagValue(tag)));
  const filteredThirdParties = useMemo(() => {
    if (!thirdPartyTag.trim()) return vendors;
    const normalizedTag = normalizeTagValue(thirdPartyTag);
    return vendors.filter(vendor =>
      resolveVendorSharedTags(vendor).some(tag => normalizeTagValue(tag) === normalizedTag)
    );
  }, [thirdPartyTag, vendors, sharedThirdPartyTagSet]);

  useEffect(() => {
    if (!isExternalTeam && showThirdPartyModal) {
      setShowThirdPartyModal(false);
    }
  }, [isExternalTeam, showThirdPartyModal]);
  const panelStatus = (statusDraft || activeTicket.status || '').trim();
  const showTriagePanel = TRIAGE_VISIBLE_STATUSES.includes(panelStatus as (typeof TRIAGE_VISIBLE_STATUSES)[number]);
  const canManageBudgetRounds =
    panelStatus.includes('Orçamento') ||
    panelStatus.includes('Cotação') ||
    panelStatus === TICKET_STATUS.WAITING_CONTRACT_UPLOAD ||
    (panelStatus.includes('Anexo') && panelStatus.includes('Contrato')) ||
    panelStatus === TICKET_STATUS.IN_PROGRESS ||
    panelStatus === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL ||
    panelStatus === TICKET_STATUS.WAITING_PAYMENT ||
    panelStatus === TICKET_STATUS.CLOSED;
  const executionNextActionLabel = getExecutionNextActionLabel(activeTicket);
  const availableAdminServiceItems = useMemo(() => {
    if (!ticketDetailsForm.macroServiceId) return [];
    return serviceCatalog.filter(item => item.macroServiceId === ticketDetailsForm.macroServiceId);
  }, [ticketDetailsForm.macroServiceId, serviceCatalog]);

  const handleMacroServiceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!canManageStatus) return;
    const nextMacroServiceId = event.target.value;
    setTicketDetailsForm(prev => ({
      ...prev,
      macroServiceId: nextMacroServiceId,
      serviceCatalogId: '',
    }));
  };

  const handleServiceCatalogChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!canManageStatus) return;
    const nextServiceId = event.target.value;
    setTicketDetailsForm(prev => ({ ...prev, serviceCatalogId: nextServiceId }));
  };

  const resolveClassificationSelection = () => {
    const nextMacroService = catalogMacroServices.find(item => item.id === ticketDetailsForm.macroServiceId) || null;
    const nextService =
      serviceCatalog.find(
        item => item.id === ticketDetailsForm.serviceCatalogId && item.macroServiceId === (nextMacroService?.id || '')
      ) || null;

    return {
      macroServiceId: nextMacroService?.id || '',
      macroServiceName: nextMacroService?.name || '',
      serviceCatalogId: nextService?.id || '',
      serviceCatalogName: nextService?.name || '',
    };
  };

  const buildStatusSideEffects = (nextStatus: string, when: Date) => {
    const nextPreliminaryActions =
      nextStatus === TICKET_STATUS.IN_PROGRESS
        ? {
            ...(activeTicket.preliminaryActions || {}),
            actualStartAt: activeTicket.preliminaryActions?.actualStartAt || when,
            updatedAt: when,
          }
        : activeTicket.preliminaryActions;

    const nextClosureChecklist =
      nextStatus === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL || nextStatus === TICKET_STATUS.WAITING_PAYMENT
        ? buildValidationClosureChecklist(activeTicket, when)
        : activeTicket.closureChecklist;

    return {
      preliminaryActions: nextPreliminaryActions,
      closureChecklist: nextClosureChecklist,
    };
  };

  const resolveReopenStatus = () => {
    if (activeTicket.status === TICKET_STATUS.CLOSED) return TICKET_STATUS.IN_PROGRESS;
    if (activeTicket.status === TICKET_STATUS.CANCELED) return TICKET_STATUS.NEW;
    return TICKET_STATUS.NEW;
  };

  const handleSaveQuickPanel = () => {
    if (!canManageStatus || isSending) return;

    if (isExternalTeam && selectedThirdParties.length === 0) {
      setToast('Selecione ao menos um terceiro responsável para equipes externas.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const nextStatus = statusDraft || activeTicket.status;
    const nextAssignedEmail = isExternalTeam ? resolveAssignedEmails() : '';
    const nextClassification = resolveClassificationSelection();
    const changes: string[] = [];
    const updates: Partial<Ticket> = {};

    if ((techTeam || '') !== (activeTicket.assignedTeam || '')) {
      updates.assignedTeam = techTeam || '';
      changes.push('responsável técnico');
    }
    if ((ticketPriority || '') !== (activeTicket.priority || '')) {
      updates.priority = ticketPriority || '';
      changes.push('urgência');
    }
    if (nextAssignedEmail !== (activeTicket.assignedEmail || '')) {
      updates.assignedEmail = nextAssignedEmail;
      changes.push('e-mail do terceiro');
    }
    if ((nextClassification.macroServiceId || '') !== (activeTicket.macroServiceId || '')) {
      updates.macroServiceId = nextClassification.macroServiceId;
      updates.macroServiceName = nextClassification.macroServiceName;
      changes.push('macroserviço');
    }
    if ((nextClassification.serviceCatalogId || '') !== (activeTicket.serviceCatalogId || '')) {
      updates.serviceCatalogId = nextClassification.serviceCatalogId;
      updates.serviceCatalogName = nextClassification.serviceCatalogName;
      changes.push('serviço');
    }
    if (nextStatus !== activeTicket.status) {
      if (!canTransitionStatus(actorRole, 'inbox', activeTicket.status, nextStatus)) {
        setToast(`Transição inválida de status: ${activeTicket.status} -> ${nextStatus}.`);
        setTimeout(() => setToast(null), 3500);
        return;
      }
      Object.assign(updates, buildStatusSideEffects(nextStatus, new Date()));
      updates.status = nextStatus;
      changes.push(`status: ${activeTicket.status} -> ${nextStatus}`);
    }

    if (changes.length === 0) {
      setToast('Nenhuma alteração encontrada no painel da OS.');
      setTimeout(() => setToast(null), 2500);
      return;
    }

    updateTicket(activeTicket.id, {
      ...updates,
      history: [
        ...activeTicket.history,
        {
          id: crypto.randomUUID(),
          type: 'system',
          sender: displayActorLabel,
          time: new Date(),
          text: `Painel da OS atualizado: ${changes.join(' · ')}.`,
        },
      ],
    });

    setToast('Painel da OS atualizado.');
    setTimeout(() => setToast(null), 2500);
  };

  const handleAcceptTicket = () => {
    if (isSending) return;

    if (!techTeam) {
      setToast('Defina a equipe responsável antes de aceitar a OS.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    if (!ticketPriority) {
      setToast('Defina o grau de urgência antes de aceitar a OS.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    if (isExternalTeam && selectedThirdParties.length === 0) {
      setToast('Selecione ao menos um terceiro responsável para encaminhamento externo.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const target = isExternalTeam
      ? (selectedThirdParties.map(vendor => vendor.name).join(', ') || 'Terceiro selecionado')
      : techTeam;
    const nextAssignedEmail = isExternalTeam ? resolveAssignedEmails() : '';
    const nextClassification = resolveClassificationSelection();
    updateTicket(activeTicket.id, {
      status: TICKET_STATUS.WAITING_TECH_OPINION,
      priority: ticketPriority,
      assignedTeam: techTeam,
      assignedEmail: nextAssignedEmail,
      macroServiceId: nextClassification.macroServiceId,
      macroServiceName: nextClassification.macroServiceName,
      serviceCatalogId: nextClassification.serviceCatalogId,
      serviceCatalogName: nextClassification.serviceCatalogName,
      history: [
        ...activeTicket.history,
        {
          id: crypto.randomUUID(),
          type: 'system',
          sender: displayActorLabel,
          time: new Date(),
          text: `Triagem concluída. OS aceita com prioridade ${ticketPriority} e encaminhada para ${target}.`,
        },
      ],
    });

    setStatusDraft(TICKET_STATUS.WAITING_TECH_OPINION);
    setToast('Triagem concluída e OS aceita.');
    setTimeout(() => setToast(null), 2500);
  };

  // Botão principal de ação: transição de status + registro no histórico
  const handleSend = async () => {
    if (isSending) return;
    setIsSending(true);
    const now = new Date();
    const sender = displayActorLabel;
    const trimmedReply = replyText.trim();

    const buildAttachmentText = (attachments: TicketAttachment[]) => {
      const links = attachments
        .filter(item => String(item?.url || '').trim())
        .map(item => `- ${item.name}: ${item.url}`);
      if (links.length === 0) return '';
      return `Anexos enviados:\n${links.join('\n')}`;
    };

    try {
      let uploadedReplyAttachments: TicketAttachment[] = [];
      if (replyFiles.length > 0) {
        uploadedReplyAttachments = await Promise.all(
          replyFiles.map(file => uploadMessageAttachment(activeTicket.id, replyMode, file))
        );
      }

      const messageWithAttachments = [trimmedReply, buildAttachmentText(uploadedReplyAttachments)]
        .filter(Boolean)
        .join('\n\n')
        .trim();

      if (replyMode === 'internal') {
        const items: HistoryItem[] = [];
        let newStatus = activeTicket.status;

        if (activeTicket.status === TICKET_STATUS.WAITING_TECH_OPINION) {
          newStatus = TICKET_STATUS.WAITING_SOLUTION_APPROVAL;
          if (trimmedReply || uploadedReplyAttachments.length > 0) {
            items.push({
              id: crypto.randomUUID(),
              type: 'tech',
              sender,
              time: now,
              text: messageWithAttachments || 'Parecer técnico encaminhado para aprovação.',
              visibility: 'internal',
              attachments: uploadedReplyAttachments.length > 0 ? uploadedReplyAttachments : undefined,
            });
          }
          items.push({
            id: crypto.randomUUID(),
            type: 'system',
            sender,
            time: new Date(now.getTime() + 1),
            text: 'Parecer consolidado e enviado para aprovação da Diretoria.',
            visibility: 'internal',
          });
        } else if (trimmedReply || uploadedReplyAttachments.length > 0) {
          items.push({
            id: crypto.randomUUID(),
            type: 'internal',
            sender,
            time: now,
            text: messageWithAttachments || 'Atualização interna com anexos.',
            visibility: 'internal',
            attachments: uploadedReplyAttachments.length > 0 ? uploadedReplyAttachments : undefined,
          });
        }

        if (items.length > 0 || newStatus !== activeTicket.status) {
          updateTicket(activeTicket.id, {
            status: newStatus,
            priority: ticketPriority || activeTicket.priority,
            assignedTeam: techTeam || activeTicket.assignedTeam || '',
            assignedEmail: isExternalTeam ? resolveAssignedEmails() : '',
            attachments:
              uploadedReplyAttachments.length > 0
                ? [...(activeTicket.attachments || []), ...uploadedReplyAttachments]
                : activeTicket.attachments,
            history: [...activeTicket.history, ...items],
          });
        }
      } else if (replyMode === 'public') {
        if (!trimmedReply && uploadedReplyAttachments.length === 0) {
          setIsSending(false);
          return;
        }
        const item: HistoryItem = {
          id: crypto.randomUUID(),
          type: 'tech',
          sender,
          time: now,
          text: messageWithAttachments || 'Mensagem enviada com anexo.',
          visibility: 'public',
          attachments: uploadedReplyAttachments.length > 0 ? uploadedReplyAttachments : undefined,
        };
        updateTicket(activeTicket.id, {
          attachments:
            uploadedReplyAttachments.length > 0
              ? [...(activeTicket.attachments || []), ...uploadedReplyAttachments]
              : activeTicket.attachments,
          history: [...activeTicket.history, item],
        });
        void notifyTicketPublicReply(activeTicket, sender, trimmedReply || 'Mensagem com anexo.', uploadedReplyAttachments);
      } else {
        if (!trimmedReply && uploadedReplyAttachments.length === 0) {
          setIsSending(false);
          return;
        }
        const item: HistoryItem = {
          id: crypto.randomUUID(),
          type: 'internal',
          sender,
          time: now,
          text: messageWithAttachments || 'Mensagem interna enviada com anexo.',
          visibility: 'internal',
          attachments: uploadedReplyAttachments.length > 0 ? uploadedReplyAttachments : undefined,
        };
        updateTicket(activeTicket.id, {
          attachments:
            uploadedReplyAttachments.length > 0
              ? [...(activeTicket.attachments || []), ...uploadedReplyAttachments]
              : activeTicket.attachments,
          history: [...activeTicket.history, item],
        });
        void notifyTicketDirectorReply(activeTicket, sender, trimmedReply || 'Mensagem com anexo.', uploadedReplyAttachments);
      }

      setReplyText('');
      setReplyFiles([]);
      if (replyFileRef.current) replyFileRef.current.value = '';
    } catch {
      setToast('Falha ao anexar arquivos nesta mensagem. Tente novamente.');
      setTimeout(() => setToast(null), 3000);
    } finally {
      window.setTimeout(() => setIsSending(false), 400);
    }
  };

  const handlePrelimFieldToggle = (field: PreliminaryChecklistKey) => {
    setPrelimForm(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handlePrelimFieldChange = (field: 'materialEta' | 'plannedStartAt' | 'blockerNotes', value: string) => {
    setPrelimForm(prev => ({ ...prev, [field]: value }));
  };

  const buildPreliminaryActionsPayload = (withActualStart: boolean): PreliminaryActions => ({
    materialRequested: prelimForm.materialRequested,
    materialEta: prelimForm.materialEta ? new Date(`${prelimForm.materialEta}T12:00:00`) : null,
    teamConfirmed: prelimForm.teamConfirmed,
    sitePrepared: prelimForm.sitePrepared,
    scheduleDefined: prelimForm.scheduleDefined,
    stakeholderAligned: prelimForm.stakeholderAligned,
    accessReleased: prelimForm.accessReleased,
    plannedStartAt: prelimForm.plannedStartAt ? new Date(`${prelimForm.plannedStartAt}T12:00:00`) : null,
    actualStartAt: withActualStart ? new Date() : activeTicket.preliminaryActions?.actualStartAt || null,
    blockerNotes: prelimForm.blockerNotes.trim(),
    updatedAt: new Date(),
  });

  const handleSavePreliminaryActions = (startExecution: boolean) => {
    if (isSending) return;
    const isReady = arePreliminaryActionsReady(prelimForm);
    if (startExecution && !isReady) {
      setToast('Erro: conclua todas as ações preliminares antes de iniciar a execução.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    if (startExecution && !prelimForm.plannedStartAt) {
      setToast('Erro: informe a data prevista de início antes de iniciar a execução.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const now = new Date();
    const preliminaryActions = buildPreliminaryActionsPayload(false);
    const historyText = startExecution
      ? `Ações preliminares concluídas. Obra pronta para iniciar execução em ${formatShortDate(preliminaryActions.plannedStartAt)}.`
      : `Ações preliminares atualizadas. ${buildPreliminarySummary(preliminaryActions)}.`;

    const item: HistoryItem = {
      id: crypto.randomUUID(),
      type: 'system',
      sender: displayActorLabel,
      time: now,
      text: historyText,
    };

    updateTicket(activeTicket.id, {
      preliminaryActions,
      history: [...activeTicket.history, item],
    });

    setShowPrelimModal(false);
    if (startExecution) {
      setExecutionSetupForm(createExecutionSetupFormState(activeTicket));
      setShowExecutionSetupModal(true);
      setToast('Checklist concluído. Defina o fluxo para iniciar a execução.');
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Controle de Execução
  const handleStartExecution = () => {
    if (isSending) return;
    if (activeTicket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS) {
      setShowPrelimModal(true);
      return;
    }

    setExecutionSetupForm(createExecutionSetupFormState(activeTicket));
    setShowExecutionSetupModal(true);
  };

  const handleConfirmExecutionStart = async () => {
    if (isSending) return;

    const paymentFlowParts = Number(executionSetupForm.paymentFlowParts || 0);
    const measurementSheetUrl = String(executionSetupForm.measurementSheetUrl || '').trim();
    if (!Number.isFinite(paymentFlowParts) || paymentFlowParts < 1 || paymentFlowParts > 5) {
      setToast('Erro: escolha um fluxo de pagamento entre 1x e 5x.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setIsSending(true);
    const now = new Date();
    const preliminaryActions = activeTicket.preliminaryActions
      ? { ...activeTicket.preliminaryActions, actualStartAt: activeTicket.preliminaryActions.actualStartAt || now, updatedAt: now }
      : undefined;
    try {
      updateTicket(activeTicket.id, {
        status: TICKET_STATUS.IN_PROGRESS,
        preliminaryActions,
        executionProgress: {
          paymentFlowParts,
          currentPercent: Number(activeTicket.executionProgress?.currentPercent || 0),
          releasedPercent: Number(activeTicket.executionProgress?.releasedPercent || 0),
          measurementSheetUrl: measurementSheetUrl || null,
          startedAt: activeTicket.executionProgress?.startedAt || preliminaryActions?.actualStartAt || now,
          lastUpdatedAt: now,
        },
        history: [
          ...activeTicket.history,
          {
            id: crypto.randomUUID(),
            type: 'system',
            sender: displayActorLabel,
            time: now,
            text: executionSetupForm.notes.trim()
              ? `Execução iniciada com fluxo financeiro por marcos de andamento. ${executionSetupForm.notes.trim()}`
              : 'Execução iniciada com fluxo financeiro por marcos de andamento.',
          },
        ],
      });

      setShowExecutionSetupModal(false);
      setToast(`Execução iniciada. Fluxo ${paymentFlowParts}x registrado.`);
      setTimeout(() => setToast(null), 3000);
    } finally {
      window.setTimeout(() => setIsSending(false), 500);
    }
  };

  const handleOpenProgressModal = () => {
    setProgressUpdateForm(createProgressUpdateFormState(activeTicket));
    setShowProgressModal(true);
  };

  const handleSaveProgressUpdate = async () => {
    if (isSending) return;
    if (!activeTicket.executionProgress?.paymentFlowParts) {
      setToast('Erro: inicie a execução e defina o fluxo antes de atualizar o andamento.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const baselineValue = resolveExpectedBaselineValue(activeContract, activePayments);
    if (baselineValue <= 0) {
      setToast('Erro: valor previsto da obra não encontrado para calcular o andamento.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const grossAmount = parseCurrencyInput(progressUpdateForm.grossAmount || '');
    if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
      setToast('Erro: informe o valor bruto do lançamento/etapa.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const currentGross = (baselineValue * activeProgressPercent) / 100;
    const accumulatedGross = currentGross + grossAmount;
    const progressPercent = calculateProgressPercentFromGross(accumulatedGross, baselineValue);
    if (progressPercent < activeProgressPercent) {
      setToast('Erro: o percentual calculado não pode ser menor do que o andamento já registrado.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setIsSending(true);

    const existingDynamicPayments = stripLegacyFlowPlaceholders(activePayments);
    const vendor =
      activeContract?.vendor ||
      existingDynamicPayments[0]?.vendor ||
      activePayments[0]?.vendor ||
      activeTicket.assignedTeam ||
      'Fornecedor não definido';
    const now = new Date();
    const classification = buildProcurementClassification(activeTicket);
    const expectedBaselineFormatted = formatCurrencyInput(baselineValue);
    const normalizedProgress = progressPercent;
    const progressDelta = Math.max(0, roundProgressPercent(normalizedProgress - activeProgressPercent));
    const nextInstallmentNumber = existingDynamicPayments.length + 1;
    const configuredFlowParts = Number(activeTicket.executionProgress.paymentFlowParts || 0);
    const formattedGrossAmount = formatCurrencyInput(grossAmount);
    const paymentLabel = `Lançamento ${nextInstallmentNumber}`;
    const dueAt = new Date(now.getTime() + Math.max(0, nextInstallmentNumber - 1) * 7 * 24 * 60 * 60 * 1000);
    const measurementId = `measurement-${Date.now()}`;
    const nextPayment: PaymentRecord = {
      id: `payment-${Date.now()}-${nextInstallmentNumber}`,
      vendor,
      value: formattedGrossAmount,
      grossValue: formattedGrossAmount,
      taxValue: '',
      netValue: formattedGrossAmount,
      progressPercent: normalizedProgress,
      expectedBaselineValue: expectedBaselineFormatted,
      status: 'approved',
      label: paymentLabel,
      installmentNumber: nextInstallmentNumber,
      totalInstallments: configuredFlowParts > 0 ? configuredFlowParts : null,
      dueAt,
      measurementId,
      releasedPercent: progressDelta,
      milestonePercent: normalizedProgress,
      attachments: [],
      receiptFileName: null,
    };

    const measurement: MeasurementRecord = {
      id: measurementId,
      label: `Andamento atualizado para ${normalizedProgress}% (bruto ${formattedGrossAmount} | acumulado ${formatCurrencyInput(accumulatedGross)})`,
      progressPercent: normalizedProgress,
      releasePercent: progressDelta,
      status: 'approved',
      grossValue: formattedGrossAmount,
      notes: progressUpdateForm.notes.trim(),
      requestedAt: now,
      approvedAt: now,
    };
    const shouldMoveToValidation =
      normalizedProgress >= 100 &&
      activeTicket.status !== TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL &&
      activeTicket.status !== TICKET_STATUS.WAITING_PAYMENT &&
      activeTicket.status !== TICKET_STATUS.CLOSED &&
      activeTicket.status !== TICKET_STATUS.CANCELED;
    const nextStatus = shouldMoveToValidation ? TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL : activeTicket.status;
    const nextClosureChecklist =
      normalizedProgress >= 100 ? buildValidationClosureChecklist(activeTicket, now) : activeTicket.closureChecklist;

    try {
      await savePayment(activeTicket.id, nextPayment, classification);
      await saveMeasurement(activeTicket.id, measurement, classification);

      setPaymentsByTicket(prev => ({
        ...prev,
        [activeTicket.id]: [
          ...stripLegacyFlowPlaceholders(prev[activeTicket.id] || []),
          {
            ...nextPayment,
            expectedBaselineValue: expectedBaselineFormatted,
          },
        ],
      }));
      updateTicket(activeTicket.id, {
        status: nextStatus,
        closureChecklist: nextClosureChecklist,
        executionProgress: {
          paymentFlowParts: activeTicket.executionProgress.paymentFlowParts,
          currentPercent: normalizedProgress,
          releasedPercent: roundProgressPercent(Math.max(activeReleasedPercent, normalizedProgress)),
          measurementSheetUrl: activeTicket.executionProgress.measurementSheetUrl || null,
          startedAt: activeTicket.executionProgress.startedAt || activeTicket.preliminaryActions?.actualStartAt || now,
          lastUpdatedAt: now,
        },
        history: [
          ...activeTicket.history,
          {
            id: crypto.randomUUID(),
            type: 'system',
            sender: displayActorLabel,
            time: now,
            text: shouldMoveToValidation
              ? `Andamento atualizado para ${normalizedProgress}% com lançamento bruto de ${formattedGrossAmount} e acumulado de ${formatCurrencyInput(accumulatedGross)}. Execução concluída e OS enviada para validação do solicitante. ${paymentLabel} liberado para o financeiro.${progressUpdateForm.notes.trim() ? ` ${progressUpdateForm.notes.trim()}` : ''}`
              : `Andamento atualizado para ${normalizedProgress}% com lançamento bruto de ${formattedGrossAmount} e acumulado de ${formatCurrencyInput(accumulatedGross)}. ${paymentLabel} liberado para o financeiro.${progressUpdateForm.notes.trim() ? ` ${progressUpdateForm.notes.trim()}` : ''}`,
          },
        ],
      });

      setShowProgressModal(false);
      setToast(
        shouldMoveToValidation
          ? 'Andamento salvo. Obra concluída e enviada para validação do solicitante.'
          : `${paymentLabel} registrada e liberada para o financeiro.`
      );
      setTimeout(() => setToast(null), 3000);
    } finally {
      window.setTimeout(() => setIsSending(false), 500);
    }
  };

  const handleSendForValidation = () => {
    if (isSending) return;
    setIsSending(true);
    const now = new Date();
    const item: HistoryItem = {
      id: crypto.randomUUID(), type: 'system', sender: displayActorLabel,
      time: now, text: 'Serviço concluído. OS enviada para validação do solicitante.',
    };
    updateTicket(activeTicket.id, {
      status: TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL,
      closureChecklist: buildValidationClosureChecklist(activeTicket, now),
      history: [...activeTicket.history, item],
    });
    window.setTimeout(() => setIsSending(false), 500);
  };

  const [isSending, setIsSending] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showMobileTicketList, setShowMobileTicketList] = useState(false);
  const [showMobileContext, setShowMobileContext] = useState(false);
  const [showQuotesModal, setShowQuotesModal] = useState(false);
  const [showContractDispatchModal, setShowContractDispatchModal] = useState(false);
  const [showPrelimModal, setShowPrelimModal] = useState(false);
  const [showExecutionSetupModal, setShowExecutionSetupModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showDeleteTicketModal, setShowDeleteTicketModal] = useState(false);
  const [isDeletingTicket, setIsDeletingTicket] = useState(false);
  const [quoteAttachments, setQuoteAttachments] = useState<Array<File | null>>(
    Array.from({ length: INITIAL_MIN_QUOTE_SLOTS }, () => null)
  );
  const [additionalQuoteUnits, setAdditionalQuoteUnits] = useState<string[]>([]);
  const [pendingCustomUnitByItem, setPendingCustomUnitByItem] = useState<Record<string, string>>({});
  const [storedQuotesByTicket, setStoredQuotesByTicket] = useState<Record<string, Quote[]>>({});
  const [contractsByTicket, setContractsByTicket] = useState<Record<string, ContractRecord>>({});
  const [contractDispatchFile, setContractDispatchFile] = useState<File | null>(null);
  const [paymentsByTicket, setPaymentsByTicket] = useState<Record<string, PaymentRecord[]>>({});
  const [prelimForm, setPrelimForm] = useState<PreliminaryFormState>(createPreliminaryFormState());
  const [executionSetupForm, setExecutionSetupForm] = useState<ExecutionSetupFormState>(createExecutionSetupFormState());
  const [progressUpdateForm, setProgressUpdateForm] = useState<ProgressUpdateFormState>(createProgressUpdateFormState());
  const [toast, setToast] = useState<string | null>(null);
  const activeContract = activeTicket.id ? contractsByTicket[activeTicket.id] : undefined;
  const activePayments = activeTicket.id ? paymentsByTicket[activeTicket.id] || [] : [];
  const activeDynamicPayments = useMemo(() => stripLegacyFlowPlaceholders(activePayments), [activePayments]);
  const activeExpectedBaselineValue = resolveExpectedBaselineValue(activeContract, activePayments);
  const activeProgressPercent = Math.max(0, Number(activeTicket.executionProgress?.currentPercent || 0));
  const activeProgressBarPercent = Math.min(100, activeProgressPercent);
  const activeReleasedPercent = activeTicket.executionProgress?.releasedPercent ?? getApprovedReleasePercent(activeDynamicPayments);
  const activeNextMilestonePercent = activeTicket.executionProgress?.paymentFlowParts
    ? getNextMilestonePercentByProgress(activeTicket.executionProgress.paymentFlowParts, activeProgressPercent)
    : null;
  const activeMilestones = useMemo(
    () => (activeTicket.executionProgress?.paymentFlowParts ? getPaymentFlowMilestones(activeTicket.executionProgress.paymentFlowParts) : []),
    [activeTicket.executionProgress?.paymentFlowParts]
  );
  const draftGrossAmount = parseCurrencyInput(progressUpdateForm.grossAmount || '');
  const currentAccumulatedGross = activeExpectedBaselineValue > 0 ? (activeExpectedBaselineValue * activeProgressPercent) / 100 : 0;
  const projectedAccumulatedGross = currentAccumulatedGross + draftGrossAmount;
  const draftProgressPercent = calculateProgressPercentFromGross(projectedAccumulatedGross, activeExpectedBaselineValue);
  const ticketAttachmentItems = (activeTicket.attachments || [])
    .filter(attachment => attachment?.url)
    .map(attachment => ({
      title: attachment.name,
      type: attachment.contentType?.includes('pdf') ? 'pdf' as const : 'image' as const,
      url: attachment.url,
    }));
  const isMobileOverlayOpen = showMobileTicketList || showMobileContext;
  const shouldLockBodyScroll =
    isMobileOverlayOpen || showQuotesModal || showContractDispatchModal || showPrelimModal || showExecutionSetupModal || showProgressModal || showDeleteTicketModal;

  useEffect(() => {
    function handleEsc(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (showQuotesModal) setShowQuotesModal(false);
      if (showContractDispatchModal) setShowContractDispatchModal(false);
      if (showPrelimModal) setShowPrelimModal(false);
      if (showExecutionSetupModal) setShowExecutionSetupModal(false);
      if (showProgressModal) setShowProgressModal(false);
      if (showActionsMenu) setShowActionsMenu(false);
      if (showDeleteTicketModal) setShowDeleteTicketModal(false);
      if (showMobileTicketList) setShowMobileTicketList(false);
      if (showMobileContext) setShowMobileContext(false);
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [showQuotesModal, showContractDispatchModal, showPrelimModal, showExecutionSetupModal, showProgressModal, showActionsMenu, showDeleteTicketModal, showMobileTicketList, showMobileContext]);

  useEffect(() => {
    setShowActionsMenu(false);
    setShowDeleteTicketModal(false);
    setShowMobileTicketList(false);
    setShowMobileContext(false);
  }, [activeTicketId]);

  useEffect(() => {
    if (!shouldLockBodyScroll) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [shouldLockBodyScroll]);

  // useClickOutside substitui o useEffect manual anterior
  const actionsMenuRef = useClickOutside<HTMLDivElement>(() => setShowActionsMenu(false));

  const [quotes, setQuotes] = useState<QuoteDraft[]>(
    Array.from({ length: INITIAL_MIN_QUOTE_SLOTS }, () => createEmptyQuoteDraft())
  );
  const [quoteRoundType, setQuoteRoundType] = useState<'initial' | 'additive'>('initial');
  const [quoteAdditiveIndex, setQuoteAdditiveIndex] = useState(1);
  const [additiveReason, setAdditiveReason] = useState('');
  const quoteUnitOptions = useMemo(() => {
    const options = new Set<string>(DEFAULT_QUOTE_UNIT_OPTIONS);
    additionalQuoteUnits.forEach(unit => {
      const normalized = normalizeUnitAbbreviation(unit);
      if (normalized) options.add(normalized);
    });
    quotes.forEach(quote => {
      quote.items.forEach(item => {
        const normalized = normalizeUnitAbbreviation(item.unit);
        if (normalized) options.add(normalized);
      });
    });
    return Array.from(options);
  }, [additionalQuoteUnits, quotes]);
  const [proposalHeader, setProposalHeader] = useState<ProposalHeaderDraft>(createProposalHeaderDraft());
  const availableAdditiveRounds = useMemo(
    () => getAvailableAdditiveRounds(storedQuotesByTicket[activeTicketId] || []),
    [activeTicketId, storedQuotesByTicket]
  );
  const quoteDraftTicketRef = useRef<string>('');

  // Reseta cotações ao trocar de ticket
  useEffect(() => {
    const ticketChanged = quoteDraftTicketRef.current !== activeTicketId;
    if (showQuotesModal && !ticketChanged) return;

    const allTicketQuotes = storedQuotesByTicket[activeTicketId] || [];
    const additiveRounds = getAvailableAdditiveRounds(allTicketQuotes);
    if (ticketChanged) {
      setQuoteRoundType('initial');
      setQuoteAdditiveIndex(additiveRounds.length > 0 ? Math.max(...additiveRounds) : 1);
    }

    const targetRoundType: 'initial' | 'additive' = ticketChanged ? 'initial' : quoteRoundType;
    const targetRoundMinSlots = getRoundMinQuoteSlots(targetRoundType);
    const targetRoundMaxSlots = getRoundMaxQuoteSlots(targetRoundType);
    const currentQuotes = getQuotesByRound(
      allTicketQuotes,
      targetRoundType,
      ticketChanged ? (additiveRounds.length > 0 ? Math.max(...additiveRounds) : quoteAdditiveIndex) : quoteAdditiveIndex
    );
    const fallbackQuotes = Array.from({ length: targetRoundMinSlots }, () => createEmptyQuoteDraft());
    const currentSiteLabel = getTicketSiteLabel(activeTicket, catalogSites);
    const slotCount = currentQuotes.length > 0
      ? Math.min(targetRoundMaxSlots, Math.max(targetRoundMinSlots, currentQuotes.length))
      : targetRoundMinSlots;
    const nextQuotes =
      currentQuotes.length > 0
        ? Array.from({ length: slotCount }, (_, index) => ({
            vendor: currentQuotes[index]?.vendor || '',
            value: currentQuotes[index]?.value || '',
            laborValue: currentQuotes[index]?.laborValue || '',
            materialValue: currentQuotes[index]?.materialValue || '',
            totalValue: currentQuotes[index]?.totalValue || '',
            items:
              currentQuotes[index]?.items?.length
                ? currentQuotes[index].items!.map(item => ({
                    id: item.id || crypto.randomUUID(),
                    section: normalizeQuoteSection(item.section),
                    description: item.description || '',
                    materialId: item.materialId || null,
                    materialName: item.materialName || null,
                    unit: item.unit || null,
                    quantity: item.quantity ?? null,
                    costUnitPrice: item.costUnitPrice || null,
                    unitPrice: null,
                    totalPrice: item.totalPrice || null,
                  }))
                : [createEmptyQuoteItem()],
          }))
        : fallbackQuotes;
    setQuotes(nextQuotes);
    setAdditiveReason(currentQuotes[0]?.additiveReason ? String(currentQuotes[0].additiveReason) : '');
    setProposalHeader(
      currentQuotes[0]?.proposalHeader
        ? {
            unitName: currentQuotes[0].proposalHeader?.unitName || currentSiteLabel || activeTicket.sede || '',
            location: currentQuotes[0].proposalHeader?.location || '',
            folderLink: currentQuotes[0].proposalHeader?.folderLink || '',
            contractedVendor: currentQuotes[0].proposalHeader?.contractedVendor || '',
            totalQuantity: currentQuotes[0].proposalHeader?.totalQuantity || '',
            totalEstimatedValue: currentQuotes[0].proposalHeader?.totalEstimatedValue || '',
          }
        : createProposalHeaderDraft(activeTicket, currentSiteLabel)
    );
    setQuoteAttachments(Array.from({ length: nextQuotes.length }, () => null));
    setPendingCustomUnitByItem({});
    quoteDraftTicketRef.current = activeTicketId;
  }, [activeTicket, activeTicketId, catalogSites, quoteAdditiveIndex, quoteRoundType, showQuotesModal, storedQuotesByTicket]);

  // useMemo evita recalcular em todo re-render
  const filteredTickets = useMemo(() => tickets.filter(t => {
    if (inboxFilter.status.length > 0 && !inboxFilter.status.includes(t.status)) return false;
    if (inboxFilter.priority.length > 0 && t.priority && !inboxFilter.priority.includes(t.priority)) return false;
    if (inboxFilter.region.length > 0 && !inboxFilter.region.includes(getTicketRegionLabel(t, catalogRegions, catalogSites))) return false;
    if (inboxFilter.site.length > 0 && !inboxFilter.site.includes(getTicketSiteLabel(t, catalogSites))) return false;
    if (inboxFilter.type.length > 0 && !inboxFilter.type.includes(t.type)) return false;
    return true;
  }).sort((a, b) => {
    const isAUrgentCorrective = a.type === 'Corretiva' && a.priority === 'Urgente';
    const isBUrgentCorrective = b.type === 'Corretiva' && b.priority === 'Urgente';
    if (isAUrgentCorrective && !isBUrgentCorrective) return -1;
    if (!isAUrgentCorrective && isBUrgentCorrective) return 1;
    return b.time.getTime() - a.time.getTime();
  }), [tickets, inboxFilter, catalogRegions, catalogSites]);

  const siteFilterOptions = useMemo(() => {
    const catalogOptions = catalogSites.map(site => site.code || site.name);
    const ticketOptions = tickets.map(ticket => getTicketSiteLabel(ticket, catalogSites));
    return [...new Set([...catalogOptions, ...ticketOptions].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [catalogSites, tickets]);

  const budgetHistory = useMemo(
    () => buildBudgetHistorySummary(activeTicket, tickets, storedQuotesByTicket, vendors),
    [activeTicket, tickets, storedQuotesByTicket, vendors]
  );

  const budgetBaselineAndRealized = useMemo(() => {
    const allQuotes = storedQuotesByTicket[activeTicket.id] || [];
    const parseValue = (value?: string | null) => parseCurrencyInput(String(value || ''));
    const approvedInitial = allQuotes.find(quote => (quote.category || 'initial') === 'initial' && quote.status === 'approved') || null;
    const plannedValue = approvedInitial ? parseValue(approvedInitial.totalValue || approvedInitial.value) : 0;
    const approvedAdditives = allQuotes
      .filter(quote => quote.category === 'additive' && quote.status === 'approved')
      .reduce((sum, quote) => sum + parseValue(quote.totalValue || quote.value), 0);
    return {
      plannedValue,
      realizedValue: plannedValue + approvedAdditives,
      additiveValue: approvedAdditives,
    };
  }, [activeTicket.id, storedQuotesByTicket]);

  const suggestedQuoteMaterials = useMemo(() => {
    const service = serviceCatalog.find(item => item.id === activeTicket.serviceCatalogId);
    if (!service?.suggestedMaterialIds?.length) return [];
    return service.suggestedMaterialIds
      .map(materialId => catalogMaterials.find(material => material.id === materialId))
      .filter((value): value is CatalogMaterial => Boolean(value));
  }, [activeTicket.serviceCatalogId, catalogMaterials, serviceCatalog]);

  const quoteComparisonSections = useMemo(() => {
    const sections = new Map<
      string,
      {
        key: string;
        label: string;
        rows: Array<{
          key: string;
          description: string;
          unit: string;
          quantity: string;
          values: Array<{ costUnitPrice: string; chargedTotalPrice: string }>;
        }>;
      }
    >();

    const sectionKeys = new Set<string>();
    quotes.forEach(quote => {
      getQuoteSections(quote.items).forEach(section => sectionKeys.add(section));
    });

    const orderedSections = Array.from(sectionKeys);

    orderedSections.forEach(section => {
      const rowMap = new Map<string, { key: string; description: string; unit: string; quantity: string; values: Array<{ costUnitPrice: string; chargedTotalPrice: string }> }>();
      quotes.forEach((quote, quoteIndex) => {
        quote.items
          .filter(item => normalizeQuoteSection(item.section) === section)
          .forEach(item => {
            const rowKey = String(item.description || item.materialName || item.id).trim().toLowerCase();
            if (!rowMap.has(rowKey)) {
              rowMap.set(rowKey, {
                key: rowKey,
                description: item.description || item.materialName || 'Item sem descrição',
                unit: item.unit || '',
                quantity: item.quantity != null ? String(item.quantity) : '',
                values: quotes.map(() => ({ costUnitPrice: '', chargedTotalPrice: '' })),
              });
            }
            const row = rowMap.get(rowKey)!;
            row.values[quoteIndex] = {
              costUnitPrice: item.costUnitPrice || '',
              chargedTotalPrice: item.totalPrice || '',
            };
            if (!row.unit && item.unit) row.unit = item.unit;
            if (!row.quantity && item.quantity != null) row.quantity = String(item.quantity);
          });
      });

      sections.set(section, {
        key: section,
        label: getQuoteSectionLabel(section),
        rows: Array.from(rowMap.values()),
      });
    });

    return Array.from(sections.values());
  }, [quotes]);

  const quoteGrandTotals = useMemo(
    () =>
      quotes.map(quote =>
        quote.items.reduce((sum, item) => sum + parseCurrencyInput(item.totalPrice || ''), 0)
      ),
    [quotes]
  );

  const persistedServicePreference = useMemo(() => {
    const exactService = vendorPreferences
      .filter(
        item =>
          item.scopeType === 'service' &&
          activeTicket.serviceCatalogId &&
          item.scopeId === activeTicket.serviceCatalogId
      )
      .sort((a, b) => b.approvalCount - a.approvalCount)[0];

    if (exactService) return exactService;

    return (
      vendorPreferences
        .filter(
          item =>
            item.scopeType === 'macroService' &&
            activeTicket.macroServiceId &&
            item.scopeId === activeTicket.macroServiceId
        )
        .sort((a, b) => b.approvalCount - a.approvalCount)[0] ?? null
    );
  }, [activeTicket.macroServiceId, activeTicket.serviceCatalogId, vendorPreferences]);

  const handleReplyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setReplyFiles(Array.from(e.target.files));
  };

  // Labels dinâmicos do reply box conforme status
  let internalTabLabel = 'Nota Interna';
  let internalPlaceholder = 'Adicione uma nota interna...';
  let internalButtonText = 'Salvar Nota';
  let internalActionText = 'Ação: Registrar nota no histórico';

  if (activeTicket.status === TICKET_STATUS.WAITING_TECH_OPINION) {
    internalTabLabel = 'Enviar Parecer à Diretoria';
    internalPlaceholder = 'Consolide o parecer técnico antes de enviar para aprovação...';
    internalButtonText = 'Enviar para Aprovação';
    internalActionText = 'Ação: Mover para Aguardando Aprovação da Solução';
  } else if (activeTicket.status.includes('Orçamento') || activeTicket.status.includes('Cotação')) {
    internalTabLabel = 'Anotação de Cotação';
    internalPlaceholder = 'Registre detalhes das negociações com fornecedores...';
    internalButtonText = 'Salvar Anotação';
    internalActionText = 'Ação: Registrar no histórico interno';
  } else if (activeTicket.status.includes('Validação') || activeTicket.status.includes('Execução')) {
    internalTabLabel = 'Diário de Obra';
    internalPlaceholder = 'Registre o andamento da execução...';
    internalButtonText = 'Salvar Registro';
    internalActionText = 'Ação: Registrar no histórico interno';
  }

const handleQuoteChange = (index: number, field: 'vendor' | 'value', value: string) => {
  const newQuotes = [...quotes];
  newQuotes[index][field] = field === 'value' ? sanitizeCurrencyTypingInput(value) : value;
  setQuotes(newQuotes);
};

  const handleQuoteCurrencyBlur = (index: number, field: 'value') => {
    setQuotes(current =>
      current.map((quote, quoteIndex) =>
        quoteIndex === index
          ? {
              ...quote,
              [field]: normalizeCurrencyInput(quote[field]),
            }
          : quote
      )
    );
  };

  const handleProposalHeaderChange = (field: keyof ProposalHeaderDraft, value: string) => {
    setProposalHeader(current => ({
      ...current,
      [field]: field === 'totalEstimatedValue' ? sanitizeCurrencyTypingInput(value) : value,
    }));
  };

  const handleProposalCurrencyBlur = (field: keyof ProposalHeaderDraft) => {
    setProposalHeader(current => ({
      ...current,
      [field]: field === 'totalEstimatedValue' ? normalizeCurrencyInput(String(current[field] || '')) : current[field],
    }));
  };

  const recalculateQuoteValue = (draft: QuoteDraft) => {
    const computedTotal = draft.items.reduce((sum, item) => {
      const quantity = item.quantity ?? 0;
      const costUnitPrice = item.costUnitPrice ? parseCurrencyInput(item.costUnitPrice) : 0;
      if (quantity > 0 && costUnitPrice > 0) return sum + quantity * costUnitPrice;
      const totalPrice = item.totalPrice ? parseCurrencyInput(item.totalPrice) : 0;
      return sum + totalPrice;
    }, 0);
    const breakdown = summarizeQuoteDraft(draft);

    return {
      ...draft,
      value: computedTotal > 0 ? formatCurrencyInput(computedTotal) : draft.value,
      laborValue: breakdown.laborValue,
      materialValue: breakdown.materialValue,
      totalValue: breakdown.totalValue,
    };
  };

  const handleQuoteItemChange = (quoteIndex: number, itemId: string, field: keyof QuoteItem, value: string | number | null) => {
    setQuotes(current =>
      current.map((quote, index) => {
        if (index !== quoteIndex) return quote;
        const items = quote.items.map(item => {
          if (item.id !== itemId) return item;
          const nextItem: QuoteItem = { ...item, [field]: value as never };
          if (field === 'materialId') {
            const material = catalogMaterials.find(entry => entry.id === value);
            nextItem.materialId = material?.id || null;
            nextItem.materialName = material?.name || null;
            nextItem.unit = normalizeUnitAbbreviation(material?.unit || item.unit) || null;
            if (!nextItem.description) {
              nextItem.description = material?.name || '';
            }
          }
          if (field === 'materialName') {
            nextItem.materialId = null;
            nextItem.materialName = value ? String(value) : null;
          }
          if (field === 'unit') {
            nextItem.unit = normalizeUnitAbbreviation(typeof value === 'string' ? value : null) || null;
          }
          if (field === 'section') {
            nextItem.section = normalizeQuoteSection(typeof value === 'string' ? value : null);
          }
          if (field === 'costUnitPrice' || field === 'totalPrice') {
            nextItem[field] = typeof value === 'string' ? sanitizeCurrencyTypingInput(value) : null;
          }
          if (field === 'quantity' || field === 'costUnitPrice') {
            const quantity = nextItem.quantity ?? 0;
            const costUnitPrice = nextItem.costUnitPrice ? parseCurrencyInput(nextItem.costUnitPrice) : 0;
            if (quantity > 0 && costUnitPrice > 0) {
              nextItem.totalPrice = formatCurrencyInput(quantity * costUnitPrice);
            } else {
              nextItem.totalPrice = null;
            }
          }
          return nextItem;
        });
        return recalculateQuoteValue({ ...quote, items });
      })
    );
  };

  const handleQuoteItemCurrencyBlur = (quoteIndex: number, itemId: string, field: 'costUnitPrice') => {
    setQuotes(current =>
      current.map((quote, index) => {
        if (index !== quoteIndex) return quote;
        const items = quote.items.map(item => {
          if (item.id !== itemId) return item;
          const nextItem: QuoteItem = { ...item };
          nextItem[field] = normalizeCurrencyInput(String(nextItem[field] || ''));
          const quantity = nextItem.quantity ?? 0;
          const costUnitPrice = nextItem.costUnitPrice ? parseCurrencyInput(nextItem.costUnitPrice) : 0;
          if (quantity > 0 && costUnitPrice > 0) {
            nextItem.totalPrice = formatCurrencyInput(quantity * costUnitPrice);
          } else {
            nextItem.totalPrice = null;
          }
          return nextItem;
        });
        return recalculateQuoteValue({ ...quote, items });
      })
    );
  };

  const buildQuoteItemUnitKey = (quoteIndex: number, itemId: string) => `${quoteIndex}:${itemId}`;

  const handleQuoteItemUnitSelect = (quoteIndex: number, itemId: string, selectedValue: string) => {
    const itemKey = buildQuoteItemUnitKey(quoteIndex, itemId);
    if (selectedValue === CUSTOM_QUOTE_UNIT_VALUE) {
      setPendingCustomUnitByItem(current => ({ ...current, [itemKey]: '' }));
      return;
    }
    setPendingCustomUnitByItem(current => {
      if (!(itemKey in current)) return current;
      const next = { ...current };
      delete next[itemKey];
      return next;
    });
    handleQuoteItemChange(quoteIndex, itemId, 'unit', selectedValue || null);
  };

  const handleQuoteItemCustomUnitSave = (quoteIndex: number, itemId: string) => {
    const itemKey = buildQuoteItemUnitKey(quoteIndex, itemId);
    const normalized = normalizeUnitAbbreviation(pendingCustomUnitByItem[itemKey]);
    if (!normalized) return;

    setAdditionalQuoteUnits(current => (current.includes(normalized) ? current : [...current, normalized]));
    handleQuoteItemChange(quoteIndex, itemId, 'unit', normalized);
    setPendingCustomUnitByItem(current => {
      const next = { ...current };
      delete next[itemKey];
      return next;
    });
  };

  const handleAddQuoteItem = (quoteIndex: number) => {
    setQuotes(current =>
      current.map((quote, index) =>
        index === quoteIndex ? { ...quote, items: [...quote.items, createEmptyQuoteItem(activeTicket.serviceCatalogName || '', suggestedQuoteMaterials[0]?.unit || '')] } : quote
      )
    );
  };

  const handleRemoveQuoteItem = (quoteIndex: number, itemId: string) => {
    const itemKey = buildQuoteItemUnitKey(quoteIndex, itemId);
    setPendingCustomUnitByItem(current => {
      if (!(itemKey in current)) return current;
      const next = { ...current };
      delete next[itemKey];
      return next;
    });
    setQuotes(current =>
      current.map((quote, index) => {
        if (index !== quoteIndex) return quote;
        const remaining = quote.items.filter(item => item.id !== itemId);
        return recalculateQuoteValue({
          ...quote,
          items: remaining.length > 0 ? remaining : [createEmptyQuoteItem()],
        });
      })
    );
  };

  const handleQuoteAttachmentChange = (index: number, file: File | null) => {
    setQuoteAttachments(prev => prev.map((item, i) => (i === index ? file : item)));
  };

  const handleAddQuoteSlot = () => {
    if (quotes.length >= getRoundMaxQuoteSlots(quoteRoundType)) return;
    setQuotes(current => [...current, createEmptyQuoteDraft()]);
    setQuoteAttachments(current => [...current, null]);
  };

  const handleRemoveQuoteSlot = (index: number) => {
    if (quotes.length <= getRoundMinQuoteSlots(quoteRoundType)) return;
    setQuotes(current => current.filter((_, quoteIndex) => quoteIndex !== index));
    setQuoteAttachments(current => current.filter((_, quoteIndex) => quoteIndex !== index));
    setPendingCustomUnitByItem({});
  };

  const applyFormatting = (type: 'bold' | 'italic' | 'list') => {
    if (!replyTextRef.current) return;
    const el = replyTextRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = replyText.slice(start, end);
    const before = replyText.slice(0, start);
    const after = replyText.slice(end);

    let insertion = selected;
    if (type === 'bold') insertion = `**${selected || 'texto'}**`;
    if (type === 'italic') insertion = `*${selected || 'texto'}*`;
    if (type === 'list') insertion = selected ? selected.split('\n').map(line => `- ${line}`).join('\n') : '- item';

    const next = `${before}${insertion}${after}`;
    setReplyText(next);
  };

  const handleSendToDirector = () => {
    const roundType = quoteRoundType;
    const filled = quotes
      .map((quote, index) => ({ quote, index }))
      .filter(({ quote }) => quote.vendor.trim() !== '' && quote.value.trim() !== '');
    if (roundType === 'additive' && filled.length !== 1) {
      setToast('Erro: aditivo deve ter exatamente 1 cotação.');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (roundType === 'initial' && filled.length < 2) {
      setToast('Erro: Informe no mínimo 2 cotações antes de enviar.');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setIsSending(true);
    setTimeout(async () => {
      const additiveIndex = roundType === 'additive' ? Math.max(1, Number(quoteAdditiveIndex || 1)) : null;
      const normalizedAdditiveReason = additiveReason.trim();
      if (roundType === 'additive' && !normalizedAdditiveReason) {
        setIsSending(false);
        setToast('Erro: informe o motivo do aditivo antes de enviar à diretoria.');
        setTimeout(() => setToast(null), 3000);
        return;
      }
      const roundAttachmentKey = roundType === 'additive' ? `additive-${additiveIndex}` : 'initial';
      const uploadedAttachments = await Promise.all(
        filled.map(async ({ index }, quoteOrder) => {
          const attachmentFile = quoteAttachments[index];
          if (!attachmentFile) return { index, uploaded: null as Awaited<ReturnType<typeof uploadQuoteAttachment>> | null };
          try {
            const uploaded = await uploadQuoteAttachment(activeTicket.id, roundAttachmentKey, `quote-${quoteOrder + 1}`, attachmentFile);
            return { index, uploaded };
          } catch {
            return { index, uploaded: null };
          }
        })
      );
      const uploadedByOriginalIndex = new Map<number, Awaited<ReturnType<typeof uploadQuoteAttachment>>>();
      uploadedAttachments.forEach(item => {
        if (item.uploaded) uploadedByOriginalIndex.set(item.index, item.uploaded);
      });
      const nextQuotes: Quote[] = filled.map(({ quote, index: originalIndex }, index) => ({
        id: `quote-${index + 1}`,
        vendor: quote.vendor.trim(),
        value: quote.value.trim(),
        laborValue: quote.laborValue || summarizeQuoteDraft(quote).laborValue,
        materialValue: quote.materialValue || summarizeQuoteDraft(quote).materialValue,
        totalValue: quote.totalValue || summarizeQuoteDraft(quote).totalValue || quote.value.trim(),
        category: roundType,
        additiveIndex,
        additiveReason: roundType === 'additive' ? normalizedAdditiveReason : null,
        recommended: false,
        status: 'pending',
        attachmentName: uploadedByOriginalIndex.get(originalIndex)?.name || quoteAttachments[originalIndex]?.name || null,
        attachmentUrl: uploadedByOriginalIndex.get(originalIndex)?.url || null,
        attachmentPath: uploadedByOriginalIndex.get(originalIndex)?.path || null,
        proposalHeader: {
          unitName: proposalHeader.unitName.trim() || null,
          location: proposalHeader.location.trim() || null,
          folderLink: proposalHeader.folderLink.trim() || null,
          contractedVendor: proposalHeader.contractedVendor.trim() || null,
          totalQuantity: proposalHeader.totalQuantity.trim() || null,
          totalEstimatedValue: proposalHeader.totalEstimatedValue.trim() || null,
        },
        items: quote.items
          .map(item => ({
            ...item,
            section: normalizeQuoteSection(item.section),
            description: String(item.description || '').trim(),
            unit: item.unit ? String(item.unit).trim() : null,
            materialName: item.materialName ? String(item.materialName).trim() : null,
            costUnitPrice: item.costUnitPrice ? String(item.costUnitPrice).trim() : null,
            unitPrice: null,
            totalPrice: item.totalPrice ? String(item.totalPrice).trim() : null,
          }))
          .filter(item => item.description || item.totalPrice || item.quantity),
      }));
      try {
        await saveQuotes(activeTicket.id, nextQuotes, buildProcurementClassification(activeTicket));
      } catch {
        // Mantém o fluxo local mesmo se a API não estiver disponível no ambiente atual.
      }
      setStoredQuotesByTicket(prev => {
        const existing = prev[activeTicket.id] || [];
        const merged = [
          ...existing.filter(quote => {
            const category = quote.category === 'additive' ? 'additive' : 'initial';
            if (category !== roundType) return true;
            if (roundType === 'additive') return Number(quote.additiveIndex || 1) !== Number(additiveIndex || 1);
            return false;
          }),
          ...nextQuotes,
        ];
        return { ...prev, [activeTicket.id]: merged };
      });
      const historyItem: HistoryItem = {
        id: crypto.randomUUID(),
        type: 'system',
        sender: displayActorLabel,
        time: new Date(),
        text:
          roundType === 'additive'
            ? `Aditivo ${additiveIndex} consolidado e enviado para aprovação da Diretoria.`
            : 'Orçamentos consolidados e enviados para aprovação da Diretoria.',
      };
      updateTicket(activeTicket.id, {
        status: roundType === 'initial' ? TICKET_STATUS.WAITING_BUDGET_APPROVAL : activeTicket.status,
        history: [...activeTicket.history, historyItem],
      });
      setIsSending(false);
      setShowQuotesModal(false);
      setToast(roundType === 'additive' ? `Aditivo ${additiveIndex} enviado para a Diretoria com sucesso!` : 'Orçamentos enviados para a Diretoria com sucesso!');
      setTimeout(() => setToast(null), 3000);
    }, 1500);
  };

  const handleSendContractToDirector = async () => {
    if (!activeContract) {
      setToast('Contrato base não encontrado. Aprove o orçamento antes de enviar contrato.');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (!contractDispatchFile) {
      setToast('Selecione o arquivo do contrato (PDF) antes de enviar à Diretoria.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setIsSending(true);
    const now = new Date();
    let uploadedContract: Awaited<ReturnType<typeof uploadContractAttachment>> | null = null;
    try {
      uploadedContract = await uploadContractAttachment(activeTicket.id, contractDispatchFile);
    } catch {
      setIsSending(false);
      setToast('Falha ao enviar o PDF do contrato. Tente novamente.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const nextContract: ContractRecord = {
      ...activeContract,
      status: 'pending_approval',
      signedFileName: uploadedContract?.name || contractDispatchFile.name,
      signedFileUrl: uploadedContract?.url || null,
      signedFilePath: uploadedContract?.path || null,
      signedFileContentType: uploadedContract?.contentType || null,
      signedFileSize: uploadedContract?.size ?? null,
      viewingBy: null,
    };

    try {
      await saveContract(activeTicket.id, nextContract, buildProcurementClassification(activeTicket));
    } catch (error) {
      console.error('[contract-dispatch] failed to save contract', error);
      const details = error instanceof Error ? error.message : 'Erro desconhecido ao salvar contrato.';
      setIsSending(false);
      setToast(`Falha ao registrar contrato no servidor: ${details}`);
      setTimeout(() => setToast(null), 6000);
      return;
    }

    setContractsByTicket(prev => ({ ...prev, [activeTicket.id]: nextContract }));
    updateTicket(activeTicket.id, {
      status: TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
      history: [
        ...activeTicket.history,
        {
          id: crypto.randomUUID(),
          type: 'system',
          sender: displayActorLabel,
          time: now,
          text: `Contrato anexado pelo gestor (${contractDispatchFile.name}) e enviado para aprovação da Diretoria.`,
        },
      ],
    });

    setContractDispatchFile(null);
    setShowContractDispatchModal(false);
    setIsSending(false);
    setToast('Contrato enviado para aprovação da Diretoria.');
    setTimeout(() => setToast(null), 3000);
  };

  // Usa trackingToken (opaco) em vez do ID sequencial
  const handleCopyLink = () => {
    const trackingToken = encodeURIComponent(activeTicket.trackingToken);
    const url = `${window.location.origin}/?tracking=${trackingToken}`;
    navigator.clipboard.writeText(url).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
    setToast('Link copiado para a área de transferência!');
    setTimeout(() => setToast(null), 3000);
    setShowActionsMenu(false);
  };

  const handleOpenTracking = () => {
    const trackingToken = encodeURIComponent(activeTicket.trackingToken);
    const url = `${window.location.origin}/?tracking=${trackingToken}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setShowActionsMenu(false);
    setShowMobileContext(false);
  };

  const handleDuplicateTicket = async () => {
    const now = new Date();

    const duplicated: Ticket = {
      ...activeTicket,
      id: '',
      trackingToken: '',
      status: TICKET_STATUS.NEW,
      time: now,
      history: [
        ...activeTicket.history,
        {
          id: crypto.randomUUID(),
          type: 'system',
          sender: 'Sistema',
          time: now,
          text: `OS duplicada de ${activeTicket.id} e reiniciada para triagem.`,
        },
      ],
    };

    try {
      const createdTicket = await addTicket(duplicated);
      updateTicket(activeTicket.id, {
        history: [
          ...activeTicket.history,
          {
            id: crypto.randomUUID(),
            type: 'system',
            sender: displayActorLabel,
            time: now,
            text: `OS duplicada para ${createdTicket.id}.`,
          },
        ],
      });

      setActiveTicketId(createdTicket.id);
      setShowActionsMenu(false);
      setToast(`OS ${activeTicket.id} duplicada como ${createdTicket.id}.`);
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Não foi possível duplicar a OS.');
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleCancelTicket = () => {
    if (activeTicket.status === TICKET_STATUS.CANCELED) return;
    updateTicket(activeTicket.id, {
      status: TICKET_STATUS.CANCELED,
      history: [
        ...activeTicket.history,
        {
          id: crypto.randomUUID(),
          type: 'system',
          sender: displayActorLabel,
          time: new Date(),
          text: 'OS cancelada pelo gestor através do menu de ações.',
        },
      ],
    });
    setShowActionsMenu(false);
    setToast(`OS ${activeTicket.id} cancelada.`);
    setTimeout(() => setToast(null), 3000);
  };

  const handleReopenTicket = () => {
    if (![TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED].includes(activeTicket.status)) {
      setToast('Erro: apenas OS encerrada ou cancelada pode ser reaberta.');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    const nextStatus = resolveReopenStatus();
    updateTicket(activeTicket.id, {
      status: nextStatus,
      ...buildStatusSideEffects(nextStatus, new Date()),
      history: [
        ...activeTicket.history,
        {
          id: crypto.randomUUID(),
          type: 'system',
          sender: displayActorLabel,
          time: new Date(),
          text: `OS reaberta pelo gestor para ${nextStatus}.`,
        },
      ],
    });
    setStatusDraft(nextStatus);
    setShowActionsMenu(false);
    setToast(`OS ${activeTicket.id} reaberta.`);
    setTimeout(() => setToast(null), 3000);
  };

  const handleDeleteTicket = async () => {
    if (!canDeleteTicket || isDeletingTicket || !activeTicket.id) return;

    setIsDeletingTicket(true);
    try {
      await deleteTicketInApi(activeTicket.id);
      setShowDeleteTicketModal(false);
      setShowActionsMenu(false);
      setToast(`OS ${activeTicket.id} excluída com sucesso.`);
      await refreshTickets();
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Não foi possível excluir a OS.');
      setTimeout(() => setToast(null), 4000);
    } finally {
      setIsDeletingTicket(false);
    }
  };

  // Z7: active chips
  const activeChips: { dim: keyof typeof inboxFilter; value: string }[] = (
    ['status', 'priority', 'region', 'site', 'type'] as (keyof typeof inboxFilter)[]
  ).flatMap(dim => inboxFilter[dim].map(value => ({ dim, value })));

  const removeChip = (dim: keyof typeof inboxFilter, value: string) => {
    setInboxFilter({ ...inboxFilter, [dim]: inboxFilter[dim].filter(v => v !== value) });
  };

  return (
    <div className="flex h-full flex-1 min-h-0 overflow-hidden relative">
      <FloatingToast message={toast} />

      {isMobileOverlayOpen && (
        <button
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => {
            setShowMobileTicketList(false);
            setShowMobileContext(false);
          }}
          aria-label="Fechar painéis móveis"
        />
      )}

      {/* Ticket List Pane */}
      <div id="ticket-list-drawer" className={`fixed md:static inset-y-0 left-0 z-40 h-full w-[88vw] max-w-96 md:w-[18.5rem] xl:w-[20rem] bg-roman-surface border-r border-roman-border flex flex-col shadow-[1px_0_5px_rgba(0,0,0,0.02)] transition-transform duration-200 ${showMobileTicketList ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="border-b border-roman-border px-3 py-3 md:px-4 md:py-3.5 bg-gradient-to-b from-roman-bg to-roman-surface">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-[17px] font-semibold tracking-wide text-roman-text-main">Caixa de Entrada</h2>
                <ChevronDown size={16} className="text-roman-text-sub" />
              </div>
              <p className="text-xs text-roman-text-sub mt-1">Responsável atual: {displayActor}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-full border border-roman-border bg-roman-bg text-sm font-medium text-roman-text-main">
                {tickets.length}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMobileTicketList(false);
                  setShowMobileContext(false);
                }}
                className="md:hidden text-roman-text-sub hover:text-roman-text-main"
                aria-label="Fechar lista"
              >
                <X size={16} />
              </button>
            </div>
          </div>

        </div>

        {/* Toolbar */}
        <div className="p-3 border-b border-roman-border bg-roman-bg/50">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">
                Status
              </label>
              <div className="relative">
              <select
                value={inboxFilter.status.length === 1 ? inboxFilter.status[0] : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setInboxFilter({
                    ...inboxFilter,
                    status: value ? [value] : [],
                  });
                }}
                className="w-full appearance-none rounded-sm border border-roman-border bg-white px-3 py-2 pr-9 text-sm text-roman-text-main outline-none transition-colors focus:border-roman-primary"
              >
                <option value="">Todos</option>
                {ALL_INBOX_STATUS_OPTIONS.map(status => (
                  <option key={status} value={status}>
                    {status} ({tickets.filter(ticket => ticket.status === status).length})
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-roman-text-sub" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">
                Sede
              </label>
              <div className="relative">
              <select
                value={inboxFilter.site.length === 1 ? inboxFilter.site[0] : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setInboxFilter({
                    ...inboxFilter,
                    site: value ? [value] : [],
                  });
                }}
                className="w-full appearance-none rounded-sm border border-roman-border bg-white px-3 py-2 pr-9 text-sm text-roman-text-main outline-none transition-colors focus:border-roman-primary"
              >
                <option value="">Todas</option>
                {siteFilterOptions.map(site => (
                  <option key={site} value={site}>
                    {site}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-roman-text-sub" />
              </div>
            </div>
            <button
              onClick={() => setInboxFilter({ status: [], priority: [], region: [], site: [], type: [] })}
              className="shrink-0 self-end rounded-sm border border-roman-border px-3 py-2 text-sm font-medium text-roman-text-sub transition-colors hover:bg-roman-border-light hover:text-roman-text-main"
            >
              Limpar
            </button>
          </div>
        </div>

        {/* Z7: Active Filter Chips */}
        {activeChips.length > 0 && (
          <div className="px-2 py-2 border-b border-roman-border flex flex-wrap gap-1.5 bg-roman-bg/70">
            {activeChips.map(chip => (
              <span
                key={`${String(chip.dim)}-${chip.value}`}
                className="inline-flex items-center gap-1 bg-roman-primary/10 text-roman-primary border border-roman-primary/30 rounded-sm px-2 py-0.5 text-[11px] font-medium"
              >
                {chip.value}
                <button
                  onClick={() => removeChip(chip.dim, chip.value)}
                  className="hover:text-red-600 transition-colors ml-0.5"
                  aria-label={`Remover filtro ${chip.value}`}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Ticket List */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-roman-text-sub font-serif italic">Nenhuma OS encontrada para este filtro.</div>
          ) : (
            filteredTickets.map(ticket => (
              <TicketListItem
                key={ticket.id}
                id={ticket.id}
                subject={ticket.subject}
                requester={ticket.requester}
                time={ticket.time}
                status={ticket.status}
                priority={ticket.priority}
                active={activeTicketId === ticket.id}
                onClick={() => {
                  setActiveTicketId(ticket.id);
                  setShowMobileTicketList(false);
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* Main Ticket Workspace */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
        {!hasTickets ? (
          <div className="flex-1 flex items-center justify-center bg-roman-bg p-8">
            <div className="max-w-md text-center bg-roman-surface border border-roman-border rounded-sm p-8 shadow-sm">
              <Lock size={22} className="mx-auto mb-4 text-roman-primary" />
              <h2 className="text-2xl font-serif text-roman-text-main mb-2">Nenhuma OS disponível</h2>
              <p className="text-sm text-roman-text-sub font-serif italic">
                Este usuário não possui OS visíveis com as permissões atuais de região e sede.
              </p>
            </div>
          </div>
        ) : (
          <>
        {/* Top Navigation */}
        <header className="h-11 bg-roman-surface border-b border-roman-border flex items-center px-2">
          <div className="md:hidden flex h-full items-center gap-2 px-2">
            <button
              onClick={() => {
                setShowMobileTicketList(prev => !prev);
                setShowMobileContext(false);
              }}
              className="px-2 py-1 border border-roman-border rounded-sm text-xs text-roman-text-main"
              aria-expanded={showMobileTicketList}
              aria-controls="ticket-list-drawer"
            >
              Filas
            </button>
            <div className="text-[11px] text-roman-text-sub font-medium max-w-[42vw] truncate" title={`${activeTicket.id} · ${activeTicket.status}`}>
              #{activeTicket.id} · {activeTicket.status}
            </div>
            <button
              onClick={() => {
                setShowMobileContext(prev => !prev);
                setShowMobileTicketList(false);
              }}
              className="px-2 py-1 border border-roman-border rounded-sm text-xs text-roman-text-main"
              aria-expanded={showMobileContext}
              aria-controls="context-drawer"
            >
              Dados
            </button>
          </div>
        <div className="hidden md:flex h-full">
            <div className="h-full px-3 border-r border-roman-border flex items-center gap-2 bg-roman-bg border-t-2 border-t-roman-primary font-medium">
              <span className="w-2 h-2 rounded-full bg-roman-primary"></span>
              <span className="font-serif italic text-roman-text-sub mr-1 text-[12px]">#{activeTicket.id}</span>
              {activeTicket.subject.length > 20
                ? `${activeTicket.subject.substring(0, 20)}…`
                : activeTicket.subject}
            </div>
            <button onClick={() => navigateTo('public-form')} className="h-full px-3 border-r border-roman-border flex items-center gap-2 hover:bg-roman-bg cursor-pointer text-roman-text-sub">
              <Plus size={16} />
              <span className="font-serif">Nova OS</span>
            </button>
          </div>
          <div className="ml-auto flex items-center gap-3 px-4">
            <div className="hidden md:flex items-center gap-2 mr-4 rounded-full border border-roman-border bg-roman-bg px-3 py-1.5 text-xs text-roman-text-sub">
              <User size={14} />
              <span>Visualizando como: <strong>{displayActorLabel}</strong></span>
            </div>
          </div>
        </header>

        {/* Ticket Content Area */}
        <div className="flex h-full flex-1 min-h-0 overflow-hidden">

          {/* Conversation Thread */}
          <div className="flex-1 min-h-0 bg-roman-bg overflow-hidden grid grid-rows-[auto_minmax(0,1fr)_auto]">

            {/* Ticket Header */}
            <div className="bg-roman-surface px-4 py-4 md:px-5 md:py-5 border-b border-roman-border">
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-roman-border bg-roman-bg px-2.5 py-1 text-[10px] font-medium text-roman-text-sub">
                      {activeTicket.id}
                    </span>
                    <StatusBadge status={activeTicket.status} />
                    <span className="rounded-full border border-roman-border bg-roman-bg px-2.5 py-1 text-[10px] text-roman-text-sub">
                      {getTicketSiteLabel(activeTicket, catalogSites)}
                    </span>
                    {activeTicket.priority ? (
                      <span className="rounded-full border border-roman-border bg-roman-bg px-2.5 py-1 text-[10px] text-roman-text-sub">
                        {activeTicket.priority}
                      </span>
                    ) : null}
                  </div>
                  <h1 className="text-[2rem] leading-tight font-serif font-medium text-roman-text-main">{activeTicket.subject}</h1>
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowActionsMenu(v => !v)}
                    className={`text-roman-text-sub hover:text-roman-text-main ${showActionsMenu ? 'text-roman-primary' : ''}`}
                    title="Ações da OS"
                    aria-label="Ações da OS"
                    aria-expanded={showActionsMenu}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                  {showActionsMenu && (
                    <div ref={actionsMenuRef} className="absolute right-0 top-7 w-56 bg-roman-surface border border-roman-border shadow-xl rounded-sm z-20 overflow-hidden">
                      <button onClick={handleCopyLink} className="w-full text-left px-3 py-2 text-sm hover:bg-roman-bg transition-colors">
                        Copiar link de acompanhamento
                      </button>
                      <button onClick={handleOpenTracking} className="w-full text-left px-3 py-2 text-sm hover:bg-roman-bg transition-colors">
                        Abrir visão do solicitante
                      </button>
                      <button onClick={handleDuplicateTicket} className="w-full text-left px-3 py-2 text-sm hover:bg-roman-bg transition-colors">
                        Duplicar OS
                      </button>
                      {(activeTicket.status === TICKET_STATUS.CLOSED || activeTicket.status === TICKET_STATUS.CANCELED) ? (
                        <button onClick={handleReopenTicket} className="w-full text-left px-3 py-2 text-sm hover:bg-roman-bg transition-colors text-emerald-700">
                          Reabrir OS
                        </button>
                      ) : (
                        <button onClick={handleCancelTicket} className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 transition-colors text-red-700">
                          Cancelar OS
                        </button>
                      )}
                      {canDeleteTicket && (
                        <button
                          onClick={() => {
                            setShowActionsMenu(false);
                            setShowDeleteTicketModal(true);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 transition-colors text-red-700 flex items-center gap-2 border-t border-roman-border"
                        >
                          <Trash2 size={14} />
                          Excluir OS
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-roman-text-sub font-serif italic text-[13px]">
                <span>via Formulário do Sistema</span>
                <span>{formatDateTimeSafe(activeTicket.time)}</span>
                <span>{getTicketRegionLabel(activeTicket, catalogRegions, catalogSites)}</span>
                <button
                  onClick={() => {
                    if (ticketAttachmentItems.length === 0) return;
                    openAttachment(`Anexos: ${activeTicket.subject}`, ticketAttachmentItems[0].type, {
                      url: ticketAttachmentItems[0].url,
                      items: ticketAttachmentItems,
                    });
                  }}
                  disabled={ticketAttachmentItems.length === 0}
                  className="ml-auto text-roman-primary hover:underline flex items-center gap-1 not-italic font-medium text-xs disabled:text-roman-text-sub disabled:no-underline disabled:cursor-not-allowed"
                >
                  <ImageIcon size={14} /> {ticketAttachmentItems.length > 0 ? 'Ver Anexos' : 'Sem anexos'}
                </button>
              </div>

              {activeTicket.status === TICKET_STATUS.WAITING_PAYMENT && (
                <div className="mt-4 rounded-sm border border-roman-primary/30 bg-roman-primary/8 px-4 py-3 text-roman-text-main">
                  <div className="flex items-start gap-3">
                    <CheckSquare size={18} className="mt-0.5 shrink-0 text-roman-primary" />
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">Obra concluída e em fase financeira</div>
                      <div className="text-sm text-roman-text-sub">
                        A execução foi concluída e os próximos passos seguem no painel Financeiro.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Messages — ordenados cronologicamente (mais antigo em cima) */}
            <div className="min-h-0 overflow-y-auto p-4 md:p-5">
              <div className="space-y-5 pb-4">
              {[...activeTicket.history]
                .sort((a, b) => a.time.getTime() - b.time.getTime())
                .map((item, index) => {
                  if (item.type === 'system') {
                    return (
                      <div key={index} className="flex justify-center">
                        <div className="max-w-[82%] rounded-full border border-roman-border bg-roman-border-light/50 px-3 py-1 text-roman-text-sub">
                          <div className="flex items-center justify-center gap-2 text-center">
                            <div className="flex min-w-0 items-center gap-1.5 font-serif italic text-[10px] md:text-[11px]">
                              <Clock size={11} />
                              <span className="truncate">{item.text}</span>
                            </div>
                            <div className="shrink-0 text-[10px] font-sans text-roman-text-sub/80">
                              {formatDateTimeSafe(item.time)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (item.type === 'field_change') {
                    return (
                      <div key={index} className="flex justify-center">
                        <div className="bg-roman-bg border border-roman-border rounded-sm px-3 py-1.5 text-[10px] text-roman-text-sub font-mono flex flex-wrap items-center justify-center gap-1.5">
                          <span className="font-semibold">{item.sender}</span> alterou
                          <span className="font-medium bg-roman-surface px-1 rounded border border-roman-border">{item.field}</span>
                          de <span className="line-through opacity-70">{item.from}</span>
                          para <span className="font-medium text-roman-text-main">{item.to}</span>
                          <span className="text-[10px] opacity-50">{formatDateTimeSafe(item.time)}</span>
                        </div>
                      </div>
                    );
                  }

                  const isExternalMessage = item.type === 'customer';
                  const isInternalNote = item.visibility === 'internal' || item.type === 'internal';
                  const senderInitial = item.sender?.trim().charAt(0).toUpperCase() || 'U';
                  const messageAttachmentItems = (Array.isArray(item.attachments) ? item.attachments : [])
                    .filter(attachment => attachment?.url)
                    .map(attachment => ({
                      title: attachment.name,
                      type: attachment.contentType?.includes('pdf') ? ('pdf' as const) : ('image' as const),
                      url: attachment.url,
                    }));

                  return (
                    <div key={index} className={`flex gap-3 ${isExternalMessage ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex w-full max-w-[80%] gap-3 ${isExternalMessage ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`w-9 h-9 rounded-sm border flex items-center justify-center font-serif text-base shrink-0 ${
                          isExternalMessage
                            ? 'bg-roman-primary/10 text-roman-primary border-roman-primary/20'
                            : isInternalNote
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-roman-border-light text-roman-text-main border-roman-border'
                        }`}>
                          {senderInitial}
                        </div>
                        <div className={`flex-1 ${isExternalMessage ? 'text-right' : 'text-left'}`}>
                          <div className={`flex items-baseline gap-2 mb-1 ${isExternalMessage ? 'justify-end' : 'justify-start'}`}>
                            <span className="font-semibold text-[13px]">{item.sender}</span>
                            <span className="text-roman-text-sub text-[11px] font-serif italic">
                              {formatDateTimeSafe(item.time)}
                            </span>
                          </div>
                          <div
                            className={`rounded-sm p-4 text-[13px] leading-relaxed shadow-sm border ${
                              isExternalMessage
                                ? 'bg-roman-primary/5 border-roman-primary/20'
                                : isInternalNote
                                  ? 'bg-amber-50/70 border-amber-200'
                                  : 'bg-roman-surface border-roman-border'
                            }`}
                          >
                            {item.text}
                            {messageAttachmentItems.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {messageAttachmentItems.map((attachment, attachmentIndex) => (
                                  <button
                                    key={`${item.id}-attachment-${attachmentIndex}`}
                                    type="button"
                                    onClick={() =>
                                      openAttachment(attachment.title, attachment.type, {
                                        url: attachment.url,
                                        items: messageAttachmentItems,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 rounded-sm border border-roman-border bg-white/70 px-2 py-1 text-[11px] text-roman-text-main transition-colors hover:border-roman-primary"
                                  >
                                    <FileText size={12} />
                                    <span className="max-w-[180px] truncate">{attachment.title}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reply Box */}
            <div className="border-t border-roman-border bg-roman-bg/95 px-4 pb-4 pt-3 backdrop-blur md:px-5">
              <div className={`border rounded-xl overflow-hidden shadow-sm transition-colors ${replyMode !== 'public' ? 'border-roman-parchment-border bg-roman-parchment' : 'border-roman-border bg-roman-surface'}`}>
                {/* Tabs */}
                <div className="flex border-b border-roman-border bg-roman-bg/50">
                  <button
                    onClick={() => setReplyMode('internal')}
                    className={`px-4 py-2 font-serif text-base tracking-wide flex items-center gap-2 ${replyMode === 'internal' ? 'bg-roman-parchment text-roman-text-main border-t-2 border-t-stone-800' : 'text-roman-text-sub hover:bg-roman-surface/50'}`}
                  >
                    <Lock size={14} /> {internalTabLabel}
                  </button>
                  <button
                    onClick={() => setReplyMode('public')}
                    className={`px-4 py-2 font-serif text-base tracking-wide ${replyMode === 'public' ? 'bg-roman-surface text-roman-text-main border-t-2 border-t-roman-primary' : 'text-roman-text-sub hover:bg-roman-surface/50'}`}
                  >
                    Mensagem ao Solicitante
                  </button>
                  {canMessageDirector && (
                    <button
                      onClick={() => setReplyMode('director')}
                      className={`px-4 py-2 font-serif text-base tracking-wide ${replyMode === 'director' ? 'bg-roman-parchment text-roman-text-main border-t-2 border-t-stone-800' : 'text-roman-text-sub hover:bg-roman-surface/50'}`}
                    >
                      Mensagem à Diretoria
                    </button>
                  )}
                </div>

                {/* Formatting Toolbar */}
                <div className={`flex items-center gap-2 p-2 border-b border-roman-border/50 text-roman-text-sub ${isClosed ? 'opacity-50 pointer-events-none' : ''}`}>
                  <button onClick={() => applyFormatting('bold')} className="p-1 hover:bg-roman-bg rounded" disabled={isClosed}><Bold size={16} /></button>
                  <button onClick={() => applyFormatting('italic')} className="p-1 hover:bg-roman-bg rounded" disabled={isClosed}><Italic size={16} /></button>
                  <button onClick={() => applyFormatting('list')} className="p-1 hover:bg-roman-bg rounded" disabled={isClosed}><List size={16} /></button>
                  <div className="w-px h-4 bg-roman-border mx-1"></div>
                  <button
                    onClick={() => replyFileRef.current?.click()}
                    className={`p-1 hover:bg-roman-bg rounded relative ${replyFiles.length > 0 ? 'text-roman-primary' : ''}`}
                    title="Anexar arquivos"
                    disabled={isClosed}
                  >
                    <Paperclip size={16} />
                    {replyFiles.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-roman-primary rounded-full"></span>
                    )}
                  </button>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    ref={replyFileRef}
                    onChange={handleReplyFileChange}
                    disabled={isClosed}
                  />
                </div>

                {/* Textarea */}
                <textarea
                  ref={replyTextRef}
                  className="w-full h-24 p-4 outline-none resize-none bg-transparent font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder={
                    isClosed
                      ? 'Esta OS está encerrada e não aceita novos comentários.'
                      : replyMode === 'internal'
                        ? internalPlaceholder
                        : replyMode === 'director'
                          ? 'Mensagem interna para Diretoria...'
                          : 'Mensagem para o solicitante...'
                  }
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  disabled={isClosed}
                />

                {/* File Preview */}
                {replyFiles.length > 0 && (
                  <div className="px-4 pb-2 flex flex-wrap gap-2">
                    {replyFiles.map((file, i) => (
                      <div key={i} className="flex items-center gap-1 text-xs bg-roman-surface border border-roman-border px-2 py-1 rounded-sm text-roman-text-main">
                        <FileText size={12} />
                        <span className="max-w-[150px] truncate">{file.name}</span>
                        <button onClick={() => setReplyFiles(prev => prev.filter((_, idx) => idx !== i))} className="ml-1 hover:text-red-500" disabled={isClosed}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="p-3 border-t border-roman-border/50 flex justify-between items-center bg-roman-bg/60">
                  <div className="text-xs text-roman-text-sub font-serif italic">
                    {replyMode === 'internal'
                      ? internalActionText
                      : replyMode === 'director'
                        ? 'Ação: Notificar Diretoria por e-mail (conversa interna)'
                        : 'Ação: Notificar solicitante por e-mail'}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setReplyText('');
                        setReplyFiles([]);
                        if (replyFileRef.current) replyFileRef.current.value = '';
                      }}
                      className="px-4 py-1.5 text-roman-text-sub hover:bg-roman-bg rounded font-medium transition-colors disabled:opacity-50"
                      disabled={isClosed}
                    >
                      Cancelar
                    </button>
                    <div className="flex rounded-sm overflow-hidden shadow-sm">
                      <button
                        onClick={handleSend}
                        className="bg-roman-sidebar hover:bg-stone-900 text-white px-4 py-1.5 font-medium transition-colors tracking-wide flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isClosed || isSending}
                      >
                        {isSending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                        {isSending
                          ? 'Enviando...'
                          : replyMode === 'internal'
                            ? internalButtonText
                            : replyMode === 'director'
                              ? 'Enviar à Diretoria'
                              : 'Enviar Mensagem'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Context Panel (Right Sidebar) */}
          <aside id="context-drawer" className={`fixed md:static inset-y-0 right-0 z-40 h-full w-[88vw] max-w-96 md:w-[18rem] xl:w-[21rem] bg-roman-surface border-l border-roman-border flex min-h-0 flex-col transition-transform duration-200 ${showMobileContext ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
            <div className="h-11 border-b border-roman-border flex items-center justify-between px-4 font-serif text-sm tracking-widest uppercase font-semibold text-roman-text-main">
              <span>Painel da OS</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMobileContext(false);
                }}
                className="md:hidden text-roman-text-sub hover:text-roman-text-main"
                aria-label="Fechar painel de dados"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
              {/* PUBLIC LINK BUTTON */}
              <div className="flex gap-2">
                <button
                  onClick={handleCopyLink}
                  className="flex-1 flex items-center justify-center px-3 py-2 bg-roman-bg border border-roman-border rounded-xl hover:border-roman-primary/50 transition-colors group gap-2 text-roman-text-main font-medium text-[13px]"
                  title="Copiar link seguro para o solicitante"
                >
                  <Copy size={14} className="text-roman-text-sub group-hover:text-roman-primary" />
                  Copiar Link
                </button>
                <button
                  onClick={handleOpenTracking}
                  className="px-3 py-2 bg-roman-bg border border-roman-border rounded-xl hover:border-roman-primary/50 transition-colors group text-roman-text-sub hover:text-roman-primary"
                  title="Visualizar como solicitante"
                >
                  <ExternalLink size={14} />
                </button>
              </div>

              {/* EXECUTION CONTROL — só aparece quando há ações relevantes */}
              {(activeTicket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS ||
                activeTicket.status === TICKET_STATUS.IN_PROGRESS ||
                activeTicket.status === TICKET_STATUS.WAITING_PAYMENT ||
                activeTicket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL ||
                activeTicket.status === TICKET_STATUS.CLOSED) && (
                <section className="rounded-xl border border-roman-border bg-roman-bg/50 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => setSidebarSections(prev => ({ ...prev, execution: !prev.execution }))}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <div>
                      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-bold">Execução</div>
                      <div className="mt-1 text-[11px] text-roman-text-sub">Preliminares, andamento físico e próximos passos da obra.</div>
                    </div>
                    <ChevronDown size={16} className={`mt-0.5 shrink-0 text-roman-text-sub transition-transform ${sidebarSections.execution ? 'rotate-180' : ''}`} />
                  </button>

                  {sidebarSections.execution ? (
                    <div className="mt-3 space-y-2">
                      <div className="rounded-xl border border-roman-primary/20 bg-roman-primary/5 px-3 py-3">
                        <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Próxima ação</div>
                        <div className="mt-1 text-[12px] font-medium text-roman-text-main">{executionNextActionLabel}</div>
                      </div>

                      {activeTicket.preliminaryActions && (
                        <div className="mb-2 rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub space-y-1">
                          <div className="font-medium text-roman-text-main">Resumo das preliminares</div>
                          <div>{buildPreliminarySummary(activeTicket.preliminaryActions)}</div>
                          <div>Início previsto: {formatShortDate(activeTicket.preliminaryActions.plannedStartAt)}</div>
                          <div>Material previsto: {formatShortDate(activeTicket.preliminaryActions.materialEta)}</div>
                        </div>
                      )}

                      {activeTicket.executionProgress && (
                        <div className="mb-2 rounded-sm border border-roman-border bg-roman-surface px-3 py-3">
                          <div className="flex items-center justify-between text-xs text-roman-text-sub mb-2">
                            <span className="font-medium text-roman-text-main">Andamento da obra</span>
                            <span>{activeProgressPercent}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-stone-200 overflow-hidden">
                            <div className="h-full rounded-full bg-roman-sidebar transition-all" style={{ width: `${activeProgressBarPercent}%` }} />
                          </div>
                          <div className="mt-2 space-y-1 text-[11px] text-roman-text-sub">
                            <div>Fluxo: {activeTicket.executionProgress.paymentFlowParts}x</div>
                            <div>Marcos liberados: {activeReleasedPercent}%</div>
                            <div>Próximo marco: {activeNextMilestonePercent != null ? `${activeNextMilestonePercent}%` : 'todos os marcos liberados'}</div>
                            {activeTicket.executionProgress.measurementSheetUrl && (
                              <div>
                                Planilha de medição:{' '}
                                <a
                                  href={activeTicket.executionProgress.measurementSheetUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-roman-primary hover:underline"
                                >
                                  abrir link
                                </a>
                              </div>
                            )}
                            <div>Última atualização: {formatDateTimeSafe(activeTicket.executionProgress.lastUpdatedAt || activeTicket.time)}</div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        {activeTicket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS && (
                          <button onClick={() => setShowPrelimModal(true)} className="w-full bg-roman-bg border border-roman-border hover:border-roman-primary text-roman-text-main py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2">
                            <List size={14} /> Ações Preliminares (Compras)
                          </button>
                        )}

                        {(activeTicket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS || activeTicket.status === TICKET_STATUS.IN_PROGRESS) && (
                          <button
                            onClick={handleStartExecution}
                            className="w-full bg-roman-bg border border-roman-border hover:border-roman-primary text-roman-text-main py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2"
                          >
                            <Play size={14} /> {activeTicket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS ? 'Revisar Checklist para Início' : 'Revisar Fluxo da Execução'}
                          </button>
                        )}

                        {canManageStatus &&
                          activeTicket.executionProgress &&
                          activeTicket.status !== TICKET_STATUS.CLOSED &&
                          activeTicket.status !== TICKET_STATUS.CANCELED && (
                            <button
                              onClick={handleOpenProgressModal}
                              className="w-full bg-roman-sidebar hover:bg-stone-900 text-white py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2"
                            >
                              <RefreshCw size={14} /> Atualizar Andamento da Obra
                            </button>
                          )}

                        {activeTicket.status === TICKET_STATUS.IN_PROGRESS && (
                          <button
                            onClick={handleSendForValidation}
                            className="w-full bg-roman-sidebar hover:bg-stone-900 text-white px-3 py-2.5 rounded-sm font-medium transition-colors text-xs text-center leading-tight"
                          >
                            <span className="block">Concluir execução e enviar ao solicitante</span>
                          </button>
                        )}

                        {(activeTicket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL ||
                          activeTicket.status === TICKET_STATUS.WAITING_PAYMENT ||
                          activeTicket.status === TICKET_STATUS.CLOSED) &&
                          activeTicket.closureChecklist && (
                            <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub space-y-1">
                              <div className="font-medium text-roman-text-main">Checklist de encerramento</div>
                              <div>Infraestrutura 1: {activeTicket.closureChecklist.infrastructureApprovalPrimary ? 'confirmado' : 'pendente'}</div>
                              <div>Infraestrutura 2: {activeTicket.closureChecklist.infrastructureApprovalSecondary ? 'confirmado' : 'pendente'}</div>
                              <div>Início do serviço: {formatShortDate(activeTicket.closureChecklist.serviceStartedAt)}</div>
                              <div>Término do serviço: {formatShortDate(activeTicket.closureChecklist.serviceCompletedAt)}</div>
                              <div>Laudos anexados: {activeTicket.closureChecklist.documents?.length || 0}</div>
                            </div>
                          )}

                        {activeTicket.status === TICKET_STATUS.WAITING_PAYMENT && (
                          <div className="rounded-sm border border-green-200 bg-green-50 px-3 py-3 text-xs text-green-800">
                            Pagamento e encerramento final agora são concluídos no painel Financeiro, com checklist e garantia.
                          </div>
                        )}
                        {activeTicket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL && (
                          <div className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
                            Aguardando confirmação do solicitante no link de acompanhamento para seguir para o financeiro.
                          </div>
                        )}

                        {activeTicket.status === TICKET_STATUS.CLOSED && activeTicket.guarantee && (
                          <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub space-y-1">
                            <div className="font-medium text-roman-text-main">Garantia</div>
                            <div>Status: {activeTicket.guarantee.status === 'active' ? 'Ativa' : activeTicket.guarantee.status === 'expired' ? 'Expirada' : 'Pendente'}</div>
                            <div>Início: {formatShortDate(activeTicket.guarantee.startAt)}</div>
                            <div>Fim: {formatShortDate(activeTicket.guarantee.endAt)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </section>
              )}

              {canManageBudgetRounds && (
                <section className="rounded-xl border border-roman-border bg-roman-bg/50 px-3 py-3">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-bold">Gestão de Orçamentos</h4>
                  </div>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setQuoteRoundType('initial');
                        setShowQuotesModal(true);
                      }}
                      className="w-full bg-roman-bg border border-roman-border hover:border-roman-primary text-roman-text-main py-3 rounded-xl font-medium transition-colors text-xs flex items-center justify-center gap-2 group"
                    >
                      <DollarSign size={16} className="text-roman-text-sub group-hover:text-roman-primary" />
                      Gerenciar Cotações ({quotes.filter(q => q.vendor && q.value).length}/3)
                    </button>
                    <button
                      onClick={() => {
                        setQuoteRoundType('additive');
                        setQuoteAdditiveIndex(availableAdditiveRounds.length > 0 ? Math.max(...availableAdditiveRounds) : 1);
                        setShowQuotesModal(true);
                      }}
                      className="w-full bg-roman-bg border border-roman-border hover:border-roman-primary text-roman-text-main py-3 rounded-xl font-medium transition-colors text-xs flex items-center justify-center gap-2 group"
                    >
                      <Plus size={16} className="text-roman-text-sub group-hover:text-roman-primary" />
                      Gerenciar Aditivos
                    </button>
                    {(panelStatus === TICKET_STATUS.WAITING_CONTRACT_UPLOAD || (panelStatus.includes('Anexo') && panelStatus.includes('Contrato'))) && (
                      <button
                        onClick={() => setShowContractDispatchModal(true)}
                        className="w-full min-h-[52px] bg-roman-sidebar hover:bg-stone-900 text-white px-3 py-2 rounded-xl font-medium transition-colors text-sm leading-tight text-center flex items-center justify-center gap-2"
                      >
                        <FileText size={15} className="shrink-0" />
                        <span className="leading-tight text-center block">Anexar Contrato e Enviar para Diretoria</span>
                      </button>
                    )}
                  </div>
                </section>
              )}

              {showTriagePanel && (
              <section className="rounded-xl border border-roman-border bg-roman-bg/50 px-3 py-3">
                <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Atendimento e triagem</div>
                <div className="mt-1 text-[11px] text-roman-text-sub">Status, equipe responsável e decisões de atendimento.</div>
                {activeTicket.status === TICKET_STATUS.NEW && (
                  <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3">
                    <div className="text-[10px] font-serif uppercase tracking-widest text-amber-800">Triagem inicial</div>
                    <div className="mt-1 text-[12px] text-amber-900">Defina equipe, urgência e decida se a OS será aceita ou cancelada.</div>
                  </div>
                )}
                {quickPanelCollapsed && (
                  <div className="mt-3 space-y-2">
                    <div className="rounded-sm border border-roman-border bg-white px-3 py-2 text-[12px] text-roman-text-sub">
                      Responsável: <span className="font-medium text-roman-text-main">{techTeam || 'Não definido'}</span> ·
                      Urgência: <span className="font-medium text-roman-text-main"> {ticketPriority || 'Não definida'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuickPanelExpanded(true)}
                      className="w-full rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-xs font-medium text-roman-text-main transition-colors hover:border-roman-primary"
                    >
                      Atualizar OS
                    </button>
                  </div>
                )}
                {!quickPanelCollapsed && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 gap-3">
                    {canManageStatus && (
                      <div>
                      <label className="mb-1.5 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Status da OS</label>
                      <select
                        value={statusDraft}
                        onChange={event => setStatusDraft(event.target.value)}
                        className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                        disabled={isSending}
                      >
                        {statusOptions.map(status => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                      </div>
                    )}
                    <div>
                      <label className="mb-1.5 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Responsável técnico</label>
                      <select
                        value={techTeam}
                        onChange={handleTechTeamChange}
                        className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSending || !canEditQuickPanel}
                      >
                        <option value="">Selecione a Equipe...</option>
                        {teams.map(team => (
                          <option key={team.id} value={team.name}>{team.type === 'external' ? 'Terceiro' : team.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Grau de urgência</label>
                      <select
                        value={ticketPriority}
                        onChange={handlePriorityChange}
                        className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSending || !canEditQuickPanel}
                      >
                        <option value="">Selecione a urgência...</option>
                        <option value="Urgente">Urgente</option>
                        <option value="Alta">Alta</option>
                        <option value="Trivial">Trivial</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Macroserviço</label>
                      <select
                        value={ticketDetailsForm.macroServiceId}
                        onChange={handleMacroServiceChange}
                        className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSending || !canEditQuickPanel}
                      >
                        <option value="">Definir na triagem</option>
                        {catalogMacroServices.map(item => (
                          <option key={`triage-macro-${item.id}`} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Serviço</label>
                      <select
                        value={ticketDetailsForm.serviceCatalogId}
                        onChange={handleServiceCatalogChange}
                        className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSending || !canEditQuickPanel || !ticketDetailsForm.macroServiceId}
                      >
                        <option value="">{ticketDetailsForm.macroServiceId ? 'Definir serviço' : 'Selecione primeiro o macroserviço'}</option>
                        {availableAdminServiceItems.map(item => (
                          <option key={`triage-service-${item.id}`} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {isExternalTeam && (
                    <div className="space-y-3 rounded-sm border border-roman-border bg-roman-bg px-3 py-3">
                      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Terceiro</div>
                      <div className="rounded-sm border border-roman-border bg-roman-surface px-3 py-3">
                        <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Selecionados</div>
                        <div className="mt-1 text-sm font-medium text-roman-text-main">
                          {selectedThirdParties.length > 0
                            ? `${selectedThirdParties.length} terceiro(s)`
                            : 'Nenhum terceiro selecionado'}
                        </div>
                        {selectedThirdParties.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedThirdParties.map(vendor => (
                              <span key={`selected-vendor-inline-${vendor.id}`} className="inline-flex items-center rounded-sm border border-roman-primary/40 bg-roman-primary/10 px-2 py-0.5 text-[11px] text-roman-primary">
                                {vendor.name}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 text-[11px] text-roman-text-sub">
                          E-mails usados: {resolveAssignedEmails() || 'Não informado'}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        <button
                          type="button"
                          onClick={() => setShowThirdPartyModal(true)}
                          className="w-full rounded-sm border border-roman-border bg-white px-3 py-2 text-xs font-medium text-roman-text-main transition-colors hover:border-roman-primary disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isSending || !canEditQuickPanel}
                        >
                          {selectedThirdParties.length > 0 ? 'Gerenciar terceiros' : 'Selecionar terceiros'}
                        </button>
                        {selectedThirdParties.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedThirdPartyIds([]);
                              setCustomEmail('');
                              setThirdPartySelectDraftId('');
                            }}
                            className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-xs font-medium text-roman-text-main transition-colors hover:border-roman-primary disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isSending || !canEditQuickPanel}
                          >
                            Limpar seleção
                          </button>
                        )}
                        {!canEditQuickPanel && (
                          <div className="text-[11px] text-roman-text-sub">
                            Apenas leitura neste status.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTicket.status === TICKET_STATUS.NEW ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleAcceptTicket}
                        disabled={isSending}
                        className="inline-flex items-center justify-center gap-2 rounded-sm bg-roman-sidebar px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-stone-900 disabled:opacity-60"
                      >
                        {isSending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                        Aceitar OS
                      </button>
                      <button
                        onClick={handleCancelTicket}
                        disabled={isSending}
                        className="inline-flex items-center justify-center gap-2 rounded-sm border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60"
                      >
                        <X size={14} />
                        Cancelar OS
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {canManageStatus && (
                        <button
                          onClick={handleSaveQuickPanel}
                          disabled={isSending}
                          className="inline-flex items-center justify-center gap-2 rounded-sm bg-roman-sidebar px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-stone-900 disabled:opacity-60"
                        >
                          {isSending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                          Salvar painel
                        </button>
                      )}
                      {canManageStatus && [TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED].includes(activeTicket.status) && (
                        <button
                          onClick={handleReopenTicket}
                          disabled={isSending}
                          className="inline-flex items-center justify-center gap-2 rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-xs font-medium text-roman-text-main transition-colors hover:border-roman-primary"
                        >
                          <RefreshCw size={14} />
                          Reabrir OS
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setQuickPanelExpanded(false)}
                        disabled={isSending}
                        className="inline-flex items-center justify-center gap-2 rounded-sm border border-roman-border bg-white px-3 py-2 text-xs font-medium text-roman-text-main transition-colors hover:border-roman-primary disabled:opacity-60"
                      >
                        Fechar painel
                      </button>
                    </div>
                  )}
                </div>
                )}
              </section>
              )}

              <section className="rounded-xl border border-roman-border bg-white px-3 py-3">
                <button
                  type="button"
                  onClick={() => setSidebarSections(prev => ({ ...prev, summary: !prev.summary }))}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div>
                    <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Resumo do chamado</div>
                    <div className="mt-1 text-[11px] text-roman-text-sub">Informações de leitura e contexto do atendimento.</div>
                  </div>
                  <ChevronDown size={16} className={`mt-0.5 shrink-0 text-roman-text-sub transition-transform ${sidebarSections.summary ? 'rotate-180' : ''}`} />
                </button>
                {sidebarSections.summary && (
                  <>
                    <div className="mt-3 rounded-xl border border-roman-border bg-roman-bg px-3 py-3">
                      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Assunto</div>
                      <div className="mt-1 text-[15px] font-serif text-roman-text-main leading-snug">{activeTicket.subject || 'Sem assunto definido'}</div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
                      <PropertyField label="Solicitante" value={activeTicket.requester} />
                      <PropertyField label="E-mail" value={activeTicket.requesterEmail || 'Não informado'} />
                      <PropertyField label="Setor" value={activeTicket.sector} />
                      <PropertyField label="Região" value={getTicketRegionLabel(activeTicket, catalogRegions, catalogSites)} />
                      <PropertyField label="Sede" value={getTicketSiteLabel(activeTicket, catalogSites)} />
                      <PropertyField label="Status atual" value={activeTicket.status} />
                    </div>
                  </>
                )}
              </section>

              <section className="rounded-xl border border-roman-border bg-roman-bg/50 px-3 py-3">
                <button
                  type="button"
                  onClick={() => setSidebarSections(prev => ({ ...prev, classification: !prev.classification }))}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div>
                      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Classificação interna</div>
                      <div className="mt-1 text-[11px] text-roman-text-sub">Definições técnicas e administrativas da OS.</div>
                  </div>
                  <ChevronDown size={16} className={`mt-0.5 shrink-0 text-roman-text-sub transition-transform ${sidebarSections.classification ? 'rotate-180' : ''}`} />
                </button>
                  {sidebarSections.classification && (
                  <div className="mt-3 space-y-2.5">
                    <PropertyField label="Macroserviço" value={activeTicket.macroServiceName || 'Não definido'} />
                    <PropertyField label="Serviço" value={activeTicket.serviceCatalogName || 'Não definido'} />
                  </div>
                )}
              </section>

            </div>
          </aside>
        </div>
          </>
        )}
      </div>

      {showThirdPartyModal && isExternalTeam && (
        <ModalShell
          isOpen={showThirdPartyModal}
          onClose={() => setShowThirdPartyModal(false)}
          title="Selecionar terceiros"
          description="Selecione os terceiros responsáveis, filtre por tag e cadastre novos parceiros sem sair da triagem."
          maxWidthClass="max-w-3xl"
          footer={(
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowThirdPartyModal(false)}
                className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm"
              >
                Fechar
              </button>
            </div>
          )}
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Filtro por tag</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setThirdPartyTag('');
                    setThirdPartySelectDraftId('');
                  }}
                  className={`rounded-sm border px-2.5 py-1 text-xs transition-colors ${
                    !thirdPartyTag
                      ? 'border-roman-primary bg-roman-primary text-white'
                      : 'border-roman-border bg-roman-surface text-roman-text-main hover:border-roman-primary'
                  }`}
                  disabled={isSending || !canEditQuickPanel}
                >
                  Todas
                </button>
                {thirdPartyTagOptions.map(tag => (
                  <button
                    key={`tag-modal-${tag}`}
                    type="button"
                    onClick={() => {
                      setThirdPartyTag(tag);
                      setThirdPartySelectDraftId('');
                    }}
                    className={`rounded-sm border px-2.5 py-1 text-xs transition-colors ${
                      thirdPartyTag === tag
                        ? 'border-roman-primary bg-roman-primary text-white'
                        : 'border-roman-border bg-roman-surface text-roman-text-main hover:border-roman-primary'
                    }`}
                    disabled={isSending || !canEditQuickPanel}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Lista de terceiros</label>
              <select
                value={thirdPartySelectDraftId}
                onChange={event => {
                  const nextId = event.target.value;
                  setThirdPartySelectDraftId(nextId);
                  if (!nextId) return;
                  setSelectedThirdPartyIds(current => (current.includes(nextId) ? current : [...current, nextId]));
                }}
                className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSending || !canEditQuickPanel}
              >
                <option value="">Selecione o terceiro...</option>
                {filteredThirdParties.map(vendor => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedThirdParties.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedThirdParties.map(vendor => (
                  <span key={`selected-vendor-modal-${vendor.id}`} className="inline-flex items-center gap-1 rounded-sm border border-roman-primary/40 bg-roman-primary/10 px-2 py-0.5 text-[11px] text-roman-primary">
                    {vendor.name}
                    {canEditQuickPanel && (
                      <button
                        type="button"
                        onClick={() => setSelectedThirdPartyIds(current => current.filter(id => id !== vendor.id))}
                        className="text-roman-primary hover:opacity-70"
                        aria-label={`Remover ${vendor.name}`}
                        title={`Remover ${vendor.name}`}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            <div>
              <label className="mb-1 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">E-mail manual adicional (opcional)</label>
              <input
                type="email"
                value={customEmail}
                onChange={e => setCustomEmail(e.target.value)}
                placeholder="terceiro@email.com"
                className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSending || !canEditQuickPanel}
              />
            </div>

            {canEditQuickPanel && (
              <div className="space-y-2 rounded-sm border border-roman-border/70 bg-roman-surface px-3 py-3">
                <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Cadastrar novo terceiro</div>
                <input
                  type="text"
                  value={newThirdPartyName}
                  onChange={event => setNewThirdPartyName(event.target.value)}
                  placeholder="Nome do terceiro"
                  className="w-full rounded-sm border border-roman-border bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                />
                <input
                  type="email"
                  value={newThirdPartyEmail}
                  onChange={event => setNewThirdPartyEmail(event.target.value)}
                  placeholder="Email (opcional)"
                  className="w-full rounded-sm border border-roman-border bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                />
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Tags compartilhadas</label>
                    <button
                      type="button"
                      onClick={() => void handleCreateSharedTagInline()}
                      disabled={newSharedTagSaving || !newSharedTagDraft.trim()}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-roman-border bg-white text-roman-text-main transition-colors hover:border-roman-primary disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Cadastrar tag compartilhada"
                      title="Cadastrar tag compartilhada"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newSharedTagDraft}
                    onChange={event => setNewSharedTagDraft(event.target.value)}
                    placeholder="Nova tag (ex.: Gesso)"
                    className="mb-2 w-full rounded-sm border border-roman-border bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                  />
                  {thirdPartyTagOptions.length === 0 ? (
                    <div className="w-full rounded-sm border border-roman-border bg-white px-3 py-2 text-[13px] text-roman-text-sub">
                      Cadastre tags em Configurações para selecionar aqui.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {thirdPartyTagOptions.map(tag => {
                        const selected = newThirdPartyTags.some(item => item.toLowerCase() === tag.toLowerCase());
                        return (
                          <button
                            key={`new-third-party-tag-modal-${tag}`}
                            type="button"
                            onClick={() =>
                              setNewThirdPartyTags(prev =>
                                selected
                                  ? prev.filter(item => item.toLowerCase() !== tag.toLowerCase())
                                  : [...prev, tag]
                              )
                            }
                            className={`rounded-sm border px-2.5 py-1 text-xs transition-colors ${
                              selected
                                ? 'border-roman-primary bg-roman-primary text-white'
                                : 'border-roman-border bg-white text-roman-text-main hover:border-roman-primary'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleCreateThirdParty()}
                  className="w-full rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-xs font-medium text-roman-text-main transition-colors hover:border-roman-primary"
                >
                  Cadastrar terceiro
                </button>
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {/* Quotes Modal */}
      {showDeleteTicketModal && (
        <ModalShell
          isOpen={showDeleteTicketModal}
          onClose={() => setShowDeleteTicketModal(false)}
          title={`Excluir ${activeTicket.id}`}
          description="Esta ação remove a OS e todos os registros relacionados no Firebase."
          maxWidthClass="max-w-md"
          footer={(
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowDeleteTicketModal(false)}
                disabled={isDeletingTicket}
                className="rounded-sm border border-roman-border px-4 py-2 text-sm font-medium text-roman-text-sub transition-colors hover:bg-roman-bg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteTicket}
                disabled={isDeletingTicket}
                className="inline-flex items-center gap-2 rounded-sm bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingTicket ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {isDeletingTicket ? 'Excluindo...' : 'Confirmar exclusão'}
              </button>
            </div>
          )}
        >
          <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
            <div className="font-medium">Serão excluídos:</div>
            <div className="mt-1">ticket, cotações, contrato, lançamentos, medições, conversa por e-mail e anexos vinculados.</div>
          </div>
        </ModalShell>
      )}

      {showQuotesModal && (
        <ModalShell
          isOpen={showQuotesModal}
          onClose={() => setShowQuotesModal(false)}
          title={quoteRoundType === 'additive' ? 'Gestão de Aditivos' : 'Gestão de Orçamentos'}
          description={quoteRoundType === 'additive' ? 'Registre o aditivo com 1 cotação para aprovação da diretoria.' : 'Registre no mínimo duas cotações para submeter a rodada à diretoria.'}
          maxWidthClass="max-w-6xl"
          footer={(
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowQuotesModal(false)} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm">
                Fechar
              </button>
              <button
                onClick={handleSendToDirector}
                disabled={isSending}
                className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm flex items-center gap-2 disabled:opacity-70"
              >
                {isSending ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
                {isSending ? 'Enviando...' : 'Enviar para Diretoria'}
              </button>
            </div>
          )}
        >
              <div className="flex items-center justify-between mb-6">
                <p className="text-sm text-roman-text-sub">
                  {quoteRoundType === 'additive'
                    ? 'Aditivo deve ser enviado com 1 cotação.'
                    : 'Informe pelo menos 2 cotações para enviar à diretoria. A terceira continua opcional para comparação mais robusta.'}
                </p>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-sm font-medium">
                  {quoteRoundType === 'initial' ? 'Orçamento Inicial' : `Aditivo ${quoteAdditiveIndex}`}
                </span>
              </div>

              <div className="mb-6 rounded-sm border border-roman-border bg-roman-surface p-4">
                {quoteRoundType === 'additive' && (
                  <div className="space-y-3">
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Rodada de aditivo</label>
                    <select
                      value={quoteAdditiveIndex}
                      onChange={event => setQuoteAdditiveIndex(Number(event.target.value) || 1)}
                      className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-bg outline-none focus:border-roman-primary"
                    >
                      {availableAdditiveRounds.map(round => (
                        <option key={`aditivo-round-${round}`} value={round}>
                          Aditivo {round}
                        </option>
                      ))}
                      <option value={(availableAdditiveRounds.length > 0 ? Math.max(...availableAdditiveRounds) : 0) + 1}>
                        Novo aditivo ({(availableAdditiveRounds.length > 0 ? Math.max(...availableAdditiveRounds) : 0) + 1})
                      </option>
                    </select>
                    <div>
                      <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Motivo do aditivo</label>
                      <textarea
                        value={additiveReason}
                        onChange={event => setAdditiveReason(event.target.value)}
                        placeholder="Descreva o motivo técnico/operacional do aditivo..."
                        className="w-full min-h-[76px] text-sm p-2 border border-roman-border rounded-sm bg-roman-bg outline-none focus:border-roman-primary"
                      />
                    </div>
                  </div>
                )}
              </div>

              {(activeTicket.macroServiceName || activeTicket.serviceCatalogName) && (
                <div className="mb-6 rounded-sm border border-roman-primary/20 bg-roman-primary/5 px-4 py-3 text-sm text-roman-text-main">
                  <div className="font-medium">Classificação da OS</div>
                  <div className="mt-1 text-roman-text-sub">
                    {activeTicket.macroServiceName || 'Sem macroserviço'} {activeTicket.serviceCatalogName ? `· ${activeTicket.serviceCatalogName}` : ''}
                  </div>
                </div>
              )}

              <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
                  <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Valor previsto</div>
                  <div className="mt-1 text-base font-serif text-roman-text-main">
                    {budgetBaselineAndRealized.plannedValue > 0 ? formatCurrencyInput(budgetBaselineAndRealized.plannedValue) : '-'}
                  </div>
                </div>
                <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
                  <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Aditivos aprovados</div>
                  <div className="mt-1 text-base font-serif text-roman-text-main">
                    {budgetBaselineAndRealized.additiveValue > 0 ? formatCurrencyInput(budgetBaselineAndRealized.additiveValue) : '-'}
                  </div>
                </div>
                <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
                  <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Valor realizado</div>
                  <div className="mt-1 text-base font-serif text-roman-text-main">
                    {budgetBaselineAndRealized.realizedValue > 0 ? formatCurrencyInput(budgetBaselineAndRealized.realizedValue) : '-'}
                  </div>
                </div>
              </div>

              <div className="mb-6 rounded-sm border border-roman-border bg-roman-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-serif text-roman-text-main">Cabeçalho da proposta</h4>
                    <p className="text-xs text-roman-text-sub">Estruture a rodada com unidade, local e pasta da referência enviada pelo solicitante.</p>
                  </div>
                  <span className="rounded-sm border border-roman-border bg-roman-bg px-2 py-1 text-[11px] text-roman-text-sub">Comparativo lado a lado</span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Unidade</label>
                    <input
                      type="text"
                      value={proposalHeader.unitName}
                      onChange={event => handleProposalHeaderChange('unitName', event.target.value)}
                      className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-bg outline-none focus:border-roman-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Local</label>
                    <input
                      type="text"
                      placeholder="Ex.: 9º andar"
                      value={proposalHeader.location}
                      onChange={event => handleProposalHeaderChange('location', event.target.value)}
                      className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-bg outline-none focus:border-roman-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Pasta / Link</label>
                    <input
                      type="text"
                      placeholder="Cole o link da pasta"
                      value={proposalHeader.folderLink}
                      onChange={event => handleProposalHeaderChange('folderLink', event.target.value)}
                      className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-bg outline-none focus:border-roman-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Contratado / referência</label>
                    <input
                      type="text"
                      placeholder="Fornecedor já contratado, se houver"
                      value={proposalHeader.contractedVendor}
                      onChange={event => handleProposalHeaderChange('contractedVendor', event.target.value)}
                      className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-bg outline-none focus:border-roman-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Quantidade total</label>
                    <input
                      type="text"
                      placeholder="Ex.: 212 m²"
                      value={proposalHeader.totalQuantity}
                      onChange={event => handleProposalHeaderChange('totalQuantity', event.target.value)}
                      className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-bg outline-none focus:border-roman-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Valor total previsto</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="R$ 0,00"
                      value={proposalHeader.totalEstimatedValue}
                      onChange={event => handleProposalHeaderChange('totalEstimatedValue', event.target.value)}
                      onBlur={() => handleProposalCurrencyBlur('totalEstimatedValue')}
                      className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-bg outline-none focus:border-roman-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="mb-6 rounded-sm border border-roman-border bg-roman-bg p-4">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h4 className="text-sm font-serif text-roman-text-main">Base histórica (24 meses)</h4>
                    <p className="text-xs text-roman-text-sub">
                      {budgetHistory.comparableTicketCount > 0
                        ? `${budgetHistory.comparableTicketCount} OS similares encontradas para comparação.`
                        : 'Sem base histórica suficiente para comparar esta OS.'}
                    </p>
                  </div>
                  <div className="text-xs text-roman-text-sub md:max-w-[48%]">
                    <div className="mb-1">Termos base:</div>
                    {budgetHistory.basisTerms.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {budgetHistory.basisTerms.map(term => (
                          <span
                            key={`inbox-basis-term-${activeTicket.id}-${term}`}
                            className="rounded-sm border border-roman-border bg-roman-surface px-2 py-0.5 text-[11px] text-roman-text-main"
                          >
                            {term}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div>não definidos</div>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
                    <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Media</div>
                    <div className="mt-1 text-lg font-serif text-roman-text-main">{formatBudgetHistoryValue(budgetHistory.averageQuoteValue)}</div>
                  </div>
                  <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
                    <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Faixa</div>
                    <div className="mt-1 text-sm font-medium text-roman-text-main">
                      {formatBudgetHistoryValue(budgetHistory.minQuoteValue)} a {formatBudgetHistoryValue(budgetHistory.maxQuoteValue)}
                    </div>
                  </div>
                  <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
                    <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Último comparável</div>
                    <div className="mt-1 text-sm font-medium text-roman-text-main">{budgetHistory.latestComparableValueLabel ?? '-'}</div>
                    <div className="text-[11px] text-roman-text-sub">{budgetHistory.latestComparableVendor ?? 'Sem fornecedor'}</div>
                  </div>
                  <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
                    <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Referencias</div>
                    <div className="mt-1 text-lg font-serif text-roman-text-main">{budgetHistory.comparableQuoteCount}</div>
                    <div className="text-[11px] text-roman-text-sub">cotações aproveitáveis</div>
                  </div>
                </div>

                {(persistedServicePreference || budgetHistory.preferredVendor) && (
                  <div className="mt-4 rounded-sm border border-emerald-200 bg-emerald-50/70 p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-emerald-700">
                          {persistedServicePreference ? 'Fornecedor preferencial persistido' : 'Fornecedor preferencial sugerido'}
                        </div>
                        <div className="mt-1 text-sm font-medium text-emerald-950">
                          {(persistedServicePreference || budgetHistory.preferredVendor)?.vendor}
                        </div>
                        <div className="text-[11px] text-emerald-800">
                          {persistedServicePreference
                            ? `${persistedServicePreference.approvalCount} aprovação(ões) registradas para ${persistedServicePreference.scopeName}`
                            : budgetHistory.preferredVendor?.rationale.join(' · ')}
                        </div>
                      </div>
                      <div className="text-[11px] text-emerald-900 md:text-right">
                        <div>
                          Média:{' '}
                          {persistedServicePreference
                            ? formatBudgetHistoryValue(persistedServicePreference.averageApprovedValue ?? null)
                            : budgetHistory.preferredVendor?.averageComparableValueLabel ?? '-'}
                        </div>
                        <div>
                          Último comparável:{' '}
                          {persistedServicePreference
                            ? formatBudgetHistoryValue(persistedServicePreference.lastApprovedValue ?? null)
                            : budgetHistory.preferredVendor?.latestComparableValueLabel ?? '-'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {budgetHistory.similarCases.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {budgetHistory.similarCases.slice(0, 3).map(item => (
                      <div key={item.ticketId} className="flex flex-col gap-1 rounded-sm border border-roman-border/70 bg-roman-surface px-3 py-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-sm font-medium text-roman-text-main">{item.ticketId} · {item.subject}</div>
                          <div className="text-[11px] text-roman-text-sub">
                            {item.vendor} · {item.sede} / {item.region} · {formatDateTimeSafe(item.date)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-serif text-roman-text-main">{item.valueLabel}</div>
                          <div className="text-[11px] text-roman-text-sub">
                            Match: {item.sharedTerms.length > 0 ? item.sharedTerms.join(', ') : 'tipo/regiao'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {budgetHistory.itemReferences.length > 0 && (
                  <div className="mt-4 rounded-sm border border-roman-border bg-roman-surface p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h5 className="text-[10px] uppercase tracking-widest text-roman-text-sub">Referência por item/material</h5>
                        <p className="mt-1 text-[11px] text-roman-text-sub">Faixas unitárias observadas nas OS comparáveis.</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                      {budgetHistory.itemReferences.slice(0, 4).map(item => (
                        <div key={item.key} className="rounded-sm border border-roman-border/70 bg-roman-bg px-3 py-2">
                          <div className="text-sm font-medium text-roman-text-main">{item.label}</div>
                          <div className="text-[11px] text-roman-text-sub">
                            {item.sampleCount} referência(s) {item.unit ? `· ${item.unit}` : ''}
                          </div>
                          <div className="mt-1 text-[11px] text-roman-text-main">
                            Média unitária: {item.averageUnitPriceLabel ?? '-'}
                          </div>
                          <div className="text-[11px] text-roman-text-sub">
                            Faixa: {item.minUnitPriceLabel ?? '-'} a {item.maxUnitPriceLabel ?? '-'}
                          </div>
                          <div className="text-[11px] text-roman-text-sub">
                            Último fornecedor: {item.latestVendor ?? '-'} · {item.latestUnitPriceLabel ?? '-'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
                {quotes.map((quote, index) => (
                  <div key={`quote-total-${index}`} className="rounded-2xl border border-roman-border bg-roman-bg px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-roman-text-sub">Cotação {index + 1}</div>
                    <div className="mt-1 text-sm font-medium text-roman-text-main break-words">
                      {quote.vendor || 'Fornecedor não informado'}
                    </div>
                    <div className="mt-2 text-[11px] text-roman-text-sub">Total geral da proposta</div>
                    <div className="mt-1 text-lg font-serif text-roman-text-main">
                      {quoteGrandTotals[index] > 0 ? formatCurrencyInput(quoteGrandTotals[index]) : quote.value || '-'}
                    </div>
                    <div className="mt-2 space-y-1 text-[11px] text-roman-text-sub">
                      <div>Material: {quote.materialValue || '-'}</div>
                      <div>Mão de obra: {quote.laborValue || '-'}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-6 rounded-sm border border-roman-border bg-roman-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-serif text-roman-text-main">Comparativo consolidado</h4>
                    <p className="text-xs text-roman-text-sub">Use esta grade para conferir quantidade, custo unitário e total cobrado por fornecedor.</p>
                  </div>
                </div>

                {quoteComparisonSections.length === 0 ? (
                  <div className="mt-3 rounded-sm border border-dashed border-roman-border bg-roman-bg px-3 py-4 text-sm text-roman-text-sub">
                    Adicione itens nas cotações para montar o comparativo lado a lado.
                  </div>
                ) : (
                  <div className="mt-4 space-y-4 overflow-x-auto">
                    {quoteComparisonSections.map(section => (
                      <div key={section.key} className="min-w-[980px] rounded-2xl border border-roman-border bg-roman-bg overflow-hidden">
                        <div className="border-b border-roman-border px-4 py-2">
                          <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">{section.label}</div>
                        </div>
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-roman-border bg-roman-surface text-left">
                              <th className="px-3 py-2 font-medium text-roman-text-main">Descrição</th>
                              <th className="px-3 py-2 font-medium text-roman-text-main">Qtd.</th>
                              <th className="px-3 py-2 font-medium text-roman-text-main">Und.</th>
                              {quotes.map((quote, index) => (
                                <th key={`${section.key}-quote-${index}`} colSpan={2} className="border-l border-roman-border px-3 py-2">
                                  <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Cotação {index + 1}</div>
                                  <div className="mt-1 text-sm font-medium text-roman-text-main">{quote.vendor || 'Fornecedor não informado'}</div>
                                </th>
                              ))}
                            </tr>
                            <tr className="border-b border-roman-border bg-roman-surface text-[11px] text-roman-text-sub">
                              <th />
                              <th />
                              <th />
                              {quotes.map((_, index) => (
                                <React.Fragment key={`${section.key}-labels-${index}`}>
                                  <th className="border-l border-roman-border px-3 py-2 font-medium">Custo unit.</th>
                                  <th className="px-3 py-2 font-medium">Valor cobrado</th>
                                </React.Fragment>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {section.rows.map(row => (
                              <tr key={row.key} className="border-b border-roman-border/70 align-top">
                                <td className="px-3 py-2 text-roman-text-main">{row.description}</td>
                                <td className="px-3 py-2 text-roman-text-sub">{row.quantity || '-'}</td>
                                <td className="px-3 py-2 text-roman-text-sub">{row.unit || '-'}</td>
                                {row.values.map((value, index) => (
                                  <React.Fragment key={`${row.key}-${index}`}>
                                    {!value.costUnitPrice && !value.chargedTotalPrice ? (
                                      <td colSpan={2} className="border-l border-roman-border px-3 py-2">
                                        <div className="rounded-lg border border-dashed border-roman-border/80 bg-roman-surface px-3 py-2 text-center text-[11px] text-roman-text-sub">
                                          Não cotado nesta proposta
                                        </div>
                                      </td>
                                    ) : (
                                      <>
                                        <td className="border-l border-roman-border px-3 py-2 text-roman-text-sub">{value.costUnitPrice || '-'}</td>
                                        <td className="px-3 py-2 text-roman-text-main">{value.chargedTotalPrice || '-'}</td>
                                      </>
                                    )}
                                  </React.Fragment>
                                ))}
                              </tr>
                            ))}
                            <tr className="bg-roman-surface">
                              <td colSpan={3} className="px-3 py-2 font-medium text-roman-text-main">Subtotal da seção</td>
                              {quotes.map((quote, index) => {
                                const subtotal = quote.items
                                  .filter(item => normalizeQuoteSection(item.section) === section.key)
                                  .reduce((sum, item) => sum + parseCurrencyInput(item.totalPrice || ''), 0);
                                return (
                                  <React.Fragment key={`${section.key}-subtotal-${index}`}>
                                    <td className="border-l border-roman-border px-3 py-2 text-roman-text-sub">-</td>
                                    <td className="px-3 py-2 font-medium text-roman-text-main">
                                      {subtotal > 0 ? formatCurrencyInput(subtotal) : '-'}
                                    </td>
                                  </React.Fragment>
                                );
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ))}
                    <div className="min-w-[980px] rounded-2xl border border-roman-primary/20 bg-roman-primary/5 overflow-hidden">
                      <table className="w-full border-collapse text-sm">
                        <tbody>
                          <tr>
                            <td colSpan={3} className="px-3 py-3 font-medium text-roman-text-main">Total geral por fornecedor</td>
                            {quotes.map((_, index) => (
                              <React.Fragment key={`grand-total-${index}`}>
                                <td className="border-l border-roman-border px-3 py-3 text-roman-text-sub">-</td>
                                <td className="px-3 py-3 font-semibold text-roman-text-main">
                                  {quoteGrandTotals[index] > 0 ? formatCurrencyInput(quoteGrandTotals[index]) : '-'}
                                </td>
                              </React.Fragment>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-3 flex justify-end">
                {quotes.length < getRoundMaxQuoteSlots(quoteRoundType) && (
                  <button
                    type="button"
                    onClick={handleAddQuoteSlot}
                    className="inline-flex items-center gap-2 rounded-sm border border-roman-border bg-roman-surface px-3 py-1.5 text-xs font-medium text-roman-text-main hover:bg-roman-bg"
                  >
                    <Plus size={12} />
                    Adicionar cotação
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6 items-start">
                {quotes.map((quote, i) => (
                  <div key={i} className="border border-roman-border rounded-sm p-4 bg-roman-bg flex flex-col self-start min-h-0">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-roman-border/50">
                      <span className="text-sm font-medium text-roman-text-main">Cotação {i + 1}</span>
                      <div className="flex items-center gap-3">
                        {quotes.length > getRoundMinQuoteSlots(quoteRoundType) && (
                          <button
                            type="button"
                            onClick={() => handleRemoveQuoteSlot(i)}
                            className="text-xs text-red-700 hover:underline"
                          >
                            Remover
                          </button>
                        )}
                        <label className="text-xs text-roman-primary hover:underline flex items-center gap-1 cursor-pointer">
                          <Paperclip size={12} /> {quoteAttachments[i] ? 'Trocar PDF' : 'Anexar PDF'}
                          <input
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={(e) => handleQuoteAttachmentChange(i, e.target.files?.[0] ?? null)}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="space-y-3 flex-1">
                      <div>
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Fornecedor</label>
                        <input
                          type="text"
                          placeholder="Nome da Empresa"
                          value={quote.vendor}
                          onChange={e => handleQuoteChange(i, 'vendor', e.target.value)}
                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                        />
                        {(persistedServicePreference || budgetHistory.preferredVendor) && quote.vendor.trim() && (
                          <div className={`mt-1 text-[11px] ${quote.vendor.trim().toLowerCase() === String((persistedServicePreference || budgetHistory.preferredVendor)?.vendor || '').trim().toLowerCase() ? 'text-emerald-700' : 'text-roman-text-sub'}`}>
                            {quote.vendor.trim().toLowerCase() === String((persistedServicePreference || budgetHistory.preferredVendor)?.vendor || '').trim().toLowerCase()
                              ? persistedServicePreference
                                ? 'Coincide com o fornecedor persistido para este serviço.'
                                : 'Coincide com o fornecedor preferencial da base histórica.'
                              : `Preferência atual: ${(persistedServicePreference || budgetHistory.preferredVendor)?.vendor}`}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Valor Total</label>
                        <input
                          type="text"
                          placeholder="R$ 0,00"
                          value={quote.value}
                          onChange={e => handleQuoteChange(i, 'value', e.target.value)}
                          onBlur={() => handleQuoteCurrencyBlur(i, 'value')}
                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        <div className="rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-xs text-roman-text-sub">
                          <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Material</div>
                          <div className="mt-1 text-sm font-medium text-roman-text-main">{quote.materialValue || '-'}</div>
                        </div>
                        <div className="rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-xs text-roman-text-sub">
                          <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Mão de obra</div>
                          <div className="mt-1 text-sm font-medium text-roman-text-main">{quote.laborValue || '-'}</div>
                        </div>
                        <div className="rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-xs text-roman-text-sub">
                          <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Total da obra (rodada)</div>
                          <div className="mt-1 text-sm font-semibold text-roman-text-main">{quote.totalValue || quote.value || '-'}</div>
                        </div>
                      </div>
                      <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Itens do orçamento</label>
                          <button
                            type="button"
                            onClick={() => handleAddQuoteItem(i)}
                            className="text-[11px] font-medium text-roman-primary hover:underline"
                          >
                            + Adicionar item
                          </button>
                        </div>

                        {suggestedQuoteMaterials.length > 0 && (
                          <div className="mb-3 flex flex-wrap gap-2">
                            {suggestedQuoteMaterials.slice(0, 4).map(material => (
                              <button
                                key={`${i}-${material.id}`}
                                type="button"
                                onClick={() => {
                                  const targetItem = quote.items[quote.items.length - 1];
                                  if (!targetItem) return;
                                  handleQuoteItemChange(i, targetItem.id, 'materialName', material.name);
                                  if (material.unit) {
                                    handleQuoteItemChange(i, targetItem.id, 'unit', material.unit);
                                  }
                                }}
                                className="rounded-sm border border-roman-primary/20 bg-roman-primary/5 px-2 py-1 text-[11px] text-roman-primary"
                              >
                                {material.name}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
                          {quote.items.map((item, itemIndex) => (
                            <div key={item.id} className="rounded-sm border border-roman-border bg-roman-bg p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <div className="text-[11px] font-medium text-roman-text-main">Item {itemIndex + 1}</div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveQuoteItem(i, item.id)}
                                  className="text-[11px] text-red-700 hover:underline"
                                >
                                  Remover
                                </button>
                              </div>
                              <div className="space-y-2">
                                <select
                                  value={normalizeQuoteSection(item.section)}
                                  onChange={event => handleQuoteItemChange(i, item.id, 'section', event.target.value)}
                                  className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                                >
                                  {QUOTE_SECTION_OPTIONS.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  placeholder="Adicionar material"
                                  value={item.materialName || ''}
                                  onChange={event => handleQuoteItemChange(i, item.id, 'materialName', event.target.value)}
                                  className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                                />
                                <input
                                  type="text"
                                  placeholder="Descrição do item"
                                  value={item.description}
                                  onChange={event => handleQuoteItemChange(i, item.id, 'description', event.target.value)}
                                  className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                                />
                                {(() => {
                                  const itemKey = String(item.materialId || item.materialName || item.description || '')
                                    .normalize('NFD')
                                    .replace(/[\u0300-\u036f]/g, '')
                                    .toLowerCase()
                                    .trim();
                                  const reference = budgetHistory.itemReferences.find(entry => entry.key === itemKey);
                                  if (!reference) return null;
                                  return (
                                    <div className="rounded-sm border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-900">
                                      Histórico unitário: média {reference.averageUnitPriceLabel ?? '-'} · faixa {reference.minUnitPriceLabel ?? '-'} a {reference.maxUnitPriceLabel ?? '-'}
                                    </div>
                                  );
                                })()}
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="Qtd."
                                    value={item.quantity ?? ''}
                                    onChange={event => handleQuoteItemChange(i, item.id, 'quantity', event.target.value ? Number(event.target.value) : null)}
                                    className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                                  />
                                  {(() => {
                                    const itemUnitKey = buildQuoteItemUnitKey(i, item.id);
                                    const hasCustomUnitInput = Object.prototype.hasOwnProperty.call(pendingCustomUnitByItem, itemUnitKey);
                                    const selectedUnitValue = hasCustomUnitInput
                                      ? CUSTOM_QUOTE_UNIT_VALUE
                                      : normalizeUnitAbbreviation(item.unit) || '';

                                    return (
                                      <div className="space-y-2">
                                        <select
                                          value={selectedUnitValue}
                                          onChange={event => handleQuoteItemUnitSelect(i, item.id, event.target.value)}
                                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                                        >
                                          <option value="">Unidade</option>
                                          {quoteUnitOptions.map(unit => (
                                            <option key={`unit-${unit}`} value={unit}>{unit}</option>
                                          ))}
                                          <option value={CUSTOM_QUOTE_UNIT_VALUE}>+ Outra...</option>
                                        </select>
                                        {hasCustomUnitInput && (
                                          <div className="grid grid-cols-[1fr_auto] gap-2">
                                            <input
                                              type="text"
                                              placeholder="Sigla (ex.: M2)"
                                              value={pendingCustomUnitByItem[itemUnitKey] || ''}
                                              onChange={event => setPendingCustomUnitByItem(current => ({ ...current, [itemUnitKey]: event.target.value }))}
                                              className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleQuoteItemCustomUnitSave(i, item.id)}
                                              className="px-3 py-2 text-xs font-medium rounded-sm border border-roman-primary/30 bg-roman-primary/10 text-roman-primary hover:bg-roman-primary/20"
                                            >
                                              Salvar
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="Custo unitário (interno)"
                                    value={item.costUnitPrice || ''}
                                    onChange={event => handleQuoteItemChange(i, item.id, 'costUnitPrice', event.target.value)}
                                    onBlur={() => handleQuoteItemCurrencyBlur(i, item.id, 'costUnitPrice')}
                                    className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                                  />
                                </div>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="Valor cobrado (automático)"
                                  value={item.totalPrice || ''}
                                  readOnly
                                  className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-bg text-roman-text-main/80 cursor-not-allowed"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {quoteAttachments[i] && (
                        <div className="text-[11px] text-roman-text-sub truncate">
                          PDF: {quoteAttachments[i]!.name}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

        </ModalShell>
      )}

      {showContractDispatchModal && (
        <ModalShell
          isOpen={showContractDispatchModal}
          onClose={() => {
            if (isSending) return;
            setShowContractDispatchModal(false);
          }}
          title="Anexar Contrato para Diretoria"
          description="Após o aceite do orçamento, anexe o contrato para a Diretoria aprovar."
          maxWidthClass="max-w-lg"
          footer={(
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowContractDispatchModal(false)}
                disabled={isSending}
                className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleSendContractToDirector()}
                disabled={isSending || !contractDispatchFile}
                className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSending ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                {isSending ? 'Enviando...' : 'Enviar para Aprovação'}
              </button>
            </div>
          )}
        >
          <div className="space-y-4">
            <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub">
              <div className="font-medium text-roman-text-main mb-1">Resumo do contrato</div>
              <div>Fornecedor: {activeContract?.vendor || 'Não informado'}</div>
              <div>Valor: {activeContract?.value || 'Não informado'}</div>
            </div>

            <div className="border-2 border-dashed border-roman-border rounded-sm p-6 text-center bg-roman-bg relative hover:bg-roman-border-light transition-colors cursor-pointer">
              <input
                type="file"
                accept=".pdf"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={event => {
                  if (event.target.files && event.target.files.length > 0) {
                    setContractDispatchFile(event.target.files[0]);
                  }
                }}
              />
              <FileText size={28} className="mx-auto text-roman-primary mb-2" />
              {contractDispatchFile ? (
                <div className="text-sm font-medium text-roman-text-main">{contractDispatchFile.name}</div>
              ) : (
                <>
                  <div className="text-sm font-medium text-roman-text-main mb-1">Selecione o contrato em PDF</div>
                  <div className="text-xs text-roman-text-sub">Esse arquivo será registrado antes da aprovação da Diretoria</div>
                </>
              )}
            </div>
          </div>

        </ModalShell>
      )}

      {/* Ações Preliminares Modal */}
      {showPrelimModal && (
        <ModalShell
          isOpen={showPrelimModal}
          onClose={() => setShowPrelimModal(false)}
          title="Ações Preliminares"
          description="Registre compras, cronograma, liberações e impedimentos antes de iniciar a execução."
          maxWidthClass="max-w-2xl"
          footer={(
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowPrelimModal(false)} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm">
                Cancelar
              </button>
              <button
                onClick={() => handleSavePreliminaryActions(false)}
                className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm"
              >
                Salvar checklist
              </button>
              <button
                disabled={!arePreliminaryActionsReady(prelimForm) || !prelimForm.plannedStartAt}
                onClick={() => handleSavePreliminaryActions(true)}
                className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Concluir e Iniciar Execução
              </button>
            </div>
          )}
        >
              <div>
                <p className="mt-2 text-xs text-roman-text-sub">
                  Checklist concluído: {PRELIMINARY_ITEMS.filter(item => prelimForm[item.id]).length}/{PRELIMINARY_ITEMS.length}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PRELIMINARY_ITEMS.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handlePrelimFieldToggle(item.id)}
                    className={`w-full flex items-center gap-3 p-3 border rounded-sm text-left transition-colors ${
                      prelimForm[item.id]
                        ? 'border-roman-primary bg-roman-primary/5 text-roman-primary'
                        : 'border-roman-border text-roman-text-main hover:border-roman-primary/50'
                    }`}
                  >
                    <div className={`w-4 h-4 border rounded-sm flex items-center justify-center flex-shrink-0 ${prelimForm[item.id] ? 'bg-roman-primary border-roman-primary' : 'border-roman-border'}`}>
                      {prelimForm[item.id] && <CheckSquare size={10} className="text-white" />}
                    </div>
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Previsão de chegada do material</label>
                  <input
                    type="date"
                    value={prelimForm.materialEta}
                    onChange={e => handlePrelimFieldChange('materialEta', e.target.value)}
                    className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Data prevista para início</label>
                  <input
                    type="date"
                    value={prelimForm.plannedStartAt}
                    onChange={e => handlePrelimFieldChange('plannedStartAt', e.target.value)}
                    className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Impedimentos / observações</label>
                <textarea
                  value={prelimForm.blockerNotes}
                  onChange={e => handlePrelimFieldChange('blockerNotes', e.target.value)}
                  placeholder="Ex: aguardando liberação da unidade, janela sem aula, entrega do fornecedor."
                  className="w-full min-h-24 border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary resize-y"
                />
              </div>

              <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub space-y-1">
                <div className="font-medium text-roman-text-main">Resumo operacional</div>
                <div>{buildPreliminarySummary(buildPreliminaryActionsPayload(false))}</div>
                {prelimForm.blockerNotes.trim() && <div>Impedimentos: {prelimForm.blockerNotes.trim()}</div>}
              </div>

        </ModalShell>
      )}

      {showExecutionSetupModal && (
        <ModalShell
          isOpen={showExecutionSetupModal}
          onClose={() => setShowExecutionSetupModal(false)}
          title="Iniciar Execução da Obra"
          description="Defina o fluxo financeiro que vai liberar os marcos de pagamento durante a execução."
          maxWidthClass="max-w-xl"
          footer={(
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowExecutionSetupModal(false)} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm">
                Cancelar
              </button>
              <button
                disabled={isSending}
                onClick={() => void handleConfirmExecutionStart()}
                className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Iniciar execução
              </button>
            </div>
          )}
        >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Fluxo de pagamento</label>
                  <select
                    value={executionSetupForm.paymentFlowParts}
                    onChange={e => setExecutionSetupForm(prev => ({ ...prev, paymentFlowParts: e.target.value }))}
                    className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                  >
                    {[1, 2, 3, 4, 5].map(parts => (
                      <option key={parts} value={parts}>{parts === 1 ? 'À vista' : `${parts}x conforme andamento`}</option>
                    ))}
                  </select>
                </div>
                <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub">
                  <div className="font-medium text-roman-text-main mb-1">Resumo do contrato</div>
                  <div>Fornecedor: {activeContract?.vendor || activeTicket.assignedTeam || 'Não definido'}</div>
                  <div>Valor: {activeContract?.value || 'Não informado'}</div>
                  <div>Andamento inicial: {activeProgressPercent}%</div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Link da planilha de medição (opcional)</label>
                <input
                  type="url"
                  value={executionSetupForm.measurementSheetUrl}
                  onChange={e => setExecutionSetupForm(prev => ({ ...prev, measurementSheetUrl: e.target.value }))}
                  placeholder="https://docs.google.com/spreadsheets/..."
                  className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                />
              </div>

              <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub space-y-1">
                <div className="font-medium text-roman-text-main">Regra do fluxo</div>
                <div>Cada atualização de andamento com valor bruto cria um novo lançamento no financeiro.</div>
                <div>Os marcos (1x a 5x) ficam como referência de progresso da execução.</div>
              </div>

              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Observações de início</label>
                <textarea
                  value={executionSetupForm.notes}
                  onChange={e => setExecutionSetupForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ex: equipe mobilizada, cronograma validado e material entregue na unidade."
                  className="w-full min-h-24 border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary resize-y"
                />
              </div>

        </ModalShell>
      )}

      {showProgressModal && (
        <ModalShell
          isOpen={showProgressModal}
          onClose={() => setShowProgressModal(false)}
          title="Atualizar Andamento da Obra"
          description="Informe o valor bruto do lançamento/etapa e o sistema somará ao acumulado para calcular o percentual executado."
          maxWidthClass="max-w-xl"
          footer={(
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowProgressModal(false)} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm">
                Cancelar
              </button>
              <button
                disabled={isSending}
                onClick={() => void handleSaveProgressUpdate()}
                className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Salvar andamento
              </button>
            </div>
          )}
        >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Valor bruto deste lançamento/etapa</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={progressUpdateForm.grossAmount}
                    onChange={event => setProgressUpdateForm(prev => ({ ...prev, grossAmount: sanitizeCurrencyTypingInput(event.target.value) }))}
                    onBlur={() => setProgressUpdateForm(prev => ({ ...prev, grossAmount: normalizeCurrencyInput(prev.grossAmount) }))}
                    placeholder="Ex: 12500,00"
                    className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                  />
                </div>
                <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub">
                  <div className="font-medium text-roman-text-main">Percentual calculado</div>
                  <div className="mt-1 text-base font-semibold text-roman-text-main">{draftProgressPercent}%</div>
                  <div className="mt-1">Andamento atual salvo: {activeProgressPercent}%</div>
                  <div className="mt-1">Bruto acumulado projetado: {formatCurrencyInput(projectedAccumulatedGross)}</div>
                </div>
              </div>

              {activeMilestones.length > 0 && activeExpectedBaselineValue > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Atalhos por marco</div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {activeMilestones.map(milestone => {
                      const milestoneGross = (activeExpectedBaselineValue * milestone) / 100;
                      const projectedGross = Math.max(0, milestoneGross - currentAccumulatedGross);
                      const isCompleted = milestone <= activeProgressPercent;
                      return (
                        <button
                          key={milestone}
                          type="button"
                          onClick={() =>
                            setProgressUpdateForm(prev => ({
                              ...prev,
                              grossAmount: formatCurrencyInput(projectedGross),
                            }))
                          }
                          className={[
                            'rounded-sm border px-3 py-3 text-left transition-colors',
                            isCompleted
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : 'border-roman-border bg-roman-bg text-roman-text-main hover:border-roman-primary/40',
                          ].join(' ')}
                        >
                          <div className="text-[10px] font-serif uppercase tracking-widest opacity-75">Marco</div>
                          <div className="mt-1 text-base font-semibold">{milestone}%</div>
                          <div className="mt-1 text-[10px]">{formatCurrencyInput(projectedGross)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub">
                <div className="font-medium text-roman-text-main">Valor de referência</div>
                <div>Previsto inicial: {activeExpectedBaselineValue > 0 ? formatCurrencyInput(activeExpectedBaselineValue) : 'Não definido'}</div>
                <div>Bruto acumulado atual: {formatCurrencyInput(currentAccumulatedGross)}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-roman-text-sub">
                <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3">
                  <div className="font-medium text-roman-text-main">Fluxo</div>
                  <div>{activeTicket.executionProgress?.paymentFlowParts ? `${activeTicket.executionProgress.paymentFlowParts}x` : 'Não definido'}</div>
                </div>
                <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3">
                  <div className="font-medium text-roman-text-main">Liberado até agora</div>
                  <div>{activeReleasedPercent}%</div>
                </div>
                <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3">
                  <div className="font-medium text-roman-text-main">Próximo marco</div>
                  <div>{activeNextMilestonePercent != null ? `${activeNextMilestonePercent}%` : 'Todos liberados'}</div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Observações</label>
                <textarea
                  value={progressUpdateForm.notes}
                  onChange={e => setProgressUpdateForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ex: 40% concluído, com estrutura metálica finalizada e aguardando acabamento."
                  className="w-full min-h-24 border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary resize-y"
                />
              </div>

        </ModalShell>
      )}
    </div>
  );
}






