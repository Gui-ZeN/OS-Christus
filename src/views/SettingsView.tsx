import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Boxes, CheckCircle, Clock, Database, Loader2, Mail, MapPinned, RefreshCw, ShieldCheck, Trash2, TriangleAlert, Users, Wrench } from 'lucide-react';
import { runFirestoreLegacyBackfill, type FirestoreBackfillResult } from '../services/adminActionsApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useApp } from '../context/AppContext';
import { isFirebaseAuthConfigured } from '../lib/firebaseClient';
import {
  fetchCatalog,
  deleteCatalogEntry,
  type CatalogRegion,
  type CatalogSite,
  saveCatalogEntry,
  type CatalogMacroService,
  type CatalogMaterial,
  type CatalogServiceItem,
  type CatalogVendorPreference,
} from '../services/catalogApi';
import { fetchFirestoreLegacyHealth, type FirestoreLegacyHealth } from '../services/firestoreLegacyHealthApi';
import { fetchIntegrationsHealth, type IntegrationCheck, type IntegrationsHealthResponse } from '../services/integrationsHealthApi';
import { fetchSettings, saveSettings, type DailyDigestSettings, type EmailTemplateSettings, type SlaSettings } from '../services/settingsApi';
import { EmailHealthView } from './EmailHealthView';
import { UsersView } from './UsersView';

type SettingsSection = 'access' | 'territory' | 'catalog' | 'templates' | 'daily-digest' | 'sla' | 'integrations';

const DEFAULT_TEMPLATE: EmailTemplateSettings = {
  trigger: 'EMAIL-NOVA-OS',
  subject: '[Nova OS] {{ticket.id}} - {{ticket.subject}}',
  body:
    'Olá {{requester.name}},\n\nSua Ordem de Serviço foi registrada com sucesso.\n\nNúmero: {{ticket.id}}\nAssunto: {{ticket.subject}}\n\nNossa equipe fará a triagem em breve.\n\nAtenciosamente,\nGestão de Manutenção',
};

const DEFAULT_EMAIL_TEMPLATES: EmailTemplateSettings[] = [
  DEFAULT_TEMPLATE,
  {
    trigger: 'EMAIL-TRIAGEM-EM-ANDAMENTO',
    subject: '[Triagem] {{ticket.id}} em análise',
    body: 'Olá {{requester.name}},\n\nSua OS {{ticket.id}} entrou em triagem com a equipe de manutenção.\n\nAssunto: {{ticket.subject}}\nStatus atual: {{ticket.status}}\n\nAcompanhe: {{tracking.url}}',
  },
  {
    trigger: 'EMAIL-PARECER-TECNICO',
    subject: '[Parecer Técnico] {{ticket.id}} pronta para solução',
    body: 'Olá {{requester.name}},\n\nA OS {{ticket.id}} recebeu parecer técnico e seguiu para definição da solução.\n\nAssunto: {{ticket.subject}}\nStatus atual: {{ticket.status}}\n\nAcompanhe: {{tracking.url}}',
  },
  {
    trigger: 'EMAIL-AGUARDANDO-ORCAMENTO',
    subject: '[Orçamento] {{ticket.id}} em cotação',
    body: 'Olá {{requester.name}},\n\nA OS {{ticket.id}} entrou na etapa de orçamento e comparação com fornecedores.\n\nAssunto: {{ticket.subject}}\nStatus atual: {{ticket.status}}\n\nAcompanhe: {{tracking.url}}',
  },
  {
    trigger: 'EMAIL-EM-APROVACAO',
    subject: '[Aprovação] {{ticket.id}} em validação',
    body: 'Olá {{requester.name}},\n\nA OS {{ticket.id}} avançou para a etapa de aprovação.\n\nAssunto: {{ticket.subject}}\nStatus atual: {{ticket.status}}\n\nAcompanhe: {{tracking.url}}',
  },
  {
    trigger: 'EMAIL-ACOES-PRELIMINARES',
    subject: '[Planejamento] {{ticket.id}} em ações preliminares',
    body: 'Olá {{requester.name}},\n\nA OS {{ticket.id}} entrou em ações preliminares.\n\nAssunto: {{ticket.subject}}\nStatus atual: {{ticket.status}}\n\nAcompanhe: {{tracking.url}}',
  },
  {
    trigger: 'EMAIL-EXECUCAO-INICIADA',
    subject: '[Execução] {{ticket.id}} em andamento',
    body: 'Olá {{requester.name}},\n\nA execução da OS {{ticket.id}} foi iniciada.\n\nAssunto: {{ticket.subject}}\nStatus atual: {{ticket.status}}\n\nAcompanhe: {{tracking.url}}',
  },
  {
    trigger: 'EMAIL-VALIDACAO-SOLICITANTE',
    subject: '[Validação] {{ticket.id}} aguardando sua confirmação',
    body: 'Olá {{requester.name}},\n\nA manutenção da OS {{ticket.id}} aguarda sua validação.\n\nAssunto: {{ticket.subject}}\nStatus atual: {{ticket.status}}\n\nAcompanhe: {{tracking.url}}',
  },
  {
    trigger: 'EMAIL-AGUARDANDO-PAGAMENTO',
    subject: '[Pagamento] {{ticket.id}} em finalização financeira',
    body: 'Olá {{requester.name}},\n\nA OS {{ticket.id}} foi validada e entrou na etapa de pagamento.\n\nAssunto: {{ticket.subject}}\nStatus atual: {{ticket.status}}\n\nAcompanhe: {{tracking.url}}',
  },
  {
    trigger: 'EMAIL-OS-ENCERRADA',
    subject: '[Encerrada] {{ticket.id}} concluída',
    body: 'Olá {{requester.name}},\n\nA OS {{ticket.id}} foi encerrada com sucesso.\n\nAssunto: {{ticket.subject}}\nStatus final: {{ticket.status}}\nGarantia: {{guarantee.summary}}\n\nHistórico completo: {{tracking.url}}',
  },
  {
    trigger: 'EMAIL-OS-CANCELADA',
    subject: '[Cancelada] {{ticket.id}}',
    body: 'Olá {{requester.name}},\n\nA OS {{ticket.id}} foi cancelada.\n\nAssunto: {{ticket.subject}}\nStatus atual: {{ticket.status}}\nMotivo ou observação: {{message.body}}\n\nAcompanhe: {{tracking.url}}',
  },
  {
    trigger: 'EMAIL-NOVA-MENSAGEM',
    subject: '[Mensagem] {{ticket.id}} recebeu uma atualização',
    body: 'Olá {{requester.name}},\n\n{{message.sender}} enviou uma nova atualização na OS {{ticket.id}}.\n\nMensagem:\n{{message.body}}\n\nAcompanhe: {{tracking.url}}',
  },
];

const DEFAULT_DIGEST: DailyDigestSettings = {
  enabled: true,
  time: '08:00',
  recipients: 'rafael@empresa.com, diretoria@empresa.com',
  subject: '[Resumo Diário] Manutenção - {{data}} | {{novas_os_ontem}} novas OS · {{slas_vencendo_hoje}} SLAs hoje',
};

const DEFAULT_SLA: SlaSettings = {
  rules: [
    { priority: 'Urgente', prazo: '24h' },
    { priority: 'Alta', prazo: '72h' },
    { priority: 'Normal', prazo: '5 dias úteis' },
    { priority: 'Trivial', prazo: '10 dias úteis' },
  ],
};

const SECTION_META: Record<
  SettingsSection,
  {
    eyebrow: string;
    title: string;
    description: string;
    navLabel: string;
    accent: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }
> = {
  access: {
    eyebrow: 'Governança',
    title: 'Acessos e perfis',
    description: 'Controle quem entra, qual papel assume e qual estrutura territorial cada pessoa enxerga.',
    navLabel: 'Acessos',
    accent: 'from-amber-100 via-white to-stone-100',
    icon: Users,
  },
  territory: {
    eyebrow: 'Estrutura',
    title: 'Regiões e sedes',
    description: 'Organize a malha operacional que alimenta usuários, OS, filtros e dashboards.',
    navLabel: 'Regiões e Sedes',
    accent: 'from-sky-100 via-white to-cyan-50',
    icon: MapPinned,
  },
  catalog: {
    eyebrow: 'Base operacional',
    title: 'Serviços e materiais',
    description: 'Mantenha o catálogo de classificação, referência de orçamento e histórico técnico.',
    navLabel: 'Serviços e Materiais',
    accent: 'from-orange-100 via-white to-amber-50',
    icon: Boxes,
  },
  templates: {
    eyebrow: 'Comunicação',
    title: 'Templates de e-mail',
    description: 'Padronize mensagens disparadas pelo sistema em cada etapa do fluxo.',
    navLabel: 'Templates de E-mail',
    accent: 'from-rose-100 via-white to-orange-50',
    icon: Mail,
  },
  'daily-digest': {
    eyebrow: 'Rotina',
    title: 'Resumo diário',
    description: 'Defina a cadência do consolidado operacional enviado automaticamente.',
    navLabel: 'Resumo Diário',
    accent: 'from-lime-100 via-white to-emerald-50',
    icon: Clock,
  },
  sla: {
    eyebrow: 'Regras',
    title: 'SLA e prazos',
    description: 'Ajuste as metas por prioridade e mantenha a esteira sob controle.',
    navLabel: 'Regras de SLA',
    accent: 'from-violet-100 via-white to-fuchsia-50',
    icon: ShieldCheck,
  },
  integrations: {
    eyebrow: 'Observabilidade',
    title: 'Integrações e legado',
    description: 'Acompanhe saúde do ambiente, compatibilidade de dados e ações técnicas de saneamento.',
    navLabel: 'Integrações e Legado',
    accent: 'from-stone-200 via-white to-slate-100',
    icon: Database,
  },
};

function IntegrationStatusCard({
  title,
  check,
}: {
  title: string;
  check: IntegrationCheck | { ok: boolean; detail: string; meta: Record<string, unknown> | null };
}) {
  return (
    <div className="border border-roman-border rounded-sm p-4 bg-roman-bg">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">{title}</div>
          <div className="text-base font-serif text-roman-text-main mt-1">{check.ok ? 'Operacional' : 'Atenção'}</div>
        </div>
        <div className={`shrink-0 ${check.ok ? 'text-green-700' : 'text-amber-700'}`}>
          {check.ok ? <ShieldCheck size={18} /> : <TriangleAlert size={18} />}
        </div>
      </div>
      <p className="text-sm text-roman-text-sub">{check.detail}</p>
      {check.meta && Object.keys(check.meta).length > 0 && (
        <div className="mt-3 pt-3 border-t border-roman-border space-y-1">
          {Object.entries(check.meta).map(([key, value]) => (
            <div key={key} className="text-xs text-roman-text-sub flex items-start justify-between gap-3">
              <span className="font-medium text-roman-text-main">{key}</span>
              <span className="text-right break-all">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackBanner({
  tone,
  children,
}: {
  tone: 'success' | 'error' | 'info';
  children: React.ReactNode;
}) {
  const palette =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-stone-200 bg-stone-50 text-roman-text-sub';

  const Icon = tone === 'success' ? CheckCircle : tone === 'error' ? AlertCircle : Database;

  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${palette}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function SettingsView() {
  const { currentUser } = useApp();
  const canAccess = currentUser?.role === 'Admin';
  const canEditSettings = canAccess;
  const [section, setSection] = useState<SettingsSection>('access');
  const [loading, setLoading] = useState(true);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [digestSaved, setDigestSaved] = useState(false);
  const [slaSaved, setSlaSaved] = useState(false);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationsError, setIntegrationsError] = useState<string | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [backfillResult, setBackfillResult] = useState<FirestoreBackfillResult | null>(null);
  const [legacyHealth, setLegacyHealth] = useState<FirestoreLegacyHealth | null>(null);
  const [integrationsHealth, setIntegrationsHealth] = useState<IntegrationsHealthResponse | null>(null);
  const [template, setTemplate] = useState<EmailTemplateSettings>(DEFAULT_TEMPLATE);
  const [emailTemplatesCatalog, setEmailTemplatesCatalog] = useState<EmailTemplateSettings[]>(DEFAULT_EMAIL_TEMPLATES);
  const [digest, setDigest] = useState<DailyDigestSettings>(DEFAULT_DIGEST);
  const [sla, setSla] = useState<SlaSettings>(DEFAULT_SLA);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogSaved, setCatalogSaved] = useState<string | null>(null);
  const [catalogDeleting, setCatalogDeleting] = useState(false);
  const [regions, setRegions] = useState<CatalogRegion[]>([]);
  const [sites, setSites] = useState<CatalogSite[]>([]);
  const [macroServices, setMacroServices] = useState<CatalogMacroService[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<CatalogServiceItem[]>([]);
  const [materials, setMaterials] = useState<CatalogMaterial[]>([]);
  const [vendorPreferences, setVendorPreferences] = useState<CatalogVendorPreference[]>([]);
  const [regionDraft, setRegionDraft] = useState({ id: '', code: '', name: '', group: 'operacao' });
  const [siteDraft, setSiteDraft] = useState({ id: '', code: '', name: '', regionId: '' });
  const [macroDraft, setMacroDraft] = useState({ code: '', name: '' });
  const [serviceDraft, setServiceDraft] = useState({ code: '', name: '', macroServiceId: '', suggestedMaterialIds: [] as string[] });
  const [materialDraft, setMaterialDraft] = useState({ code: '', name: '', unit: '' });
  const [pendingCatalogDelete, setPendingCatalogDelete] = useState<{ entity: 'regions' | 'sites'; id: string; label: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const remote = await fetchSettings();
        if (cancelled) return;
        const remoteTemplates = remote.emailTemplates?.length ? remote.emailTemplates : DEFAULT_EMAIL_TEMPLATES;
        setEmailTemplatesCatalog(remoteTemplates);
        setTemplate(remote.emailTemplate || remoteTemplates[0] || DEFAULT_TEMPLATE);
        setDigest(remote.dailyDigest || DEFAULT_DIGEST);
        setSla(remote.sla || DEFAULT_SLA);
      } catch {
        if (cancelled) return;
        setEmailTemplatesCatalog(DEFAULT_EMAIL_TEMPLATES);
        setTemplate(DEFAULT_EMAIL_TEMPLATES[0] || DEFAULT_TEMPLATE);
        setDigest(DEFAULT_DIGEST);
        setSla(DEFAULT_SLA);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadIntegrations = async () => {
    setIntegrationsLoading(true);
    setIntegrationsError(null);

    try {
      const [legacy, integrations] = await Promise.all([fetchFirestoreLegacyHealth(), fetchIntegrationsHealth()]);
      setLegacyHealth(legacy);
      setIntegrationsHealth(integrations);
    } catch (error) {
      setIntegrationsError(error instanceof Error ? error.message : 'Falha ao carregar integrações.');
    } finally {
      setIntegrationsLoading(false);
    }
  };

  const loadCatalog = async () => {
    setCatalogLoading(true);
    setCatalogError(null);

    try {
      const catalog = await fetchCatalog();
      setRegions(catalog.regions);
      setSites(catalog.sites);
      setMacroServices(catalog.macroServices);
      setServiceCatalog(catalog.serviceCatalog);
      setMaterials(catalog.materials);
      setVendorPreferences(catalog.vendorPreferences);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Falha ao carregar catalogo.');
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    if (section !== 'integrations') return;
    void loadIntegrations();
  }, [section]);

  useEffect(() => {
    if (!['territory', 'catalog'].includes(section)) return;
    void loadCatalog();
  }, [section]);

  const handleSaveTemplate = async () => {
    if (!canEditSettings) return;
    try {
      await saveSettings('emailTemplates', template);
      setEmailTemplatesCatalog(current =>
        [...current.filter(item => item.trigger !== template.trigger), template].sort((a, b) =>
          a.trigger.localeCompare(b.trigger, 'pt-BR')
        )
      );
    } catch {
      // Mantém feedback local mesmo se a API não estiver disponível.
    }
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 3000);
  };

  const handleSaveDigest = async () => {
    if (!canEditSettings) return;
    try {
      await saveSettings('dailyDigest', digest);
    } catch {
      // Mantém feedback local mesmo se a API não estiver disponível.
    }
    setDigestSaved(true);
    setTimeout(() => setDigestSaved(false), 3000);
  };

  const handleSaveSla = async () => {
    if (!canEditSettings) return;
    try {
      await saveSettings('sla', sla);
    } catch {
      // Mantém feedback local mesmo se a API não estiver disponível.
    }
    setSlaSaved(true);
    setTimeout(() => setSlaSaved(false), 3000);
  };

  const handleRunBackfill = async () => {
    setBackfillLoading(true);
    setBackfillError(null);

    try {
      const result = await runFirestoreLegacyBackfill();
      setBackfillResult(result.result);
      await loadIntegrations();
    } catch (error) {
      setBackfillError(error instanceof Error ? error.message : 'Falha ao executar backfill.');
    } finally {
      setBackfillLoading(false);
    }
  };

  const handleSaveMacroService = async () => {
    try {
      const catalog = await saveCatalogEntry('macroServices', macroDraft);
      setRegions(catalog.regions);
      setSites(catalog.sites);
      setMacroServices(catalog.macroServices);
      setServiceCatalog(catalog.serviceCatalog);
      setMaterials(catalog.materials);
      setVendorPreferences(catalog.vendorPreferences);
      setMacroDraft({ code: '', name: '' });
      setCatalogSaved('Macroserviço salvo.');
      setTimeout(() => setCatalogSaved(null), 3000);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Falha ao salvar macroserviço.');
    }
  };

  const handleSaveService = async () => {
    try {
      const catalog = await saveCatalogEntry('serviceCatalog', serviceDraft);
      setRegions(catalog.regions);
      setSites(catalog.sites);
      setMacroServices(catalog.macroServices);
      setServiceCatalog(catalog.serviceCatalog);
      setMaterials(catalog.materials);
      setVendorPreferences(catalog.vendorPreferences);
      setServiceDraft({ code: '', name: '', macroServiceId: '', suggestedMaterialIds: [] });
      setCatalogSaved('Serviço salvo.');
      setTimeout(() => setCatalogSaved(null), 3000);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Falha ao salvar serviço.');
    }
  };

  const handleSaveMaterial = async () => {
    try {
      const catalog = await saveCatalogEntry('materials', materialDraft);
      setRegions(catalog.regions);
      setSites(catalog.sites);
      setMacroServices(catalog.macroServices);
      setServiceCatalog(catalog.serviceCatalog);
      setMaterials(catalog.materials);
      setVendorPreferences(catalog.vendorPreferences);
      setMaterialDraft({ code: '', name: '', unit: '' });
      setCatalogSaved('Material salvo.');
      setTimeout(() => setCatalogSaved(null), 3000);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Falha ao salvar material.');
    }
  };

  const handleSaveRegion = async () => {
    try {
      const catalog = await saveCatalogEntry('regions', regionDraft);
      setRegions(catalog.regions);
      setSites(catalog.sites);
      setMacroServices(catalog.macroServices);
      setServiceCatalog(catalog.serviceCatalog);
      setMaterials(catalog.materials);
      setVendorPreferences(catalog.vendorPreferences);
      setRegionDraft({ id: '', code: '', name: '', group: 'operacao' });
      setCatalogSaved('Região salva.');
      setTimeout(() => setCatalogSaved(null), 3000);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Falha ao salvar região.');
    }
  };

  const handleSaveSite = async () => {
    try {
      const catalog = await saveCatalogEntry('sites', siteDraft);
      setRegions(catalog.regions);
      setSites(catalog.sites);
      setMacroServices(catalog.macroServices);
      setServiceCatalog(catalog.serviceCatalog);
      setMaterials(catalog.materials);
      setVendorPreferences(catalog.vendorPreferences);
      setSiteDraft({ id: '', code: '', name: '', regionId: '' });
      setCatalogSaved('Sede salva.');
      setTimeout(() => setCatalogSaved(null), 3000);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Falha ao salvar sede.');
    }
  };

  const handleDeleteCatalogItem = async (entity: 'regions' | 'sites', id: string, label: string) => {
    setCatalogDeleting(true);
    try {
      const catalog = await deleteCatalogEntry(entity, id);
      setRegions(catalog.regions);
      setSites(catalog.sites);
      setMacroServices(catalog.macroServices);
      setServiceCatalog(catalog.serviceCatalog);
      setMaterials(catalog.materials);
      setVendorPreferences(catalog.vendorPreferences);
      if (entity === 'regions' && regionDraft.id === id) {
        setRegionDraft({ id: '', code: '', name: '', group: 'operacao' });
      }
      if (entity === 'sites' && siteDraft.id === id) {
        setSiteDraft({ id: '', code: '', name: '', regionId: '' });
      }
      setCatalogSaved(entity === 'regions' ? 'Região excluída.' : 'Sede excluída.');
      setTimeout(() => setCatalogSaved(null), 3000);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Falha ao excluir item do catálogo.');
    } finally {
      setCatalogDeleting(false);
      setPendingCatalogDelete(null);
    }
  };

  const clientFirebaseCheck = useMemo(
    () => ({
      ok: isFirebaseAuthConfigured(),
      detail: isFirebaseAuthConfigured()
        ? 'Variáveis VITE_FIREBASE_* disponíveis no frontend.'
        : 'Configuração web do Firebase ausente no frontend.',
      meta: null,
    }),
    []
  );

  if (!canAccess) {
    return (
      <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
        <div className="max-w-4xl mx-auto min-h-[60vh]">
          <EmptyState
            icon={Mail}
            title="Acesso restrito"
            description="As configurações do sistema estão disponíveis apenas para perfis Admin."
          />
        </div>
      </div>
    );
  }

  const legacyCards = legacyHealth
    ? [
        { label: 'Usuários com papel legado', value: legacyHealth.summary.legacyUsers },
        { label: 'Tickets sem regionId/siteId', value: legacyHealth.summary.ticketsMissingCatalog },
        { label: 'Notificações com time legado', value: legacyHealth.summary.notificationsLegacy },
        { label: 'SLA com compatibilidade legada', value: legacyHealth.summary.slaLegacy },
      ]
    : [];
  const sectionMeta = SECTION_META[section];
  const sectionHighlights = useMemo(() => {
    if (section === 'access') {
      return [
        { label: 'Administração', value: 'Usuários', hint: 'Papéis, status e escopo territorial' },
        { label: 'Autenticação', value: 'Firebase Auth', hint: 'Conta acompanha o cadastro' },
        { label: 'Estrutura', value: 'Regiões e sedes', hint: 'Visibilidade controlada por vínculo' },
      ];
    }
    if (section === 'territory') {
      return [
        { label: 'Regiões', value: String(regions.length), hint: 'Agrupamentos territoriais ativos' },
        { label: 'Sedes', value: String(sites.length), hint: 'Unidades disponíveis na operação' },
        { label: 'Sincronismo', value: catalogLoading ? 'Atualizando' : 'Estável', hint: 'Compartilhado com usuários, OS e dashboards' },
      ];
    }
    if (section === 'catalog') {
      return [
        { label: 'Macroserviços', value: String(macroServices.length), hint: 'Camada macro de classificação' },
        { label: 'Serviços', value: String(serviceCatalog.length), hint: 'Catálogo detalhado para triagem e orçamento' },
        { label: 'Materiais', value: String(materials.length), hint: 'Base sugerida para composição' },
      ];
    }
    if (section === 'templates') {
      return [
        { label: 'Gatilho', value: template.trigger || 'Template', hint: 'Fluxo ativo no momento' },
        { label: 'Assunto', value: template.subject ? 'Personalizado' : 'Padrão', hint: 'Linha usada nas mensagens' },
        { label: 'Corpo', value: template.body ? 'Ativo' : 'Vazio', hint: 'Conteúdo operacional enviado' },
      ];
    }
    if (section === 'daily-digest') {
      return [
        { label: 'Resumo', value: digest.enabled ? 'Ativado' : 'Desativado', hint: 'Rotina automática de envio' },
        { label: 'Horário', value: digest.time || '--:--', hint: 'Janela configurada para disparo' },
        { label: 'Destinatários', value: digest.recipients ? String(digest.recipients.split(',').filter(Boolean).length) : '0', hint: 'Quantidade atual na lista' },
      ];
    }
    if (section === 'sla') {
      return [
        { label: 'Regras', value: String(sla.rules.length), hint: 'Faixas de prioridade configuradas' },
        { label: 'Urgente', value: sla.rules[0]?.prazo || '-', hint: 'Prazo mais crítico' },
        { label: 'Normal', value: sla.rules[2]?.prazo || '-', hint: 'Referência padrão da operação' },
      ];
    }
    return [
      { label: 'Health checks', value: integrationsHealth ? 'Ativos' : 'Pendente', hint: 'Leitura do ambiente técnico' },
      { label: 'Backfill', value: backfillResult ? 'Executado' : 'Disponível', hint: 'Saneamento legado sob demanda' },
      { label: 'Legado', value: legacyHealth ? String(legacyCards.reduce((sum, card) => sum + Number(card.value || 0), 0)) : '--', hint: 'Sinais antigos encontrados no projeto' },
    ];
  }, [
    backfillResult,
    catalogLoading,
    digest.enabled,
    digest.recipients,
    digest.time,
    integrationsHealth,
    legacyCards,
    legacyHealth,
    macroServices.length,
    materials.length,
    section,
    serviceCatalog.length,
    sites.length,
    sla.rules,
    template.body,
    template.subject,
    template.trigger,
    regions.length,
  ]);

  return (
    <div className="flex-1 overflow-y-auto bg-stone-50 p-5 md:p-8">
      <div className="mx-auto max-w-[1500px] space-y-7">
        <section className="overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="grid gap-0 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="px-8 py-8 md:px-10">
              <div className="text-[11px] uppercase tracking-[0.28em] text-roman-primary">Configuração Central</div>
              <h1 className="mt-4 max-w-2xl text-[2.35rem] font-serif tracking-tight text-roman-text-main">Painel de Estrutura e Governança</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-roman-text-sub">
                Um centro administrativo para controlar pessoas, território, catálogo operacional, comunicação e observabilidade sem espalhar configuração pelo sistema.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.2rem] border border-stone-200 bg-stone-50 px-4 py-4">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-roman-text-sub">Escopo</div>
                  <div className="mt-2 text-lg font-serif text-roman-text-main">Governança</div>
                  <div className="mt-1 text-sm text-roman-text-sub">Usuários, papéis e visibilidade territorial.</div>
                </div>
                <div className="rounded-[1.2rem] border border-stone-200 bg-stone-50 px-4 py-4">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-roman-text-sub">Base</div>
                  <div className="mt-2 text-lg font-serif text-roman-text-main">Operação</div>
                  <div className="mt-1 text-sm text-roman-text-sub">Catálogos, templates e SLA em um só lugar.</div>
                </div>
                <div className="rounded-[1.2rem] border border-stone-200 bg-stone-50 px-4 py-4">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-roman-text-sub">Health</div>
                  <div className="mt-2 text-lg font-serif text-roman-text-main">Ambiente</div>
                  <div className="mt-1 text-sm text-roman-text-sub">Status técnico, e-mail e legado monitorados.</div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 px-6 py-6 md:grid-cols-2 md:px-8 xl:grid-cols-1 xl:content-start">
              {sectionHighlights.map(card => (
                <div key={card.label} className="rounded-[1.2rem] border border-stone-200 bg-stone-50 px-5 py-5">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-roman-text-sub">{card.label}</div>
                  <div className="mt-3 text-2xl font-serif text-roman-text-main">{card.value}</div>
                  <div className="mt-2 text-sm text-roman-text-sub">{card.hint}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="h-fit rounded-[1.75rem] border border-stone-200 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
            <div className="rounded-[1.4rem] border border-stone-200 bg-stone-50 px-5 py-5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-roman-text-sub">Navegação</div>
              <div className="mt-3 text-2xl font-serif text-roman-text-main">Módulos de configuração</div>
              <p className="mt-2 text-sm leading-6 text-roman-text-sub">A navegação foi condensada para reduzir ruído e destacar a frente que você está administrando agora.</p>
            </div>

            <div className="mt-4 space-y-3">
            {(Object.entries(SECTION_META) as Array<[SettingsSection, (typeof SECTION_META)[SettingsSection]]>).map(([key, meta]) => {
              const Icon = meta.icon;
              const isActive = section === key;
              return (
                <button
                  key={key}
                  onClick={() => setSection(key)}
                  className={`w-full rounded-[1.2rem] border px-4 py-4 text-left transition-all ${
                    isActive
                      ? 'border-roman-primary/20 bg-stone-900 text-white shadow-[0_12px_28px_rgba(15,23,42,0.14)]'
                      : 'border-stone-200 bg-stone-50 text-roman-text-sub hover:border-stone-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ${isActive ? 'bg-white/10' : 'bg-roman-bg text-roman-primary'}`}>
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{meta.navLabel}</div>
                      <div className={`mt-1 text-xs leading-5 ${isActive ? 'text-white/72' : 'text-roman-text-sub/80'}`}>{meta.description}</div>
                    </div>
                  </div>
                </button>
              );
            })}
            </div>
          </aside>

          <div className="min-w-0 rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-[0_16px_36px_rgba(15,23,42,0.05)] md:p-8">
            {loading ? (
              <div className="py-12 text-center text-roman-text-sub flex items-center justify-center gap-3">
                <Loader2 size={18} className="animate-spin" />
                Carregando configurações...
              </div>
            ) : (
              <>
                <div className="mb-8 rounded-[1.35rem] border border-stone-200 bg-stone-50 px-6 py-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.32em] text-roman-primary">{sectionMeta.eyebrow}</div>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-stone-200 bg-white text-roman-primary">
                          <sectionMeta.icon size={22} />
                        </div>
                        <div>
                          <div className="text-3xl font-serif text-roman-text-main">{sectionMeta.title}</div>
                          <p className="mt-2 max-w-3xl text-sm leading-6 text-roman-text-sub">{sectionMeta.description}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 lg:w-[420px]">
                      {sectionHighlights.map(item => (
                        <div key={item.label} className="rounded-[1.2rem] border border-stone-200 bg-white px-4 py-4">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-roman-text-sub">{item.label}</div>
                          <div className="mt-2 text-lg font-serif text-roman-text-main">{item.value}</div>
                          <div className="mt-2 text-xs leading-5 text-roman-text-sub">{item.hint}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {section === 'access' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="rounded-[1.5rem] border border-amber-200/70 bg-amber-50/70 p-5">
                        <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">Administração</div>
                        <div className="text-lg font-serif text-roman-text-main">Usuários e papéis</div>
                        <p className="mt-2 text-sm text-roman-text-sub">Cadastre acessos, ajuste perfis e mantenha a estrutura territorial vinculada.</p>
                      </div>
                      <div className="rounded-[1.5rem] border border-sky-200/70 bg-sky-50/70 p-5">
                        <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">Acesso</div>
                        <div className="text-lg font-serif text-roman-text-main">Firebase Auth</div>
                        <p className="mt-2 text-sm text-roman-text-sub">O cadastro acompanha autenticação, status e ciclo de acesso ao sistema.</p>
                      </div>
                      <div className="rounded-[1.5rem] border border-emerald-200/70 bg-emerald-50/70 p-5">
                        <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">Escopo</div>
                        <div className="text-lg font-serif text-roman-text-main">Regiões e sedes</div>
                        <p className="mt-2 text-sm text-roman-text-sub">Cada perfil enxerga apenas a malha operacional vinculada ao seu cadastro.</p>
                      </div>
                    </div>

                    <div className="rounded-[1.75rem] border border-stone-200/80 bg-white/90 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                      <UsersView embedded />
                    </div>
                  </div>
                )}

                {section === 'territory' && (
                  <>
                    <div className="flex items-center justify-between mb-6 gap-4">
                      <div>
                        <h2 className="font-serif text-xl font-medium text-roman-text-main">Regiões e Sedes</h2>
                        <p className="text-sm text-roman-text-sub font-serif italic">Estrutura territorial usada em usuários, OS e dashboards.</p>
                      </div>

                      <button
                        onClick={() => void loadCatalog()}
                        className="px-4 py-2 border border-roman-border rounded-sm text-sm font-medium text-roman-text-main hover:border-roman-primary flex items-center gap-2"
                        disabled={catalogLoading}
                      >
                        <RefreshCw size={14} className={catalogLoading ? 'animate-spin' : ''} />
                        Atualizar
                      </button>
                    </div>

                    <div className="mb-4 space-y-3">
                      {catalogError && <FeedbackBanner tone="error">{catalogError}</FeedbackBanner>}
                      {catalogSaved && <FeedbackBanner tone="success">{catalogSaved}</FeedbackBanner>}
                    </div>

                    {catalogLoading ? (
                      <div className="py-12 text-center text-roman-text-sub flex items-center justify-center gap-3">
                        <Loader2 size={18} className="animate-spin" />
                        Carregando estrutura...
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        <section className="rounded-[1.25rem] border border-stone-200 bg-stone-50 p-5 space-y-4">
                          <div>
                            <h3 className="font-serif text-lg text-roman-text-main">Regiões</h3>
                            <p className="text-xs text-roman-text-sub mt-1">Base de agrupamento operacional do sistema.</p>
                          </div>
                          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                            {regions.map(item => (
                              <div key={item.id} className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-3 last:border-b-0">
                                <div>
                                  <div className="text-sm font-medium text-roman-text-main">{item.name}</div>
                                  <div className="text-[11px] text-roman-text-sub">{item.code || item.id}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <button onClick={() => setRegionDraft({ id: item.id, code: item.code || '', name: item.name, group: item.group || 'operacao' })} className="text-xs font-medium text-roman-primary hover:underline">Editar</button>
                                  <button onClick={() => setPendingCatalogDelete({ entity: 'regions', id: item.id, label: `a região ${item.name}` })} className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline"><Trash2 size={12} />Excluir</button>
                                </div>
                              </div>
                            ))}
                            {regions.length === 0 && <div className="px-4 py-6 text-sm text-roman-text-sub">Nenhuma região cadastrada.</div>}
                          </div>
                          <div className="grid gap-3 border-t border-stone-200 pt-4 md:grid-cols-[minmax(0,1fr)_120px_auto]">
                            <input type="text" value={regionDraft.name} onChange={event => setRegionDraft(current => ({ ...current, name: event.target.value }))} placeholder="Nome da região" className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary" />
                            <input type="text" value={regionDraft.code} onChange={event => setRegionDraft(current => ({ ...current, code: event.target.value }))} placeholder="Código" className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary" />
                            <button onClick={() => void handleSaveRegion()} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800">{regionDraft.id ? 'Salvar' : 'Criar'}</button>
                          </div>
                        </section>

                        <section className="rounded-[1.25rem] border border-stone-200 bg-stone-50 p-5 space-y-4">
                          <div>
                            <h3 className="font-serif text-lg text-roman-text-main">Sedes</h3>
                            <p className="text-xs text-roman-text-sub mt-1">Unidades vinculadas a cada região.</p>
                          </div>
                          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                            {sites.map(item => (
                              <div key={item.id} className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-3 last:border-b-0">
                                <div>
                                  <div className="text-sm font-medium text-roman-text-main">{item.name}</div>
                                  <div className="text-[11px] text-roman-text-sub">{item.code || item.id} · {regions.find(region => region.id === item.regionId)?.code || item.regionId}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <button onClick={() => setSiteDraft({ id: item.id, code: item.code || '', name: item.name, regionId: item.regionId })} className="text-xs font-medium text-roman-primary hover:underline">Editar</button>
                                  <button onClick={() => setPendingCatalogDelete({ entity: 'sites', id: item.id, label: `a sede ${item.name}` })} className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline"><Trash2 size={12} />Excluir</button>
                                </div>
                              </div>
                            ))}
                            {sites.length === 0 && <div className="px-4 py-6 text-sm text-roman-text-sub">Nenhuma sede cadastrada.</div>}
                          </div>
                          <div className="grid gap-3 border-t border-stone-200 pt-4 md:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)_auto]">
                            <input type="text" value={siteDraft.name} onChange={event => setSiteDraft(current => ({ ...current, name: event.target.value }))} placeholder="Nome da sede" className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary" />
                            <input type="text" value={siteDraft.code} onChange={event => setSiteDraft(current => ({ ...current, code: event.target.value }))} placeholder="Código" className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary" />
                            <select value={siteDraft.regionId} onChange={event => setSiteDraft(current => ({ ...current, regionId: event.target.value }))} className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary">
                              <option value="">Selecione a região</option>
                              {regions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                            </select>
                            <button onClick={() => void handleSaveSite()} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800">{siteDraft.id ? 'Salvar' : 'Criar'}</button>
                          </div>
                        </section>
                      </div>
                    )}
                  </>
                )}

                {section === 'templates' && (
                  <>
                    <div className="mb-6">
                      <h2 className="font-serif text-xl font-medium text-roman-text-main">Templates de comunicação</h2>
                      <p className="mt-1 text-sm text-roman-text-sub">Edite o texto usado nas notificações de cada etapa e valide o tom antes do disparo.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
                      <section className="rounded-[1.25rem] border border-stone-200 bg-stone-50 p-4">
                        <div className="text-[10px] uppercase tracking-[0.24em] text-roman-text-sub">Gatilhos</div>
                        <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white">
                          {emailTemplatesCatalog.map(item => (
                            <button
                              key={item.trigger}
                              onClick={() => setTemplate(item)}
                              className={`flex w-full items-start justify-between gap-3 border-b border-stone-200 px-4 py-3 text-left last:border-b-0 ${
                                template.trigger === item.trigger ? 'bg-stone-900 text-white' : 'bg-white text-roman-text-main hover:bg-stone-50'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium">{item.trigger}</div>
                                <div className={`mt-1 text-[11px] ${template.trigger === item.trigger ? 'text-white/70' : 'text-roman-text-sub'}`}>
                                  {item.subject || 'Sem assunto definido'}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </section>

                      <section className="rounded-[1.25rem] border border-stone-200 bg-stone-50 p-5">
                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                          <div className="space-y-4">
                            <div>
                              <label className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-roman-text-sub">Assunto</label>
                              <input
                                type="text"
                                value={template.subject}
                                onChange={event => setTemplate(current => ({ ...current, subject: event.target.value }))}
                                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-roman-text-sub">Corpo do e-mail</label>
                              <textarea
                                className="h-72 w-full rounded-xl border border-stone-200 bg-white p-3 font-mono text-[13px] text-roman-text-sub outline-none focus:border-roman-primary"
                                value={template.body}
                                onChange={event => setTemplate(current => ({ ...current, body: event.target.value }))}
                              />
                            </div>
                          </div>

                          <div className="rounded-xl border border-stone-200 bg-white p-4">
                            <div className="text-[10px] uppercase tracking-[0.24em] text-roman-text-sub">Preview</div>
                            <div className="mt-4 space-y-3">
                              <div>
                                <div className="text-[11px] text-roman-text-sub">Assunto</div>
                                <div className="mt-1 text-sm font-medium text-roman-text-main">{template.subject || 'Sem assunto definido'}</div>
                              </div>
                              <div>
                                <div className="text-[11px] text-roman-text-sub">Variáveis úteis</div>
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                                  {['{{ticket.id}}', '{{ticket.subject}}', '{{ticket.status}}', '{{tracking.url}}', '{{requester.name}}', '{{message.body}}'].map(token => (
                                    <span key={token} className="rounded-full border border-stone-200 bg-stone-50 px-2 py-1 text-roman-text-sub">
                                      {token}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] text-roman-text-sub">Prévia do texto</div>
                                <div className="mt-2 whitespace-pre-wrap rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-roman-text-main">
                                  {template.body || 'Sem corpo definido.'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 flex justify-end">
                          <button
                            onClick={() => void handleSaveTemplate()}
                            className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800"
                          >
                            {templateSaved ? (
                              <>
                                <CheckCircle size={15} /> Salvo
                              </>
                            ) : (
                              'Salvar template'
                            )}
                          </button>
                        </div>
                      </section>
                    </div>
                  </>
                )}

                {section === 'daily-digest' && (
                  <>
                    <div className="mb-6 flex items-center justify-between">
                      <div>
                        <h2 className="font-serif text-xl font-medium text-roman-text-main">Resumo diário</h2>
                        <p className="mt-1 text-sm text-roman-text-sub">Consolidado enviado automaticamente com o panorama operacional do dia.</p>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <div
                          onClick={() => setDigest(current => ({ ...current, enabled: !current.enabled }))}
                          className={`w-10 h-5 rounded-full transition-colors relative ${digest.enabled ? 'bg-roman-primary' : 'bg-roman-border'}`}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                              digest.enabled ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </div>
                        <span className="text-xs font-medium text-roman-text-sub">{digest.enabled ? 'Ativo' : 'Pausado'}</span>
                      </label>
                    </div>

                    <div className="space-y-5">
                      <div className="rounded-[1.25rem] border border-stone-200 bg-stone-50 p-5">
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-3 flex items-center gap-2">
                          <Clock size={12} /> Horário de Envio (Cron)
                        </label>
                        <div className="flex items-center gap-4">
                          <input
                            type="time"
                            value={digest.time}
                            onChange={event => setDigest(current => ({ ...current, time: event.target.value }))}
                            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                          />
                          <span className="text-xs text-roman-text-sub">Fuso: America/Fortaleza (BRT -3)</span>
                        </div>
                      </div>

                      <div className="rounded-[1.25rem] border border-stone-200 bg-stone-50 p-5">
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5 flex items-center gap-2">
                          <Mail size={12} /> Destinatários (separados por vírgula)
                        </label>
                        <input
                          type="text"
                          value={digest.recipients}
                          onChange={event => setDigest(current => ({ ...current, recipients: event.target.value }))}
                          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                        />
                      </div>

                      <div className="rounded-[1.25rem] border border-stone-200 bg-stone-50 p-5">
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Assunto do E-mail</label>
                        <input
                          type="text"
                          value={digest.subject}
                          onChange={event => setDigest(current => ({ ...current, subject: event.target.value }))}
                          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 font-mono text-[13px] text-roman-text-sub outline-none focus:border-roman-primary"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <p className="text-xs text-roman-text-sub font-serif italic">Configuração do resumo diário persistida no Firestore.</p>
                        <button
                          onClick={() => void handleSaveDigest()}
                          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800"
                        >
                          {digestSaved ? (
                            <>
                              <CheckCircle size={15} /> Salvo
                            </>
                          ) : (
                            'Salvar resumo'
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {section === 'sla' && (
                  <>
                    <div className="mb-6">
                      <h2 className="font-serif text-xl font-medium text-roman-text-main">Regras de SLA</h2>
                      <p className="mt-1 text-sm text-roman-text-sub">Ajuste os prazos por prioridade para manter alertas, filas e dashboards coerentes.</p>
                    </div>
                    <div className="space-y-5">
                      {(sla.rules || []).map(rule => (
                        <div key={rule.priority} className="flex items-center justify-between rounded-[1.1rem] border border-stone-200 bg-stone-50 p-4">
                          <span className="font-medium text-sm text-roman-text-main">{rule.priority}</span>
                          <span className="rounded-full border border-stone-200 bg-white px-3 py-1 font-mono text-sm text-roman-text-main">{rule.prazo}</span>
                        </div>
                      ))}

                      <div className="flex items-center justify-between pt-2">
                        <p className="text-xs text-roman-text-sub font-serif italic">
                          O cron de monitoramento pode usar essas regras como base para alertas e relatórios.
                        </p>
                        <button
                          onClick={() => void handleSaveSla()}
                          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800"
                        >
                          {slaSaved ? (
                            <>
                              <CheckCircle size={15} /> Salvo
                            </>
                          ) : (
                            'Salvar regras'
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {section === 'catalog' && (
                  <>
                    <div className="flex items-center justify-between mb-6 gap-4">
                      <div>
                        <h2 className="font-serif text-xl font-medium text-roman-text-main">Serviços e Materiais</h2>
                        <p className="text-sm text-roman-text-sub font-serif italic">
                          Base de macroserviços, serviços e materiais usada no formulário, histórico e procurement.
                        </p>
                      </div>

                      <button
                        onClick={() => void loadCatalog()}
                        className="px-4 py-2 border border-roman-border rounded-sm text-sm font-medium text-roman-text-main hover:border-roman-primary flex items-center gap-2"
                        disabled={catalogLoading}
                      >
                        <RefreshCw size={14} className={catalogLoading ? 'animate-spin' : ''} />
                        Atualizar
                      </button>
                    </div>

                    <div className="mb-4 space-y-3">
                      {catalogError && <FeedbackBanner tone="error">{catalogError}</FeedbackBanner>}
                      {catalogSaved && <FeedbackBanner tone="success">{catalogSaved}</FeedbackBanner>}
                    </div>

                    {catalogLoading ? (
                      <div className="py-12 text-center text-roman-text-sub flex items-center justify-center gap-3">
                        <Loader2 size={18} className="animate-spin" />
                        Carregando catálogo...
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                          <section className="rounded-[1.25rem] border border-stone-200 bg-stone-50 p-4 space-y-4">
                            <div>
                              <h3 className="font-serif text-lg text-roman-text-main">Macroserviços</h3>
                              <p className="text-xs text-roman-text-sub mt-1">Classificação macro da manutenção.</p>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                              {macroServices.map(item => (
                                <div key={item.id} className="rounded-xl border border-stone-200 bg-white px-3 py-2">
                                  <div className="text-sm font-medium text-roman-text-main">{item.name}</div>
                                  <div className="text-[11px] text-roman-text-sub">{item.code || item.id}</div>
                                </div>
                              ))}
                            </div>
                            <div className="space-y-3 border-t border-stone-200 pt-4">
                              <input
                                type="text"
                                value={macroDraft.name}
                                onChange={event => setMacroDraft(current => ({ ...current, name: event.target.value }))}
                                placeholder="Nome do macroserviço"
                                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              />
                              <input
                                type="text"
                                value={macroDraft.code}
                                onChange={event => setMacroDraft(current => ({ ...current, code: event.target.value }))}
                                placeholder="Código opcional"
                                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              />
                              <button
                                onClick={() => void handleSaveMacroService()}
                                className="w-full rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
                              >
                                Salvar Macroserviço
                              </button>
                            </div>
                          </section>

                          <section className="rounded-[1.25rem] border border-stone-200 bg-stone-50 p-4 space-y-4">
                            <div>
                              <h3 className="font-serif text-lg text-roman-text-main">Serviços</h3>
                              <p className="text-xs text-roman-text-sub mt-1">Detalham o tipo real de intervenção.</p>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                              {serviceCatalog.map(item => (
                                <div key={item.id} className="rounded-xl border border-stone-200 bg-white px-3 py-2">
                                  <div className="text-sm font-medium text-roman-text-main">{item.name}</div>
                                  <div className="text-[11px] text-roman-text-sub">
                                    {(macroServices.find(macro => macro.id === item.macroServiceId)?.name || item.macroServiceId)} · {item.code || item.id}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="space-y-3 border-t border-stone-200 pt-4">
                              <input
                                type="text"
                                value={serviceDraft.name}
                                onChange={event => setServiceDraft(current => ({ ...current, name: event.target.value }))}
                                placeholder="Nome do serviço"
                                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              />
                              <input
                                type="text"
                                value={serviceDraft.code}
                                onChange={event => setServiceDraft(current => ({ ...current, code: event.target.value }))}
                                placeholder="Código opcional"
                                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              />
                              <select
                                value={serviceDraft.macroServiceId}
                                onChange={event => setServiceDraft(current => ({ ...current, macroServiceId: event.target.value }))}
                                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              >
                                <option value="">Selecione o macroserviço</option>
                                {macroServices.map(item => (
                                  <option key={item.id} value={item.id}>{item.name}</option>
                                ))}
                              </select>
                              <div className="max-h-28 space-y-2 overflow-y-auto rounded-xl border border-stone-200 bg-white px-3 py-2">
                                {materials.map(item => {
                                  const checked = serviceDraft.suggestedMaterialIds.includes(item.id);
                                  return (
                                    <label key={item.id} className="flex items-center gap-2 text-xs text-roman-text-main">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          setServiceDraft(current => ({
                                            ...current,
                                            suggestedMaterialIds: checked
                                              ? current.suggestedMaterialIds.filter(id => id !== item.id)
                                              : [...current.suggestedMaterialIds, item.id],
                                          }))
                                        }
                                      />
                                      {item.name}
                                    </label>
                                  );
                                })}
                              </div>
                              <button
                                onClick={() => void handleSaveService()}
                                className="w-full rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
                              >
                                Salvar Serviço
                              </button>
                            </div>
                          </section>

                          <section className="rounded-[1.25rem] border border-stone-200 bg-stone-50 p-4 space-y-4">
                            <div>
                              <h3 className="font-serif text-lg text-roman-text-main">Materiais</h3>
                              <p className="text-xs text-roman-text-sub mt-1">Materiais sugeridos para padronização de orçamento.</p>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                              {materials.map(item => (
                                <div key={item.id} className="rounded-xl border border-stone-200 bg-white px-3 py-2">
                                  <div className="text-sm font-medium text-roman-text-main">{item.name}</div>
                                  <div className="text-[11px] text-roman-text-sub">{item.code || item.id}{item.unit ? ` · ${item.unit}` : ''}</div>
                                </div>
                              ))}
                            </div>
                            <div className="space-y-3 border-t border-stone-200 pt-4">
                              <input
                                type="text"
                                value={materialDraft.name}
                                onChange={event => setMaterialDraft(current => ({ ...current, name: event.target.value }))}
                                placeholder="Nome do material"
                                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              />
                              <input
                                type="text"
                                value={materialDraft.code}
                                onChange={event => setMaterialDraft(current => ({ ...current, code: event.target.value }))}
                                placeholder="Código opcional"
                                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              />
                              <input
                                type="text"
                                value={materialDraft.unit}
                                onChange={event => setMaterialDraft(current => ({ ...current, unit: event.target.value }))}
                                placeholder="Unidade (ex: m², un, lata)"
                                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              />
                              <button
                                onClick={() => void handleSaveMaterial()}
                                className="w-full rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
                              >
                                Salvar Material
                              </button>
                            </div>
                          </section>
                        </div>

                        <section className="rounded-[1.25rem] border border-stone-200 bg-stone-50 p-4">
                          <div className="flex items-center justify-between gap-4 mb-4">
                            <div>
                              <h3 className="font-serif text-lg text-roman-text-main">Fornecedores preferenciais por histórico</h3>
                              <p className="text-xs text-roman-text-sub mt-1">Base persistida a partir das aprovações de orçamento dos últimos 24 meses.</p>
                            </div>
                            <div className="text-xs text-roman-text-sub">{vendorPreferences.length} registro(s)</div>
                          </div>

                          {vendorPreferences.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-stone-300 bg-white p-4 text-sm text-roman-text-sub">
                              Ainda não há preferências persistidas. Elas passam a ser geradas quando a diretoria aprova uma cotação.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                              {vendorPreferences.slice(0, 12).map(item => (
                                <div key={item.id} className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-medium text-roman-text-main">{item.vendor}</div>
                                      <div className="text-[11px] text-roman-text-sub">
                                        {item.scopeType === 'material' ? 'Material' : item.scopeType === 'service' ? 'Serviço' : 'Macroserviço'} · {item.scopeName}
                                      </div>
                                    </div>
                                    <div className="text-right text-[11px] text-roman-text-sub">
                                      <div>{item.approvalCount} aprovação(ões)</div>
                                      <div>{item.lastTicketId || '-'}</div>
                                    </div>
                                  </div>
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-roman-text-sub">
                                    <div>
                                      Média aprovada: {item.averageApprovedValue != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.averageApprovedValue) : '-'}
                                    </div>
                                    <div>
                                      Média unitária: {item.averageUnitPrice != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.averageUnitPrice) : '-'}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
                      </div>
                    )}
                  </>
                )}

                {section === 'integrations' && (
                  <>
                    <div className="flex items-center justify-between mb-6 gap-4">
                      <div>
                        <h2 className="font-serif text-xl font-medium text-roman-text-main">Integrações e Legado</h2>
                        <p className="text-sm text-roman-text-sub font-serif italic">Status operacional do ambiente e compatibilidade com dados antigos.</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => void handleRunBackfill()}
                          className="px-4 py-2 bg-roman-sidebar text-white rounded-sm text-sm font-medium hover:bg-stone-900 flex items-center gap-2 disabled:opacity-60"
                          disabled={backfillLoading || integrationsLoading}
                        >
                          {backfillLoading ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
                          Executar Backfill
                        </button>
                        <button
                          onClick={() => void loadIntegrations()}
                          className="px-4 py-2 border border-roman-border rounded-sm text-sm font-medium text-roman-text-main hover:border-roman-primary flex items-center gap-2"
                          disabled={integrationsLoading || backfillLoading}
                        >
                          <RefreshCw size={14} className={integrationsLoading ? 'animate-spin' : ''} />
                          Atualizar
                        </button>
                      </div>
                    </div>

                    <div className="mb-4 space-y-3">
                      {integrationsError && <FeedbackBanner tone="error">{integrationsError}</FeedbackBanner>}
                      {backfillError && <FeedbackBanner tone="error">{backfillError}</FeedbackBanner>}
                      {backfillResult && (
                        <FeedbackBanner tone="success">
                          <div>
                            <div className="font-medium">Backfill executado com sucesso.</div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                              <div>Usuários: {backfillResult.updatedUsers}</div>
                              <div>Tickets: {backfillResult.updatedTickets}</div>
                              <div>Notificações: {backfillResult.updatedNotifications}</div>
                              <div>SLA: {backfillResult.updatedSla}</div>
                            </div>
                          </div>
                        </FeedbackBanner>
                      )}
                    </div>

                    {integrationsLoading && (
                      <div className="py-10 text-center text-roman-text-sub flex items-center justify-center gap-3">
                        <Loader2 size={18} className="animate-spin" />
                        Validando integrações...
                      </div>
                    )}

                    {!integrationsLoading && integrationsHealth && (
                      <div className="space-y-5">
                        <EmailHealthView embedded />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <IntegrationStatusCard title="Firebase Web" check={clientFirebaseCheck} />
                          <IntegrationStatusCard title="Firebase Admin" check={integrationsHealth.checks.firebaseAdmin} />
                          <IntegrationStatusCard title="Auth" check={integrationsHealth.checks.auth} />
                          <IntegrationStatusCard title="Storage" check={integrationsHealth.checks.storage} />
                          <IntegrationStatusCard title="E-mail" check={integrationsHealth.checks.email} />
                        </div>

                        {legacyHealth && (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {legacyCards.map(card => (
                                <div key={card.label} className="rounded-[1.1rem] border border-stone-200 bg-stone-50 p-4">
                                  <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">{card.label}</div>
                                  <div className="text-3xl font-serif text-roman-text-main">{card.value}</div>
                                </div>
                              ))}
                            </div>

                            <div className="rounded-[1.25rem] border border-stone-200 bg-stone-50 p-4">
                              <div className="flex items-center gap-2 text-roman-text-main font-medium mb-3">
                                <Database size={16} />
                                Amostras de legado
                              </div>

                              <div className="space-y-3 text-sm text-roman-text-sub">
                                <div>
                                  <div className="font-medium text-roman-text-main">Usuários legados</div>
                                  <div>
                                    {legacyHealth.samples.legacyUsers.length > 0
                                      ? legacyHealth.samples.legacyUsers.map(user => `${user.email} (${user.role})`).join(', ')
                                      : 'Nenhum.'}
                                  </div>
                                </div>

                                <div>
                                  <div className="font-medium text-roman-text-main">Tickets sem catálogo</div>
                                  <div>
                                    {legacyHealth.samples.ticketsMissingCatalog.length > 0
                                      ? legacyHealth.samples.ticketsMissingCatalog.map(ticket => ticket.id).join(', ')
                                      : 'Nenhum.'}
                                  </div>
                                </div>

                                <div>
                                  <div className="font-medium text-roman-text-main">Notificações com time legado</div>
                                  <div>
                                    {legacyHealth.samples.notificationsLegacy.length > 0
                                      ? legacyHealth.samples.notificationsLegacy.map(item => item.id).join(', ')
                                      : 'Nenhuma.'}
                                  </div>
                                </div>

                                <div>
                                  <div className="font-medium text-roman-text-main">SLA</div>
                                  <div>
                                    {legacyHealth.samples.sla
                                      ? `rules=${legacyHealth.samples.sla.hasRules ? 'ok' : 'faltando'} · legacyHours=${
                                          legacyHealth.samples.sla.hasLegacyHours ? 'sim' : 'não'
                                        }`
                                      : 'Documento ausente.'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {pendingCatalogDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.18)]">
            <div className="border-b border-stone-200 bg-[linear-gradient(135deg,#fff7ed_0%,#fff 100%)] px-6 py-5">
              <div className="text-[10px] uppercase tracking-[0.28em] text-red-700">Confirmação</div>
              <h3 className="mt-3 text-2xl font-serif text-roman-text-main">
                {pendingCatalogDelete.entity === 'regions' ? 'Excluir região' : 'Excluir sede'}
              </h3>
              <p className="mt-2 text-sm text-roman-text-sub">
                Essa ação remove permanentemente {pendingCatalogDelete.label}. Se houver vínculo operacional, a exclusão será bloqueada pelo sistema.
              </p>
            </div>
            <div className="px-6 py-5 text-sm text-roman-text-sub">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                <strong>Item:</strong> {pendingCatalogDelete.label}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-stone-200 px-6 py-4">
              <button
                onClick={() => setPendingCatalogDelete(null)}
                disabled={catalogDeleting}
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-roman-text-main hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleDeleteCatalogItem(pendingCatalogDelete.entity, pendingCatalogDelete.id, pendingCatalogDelete.label)}
                disabled={catalogDeleting}
                className="inline-flex items-center gap-2 rounded-full bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {catalogDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {catalogDeleting ? 'Excluindo...' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



