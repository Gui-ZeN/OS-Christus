import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, Database, Loader2, Mail, RefreshCw } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { useApp } from '../context/AppContext';
import { fetchFirestoreLegacyHealth, type FirestoreLegacyHealth } from '../services/firestoreLegacyHealthApi';
import { fetchSettings, saveSettings, type DailyDigestSettings, type EmailTemplateSettings, type SlaSettings } from '../services/settingsApi';

type SettingsSection = 'templates' | 'daily-digest' | 'sla' | 'integrations';

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

export function SettingsView() {
  const { currentUser } = useApp();
  const canAccess = currentUser?.role === 'Admin';
  const canEditSettings = canAccess;
  const [section, setSection] = useState<SettingsSection>('templates');
  const [loading, setLoading] = useState(true);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [digestSaved, setDigestSaved] = useState(false);
  const [slaSaved, setSlaSaved] = useState(false);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const [legacyHealth, setLegacyHealth] = useState<FirestoreLegacyHealth | null>(null);
  const [template, setTemplate] = useState<EmailTemplateSettings>(DEFAULT_TEMPLATE);
  const [digest, setDigest] = useState<DailyDigestSettings>(DEFAULT_DIGEST);
  const [sla, setSla] = useState<SlaSettings>(DEFAULT_SLA);

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

  useEffect(() => {
    if (section !== 'integrations') return;
    void loadLegacyHealth();
  }, [section]);

  const loadLegacyHealth = async () => {
    setLegacyLoading(true);
    setLegacyError(null);

    try {
      const result = await fetchFirestoreLegacyHealth();
      setLegacyHealth(result);
    } catch (error) {
      setLegacyError(error instanceof Error ? error.message : 'Falha ao carregar diagnóstico.');
    } finally {
      setLegacyLoading(false);
    }
  };

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

  const integrationCards = legacyHealth
    ? [
        { label: 'Usuários com papel legado', value: legacyHealth.summary.legacyUsers },
        { label: 'Tickets sem regionId/siteId', value: legacyHealth.summary.ticketsMissingCatalog },
        { label: 'Notificações com time legado', value: legacyHealth.summary.notificationsLegacy },
        { label: 'SLA com compatibilidade legada', value: legacyHealth.summary.slaLegacy },
      ]
    : [];

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4">
          <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Configurações do Sistema</h1>
          <p className="text-roman-text-sub font-serif italic">Ajustes de e-mail, templates e regras de negócio.</p>
        </header>

        <div className="flex gap-8">
          <div className="w-64 shrink-0 space-y-2">
            {[
              { key: 'templates', label: 'Templates de E-mail' },
              { key: 'daily-digest', label: 'Resumo Diário (Z6)' },
              { key: 'sla', label: 'Regras de SLA' },
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

                {section === 'integrations' && (
                  <>
                    <div className="flex items-center justify-between mb-6 gap-4">
                      <div>
                        <h2 className="font-serif text-xl font-medium text-roman-text-main">Integrações e Legado</h2>
                        <p className="text-sm text-roman-text-sub font-serif italic">Diagnóstico do Firestore e compatibilidade com dados antigos.</p>
                      </div>

                      <button
                        onClick={() => void loadLegacyHealth()}
                        className="px-4 py-2 border border-roman-border rounded-sm text-sm font-medium text-roman-text-main hover:border-roman-primary flex items-center gap-2"
                        disabled={legacyLoading}
                      >
                        <RefreshCw size={14} className={legacyLoading ? 'animate-spin' : ''} />
                        Atualizar
                      </button>
                    </div>

                    {legacyError && (
                      <div className="mb-4 p-4 border border-red-200 bg-red-50 text-red-700 rounded-sm flex items-center gap-2">
                        <AlertCircle size={16} />
                        {legacyError}
                      </div>
                    )}

                    {legacyLoading && (
                      <div className="py-10 text-center text-roman-text-sub flex items-center justify-center gap-3">
                        <Loader2 size={18} className="animate-spin" />
                        Analisando Firestore...
                      </div>
                    )}

                    {!legacyLoading && legacyHealth && (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {integrationCards.map(card => (
                            <div key={card.label} className="border border-roman-border rounded-sm p-4 bg-roman-bg">
                              <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">{card.label}</div>
                              <div className="text-3xl font-serif text-roman-text-main">{card.value}</div>
                            </div>
                          ))}
                        </div>

                        <div className="border border-roman-border rounded-sm p-4 bg-roman-bg">
                          <div className="flex items-center gap-2 text-roman-text-main font-medium mb-3">
                            <Database size={16} />
                            Amostras
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
                                  ? `rules=${legacyHealth.samples.sla.hasRules ? 'ok' : 'faltando'} • legacyHours=${
                                      legacyHealth.samples.sla.hasLegacyHours ? 'sim' : 'não'
                                    }`
                                  : 'Documento ausente.'}
                              </div>
                            </div>
                          </div>
                        </div>
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
