export async function readApiJson<T = unknown>(response: Response): Promise<T | null> {
  const raw = await response.text().catch(() => '');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function resolveApiError(
  payload: unknown,
  fallbackMessage: string
): string {
  if (payload && typeof payload === 'object') {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) {
      return error.trim();
    }
  }
  return fallbackMessage;
}

export async function expectApiJson<T = unknown>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  const payload = await readApiJson<T & { error?: string }>(response);
  if (response.status === 413) {
    throw new Error('O anexo enviado é muito grande. Envie uma imagem menor ou tente registrar a solicitação sem foto.');
  }
  if (!response.ok) {
    throw new Error(resolveApiError(payload, fallbackMessage));
  }
  if (!payload) {
    throw new Error(`${fallbackMessage} (resposta inválida do servidor)`);
  }
  return payload as T;
}
