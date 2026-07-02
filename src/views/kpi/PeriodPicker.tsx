import React, { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export type PeriodMode = 'month' | 'semester' | 'custom' | 'specificMonth' | 'range';

interface PeriodPickerProps {
  period: PeriodMode;
  selectedMonth: number;
  selectedYear: number;
  customStart: string;
  customEnd: string;
  minYear: number;
  maxYear: number;
  label: string;
  onQuick: (p: 'month' | 'semester' | 'custom') => void;
  onMonth: (month: number, year: number) => void;
  onRange: (start: string, end: string) => void;
}

/**
 * Seletor de período do painel: um único botão que abre um popover com atalhos
 * rápidos (este mês / 6 / 12 meses), um calendário de meses e um intervalo
 * personalizado (de–até). Substitui o antigo toggle de 4 botões + selects soltos.
 */
export function PeriodPicker({
  period,
  selectedMonth,
  selectedYear,
  customStart,
  customEnd,
  minYear,
  maxYear,
  label,
  onQuick,
  onMonth,
  onRange,
}: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const [navYear, setNavYear] = useState(selectedYear);
  const [rangeStart, setRangeStart] = useState(customStart);
  const [rangeEnd, setRangeEnd] = useState(customEnd);
  const ref = useRef<HTMLDivElement>(null);

  // Ao abrir, sincroniza o calendário/inputs com o estado atual.
  useEffect(() => {
    if (!open) return;
    setNavYear(selectedYear);
    setRangeStart(customStart);
    setRangeEnd(customEnd);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const quick = [
    { key: 'month', label: 'Este mês' },
    { key: 'semester', label: '6 meses' },
    { key: 'custom', label: '12 meses' },
  ] as const;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-roman-border bg-roman-bg px-3 py-2 text-sm font-medium text-roman-text-main transition-colors hover:border-roman-primary/50"
      >
        <Calendar size={15} className="text-roman-primary" />
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDown size={14} className={`text-roman-text-sub transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-xl border border-roman-border bg-roman-surface p-3 shadow-xl">
          {/* Atalhos */}
          <div className="flex gap-1.5">
            {quick.map(q => (
              <button
                key={q.key}
                type="button"
                onClick={() => {
                  onQuick(q.key);
                  setOpen(false);
                }}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                  period === q.key
                    ? 'bg-roman-primary text-white shadow-sm'
                    : 'text-roman-text-sub hover:bg-roman-bg hover:text-roman-text-main'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>

          <div className="my-3 border-t border-roman-border/60" />

          {/* Calendário de meses */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setNavYear(y => Math.max(minYear, y - 1))}
              disabled={navYear <= minYear}
              className="rounded p-1 text-roman-text-sub transition-colors hover:bg-roman-bg disabled:opacity-30"
              aria-label="Ano anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-serif text-sm font-medium text-roman-text-main">{navYear}</span>
            <button
              type="button"
              onClick={() => setNavYear(y => Math.min(maxYear, y + 1))}
              disabled={navYear >= maxYear}
              className="rounded p-1 text-roman-text-sub transition-colors hover:bg-roman-bg disabled:opacity-30"
              aria-label="Próximo ano"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS_SHORT.map((m, i) => {
              const active = period === 'specificMonth' && selectedMonth === i && selectedYear === navYear;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onMonth(i, navYear);
                    setOpen(false);
                  }}
                  className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                    active ? 'bg-roman-primary text-white shadow-sm' : 'text-roman-text-main hover:bg-roman-bg'
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>

          <div className="my-3 border-t border-roman-border/60" />

          {/* Intervalo personalizado */}
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-roman-text-sub">
            Período personalizado
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={rangeStart}
              max={rangeEnd || undefined}
              onChange={e => setRangeStart(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-roman-border bg-roman-bg px-2 py-1.5 text-xs text-roman-text-main outline-none focus:border-roman-primary"
            />
            <span className="text-xs text-roman-text-sub">até</span>
            <input
              type="date"
              value={rangeEnd}
              min={rangeStart || undefined}
              onChange={e => setRangeEnd(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-roman-border bg-roman-bg px-2 py-1.5 text-xs text-roman-text-main outline-none focus:border-roman-primary"
            />
          </div>
          <button
            type="button"
            disabled={!rangeStart || !rangeEnd}
            onClick={() => {
              onRange(rangeStart, rangeEnd);
              setOpen(false);
            }}
            className="mt-2 w-full rounded-lg bg-roman-sidebar px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-stone-900 disabled:opacity-40"
          >
            Aplicar intervalo
          </button>
        </div>
      )}
    </div>
  );
}
