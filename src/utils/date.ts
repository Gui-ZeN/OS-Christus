import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type TimestampLike = {
  toDate?: () => Date;
  seconds?: number;
  _seconds?: number;
};

export function coerceDate(value: unknown, fallback = new Date()): Date {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value;
  }

  if (value && typeof value === 'object') {
    const timestamp = value as TimestampLike;
    if (typeof timestamp.toDate === 'function') {
      const parsed = timestamp.toDate();
      return Number.isNaN(parsed.getTime()) ? fallback : parsed;
    }

    const seconds = typeof timestamp.seconds === 'number' ? timestamp.seconds : timestamp._seconds;
    if (typeof seconds === 'number') {
      const parsed = new Date(seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? fallback : parsed;
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }

  return fallback;
}

export function formatDistanceToNowSafe(value: unknown, fallbackText = '-') {
  const date = coerceDate(value, new Date(NaN));
  if (Number.isNaN(date.getTime())) return fallbackText;
  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
}

export function formatDateTimeSafe(value: unknown, fallbackText = '-') {
  const date = coerceDate(value, new Date(NaN));
  if (Number.isNaN(date.getTime())) return fallbackText;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
