import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, Database, Loader2, Mail, RefreshCw, ShieldCheck, TriangleAlert, Wrench } from 'lucide-react';
import { runFirestoreLegacyBackfill, type FirestoreBackfillResult } from '../services/adminActionsApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useApp } from '../context/AppContext';
import { isFirebaseAuthConfigured } from '../lib/firebaseClient';
import {
  fetchCatalog,
  saveCatalogEntry,
  type CatalogMacroService,
  type CatalogMaterial,
  type CatalogServiceItem,
  type CatalogVendorPreference,
} from '../services/catalogApi';
import { fetchFirestoreLegacyHealth, type FirestoreLegacyHealth } from '../services/firestoreLegacyHealthApi';
import { fetchIntegrationsHealth, type IntegrationCheck, type IntegrationsHealthResponse } from '../services/integrationsHealthApi';
import { fetchSettings, saveSettings, type DailyDigestSettings, type EmailTemplateSettings, type SlaSettings } from '../services/settingsApi';

type SettingsSection = 'templates' | 'daily-digest' | 'sla' | 'catalog' | 'integrations';

const DEFAULT_TEMPLATE: EmailTemplateSettings = {
  trigger: 'EMAIL-NOVA-OS',
  subject: '[Nova OS] {{ticket.id}} - {{ticket.subject}}',
  body:
    'Olá {{requester.name}},\n\nSua Ordem de Serviço foi registrada com sucesso.\n\nNúmero: {{ticket.id}}\nAssunto: {{ticket.subject}}\n\nNossa equipe fará a triagem em breve.\n\nAtenciosamente,\nGestão de Manutenção',
};

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

export function SettingsView() {
  const { currentUser } = useApp();
  const canAccess = currentUser?.role === 'Admin';
  const canEditSettings = canAccess;
  const [section, setSection] = useState<SettingsSection>('templates');
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
  const [digest, setDigest] = useState<DailyDigestSettings>(DEFAULT_DIGEST);
  const [sla, setSla] = useState<SlaSettings>(DEFAULT_SLA);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogSaved, setCatalogSaved] = useState<string | null>(null);
  const [macroServices, setMacroServices] = useState<CatalogMacroService[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<CatalogServiceItem[]>([]);
  const [materials, setMaterials] = useState<CatalogMaterial[]>([]);
  const [vendorPreferences, setVendorPreferences] = useState<CatalogVendorPreference[]>([]);
  const [macroDraft, setMacroDraft] = useState({ code: '', name: '' });
  const [serviceDraft, setServiceDraft] = useState({ code: '', name: '', macroServiceId: '', suggestedMaterialIds: [] as string[] });
  const [materialDraft, setMaterialDraft] = useState({ code: '', name: '', unit: '' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const remote = await fetchSettings();
        if (cancelled) return;
        setTemplate(remote.emailTemplate || DEFAULT_TEMPLATE);
        setDigest(remote.dailyDigest || DEFAULT_DIGEST);
        setSla(remote.sla || DEFAULT_SLA);
      } catch {
        if (cancelled) return;
        setTemplate(DEFAULT_TEMPLATE);
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
    if (section !== 'catalog') return;
    void loadCatalog();
  }, [section]);

  const handleSaveTemplate = async () => {
    if (!canEditSettings) return;
    try {
      await saveSettings('emailTemplates', template);
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

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4">
          <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Configurações do Sistema</h1>
          <p className="text-roman-text-sub font-serif italic">Ajustes de e-mail, templates, integrações e regras de negócio.</p>
        </header>

        <div className="flex gap-8">
          <div className="w-64 shrink-0 space-y-2">
            {[
              { key: 'templates', label: 'Templates de E-mail' },
              { key: 'daily-digest', label: 'Resumo Diário (Z6)' },
              { key: 'sla', label: 'Regras de SLA' },
              { key: 'catalog', label: 'Catálogo Operacional' },
              { key: 'integrations', label: 'Integrações e Legado' },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setSection(item.key as SettingsSection)}
                className={`w-full text-left px-4 py-2 border-l-2 font-medium transition-colors ${
                  section === item.key
                    ? 'bg-roman-primary/10 text-roman-primary border-roman-primary'
                    : 'text-roman-text-sub hover:bg-roman-surface border-transparent hover:border-roman-border'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex-1 bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
            {loading ? (
              <div className="py-12 text-center text-roman-text-sub flex items-center justify-center gap-3">
                <Loader2 size={18} className="animate-spin" />
                Carregando configurações...
              </div>
            ) : (
              <>
                {section === 'templates' && (
                  <>
                    <h2 className="font-serif text-xl font-medium text-roman-text-main mb-6">Templates de Comunicação</h2>
                    <div className="space-y-6">
                      <div>
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Gatilho</label>
                        <select
                          value={template.trigger}
                          onChange={event => setTemplate(current => ({ ...current, trigger: event.target.value }))}
                          className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                        >
                          <option value="EMAIL-NOVA-OS">EMAIL-NOVA-OS (Abertura)</option>
                          <option value="EMAIL-VISITEC-PENDENTE">EMAIL-VISITEC-PENDENTE (Solicitação Técnico)</option>
                          <option value="EMAIL-APROV-ORCAMENTO">EMAIL-APROV-ORCAMENTO (Para Diretoria)</option>
                          <option value="EMAIL-ORCAMENTO-APROVADO">EMAIL-ORCAMENTO-APROVADO (Para Fornecedor)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Assunto do E-mail</label>
                        <input
                          type="text"
                          value={template.subject}
                          onChange={event => setTemplate(current => ({ ...current, subject: event.target.value }))}
                          className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Corpo do E-mail (HTML/Texto)</label>
                        <textarea
                          className="w-full h-40 border border-roman-border rounded-sm p-3 bg-roman-bg text-[13px] font-mono text-roman-text-sub outline-none focus:border-roman-primary"
                          value={template.body}
                          onChange={event => setTemplate(current => ({ ...current, body: event.target.value }))}
                        />
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={() => void handleSaveTemplate()}
                          className="bg-roman-sidebar hover:bg-stone-900 text-white px-6 py-2 rounded-sm font-medium transition-colors flex items-center gap-2"
                        >
                          {templateSaved ? (
                            <>
                              <CheckCircle size={15} /> Salvo!
                            </>
                          ) : (
                            'Salvar Template'
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {section === 'daily-digest' && (
                  <>
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="font-serif text-xl font-medium text-roman-text-main">Resumo Diário Automático</h2>
                        <p className="text-xs text-roman-text-sub font-serif italic mt-1">E-mail gerado pelo cron toda manhã.</p>
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

                    <div className="space-y-6">
                      <div className="bg-roman-bg border border-roman-border rounded-sm p-4">
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-3 flex items-center gap-2">
                          <Clock size={12} /> Horário de Envio (Cron)
                        </label>
                        <div className="flex items-center gap-4">
                          <input
                            type="time"
                            value={digest.time}
                            onChange={event => setDigest(current => ({ ...current, time: event.target.value }))}
                            className="border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                          />
                          <span className="text-xs text-roman-text-sub">Fuso: America/Fortaleza (BRT -3)</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5 flex items-center gap-2">
                          <Mail size={12} /> Destinatários (separados por vírgula)
                        </label>
                        <input
                          type="text"
                          value={digest.recipients}
                          onChange={event => setDigest(current => ({ ...current, recipients: event.target.value }))}
                          className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Assunto do E-mail</label>
                        <input
                          type="text"
                          value={digest.subject}
                          onChange={event => setDigest(current => ({ ...current, subject: event.target.value }))}
                          className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-mono text-roman-text-sub outline-none focus:border-roman-primary"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <p className="text-xs text-roman-text-sub font-serif italic">Configuração do resumo diário persistida no Firestore.</p>
                        <button
                          onClick={() => void handleSaveDigest()}
                          className="bg-roman-sidebar hover:bg-stone-900 text-white px-6 py-2 rounded-sm font-medium transition-colors flex items-center gap-2"
                        >
                          {digestSaved ? (
                            <>
                              <CheckCircle size={15} /> Salvo!
                            </>
                          ) : (
                            'Salvar Configuração'
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {section === 'sla' && (
                  <>
                    <h2 className="font-serif text-xl font-medium text-roman-text-main mb-6">Regras de SLA</h2>
                    <div className="space-y-4">
                      {(sla.rules || []).map(rule => (
                        <div key={rule.priority} className="flex items-center justify-between p-4 border rounded-sm bg-roman-bg border-roman-border">
                          <span className="font-medium text-sm">{rule.priority}</span>
                          <span className="font-mono text-sm">{rule.prazo}</span>
                        </div>
                      ))}

                      <div className="flex items-center justify-between pt-2">
                        <p className="text-xs text-roman-text-sub font-serif italic">
                          O cron de monitoramento pode usar essas regras como base para alertas e relatórios.
                        </p>
                        <button
                          onClick={() => void handleSaveSla()}
                          className="bg-roman-sidebar hover:bg-stone-900 text-white px-6 py-2 rounded-sm font-medium transition-colors flex items-center gap-2"
                        >
                          {slaSaved ? (
                            <>
                              <CheckCircle size={15} /> Salvo!
                            </>
                          ) : (
                            'Salvar SLA'
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
                        <h2 className="font-serif text-xl font-medium text-roman-text-main">Catálogo Operacional</h2>
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

                    {catalogError && (
                      <div className="mb-4 p-4 border border-red-200 bg-red-50 text-red-700 rounded-sm flex items-center gap-2">
                        <AlertCircle size={16} />
                        {catalogError}
                      </div>
                    )}

                    {catalogSaved && (
                      <div className="mb-4 p-4 border border-green-200 bg-green-50 text-green-700 rounded-sm flex items-center gap-2">
                        <CheckCircle size={16} />
                        {catalogSaved}
                      </div>
                    )}

                    {catalogLoading ? (
                      <div className="py-12 text-center text-roman-text-sub flex items-center justify-center gap-3">
                        <Loader2 size={18} className="animate-spin" />
                        Carregando catálogo...
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                          <section className="border border-roman-border rounded-sm p-4 bg-roman-bg space-y-4">
                            <div>
                              <h3 className="font-serif text-lg text-roman-text-main">Macroserviços</h3>
                              <p className="text-xs text-roman-text-sub mt-1">Classificação macro da manutenção.</p>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                              {macroServices.map(item => (
                                <div key={item.id} className="border border-roman-border rounded-sm bg-roman-surface px-3 py-2">
                                  <div className="text-sm font-medium text-roman-text-main">{item.name}</div>
                                  <div className="text-[11px] text-roman-text-sub">{item.code || item.id}</div>
                                </div>
                              ))}
                            </div>
                            <div className="space-y-3 border-t border-roman-border pt-4">
                              <input
                                type="text"
                                value={macroDraft.name}
                                onChange={event => setMacroDraft(current => ({ ...current, name: event.target.value }))}
                                placeholder="Nome do macroserviço"
                                className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              />
                              <input
                                type="text"
                                value={macroDraft.code}
                                onChange={event => setMacroDraft(current => ({ ...current, code: event.target.value }))}
                                placeholder="Código opcional"
                                className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              />
                              <button
                                onClick={() => void handleSaveMacroService()}
                                className="w-full bg-roman-sidebar hover:bg-stone-900 text-white px-4 py-2 rounded-sm text-sm font-medium"
                              >
                                Salvar Macroserviço
                              </button>
                            </div>
                          </section>

                          <section className="border border-roman-border rounded-sm p-4 bg-roman-bg space-y-4">
                            <div>
                              <h3 className="font-serif text-lg text-roman-text-main">Serviços</h3>
                              <p className="text-xs text-roman-text-sub mt-1">Detalham o tipo real de intervenção.</p>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                              {serviceCatalog.map(item => (
                                <div key={item.id} className="border border-roman-border rounded-sm bg-roman-surface px-3 py-2">
                                  <div className="text-sm font-medium text-roman-text-main">{item.name}</div>
                                  <div className="text-[11px] text-roman-text-sub">
                                    {(macroServices.find(macro => macro.id === item.macroServiceId)?.name || item.macroServiceId)} · {item.code || item.id}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="space-y-3 border-t border-roman-border pt-4">
                              <input
                                type="text"
                                value={serviceDraft.name}
                                onChange={event => setServiceDraft(current => ({ ...current, name: event.target.value }))}
                                placeholder="Nome do serviço"
                                className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              />
                              <input
                                type="text"
                                value={serviceDraft.code}
                                onChange={event => setServiceDraft(current => ({ ...current, code: event.target.value }))}
                                placeholder="Código opcional"
                                className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              />
                              <select
                                value={serviceDraft.macroServiceId}
                                onChange={event => setServiceDraft(current => ({ ...current, macroServiceId: event.target.value }))}
                                className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              >
                                <option value="">Selecione o macroserviço</option>
                                {macroServices.map(item => (
                                  <option key={item.id} value={item.id}>{item.name}</option>
                                ))}
                              </select>
                              <div className="border border-roman-border rounded-sm bg-roman-surface px-3 py-2 max-h-28 overflow-y-auto space-y-2">
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
                                className="w-full bg-roman-sidebar hover:bg-stone-900 text-white px-4 py-2 rounded-sm text-sm font-medium"
                              >
                                Salvar Serviço
                              </button>
                            </div>
                          </section>

                          <section className="border border-roman-border rounded-sm p-4 bg-roman-bg space-y-4">
                            <div>
                              <h3 className="font-serif text-lg text-roman-text-main">Materiais</h3>
                              <p className="text-xs text-roman-text-sub mt-1">Materiais sugeridos para padronização de orçamento.</p>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                              {materials.map(item => (
                                <div key={item.id} className="border border-roman-border rounded-sm bg-roman-surface px-3 py-2">
                                  <div className="text-sm font-medium text-roman-text-main">{item.name}</div>
                                  <div className="text-[11px] text-roman-text-sub">{item.code || item.id}{item.unit ? ` · ${item.unit}` : ''}</div>
                                </div>
                              ))}
                            </div>
                            <div className="space-y-3 border-t border-roman-border pt-4">
                              <input
                                type="text"
                                value={materialDraft.name}
                                onChange={event => setMaterialDraft(current => ({ ...current, name: event.target.value }))}
                                placeholder="Nome do material"
                                className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              />
                              <input
                                type="text"
                                value={materialDraft.code}
                                onChange={event => setMaterialDraft(current => ({ ...current, code: event.target.value }))}
                                placeholder="Código opcional"
                                className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              />
                              <input
                                type="text"
                                value={materialDraft.unit}
                                onChange={event => setMaterialDraft(current => ({ ...current, unit: event.target.value }))}
                                placeholder="Unidade (ex: m², un, lata)"
                                className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              />
                              <button
                                onClick={() => void handleSaveMaterial()}
                                className="w-full bg-roman-sidebar hover:bg-stone-900 text-white px-4 py-2 rounded-sm text-sm font-medium"
                              >
                                Salvar Material
                              </button>
                            </div>
                          </section>
                        </div>

                        <section className="border border-roman-border rounded-sm p-4 bg-roman-bg">
                          <div className="flex items-center justify-between gap-4 mb-4">
                            <div>
                              <h3 className="font-serif text-lg text-roman-text-main">Fornecedores preferenciais por histórico</h3>
                              <p className="text-xs text-roman-text-sub mt-1">Base persistida a partir das aprovações de orçamento dos últimos 24 meses.</p>
                            </div>
                            <div className="text-xs text-roman-text-sub">{vendorPreferences.length} registro(s)</div>
                          </div>

                          {vendorPreferences.length === 0 ? (
                            <div className="text-sm text-roman-text-sub border border-dashed border-roman-border rounded-sm p-4 bg-roman-surface">
                              Ainda não há preferências persistidas. Elas passam a ser geradas quando a diretoria aprova uma cotação.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                              {vendorPreferences.slice(0, 12).map(item => (
                                <div key={item.id} className="border border-roman-border rounded-sm bg-roman-surface px-4 py-3">
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

                    {integrationsError && (
                      <div className="mb-4 p-4 border border-red-200 bg-red-50 text-red-700 rounded-sm flex items-center gap-2">
                        <AlertCircle size={16} />
                        {integrationsError}
                      </div>
                    )}

                    {backfillError && (
                      <div className="mb-4 p-4 border border-red-200 bg-red-50 text-red-700 rounded-sm flex items-center gap-2">
                        <AlertCircle size={16} />
                        {backfillError}
                      </div>
                    )}

                    {backfillResult && (
                      <div className="mb-4 p-4 border border-green-200 bg-green-50 text-green-800 rounded-sm">
                        <div className="font-medium mb-2">Backfill executado com sucesso</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>Usuários: {backfillResult.updatedUsers}</div>
                          <div>Tickets: {backfillResult.updatedTickets}</div>
                          <div>Notificações: {backfillResult.updatedNotifications}</div>
                          <div>SLA: {backfillResult.updatedSla}</div>
                        </div>
                      </div>
                    )}

                    {integrationsLoading && (
                      <div className="py-10 text-center text-roman-text-sub flex items-center justify-center gap-3">
                        <Loader2 size={18} className="animate-spin" />
                        Validando integrações...
                      </div>
                    )}

                    {!integrationsLoading && integrationsHealth && (
                      <div className="space-y-6">
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
                                <div key={card.label} className="border border-roman-border rounded-sm p-4 bg-roman-bg">
                                  <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">{card.label}</div>
                                  <div className="text-3xl font-serif text-roman-text-main">{card.value}</div>
                                </div>
                              ))}
                            </div>

                            <div className="border border-roman-border rounded-sm p-4 bg-roman-bg">
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
    </div>
  );
}

