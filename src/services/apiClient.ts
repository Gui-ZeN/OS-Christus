export async function readApiJson<T = unknown>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
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
  if (!response.ok) {
    throw new Error(resolveApiError(payload, fallbackMessage));
  }
  return payload as T;
}
