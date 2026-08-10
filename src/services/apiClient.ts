import { UserFacingError } from '../utils/errorMessage';

/**
 * Erro que veio da NOSSA API — e portanto já está em português, escrito para quem
 * usa o sistema. Carrega o status junto porque algumas telas decidem por ele (401
 * manda para o login, 409 pede recarregar).
 */
export class ApiError extends UserFacingError {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

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
    throw new ApiError(
      'O anexo enviado é muito grande. Envie uma imagem menor ou tente registrar a solicitação sem foto.',
      413
    );
  }
  if (!response.ok) {
    throw new ApiError(resolveApiError(payload, fallbackMessage), response.status);
  }
  if (!payload) {
    throw new ApiError(`${fallbackMessage} (resposta inválida do servidor)`, response.status);
  }
  return payload as T;
}
