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

// Helpers de <input type="date"/"datetime-local"> — ficavam no DateTimePicker.tsx,
// o que obrigava modulos puros a importar um componente React so para formatar data.
//
// As duas corrigem o fuso antes de serializar. `formatInputDate` NAO corrigia: usava
// `toISOString()` direto, e em fuso negativo (Fortaleza e UTC-3) isso ADIANTA a data
// em um dia a partir das 21h. Era o P3 do backlog.
//
// Chegava ao usuario no checklist de encerramento financeiro, que pre-preenche
// "servico iniciado em" e "servico concluido em" (utils/financeClosure.ts): um
// registro salvo as 21h30 voltava para a tela com a data do dia seguinte. Data errada
// em registro financeiro nao e detalhe de UI, e o conserto e o mesmo que a irmã ja
// fazia — daí terem virado uma coisa só.
export function formatInputDate(value?: Date | null) {
  return formatInputDateTime(value).slice(0, 10);
}

export function formatInputDateTime(value?: Date | null) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  const offsetMs = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function parseInputDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildInputDateTime(datePart: string, timePart: string) {
  if (!datePart) return '';
  return `${datePart}T${timePart || '00:00'}`;
}

export function formatDateTimeDisplay(value: string) {
  const parsed = parseInputDateTime(value);
  if (!parsed) return 'Selecionar data';
  return formatDateTimeSafe(parsed);
}

export function formatShortDate(value?: Date | null) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return 'Não definido';
  return value.toLocaleDateString('pt-BR');
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
