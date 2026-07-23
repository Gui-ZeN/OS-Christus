import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { CheckCircle, Loader2, FileText, Shield, List, Play, CheckSquare, Paperclip, Clock, User, Image as ImageIcon, ChevronDown, ChevronLeft, ChevronRight, Calendar, Plus, MoreHorizontal, Lock, Bold, Italic, ExternalLink, Copy, X, DollarSign, RefreshCw, Trash2, ChevronUp, Maximize2, Minimize2 } from 'lucide-react';
import { TicketListItem } from '../components/ui/TicketListItem';
import { PropertyField } from '../components/ui/PropertyField';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ModalShell } from '../components/ui/ModalShell';
import { FloatingToast } from '../components/ui/FloatingToast';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useApp } from '../context/AppContext';
import { useAttachmentPreview } from '../context/AttachmentPreviewContext';
import { useClickOutside } from '../hooks/useClickOutside';
import { useToast } from '../hooks/useToast';
import { ContractRecord, InboxFilter, HistoryItem, MeasurementRecord, PaymentRecord, PreliminaryActions, Quote, QuoteItem, Ticket, TicketAttachment } from '../types';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { canTransitionStatus, getAllowedNextStatuses, type AppActorRole } from '../constants/statusFlow';
import { notifyTicketDirectorReply, notifyTicketPublicReply } from '../services/ticketEmail';
import { CatalogMacroService, CatalogMaterial, CatalogRegion, CatalogServiceItem, CatalogSite, CatalogVendorPreference, fetchCatalog, saveCatalogEntry } from '../services/catalogApi';
import { DirectoryTeam, DirectoryUser, DirectoryVendor, fetchDirectory, upsertVendor } from '../services/directoryApi';
import { fetchProcurementData, saveContract, saveMeasurement, savePayment, saveQuotes } from '../services/procurementApi';
import { fetchSettings, saveSettings } from '../services/settingsApi';
import { uploadContractAttachment, uploadMeasurementAttachment, uploadMessageAttachment, uploadQuoteAttachment } from '../services/ticketStorage';
import { deleteTicketInApi } from '../services/ticketsApi';
import { getAuthenticatedActorHeaders } from '../services/actorHeaders';
import { buildBudgetHistorySummary, formatBudgetHistoryValue } from '../utils/budgetHistory';
import { buildValidationClosureChecklist } from '../utils/closureChecklist';
import { getApprovedReleasePercent, getNextMilestonePercentByProgress, getPaymentFlowMilestones } from '../utils/executionFlow';
import { buildProcurementClassification } from '../utils/procurementClassification';
import { formatDateTimeSafe } from '../utils/date';
import { getTicketRegionLabel, getTicketSiteLabel } from '../utils/ticketTerritory';
import { cleanForwardedMessageText } from '../utils/text';
import { getAvailableAdditiveRounds, getAvailableInitialRounds, getEditableInitialRoundIndex, getQuotesByRound, isRejectedQuoteRound, normalizeQuoteStatus } from './inbox/quoteRounds';
import { calculateProgressPercentFromGross, getBudgetSourceLabel, isLegacyFlowPlaceholderPayment, resolveExpectedBaselineValue, roundProgressPercent, stripLegacyFlowPlaceholders } from './inbox/paymentProgress';
import { DateTimePicker, buildInputDateTime, formatDateTimeDisplay, formatInputDate, formatInputDateTime, formatShortDate, parseInputDateTime } from './inbox/DateTimePicker';
import { getExecutionNextActionLabel, getStageGuidance } from './inbox/stageGuidance';
import { ThirdPartyModal } from './inbox/ThirdPartyModal';
import { ContractDispatchModal } from './inbox/ContractDispatchModal';
import { PreliminaryActionsModal } from './inbox/PreliminaryActionsModal';
import { ExecutionSetupModal } from './inbox/ExecutionSetupModal';
import { ProgressUpdateModal } from './inbox/ProgressUpdateModal';
import { DirectorInterestsPanel } from './inbox/DirectorInterestsPanel';
import { MessageBody } from './inbox/MessageBody';
import { TicketHistory } from './inbox/TicketHistory';
import { AdditiveReferenceCard } from './inbox/AdditiveReferenceCard';
import { QuoteHistoryMetrics } from './inbox/QuoteHistoryMetrics';
import { QuoteHistoryPanel } from './inbox/QuoteHistoryPanel';
import { QuoteComparisonPanel } from './inbox/QuoteComparisonPanel';
import { useQuoteEditor } from './inbox/useQuoteEditor';
import { QuoteEditorProvider } from './inbox/QuoteEditorContext';
import { ProposalHeaderForm } from './inbox/ProposalHeaderForm';
import { QuoteEditorTabs } from './inbox/QuoteEditorTabs';
import { CUSTOM_QUOTE_UNIT_VALUE, INITIAL_MIN_QUOTE_SLOTS, QUOTE_SECTION_OPTIONS, buildQuoteItemUnitKey, createEmptyQuoteDraft, createEmptyQuoteItem, createProposalHeaderDraft, normalizeQuoteSection, normalizeUnitAbbreviation, summarizeQuoteDraft } from './inbox/quotes';
import { QuoteItemRow } from './inbox/QuoteItemRow';
import { QuoteEditorCardHeader } from './inbox/QuoteEditorCardHeader';
import { QuoteVendorFields } from './inbox/QuoteVendorFields';
import { QuoteConsolidatedView } from './inbox/QuoteConsolidatedView';
import { QuoteItemsSection } from './inbox/QuoteItemsSection';
import type { ProposalHeaderDraft, QuoteDraft } from './inbox/types';
import { PRELIMINARY_ITEMS, type PreliminaryChecklistKey, type PreliminaryFormState } from './inbox/preliminary';
import {
  formatCurrency as formatCurrencyInput,
  normalizeCurrencyInput,
  parseCurrency as parseCurrencyInput,
  sanitizeCurrencyTypingInput,
} from '../utils/currency';


const INITIAL_MAX_QUOTE_SLOTS = 5;
const ADDITIVE_FIXED_QUOTE_SLOTS = 1;
const NOTEBOOK_CONTEXT_PANEL_BREAKPOINT = 1500;

// Transições "voltadas pra fora" — as que o solicitante realmente acompanha.
// Só ao mudar o status manualmente para uma destas o modal pergunta se avisa por
// e-mail; os passos internos de back-office não perguntam nem enviam.
const CUSTOMER_FACING_STATUSES = new Set<string>([
  TICKET_STATUS.IN_PROGRESS,
  TICKET_STATUS.CLOSED,
  TICKET_STATUS.CANCELED,
]);

const TRIAGE_VISIBLE_STATUSES = [
  TICKET_STATUS.NEW,
  TICKET_STATUS.WAITING_TECH_OPINION,
  TICKET_STATUS.WAITING_SOLUTION_APPROVAL,
  TICKET_STATUS.WAITING_BUDGET,
  TICKET_STATUS.WAITING_BUDGET_APPROVAL,
  TICKET_STATUS.WAITING_CONTRACT_UPLOAD,
  TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
] as const;

function parseEmailTokens(input: string) {
  const valid: string[] = [];
  const invalid: string[] = [];
  String(input || '')
    .split(/[;,\s]+/)
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
    .forEach(value => {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        if (!valid.includes(value)) valid.push(value);
      } else if (!invalid.includes(value)) {
        invalid.push(value);
      }
    });
  return { valid, invalid };
}

function mergeEmails(...groups: Array<string[] | undefined>) {
  return [...new Set(groups.flatMap(group => group || []).map(email => String(email || '').trim().toLowerCase()).filter(Boolean))];
}

function normalizeLocationPart(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function resolveAttachmentPreviewType(contentType?: string | null, fileName?: string | null): 'image' | 'pdf' | 'file' {
  const mime = String(contentType || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (
    mime.startsWith('image/') ||
    /\.(png|jpe?g|webp|bmp|svg)$/.test(name)
  ) {
    return 'image';
  }
  return 'file';
}

function isFinalizedTicketStatus(status?: string | null) {
  return status === TICKET_STATUS.CLOSED || status === TICKET_STATUS.CANCELED;
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
  if (role === 'Admin' || role === 'Gestor' || role === 'Diretor') return role;
  return 'Usuario';
}

interface ExecutionSetupFormState {
  paymentFlowParts: string;
  measurementSheetUrl: string;
  notes: string;
}

interface ProgressUpdateFormState {
  grossAmount: string;
  budgetSource: 'initial' | 'additive';
  notes: string;
}

interface TicketDetailsFormState {
  subject: string;
  requester: string;
  requesterEmail: string;
  time: string;
  sector: string;
  location: string;
  macroServiceId: string;
  serviceCatalogId: string;
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
    budgetSource: 'initial',
    notes: '',
  };
}

function createTicketDetailsFormState(ticket?: Ticket): TicketDetailsFormState {
  return {
    subject: ticket?.subject || '',
    requester: ticket?.requester || '',
    requesterEmail: ticket?.requesterEmail || '',
    time: formatInputDateTime(ticket?.time),
    sector: ticket?.sector || '',
    location: ticket?.location || '',
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

// Orientação por etapa: o que o gestor deve fazer agora (ou aguardar).
// `waiting` = a bola está com outra pessoa (diretoria/solicitante/encerrada).
function normalizeTagValue(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function resolveQuoteDraftSubmittedTotal(draft: QuoteDraft) {
  const summarized = summarizeQuoteDraft(draft);
  return draft.totalValue || summarized.totalValue || draft.value || '';
}

function isQuoteDraftFilledForSubmission(draft: QuoteDraft) {
  const vendor = String(draft.vendor || '').trim();
  if (!vendor) return false;
  const total = parseCurrencyInput(resolveQuoteDraftSubmittedTotal(draft));
  return total > 0;
}

function getRoundMinQuoteSlots(roundType: 'initial' | 'additive') {
  return roundType === 'additive' ? ADDITIVE_FIXED_QUOTE_SLOTS : INITIAL_MIN_QUOTE_SLOTS;
}

function getRoundMaxQuoteSlots(roundType: 'initial' | 'additive') {
  return roundType === 'additive' ? ADDITIVE_FIXED_QUOTE_SLOTS : INITIAL_MAX_QUOTE_SLOTS;
}

export function InboxView() {
  const { openAttachment } = useAttachmentPreview();
  const {
    currentView,
    navigateTo,
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
  const [sendStatusEmailUpdate, setSendStatusEmailUpdate] = useState(false);
  // Modal de confirmação de e-mail ao mudar o status manualmente para uma
  // transição voltada pra fora (o solicitante se importa). `resolve` devolve a
  // escolha ('notify' | 'silent' | 'cancel') para o await no handleSend.
  const [statusEmailPrompt, setStatusEmailPrompt] = useState<{
    from: string;
    to: string;
    recipients: string[];
    resolve: (decision: 'notify' | 'silent' | 'cancel') => void;
  } | null>(null);
  const [statusTransitionReason, setStatusTransitionReason] = useState('');
  const [publicInterestedEmails, setPublicInterestedEmails] = useState<string[]>([]);
  const [publicInterestedDraft, setPublicInterestedDraft] = useState('');
  const [techTeam, setTechTeam] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [ticketPriority, setTicketPriority] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [showStageControls, setShowStageControls] = useState(false);
  // Minimizar/maximizar o composer — controle do usuário sobre o espaço da conversa.
  const [composerView, setComposerView] = useState<'normal' | 'min' | 'max'>('normal');
  const [waterIssueDraft, setWaterIssueDraft] = useState(false);
  const [sidebarSections, setSidebarSections] = useState({
    // Detalhes read-only começam recolhidos para destacar o formulário de triagem.
    summary: false,
    classification: false,
    execution: true,
  });
  const [ticketDetailsForm, setTicketDetailsForm] = useState<TicketDetailsFormState>(createTicketDetailsFormState());
  const [teams, setTeams] = useState<DirectoryTeam[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [vendors, setVendors] = useState<DirectoryVendor[]>([]);
  const [involvedDirectorIds, setInvolvedDirectorIds] = useState<string[]>([]);
  const [sharedThirdPartyTags, setSharedThirdPartyTags] = useState<string[]>([]);
  const [thirdPartyTag, setThirdPartyTag] = useState('');
  const [selectedThirdPartyIds, setSelectedThirdPartyIds] = useState<string[]>([]);
  const [thirdPartySelectDraftId, setThirdPartySelectDraftId] = useState('');
  const [newThirdPartyName, setNewThirdPartyName] = useState('');
  const [newThirdPartyEmail, setNewThirdPartyEmail] = useState('');
  const [newThirdPartyContact, setNewThirdPartyContact] = useState('');
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
  const [newMacroServiceName, setNewMacroServiceName] = useState('');
  const [newServiceName, setNewServiceName] = useState('');
  const [savingQuickCatalog, setSavingQuickCatalog] = useState(false);
  const displayActor = currentUser?.name || 'Gestor';
  const displayActorLabel = currentUser?.role ? `${displayActor} (${currentUser.role})` : displayActor;
  const canManageStatus = currentUser?.role === 'Admin' || currentUser?.role === 'Gestor';
  const canDeleteTicket = currentUser?.role === 'Admin';
  const canMessageDirector = currentUser?.role === 'Admin' || currentUser?.role === 'Gestor' || currentUser?.role === 'Diretor';

  const replyFileRef = useRef<HTMLInputElement>(null);
  const progressReportFileRef = useRef<HTMLInputElement>(null);
  const replyTextRef = useRef<HTMLTextAreaElement>(null);
  // Textarea NÃO-controlado: o valor vive no DOM (via ref), não no state — digitar
  // não re-renderiza o InboxView inteiro (fim da travada). Lê/escreve pelo ref.
  const getReplyText = () => replyTextRef.current?.value ?? '';
  // Auto-cresce o textarea conforme o conteúdo (compacto quando vazio = mais espaço
  // pra conversa em telas baixas; cresce até o max-h da classe e aí rola).
  const autoGrowReply = () => {
    const el = replyTextRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  const setReplyTextValue = (value: string) => {
    if (replyTextRef.current) replyTextRef.current.value = value;
    autoGrowReply();
  };
  const lastMailSyncAtRef = useRef(0);
  const lastScheduledMailSyncKeyRef = useRef('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  // Fotos inseridas no corpo do texto (já enviadas ao Storage): vão como anexo
  // E como link no corpo da mensagem.
  const [inlineImages, setInlineImages] = useState<TicketAttachment[]>([]);
  const [insertingImage, setInsertingImage] = useState(false);
  const inlineImageRef = useRef<HTMLInputElement>(null);
  // @menção: marca uma pessoa (insere @Nome no texto + adiciona o e-mail ao CC).
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [progressReportFiles, setProgressReportFiles] = useState<File[]>([]);

  useEffect(() => {
    if (currentView !== 'inbox') return undefined;

    const runSilentRefresh = async () => {
      if (document.visibilityState !== 'visible') return;
      // refreshTickets já é feito pelo poll do AppContext (mesmo intervalo de 10s
      // e também ao focar a aba) — aqui só agendamos o gmail-sync, sem duplicar
      // o fetch + a comparação da lista a cada ciclo.
      const canRunMailSync = currentUser?.role === 'Admin' || currentUser?.role === 'Gestor';
      if (!canRunMailSync) return;

      const now = Date.now();
      const current = new Date(now);
      const scheduleHours = new Set([8, 12, 16, 18]);
      if (scheduleHours.has(current.getHours())) {
        const scheduleKey = `${current.getFullYear()}-${current.getMonth() + 1}-${current.getDate()}-${current.getHours()}`;
        if (lastScheduledMailSyncKeyRef.current !== scheduleKey) {
          lastScheduledMailSyncKeyRef.current = scheduleKey;
          lastMailSyncAtRef.current = now;
          try {
            await fetch('/api/mail?route=gmail-sync', {
              method: 'POST',
              headers: await getAuthenticatedActorHeaders(),
            });
          } catch {
            // Sync programado de contingência.
          }
          return;
        }
      }
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
  }, [currentUser?.role, currentView]);

  // Estado derivado: usa tickets do contexto (mutável)
  const hasTickets = tickets.length > 0;
  // Memoizado: era recriado a cada render (digitar no composer etc.), o que
  // reinvalidava memos pesados desnecessariamente.
  const activeTicket = useMemo(
    () => tickets.find(t => t.id === activeTicketId) ?? tickets[0] ?? EMPTY_TICKET,
    [tickets, activeTicketId]
  );
  const recurrentLocationSummary = useMemo(() => {
    if (!activeTicket.id) {
      return {
        relatedTickets: [] as Ticket[],
        openCount: 0,
        finalizedCount: 0,
        latestTicket: null as Ticket | null,
      };
    }

    const activeSiteKey = normalizeLocationPart(activeTicket.siteId || getTicketSiteLabel(activeTicket, catalogSites) || activeTicket.sede);
    const activeSectorKey = normalizeLocationPart(activeTicket.sector);
    if (!activeSiteKey || !activeSectorKey) {
      return {
        relatedTickets: [] as Ticket[],
        openCount: 0,
        finalizedCount: 0,
        latestTicket: null as Ticket | null,
      };
    }

    const relatedTickets = tickets.filter(ticket => {
      if (ticket.id === activeTicket.id) return false;
      const ticketSiteKey = normalizeLocationPart(ticket.siteId || getTicketSiteLabel(ticket, catalogSites) || ticket.sede);
      const ticketSectorKey = normalizeLocationPart(ticket.sector);
      return ticketSiteKey === activeSiteKey && ticketSectorKey === activeSectorKey;
    });
    const latestTicket = [...relatedTickets].sort((a, b) => b.time.getTime() - a.time.getTime())[0] || null;

    return {
      relatedTickets,
      openCount: relatedTickets.filter(ticket => !isFinalizedTicketStatus(ticket.status)).length,
      finalizedCount: relatedTickets.filter(ticket => isFinalizedTicketStatus(ticket.status)).length,
      latestTicket,
    };
  }, [activeTicket, catalogSites, tickets]);
  const recurrentTicketIds = useMemo(() => {
    const groups = new Map<string, string[]>();
    tickets.forEach(ticket => {
      const siteKey = normalizeLocationPart(ticket.siteId || getTicketSiteLabel(ticket, catalogSites) || ticket.sede);
      const sectorKey = normalizeLocationPart(ticket.sector);
      if (!siteKey || !sectorKey) return;
      const key = `${siteKey}::${sectorKey}`;
      groups.set(key, [...(groups.get(key) || []), ticket.id]);
    });
    const ids = new Set<string>();
    groups.forEach(group => {
      if (group.length <= 1) return;
      group.forEach(id => ids.add(id));
    });
    return ids;
  }, [catalogSites, tickets]);
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
    setReplyTextValue('');
    setReplyMode('internal'); // sempre volta para Nota Interna ao trocar de OS
    setTechTeam(activeTicket.assignedTeam || '');
    setCustomEmail(activeTicket.assignedEmail || '');
    setPublicInterestedEmails(mergeEmails(activeTicket.requesterCcEmails || []));
    setInvolvedDirectorIds(Array.isArray(activeTicket.directorIds) ? activeTicket.directorIds : []);
    setPublicInterestedDraft('');
    setTicketPriority(activeTicket.status === TICKET_STATUS.NEW ? '' : activeTicket.priority || '');
    setStatusDraft(activeTicket.status || '');
    setShowStageControls(false);
    setWaterIssueDraft(Boolean(activeTicket.waterIssue));
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
    // Nova OS começa colapsada também: mostra a decisão (Aceitar/Recusar) primeiro,
    // sem a parede de campos. Os campos aparecem ao expandir / ao aceitar.
    setQuickPanelExpanded(false);
    setNewThirdPartyName('');
    setNewThirdPartyEmail('');
    setNewThirdPartyContact('');
    setNewThirdPartyTags([]);
    setReplyFiles([]);
    setInlineImages([]);
    setProgressReportFiles([]);
    setContractDispatchFile(null);
    if (replyFileRef.current) replyFileRef.current.value = '';
    if (progressReportFileRef.current) progressReportFileRef.current.value = '';
  }, [
    activeTicket.id,
  ]);

  // Reconcilia o statusDraft quando o status da OS aberta muda remotamente
  // (poll silencioso / inbound). Só acompanha se o usuário NÃO tiver uma troca
  // de etapa armada (draft ainda igual ao status anterior) — senão preserva.
  const prevActiveStatusRef = useRef(activeTicket.status);
  useEffect(() => {
    const prev = prevActiveStatusRef.current;
    if (activeTicket.status !== prev) {
      setStatusDraft(current => (current === prev ? activeTicket.status || '' : current));
      prevActiveStatusRef.current = activeTicket.status;
    }
  }, [activeTicket.status]);

  useEffect(() => {
    setSidebarSections({
      summary: false,
      classification: false,
      execution: ([
        TICKET_STATUS.WAITING_PRELIM_ACTIONS,
        TICKET_STATUS.IN_PROGRESS,
        TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL,
        TICKET_STATUS.WAITING_PAYMENT,
        TICKET_STATUS.CLOSED,
      ] as Ticket['status'][]).includes(activeTicket.status),
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
          setDirectoryUsers(directory.users || []);
          setVendors((directory.vendors || []).filter(vendor => vendor.active !== false));
        }
      } catch {
        if (!cancelled) {
          setTeams([]);
          setDirectoryUsers([]);
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
      showToast('Informe o nome do terceiro para cadastrar.', 2500);
      return;
    }

    const tags = newThirdPartyTags
      .map(tag => normalizeTagValue(tag))
      .filter(Boolean);

    try {
      const response = await upsertVendor({
        name,
        email: newThirdPartyEmail.trim(),
        contact: newThirdPartyContact.trim(),
        tags,
        active: true,
      });
      const nextVendor = response.vendor || {
        id: normalizeTagValue(name).replace(/[^a-z0-9-]/g, '-') || `terceiro-${Date.now()}`,
        name,
        email: newThirdPartyEmail.trim(),
        contact: newThirdPartyContact.trim(),
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
      setNewThirdPartyContact('');
      setNewThirdPartyTags([]);
      showToast('Terceiro cadastrado com sucesso.', 2500);
    } catch (error) {
      showToast(`Erro ao cadastrar terceiro: ${error instanceof Error ? error.message : 'falha inesperada.'}`, 3500);
    }
  };

  const handleCreateSharedTagInline = async () => {
    const normalized = String(newSharedTagDraft || '').trim();
    if (!normalized) return;
    const exists = sharedThirdPartyTags.some(tag => tag.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      showToast('Essa tag já existe.', 2500);
      return;
    }

    const nextTags = [...sharedThirdPartyTags, normalized].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    setNewSharedTagSaving(true);
    try {
      await saveSettings('thirdPartyTags', { tags: nextTags });
      setSharedThirdPartyTags(nextTags);
      setNewThirdPartyTags(prev => (prev.some(item => item.toLowerCase() === normalized.toLowerCase()) ? prev : [...prev, normalized]));
      setNewSharedTagDraft('');
      showToast('Tag compartilhada cadastrada.', 2500);
    } catch (error) {
      showToast(`Erro ao salvar tag: ${error instanceof Error ? error.message : 'falha inesperada.'}`, 3500);
    } finally {
      setNewSharedTagSaving(false);
    }
  };

  const handlePriorityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setTicketPriority(newValue);
  };

  const selectedTeam = teams.find(team => team.name === techTeam);
  const activeDirectors = useMemo(
    () =>
      directoryUsers.filter(user => {
        const role = String(user.role || '').trim().toLowerCase();
        const status = String(user.status || 'Ativo').trim().toLowerCase();
        return role === 'diretor' && user.active !== false && status !== 'inativo';
      }),
    [directoryUsers]
  );
  const selectedDirectors = useMemo(
    () => activeDirectors.filter(user => involvedDirectorIds.includes(user.id)),
    [activeDirectors, involvedDirectorIds]
  );
  const hasInvolvedDirectors = selectedDirectors.length > 0;
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
  const quickPanelCollapsed = !quickPanelExpanded;
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

  const handleQuickCreateMacroService = async () => {
    const name = newMacroServiceName.trim();
    if (!name || savingQuickCatalog || !canEditQuickPanel) return;
    setSavingQuickCatalog(true);
    try {
      const catalog = await saveCatalogEntry('macroServices', { name });
      setCatalogMacroServices(catalog.macroServices);
      setServiceCatalog(catalog.serviceCatalog);
      const created = [...catalog.macroServices]
        .reverse()
        .find(item => String(item.name || '').trim().toLowerCase() === name.toLowerCase());
      if (created?.id) {
        setTicketDetailsForm(prev => ({ ...prev, macroServiceId: created.id, serviceCatalogId: '' }));
      }
      setNewMacroServiceName('');
    } finally {
      setSavingQuickCatalog(false);
    }
  };

  const handleQuickCreateService = async () => {
    const name = newServiceName.trim();
    const macroServiceId = String(ticketDetailsForm.macroServiceId || '').trim();
    if (!name || !macroServiceId || savingQuickCatalog || !canEditQuickPanel) return;
    setSavingQuickCatalog(true);
    try {
      const catalog = await saveCatalogEntry('serviceCatalog', { name, macroServiceId });
      setCatalogMacroServices(catalog.macroServices);
      setServiceCatalog(catalog.serviceCatalog);
      const created = [...catalog.serviceCatalog]
        .reverse()
        .find(
          item =>
            String(item.name || '').trim().toLowerCase() === name.toLowerCase() &&
            String(item.macroServiceId || '') === macroServiceId
        );
      if (created?.id) {
        setTicketDetailsForm(prev => ({ ...prev, serviceCatalogId: created.id }));
      }
      setNewServiceName('');
    } finally {
      setSavingQuickCatalog(false);
    }
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
      nextStatus === TICKET_STATUS.IN_PROGRESS && activeTicket.preliminaryActions
        ? {
            ...activeTicket.preliminaryActions,
            actualStartAt: activeTicket.preliminaryActions.actualStartAt || when,
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
      showToast('Selecione ao menos um terceiro responsável para equipes externas.', 3000);
      return;
    }

    const nextAssignedEmail = isExternalTeam ? resolveAssignedEmails() : '';
    const nextClassification = resolveClassificationSelection();
    const changes: string[] = [];
    const updates: Partial<Ticket> = {};
    const nextTicketTime = parseInputDateTime(ticketDetailsForm.time);

    if (!nextTicketTime) {
      showToast('Informe uma data de abertura válida para a OS.', 3000);
      return;
    }

    const previousDirectorIds = Array.isArray(activeTicket.directorIds) ? activeTicket.directorIds : [];
    const nextDirectorIds = selectedDirectors.map(director => director.id);
    const directorsChanged =
      previousDirectorIds.length !== nextDirectorIds.length ||
      previousDirectorIds.some(id => !nextDirectorIds.includes(id));

    if ((techTeam || '') !== (activeTicket.assignedTeam || '')) {
      updates.assignedTeam = techTeam || '';
      changes.push('responsável técnico');
    }
    if (Math.abs(nextTicketTime.getTime() - activeTicket.time.getTime()) >= 60000) {
      updates.time = nextTicketTime;
      changes.push(`data da OS: ${formatDateTimeSafe(activeTicket.time)} -> ${formatDateTimeSafe(nextTicketTime)}`);
    }
    if ((ticketPriority || '') !== (activeTicket.priority || '')) {
      updates.priority = ticketPriority || '';
      changes.push('urgência');
    }
    const nextSector = ticketDetailsForm.sector.trim();
    if (nextSector && nextSector !== (activeTicket.sector || '')) {
      updates.sector = nextSector;
      changes.push(`local: ${activeTicket.sector || 'Não informado'} -> ${nextSector}`);
    }
    const nextLocation = ticketDetailsForm.location.trim();
    if (nextLocation !== (activeTicket.location || '')) {
      updates.location = nextLocation;
      changes.push(`detalhe do local: ${activeTicket.location || 'Não informado'} -> ${nextLocation || 'Não informado'}`);
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
    if (directorsChanged) {
      updates.directorIds = nextDirectorIds;
      updates.directorEmails = selectedDirectors.map(director => director.email).filter(Boolean);
      changes.push('diretores envolvidos');
    }
    if (Boolean(activeTicket.waterIssue) !== Boolean(waterIssueDraft)) {
      updates.waterIssue = Boolean(waterIssueDraft);
      changes.push(`goteira/infiltração: ${activeTicket.waterIssue ? 'marcado' : 'não marcado'} -> ${waterIssueDraft ? 'marcado' : 'não marcado'}`);
    }

    if (changes.length === 0) {
      showToast('Nenhuma alteração encontrada no painel da OS.', 2500);
      return;
    }

    setIsSending(true);
    try {
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
      }, undefined);
    } finally {
      window.setTimeout(() => setIsSending(false), 600);
    }

    showToast('Painel da OS atualizado.', 2500);
  };

  const handleAcceptTicket = () => {
    if (isSending) return;

    if (!techTeam) {
      showToast('Defina a equipe responsável antes de aceitar a OS.', 3000);
      return;
    }

    if (!ticketPriority) {
      showToast('Defina o grau de urgência antes de aceitar a OS.', 3000);
      return;
    }

    if (isExternalTeam && selectedThirdParties.length === 0) {
      showToast('Selecione ao menos um terceiro responsável para encaminhamento externo.', 3000);
      return;
    }

    const target = isExternalTeam
      ? (selectedThirdParties.map(vendor => vendor.name).join(', ') || 'Terceiro selecionado')
      : techTeam;
    // Aceitar a OS no painel já é o ato de triagem — o motivo é opcional aqui.
    const statusReason = statusTransitionReason.trim();
    const nextAssignedEmail = isExternalTeam ? resolveAssignedEmails() : '';
    const nextClassification = resolveClassificationSelection();
    const nextSector = ticketDetailsForm.sector.trim() || activeTicket.sector || 'Email';
    const nextLocation = ticketDetailsForm.location.trim() || activeTicket.location || '';
    setIsSending(true);
    try {
      updateTicket(activeTicket.id, {
        status: TICKET_STATUS.WAITING_TECH_OPINION,
        priority: ticketPriority,
        assignedTeam: techTeam,
        assignedEmail: nextAssignedEmail,
        sector: nextSector,
        location: nextLocation,
        macroServiceId: nextClassification.macroServiceId,
        macroServiceName: nextClassification.macroServiceName,
        serviceCatalogId: nextClassification.serviceCatalogId,
        serviceCatalogName: nextClassification.serviceCatalogName,
        directorIds: selectedDirectors.map(director => director.id),
        directorEmails: selectedDirectors.map(director => director.email).filter(Boolean),
        history: [
          ...activeTicket.history,
          {
            id: crypto.randomUUID(),
            type: 'system',
            sender: displayActorLabel,
            time: new Date(),
            text: `Triagem concluída. OS aceita com prioridade ${ticketPriority}, local ${nextSector}${nextLocation ? `, detalhe do local ${nextLocation}` : ''} e encaminhada para ${target}.${statusReason ? ` Motivo da transição: ${statusReason}.` : ''}`,
          },
        ],
      }, { sendEmailUpdate: sendStatusEmailUpdate });

      setStatusDraft(TICKET_STATUS.WAITING_TECH_OPINION);
      showToast('Triagem concluída e OS aceita.', 2500);
    } finally {
      window.setTimeout(() => setIsSending(false), 600);
    }
  };

  // Aceitar a partir do resumo colapsado: se faltar equipe/urgência, expande o
  // painel pra preencher (em vez de só dar erro); senão aceita direto.
  const handleAcceptFromCollapsed = () => {
    if (isSending) return;
    if (!techTeam || !ticketPriority) {
      setQuickPanelExpanded(true);
      showToast('Defina a equipe responsável e a urgência para aceitar a OS.', 3000);
      return;
    }
    handleAcceptTicket();
  };

  // Botão principal de ação: transição de status + registro no histórico
  // Pergunta (via modal) se a mudança de status deve avisar o solicitante.
  // Só abre o modal em transições voltadas pra fora; nas internas resolve
  // 'silent' na hora, sem interromper o fluxo.
  const requestStatusEmailDecision = (from: string, to: string): Promise<'notify' | 'silent' | 'cancel'> => {
    if (!CUSTOMER_FACING_STATUSES.has(to)) return Promise.resolve('silent');
    const recipients = [
      activeTicket.requesterEmail,
      ...(Array.isArray(activeTicket.requesterCcEmails) ? activeTicket.requesterCcEmails : []),
    ]
      .map(email => String(email || '').trim())
      .filter(Boolean);
    return new Promise(resolve => setStatusEmailPrompt({ from, to, recipients, resolve }));
  };

  const handleSend = async () => {
    if (isSending) return;
    setIsSending(true);
    const now = new Date();
    const sender = displayActorLabel;
    const trimmedReply = getReplyText().trim();

    try {
      let uploadedReplyAttachments: TicketAttachment[] = [];
      if (replyFiles.length > 0) {
        uploadedReplyAttachments = await Promise.all(
          replyFiles.map(file => uploadMessageAttachment(activeTicket.id, replyMode, file))
        );
      }
      // Fotos inseridas no texto já estão no Storage — anexa sem reenviar.
      if (inlineImages.length > 0) {
        uploadedReplyAttachments = [...uploadedReplyAttachments, ...inlineImages];
      }

      const messageWithAttachments = trimmedReply;

      if (replyMode === 'internal') {
        const items: HistoryItem[] = [];
        let newStatus = activeTicket.status;
        // Decisão de e-mail da mudança de status (definida pelo modal, quando a
        // transição é voltada pra fora). Passos internos não avisam.
        let notifyRequesterOfStatus = false;
        const requestedStatus = (statusDraft || activeTicket.status) as Ticket['status'];
        const hasManualStatusTransition = requestedStatus !== activeTicket.status;

        if (hasManualStatusTransition) {
          if (!canTransitionStatus(actorRole, 'inbox', activeTicket.status, requestedStatus)) {
            showToast(`Transição inválida de status: ${activeTicket.status} -> ${requestedStatus}.`, 3500);
            setIsSending(false);
            return;
          }
          const statusReason = statusTransitionReason.trim();
          if (!statusReason) {
            showToast('Informe o motivo da transição manual de status.', 3000);
            setIsSending(false);
            return;
          }
          newStatus = requestedStatus;
          // Transição voltada pra fora → pergunta se avisa o solicitante por
          // e-mail (dois botões + preview). Interna → resolve 'silent' na hora.
          const emailDecision = await requestStatusEmailDecision(activeTicket.status, newStatus);
          if (emailDecision === 'cancel') {
            setIsSending(false);
            return;
          }
          notifyRequesterOfStatus = emailDecision === 'notify';
          items.push({
            id: crypto.randomUUID(),
            type: 'system',
            sender,
            time: now,
            text: `Transição manual via chat: ${activeTicket.status} -> ${requestedStatus}. Motivo: ${statusReason}.`,
            visibility: 'internal',
          });
        } else if (activeTicket.status === TICKET_STATUS.WAITING_TECH_OPINION) {
          // Trava: a OS só avança de "Parecer Técnico" para orçamento/aprovação com
          // o serviço classificado (macroserviço + serviço). Garante que a
          // classificação adiada na triagem não seja esquecida — o medo do "deixar
          // pra depois". O erro aparece no momento certo, não como parede no dia 1.
          if (!activeTicket.macroServiceId || !activeTicket.serviceCatalogId) {
            showToast('Classifique o serviço (macroserviço + serviço) no painel antes de avançar para orçamento.', 4000);
            setIsSending(false);
            return;
          }
          newStatus = hasInvolvedDirectors ? TICKET_STATUS.WAITING_SOLUTION_APPROVAL : TICKET_STATUS.WAITING_BUDGET;
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
            text: hasInvolvedDirectors
              ? 'Parecer consolidado e enviado para aprovação da Diretoria.'
              : 'Parecer consolidado sem diretores envolvidos. Etapa de aprovação da Diretoria pulada e OS liberada para orçamento.',
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
            // Persiste a seleção viva de diretores: o roteamento (aprovação vs.
            // pular) usa hasInvolvedDirectors, então directorIds tem que casar.
            directorIds: selectedDirectors.map(director => director.id),
            directorEmails: selectedDirectors.map(director => director.email).filter(Boolean),
            attachments:
              uploadedReplyAttachments.length > 0
                ? [...(activeTicket.attachments || []), ...uploadedReplyAttachments]
                : activeTicket.attachments,
            history: [...activeTicket.history, ...items],
          }, newStatus !== activeTicket.status ? { sendEmailUpdate: notifyRequesterOfStatus } : undefined);
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
        const selectedInterestedEmails = mergeEmails(publicInterestedEmails);
        updateTicket(activeTicket.id, {
          requesterCcEmails: selectedInterestedEmails,
          attachments:
            uploadedReplyAttachments.length > 0
              ? [...(activeTicket.attachments || []), ...uploadedReplyAttachments]
              : activeTicket.attachments,
          history: [...activeTicket.history, item],
        });
        // Responder SEMPRE dispara o e-mail (o propósito do modo é notificar o
        // solicitante/interessados). Dá feedback se o e-mail não sair (não é
        // fire-and-forget silencioso).
        notifyTicketPublicReply(activeTicket, sender, trimmedReply || 'Mensagem com anexo.', uploadedReplyAttachments, selectedInterestedEmails)
          .then(result => {
            if (result === 'no-recipient') showToast('Resposta registrada, mas esta OS não tem e-mail do solicitante — nenhum e-mail foi enviado.', 5000);
            else if (result === 'failed') showToast('Resposta registrada, mas o e-mail NÃO foi enviado ao solicitante. Tente reenviar.', 5000);
          })
          .catch(() => showToast('Resposta registrada, mas falhou o envio do e-mail.', 5000));
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
        // Diretoria SEMPRE dispara o e-mail (o propósito do modo é notificar).
        notifyTicketDirectorReply(activeTicket, sender, trimmedReply || 'Mensagem com anexo.', uploadedReplyAttachments)
          .then(result => {
            if (result === 'no-directors') showToast('Mensagem registrada, mas não há diretores envolvidos — nada foi enviado à Diretoria.', 5000);
            else if (result === 'failed') showToast('Mensagem registrada, mas o e-mail à Diretoria NÃO foi enviado. Tente reenviar.', 5000);
          })
          .catch(() => showToast('Mensagem registrada, mas falhou o envio à Diretoria.', 5000));
      }

      setReplyTextValue('');
      setReplyFiles([]);
      setInlineImages([]);
      setStatusTransitionReason('');
      if (replyFileRef.current) replyFileRef.current.value = '';
    } catch {
      showToast('Falha ao anexar arquivos nesta mensagem. Tente novamente.', 3000);
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
      showToast('Erro: conclua todas as ações preliminares antes de iniciar a execução.', 3000);
      return;
    }

    if (startExecution && !prelimForm.plannedStartAt) {
      showToast('Erro: informe a data prevista de início antes de iniciar a execução.', 3000);
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
      showToast('Checklist concluído. Defina o fluxo para iniciar a execução.', 3000);
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
      showToast('Erro: escolha um fluxo de pagamento entre 1x e 5x.', 3000);
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
      }, { sendEmailUpdate: sendStatusEmailUpdate });

      setShowExecutionSetupModal(false);
      showToast(`Execução iniciada. Fluxo ${paymentFlowParts}x registrado.`, 3000);
    } finally {
      window.setTimeout(() => setIsSending(false), 500);
    }
  };

  const handleOpenProgressModal = () => {
    setProgressUpdateForm(createProgressUpdateFormState(activeTicket));
    setProgressReportFiles([]);
    if (progressReportFileRef.current) progressReportFileRef.current.value = '';
    setShowProgressModal(true);
  };

  const handleSaveProgressUpdate = async () => {
    if (isSending) return;
    if (!activeTicket.executionProgress?.paymentFlowParts) {
      showToast('Erro: inicie a execução e defina o fluxo antes de atualizar o andamento.', 3000);
      return;
    }

    const baselineValue = resolveExpectedBaselineValue(activeContract, activePayments);
    if (baselineValue <= 0) {
      showToast('Erro: valor previsto da obra não encontrado para calcular o andamento.', 3000);
      return;
    }

    const grossAmount = parseCurrencyInput(progressUpdateForm.grossAmount || '');
    const budgetSource = progressUpdateForm.budgetSource === 'additive' ? 'additive' : 'initial';
    const budgetSourceLabel = getBudgetSourceLabel(budgetSource);
    if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
      showToast('Erro: informe o valor bruto do lançamento/etapa.', 3000);
      return;
    }

    const currentGross = (baselineValue * activeProgressPercent) / 100;
    const accumulatedGross = currentGross + grossAmount;
    const progressPercent = calculateProgressPercentFromGross(accumulatedGross, baselineValue);
    if (progressPercent < activeProgressPercent) {
      showToast('Erro: o percentual calculado não pode ser menor do que o andamento já registrado.', 3000);
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
      budgetSource,
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

    const reportAttachmentsSummarySuffix = progressReportFiles.length > 0 ? ` ${progressReportFiles.length} anexo(s) de relatório.` : '';
    const nextStatus = activeTicket.status;
    const nextClosureChecklist = activeTicket.closureChecklist;

    try {
      const uploadedMeasurementAttachments: TicketAttachment[] = [];
      for (const file of progressReportFiles) {
        const uploaded = await uploadMeasurementAttachment(activeTicket.id, measurementId, file);
        uploadedMeasurementAttachments.push(uploaded);
      }
      const measurement: MeasurementRecord = {
        id: measurementId,
        label: `Andamento atualizado para ${normalizedProgress}% (bruto ${formattedGrossAmount} | acumulado ${formatCurrencyInput(accumulatedGross)})`,
        progressPercent: normalizedProgress,
        releasePercent: progressDelta,
        status: 'approved',
        grossValue: formattedGrossAmount,
        budgetSource,
        notes: progressUpdateForm.notes.trim(),
        attachments: uploadedMeasurementAttachments,
        requestedAt: now,
        approvedAt: now,
      };

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
            text: `Andamento atualizado para ${normalizedProgress}% com lançamento bruto de ${formattedGrossAmount} (${budgetSourceLabel}) e acumulado de ${formatCurrencyInput(accumulatedGross)}. ${paymentLabel} liberado para o financeiro.${progressUpdateForm.notes.trim() ? ` ${progressUpdateForm.notes.trim()}` : ''}${reportAttachmentsSummarySuffix}`,
          },
        ],
      }, nextStatus !== activeTicket.status ? { sendEmailUpdate: sendStatusEmailUpdate } : undefined);

      setShowProgressModal(false);
      setProgressReportFiles([]);
      if (progressReportFileRef.current) progressReportFileRef.current.value = '';
      showToast(`${paymentLabel} registrada e liberada para o financeiro.`, 3000);
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
    }, { sendEmailUpdate: sendStatusEmailUpdate });
    window.setTimeout(() => setIsSending(false), 500);
  };

  const [isSending, setIsSending] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showMobileTicketList, setShowMobileTicketList] = useState(false);

  // Estável (setters fixos) — mantém o TicketListItem memoizado; a lista não
  // re-renderiza a cada tecla no composer / a cada poll.
  const handleSelectTicket = useCallback((id: string) => {
    setActiveTicketId(id);
    setShowMobileTicketList(false);
  }, [setActiveTicketId, setShowMobileTicketList]);
  const [showMobileContext, setShowMobileContext] = useState(false);
  const [isCompactInboxWorkspace, setIsCompactInboxWorkspace] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 768 && window.innerWidth < NOTEBOOK_CONTEXT_PANEL_BREAKPOINT;
  });
  // Movido pra antes da chamada do useQuoteEditor (que recebe como param p/ os
  // handlers de adicionar item). Não depende de `quotes`, só de catálogo/OS.
  const suggestedQuoteMaterials = useMemo(() => {
    const service = serviceCatalog.find(item => item.id === activeTicket.serviceCatalogId);
    if (!service?.suggestedMaterialIds?.length) return [];
    return service.suggestedMaterialIds
      .map(materialId => catalogMaterials.find(material => material.id === materialId))
      .filter((value): value is CatalogMaterial => Boolean(value));
  }, [activeTicket.serviceCatalogId, catalogMaterials, serviceCatalog]);

  const quoteEditor = useQuoteEditor({ activeTicket, catalogMaterials, suggestedQuoteMaterials, getRoundMinQuoteSlots, getRoundMaxQuoteSlots });
  const {
    showQuotesModal, setShowQuotesModal,
    quoteAttachments, setQuoteAttachments,
    pendingCustomUnitByItem, setPendingCustomUnitByItem,
    additionalQuoteUnits, setAdditionalQuoteUnits,
    quotes, setQuotes,
    quoteRoundType, setQuoteRoundType,
    quoteInitialRoundIndex, setQuoteInitialRoundIndex,
    quoteAdditiveIndex, setQuoteAdditiveIndex,
    showQuoteDirectorInterests, setShowQuoteDirectorInterests,
    showQuoteContextPanel, setShowQuoteContextPanel,
    showQuoteHistoryPanel, setShowQuoteHistoryPanel,
    showQuoteComparisonPanel, setShowQuoteComparisonPanel,
    showAdditiveReference, setShowAdditiveReference,
    quoteEditorFocus, setQuoteEditorFocus,
    expandedQuoteItems, setExpandedQuoteItems,
    proposalHeader, setProposalHeader,
    handleProposalHeaderChange, handleProposalCurrencyBlur,
    handleQuoteItemChange, handleQuoteItemCurrencyBlur, handleQuoteItemUnitSelect, handleQuoteItemCustomUnitSave,
    handleAddQuoteItem, handleAddMultipleQuoteItems, handleRemoveQuoteItem, handleQuoteAttachmentChange,
    handleAddQuoteSlot, handleRemoveQuoteSlot,
    quoteUnitOptions, quoteGrandTotals, visibleQuoteEditors,
  } = quoteEditor;
  const [showContractDispatchModal, setShowContractDispatchModal] = useState(false);
  const [showPrelimModal, setShowPrelimModal] = useState(false);
  const [showExecutionSetupModal, setShowExecutionSetupModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showDeleteTicketModal, setShowDeleteTicketModal] = useState(false);
  const [showCancelTicketModal, setShowCancelTicketModal] = useState(false);
  const [pendingCancelTicketUpdates, setPendingCancelTicketUpdates] = useState<Partial<Ticket> | null>(null);
  const [isDeletingTicket, setIsDeletingTicket] = useState(false);
  const [storedQuotesByTicket, setStoredQuotesByTicket] = useState<Record<string, Quote[]>>({});
  const [contractsByTicket, setContractsByTicket] = useState<Record<string, ContractRecord>>({});
  const [contractDispatchFile, setContractDispatchFile] = useState<File | null>(null);
  const [paymentsByTicket, setPaymentsByTicket] = useState<Record<string, PaymentRecord[]>>({});
  const [prelimForm, setPrelimForm] = useState<PreliminaryFormState>(createPreliminaryFormState());
  const [executionSetupForm, setExecutionSetupForm] = useState<ExecutionSetupFormState>(createExecutionSetupFormState());
  const [progressUpdateForm, setProgressUpdateForm] = useState<ProgressUpdateFormState>(createProgressUpdateFormState());
  const { toast, showToast } = useToast();

  const handleUpdateHistoryItemTime = useCallback((originalIndex: number, value: string) => {
    if (!canManageStatus || isSending) return;
    const nextTime = parseInputDateTime(value);
    if (!nextTime) {
      showToast('Informe uma data válida para a mensagem.', 2500);
      return;
    }

    const currentItem = activeTicket.history[originalIndex];
    if (!currentItem) return;
    if (Math.abs(nextTime.getTime() - currentItem.time.getTime()) < 60000) return;

    const nextHistory = activeTicket.history.map((item, index) =>
      index === originalIndex ? { ...item, time: nextTime } : item
    );

    // Se a mensagem editada é a originadora (1ª do solicitante), a data de
    // abertura da OS (card/inbox + KPIs) acompanha — evita o card e a conversa
    // divergirem em OS retroativas.
    const firstCustomerIndex = activeTicket.history.findIndex(item => item.type === 'customer');
    const isOriginating = originalIndex === (firstCustomerIndex === -1 ? 0 : firstCustomerIndex);
    const updates: Partial<Ticket> = { history: nextHistory };
    if (isOriginating) updates.time = nextTime;

    // `updates.history` só serve pro update otimista local — o servidor ignora
    // (merge por-id) e aplica a edição pontualmente via `historyTimeEdit`, sem
    // reescrever os horários das outras entradas.
    updateTicket(activeTicket.id, updates, {
      historyTimeEdit: currentItem.id ? { id: currentItem.id, time: nextTime.toISOString() } : undefined,
    });
    showToast(isOriginating ? 'Data da OS e da mensagem atualizadas.' : 'Data da mensagem atualizada.', 2000);
  }, [canManageStatus, isSending, activeTicket, updateTicket, showToast]);
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
      type: resolveAttachmentPreviewType(attachment.contentType, attachment.name),
      url: attachment.url,
    }));
  const isMobileOverlayOpen = showMobileTicketList || showMobileContext;
  const shouldLockBodyScroll =
    isMobileOverlayOpen || showQuotesModal || showContractDispatchModal || showPrelimModal || showExecutionSetupModal || showProgressModal || showDeleteTicketModal || showCancelTicketModal;

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
      if (showCancelTicketModal) setShowCancelTicketModal(false);
      if (showMobileTicketList) setShowMobileTicketList(false);
      if (showMobileContext) setShowMobileContext(false);
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [showQuotesModal, showContractDispatchModal, showPrelimModal, showExecutionSetupModal, showProgressModal, showActionsMenu, showDeleteTicketModal, showCancelTicketModal, showMobileTicketList, showMobileContext]);

  useEffect(() => {
    setShowActionsMenu(false);
    setShowDeleteTicketModal(false);
    setShowCancelTicketModal(false);
    setPendingCancelTicketUpdates(null);
    setShowMobileTicketList(false);
    setShowMobileContext(false);
    setStatusTransitionReason('');
    setSendStatusEmailUpdate(false);
  }, [activeTicketId]);

  useEffect(() => {
    const handleResize = () => {
      const compact = window.innerWidth >= 768 && window.innerWidth < NOTEBOOK_CONTEXT_PANEL_BREAKPOINT;
      setIsCompactInboxWorkspace(compact);
      if (!compact && window.innerWidth >= 768) {
        setShowMobileContext(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const [additiveReason, setAdditiveReason] = useState('');
  const [directorInterestedEmails, setDirectorInterestedEmails] = useState<string[]>([]);
  const [directorInterestedDraft, setDirectorInterestedDraft] = useState('');
  const toggleQuoteMetaPanel = (panel: 'context' | 'history' | 'comparison') => {
    const isContextOpen = showQuoteContextPanel;
    const isHistoryOpen = showQuoteHistoryPanel;
    const isComparisonOpen = showQuoteComparisonPanel;
    const isPanelOpen =
      (panel === 'context' && isContextOpen) ||
      (panel === 'history' && isHistoryOpen) ||
      (panel === 'comparison' && isComparisonOpen);

    if (isPanelOpen) {
      setShowQuoteContextPanel(false);
      setShowQuoteHistoryPanel(false);
      setShowQuoteComparisonPanel(false);
      return;
    }

    setShowQuoteContextPanel(panel === 'context');
    setShowQuoteHistoryPanel(panel === 'history');
    setShowQuoteComparisonPanel(panel === 'comparison');
  };
  const ticketQuotes = useMemo(
    () => storedQuotesByTicket[activeTicketId] || [],
    [activeTicketId, storedQuotesByTicket]
  );
  const availableInitialRounds = useMemo(
    () => getAvailableInitialRounds(ticketQuotes),
    [ticketQuotes]
  );
  const availableAdditiveRounds = useMemo(
    () => getAvailableAdditiveRounds(ticketQuotes),
    [ticketQuotes]
  );
  const nextEditableInitialRoundIndex = useMemo(
    () => getEditableInitialRoundIndex(ticketQuotes),
    [ticketQuotes]
  );
  const rejectedInitialRounds = useMemo(
    () =>
      availableInitialRounds
        .map(roundIndex => ({
          roundIndex,
          quotes: getQuotesByRound(ticketQuotes, 'initial', roundIndex),
        }))
        .filter(round => isRejectedQuoteRound(round.quotes))
        .sort((a, b) => b.roundIndex - a.roundIndex),
    [availableInitialRounds, ticketQuotes]
  );
  const directorEmailSuggestions = useMemo(() => {
    const siteKey = String(activeTicket.siteId || activeTicket.sede || '').trim().toLowerCase();
    const suggestions = tickets
      .filter(ticket => {
        const candidate = String(ticket.siteId || ticket.sede || '').trim().toLowerCase();
        return siteKey && candidate === siteKey && ticket.id !== activeTicket.id;
      })
      .flatMap(ticket => ticket.directorCcEmails || []);
    return mergeEmails(suggestions).filter(email => !directorInterestedEmails.includes(email));
  }, [activeTicket.id, activeTicket.sede, activeTicket.siteId, directorInterestedEmails, tickets]);
  const quoteDraftTicketRef = useRef<string>('');
  const quoteDraftSessionKeyRef = useRef<string>('');

  // Carrega as cotações da rodada ativa (inicial/aditivo) quando o modal estiver aberto
  useEffect(() => {
    if (!showQuotesModal) return;

    const ticketChanged = quoteDraftTicketRef.current !== activeTicketId;
    const allTicketQuotes = ticketQuotes;
    const additiveRounds = getAvailableAdditiveRounds(allTicketQuotes);
    if (ticketChanged && quoteRoundType !== 'additive') {
      const nextAdditiveRoundIndex = additiveRounds.length > 0 ? Math.max(...additiveRounds) : 1;
      const shouldResetInitialRound = quoteInitialRoundIndex !== nextEditableInitialRoundIndex;
      const shouldResetAdditiveRound = quoteAdditiveIndex !== nextAdditiveRoundIndex;
      quoteDraftTicketRef.current = activeTicketId;
      quoteDraftSessionKeyRef.current = '';
      if (shouldResetInitialRound) setQuoteInitialRoundIndex(nextEditableInitialRoundIndex);
      if (shouldResetAdditiveRound) setQuoteAdditiveIndex(nextAdditiveRoundIndex);
      if (shouldResetInitialRound || shouldResetAdditiveRound) return;
    }

    const targetRoundType: 'initial' | 'additive' = quoteRoundType;
    const nextAdditiveIndex = additiveRounds.length > 0 ? Math.max(...additiveRounds) + 1 : 1;
    const effectiveAdditiveIndex =
      targetRoundType === 'additive'
        ? Math.max(1, Number(quoteAdditiveIndex || nextAdditiveIndex))
        : quoteAdditiveIndex;
    const effectiveInitialRoundIndex = Math.max(1, Number(quoteInitialRoundIndex || nextEditableInitialRoundIndex || 1));
    const targetRoundIndex = targetRoundType === 'additive' ? effectiveAdditiveIndex : effectiveInitialRoundIndex;
    const draftSessionKey = `${activeTicketId}:${targetRoundType}:${targetRoundIndex}`;
    if (quoteDraftSessionKeyRef.current === draftSessionKey) return;
    const targetRoundMinSlots = getRoundMinQuoteSlots(targetRoundType);
    const targetRoundMaxSlots = getRoundMaxQuoteSlots(targetRoundType);
    const roundQuotes = getQuotesByRound(allTicketQuotes, targetRoundType, targetRoundIndex);
    const currentQuotes = roundQuotes.filter(quote => normalizeQuoteStatus(quote.status) !== 'rejected');
    const referenceQuote = currentQuotes[0] || roundQuotes[0] || null;
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
      referenceQuote?.proposalHeader
        ? {
            unitName: referenceQuote.proposalHeader?.unitName || currentSiteLabel || activeTicket.sede || '',
            location: referenceQuote.proposalHeader?.location || '',
            folderLink: referenceQuote.proposalHeader?.folderLink || '',
            contractedVendor: referenceQuote.proposalHeader?.contractedVendor || '',
            totalQuantity: referenceQuote.proposalHeader?.totalQuantity || '',
            totalEstimatedValue: referenceQuote.proposalHeader?.totalEstimatedValue || '',
          }
        : createProposalHeaderDraft(activeTicket, currentSiteLabel)
    );
    setQuoteAttachments(Array.from({ length: nextQuotes.length }, () => null));
    setPendingCustomUnitByItem({});
    quoteDraftTicketRef.current = activeTicketId;
    quoteDraftSessionKeyRef.current = draftSessionKey;
  }, [activeTicket, activeTicketId, catalogSites, nextEditableInitialRoundIndex, quoteAdditiveIndex, quoteInitialRoundIndex, quoteRoundType, showQuotesModal]);

  useEffect(() => {
    if (showQuotesModal) return;
    quoteDraftSessionKeyRef.current = '';
  }, [showQuotesModal]);

  useEffect(() => {
    if (!showQuotesModal) return;
    setShowQuoteContextPanel(false);
    setShowQuoteHistoryPanel(false);
    setShowQuoteComparisonPanel(false);
    setShowAdditiveReference(true);
    setQuoteEditorFocus(0);
    setShowQuoteDirectorInterests(false);
    setDirectorInterestedDraft('');
    setDirectorInterestedEmails(mergeEmails(activeTicket.directorCcEmails || []));
  }, [showQuotesModal, activeTicketId, quoteRoundType]);

  useEffect(() => {
    setExpandedQuoteItems(current => {
      const next = { ...current };
      quotes.forEach((quote, quoteIndex) => {
        quote.items.forEach((item, itemIndex) => {
          const key = `${quoteIndex}:${item.id}`;
          if (!(key in next)) {
            next[key] = itemIndex < 2;
          }
        });
      });
      return next;
    });
  }, [quotes]);

  // useMemo evita recalcular em todo re-render
  const [showFinalized, setShowFinalized] = useState(false);

  // Filtros explícitos (status/prioridade/região/sede/tipo), sem o toggle de
  // finalizadas — base tanto para a lista quanto para a contagem de ocultas.
  const baseFilteredTickets = useMemo(() => tickets.filter(t => {
    if (inboxFilter.status.length > 0 && !inboxFilter.status.includes(t.status)) return false;
    if (inboxFilter.priority.length > 0 && t.priority && !inboxFilter.priority.includes(t.priority)) return false;
    if (inboxFilter.region.length > 0 && !inboxFilter.region.includes(getTicketRegionLabel(t, catalogRegions, catalogSites))) return false;
    if (inboxFilter.site.length > 0 && !inboxFilter.site.includes(getTicketSiteLabel(t, catalogSites))) return false;
    if (inboxFilter.type.length > 0 && !inboxFilter.type.includes(t.type)) return false;
    return true;
  }), [tickets, inboxFilter, catalogRegions, catalogSites]);

  // OS Encerradas/Canceladas saem da Inbox por padrão; o botão "Mostrar
  // encerradas" as traz de volta. Se o usuário filtrar explicitamente por um
  // status finalizado, respeitamos o filtro (não escondemos).
  const finalizedExplicitlyFiltered = inboxFilter.status.some(isFinalizedTicketStatus);
  const hideFinalized = !showFinalized && !finalizedExplicitlyFiltered;
  const finalizedInScopeCount = useMemo(
    () => baseFilteredTickets.filter(t => isFinalizedTicketStatus(t.status)).length,
    [baseFilteredTickets]
  );

  const filteredTickets = useMemo(() => baseFilteredTickets
    .filter(t => !(hideFinalized && isFinalizedTicketStatus(t.status)))
    .sort((a, b) => {
      // Finalizadas (quando exibidas) vão para o fim da lista.
      const aFinalized = isFinalizedTicketStatus(a.status);
      const bFinalized = isFinalizedTicketStatus(b.status);
      if (aFinalized !== bFinalized) return aFinalized ? 1 : -1;
      const isAUrgentCorrective = a.type === 'Corretiva' && a.priority === 'Urgente';
      const isBUrgentCorrective = b.type === 'Corretiva' && b.priority === 'Urgente';
      if (isAUrgentCorrective && !isBUrgentCorrective) return -1;
      if (!isAUrgentCorrective && isBUrgentCorrective) return 1;
      return b.time.getTime() - a.time.getTime();
    }), [baseFilteredTickets, hideFinalized]);

  const siteFilterOptions = useMemo(() => {
    const ticketOptions = tickets.map(ticket => getTicketSiteLabel(ticket, catalogSites));
    // Admin vê todas as sedes do catálogo. Demais perfis (ex.: Gestor de uma
    // região) só veem as sedes que aparecem nos seus tickets — já escopados pelo
    // backend —, então o dropdown não lista sedes de outras regiões.
    const catalogOptions = currentUser?.role === 'Admin'
      ? catalogSites.map(site => site.code || site.name)
      : [];
    return [...new Set([...catalogOptions, ...ticketOptions].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [catalogSites, tickets, currentUser?.role]);

  // budgetHistory (cálculo O(n×m) sobre TODOS os tickets) só é exibido no modal
  // de cotações. Fora dele, passa lista vazia para não recalcular a cada
  // resposta na OS — era a causa da trava ao responder.
  const budgetHistory = useMemo(
    () => buildBudgetHistorySummary(activeTicket, showQuotesModal ? tickets : [], storedQuotesByTicket, vendors),
    [activeTicket, showQuotesModal, tickets, storedQuotesByTicket, vendors]
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
  const approvedInitialQuote = useMemo(() => {
    const allQuotes = storedQuotesByTicket[activeTicket.id] || [];
    const approved = allQuotes.find(quote => (quote.category || 'initial') === 'initial' && quote.status === 'approved');
    if (approved) return approved;
    return allQuotes.find(quote => (quote.category || 'initial') === 'initial') || null;
  }, [activeTicket.id, storedQuotesByTicket]);


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
    // Acumula (em vez de substituir) e limpa o value, para permitir adicionar
    // várias fotos uma a uma — antes a 2ª seleção apagava a 1ª.
    const next = Array.from(e.target.files || []);
    if (next.length > 0) setReplyFiles(prev => [...prev, ...next]);
    e.target.value = '';
  };

  // Inserir foto no corpo: faz upload na hora, anexa à mensagem E insere um link
  // clicável no texto. Anexo é a entrega confiável; o link dá a foto "na mensagem".
  const handleInsertImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0 || insertingImage) return;
    setInsertingImage(true);
    try {
      const uploaded = await Promise.all(files.map(file => uploadMessageAttachment(activeTicket.id, replyMode, file)));
      setInlineImages(prev => [...prev, ...uploaded]);
      const lines = uploaded.map(att => `📷 ${att.name}: ${att.url}`).join('\n');
      const prev = getReplyText();
      setReplyTextValue(prev.trim() ? `${prev}\n${lines}` : lines);
    } catch {
      showToast('Falha ao enviar a imagem. Tente novamente.', 3000);
    } finally {
      setInsertingImage(false);
    }
  };

  const handleRemoveInlineImage = (att: TicketAttachment) => {
    setInlineImages(prev => prev.filter(item => item.id !== att.id));
    // Remove também a linha de link correspondente no corpo.
    setReplyTextValue(getReplyText().split('\n').filter(line => !line.includes(att.url || '\u0000')).join('\n'));
  };

  // Pessoas sugeridas no @menção (diretório com nome + e-mail).
  const mentionResults = useMemo(() => {
    if (!mention) return [] as DirectoryUser[];
    const q = mention.query.trim().toLowerCase();
    return directoryUsers
      .filter(u => String(u.email || '').trim() && String(u.name || '').trim())
      .filter(u => !q || u.name.toLowerCase().includes(q) || String(u.email).toLowerCase().includes(q))
      .slice(0, 6);
  }, [mention, directoryUsers]);

  const handleReplyTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    autoGrowReply();
    const value = e.target.value;
    const caret = e.target.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    // último @ antes do cursor, sem espaço entre o @ e o texto digitado
    const match = before.match(/(?:^|\s)@([\p{L}\p{N}._'-]*)$/u);
    if (match) {
      setMention({ query: match[1], start: caret - match[1].length - 1 });
      setMentionIndex(0);
    } else if (mention) {
      setMention(null);
    }
  };

  const insertMention = (person: DirectoryUser) => {
    if (!mention) return;
    const end = mention.start + 1 + mention.query.length;
    const current = getReplyText();
    const nextText = `${current.slice(0, mention.start)}@${person.name} ${current.slice(end)}`;
    setReplyTextValue(nextText);
    // Marcar a pessoa = adiciona o e-mail dela aos interessados (CC da resposta).
    if (person.email) setPublicInterestedEmails(prev => mergeEmails(prev, [String(person.email)]));
    setMention(null);
    window.setTimeout(() => replyTextRef.current?.focus(), 0);
  };

  const handleReplyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mention || mentionResults.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionResults.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionResults.length) % mentionResults.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionResults[mentionIndex] || mentionResults[0]); }
    else if (e.key === 'Escape') { setMention(null); }
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

  const addDirectorInterestedEmails = (input: string) => {
    const parsed = parseEmailTokens(input);
    if (parsed.invalid.length > 0) {
      showToast(`E-mail inválido: ${parsed.invalid[0]}`, 3000);
      return;
    }
    if (parsed.valid.length === 0) return;
    setDirectorInterestedEmails(current => mergeEmails(current, parsed.valid));
    setDirectorInterestedDraft('');
  };

  const removeDirectorInterestedEmail = (email: string) => {
    setDirectorInterestedEmails(current => current.filter(item => item !== email));
  };

  const addPublicInterestedEmails = (input: string) => {
    const parsed = parseEmailTokens(input);
    if (parsed.invalid.length > 0) {
      showToast(`E-mail inválido: ${parsed.invalid[0]}`, 3000);
      return;
    }
    if (parsed.valid.length === 0) return;
    setPublicInterestedEmails(current => mergeEmails(current, parsed.valid));
    setPublicInterestedDraft('');
  };

  const removePublicInterestedEmail = (email: string) => {
    setPublicInterestedEmails(current => current.filter(item => item !== email));
  };

  const applyFormatting = (type: 'bold' | 'italic' | 'list') => {
    if (!replyTextRef.current) return;
    const el = replyTextRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const value = el.value;
    const selected = value.slice(start, end);
    const before = value.slice(0, start);
    const after = value.slice(end);

    let insertion = selected;
    if (type === 'bold') insertion = `**${selected || 'texto'}**`;
    if (type === 'italic') insertion = `*${selected || 'texto'}*`;
    if (type === 'list') insertion = selected ? selected.split('\n').map(line => `- ${line}`).join('\n') : '- item';

    const next = `${before}${insertion}${after}`;
    setReplyTextValue(next);
  };

  const handleSendToDirector = () => {
    const roundType = quoteRoundType;
    const filled = quotes
      .map((quote, index) => ({ quote, index }))
      .filter(({ quote }) => isQuoteDraftFilledForSubmission(quote));
    if (roundType === 'additive' && filled.length !== 1) {
      showToast('Erro: aditivo deve ter exatamente 1 cotação preenchida com fornecedor e valor total.', 3500);
      return;
    }
    if (roundType === 'initial' && filled.length < 2) {
      showToast('Erro: Informe no mínimo 2 cotações antes de enviar.', 3000);
      return;
    }
    setIsSending(true);
    setTimeout(async () => {
      const initialRoundIndex = roundType === 'initial' ? Math.max(1, Number(quoteInitialRoundIndex || 1)) : null;
      const additiveIndex = roundType === 'additive' ? Math.max(1, Number(quoteAdditiveIndex || 1)) : null;
      const normalizedAdditiveReason = additiveReason.trim();
      if (roundType === 'additive' && !normalizedAdditiveReason) {
        setIsSending(false);
        showToast('Erro: informe o motivo do aditivo antes de enviar à diretoria.', 3000);
        return;
      }
      const roundAttachmentKey = roundType === 'additive' ? `additive-${additiveIndex}` : `initial-${initialRoundIndex}`;
      const uploadedAttachments = await Promise.all(
        filled.map(async ({ index }, quoteOrder) => {
          const attachmentFile = quoteAttachments[index];
          if (!attachmentFile) return { index, uploaded: null as Awaited<ReturnType<typeof uploadQuoteAttachment>> | null };
          try {
            const uploaded = await uploadQuoteAttachment(activeTicket.id, roundAttachmentKey, `quote-${quoteOrder + 1}`, attachmentFile);
            return { index, uploaded };
          } catch {
            return { index, uploaded: null, uploadFailed: true };
          }
        })
      );
      const failedUploads = uploadedAttachments.filter(item => Boolean((item as { uploadFailed?: boolean }).uploadFailed));
      if (failedUploads.length > 0) {
        setIsSending(false);
        showToast('Falha ao enviar um ou mais anexos de cotação. Revise os arquivos e tente novamente.', 3500);
        return;
      }
      const uploadedByOriginalIndex = new Map<number, Awaited<ReturnType<typeof uploadQuoteAttachment>>>();
      uploadedAttachments.forEach(item => {
        if (item.uploaded) uploadedByOriginalIndex.set(item.index, item.uploaded);
      });
      const nextQuotes: Quote[] = filled.map(({ quote, index: originalIndex }, index) => {
        const summary = summarizeQuoteDraft(quote);
        const resolvedTotal = resolveQuoteDraftSubmittedTotal(quote).trim();
        const resolvedValue = quote.value.trim() || resolvedTotal;
        return ({
        id: `quote-${index + 1}`,
        vendor: quote.vendor.trim(),
        value: resolvedValue,
        laborValue: quote.laborValue || summary.laborValue,
        materialValue: quote.materialValue || summary.materialValue,
        totalValue: resolvedTotal,
        category: roundType,
        initialRoundIndex,
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
      })});
      try {
        await saveQuotes(activeTicket.id, nextQuotes, buildProcurementClassification(activeTicket));
      } catch (error) {
        const details = error instanceof Error ? error.message : 'Erro desconhecido ao salvar cotações.';
        setIsSending(false);
        showToast(`Falha ao salvar cotações no servidor: ${details}`, 5000);
        return;
      }
      setStoredQuotesByTicket(prev => {
        const existing = prev[activeTicket.id] || [];
        const merged = [
          ...existing.filter(quote => {
            const category = quote.category === 'additive' ? 'additive' : 'initial';
            if (category !== roundType) return true;
            if (roundType === 'additive') return Number(quote.additiveIndex || 1) !== Number(additiveIndex || 1);
            return Number(quote.initialRoundIndex || 1) !== Number(initialRoundIndex || 1);
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
            ? (hasInvolvedDirectors
              ? `Aditivo ${additiveIndex} consolidado e enviado para aprovação da Diretoria.`
              : `Aditivo ${additiveIndex} consolidado sem diretores envolvidos. Aprovação da Diretoria pulada.`)
            : (hasInvolvedDirectors
              ? `Orçamentos da rodada ${initialRoundIndex} consolidados e enviados para aprovação da Diretoria.`
              : `Orçamentos da rodada ${initialRoundIndex} consolidados sem diretores envolvidos. Aprovação da Diretoria pulada.`),
      };
      updateTicket(activeTicket.id, {
        status: hasInvolvedDirectors ? TICKET_STATUS.WAITING_BUDGET_APPROVAL : TICKET_STATUS.WAITING_CONTRACT_UPLOAD,
        directorIds: selectedDirectors.map(director => director.id),
        directorEmails: selectedDirectors.map(director => director.email).filter(Boolean),
        directorCcEmails: directorInterestedEmails,
        history: [...activeTicket.history, historyItem],
      }, { sendEmailUpdate: sendStatusEmailUpdate });
      setIsSending(false);
      setShowQuotesModal(false);
      showToast(
        hasInvolvedDirectors
          ? (roundType === 'additive'
            ? `Aditivo ${additiveIndex} enviado para a Diretoria com sucesso!`
            : `Rodada ${initialRoundIndex} de orçamentos enviada para a Diretoria com sucesso!`)
          : 'Sem diretores envolvidos: a etapa de aprovação da Diretoria foi pulada.',
        3000
      );
    }, 1500);
  };

  const handleSendContractToDirector = async () => {
    if (!activeContract) {
      showToast('Contrato base não encontrado. Aprove o orçamento antes de enviar contrato.', 3000);
      return;
    }
    if (!contractDispatchFile) {
      showToast('Selecione o arquivo do contrato (PDF) antes de enviar à Diretoria.', 3000);
      return;
    }

    setIsSending(true);
    const now = new Date();
    let uploadedContract: Awaited<ReturnType<typeof uploadContractAttachment>> | null = null;
    try {
      uploadedContract = await uploadContractAttachment(activeTicket.id, contractDispatchFile);
    } catch {
      setIsSending(false);
      showToast('Falha ao enviar o PDF do contrato. Tente novamente.', 3000);
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
      showToast(`Falha ao registrar contrato no servidor: ${details}`, 6000);
      return;
    }

    setContractsByTicket(prev => ({ ...prev, [activeTicket.id]: nextContract }));
    updateTicket(activeTicket.id, {
      status: hasInvolvedDirectors ? TICKET_STATUS.WAITING_CONTRACT_APPROVAL : TICKET_STATUS.WAITING_PRELIM_ACTIONS,
      directorIds: selectedDirectors.map(director => director.id),
      directorEmails: selectedDirectors.map(director => director.email).filter(Boolean),
      history: [
        ...activeTicket.history,
        {
          id: crypto.randomUUID(),
          type: 'system',
          sender: displayActorLabel,
          time: now,
          text: hasInvolvedDirectors
            ? `Contrato anexado pelo gestor (${contractDispatchFile.name}) e enviado para aprovação da Diretoria.`
            : `Contrato anexado pelo gestor (${contractDispatchFile.name}) sem diretores envolvidos. Aprovação da Diretoria pulada e OS liberada para ações preliminares.`,
        },
      ],
    }, { sendEmailUpdate: sendStatusEmailUpdate });

    setContractDispatchFile(null);
    setShowContractDispatchModal(false);
    setIsSending(false);
    showToast(
      hasInvolvedDirectors
        ? 'Contrato enviado para aprovação da Diretoria.'
        : 'Sem diretores envolvidos: contrato registrado e OS liberada para ações preliminares.',
      3000
    );
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
    showToast('Link copiado para a área de transferência!', 3000);
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
    if (isSending) return; // evita duplo clique criando duas OS
    setIsSending(true);
    const now = new Date();

    // O histórico é copiado NO SERVIDOR a partir da OS de origem — o cliente não
    // dita mais o histórico (era forjável). Só sinalizamos a origem por id.
    const duplicated = {
      ...activeTicket,
      id: '',
      trackingToken: '',
      status: TICKET_STATUS.NEW,
      time: now,
      duplicateFromTicketId: activeTicket.id,
      history: [],
    } as Ticket & { duplicateFromTicketId: string };

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
      showToast(`OS ${activeTicket.id} duplicada como ${createdTicket.id}.`, 3000);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível duplicar a OS.', 3000);
    } finally {
      setIsSending(false);
    }
  };

  const handleCancelTicket = () => {
    if (activeTicket.status === TICKET_STATUS.CANCELED) return;
    setPendingCancelTicketUpdates({ status: TICKET_STATUS.CANCELED });
    setShowActionsMenu(false);
    setShowCancelTicketModal(true);
  };

  const handleConfirmCancelTicket = (reason?: string) => {
    if (activeTicket.status === TICKET_STATUS.CANCELED) return;
    const reasonText = String(reason || '').trim();
    if (!reasonText) return;
    const updates = pendingCancelTicketUpdates || { status: TICKET_STATUS.CANCELED };
    updateTicket(activeTicket.id, {
      ...updates,
      status: TICKET_STATUS.CANCELED,
      history: [
        ...activeTicket.history,
        {
          id: crypto.randomUUID(),
          type: 'system',
          sender: displayActorLabel,
          time: new Date(),
          text: `OS cancelada por ${displayActorLabel}. Motivo: ${reasonText}.`,
        },
      ],
    }, { sendEmailUpdate: sendStatusEmailUpdate });
    setPendingCancelTicketUpdates(null);
    setShowCancelTicketModal(false);
    setShowActionsMenu(false);
    showToast(`OS ${activeTicket.id} cancelada.`, 3000);
  };

  const handleReopenTicket = () => {
    if (!([TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED] as Ticket['status'][]).includes(activeTicket.status)) {
      showToast('Erro: apenas OS encerrada ou cancelada pode ser reaberta.', 3000);
      return;
    }
    const statusReason = statusTransitionReason.trim();
    if (!statusReason) {
      showToast('Informe o motivo para reabrir a OS.', 3000);
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
          text: `OS reaberta pelo gestor para ${nextStatus}. Motivo da transição: ${statusReason}.`,
        },
      ],
    }, { sendEmailUpdate: sendStatusEmailUpdate });
    setStatusDraft(nextStatus);
    setShowActionsMenu(false);
    showToast(`OS ${activeTicket.id} reaberta.`, 3000);
  };

  const handleDeleteTicket = async () => {
    if (!canDeleteTicket || isDeletingTicket || !activeTicket.id) return;

    setIsDeletingTicket(true);
    try {
      await deleteTicketInApi(activeTicket.id);
      setShowDeleteTicketModal(false);
      setShowActionsMenu(false);
      showToast(`OS ${activeTicket.id} excluída com sucesso.`);
      await refreshTickets({ silent: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível excluir a OS.', 4000);
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
          className={`${isCompactInboxWorkspace ? '' : 'md:hidden'} fixed inset-0 bg-black/40 z-30`}
          onClick={() => {
            setShowMobileTicketList(false);
            setShowMobileContext(false);
          }}
          aria-label="Fechar painéis móveis"
        />
      )}

      {/* Ticket List Pane */}
      <div id="ticket-list-drawer" className={`fixed md:static inset-y-0 left-14 md:left-auto z-40 h-full w-[calc(100vw-3.5rem)] max-w-[22rem] md:w-[14.5rem] lg:w-[15.5rem] xl:w-[16.5rem] min-[1500px]:w-[17.5rem] min-[1800px]:w-[19rem] bg-roman-surface border-r border-roman-border flex flex-col shadow-[1px_0_5px_rgba(0,0,0,0.02)] transition-transform duration-200 ${showMobileTicketList ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
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
                recurrentLocation={recurrentTicketIds.has(ticket.id)}
                active={activeTicketId === ticket.id}
                onSelect={handleSelectTicket}
              />
            ))
          )}
          {!finalizedExplicitlyFiltered && finalizedInScopeCount > 0 && (
            <button
              onClick={() => setShowFinalized(value => !value)}
              className="sticky bottom-0 z-10 flex w-full items-center justify-center gap-2 border-t border-roman-border bg-roman-surface px-3 py-2.5 text-[12px] font-medium text-roman-text-sub transition-colors hover:bg-roman-border-light hover:text-roman-text-main"
            >
              <CheckCircle size={13} />
              {showFinalized ? 'Ocultar encerradas' : `Mostrar encerradas (${finalizedInScopeCount})`}
              <ChevronDown size={13} className={`transition-transform ${showFinalized ? 'rotate-180' : ''}`} />
            </button>
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
            {isCompactInboxWorkspace && (
              <button
                onClick={() => {
                  setShowMobileContext(prev => !prev);
                  setShowMobileTicketList(false);
                }}
                className="hidden md:inline-flex items-center rounded-sm border border-roman-border bg-roman-bg px-3 py-1.5 text-xs font-medium text-roman-text-main hover:border-roman-primary/40"
                aria-expanded={showMobileContext}
                aria-controls="context-drawer"
              >
                Painel da OS
              </button>
            )}
            <div
              className="hidden md:flex items-center gap-1.5 mr-3 text-xs text-roman-text-sub"
              title={`Visualizando como: ${displayActorLabel}`}
            >
              <User size={14} />
              <span className="max-w-[150px] truncate">{displayActorLabel}</span>
            </div>
          </div>
        </header>

        {/* Ticket Content Area */}
        <div className="flex h-full flex-1 min-h-0 overflow-hidden">

          {/* Conversation Thread */}
          <div className="flex-1 min-h-0 min-w-0 bg-roman-bg overflow-hidden grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto]">

            {/* Ticket Header */}
            <div className="min-w-0 bg-roman-surface px-3 py-2.5 md:px-4 md:py-3 border-b border-roman-border">
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  {/* Etapa atual em destaque (informação principal) */}
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={activeTicket.status} />
                    {activeTicket.waterIssue ? (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-800">
                        Goteira/Infiltração
                      </span>
                    ) : null}
                  </div>
                  <h1 className="text-[1.2rem] leading-tight font-serif font-medium text-roman-text-main lg:text-[1.3rem] 2xl:text-[1.5rem]">{activeTicket.subject}</h1>
                  {/* Identidade + escopo + data, consolidados numa única linha */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-roman-text-sub">
                    <span className="font-medium text-roman-text-main">{activeTicket.id}</span>
                    <span className="text-roman-border">·</span>
                    <span>Solic.: <span className="font-medium text-roman-text-main">{activeTicket.requester || 'Não informado'}</span></span>
                    <span className="text-roman-border">·</span>
                    <span>{getTicketRegionLabel(activeTicket, catalogRegions, catalogSites)}</span>
                    <span className="text-roman-border">·</span>
                    <span>{getTicketSiteLabel(activeTicket, catalogSites)}</span>
                    {activeTicket.priority ? (
                      <>
                        <span className="text-roman-border">·</span>
                        <span>{activeTicket.priority}</span>
                      </>
                    ) : null}
                    <span className="text-roman-border">·</span>
                    <span className="font-serif italic">{formatDateTimeSafe(activeTicket.time)}</span>
                    <button
                      onClick={() => {
                        if (ticketAttachmentItems.length === 0) return;
                        openAttachment(`Anexos: ${activeTicket.subject}`, ticketAttachmentItems[0].type, {
                          url: ticketAttachmentItems[0].url,
                          items: ticketAttachmentItems,
                        });
                      }}
                      disabled={ticketAttachmentItems.length === 0}
                      className="ml-auto shrink-0 whitespace-nowrap flex items-center gap-1 font-medium text-xs text-roman-primary hover:underline disabled:text-roman-text-sub disabled:no-underline disabled:cursor-not-allowed"
                    >
                      <ImageIcon size={14} /> {ticketAttachmentItems.length > 0 ? 'Ver Anexos' : 'Sem anexos'}
                    </button>
                  </div>
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
              {(() => {
                const guidance = getStageGuidance(activeTicket.status);
                if (!guidance) return null;
                return (
                  <div
                    className={`flex items-start gap-2 rounded-sm border px-3 py-2 text-[12.5px] ${
                      guidance.waiting
                        ? 'border-roman-border bg-roman-bg text-roman-text-sub'
                        : 'border-roman-primary/30 bg-roman-primary/8 text-roman-text-main'
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 font-serif text-[10px] font-semibold uppercase tracking-widest ${
                        guidance.waiting ? 'text-roman-text-sub' : 'text-roman-primary'
                      }`}
                    >
                      {guidance.waiting ? 'Aguardando' : 'Próximo passo'}
                    </span>
                    <span className="min-w-0">{guidance.text}</span>
                  </div>
                );
              })()}

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
            <div className="min-h-0 overflow-y-auto p-3 2xl:p-4">
              <TicketHistory
                history={activeTicket.history}
                canManageStatus={canManageStatus}
                isSending={isSending}
                onUpdateItemTime={handleUpdateHistoryItemTime}
                onOpenAttachment={openAttachment}
              />
            </div>

            {/* Reply Box — cap por viewport em telas baixas pra não cobrir a conversa
                (só age quando o composer passaria de ~55vh; sem efeito em telas altas). */}
            <div className={`border-t border-roman-border bg-roman-bg/95 px-3 pb-2 pt-1.5 backdrop-blur md:px-4 overflow-y-auto ${composerView === 'max' ? 'max-h-[85vh]' : 'max-h-[55vh]'}`}>
              <div className={`border rounded-xl overflow-hidden shadow-sm transition-colors ${replyMode !== 'public' ? 'border-roman-parchment-border bg-roman-parchment' : 'border-roman-border bg-roman-surface'}`}>
                {/* Tabs */}
                <div className="flex overflow-x-auto border-b border-roman-border bg-roman-bg/50">
                  <button
                    onClick={() => setReplyMode('internal')}
                    className={`shrink-0 px-3 py-1.5 font-serif text-sm tracking-wide lg:px-4 lg:text-[15px] flex items-center gap-2 ${replyMode === 'internal' ? 'bg-roman-parchment text-roman-text-main border-t-2 border-t-stone-800' : 'text-roman-text-sub hover:bg-roman-surface/50'}`}
                  >
                    <Lock size={14} /> {internalTabLabel}
                  </button>
                  <button
                    onClick={() => setReplyMode('public')}
                    className={`shrink-0 px-3 py-1.5 font-serif text-sm tracking-wide lg:px-4 lg:text-[15px] ${replyMode === 'public' ? 'bg-roman-surface text-roman-text-main border-t-2 border-t-roman-primary' : 'text-roman-text-sub hover:bg-roman-surface/50'}`}
                  >
                    Mensagem aos Interessados
                  </button>
                  {canMessageDirector && (
                    <button
                      onClick={() => setReplyMode('director')}
                      className={`shrink-0 px-3 py-1.5 font-serif text-sm tracking-wide lg:px-4 lg:text-[15px] ${replyMode === 'director' ? 'bg-roman-parchment text-roman-text-main border-t-2 border-t-stone-800' : 'text-roman-text-sub hover:bg-roman-surface/50'}`}
                    >
                      Mensagem à Diretoria
                    </button>
                  )}
                  <div className="ml-auto flex shrink-0 items-center gap-0.5 pr-1">
                    <button
                      type="button"
                      onClick={() => setComposerView(v => (v === 'min' ? 'normal' : 'min'))}
                      title={composerView === 'min' ? 'Expandir' : 'Minimizar'}
                      aria-label={composerView === 'min' ? 'Expandir o campo de mensagem' : 'Minimizar o campo de mensagem'}
                      className="rounded p-1 text-roman-text-sub transition-colors hover:bg-roman-surface/60 hover:text-roman-text-main"
                    >
                      {composerView === 'min' ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposerView(v => (v === 'max' ? 'normal' : 'max'))}
                      title={composerView === 'max' ? 'Restaurar' : 'Maximizar'}
                      aria-label={composerView === 'max' ? 'Restaurar o campo de mensagem' : 'Maximizar o campo de mensagem'}
                      className="rounded p-1 text-roman-text-sub transition-colors hover:bg-roman-surface/60 hover:text-roman-text-main"
                    >
                      {composerView === 'max' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                  </div>
                </div>

                <div className={composerView === 'min' ? 'hidden' : ''}>
                {replyMode === 'public' && (
                  <div className="border-b border-roman-border/50 bg-white px-3 py-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Cópias da mensagem</div>
                        <div className="text-xs text-roman-text-sub">O solicitante recebe no destinatário principal. Os e-mails abaixo recebem em cópia nesta mesma corrente.</div>
                      </div>
                      <span className="rounded-sm border border-roman-border bg-roman-bg px-2 py-1 text-[11px] text-roman-text-sub">
                        {publicInterestedEmails.length} em cópia
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={publicInterestedDraft}
                        onChange={event => setPublicInterestedDraft(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addPublicInterestedEmails(publicInterestedDraft);
                          }
                        }}
                        placeholder="email@dominio.com, outro@dominio.com"
                        className="min-w-0 flex-1 rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-sm text-roman-text-main outline-none focus:border-roman-primary"
                        disabled={isClosed}
                      />
                      <button
                        type="button"
                        onClick={() => addPublicInterestedEmails(publicInterestedDraft)}
                        className="rounded-sm bg-roman-sidebar px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-900 disabled:opacity-50"
                        disabled={isClosed || !publicInterestedDraft.trim()}
                      >
                        Adicionar
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {publicInterestedEmails.length > 0 ? (
                        publicInterestedEmails.map(email => (
                          <span key={`public-interested-${email}`} className="inline-flex items-center gap-1 rounded-sm border border-roman-border bg-roman-bg px-2 py-1 text-xs text-roman-text-main">
                            {email}
                            <button
                              type="button"
                              onClick={() => removePublicInterestedEmail(email)}
                              className="text-roman-text-sub hover:text-red-700"
                              aria-label={`Remover ${email}`}
                              disabled={isClosed}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-roman-text-sub">Sem interessados em cópia.</span>
                      )}
                    </div>
                  </div>
                )}

                {replyMode === 'internal' && canManageStatus && (() => {
                  const hasStageChange = Boolean(statusDraft) && statusDraft !== activeTicket.status;
                  const stageControlsVisible = showStageControls || hasStageChange;
                  return (
                    <div className="border-b border-roman-border/50 bg-white px-3 py-2">
                      {!stageControlsVisible ? (
                        <button
                          type="button"
                          onClick={() => setShowStageControls(true)}
                          disabled={isClosed || isSending}
                          className="flex w-full items-center justify-between gap-2 text-left text-xs text-roman-text-sub transition-colors hover:text-roman-text-main disabled:opacity-50"
                        >
                          <span className="truncate">
                            Etapa atual: <span className="font-medium text-roman-text-main">{activeTicket.status}</span>
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 font-medium text-roman-primary">
                            <RefreshCw size={12} /> Alterar etapa
                          </span>
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Pular/voltar etapa</label>
                            {!hasStageChange && (
                              <button
                                type="button"
                                onClick={() => setShowStageControls(false)}
                                className="text-[11px] text-roman-text-sub transition-colors hover:text-roman-text-main"
                              >
                                Fechar
                              </button>
                            )}
                          </div>
                          <select
                            value={statusDraft}
                            onChange={event => setStatusDraft(event.target.value)}
                            className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-sm text-roman-text-main outline-none focus:border-roman-primary"
                            disabled={isClosed || isSending}
                          >
                            {statusOptions.map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                          {hasStageChange && (
                            <input
                              type="text"
                              value={statusTransitionReason}
                              onChange={event => setStatusTransitionReason(event.target.value)}
                              placeholder="Motivo da transição (obrigatório)"
                              className="w-full rounded-sm border border-amber-300 bg-amber-50/40 px-3 py-2 text-sm text-roman-text-main outline-none focus:border-roman-primary"
                              disabled={isClosed || isSending}
                              autoFocus
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Formatting Toolbar */}
                <div className={`flex items-center gap-2 px-2 py-1 border-b border-roman-border/50 text-roman-text-sub ${isClosed ? 'opacity-50 pointer-events-none' : ''}`}>
                  <button type="button" aria-label="Negrito" title="Negrito" onClick={() => applyFormatting('bold')} className="p-1 hover:bg-roman-bg rounded" disabled={isClosed}><Bold size={16} /></button>
                  <button type="button" aria-label="Itálico" title="Itálico" onClick={() => applyFormatting('italic')} className="p-1 hover:bg-roman-bg rounded" disabled={isClosed}><Italic size={16} /></button>
                  <button type="button" aria-label="Lista" title="Lista" onClick={() => applyFormatting('list')} className="p-1 hover:bg-roman-bg rounded" disabled={isClosed}><List size={16} /></button>
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
                  <button
                    type="button"
                    onClick={() => inlineImageRef.current?.click()}
                    className={`p-1 hover:bg-roman-bg rounded relative ${inlineImages.length > 0 ? 'text-roman-primary' : ''}`}
                    title="Inserir foto no texto (anexa e adiciona um link no corpo)"
                    disabled={isClosed || insertingImage}
                  >
                    {insertingImage ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                    {inlineImages.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-roman-primary rounded-full"></span>
                    )}
                  </button>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    ref={inlineImageRef}
                    onChange={handleInsertImages}
                    disabled={isClosed}
                  />
                </div>

                {/* Textarea */}
                <textarea
                  ref={replyTextRef}
                  rows={1}
                  className={`w-full overflow-y-auto p-3 outline-none resize-none bg-transparent text-[13px] font-sans disabled:opacity-50 disabled:cursor-not-allowed ${composerView === 'max' ? 'min-h-[40vh] max-h-[70vh]' : 'min-h-[2.5rem] max-h-[40vh]'}`}
                  placeholder={
                    isClosed
                      ? 'Esta OS está encerrada e não aceita novos comentários.'
                      : replyMode === 'internal'
                        ? internalPlaceholder
                        : replyMode === 'director'
                          ? 'Mensagem interna para Diretoria...'
                          : 'Mensagem para solicitante e interessados...'
                  }
                  onChange={handleReplyTextChange}
                  onKeyDown={handleReplyKeyDown}
                  disabled={isClosed}
                />

                {mention && mentionResults.length > 0 && (
                  <div className="mx-3 mb-2 max-h-44 overflow-y-auto rounded-sm border border-roman-border bg-white shadow-lg">
                    <div className="border-b border-roman-border/60 px-3 py-1 text-[10px] uppercase tracking-widest text-roman-text-sub">Marcar pessoa (recebe a resposta)</div>
                    {mentionResults.map((person, i) => (
                      <button
                        key={person.id}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); insertMention(person); }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${i === mentionIndex ? 'bg-roman-primary/10' : 'hover:bg-roman-bg'}`}
                      >
                        <span className="font-medium text-roman-text-main">{person.name}</span>
                        <span className="truncate text-xs text-roman-text-sub">{person.email}</span>
                      </button>
                    ))}
                  </div>
                )}

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

                {inlineImages.length > 0 && (
                  <div className="px-4 pb-2 flex flex-wrap gap-2">
                    {inlineImages.map(att => (
                      <div key={att.id} className="flex items-center gap-1 text-xs bg-roman-primary/10 border border-roman-primary/30 px-2 py-1 rounded-sm text-roman-primary">
                        <ImageIcon size={12} />
                        <span className="max-w-[150px] truncate">{att.name}</span>
                        <button onClick={() => handleRemoveInlineImage(att)} className="ml-1 hover:text-red-500" disabled={isClosed}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="sticky bottom-0 z-10 border-t border-roman-border/50 bg-roman-bg/90 px-3 py-1.5 backdrop-blur">
                  <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="hidden truncate text-[11px] text-roman-text-sub font-serif italic sm:block">
                    {replyMode === 'internal'
                      ? internalActionText
                      : replyMode === 'director'
                        ? 'Notifica a Diretoria por e-mail (conversa interna)'
                        : 'Responde ao solicitante com cópia aos interessados'}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-2">
                      <button
                        onClick={() => {
                          setReplyTextValue('');
                          setReplyFiles([]);
                          // Reverte também a etapa escolhida e o motivo, senão o
                          // "Pular/voltar etapa" continua armado após cancelar.
                          setStatusDraft(activeTicket.status || '');
                          setStatusTransitionReason('');
                          if (replyFileRef.current) replyFileRef.current.value = '';
                        }}
                        className="rounded px-4 py-1.5 font-medium text-roman-text-sub transition-colors hover:bg-roman-bg disabled:opacity-50"
                        disabled={isClosed}
                      >
                        Cancelar
                      </button>
                      <div className="flex overflow-hidden rounded-sm shadow-sm">
                        <button
                          onClick={handleSend}
                          className="flex items-center gap-2 bg-roman-sidebar px-4 py-1.5 font-medium tracking-wide text-white transition-colors hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isClosed || isSending}
                        >
                          {isSending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                          {isSending
                            ? 'Enviando...'
                            : replyMode === 'internal'
                              ? (statusDraft && statusDraft !== activeTicket.status
                                  ? `Salvar e mover para “${statusDraft}”`
                                  : internalButtonText)
                              : replyMode === 'director'
                                ? 'Enviar à Diretoria'
                                : 'Enviar aos Interessados'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            </div>
          </div>

          {/* Context Panel (Right Sidebar) */}
          <aside
            id="context-drawer"
            className={`fixed inset-y-0 right-0 z-40 h-full w-[86vw] max-w-[22rem] md:w-[14rem] lg:w-[15rem] xl:w-[16.25rem] min-[1500px]:w-[17rem] min-[1800px]:w-[19.5rem] bg-roman-surface border-l border-roman-border flex min-h-0 flex-col transition-transform duration-200 ${
              isCompactInboxWorkspace
                ? (showMobileContext ? 'translate-x-0' : 'translate-x-full')
                : (showMobileContext ? 'translate-x-0' : 'translate-x-full md:translate-x-0')
            } ${isCompactInboxWorkspace ? '' : 'md:static'}`}
          >
            <div className="h-10 border-b border-roman-border flex items-center justify-between px-3 font-serif text-xs tracking-widest uppercase font-semibold text-roman-text-main">
              <span>Painel da OS</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMobileContext(false);
                }}
                className={`${isCompactInboxWorkspace ? '' : 'md:hidden'} text-roman-text-sub hover:text-roman-text-main`}
                aria-label="Fechar painel de dados"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2.5 space-y-2.5">
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

                        {/* executionProgress is only set for active execution statuses (not CANCELED), so only CLOSED needs to be excluded */}
                        {canManageStatus &&
                          activeTicket.executionProgress &&
                          activeTicket.status !== TICKET_STATUS.CLOSED && (
                            <button
                              onClick={handleOpenProgressModal}
                              className="w-full bg-roman-sidebar hover:bg-stone-900 text-white py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2"
                            >
                              <RefreshCw size={14} /> Atualizar Andamento da Obra
                            </button>
                          )}

                        {activeTicket.status === TICKET_STATUS.IN_PROGRESS && (
                          <button
                            type="button"
                            onClick={() => {
                              setQuoteRoundType('additive');
                              setQuoteAdditiveIndex((availableAdditiveRounds.length > 0 ? Math.max(...availableAdditiveRounds) : 0) + 1);
                              setShowQuotesModal(true);
                            }}
                            className="w-full bg-roman-bg border border-roman-border hover:border-roman-primary text-roman-text-main py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2"
                          >
                            <Plus size={14} /> Criar Aditivo
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
                        setQuoteInitialRoundIndex(nextEditableInitialRoundIndex);
                        setShowQuotesModal(true);
                      }}
                      className="w-full bg-roman-bg border border-roman-border hover:border-roman-primary text-roman-text-main py-3 rounded-xl font-medium transition-colors text-xs flex items-center justify-center gap-2 group"
                    >
                      <DollarSign size={16} className="text-roman-text-sub group-hover:text-roman-primary" />
                      Gerenciar Cotações ({quotes.filter(isQuoteDraftFilledForSubmission).length}/5)
                    </button>
                    <button
                      onClick={() => {
                        setQuoteRoundType('additive');
                        setQuoteAdditiveIndex((availableAdditiveRounds.length > 0 ? Math.max(...availableAdditiveRounds) : 0) + 1);
                        setShowQuotesModal(true);
                      }}
                      className="w-full bg-roman-bg border border-roman-border hover:border-roman-primary text-roman-text-main py-3 rounded-xl font-medium transition-colors text-xs flex items-center justify-center gap-2 group"
                    >
                      <Plus size={16} className="text-roman-text-sub group-hover:text-roman-primary" />
                      Criar Aditivo
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
                    {activeTicket.status === TICKET_STATUS.NEW ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={handleAcceptFromCollapsed}
                            disabled={isSending}
                            className="inline-flex items-center justify-center gap-2 rounded-sm bg-roman-sidebar px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-stone-900 disabled:opacity-60"
                          >
                            {isSending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                            Aceitar OS
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelTicket}
                            disabled={isSending}
                            className="inline-flex items-center justify-center gap-2 rounded-sm border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60"
                          >
                            <X size={14} />
                            Recusar OS
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setQuickPanelExpanded(true)}
                          className="w-full rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-xs font-medium text-roman-text-sub transition-colors hover:border-roman-primary"
                        >
                          Definir equipe, urgência e classificação
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setQuickPanelExpanded(true)}
                        className="w-full rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-xs font-medium text-roman-text-main transition-colors hover:border-roman-primary"
                      >
                        Atualizar OS
                      </button>
                    )}
                  </div>
                )}
                {!quickPanelCollapsed && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 gap-3">
                    {canManageStatus && (
                      <div>
                        <label className="mb-1.5 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Data de abertura</label>
                        <DateTimePicker
                          value={ticketDetailsForm.time}
                          onChange={value => setTicketDetailsForm(current => ({ ...current, time: value }))}
                          disabled={isSending}
                        />
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
                      <label className="mb-1.5 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Goteira / infiltração</label>
                      <label className="inline-flex items-center gap-2 rounded-sm border border-roman-border bg-white px-3 py-2 text-[12px] text-roman-text-main">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-roman-border text-roman-primary focus:ring-roman-primary"
                          checked={waterIssueDraft}
                          onChange={event => setWaterIssueDraft(event.target.checked)}
                          disabled={isSending || !canEditQuickPanel}
                        />
                        Marcar chamado com risco de goteira/infiltração
                      </label>
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
                      <label className="mb-1.5 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Local</label>
                      <input
                        type="text"
                        value={ticketDetailsForm.sector}
                        onChange={event => setTicketDetailsForm(current => ({ ...current, sector: event.target.value }))}
                        placeholder="Ex.: Coordenação, Infantil, Manutenção..."
                        className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSending || !canEditQuickPanel}
                      />
                      {activeTicket.sector === 'Email' && (
                        <div className="mt-1 text-[11px] text-amber-700">
                          Esta OS veio por e-mail. Ajuste o local correto antes de aceitar.
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Detalhe do local</label>
                      <input
                        type="text"
                        value={ticketDetailsForm.location}
                        onChange={event => setTicketDetailsForm(current => ({ ...current, location: event.target.value }))}
                        placeholder="Ex.: Bloco A, Sala 12, corredor, recepção..."
                        className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSending || !canEditQuickPanel}
                      />
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
                      {canEditQuickPanel && (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            value={newMacroServiceName}
                            onChange={event => setNewMacroServiceName(event.target.value)}
                            placeholder="Novo macroserviço"
                            className="min-w-0 flex-1 rounded-sm border border-roman-border bg-white px-3 py-2 text-[12px] text-roman-text-main outline-none focus:border-roman-primary"
                            disabled={isSending || savingQuickCatalog}
                          />
                          <button
                            type="button"
                            onClick={() => void handleQuickCreateMacroService()}
                            disabled={isSending || savingQuickCatalog || !newMacroServiceName.trim()}
                            className="rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-xs font-medium text-roman-text-main transition-colors hover:border-roman-primary disabled:opacity-50"
                          >
                            + Criar
                          </button>
                        </div>
                      )}
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
                      {canEditQuickPanel && (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            value={newServiceName}
                            onChange={event => setNewServiceName(event.target.value)}
                            placeholder="Novo serviço"
                            className="min-w-0 flex-1 rounded-sm border border-roman-border bg-white px-3 py-2 text-[12px] text-roman-text-main outline-none focus:border-roman-primary"
                            disabled={isSending || savingQuickCatalog || !ticketDetailsForm.macroServiceId}
                          />
                          <button
                            type="button"
                            onClick={() => void handleQuickCreateService()}
                            disabled={isSending || savingQuickCatalog || !ticketDetailsForm.macroServiceId || !newServiceName.trim()}
                            className="rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-xs font-medium text-roman-text-main transition-colors hover:border-roman-primary disabled:opacity-50"
                          >
                            + Criar
                          </button>
                        </div>
                      )}
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
                                {vendor.name}{vendor.contact ? ` · ${vendor.contact}` : ''}
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

                  <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Diretores envolvidos</label>
                      <span className="rounded-sm border border-roman-border bg-white px-2 py-0.5 text-[11px] text-roman-text-sub">
                        {selectedDirectors.length} selecionado(s)
                      </span>
                    </div>
                    {activeDirectors.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {activeDirectors.map(director => {
                          const selected = involvedDirectorIds.includes(director.id);
                          return (
                            <button
                              key={`involved-director-${director.id}`}
                              type="button"
                              onClick={() =>
                                setInvolvedDirectorIds(current =>
                                  selected ? current.filter(id => id !== director.id) : [...current, director.id]
                                )
                              }
                              className={`rounded-sm border px-2.5 py-1 text-xs transition-colors ${
                                selected
                                  ? 'border-roman-primary bg-roman-primary text-white'
                                  : 'border-roman-border bg-white text-roman-text-main hover:border-roman-primary'
                              }`}
                              disabled={isSending || !canEditQuickPanel}
                            >
                              {director.name || director.email}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-roman-text-sub">Sem diretores ativos cadastrados no momento.</div>
                    )}
                    <div className="mt-2 text-[11px] text-roman-text-sub">
                      Quando houver diretores selecionados, apenas eles recebem e visualizam aprovações desta OS.
                      Sem seleção, a OS segue sem notificações/fila da diretoria.
                    </div>
                  </div>

                  {activeTicket.status === TICKET_STATUS.NEW ? (
                    <div className="grid grid-cols-1 gap-2">
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
                        Recusar OS
                      </button>
                      </div>
                      {canManageStatus && (
                        <button
                          onClick={handleSaveQuickPanel}
                          disabled={isSending}
                          className="inline-flex items-center justify-center gap-2 rounded-sm border border-roman-border bg-white px-3 py-2 text-xs font-medium text-roman-text-main transition-colors hover:border-roman-primary disabled:opacity-60"
                        >
                          {isSending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                          Salvar painel
                        </button>
                      )}
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
                      {canManageStatus && ([TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED] as Ticket['status'][]).includes(activeTicket.status) && (
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
                    <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
                      <PropertyField label="Solicitante" value={activeTicket.requester} />
                      <PropertyField label="E-mail" value={activeTicket.requesterEmail || 'Não informado'} />
                      <PropertyField label="Local" value={activeTicket.sector} />
                      <PropertyField label="Detalhe do local" value={activeTicket.location || 'Não informado'} />
                      <PropertyField label="Sede" value={getTicketSiteLabel(activeTicket, catalogSites)} />
                      <PropertyField label="Status atual" value={activeTicket.status} />
                      <PropertyField
                        label="Diretoria"
                        value={
                          Array.isArray(activeTicket.directorEmails) && activeTicket.directorEmails.length > 0
                            ? activeTicket.directorEmails.join(', ')
                            : 'Não definida'
                        }
                      />
                      <PropertyField
                        label="Interessados (CC)"
                        value={
                          Array.isArray(activeTicket.requesterCcEmails) && activeTicket.requesterCcEmails.length > 0
                            ? activeTicket.requesterCcEmails.join(', ')
                            : 'Nenhum'
                        }
                      />
                    </div>
                    {recurrentLocationSummary.relatedTickets.length > 0 && (
                      <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-950">
                        <div className="font-serif text-[11px] font-semibold uppercase tracking-widest">Local recorrente</div>
                        <div className="mt-2 space-y-1 text-amber-900">
                          <div>{recurrentLocationSummary.openCount} OS abertas neste local</div>
                          <div>{recurrentLocationSummary.finalizedCount} OS concluídas/encerradas neste local</div>
                          {recurrentLocationSummary.latestTicket && (
                            <div>
                              Última ocorrência: {recurrentLocationSummary.latestTicket.id} em {formatDateTimeSafe(recurrentLocationSummary.latestTicket.time)}
                            </div>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {recurrentLocationSummary.relatedTickets.slice(0, 8).map(ticket => (
                            <button
                              key={`related-location-${ticket.id}`}
                              type="button"
                              onClick={() => setActiveTicketId(ticket.id)}
                              className="rounded-sm border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-950 transition-colors hover:border-amber-600"
                            >
                              {ticket.id}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
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
        <ThirdPartyModal
          isOpen={showThirdPartyModal}
          onClose={() => setShowThirdPartyModal(false)}
          isSending={isSending}
          canEdit={canEditQuickPanel}
          thirdPartyTag={thirdPartyTag}
          thirdPartyTagOptions={thirdPartyTagOptions}
          onSelectTag={tag => { setThirdPartyTag(tag); setThirdPartySelectDraftId(''); }}
          thirdPartySelectDraftId={thirdPartySelectDraftId}
          onSelectDraft={nextId => { setThirdPartySelectDraftId(nextId); if (!nextId) return; setSelectedThirdPartyIds(current => (current.includes(nextId) ? current : [...current, nextId])); }}
          filteredThirdParties={filteredThirdParties}
          selectedThirdParties={selectedThirdParties}
          onRemoveSelected={id => setSelectedThirdPartyIds(current => current.filter(vendorId => vendorId !== id))}
          customEmail={customEmail}
          onCustomEmailChange={setCustomEmail}
          newThirdPartyName={newThirdPartyName}
          onNewNameChange={setNewThirdPartyName}
          newThirdPartyEmail={newThirdPartyEmail}
          onNewEmailChange={setNewThirdPartyEmail}
          newThirdPartyContact={newThirdPartyContact}
          onNewContactChange={setNewThirdPartyContact}
          newThirdPartyTags={newThirdPartyTags}
          onToggleNewTag={tag => setNewThirdPartyTags(prev => (prev.some(item => item.toLowerCase() === tag.toLowerCase()) ? prev.filter(item => item.toLowerCase() !== tag.toLowerCase()) : [...prev, tag]))}
          newSharedTagDraft={newSharedTagDraft}
          onNewSharedTagDraftChange={setNewSharedTagDraft}
          newSharedTagSaving={newSharedTagSaving}
          onCreateSharedTag={() => void handleCreateSharedTagInline()}
          onCreateThirdParty={() => void handleCreateThirdParty()}
        />
      )}

      <ConfirmModal
        isOpen={showCancelTicketModal}
        onClose={() => {
          setShowCancelTicketModal(false);
          setPendingCancelTicketUpdates(null);
        }}
        onConfirm={handleConfirmCancelTicket}
        title={`Cancelar ${activeTicket.id}`}
        description="Informe o motivo do cancelamento. Esse texto ficará registrado no histórico da OS e será usado na comunicação com o solicitante."
        confirmText="Confirmar cancelamento"
        isDestructive
        requireReason
        isLoading={isSending}
      />

      {/* Delete Modal */}
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

      {statusEmailPrompt && (
        <ModalShell
          isOpen
          onClose={() => { statusEmailPrompt.resolve('cancel'); setStatusEmailPrompt(null); }}
          title="Avisar o solicitante?"
          description="Esta mudança de status é acompanhada pelo solicitante. Deseja notificá-lo por e-mail?"
          maxWidthClass="max-w-md"
          footer={(
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={() => { statusEmailPrompt.resolve('cancel'); setStatusEmailPrompt(null); }}
                className="rounded-sm border border-roman-border px-4 py-2 text-sm font-medium text-roman-text-sub transition-colors hover:bg-roman-bg"
              >
                Cancelar
              </button>
              <button
                onClick={() => { statusEmailPrompt.resolve('silent'); setStatusEmailPrompt(null); }}
                className="rounded-sm border border-roman-border px-4 py-2 text-sm font-medium text-roman-text-main transition-colors hover:bg-roman-bg"
              >
                Alterar sem avisar
              </button>
              <button
                onClick={() => { statusEmailPrompt.resolve('notify'); setStatusEmailPrompt(null); }}
                disabled={statusEmailPrompt.recipients.length === 0}
                className="rounded-sm bg-roman-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-roman-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Alterar e avisar solicitante
              </button>
            </div>
          )}
        >
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-sm border border-roman-border bg-roman-bg px-2 py-1 text-xs text-roman-text-sub">{statusEmailPrompt.from}</span>
              <span className="text-roman-text-sub">→</span>
              <span className="rounded-sm border border-roman-primary/40 bg-roman-primary/10 px-2 py-1 text-xs font-medium text-roman-primary">{statusEmailPrompt.to}</span>
            </div>
            {statusEmailPrompt.recipients.length > 0 ? (
              <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-2">
                <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">O e-mail vai para</div>
                <div className="mt-1 break-words text-roman-text-main">{statusEmailPrompt.recipients.join(', ')}</div>
              </div>
            ) : (
              <div className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                Esta OS não tem e-mail de solicitante — "avisar" não enviaria nada.
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {showQuotesModal && (
        <QuoteEditorProvider value={quoteEditor}>
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
                    : 'Informe de 2 a 5 cotações para enviar à diretoria.'}
                </p>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-sm font-medium">
                  {quoteRoundType === 'initial' ? `Rodada ${quoteInitialRoundIndex} · Orçamento Inicial` : `Aditivo ${quoteAdditiveIndex}`}
                </span>
              </div>

              {quoteRoundType === 'initial' && rejectedInitialRounds.length > 0 && (
                <div className="mb-6 rounded-sm border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-serif text-amber-950">Rodadas recusadas</h4>
                      <p className="text-xs text-amber-900">As rodadas anteriores ficam preservadas só para consulta. A área abaixo é exclusiva da nova rodada.</p>
                    </div>
                    <span className="rounded-sm border border-amber-300 bg-white px-2 py-1 text-[11px] text-amber-900">
                      Nova rodada: {quoteInitialRoundIndex}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {rejectedInitialRounds.map(round => (
                      <div key={`rejected-round-${round.roundIndex}`} className="rounded-sm border border-amber-300 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium text-amber-950">Rodada {round.roundIndex}</div>
                          <span className="rounded-sm border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] text-red-700">Recusada</span>
                        </div>
                        <div className="mt-2 space-y-2">
                          {round.quotes.map((quote, index) => (
                            <div key={`rejected-round-${round.roundIndex}-quote-${index}`} className="rounded-sm border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
                              <div className="font-medium text-stone-900">{quote.vendor || `Cotação ${index + 1}`}</div>
                              <div className="mt-1 text-xs text-stone-600">
                                Total: {quote.totalValue || quote.value || '-'} · Material: {quote.materialValue || '-'} · Mão de obra: {quote.laborValue || '-'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => document.getElementById('quote-editor-start')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="inline-flex items-center gap-2 rounded-sm border border-roman-primary bg-roman-primary/10 px-3 py-1.5 text-xs font-medium text-roman-primary hover:bg-roman-primary/15"
                >
                  <Plus size={12} />
                  Montar cotações
                </button>
                <button
                  type="button"
                  onClick={() => toggleQuoteMetaPanel('context')}
                  className="inline-flex items-center gap-2 rounded-sm border border-roman-border bg-roman-surface px-3 py-1.5 text-xs font-medium text-roman-text-main hover:bg-roman-bg"
                >
                  <ChevronDown size={12} className={`transition-transform ${showQuoteContextPanel ? 'rotate-180' : ''}`} />
                  {showQuoteContextPanel ? 'Ocultar contexto' : 'Mostrar contexto'}
                </button>
                <button
                  type="button"
                  onClick={() => toggleQuoteMetaPanel('history')}
                  className="inline-flex items-center gap-2 rounded-sm border border-roman-border bg-roman-surface px-3 py-1.5 text-xs font-medium text-roman-text-main hover:bg-roman-bg"
                >
                  <ChevronDown size={12} className={`transition-transform ${showQuoteHistoryPanel ? 'rotate-180' : ''}`} />
                  Base histórica
                </button>
                <button
                  type="button"
                  onClick={() => toggleQuoteMetaPanel('comparison')}
                  className="inline-flex items-center gap-2 rounded-sm border border-roman-border bg-roman-surface px-3 py-1.5 text-xs font-medium text-roman-text-main hover:bg-roman-bg"
                >
                  <ChevronDown size={12} className={`transition-transform ${showQuoteComparisonPanel ? 'rotate-180' : ''}`} />
                  Comparativo
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuoteDirectorInterests(current => !current)}
                  className="inline-flex items-center gap-2 rounded-sm border border-roman-border bg-roman-surface px-3 py-1.5 text-xs font-medium text-roman-text-main hover:bg-roman-bg"
                >
                  <Plus size={12} />
                  Adicionar interessados
                  {directorInterestedEmails.length > 0 && (
                    <span className="rounded-full bg-roman-primary px-1.5 py-0.5 text-[10px] text-white">
                      {directorInterestedEmails.length}
                    </span>
                  )}
                </button>
              </div>

              {showQuoteDirectorInterests && (
                <DirectorInterestsPanel
                  draft={directorInterestedDraft}
                  emails={directorInterestedEmails}
                  suggestions={directorEmailSuggestions}
                  onDraftChange={setDirectorInterestedDraft}
                  onAdd={() => addDirectorInterestedEmails(directorInterestedDraft)}
                  onAddSuggestion={email => setDirectorInterestedEmails(current => mergeEmails(current, [email]))}
                  onRemove={removeDirectorInterestedEmail}
                />
              )}

              <div className="mb-6 rounded-sm border border-roman-border bg-roman-surface p-4">
                {quoteRoundType === 'additive' && (
                  <div className="space-y-3">
                    <AdditiveReferenceCard
                      expanded={showAdditiveReference}
                      onToggle={() => setShowAdditiveReference(current => !current)}
                      approvedQuote={approvedInitialQuote}
                    />
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

              {showQuoteContextPanel && (
                <>
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

                  <ProposalHeaderForm value={proposalHeader} onChange={handleProposalHeaderChange} onCurrencyBlur={handleProposalCurrencyBlur} />

              {showQuoteHistoryPanel && (
                <QuoteHistoryPanel history={budgetHistory} servicePreference={persistedServicePreference} ticketId={activeTicket.id} />
              )}

                  <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
                    {quotes.map((quote, index) => (
                      <div key={`quote-total-${index}`} className="rounded-2xl border border-roman-border bg-roman-bg px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-roman-text-sub">
                          Fornecedor {index < 26 ? String.fromCharCode(65 + index) : index + 1}
                        </div>
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

              {showQuoteComparisonPanel && (
                  <QuoteComparisonPanel />
                )}
                </>
              )}

              <QuoteEditorTabs quotes={quotes} focus={quoteEditorFocus} onSelectFocus={setQuoteEditorFocus} onAddSlot={handleAddQuoteSlot} canAddSlot={quotes.length < getRoundMaxQuoteSlots(quoteRoundType)} />

              {quoteEditorFocus === 'all' ? (
                <QuoteConsolidatedView />
              ) : (
              <div className="grid grid-cols-1 gap-4 mb-6 items-start xl:grid-cols-1">
                {visibleQuoteEditors.map(({ quote, index: i }) => (
                  <div key={`quote-editor-${i}`} className="border border-roman-border rounded-sm p-4 bg-roman-bg flex flex-col self-start min-h-0">
                    <QuoteEditorCardHeader i={i} canRemoveSlot={quotes.length > getRoundMinQuoteSlots(quoteRoundType)} attachment={quoteAttachments[i]} handleRemoveQuoteSlot={handleRemoveQuoteSlot} handleQuoteAttachmentChange={handleQuoteAttachmentChange} />
                    <div className="space-y-3 flex-1">
                      <QuoteVendorFields quote={quote} i={i} persistedServicePreference={persistedServicePreference} preferredVendor={budgetHistory.preferredVendor} />
                      <QuoteItemsSection quote={quote} i={i} suggestedQuoteMaterials={suggestedQuoteMaterials} itemReferences={budgetHistory.itemReferences} />
                      {quoteAttachments[i] && (
                        <div className="text-[11px] text-roman-text-sub truncate">
                          PDF: {quoteAttachments[i]!.name}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              )}

        </ModalShell>
        </QuoteEditorProvider>
      )}

      {showContractDispatchModal && (
        <ContractDispatchModal
          isOpen={showContractDispatchModal}
          onClose={() => setShowContractDispatchModal(false)}
          isSending={isSending}
          onSend={() => void handleSendContractToDirector()}
          file={contractDispatchFile}
          onFileChange={file => setContractDispatchFile(file)}
          contractVendor={activeContract?.vendor || 'Não informado'}
          contractValue={activeContract?.value || 'Não informado'}
        />
      )}

      {/* Ações Preliminares Modal */}
      {showPrelimModal && (
        <PreliminaryActionsModal
          isOpen={showPrelimModal}
          onClose={() => setShowPrelimModal(false)}
          form={prelimForm}
          onToggleItem={handlePrelimFieldToggle}
          onFieldChange={handlePrelimFieldChange}
          onSaveChecklist={() => handleSavePreliminaryActions(false)}
          onCompleteAndStart={() => handleSavePreliminaryActions(true)}
          canComplete={arePreliminaryActionsReady(prelimForm) && !!prelimForm.plannedStartAt}
          summary={buildPreliminarySummary(buildPreliminaryActionsPayload(false))}
        />
      )}

      {showExecutionSetupModal && (
        <ExecutionSetupModal
          isOpen={showExecutionSetupModal}
          onClose={() => setShowExecutionSetupModal(false)}
          isSending={isSending}
          onConfirm={() => void handleConfirmExecutionStart()}
          paymentFlowParts={executionSetupForm.paymentFlowParts}
          measurementSheetUrl={executionSetupForm.measurementSheetUrl}
          notes={executionSetupForm.notes}
          onFieldChange={(field, value) => setExecutionSetupForm(prev => ({ ...prev, [field]: value }))}
          contractVendor={activeContract?.vendor || activeTicket.assignedTeam || 'Não definido'}
          contractValue={activeContract?.value || 'Não informado'}
          progressPercent={activeProgressPercent}
        />
      )}

      {showProgressModal && (
        <ProgressUpdateModal
          isOpen={showProgressModal}
          onClose={() => setShowProgressModal(false)}
          isSending={isSending}
          onSave={() => void handleSaveProgressUpdate()}
          grossAmount={progressUpdateForm.grossAmount}
          budgetSource={progressUpdateForm.budgetSource}
          notes={progressUpdateForm.notes}
          onGrossChange={value => setProgressUpdateForm(prev => ({ ...prev, grossAmount: value }))}
          onGrossBlur={() => setProgressUpdateForm(prev => ({ ...prev, grossAmount: normalizeCurrencyInput(prev.grossAmount) }))}
          onBudgetSourceChange={value => setProgressUpdateForm(prev => ({ ...prev, budgetSource: value }))}
          onNotesChange={value => setProgressUpdateForm(prev => ({ ...prev, notes: value }))}
          draftProgressPercent={draftProgressPercent}
          activeProgressPercent={activeProgressPercent}
          projectedAccumulatedGross={projectedAccumulatedGross}
          currentAccumulatedGross={currentAccumulatedGross}
          activeExpectedBaselineValue={activeExpectedBaselineValue}
          activeReleasedPercent={activeReleasedPercent}
          activeNextMilestonePercent={activeNextMilestonePercent}
          activeMilestones={activeMilestones}
          paymentFlowParts={activeTicket.executionProgress?.paymentFlowParts}
          files={progressReportFiles}
          fileInputRef={progressReportFileRef}
          onAddFiles={next => setProgressReportFiles(prev => [...prev, ...next])}
          onRemoveFile={index => setProgressReportFiles(prev => prev.filter((_, i) => i !== index))}
        />
      )}
    </div>
  );
}
