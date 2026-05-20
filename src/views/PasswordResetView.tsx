import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle, Landmark, Loader2 } from 'lucide-react';
import { confirmPasswordResetWithCode, verifyPasswordResetActionCode } from '../services/authClient';

interface PasswordResetViewProps {
  onBack: () => void;
}

export function PasswordResetView({ onBack }: PasswordResetViewProps) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const oobCode = params.get('oobCode') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!oobCode) {
        setError('Link de redefinição inválido. Solicite um novo e-mail de senha.');
        setLoading(false);
        return;
      }
      try {
        const resetEmail = await verifyPasswordResetActionCode(oobCode);
        if (!cancelled) setEmail(resetEmail);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Link de redefinição inválido.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [oobCode]);

  const handleSubmit = async () => {
    if (saving || success) return;
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await confirmPasswordResetWithCode(oobCode, password);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-roman-bg px-5 py-8 text-roman-text-main">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-roman-border bg-roman-surface shadow-[0_28px_80px_rgba(15,23,42,0.12)] lg:grid-cols-[0.95fr_1.05fr]">
          <section className="hidden bg-roman-sidebar p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="flex items-center gap-3 text-roman-primary">
                <Landmark size={28} />
                <span className="font-serif text-xl">OS Christus</span>
              </div>
              <h1 className="mt-12 font-serif text-5xl leading-tight">Defina sua senha de acesso</h1>
              <p className="mt-6 max-w-sm text-lg leading-relaxed text-white/60">
                Use uma senha pessoal para acessar o painel interno de ordens de serviço.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm leading-relaxed text-white/65">
              Este link é individual e pode expirar. Se não funcionar, solicite um novo e-mail de redefinição na tela de login.
            </div>
          </section>

          <section className="p-7 sm:p-10">
            <button
              type="button"
              onClick={onBack}
              className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-roman-text-sub transition-colors hover:text-roman-text-main"
            >
              <ArrowLeft size={16} /> Voltar ao login
            </button>

            <div className="mb-8">
              <p className="text-[11px] uppercase tracking-[0.22em] text-roman-text-sub">Acesso ao sistema</p>
              <h2 className="mt-3 font-serif text-4xl text-roman-text-main">Criar ou redefinir senha</h2>
              <p className="mt-3 text-base leading-relaxed text-roman-text-sub">
                Informe uma nova senha para continuar usando o OS Christus.
              </p>
            </div>

            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-roman-border bg-roman-bg px-4 py-5 text-roman-text-sub">
                <Loader2 size={18} className="animate-spin" /> Validando link de acesso...
              </div>
            ) : success ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-emerald-900">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle size={18} /> Senha definida com sucesso
                </div>
                <p className="mt-2 text-sm">Agora você já pode entrar no sistema com seu e-mail e a nova senha.</p>
                <button
                  type="button"
                  onClick={onBack}
                  className="mt-5 rounded-xl bg-roman-sidebar px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-900"
                >
                  Ir para login
                </button>
              </div>
            ) : (
              <form
                className="space-y-5"
                onSubmit={event => {
                  event.preventDefault();
                  void handleSubmit();
                }}
              >
                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
                    {error}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.16em] text-roman-text-sub">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className="w-full rounded-2xl border border-roman-border bg-roman-bg px-5 py-4 text-lg text-roman-text-main outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.16em] text-roman-text-sub">Nova senha</label>
                  <input
                    type="password"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-roman-border bg-roman-bg px-5 py-4 text-lg text-roman-text-main outline-none transition-colors focus:border-roman-primary"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.16em] text-roman-text-sub">Confirmar senha</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={event => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-roman-border bg-roman-bg px-5 py-4 text-lg text-roman-text-main outline-none transition-colors focus:border-roman-primary"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving || !password || !confirmPassword}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-roman-sidebar px-5 py-4 text-lg font-medium text-white transition-colors hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : null}
                  {saving ? 'Salvando...' : 'Definir senha'}
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
