import React, { useState, useRef, useEffect, useMemo } from 'react';
import { CheckCircle, Loader2, FileText, Shield, List, Play, CheckSquare, Paperclip, Search, Filter, Clock, AlertCircle, User, Image as ImageIcon, ChevronDown, Plus, MoreHorizontal, Lock, Bold, Italic, ExternalLink, Copy, X, DollarSign } from 'lucide-react';
import { TicketListItem } from '../components/ui/TicketListItem';
import { PropertyField } from '../components/ui/PropertyField';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useApp } from '../context/AppContext';
import { useClickOutside } from '../hooks/useClickOutside';
import { InboxFilter, HistoryItem, PreliminaryActions, Quote, QuoteItem, Ticket } from '../types';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { notifyTicketPublicReply } from '../services/ticketEmail';
import { CatalogMaterial, CatalogRegion, CatalogServiceItem, CatalogSite, CatalogVendorPreference, fetchCatalog } from '../services/catalogApi';
import { DirectoryTeam, fetchDirectory } from '../services/directoryApi';
import { fetchProcurementData, saveQuotes } from '../services/procurementApi';
import { buildBudgetHistorySummary, formatBudgetHistoryValue } from '../utils/budgetHistory';
import { buildProcurementClassification } from '../utils/procurementClassification';
import { formatDistanceToNowSafe } from '../utils/date';
import { getTicketRegionLabel } from '../utils/ticketTerritory';

const FALLBACK_TEAMS: DirectoryTeam[] = [
  { id: 'construtora', name: 'Construtora', type: 'internal' },
  { id: 'informatica', name: 'Informática', type: 'internal' },
  { id: 'infra-compras', name: 'Infra - Compras', type: 'internal' },
  { id: 'infra-coordenacao', name: 'Infra - Coordenação', type: 'internal' },
  { id: 'infra-sede', name: 'Infra - Sede', type: 'internal' },
  { id: 'jy', name: 'JY', type: 'internal' },
  { id: 'marketing', name: 'Marketing', type: 'internal' },
  { id: 'metalurgica', name: 'Metalúrgica', type: 'internal' },
  { id: 'nao-especificado', name: 'Não especificado', type: 'internal' },
  { id: 'redes', name: 'Redes', type: 'internal' },
  { id: 'refrigeracao', name: 'Refrigeração', type: 'internal' },
  { id: 'fornecedor-externo', name: 'Fornecedor externo', type: 'external' },
];

const FALLBACK_CATALOG_MATERIALS: CatalogMaterial[] = [
  { id: 'tinta-acrilica', code: 'MAT-001', name: 'Tinta acrílica', unit: 'lata' },
  { id: 'abrasivo', code: 'MAT-002', name: 'Abrasivo / lixa', unit: 'un' },
  { id: 'massa-corrida', code: 'MAT-003', name: 'Massa corrida', unit: 'balde' },
  { id: 'telha-metalica', code: 'MAT-004', name: 'Telha metálica', unit: 'm²' },
  { id: 'tubo-pvc', code: 'MAT-006', name: 'Tubo PVC', unit: 'barra' },
  { id: 'luminaria-led', code: 'MAT-008', name: 'Luminária LED', unit: 'un' },
  { id: 'split-12000', code: 'MAT-012', name: 'Split 12.000 BTUs', unit: 'un' },
];

const FALLBACK_SERVICE_CATALOG: CatalogServiceItem[] = [
  { id: 'pintura-fachada', code: 'SRV-001', macroServiceId: 'coberta-fachada', name: 'Pintura de fachada', suggestedMaterialIds: ['tinta-acrilica', 'abrasivo', 'massa-corrida'] },
  { id: 'recuperacao-coberta', code: 'SRV-002', macroServiceId: 'coberta-fachada', name: 'Recuperação de coberta', suggestedMaterialIds: ['telha-metalica'] },
  { id: 'correcao-vazamento', code: 'SRV-005', macroServiceId: 'hidraulica', name: 'Correção de vazamento', suggestedMaterialIds: ['tubo-pvc'] },
  { id: 'troca-luminarias', code: 'SRV-006', macroServiceId: 'eletrica', name: 'Troca de luminárias', suggestedMaterialIds: ['luminaria-led'] },
  { id: 'instalacao-split', code: 'SRV-007', macroServiceId: 'climatizacao', name: 'Instalação de ar-condicionado split', suggestedMaterialIds: ['split-12000'] },
];

type QuoteDraft = {
  vendor: string;
  value: string;
  items: QuoteItem[];
};

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
    description: defaultDescription,
    materialId: null,
    materialName: null,
    unit: defaultUnit || null,
    quantity: null,
    unitPrice: null,
    totalPrice: null,
  };
}

function createEmptyQuoteDraft(): QuoteDraft {
  return {
    vendor: '',
    value: '',
    items: [createEmptyQuoteItem()],
  };
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

// Z7: Renderiza uma seção de filtro com checkboxes para uma dimensão
function renderFilterSection(
  label: string,
  dim: keyof InboxFilter,
  options: string[],
  inboxFilter: InboxFilter,
  setInboxFilter: (f: InboxFilter) => void
) {
  return (
    <div>
      <div className="px-4 py-2 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub border-b border-roman-border bg-roman-bg/50 flex justify-between items-center">
        <span>{label}</span>
        {inboxFilter[dim].length > 0 && (
          <button
            onClick={() => setInboxFilter({ ...inboxFilter, [dim]: [] })}
            className="text-roman-primary hover:underline normal-case tracking-normal font-sans text-[11px]"
          >
            Limpar
          </button>
        )}
      </div>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => {
            const current = inboxFilter[dim];
            const next = current.includes(opt) ? current.filter(v => v !== opt) : [...current, opt];
            setInboxFilter({ ...inboxFilter, [dim]: next });
          }}
          className={`w-full text-left px-4 py-2 text-[12px] hover:bg-roman-bg transition-colors flex items-center gap-2 ${inboxFilter[dim].includes(opt) ? 'text-roman-primary font-medium' : 'text-roman-text-main'}`}
        >
          <div className={`w-3 h-3 border rounded-sm flex items-center justify-center flex-shrink-0 ${inboxFilter[dim].includes(opt) ? 'bg-roman-primary border-roman-primary' : 'border-roman-border'}`}>
            {inboxFilter[dim].includes(opt) && <CheckSquare size={9} className="text-white" />}
          </div>
          {opt}
        </button>
      ))}
    </div>
  );
}

export function InboxView() {
  const {
    navigateTo,
    openAttachment,
    setTrackingTicketToken,
    activeTicketId,
    setActiveTicketId,
    inboxFilter,
    setInboxFilter,
    tickets,
    updateTicket,
    addTicket,
    currentUser,
  } = useApp();

  const [replyMode, setReplyMode] = useState<'public' | 'internal'>('internal');
  const [replyText, setReplyText] = useState('');
  const [techTeam, setTechTeam] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [teams, setTeams] = useState<DirectoryTeam[]>(FALLBACK_TEAMS);
  const [catalogRegions, setCatalogRegions] = useState<CatalogRegion[]>([]);
  const [catalogSites, setCatalogSites] = useState<CatalogSite[]>([]);
  const [catalogMaterials, setCatalogMaterials] = useState<CatalogMaterial[]>(FALLBACK_CATALOG_MATERIALS);
  const [serviceCatalog, setServiceCatalog] = useState<CatalogServiceItem[]>(FALLBACK_SERVICE_CATALOG);
  const [vendorPreferences, setVendorPreferences] = useState<CatalogVendorPreference[]>([]);
  const displayActor = currentUser?.name || 'Gestor';
  const displayActorLabel = currentUser?.role ? `${displayActor} (${currentUser.role})` : displayActor;

  const replyFileRef = useRef<HTMLInputElement>(null);
  const replyTextRef = useRef<HTMLTextAreaElement>(null);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);

  // Estado derivado: usa tickets do contexto (mutável)
  const hasTickets = tickets.length > 0;
  const activeTicket = tickets.find(t => t.id === activeTicketId) ?? tickets[0] ?? EMPTY_TICKET;
  const isClosed = !hasTickets || activeTicket.status === TICKET_STATUS.CLOSED || activeTicket.status === TICKET_STATUS.CANCELED;

  // Reseta os campos ao trocar de ticket
  useEffect(() => {
    setReplyText('');
    setTechTeam('');
    setCustomEmail('');
    setReplyFiles([]);
    if (replyFileRef.current) replyFileRef.current.value = '';
  }, [activeTicketId]);

  useEffect(() => {
    setPrelimForm(createPreliminaryFormState(activeTicket.preliminaryActions));
  }, [activeTicket.id, activeTicket.preliminaryActions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const directory = await fetchDirectory();
        if (!cancelled && directory.teams.length > 0) {
          setTeams(directory.teams.filter(team => team.active !== false));
        }
      } catch {
        if (!cancelled) {
          setTeams(FALLBACK_TEAMS);
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
          setCatalogMaterials(catalog.materials);
          setServiceCatalog(catalog.serviceCatalog);
          setVendorPreferences(catalog.vendorPreferences);
        }
      } catch {
        if (!cancelled) {
          setCatalogRegions([]);
          setCatalogSites([]);
          setCatalogMaterials(FALLBACK_CATALOG_MATERIALS);
          setServiceCatalog(FALLBACK_SERVICE_CATALOG);
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
        }
      } catch {
        if (!cancelled) {
          setStoredQuotesByTicket({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Z5: Registra mudança de equipe técnica direto no histórico do ticket
  const handleTechTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    const oldValue = techTeam || 'Não atribuído';
    setTechTeam(newValue);

    const item: HistoryItem = {
      id: crypto.randomUUID(),
      type: 'field_change',
      sender: 'Rafael (Gestor)',
      time: new Date(),
      field: 'Equipe Técnica',
      from: oldValue,
      to: newValue,
    };
    updateTicket(activeTicket.id, { history: [...activeTicket.history, item] });
  };

  const selectedTeam = teams.find(team => team.name === techTeam);
  const isExternalTeam = selectedTeam?.type === 'external';

  // Botão principal de ação: transição de status + registro no histórico
  const handleSend = () => {
    if (isSending) return;
    setIsSending(true);
    const now = new Date();
    const sender = 'Rafael (Gestor)';

    if (replyMode === 'internal') {
      const items: HistoryItem[] = [];
      let newStatus = activeTicket.status;

      if (activeTicket.status === TICKET_STATUS.NEW || activeTicket.status.includes('Aprovada na Triagem')) {
        newStatus = TICKET_STATUS.WAITING_TECH_OPINION;
        const target =
          isExternalTeam && customEmail
            ? customEmail
            : techTeam || 'Equipe Técnica';

        if (replyText.trim()) {
          items.push({ id: crypto.randomUUID(), type: 'system', sender, time: now, text: replyText.trim() });
        }
        items.push({
          id: crypto.randomUUID(),
          type: 'system',
          sender,
          time: new Date(now.getTime() + 1),
          text: `Parecer técnico solicitado para ${target}.`,
        });
      } else if (activeTicket.status === TICKET_STATUS.WAITING_TECH_OPINION) {
        newStatus = TICKET_STATUS.WAITING_SOLUTION_APPROVAL;
        if (replyText.trim()) {
          items.push({ id: crypto.randomUUID(), type: 'tech', sender, time: now, text: replyText.trim() });
        }
        items.push({
          id: crypto.randomUUID(),
          type: 'system',
          sender,
          time: new Date(now.getTime() + 1),
          text: 'Parecer consolidado e enviado para aprovação da Diretoria.',
        });
      } else if (replyText.trim()) {
        items.push({ id: crypto.randomUUID(), type: 'system', sender, time: now, text: replyText.trim() });
      }

      if (items.length > 0 || newStatus !== activeTicket.status) {
        updateTicket(activeTicket.id, { status: newStatus, history: [...activeTicket.history, ...items] });
      }
    } else {
      if (!replyText.trim()) {
        setIsSending(false);
        return;
      }
      const item: HistoryItem = { id: crypto.randomUUID(), type: 'tech', sender, time: now, text: replyText.trim() };
      updateTicket(activeTicket.id, { history: [...activeTicket.history, item] });
      void notifyTicketPublicReply(activeTicket, sender, replyText.trim());
    }

    setReplyText('');
    setReplyFiles([]);
    if (replyFileRef.current) replyFileRef.current.value = '';
    window.setTimeout(() => setIsSending(false), 400);
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

    setIsSending(true);
    const now = new Date();
    const preliminaryActions = buildPreliminaryActionsPayload(startExecution);
    const historyText = startExecution
      ? `Ações preliminares concluídas. Execução liberada com início previsto em ${formatShortDate(preliminaryActions.plannedStartAt)}.`
      : `Ações preliminares atualizadas. ${buildPreliminarySummary(preliminaryActions)}.`;

    const item: HistoryItem = {
      id: crypto.randomUUID(),
      type: 'system',
      sender: 'Rafael (Gestor)',
      time: now,
      text: historyText,
    };

    updateTicket(activeTicket.id, {
      status: startExecution ? TICKET_STATUS.IN_PROGRESS : activeTicket.status,
      preliminaryActions,
      history: [...activeTicket.history, item],
    });

    setShowPrelimModal(false);
    if (startExecution) {
      setToast('Execução liberada com checklist preliminar concluído.');
      setTimeout(() => setToast(null), 3000);
    }
    window.setTimeout(() => setIsSending(false), 500);
  };

  // Controle de Execução
  const handleStartExecution = () => {
    if (isSending) return;
    if (activeTicket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS) {
      setShowPrelimModal(true);
      return;
    }

    setIsSending(true);
    const preliminaryActions = activeTicket.preliminaryActions
      ? { ...activeTicket.preliminaryActions, actualStartAt: activeTicket.preliminaryActions.actualStartAt || new Date(), updatedAt: new Date() }
      : undefined;
    const item: HistoryItem = {
      id: crypto.randomUUID(), type: 'system', sender: 'Rafael (Gestor)',
      time: new Date(), text: 'Execução da obra iniciada.',
    };
    updateTicket(activeTicket.id, {
      status: TICKET_STATUS.IN_PROGRESS,
      preliminaryActions,
      history: [...activeTicket.history, item],
    });
    window.setTimeout(() => setIsSending(false), 500);
  };

  const handleSendForValidation = () => {
    if (isSending) return;
    setIsSending(true);
    const item: HistoryItem = {
      id: crypto.randomUUID(), type: 'system', sender: 'Rafael (Gestor)',
      time: new Date(), text: 'Serviço concluído. Aguardando validação do solicitante.',
    };
    updateTicket(activeTicket.id, {
      status: TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL,
      closureChecklist: {
        requesterApproved: activeTicket.closureChecklist?.requesterApproved ?? false,
        requesterApprovedBy: activeTicket.closureChecklist?.requesterApprovedBy || null,
        requesterApprovedAt: activeTicket.closureChecklist?.requesterApprovedAt || null,
        infrastructureApprovedByRafael: activeTicket.closureChecklist?.infrastructureApprovedByRafael ?? false,
        infrastructureApprovedByFernando: activeTicket.closureChecklist?.infrastructureApprovedByFernando ?? false,
        closureNotes: activeTicket.closureChecklist?.closureNotes || '',
        serviceStartedAt:
          activeTicket.closureChecklist?.serviceStartedAt ||
          activeTicket.preliminaryActions?.actualStartAt ||
          activeTicket.preliminaryActions?.plannedStartAt ||
          null,
        serviceCompletedAt: new Date(),
        closedAt: activeTicket.closureChecklist?.closedAt || null,
      },
      history: [...activeTicket.history, item],
    });
    window.setTimeout(() => setIsSending(false), 500);
  };

  const [isSending, setIsSending] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showMobileTicketList, setShowMobileTicketList] = useState(false);
  const [showMobileContext, setShowMobileContext] = useState(false);
  const [showQuotesModal, setShowQuotesModal] = useState(false);
  const [showPrelimModal, setShowPrelimModal] = useState(false);
  const [quoteAttachments, setQuoteAttachments] = useState<Array<File | null>>([null, null, null]);
  const [storedQuotesByTicket, setStoredQuotesByTicket] = useState<Record<string, Quote[]>>({});
  const [prelimForm, setPrelimForm] = useState<PreliminaryFormState>(createPreliminaryFormState());
  const [toast, setToast] = useState<string | null>(null);
  const isMobileOverlayOpen = showMobileTicketList || showMobileContext;
  const shouldLockBodyScroll = isMobileOverlayOpen || showQuotesModal || showPrelimModal;

  useEffect(() => {
    function handleEsc(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (showQuotesModal) setShowQuotesModal(false);
      if (showPrelimModal) setShowPrelimModal(false);
      if (showActionsMenu) setShowActionsMenu(false);
      if (showFilterMenu) setShowFilterMenu(false);
      if (showMobileTicketList) setShowMobileTicketList(false);
      if (showMobileContext) setShowMobileContext(false);
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [showQuotesModal, showPrelimModal, showActionsMenu, showFilterMenu, showMobileTicketList, showMobileContext]);

  useEffect(() => {
    setShowActionsMenu(false);
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
  const filterMenuRef = useClickOutside<HTMLDivElement>(() => setShowFilterMenu(false));
  const actionsMenuRef = useClickOutside<HTMLDivElement>(() => setShowActionsMenu(false));

  const [quotes, setQuotes] = useState<QuoteDraft[]>([
    createEmptyQuoteDraft(),
    createEmptyQuoteDraft(),
    createEmptyQuoteDraft(),
  ]);

  // Reseta cotações ao trocar de ticket
  useEffect(() => {
    const currentQuotes = storedQuotesByTicket[activeTicketId] || [];
    const fallbackQuotes = [createEmptyQuoteDraft(), createEmptyQuoteDraft(), createEmptyQuoteDraft()];
    const nextQuotes =
      currentQuotes.length > 0
        ? [0, 1, 2].map(index => ({
            vendor: currentQuotes[index]?.vendor || '',
            value: currentQuotes[index]?.value || '',
            items:
              currentQuotes[index]?.items?.length
                ? currentQuotes[index].items!.map(item => ({
                    id: item.id || crypto.randomUUID(),
                    description: item.description || '',
                    materialId: item.materialId || null,
                    materialName: item.materialName || null,
                    unit: item.unit || null,
                    quantity: item.quantity ?? null,
                    unitPrice: item.unitPrice || null,
                    totalPrice: item.totalPrice || null,
                  }))
                : [createEmptyQuoteItem()],
          }))
        : fallbackQuotes;
    setQuotes(nextQuotes);
    setQuoteAttachments([null, null, null]);
  }, [activeTicketId, storedQuotesByTicket]);

  // useMemo evita recalcular em todo re-render
  const filteredTickets = useMemo(() => tickets.filter(t => {
    if (inboxFilter.status.length > 0 && !inboxFilter.status.includes(t.status)) return false;
    if (inboxFilter.priority.length > 0 && t.priority && !inboxFilter.priority.includes(t.priority)) return false;
    if (inboxFilter.region.length > 0 && !inboxFilter.region.includes(getTicketRegionLabel(t, catalogRegions, catalogSites))) return false;
    if (inboxFilter.type.length > 0 && !inboxFilter.type.includes(t.type)) return false;
    return true;
  }).sort((a, b) => {
    const isAUrgentCorrective = a.type === 'Corretiva' && a.priority === 'Urgente';
    const isBUrgentCorrective = b.type === 'Corretiva' && b.priority === 'Urgente';
    if (isAUrgentCorrective && !isBUrgentCorrective) return -1;
    if (!isAUrgentCorrective && isBUrgentCorrective) return 1;
    return b.time.getTime() - a.time.getTime();
  }), [tickets, inboxFilter, catalogRegions, catalogSites]);

  const regionFilterOptions = useMemo(() => {
    const catalogOptions = catalogRegions.map(region => region.name);
    const ticketOptions = tickets.map(ticket => getTicketRegionLabel(ticket, catalogRegions, catalogSites));
    return [...new Set([...catalogOptions, ...ticketOptions].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [catalogRegions, catalogSites, tickets]);

  const budgetHistory = useMemo(
    () => buildBudgetHistorySummary(activeTicket, tickets, storedQuotesByTicket),
    [activeTicket, tickets, storedQuotesByTicket]
  );

  const suggestedQuoteMaterials = useMemo(() => {
    const service = serviceCatalog.find(item => item.id === activeTicket.serviceCatalogId);
    if (!service?.suggestedMaterialIds?.length) return [];
    return service.suggestedMaterialIds
      .map(materialId => catalogMaterials.find(material => material.id === materialId))
      .filter((value): value is CatalogMaterial => Boolean(value));
  }, [activeTicket.serviceCatalogId, catalogMaterials, serviceCatalog]);

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

  if (activeTicket.status === TICKET_STATUS.NEW || activeTicket.status.includes('Aprovada na Triagem')) {
    internalTabLabel = 'Solicitar Parecer Técnico';
    internalPlaceholder = 'Descreva a solicitação para a equipe técnica...';
    internalButtonText = 'Avançar: Aguardando Parecer';
    internalActionText = `Ação: Disparar e-mail para ${isExternalTeam && customEmail ? customEmail : techTeam || 'Equipe Técnica'}`;
  } else if (activeTicket.status === TICKET_STATUS.WAITING_TECH_OPINION) {
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
    newQuotes[index][field] = value;
    setQuotes(newQuotes);
  };

  const recalculateQuoteValue = (draft: QuoteDraft) => {
    const computedTotal = draft.items.reduce((sum, item) => {
      const totalPrice = item.totalPrice ? parseCurrencyInput(item.totalPrice) : 0;
      if (totalPrice > 0) return sum + totalPrice;
      const quantity = item.quantity ?? 0;
      const unitPrice = item.unitPrice ? parseCurrencyInput(item.unitPrice) : 0;
      return sum + quantity * unitPrice;
    }, 0);

    return {
      ...draft,
      value: computedTotal > 0 ? formatCurrencyInput(computedTotal) : draft.value,
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
            nextItem.unit = material?.unit || item.unit || null;
            if (!nextItem.description) {
              nextItem.description = material?.name || '';
            }
          }
          return nextItem;
        });
        return recalculateQuoteValue({ ...quote, items });
      })
    );
  };

  const handleAddQuoteItem = (quoteIndex: number) => {
    setQuotes(current =>
      current.map((quote, index) =>
        index === quoteIndex ? { ...quote, items: [...quote.items, createEmptyQuoteItem(activeTicket.serviceCatalogName || '', suggestedQuoteMaterials[0]?.unit || '')] } : quote
      )
    );
  };

  const handleRemoveQuoteItem = (quoteIndex: number, itemId: string) => {
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
    const filled = quotes.filter(q => q.vendor.trim() !== '' && q.value.trim() !== '');
    if (filled.length < 3) {
      setToast('Erro: Preencha os 3 orçamentos antes de enviar.');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setIsSending(true);
    setTimeout(async () => {
      const preferredVendorName = persistedServicePreference?.vendor
        ? persistedServicePreference.vendor.trim().toLowerCase()
        : budgetHistory.preferredVendor?.vendor
          ? budgetHistory.preferredVendor.vendor.trim().toLowerCase()
          : null;
      const recommendedIndex = preferredVendorName
        ? quotes.findIndex(quote => quote.vendor.trim().toLowerCase() === preferredVendorName)
        : 0;
      const nextQuotes: Quote[] = quotes.map((quote, index) => ({
        id: `quote-${index + 1}`,
        vendor: quote.vendor.trim(),
        value: quote.value.trim(),
        recommended: index === (recommendedIndex >= 0 ? recommendedIndex : 0),
        status: 'pending',
        attachmentName: quoteAttachments[index]?.name || null,
        items: quote.items
          .map(item => ({
            ...item,
            description: String(item.description || '').trim(),
            unit: item.unit ? String(item.unit).trim() : null,
            materialName: item.materialName ? String(item.materialName).trim() : null,
            unitPrice: item.unitPrice ? String(item.unitPrice).trim() : null,
            totalPrice: item.totalPrice ? String(item.totalPrice).trim() : null,
          }))
          .filter(item => item.description || item.totalPrice || item.unitPrice || item.quantity),
      }));
      try {
        await saveQuotes(activeTicket.id, nextQuotes, buildProcurementClassification(activeTicket));
      } catch {
        // Mantém o fluxo local mesmo se a API não estiver disponível no ambiente atual.
      }
      setStoredQuotesByTicket(prev => ({ ...prev, [activeTicket.id]: nextQuotes }));
      const historyItem: HistoryItem = {
        id: crypto.randomUUID(),
        type: 'system',
        sender: 'Rafael (Gestor)',
        time: new Date(),
        text: 'Orçamentos consolidados e enviados para aprovação da Diretoria.',
      };
      updateTicket(activeTicket.id, {
        status: TICKET_STATUS.WAITING_BUDGET_APPROVAL,
        history: [...activeTicket.history, historyItem],
      });
      setIsSending(false);
      setToast('Orçamentos enviados para a Diretoria com sucesso!');
      setTimeout(() => setToast(null), 3000);
    }, 1500);
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
    setTrackingTicketToken(activeTicket.trackingToken);
    navigateTo('tracking');
    setShowActionsMenu(false);
    setShowMobileContext(false);
  };

  const getNextTicketNumber = () => {
    return tickets.reduce((max, t) => {
      const n = parseInt(t.id.replace('OS-', ''), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0) + 1;
  };

  const handleDuplicateTicket = () => {
    const nextNum = getNextTicketNumber();
    const newId = `OS-${String(nextNum).padStart(4, '0')}`;
    const newToken = `trk_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date();

    const duplicated: Ticket = {
      ...activeTicket,
      id: newId,
      trackingToken: newToken,
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

    updateTicket(activeTicket.id, {
      history: [
        ...activeTicket.history,
        {
          id: crypto.randomUUID(),
          type: 'system',
          sender: 'Rafael (Gestor)',
          time: now,
          text: `OS duplicada para ${newId}.`,
        },
      ],
    });

    addTicket(duplicated);
    setActiveTicketId(newId);
    setShowActionsMenu(false);
    setToast(`OS ${activeTicket.id} duplicada como ${newId}.`);
    setTimeout(() => setToast(null), 3000);
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
          sender: 'Rafael (Gestor)',
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
    updateTicket(activeTicket.id, {
      status: TICKET_STATUS.IN_PROGRESS,
      history: [
        ...activeTicket.history,
        {
          id: crypto.randomUUID(),
          type: 'system',
          sender: 'Rafael (Gestor)',
          time: new Date(),
          text: 'OS reaberta pelo gestor para continuação do atendimento.',
        },
      ],
    });
    setShowActionsMenu(false);
    setToast(`OS ${activeTicket.id} reaberta.`);
    setTimeout(() => setToast(null), 3000);
  };

  // Z7: active chips
  const activeChips: { dim: keyof typeof inboxFilter; value: string }[] = (
    ['status', 'priority', 'region', 'type'] as (keyof typeof inboxFilter)[]
  ).flatMap(dim => inboxFilter[dim].map(value => ({ dim, value })));

  const removeChip = (dim: keyof typeof inboxFilter, value: string) => {
    setInboxFilter({ ...inboxFilter, [dim]: inboxFilter[dim].filter(v => v !== value) });
  };

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* Toast */}
      {toast && (
        <div className={`absolute top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-sm shadow-lg flex items-center gap-3 z-[100] animate-in slide-in-from-top-4 fade-in ${toast.includes('Erro') ? 'bg-red-800 text-white' : 'bg-green-800 text-white'}`}>
          {toast.includes('Erro') ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span className="font-medium text-sm">{toast}</span>
        </div>
      )}

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
      <div id="ticket-list-drawer" className={`fixed md:static inset-y-0 left-0 z-40 w-[88vw] max-w-96 md:w-[23rem] bg-roman-surface border-r border-roman-border flex flex-col shadow-[1px_0_5px_rgba(0,0,0,0.02)] transition-transform duration-200 ${showMobileTicketList ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="border-b border-roman-border px-4 py-4 bg-gradient-to-b from-roman-bg to-roman-surface">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-[18px] font-semibold tracking-wide text-roman-text-main">Caixa de Entrada</h2>
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

          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.15)]">
              <div className="text-[10px] uppercase tracking-widest text-amber-700">Novas</div>
              <div className="text-lg font-semibold text-amber-900">{tickets.filter(t => t.status === TICKET_STATUS.NEW).length}</div>
            </div>
            <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Orçamento</div>
              <div className="text-lg font-semibold text-roman-text-main">{tickets.filter(t => t.status === TICKET_STATUS.WAITING_BUDGET).length}</div>
            </div>
            <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Execução</div>
              <div className="text-lg font-semibold text-roman-text-main">{tickets.filter(t => t.status === TICKET_STATUS.IN_PROGRESS).length}</div>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="p-3 border-b border-roman-border bg-roman-bg/50">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
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
                <option value="">Todos os status</option>
                <option value={TICKET_STATUS.NEW}>Novas OS ({tickets.filter(t => t.status === TICKET_STATUS.NEW).length})</option>
                <option value={TICKET_STATUS.WAITING_BUDGET}>Aguardando orçamento ({tickets.filter(t => t.status === TICKET_STATUS.WAITING_BUDGET).length})</option>
                <option value={TICKET_STATUS.IN_PROGRESS}>Em execução ({tickets.filter(t => t.status === TICKET_STATUS.IN_PROGRESS).length})</option>
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-roman-text-sub" />
            </div>
            <button
              onClick={() => setInboxFilter({ status: [], priority: [], region: [], type: [] })}
              className="shrink-0 rounded-sm border border-roman-border px-3 py-2 text-sm font-medium text-roman-text-sub transition-colors hover:bg-roman-border-light hover:text-roman-text-main"
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
        <div className="flex-1 overflow-y-auto">
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
                viewingBy={ticket.viewingBy}
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
      <div className="flex-1 flex flex-col min-w-0">
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
        <header className="h-12 bg-roman-surface border-b border-roman-border flex items-center px-2">
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
            <div className="h-full px-4 border-r border-roman-border flex items-center gap-2 bg-roman-bg border-t-2 border-t-roman-primary font-medium">
              <span className="w-2 h-2 rounded-full bg-roman-primary"></span>
              <span className="font-serif italic text-roman-text-sub mr-1">#{activeTicket.id}</span>
              {activeTicket.subject.length > 20
                ? `${activeTicket.subject.substring(0, 20)}…`
                : activeTicket.subject}
            </div>
            <button onClick={() => navigateTo('public-form')} className="h-full px-4 border-r border-roman-border flex items-center gap-2 hover:bg-roman-bg cursor-pointer text-roman-text-sub">
              <Plus size={16} />
              <span className="font-serif">Nova OS</span>
            </button>
          </div>
          <div className="ml-auto flex items-center gap-3 px-4 relative">
            <div className="hidden md:flex items-center gap-2 mr-4 text-xs text-roman-text-sub">
              <User size={14} />
              <span>Visualizando como: <strong>{displayActorLabel}</strong></span>
            </div>
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={`transition-colors ${showFilterMenu || Object.values(inboxFilter).some(arr => (arr as string[]).length > 0) ? 'text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}
              title="Filtros compostos"
              aria-label="Filtros compostos"
              aria-expanded={showFilterMenu}
            >
              <Filter size={18} />
            </button>
            {showFilterMenu && (
              <div ref={filterMenuRef} className="absolute top-8 right-10 w-72 bg-roman-surface border border-roman-border shadow-xl rounded-sm z-20 max-h-[500px] overflow-y-auto">
                <div className="px-4 py-3 border-b border-roman-border flex justify-between items-center bg-roman-bg sticky top-0">
                  <span className="text-xs font-serif font-semibold text-roman-text-main">Filtros Compostos</span>
                  <button
                    onClick={() => setInboxFilter({ status: [], priority: [], region: [], type: [] })}
                    className="text-[11px] text-roman-primary hover:underline font-medium"
                  >
                    Limpar todos
                  </button>
                </div>
                                {renderFilterSection('Status', 'status', [
                  TICKET_STATUS.NEW, TICKET_STATUS.WAITING_TECH_OPINION, TICKET_STATUS.WAITING_SOLUTION_APPROVAL,
                  TICKET_STATUS.WAITING_BUDGET, TICKET_STATUS.WAITING_BUDGET_APPROVAL,
                  TICKET_STATUS.WAITING_CONTRACT_APPROVAL, TICKET_STATUS.WAITING_PRELIM_ACTIONS,
                  TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL, TICKET_STATUS.WAITING_PAYMENT, TICKET_STATUS.CLOSED,
                ], inboxFilter, setInboxFilter)}
                {renderFilterSection('Prioridade', 'priority', ['Urgente', 'Alta', 'Normal', 'Trivial'], inboxFilter, setInboxFilter)}
                {renderFilterSection('Região', 'region', regionFilterOptions, inboxFilter, setInboxFilter)}
                {renderFilterSection('Tipo', 'type', ['Corretiva', 'Preventiva', 'Melhoria'], inboxFilter, setInboxFilter)}
              </div>
            )}
            <Search size={18} className="text-roman-text-sub" />
          </div>
        </header>

        {/* Ticket Content Area */}
        <div className="flex-1 flex overflow-hidden">

          {/* Conversation Thread */}
          <div className="flex-1 flex flex-col bg-roman-bg overflow-y-auto">

            {/* Ticket Header */}
            <div className="bg-roman-surface p-6 border-b border-roman-border">
              <div className="flex items-start justify-between mb-4">
                <h1 className="text-3xl font-serif font-medium text-roman-text-main">{activeTicket.subject}</h1>
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
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-roman-text-sub font-serif italic text-sm">
                <StatusBadge status={activeTicket.status} />
                <span>via Formulário do Sistema</span>
                <span>{formatDistanceToNowSafe(activeTicket.time)}</span>
                <button onClick={() => openAttachment(`Fotos: ${activeTicket.subject}`, 'image')} className="ml-auto text-roman-primary hover:underline flex items-center gap-1 not-italic font-medium text-xs">
                  <ImageIcon size={14} /> Ver Fotos Anexadas
                </button>
              </div>
            </div>

            {/* Messages — ordenados cronologicamente (mais antigo em cima) */}
            <div className="p-6 space-y-6 flex-1">
              {[...activeTicket.history]
                .sort((a, b) => a.time.getTime() - b.time.getTime())
                .map((item, index) => {
                  if (item.type === 'system') {
                    return (
                      <div key={index} className="flex gap-4 justify-center">
                        <div className="bg-roman-border-light/50 border border-roman-border rounded-full px-4 py-1 text-xs text-roman-text-sub font-serif italic flex items-center gap-2">
                          <Clock size={12} /> {item.text}
                        </div>
                      </div>
                    );
                  }

                  if (item.type === 'field_change') {
                    return (
                      <div key={index} className="flex gap-4 justify-center">
                        <div className="bg-roman-bg border border-roman-border rounded-sm px-3 py-1 text-[11px] text-roman-text-sub font-mono flex items-center gap-2">
                          <span className="font-semibold">{item.sender}</span> alterou
                          <span className="font-medium bg-roman-surface px-1 rounded border border-roman-border">{item.field}</span>
                          de <span className="line-through opacity-70">{item.from}</span>
                          para <span className="font-medium text-roman-text-main">{item.to}</span>
                          <span className="text-[10px] opacity-50 ml-1">{formatDistanceToNowSafe(item.time)}</span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={index} className="flex gap-4">
                      <div className="w-10 h-10 rounded-sm bg-roman-border-light text-roman-text-main border border-roman-border flex items-center justify-center font-serif text-lg shrink-0">
                        {item.sender?.charAt(0) || 'U'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-semibold text-[14px]">{item.sender}</span>
                          <span className="text-roman-text-sub text-xs font-serif italic">
                            {formatDistanceToNowSafe(item.time)}
                          </span>
                        </div>
                        <div className="bg-roman-surface border border-roman-border rounded-sm p-5 text-[14px] leading-relaxed shadow-sm">
                          {item.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Reply Box */}
            <div className="p-6 pt-0 mt-auto">
              <div className={`border rounded-sm overflow-hidden shadow-sm transition-colors ${replyMode === 'internal' ? 'border-roman-parchment-border bg-roman-parchment' : 'border-roman-border bg-roman-surface'}`}>
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
                </div>

                {/* Formatting Toolbar */}
                <div className={`flex items-center gap-2 p-2 border-b border-roman-border/50 text-roman-text-sub ${isClosed ? 'opacity-50 pointer-events-none' : ''}`}>
                  <button onClick={() => applyFormatting('bold')} className="p-1 hover:bg-black/5 rounded" disabled={isClosed}><Bold size={16} /></button>
                  <button onClick={() => applyFormatting('italic')} className="p-1 hover:bg-black/5 rounded" disabled={isClosed}><Italic size={16} /></button>
                  <button onClick={() => applyFormatting('list')} className="p-1 hover:bg-black/5 rounded" disabled={isClosed}><List size={16} /></button>
                  <div className="w-px h-4 bg-roman-border mx-1"></div>
                  <button
                    onClick={() => replyFileRef.current?.click()}
                    className={`p-1 hover:bg-black/5 rounded relative ${replyFiles.length > 0 ? 'text-roman-primary' : ''}`}
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
                  placeholder={isClosed ? 'Esta OS está encerrada e não aceita novos comentários.' : (replyMode === 'internal' ? internalPlaceholder : 'Mensagem para o solicitante...')}
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
                <div className="p-3 border-t border-roman-border/50 flex justify-between items-center bg-black/5">
                  <div className="text-xs text-roman-text-sub font-serif italic">
                    {replyMode === 'internal' ? internalActionText : 'Ação: Notificar solicitante por e-mail'}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setReplyText('');
                        setReplyFiles([]);
                        if (replyFileRef.current) replyFileRef.current.value = '';
                      }}
                      className="px-4 py-1.5 text-roman-text-sub hover:bg-black/5 rounded font-medium transition-colors disabled:opacity-50"
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
                        {isSending ? 'Enviando...' : replyMode === 'internal' ? internalButtonText : 'Enviar Mensagem'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Context Panel (Right Sidebar) */}
          <aside id="context-drawer" className={`fixed md:static inset-y-0 right-0 z-40 w-[86vw] max-w-80 md:w-80 bg-roman-surface border-l border-roman-border flex flex-col transition-transform duration-200 ${showMobileContext ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
            <div className="h-12 border-b border-roman-border flex items-center justify-between px-4 font-serif text-sm tracking-widest uppercase font-semibold text-roman-text-main">
              <span>Dados da OS</span>
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
            <div className="p-4 space-y-5 overflow-y-auto">
              <PropertyField label="Status Atual" value={activeTicket.status} highlight />

              {/* PUBLIC LINK BUTTON */}
              <div className="flex gap-2">
                <button
                  onClick={handleCopyLink}
                  className="flex-1 flex items-center justify-center px-3 py-2 bg-roman-bg border border-roman-border rounded-sm hover:border-roman-primary/50 transition-colors group gap-2 text-roman-text-main font-medium text-[13px]"
                  title="Copiar link seguro para o solicitante"
                >
                  <Copy size={14} className="text-roman-text-sub group-hover:text-roman-primary" />
                  Copiar Link
                </button>
                <button
                  onClick={handleOpenTracking}
                  className="px-3 py-2 bg-roman-bg border border-roman-border rounded-sm hover:border-roman-primary/50 transition-colors group text-roman-text-sub hover:text-roman-primary"
                  title="Visualizar como solicitante"
                >
                  <ExternalLink size={14} />
                </button>
              </div>

              <PropertyField label="Tipo de Manutenção" value={activeTicket.type} />
              {activeTicket.macroServiceName && <PropertyField label="Macroserviço" value={activeTicket.macroServiceName} />}
              {activeTicket.serviceCatalogName && <PropertyField label="Serviço" value={activeTicket.serviceCatalogName} />}
              <PropertyField label="Região" value={activeTicket.region} />
              <PropertyField label="Sede" value={activeTicket.sede} />
              <PropertyField label="Setor" value={activeTicket.sector} />

              <div className="pt-4 border-t border-roman-border">
                <div className="mb-4">
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Responsável (Técnico)</label>
                  <select
                    value={techTeam}
                    onChange={handleTechTeamChange}
                    className="w-full border border-roman-primary/50 rounded-sm px-3 py-2 bg-roman-primary/5 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isClosed}
                  >
                    <option value="">Selecione a Equipe...</option>
                    {teams.map(team => (
                      <option key={team.id} value={team.name}>{team.name}</option>
                    ))}
                  </select>
                </div>

                {isExternalTeam && (
                  <div className="mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">E-mail do Fornecedor</label>
                    <input
                      type="email"
                      value={customEmail}
                      onChange={e => setCustomEmail(e.target.value)}
                      placeholder="fornecedor@email.com"
                      className="w-full border border-roman-primary/50 rounded-sm px-3 py-2 bg-roman-primary/5 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isClosed}
                    />
                  </div>
                )}
              </div>

              {/* BUDGETS SECTION */}
              {(activeTicket.status.includes('Orçamento') || activeTicket.status.includes('Cotação')) && (
                <div className="pt-4 border-t border-roman-border">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-bold">Gestão de Orçamentos</h4>
                    <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-sm font-medium">Rodada 1</span>
                  </div>
                  <button
                    onClick={() => setShowQuotesModal(true)}
                    className="w-full bg-roman-bg border border-roman-border hover:border-roman-primary text-roman-text-main py-3 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2 group"
                  >
                    <DollarSign size={16} className="text-roman-text-sub group-hover:text-roman-primary" />
                    Gerenciar Cotações ({quotes.filter(q => q.vendor && q.value).length}/3)
                  </button>
                </div>
              )}

              {/* EXECUTION CONTROL — só aparece quando há ações relevantes */}
              {(activeTicket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS || activeTicket.status === TICKET_STATUS.IN_PROGRESS || activeTicket.status === TICKET_STATUS.WAITING_PAYMENT || activeTicket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL || activeTicket.status === TICKET_STATUS.CLOSED) && (
                <div className="pt-4 border-t border-roman-border">
                  <h4 className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-bold mb-3">Controle de Execução</h4>
                  {activeTicket.preliminaryActions && (
                    <div className="mb-3 rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub space-y-1">
                      <div className="font-medium text-roman-text-main">Resumo das preliminares</div>
                      <div>{buildPreliminarySummary(activeTicket.preliminaryActions)}</div>
                      <div>Início previsto: {formatShortDate(activeTicket.preliminaryActions.plannedStartAt)}</div>
                      <div>Material previsto: {formatShortDate(activeTicket.preliminaryActions.materialEta)}</div>
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
                        <Play size={14} /> {activeTicket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS ? 'Revisar Checklist para Início' : 'Iniciar Execução da Obra'}
                      </button>
                    )}

                    {activeTicket.status === TICKET_STATUS.IN_PROGRESS && (
                      <button
                        onClick={handleSendForValidation}
                        className="w-full bg-roman-sidebar hover:bg-stone-900 text-white py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2"
                      >
                        <CheckSquare size={14} /> Enviar para Validação (Solicitante)
                      </button>
                    )}

                    {(activeTicket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL || activeTicket.status === TICKET_STATUS.WAITING_PAYMENT || activeTicket.status === TICKET_STATUS.CLOSED) && activeTicket.closureChecklist && (
                      <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub space-y-1">
                        <div className="font-medium text-roman-text-main">Checklist de encerramento</div>
                        <div>Solicitante: {activeTicket.closureChecklist.requesterApproved ? 'confirmado' : 'pendente'}</div>
                        <div>Infra Rafael: {activeTicket.closureChecklist.infrastructureApprovedByRafael ? 'confirmado' : 'pendente'}</div>
                        <div>Infra Fernando: {activeTicket.closureChecklist.infrastructureApprovedByFernando ? 'confirmado' : 'pendente'}</div>
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
              )}

            </div>
          </aside>
        </div>
          </>
        )}
      </div>

      {/* Quotes Modal */}
      {showQuotesModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowQuotesModal(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Gestão de orçamentos"
        >
          <div className="bg-roman-surface border border-roman-border rounded-sm shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-roman-border bg-roman-bg">
              <h3 className="font-serif text-lg text-roman-text-main font-medium">Gestão de Orçamentos</h3>
              <button onClick={() => setShowQuotesModal(false)} className="text-roman-text-sub hover:text-roman-text-main"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <p className="text-sm text-roman-text-sub">Preencha os dados dos 3 orçamentos obrigatórios para enviar para aprovação da diretoria.</p>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-sm font-medium">Rodada 1</span>
              </div>

              {(activeTicket.macroServiceName || activeTicket.serviceCatalogName) && (
                <div className="mb-6 rounded-sm border border-roman-primary/20 bg-roman-primary/5 px-4 py-3 text-sm text-roman-text-main">
                  <div className="font-medium">Classificação da OS</div>
                  <div className="mt-1 text-roman-text-sub">
                    {activeTicket.macroServiceName || 'Sem macroserviço'} {activeTicket.serviceCatalogName ? `· ${activeTicket.serviceCatalogName}` : ''}
                  </div>
                </div>
              )}

              <div className="mb-6 rounded-sm border border-roman-border bg-roman-bg p-4">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h4 className="text-sm font-serif text-roman-text-main">Base historica (24 meses)</h4>
                    <p className="text-xs text-roman-text-sub">
                      {budgetHistory.comparableTicketCount > 0
                        ? `${budgetHistory.comparableTicketCount} OS similares encontradas para comparacao.`
                        : 'Sem base historica suficiente para comparar esta OS.'}
                    </p>
                  </div>
                  <div className="text-xs text-roman-text-sub">
                    Termos base: {budgetHistory.basisTerms.length > 0 ? budgetHistory.basisTerms.join(', ') : 'não definidos'}
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
                    <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Ultimo comparavel</div>
                    <div className="mt-1 text-sm font-medium text-roman-text-main">{budgetHistory.latestComparableValueLabel ?? '-'}</div>
                    <div className="text-[11px] text-roman-text-sub">{budgetHistory.latestComparableVendor ?? 'Sem fornecedor'}</div>
                  </div>
                  <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
                    <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Referencias</div>
                    <div className="mt-1 text-lg font-serif text-roman-text-main">{budgetHistory.comparableQuoteCount}</div>
                    <div className="text-[11px] text-roman-text-sub">cotacoes aproveitaveis</div>
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
                            {item.vendor} · {item.sede} / {item.region} · {formatDistanceToNowSafe(item.date)}
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

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
                {[0, 1, 2].map(i => (
                  <div key={i} className="border border-roman-border rounded-sm p-4 bg-roman-bg flex flex-col">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-roman-border/50">
                      <span className="text-sm font-medium text-roman-text-main">Cotação {i + 1}</span>
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
                    <div className="space-y-3 flex-1">
                      <div>
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Fornecedor</label>
                        <input
                          type="text"
                          placeholder="Nome da Empresa"
                          value={quotes[i].vendor}
                          onChange={e => handleQuoteChange(i, 'vendor', e.target.value)}
                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                        />
                        {(persistedServicePreference || budgetHistory.preferredVendor) && quotes[i].vendor.trim() && (
                          <div className={`mt-1 text-[11px] ${quotes[i].vendor.trim().toLowerCase() === String((persistedServicePreference || budgetHistory.preferredVendor)?.vendor || '').trim().toLowerCase() ? 'text-emerald-700' : 'text-roman-text-sub'}`}>
                            {quotes[i].vendor.trim().toLowerCase() === String((persistedServicePreference || budgetHistory.preferredVendor)?.vendor || '').trim().toLowerCase()
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
                          value={quotes[i].value}
                          onChange={e => handleQuoteChange(i, 'value', e.target.value)}
                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                        />
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
                                  const targetItem = quotes[i].items[quotes[i].items.length - 1];
                                  if (!targetItem) return;
                                  handleQuoteItemChange(i, targetItem.id, 'materialId', material.id);
                                }}
                                className="rounded-sm border border-roman-primary/20 bg-roman-primary/5 px-2 py-1 text-[11px] text-roman-primary"
                              >
                                {material.name}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="space-y-3">
                          {quotes[i].items.map((item, itemIndex) => (
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
                                  value={item.materialId || ''}
                                  onChange={event => handleQuoteItemChange(i, item.id, 'materialId', event.target.value)}
                                  className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                                >
                                  <option value="">Selecionar material</option>
                                  {catalogMaterials.map(material => (
                                    <option key={material.id} value={material.id}>{material.name}</option>
                                  ))}
                                </select>
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
                                  <input
                                    type="text"
                                    placeholder="Unidade"
                                    value={item.unit || ''}
                                    onChange={event => handleQuoteItemChange(i, item.id, 'unit', event.target.value)}
                                    className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    placeholder="Valor unitário"
                                    value={item.unitPrice || ''}
                                    onChange={event => handleQuoteItemChange(i, item.id, 'unitPrice', event.target.value)}
                                    className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Valor total"
                                    value={item.totalPrice || ''}
                                    onChange={event => handleQuoteItemChange(i, item.id, 'totalPrice', event.target.value)}
                                    className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                                  />
                                </div>
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

              <div className="sticky bottom-0 mt-6 flex justify-end gap-3 pt-4 border-t border-roman-border bg-roman-surface">
                <button onClick={() => setShowQuotesModal(false)} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm">
                  Fechar
                </button>
                <button
                  onClick={() => {
                    handleSendToDirector();
                    if (quotes.filter(q => q.vendor.trim() !== '' && q.value.trim() !== '').length >= 3) {
                      setShowQuotesModal(false);
                    }
                  }}
                  disabled={isSending}
                  className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm flex items-center gap-2 disabled:opacity-70"
                >
                  {isSending ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
                  {isSending ? 'Enviando...' : 'Enviar para Diretoria'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ações Preliminares Modal */}
      {showPrelimModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPrelimModal(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Ações preliminares"
        >
          <div className="bg-roman-surface border border-roman-border rounded-sm shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-roman-border bg-roman-bg">
              <h3 className="font-serif text-lg text-roman-text-main font-medium">Ações Preliminares</h3>
              <button onClick={() => setShowPrelimModal(false)} className="text-roman-text-sub hover:text-roman-text-main"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <p className="text-sm text-roman-text-sub font-serif italic">
                  Registre compras, cronograma, liberações e impedimentos antes de iniciar a execução.
                </p>
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

              <div className="flex justify-end gap-3 pt-2">
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

