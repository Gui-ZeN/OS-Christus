import React from 'react';
import { X } from 'lucide-react';

interface DirectorInterestsPanelProps {
  draft: string;
  emails: string[];
  suggestions: string[];
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onAddSuggestion: (email: string) => void;
  onRemove: (email: string) => void;
}

/** Painel "Adicionar interessados" do modal de cotações — extraído do InboxView. */
export function DirectorInterestsPanel(props: DirectorInterestsPanelProps) {
  const { draft, emails, suggestions, onDraftChange, onAdd, onAddSuggestion, onRemove } = props;

  return (
    <div className="mb-6 rounded-sm border border-roman-border bg-roman-bg p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1">
          <label className="mb-1.5 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Interessados adicionais</label>
          <input
            type="text"
            value={draft}
            onChange={event => onDraftChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onAdd();
              }
            }}
            placeholder="email@dominio.com, outro@dominio.com"
            className="w-full rounded-sm border border-roman-border bg-white px-3 py-2 text-sm text-roman-text-main outline-none focus:border-roman-primary"
          />
          <div className="mt-1 text-xs text-roman-text-sub">Separe por vírgula ou pressione Enter para adicionar.</div>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-sm bg-roman-sidebar px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-900"
        >
          Adicionar
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Sugestões desta sede</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 8).map(email => (
              <button
                key={`director-suggestion-${email}`}
                type="button"
                onClick={() => onAddSuggestion(email)}
                className="rounded-sm border border-roman-primary/30 bg-white px-2 py-1 text-xs text-roman-primary transition-colors hover:bg-roman-primary/10"
              >
                {email}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {emails.length > 0 ? (
          emails.map(email => (
            <span key={`director-interested-${email}`} className="inline-flex items-center gap-1 rounded-sm border border-roman-border bg-white px-2 py-1 text-xs text-roman-text-main">
              {email}
              <button
                type="button"
                onClick={() => onRemove(email)}
                className="text-roman-text-sub hover:text-red-700"
                aria-label={`Remover ${email}`}
              >
                <X size={12} />
              </button>
            </span>
          ))
        ) : (
          <div className="text-xs text-roman-text-sub">Sem interessados adicionais. A Diretoria configurada continua recebendo normalmente.</div>
        )}
      </div>
    </div>
  );
}
