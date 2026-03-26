import { expectApiJson } from './apiClient';

type PasswordResetResponse = {
  ok: boolean;
  message?: string;
};

export async function requestPasswordResetInApi(email: string) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Informe um e-mail para recuperar a senha.');
  }

  const response = await fetch('/api/auth-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalizedEmail }),
  });

  const json = await expectApiJson<PasswordResetResponse>(
    response,
    'Nao foi possivel enviar o e-mail de recuperacao agora. Tente novamente em instantes.'
  );

  if (!json.ok) {
    throw new Error('Nao foi possivel processar a recuperacao de senha.');
  }
}
