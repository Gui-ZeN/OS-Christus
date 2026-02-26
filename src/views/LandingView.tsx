import React from 'react';
import { Landmark, ClipboardList, Lock, ArrowRight } from 'lucide-react';

interface LandingViewProps {
  onOpenForm: () => void;
  onLogin: () => void;
}

export function LandingView({ onOpenForm, onLogin }: LandingViewProps) {
  return (
    <div className="h-screen w-full bg-roman-bg flex flex-col items-center justify-center relative overflow-hidden">
      {/* Decorative lines */}
      <div className="absolute top-0 left-0 w-full h-0.5 bg-roman-primary opacity-60"></div>
      <div className="absolute bottom-0 left-0 w-full h-0.5 bg-roman-border"></div>
      <div className="absolute top-12 left-12 w-px h-32 bg-roman-border opacity-40"></div>
      <div className="absolute top-12 right-12 w-px h-32 bg-roman-border opacity-40"></div>
      <div className="absolute bottom-12 left-12 w-px h-32 bg-roman-border opacity-40"></div>
      <div className="absolute bottom-12 right-12 w-px h-32 bg-roman-border opacity-40"></div>

      {/* Header */}
      <div className="text-center mb-16">
        <div className="flex items-center justify-center gap-3 text-roman-primary mb-5">
          <Landmark size={44} strokeWidth={1.2} />
        </div>
        <h1 className="text-5xl font-serif font-medium text-roman-text-main tracking-wide mb-3">
          Gestão de Manutenção
        </h1>
        <p className="text-roman-text-sub font-serif italic text-lg">
          Sistema de Ordens de Serviço
        </p>
      </div>

      {/* Two cards */}
      <div className="flex gap-6 w-full max-w-2xl px-6">
        {/* Public: Open OS */}
        <button
          onClick={onOpenForm}
          className="flex-1 group bg-roman-surface border border-roman-border hover:border-roman-primary/50 rounded-sm p-8 text-left transition-all duration-200 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5"
        >
          <div className="w-12 h-12 bg-roman-primary/10 rounded-sm flex items-center justify-center mb-5 group-hover:bg-roman-primary/20 transition-colors">
            <ClipboardList size={24} className="text-roman-primary" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-serif font-medium text-roman-text-main mb-2">
            Abrir Chamado
          </h2>
          <p className="text-sm text-roman-text-sub leading-relaxed mb-6">
            Registre uma nova solicitação de manutenção. Acompanhe o andamento pelo link enviado ao seu e-mail.
          </p>
          <div className="flex items-center gap-2 text-roman-primary text-sm font-medium">
            Registrar OS <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </div>
        </button>

        {/* Admin: Login */}
        <button
          onClick={onLogin}
          className="flex-1 group bg-roman-sidebar border border-stone-800 hover:border-stone-700 rounded-sm p-8 text-left transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5"
        >
          <div className="w-12 h-12 bg-white/5 rounded-sm flex items-center justify-center mb-5 group-hover:bg-white/10 transition-colors">
            <Lock size={24} className="text-white/70" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-serif font-medium text-white mb-2">
            Acesso à Gestão
          </h2>
          <p className="text-sm text-white/50 leading-relaxed mb-6">
            Área restrita para a equipe de triagem, gestores e diretoria. Requer credenciais de acesso.
          </p>
          <div className="flex items-center gap-2 text-white/60 text-sm font-medium group-hover:text-white/80 transition-colors">
            Entrar no Painel <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </div>

      {/* Footer */}
      <p className="absolute bottom-6 text-[11px] text-roman-text-sub font-serif italic opacity-50">
        Gestão de Ordens de Serviço · Sistema Interno
      </p>
    </div>
  );
}
