import React from 'react';

export function SettingsView() {
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
            <button className="w-full text-left px-4 py-2 bg-roman-primary/10 text-roman-primary border-l-2 border-roman-primary font-medium">Templates de E-mail</button>
            <button className="w-full text-left px-4 py-2 text-roman-text-sub hover:bg-roman-surface border-l-2 border-transparent hover:border-roman-border transition-colors">Regras de SLA</button>
            <button className="w-full text-left px-4 py-2 text-roman-text-sub hover:bg-roman-surface border-l-2 border-transparent hover:border-roman-border transition-colors">Integrações (Drive)</button>
          </div>

          {/* Settings Content */}
          <div className="flex-1 bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
            <h2 className="font-serif text-xl font-medium text-roman-text-main mb-6">Templates de Comunicação</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Gatilho</label>
                <select className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary">
                  <option>EMAIL-NOVA-OS (Abertura)</option>
                  <option>EMAIL-VISITEC-PENDENTE (Solicitação Técnico)</option>
                  <option>EMAIL-APROV-ORCAMENTO (Para Diretoria)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Assunto do E-mail</label>
                <input type="text" defaultValue="[Nova OS] {{ticket.id}} - {{ticket.subject}}" className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary" />
              </div>

              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Corpo do E-mail (HTML/Texto)</label>
                <textarea className="w-full h-40 border border-roman-border rounded-sm p-3 bg-roman-bg text-[13px] font-mono text-roman-text-sub outline-none focus:border-roman-primary" defaultValue={`Olá {{requester.name}},\n\nSua Ordem de Serviço foi registrada com sucesso.\n\nNúmero: {{ticket.id}}\nAssunto: {{ticket.subject}}\n\nNossa equipe fará a triagem em breve.\n\nAtenciosamente,\nGestão de Manutenção`}></textarea>
              </div>

              <div className="flex justify-end">
                <button className="bg-roman-sidebar hover:bg-stone-900 text-white px-6 py-2 rounded-sm font-medium transition-colors">
                  Salvar Template
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
