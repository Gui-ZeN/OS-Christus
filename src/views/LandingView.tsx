import React from 'react';
import { ClipboardList, Lock, ArrowRight } from 'lucide-react';

interface LandingViewProps {
  onOpenForm: () => void;
  onLogin: () => void;
}

export function LandingView({ onOpenForm, onLogin }: LandingViewProps) {
  return (
    <div className="relative h-screen w-full overflow-auto bg-roman-bg px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] items-center justify-center">
        <div className="w-full rounded-[26px] border border-roman-border bg-roman-surface p-6 shadow-[0_22px_70px_rgba(25,20,16,0.08)] sm:p-8 md:p-10">
          <header className="text-center">
            <div className="inline-flex items-center gap-3 rounded-full border border-roman-border bg-roman-bg px-5 py-2 text-[12px] font-medium uppercase tracking-[0.2em] text-roman-text-sub">
              <span className="h-1.5 w-1.5 rounded-full bg-roman-primary" />
              Unichristus · Infraestrutura
              <span className="h-1.5 w-1.5 rounded-full bg-roman-primary" />
            </div>
            <h1 className="mt-6 text-4xl font-serif text-roman-text-main sm:text-5xl md:text-6xl">
              Gestão de <span className="text-roman-primary italic">Manutenção</span>
            </h1>
            <p className="mx-auto mt-4 max-w-3xl text-lg text-roman-text-sub sm:text-2xl">
              Sistema de Ordens de Serviço · Acesso interno
            </p>
          </header>

          <section className="mt-10 grid gap-5 lg:grid-cols-2">
            <button
              onClick={onOpenForm}
              className="group rounded-[22px] border border-roman-border bg-roman-bg p-7 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-roman-primary/50 hover:shadow-lg hover:shadow-black/5 sm:p-8"
            >
              <div className="mb-7 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-roman-border bg-roman-surface text-roman-primary">
                <ClipboardList size={28} strokeWidth={1.8} />
              </div>
              <h2 className="text-3xl font-serif text-roman-text-main">Abrir Chamado</h2>
              <p className="mt-5 max-w-xl text-lg leading-[1.5] text-roman-text-sub">
                Registre uma nova solicitação de manutenção. Acompanhe o andamento pelo link enviado ao seu e-mail.
              </p>
              <div className="mt-12 inline-flex items-center gap-3 text-lg font-medium text-roman-primary">
                Registrar OS <ArrowRight size={22} className="transition-transform group-hover:translate-x-1" />
              </div>
            </button>

            <button
              onClick={onLogin}
              className="group rounded-[22px] border border-roman-border/60 bg-roman-sidebar p-7 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-roman-primary/60 hover:shadow-lg hover:shadow-black/20 sm:p-8"
            >
              <div className="mb-7 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white/85">
                <Lock size={28} strokeWidth={1.8} />
              </div>
              <h2 className="text-3xl font-serif text-white">Acesso à Gestão</h2>
              <p className="mt-5 max-w-xl text-lg leading-[1.5] text-white/65">
                Área restrita para triagem, gestores e diretoria. Requer credenciais de acesso institucionais.
              </p>
              <div className="mt-12 inline-flex items-center gap-3 text-lg font-medium text-white">
                Entrar no painel <ArrowRight size={22} className="transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          </section>

          <footer className="pt-12 text-center text-sm text-roman-text-sub/70 sm:text-base">
            Gestão de Ordens de Serviço · Sistema Interno
          </footer>
        </div>
      </div>
    </div>
  );
}
