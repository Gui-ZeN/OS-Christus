import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

interface SplitLoginViewProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onGoogleLogin?: () => Promise<void>;
  onBack: () => void;
  authEnabled?: boolean;
}

export function SplitLoginView({ onLogin, onGoogleLogin, onBack, authEnabled = false }: SplitLoginViewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onLogin(loginEmail.trim().toLowerCase(), loginPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!onGoogleLogin) return;
    setIsGoogleLoading(true);
    setError(null);
    try {
      await onGoogleLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login com Google.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="h-screen w-full overflow-auto bg-roman-bg px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-full w-full max-w-[1420px] items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[24px] border border-roman-border bg-roman-surface shadow-[0_22px_70px_rgba(25,20,16,0.12)] lg:grid-cols-[1.05fr_1fr]">
          <section className="relative hidden min-h-[760px] overflow-hidden border-r border-roman-border lg:block">
            <div className="absolute inset-0 bg-roman-sidebar" />
            <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.05)_0_2px,transparent_2px_42px)]" />
            <div className="relative z-10 flex h-full flex-col justify-between p-14">
              <div>
                <p className="text-[12px] uppercase tracking-[0.2em] text-white/55">Unichristus · Infraestrutura</p>
                <h1 className="mt-8 text-6xl font-serif leading-[1.08] text-white">
                  Gestão de
                  <br />
                  <span className="text-roman-primary italic">Manutenção</span>
                </h1>
                <p className="mt-8 max-w-md text-2xl leading-[1.45] text-white/55">
                  Painel centralizado de triagem, abertura e acompanhamento de ordens de serviço.
                </p>
              </div>
              <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-base leading-relaxed text-white/70">
                Ambiente interno para gestão de chamados, aprovações e comunicação operacional.
              </div>
            </div>
          </section>

          <section className="min-h-[760px] bg-roman-surface p-7 sm:p-10 lg:p-14">
            <button
              onClick={onBack}
              className="mb-14 inline-flex items-center gap-2 text-base text-roman-text-sub transition-colors hover:text-roman-text-main"
            >
              <ArrowLeft size={18} /> Voltar
            </button>

            <p className="text-[12px] uppercase tracking-[0.2em] text-roman-text-sub">Acesso restrito</p>
            <h2 className="mt-4 text-5xl font-serif text-roman-text-main">Entrar no sistema</h2>
            <p className="mt-3 text-2xl text-roman-text-sub">Apenas colaboradores autorizados.</p>

            <div className="mt-12 space-y-6">
              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
                  <div className="font-semibold text-red-900">Não foi possível entrar</div>
                  <div className="mt-1">{error}</div>
                </div>
              )}

              <div>
                <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.16em] text-roman-text-sub">E-mail institucional</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={event => setLoginEmail(event.target.value)}
                  placeholder="seu@email.com"
                  className="w-full rounded-2xl border border-roman-border bg-roman-bg px-5 py-4 text-xl text-roman-text-main outline-none transition-colors placeholder:text-roman-text-sub/70 focus:border-roman-primary"
                />
              </div>

              <div>
                <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.16em] text-roman-text-sub">Senha</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={event => setLoginPassword(event.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-2xl border border-roman-border bg-roman-bg px-5 py-4 text-xl text-roman-text-main outline-none transition-colors placeholder:text-roman-text-sub/70 focus:border-roman-primary"
                />
              </div>

              <button
                onClick={() => void handleLogin()}
                disabled={isLoading || isGoogleLoading || !loginEmail.trim() || !loginPassword.trim()}
                className="mt-3 inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-roman-border bg-roman-sidebar px-6 py-4 text-xl font-medium text-white transition-colors hover:bg-roman-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : <>Acessar o sistema <ArrowRight size={20} /></>}
              </button>

              {authEnabled && onGoogleLogin && (
                <>
                  <div className="mt-7 flex items-center gap-4 text-base text-roman-text-sub">
                    <div className="h-px flex-1 bg-roman-border" />
                    <span>ou continue com</span>
                    <div className="h-px flex-1 bg-roman-border" />
                  </div>

                  <button
                    onClick={() => void handleGoogleLogin()}
                    disabled={isLoading || isGoogleLoading}
                    className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-roman-border bg-roman-bg px-6 py-4 text-xl font-medium text-roman-text-main transition-colors hover:border-roman-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isGoogleLoading ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <>
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-[18px] font-semibold text-[#4285F4]">G</span>
                        Entrar com Google
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
