import React, { useState } from 'react';
import { Clock, Mail, CheckCircle } from 'lucide-react';

type SettingsSection = 'templates' | 'daily-digest' | 'sla' | 'integrations';

export function SettingsView() {
  const [section, setSection] = useState<SettingsSection>('templates');
  const [digestSaved, setDigestSaved] = useState(false);
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestTime, setDigestTime] = useState('08:00');
  const [digestRecipients, setDigestRecipients] = useState('rafael@empresa.com, diretoria@empresa.com');
  const [digestSubjectText, setDigestSubjectText] = useState('[Resumo Diário] Manutenção — {{data}} | {{novas_os_ontem}} novas OS · {{slas_vencendo_hoje}} SLAs hoje');

  const [templateSaved, setTemplateSaved] = useState(false);
  const [templateSubject, setTemplateSubject] = useState('[Nova OS] {{ticket.id}} - {{ticket.subject}}');
  const [templateBody, setTemplateBody] = useState('Olá {{requester.name}},\n\nSua Ordem de Serviço foi registrada com sucesso.\n\nNúmero: {{ticket.id}}\nAssunto: {{ticket.subject}}\n\nNossa equipe fará a triagem em breve.\n\nAtenciosamente,\nGestão de Manutenção');

  const handleSaveTemplate = () => {
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 3000);
  };

  const handleSaveDigest = () => {
    setDigestSaved(true);
    setTimeout(() => setDigestSaved(false), 3000);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4">
          <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Configurações do Sistema</h1>
          <p className="text-roman-text-sub font-serif italic">Ajustes de e-mail, templates e regras de negócio.</p>
        </header>

        <div className="flex gap-8">
          {/* Settings Nav */}
          <div className="w-64 shrink-0 space-y-2">
            {(
              [
                { key: 'templates', label: 'Templates de E-mail' },
                { key: 'daily-digest', label: 'Resumo Diário (Z6)' },
                { key: 'sla', label: 'Regras de SLA' },
                { key: 'integrations', label: 'Integrações (Drive)' },
              ] as { key: SettingsSection; label: string }[]
            ).map(item => (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
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

          {/* Settings Content */}
          <div className="flex-1 bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">

            {/* Templates */}
            {section === 'templates' && (
              <>
                <h2 className="font-serif text-xl font-medium text-roman-text-main mb-6">Templates de Comunicação</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Gatilho</label>
                    <select className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary">
                      <option>EMAIL-NOVA-OS (Abertura)</option>
                      <option>EMAIL-VISITEC-PENDENTE (Solicitação Técnico)</option>
                      <option>EMAIL-APROV-ORCAMENTO (Para Diretoria)</option>
                      <option>EMAIL-ORCAMENTO-APROVADO (Para Fornecedor)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Assunto do E-mail</label>
                    <input
                      type="text"
                      value={templateSubject}
                      onChange={e => setTemplateSubject(e.target.value)}
                      className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Corpo do E-mail (HTML/Texto)</label>
                    <textarea
                      className="w-full h-40 border border-roman-border rounded-sm p-3 bg-roman-bg text-[13px] font-mono text-roman-text-sub outline-none focus:border-roman-primary"
                      value={templateBody}
                      onChange={e => setTemplateBody(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end">
                    <button onClick={handleSaveTemplate} className="bg-roman-sidebar hover:bg-stone-900 text-white px-6 py-2 rounded-sm font-medium transition-colors flex items-center gap-2">
                      {templateSaved ? <><CheckCircle size={15} /> Salvo!</> : 'Salvar Template'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Daily Digest (Z6) */}
            {section === 'daily-digest' && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="font-serif text-xl font-medium text-roman-text-main">Resumo Diário Automático</h2>
                    <p className="text-xs text-roman-text-sub font-serif italic mt-1">
                      E-mail gerado pelo Cron e enviado via SendGrid toda manhã.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div
                      onClick={() => setDigestEnabled(v => !v)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${digestEnabled ? 'bg-roman-primary' : 'bg-roman-border'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${digestEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}></span>
                    </div>
                    <span className="text-xs font-medium text-roman-text-sub">{digestEnabled ? 'Ativo' : 'Pausado'}</span>
                  </label>
                </div>

                <div className="space-y-6">
                  {/* Schedule */}
                  <div className="bg-roman-bg border border-roman-border rounded-sm p-4">
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-3 flex items-center gap-2">
                      <Clock size={12} /> Horário de Envio (Cron)
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="time"
                        value={digestTime}
                        onChange={e => setDigestTime(e.target.value)}
                        className="border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                      />
                      <span className="text-xs text-roman-text-sub">Fuso: America/Fortaleza (BRT -3)</span>
                    </div>
                  </div>

                  {/* Recipients */}
                  <div>
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5 flex items-center gap-2">
                      <Mail size={12} /> Destinatários (separados por vírgula)
                    </label>
                    <input
                      type="text"
                      value={digestRecipients}
                      onChange={e => setDigestRecipients(e.target.value)}
                      className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                    />
                  </div>

                  {/* Template Content */}
                  <div>
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-3">
                      Conteúdo do Resumo (Template SendGrid Separado)
                    </label>
                    <div className="space-y-3">
                      {[
                        {
                          var: '{{novas_os_ontem}}',
                          label: 'OS abertas ontem',
                          desc: 'Contagem de novas OS registradas no dia anterior.',
                        },
                        {
                          var: '{{slas_vencendo_hoje}}',
                          label: 'SLAs vencendo hoje',
                          desc: 'Lista de OS cujo prazo expira até 23h59 de hoje.',
                        },
                        {
                          var: '{{os_bloqueadas_diretor}}',
                          label: 'OS bloqueadas aguardando diretor (+2 dias)',
                          desc: 'OS em status de aprovação há mais de 2 dias sem resposta.',
                        },
                        {
                          var: '{{os_em_andamento_criticas}}',
                          label: 'Execuções críticas em aberto',
                          desc: 'OS Urgente ou Alta em andamento há mais de 7 dias.',
                        },
                      ].map(item => (
                        <div key={item.var} className="flex items-start gap-3 p-3 bg-roman-bg border border-roman-border rounded-sm">
                          <code className="text-roman-primary text-xs font-mono bg-roman-primary/10 px-2 py-1 rounded whitespace-nowrap mt-0.5">
                            {item.var}
                          </code>
                          <div>
                            <p className="text-xs font-medium text-roman-text-main">{item.label}</p>
                            <p className="text-[11px] text-roman-text-sub mt-0.5">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Template Subject */}
                  <div>
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Assunto do E-mail</label>
                    <input
                      type="text"
                      value={digestSubjectText}
                      onChange={e => setDigestSubjectText(e.target.value)}
                      className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-mono text-roman-text-sub outline-none focus:border-roman-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-roman-text-sub font-serif italic">
                      Template separado do e-mail de orçamento. Enviado via <strong>SendGrid</strong>.
                    </p>
                    <button
                      onClick={handleSaveDigest}
                      className="bg-roman-sidebar hover:bg-stone-900 text-white px-6 py-2 rounded-sm font-medium transition-colors flex items-center gap-2"
                    >
                      {digestSaved ? <><CheckCircle size={15} /> Salvo!</> : 'Salvar Configuração'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* SLA Rules */}
            {section === 'sla' && (
              <>
                <h2 className="font-serif text-xl font-medium text-roman-text-main mb-6">Regras de SLA</h2>
                <div className="space-y-4">
                  {[
                    { priority: 'Urgente', prazo: '24h', color: 'text-red-600 bg-red-50 border-red-200' },
                    { priority: 'Alta', prazo: '72h', color: 'text-orange-600 bg-orange-50 border-orange-200' },
                    { priority: 'Normal', prazo: '5 dias úteis', color: 'text-blue-600 bg-blue-50 border-blue-200' },
                    { priority: 'Trivial', prazo: '10 dias úteis', color: 'text-stone-600 bg-stone-50 border-stone-200' },
                  ].map(rule => (
                    <div key={rule.priority} className={`flex items-center justify-between p-4 border rounded-sm ${rule.color}`}>
                      <span className="font-medium text-sm">{rule.priority}</span>
                      <span className="font-mono text-sm">{rule.prazo}</span>
                    </div>
                  ))}
                  <p className="text-xs text-roman-text-sub font-serif italic pt-2">
                    Cron de hora em hora atualiza o campo <code className="font-mono">slaStatus</code> no banco. E-mail automático para Rafael + diretor quando vencer.
                  </p>
                </div>
              </>
            )}

            {/* Integrations */}
            {section === 'integrations' && (
              <>
                <h2 className="font-serif text-xl font-medium text-roman-text-main mb-6">Integrações</h2>
                <div className="space-y-4 text-sm text-roman-text-sub font-serif italic">
                  <p>Configurações de integração com Google Drive, SendGrid e futuras APIs.</p>
                  <p className="text-xs">Em desenvolvimento.</p>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
