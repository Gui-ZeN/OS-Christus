import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Landmark, Loader2, Lock } from 'lucide-react';

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
    <div className="h-screen w-full bg-roman-bg flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-0.5 bg-roman-primary opacity-60"></div>
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-roman-surface rounded-full border border-roman-border opacity-30"></div>
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-roman-surface rounded-full border border-roman-border opacity-30"></div>

      <button
        onClick={onBack}
        className="absolute top-8 left-8 flex items-center gap-2 text-roman-text-sub hover:text-roman-text-main text-sm transition-colors group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
        Voltar
      </button>

      <div className="flex items-center gap-3 text-roman-primary mb-10">
        <Landmark size={32} strokeWidth={1.3} />
        <span className="font-serif text-xl text-roman-text-main tracking-wide">Gestão de Manutenção</span>
      </div>

      <div className="w-full max-w-md bg-roman-surface border border-roman-border p-10 rounded-sm shadow-xl relative z-10">
        <div className="flex justify-center mb-6 text-roman-primary">
          <Lock size={40} strokeWidth={1.5} />
        </div>
        <h2 className="text-3xl font-serif text-center text-roman-text-main mb-2">Acesso Restrito</h2>
        <p className="text-center text-roman-text-sub font-serif italic mb-8">Painel de Gestão e Triagem</p>

        <div className="space-y-5">
          {error && <div className="border border-red-200 bg-red-50 text-red-700 rounded-sm px-4 py-3 text-sm">{error}</div>}
          <div>
            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">
              Identificação (E-mail)
            </label>
            <input
              type="email"
              value={loginEmail}
              onChange={event => setLoginEmail(event.target.value)}
              className="w-full border border-roman-border rounded-sm px-4 py-3 bg-roman-bg text-[14px] font-medium text-roman-text-main outline-none focus:border-roman-primary transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">
              Código de Acesso (Senha)
            </label>
            <input
              type="password"
              value={loginPassword}
              onChange={event => setLoginPassword(event.target.value)}
              className="w-full border border-roman-border rounded-sm px-4 py-3 bg-roman-bg text-[14px] font-medium text-roman-text-main outline-none focus:border-roman-primary transition-colors"
            />
          </div>
          <button
            onClick={() => void handleLogin()}
            disabled={isLoading || isGoogleLoading || !loginEmail.trim() || !loginPassword.trim()}
            className="w-full bg-roman-sidebar hover:bg-stone-900 text-white py-3 rounded-sm font-serif tracking-wide text-base transition-colors flex items-center justify-center gap-2 mt-4 disabled:opacity-70"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <>Acessar o Sistema <ArrowRight size={18} /></>}
          </button>

          {authEnabled && onGoogleLogin && (
            <button
              onClick={() => void handleGoogleLogin()}
              disabled={isLoading || isGoogleLoading}
              className="w-full border border-roman-border hover:border-roman-primary bg-roman-bg text-roman-text-main py-3 rounded-sm font-medium transition-colors flex items-center justify-center gap-3 disabled:opacity-70"
            >
              {isGoogleLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <span className="text-base leading-none">G</span>
                  Entrar com Google
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
