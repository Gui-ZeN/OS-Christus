import React, { useMemo, useState } from 'react';
import { ChevronDown, Repeat } from 'lucide-react';
import { PLACE_LABEL, recurrentPlaces } from '../utils/placeTags';
import type { Ticket } from '../types';

/**
 * REINCIDÊNCIA — o mesmo lugar voltando.
 *
 * O sistema já tinha essa informação e não sabia somar: em 17/07/2026 o PQL1 abriu
 * cinco OS de goteira no mesmo dia. Não eram cinco problemas — era uma cobertura
 * inteira falhando numa chuva, que virou cinco OS porque foram cinco e-mails.
 *
 * Nada aqui é digitado por ninguém: o lugar sai do assunto e o problema de água sai
 * do texto. É o tipo de resposta que troca "consertar a goteira" por "consertar o
 * telhado".
 */
const ABERTO_INICIAL = false;

export function RecurrencePanel({
  tickets,
  onOpenTicket,
}: {
  tickets: Ticket[];
  onOpenTicket: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(ABERTO_INICIAL);
  const [soAgua, setSoAgua] = useState(false);

  const grupos = useMemo(() => {
    const base = soAgua ? tickets.filter(t => t.waterIssue) : tickets;
    return recurrentPlaces(base).slice(0, 12);
  }, [tickets, soAgua]);

  if (grupos.length === 0 && !aberto) return null;

  return (
    <div className="border-b border-roman-border bg-roman-bg px-4 py-2 md:px-6">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="flex w-full items-center gap-2 text-left text-sm text-roman-text-sub transition-colors hover:text-roman-text-main"
      >
        <Repeat size={14} />
        <span>
          Reincidência: <strong className="text-roman-text-main">{grupos.length}</strong> lugares com
          mais de uma OS
        </span>
        <ChevronDown
          size={14}
          className={`ml-auto transition-transform ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {aberto && (
        <div className="mt-2 pb-1">
          <label className="mb-2 flex items-center gap-2 text-xs text-roman-text-sub">
            <input
              type="checkbox"
              checked={soAgua}
              onChange={event => setSoAgua(event.target.checked)}
              className="accent-roman-primary"
            />
            só problemas de água
          </label>
          {grupos.length === 0 ? (
            <p className="py-2 text-xs text-roman-text-sub">Nenhum lugar repetiu neste recorte.</p>
          ) : (
            <ul className="space-y-1">
              {grupos.map(g => (
                <li
                  key={`${g.sede}-${g.tag}`}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-roman-border bg-roman-surface px-3 py-1.5 text-xs"
                >
                  <span className="font-mono font-semibold text-roman-text-main">{g.sede}</span>
                  <span className="text-roman-text-sub">·</span>
                  <span className="text-roman-text-main">{PLACE_LABEL[g.tag] || g.tag}</span>
                  <span className="rounded-full border border-roman-border px-1.5 py-px text-roman-text-sub">
                    {g.ticketIds.length} OS
                  </span>
                  <span className="ml-auto flex flex-wrap gap-1">
                    {g.ticketIds.map(id => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onOpenTicket(id)}
                        className="font-mono text-roman-primary hover:underline"
                      >
                        {id}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
