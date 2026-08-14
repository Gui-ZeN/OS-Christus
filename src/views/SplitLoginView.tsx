import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { mensagemDeErro } from '../utils/errorMessage';
/**
 * A PORTA DO SISTEMA — login e abertura de chamado na MESMA tela.
 *
 * Havia uma landing antes desta, e ela repetia o painel da esquerda daqui: mesmo
 * logo, mesmo "Gestão de Manutenção" em serifa com o dourado no itálico, mesma
 * promessa. O único conteúdo próprio dela eram dois cartões — um para entrar, outro
 * para abrir chamado. Ou seja: as 28 pessoas com acesso pagavam um clique por dia
 * para atravessar uma tela que repetia a seguinte.
 *
 * O caminho do chamado NÃO foi enterrado, e isso é decisão de produto e não de
 * espaço: 98% das OS nascem por e-mail e só 2% pelo formulário (4 de 181 medidas em
 * 13/08), mas a diretoria quer justamente puxar as pessoas para o formulário. Reduzir
 * a presença dele aqui brigaria com a direção — então ele fica visível, ao lado do
 * login, em vez de escondido atrás de mais um clique.
 */
interface SplitLoginViewProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onGoogleLogin?: () => Promise<void>;
  onForgotPassword: (email: string) => Promise<void>;
  /** Ausente quando ESTA é a primeira tela: um "Voltar" sem destino é um laço. */
  onBack?: () => void;
  onOpenForm?: () => void;
  authEnabled?: boolean;
}

export function SplitLoginView({ onLogin, onGoogleLogin, onForgotPassword, onBack, onOpenForm, authEnabled = false }: SplitLoginViewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isPasswordResetLoading, setIsPasswordResetLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [passwordResetFeedback, setPasswordResetFeedback] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onLogin(loginEmail.trim().toLowerCase(), loginPassword);
    } catch (err) {
      setError(mensagemDeErro(err, 'Falha no login.'));
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
      setError(mensagemDeErro(err, 'Falha no login com Google.'));
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = loginEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Informe seu e-mail institucional para recuperar a senha.');
      return;
    }
    setIsPasswordResetLoading(true);
    setError(null);
    setPasswordResetFeedback(null);
    try {
      await onForgotPassword(normalizedEmail);
      setPasswordResetFeedback('Enviamos o e-mail para criar/redefinir sua senha. Verifique sua caixa de entrada.');
    } catch (err) {
      setError(mensagemDeErro(err, 'Falha ao solicitar recuperação de senha.'));
    } finally {
      setIsPasswordResetLoading(false);
    }
  };

  return (
    <div className="h-screen w-full overflow-hidden bg-roman-bg">
      <div className="grid h-full w-full bg-roman-surface lg:grid-cols-[1.05fr_1fr]">
          <section className="relative hidden h-full overflow-hidden border-r border-roman-border lg:block">
            <div className="absolute inset-0 bg-roman-sidebar" />
            <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.05)_0_2px,transparent_2px_42px)]" />
            <div className="relative z-10 flex h-full flex-col justify-between p-14">
              <div>
                <img src="/logo-serv3.svg" alt="Serv3 — Grupo Christus" className="w-full max-w-[320px]" />
                <h1 className="mt-10 text-6xl font-serif leading-[1.08] text-white">
                  Gestão de
                  <br />
                  <span className="text-roman-primary italic">Manutenção</span>
                </h1>
                <p className="mt-8 max-w-md text-2xl leading-[1.45] text-white/55">
                  Painel centralizado de triagem, abertura e acompanhamento de ordens de serviço.
                </p>
              </div>
              <div className="max-w-md rounded-xl border border-white/10 bg-roman-surface/5 px-6 py-5 text-base leading-relaxed text-white/70">
                Ambiente interno para gestão de chamados, aprovações e comunicação operacional.
              </div>
            </div>
          </section>

          <section className="h-full overflow-y-auto overflow-x-hidden bg-roman-surface p-5 sm:p-7 lg:p-8 xl:p-10 2xl:p-12">
            {/* O logo vai DIRETO na superfície clara.
                Ele vinha dentro de uma caixa `bg-roman-sidebar` — um bloco escuro no
                meio de uma tela clara, que o dono apontou como o pior detalhe da tela.
                A caixa não protegia nada: o SVG é predominantemente DOURADO
                (#c9903b, #dba346, #e1b15f…) com detalhes escuros de contorno, então
                ele tem contraste próprio no claro. No escuro é que os detalhes se
                perdiam contra o fundo. */}
            <div className="mb-6 lg:hidden">
              <img src="/logo-serv3.svg" alt="Serv3 — Grupo Christus" className="h-9 w-auto" />
            </div>
            {onBack && (
              <button
                onClick={onBack}
                className="mb-6 inline-flex items-center gap-2 text-sm text-roman-text-sub transition-colors hover:text-roman-text-main lg:mb-8"
              >
                <ArrowLeft size={18} /> Voltar
              </button>
            )}

            <p className="text-xs uppercase tracking-[0.2em] text-roman-text-sub">Acesso restrito</p>
            <h2 className="mt-3 text-3xl font-serif text-roman-text-main lg:text-4xl">Entrar no sistema</h2>
            <p className="mt-2 text-base text-roman-text-sub lg:text-lg">Apenas colaboradores autorizados.</p>

            <div className="mt-6 space-y-4 lg:mt-7">
              {error && (
                <div className="rounded-xl border border-roman-danger/35 bg-roman-danger/12 px-4 py-4 text-sm text-roman-danger">
                  <div className="font-semibold text-roman-danger">Não foi possível entrar</div>
                  <div className="mt-1">{error}</div>
                </div>
              )}
              {passwordResetFeedback && (
                <div className="rounded-xl border border-roman-success/35 bg-roman-success/12 px-4 py-4 text-sm text-roman-success">
                  <div className="font-semibold">Recuperação enviada</div>
                  <div className="mt-1">{passwordResetFeedback}</div>
                </div>
              )}

              <form
                onSubmit={event => {
                  event.preventDefault();
                  void handleLogin();
                }}
                noValidate
              >
                <div className="space-y-6">
                  <div>
                    <label htmlFor="login-email" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.16em] text-roman-text-sub">E-mail institucional</label>
                    <input
                      id="login-email"
                      type="email"
                      value={loginEmail}
                      onChange={event => setLoginEmail(event.target.value)}
                      placeholder="seu@email.com"
                      autoComplete="email"
                      className="w-full rounded-xl border border-roman-border bg-roman-bg px-4 py-3 text-base text-roman-text-main outline-none transition-colors placeholder:text-roman-text-sub focus:border-roman-primary"
                    />
                  </div>

                  <div>
                    <label htmlFor="login-password" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.16em] text-roman-text-sub">Senha</label>
                    <input
                      id="login-password"
                      type="password"
                      value={loginPassword}
                      onChange={event => setLoginPassword(event.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-roman-border bg-roman-bg px-4 py-3 text-base text-roman-text-main outline-none transition-colors placeholder:text-roman-text-sub focus:border-roman-primary"
                    />
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleForgotPassword()}
                        disabled={isLoading || isGoogleLoading || isPasswordResetLoading || !authEnabled}
                        className="text-sm font-medium text-roman-primary transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                      >
                        {isPasswordResetLoading ? 'Enviando...' : 'Esqueci minha senha'}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || isGoogleLoading || isPasswordResetLoading || !loginEmail.trim() || !loginPassword.trim()}
                    className="mt-2 inline-flex w-full items-center justify-center gap-3 rounded-xl border border-roman-border bg-roman-sidebar px-5 py-3 text-base font-medium text-white hover:text-roman-on-primary transition-colors hover:bg-roman-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoading ? <Loader2 size={20} className="animate-spin" /> : <>Acessar o sistema <ArrowRight size={20} /></>}
                  </button>
                </div>
              </form>

              {authEnabled && onGoogleLogin && (
                <>
                  <div className="mt-4 flex items-center gap-4 text-sm text-roman-text-sub">
                    <div className="h-px flex-1 bg-roman-border" />
                    <span>ou continue com</span>
                    <div className="h-px flex-1 bg-roman-border" />
                  </div>

                  <button
                    onClick={() => void handleGoogleLogin()}
                    disabled={isLoading || isGoogleLoading}
                    className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-roman-border bg-roman-bg px-5 py-3 text-base font-medium text-roman-text-main transition-colors hover:border-roman-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isGoogleLoading ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <>
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-roman-surface text-lg font-semibold text-[#4285F4]">G</span>
                        Entrar com Google
                      </>
                    )}
                  </button>
                </>
              )}
            </div>

            {/* NÃO É DA EQUIPE? — o outro caminho, visível sem mais um clique.
                Fica depois do login porque é o menos frequente aqui (28 pessoas
                entram no painel; o formulário abriu 4 OS na história), mas com peso
                próprio: separador, título e seta. Enterrá-lo brigaria com a decisão
                de produto de puxar as pessoas para o formulário. */}
            {onOpenForm && (
              <div className="mt-8 border-t border-roman-border pt-6">
                <p className="text-[11px] font-serif uppercase tracking-[0.2em] text-roman-text-sub">
                  Não é da equipe?
                </p>
                <button
                  onClick={onOpenForm}
                  className="group mt-2 inline-flex w-full items-center justify-between gap-3 rounded-xl border border-roman-border bg-roman-bg px-5 py-4 text-left transition-colors hover:border-roman-primary"
                >
                  <span>
                    <span className="block font-serif text-lg text-roman-text-main">Abrir chamado</span>
                    <span className="mt-0.5 block text-sm text-roman-text-sub">
                      Sem login. O acompanhamento vai por e-mail.
                    </span>
                  </span>
                  <ArrowRight
                    size={20}
                    className="shrink-0 text-roman-primary transition-transform group-hover:translate-x-1"
                  />
                </button>
              </div>
            )}
          </section>
      </div>
    </div>
  );
}
