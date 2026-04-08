import { useState, useCallback } from 'react';

interface UseActionOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  successDuration?: number;
  errorDuration?: number;
}

export function useAction(options: UseActionOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const execute = useCallback(async (
    action: () => Promise<any> | any,
    config?: { 
      successMessage?: string; 
      errorMessage?: string;
      delay?: number;
    }
  ) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (config?.delay) {
        await new Promise(resolve => setTimeout(resolve, config.delay));
      }
      
      await action();
      
      if (config?.successMessage) {
        setSuccess(config.successMessage);
        if (options.successDuration !== 0) {
          setTimeout(() => setSuccess(null), options.successDuration || 3000);
        }
      }
      
      options.onSuccess?.();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : config?.errorMessage || 'Ocorreu um erro inesperado.';
      setError(message);
      options.onError?.(err instanceof Error ? err : new Error(message));
      
      if (options.errorDuration !== 0) {
        setTimeout(() => setError(null), options.errorDuration || 3000);
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setSuccess(null);
  }, []);

  return { isLoading, error, success, execute, reset };
}
