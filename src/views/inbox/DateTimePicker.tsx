import { useEffect, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useClickOutside } from '../../hooks/useClickOutside';
import { formatDateTimeSafe } from '../../utils/date';

// DateTimePicker e helpers de data — extraídos do InboxView.

export function formatInputDate(value?: Date | null) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  return value.toISOString().slice(0, 10);
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

export function DateTimePicker({
  value,
  onChange,
  disabled,
  compact = false,
  iconOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const parsedValue = parseInputDateTime(value);
  const [visibleMonth, setVisibleMonth] = useState(() => parsedValue || new Date());
  const wrapperRef = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const selectedDate = value ? value.slice(0, 10) : '';
  const selectedTime = value ? value.slice(11, 16) : '08:00';

  useEffect(() => {
    if (parsedValue) setVisibleMonth(parsedValue);
  }, [value]);

  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const monthLabel = monthStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const leadingDays = monthStart.getDay();
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const todayKey = formatInputDateTime(new Date()).slice(0, 10);
  const days = [
    ...Array.from({ length: leadingDays }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const selectDay = (day: number) => {
    const nextDate = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(buildInputDateTime(nextDate, selectedTime));
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(current => !current)}
        disabled={disabled}
        className={`flex items-center justify-center rounded-sm border border-roman-border bg-roman-surface font-medium text-roman-text-main outline-none transition-colors hover:border-roman-primary disabled:cursor-not-allowed disabled:opacity-60 ${iconOnly ? (compact ? 'h-7 w-7' : 'h-9 w-9') : `w-full gap-2 text-left ${compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-[13px]'}`}`}
        title={`Selecionar data e hora: ${formatDateTimeDisplay(value)}`}
        aria-label={`Selecionar data e hora: ${formatDateTimeDisplay(value)}`}
      >
        <Calendar size={compact ? 13 : 15} className="shrink-0 text-roman-primary" />
        {!iconOnly && <span className="min-w-0 flex-1 truncate">{formatDateTimeDisplay(value)}</span>}
      </button>

      {open && (
        <div className={`absolute ${compact ? 'right-0' : 'left-0'} top-full z-30 mt-2 w-72 rounded-sm border border-roman-border bg-white p-3 text-left shadow-xl`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              className="rounded-sm border border-roman-border p-1 text-roman-text-sub transition-colors hover:border-roman-primary hover:text-roman-text-main"
              aria-label="Mês anterior"
            >
              <ChevronLeft size={15} />
            </button>
            <div className="font-serif text-sm capitalize text-roman-text-main">{monthLabel}</div>
            <button
              type="button"
              onClick={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              className="rounded-sm border border-roman-border p-1 text-roman-text-sub transition-colors hover:border-roman-primary hover:text-roman-text-main"
              aria-label="Próximo mês"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-roman-text-sub">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((label, index) => (
              <div key={`${label}-${index}`}>{label}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              if (!day) return <div key={`blank-${index}`} />;
              const dateKey = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const selected = dateKey === selectedDate;
              const today = dateKey === todayKey;
              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`h-8 rounded-sm text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-roman-primary text-white'
                      : today
                        ? 'border border-roman-primary/40 bg-roman-primary/5 text-roman-primary'
                        : 'text-roman-text-main hover:bg-roman-bg'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 border-t border-roman-border pt-3">
            <label className="mb-1.5 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Horário</label>
            <input
              type="time"
              value={selectedTime}
              onChange={event => onChange(buildInputDateTime(selectedDate || formatInputDateTime(new Date()).slice(0, 10), event.target.value))}
              className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary"
            />
          </div>
        </div>
      )}
    </div>
  );
}
