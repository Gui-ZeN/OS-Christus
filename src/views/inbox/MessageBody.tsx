import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { splitMessageQuote } from '../../utils/text';

/**
 * Renderiza o corpo de uma mensagem do histórico. Mostra a mensagem mais
 * recente e colapsa o histórico citado (respostas/encaminhamentos anteriores)
 * atrás de um botão "Mostrar conversa anterior" — evita o paredão de e-mails
 * encaminhados N vezes.
 */
export function MessageBody({ text }: { text: string }) {
  const { latest, quoted } = useMemo(() => splitMessageQuote(text), [text]);
  const [showQuoted, setShowQuoted] = useState(false);

  return (
    <div className="text-left">
      <div className="whitespace-pre-line break-words">{latest || text}</div>
      {quoted && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowQuoted(value => !value)}
            className="inline-flex items-center gap-1 rounded-sm border border-roman-border bg-roman-bg/60 px-2 py-0.5 text-[11px] font-medium text-roman-text-sub transition-colors hover:bg-roman-border-light hover:text-roman-text-main"
          >
            <span className="leading-none tracking-widest" aria-hidden="true">&middot;&middot;&middot;</span>
            {showQuoted ? 'Ocultar conversa anterior' : 'Mostrar conversa anterior'}
            <ChevronDown size={12} className={`transition-transform ${showQuoted ? 'rotate-180' : ''}`} />
          </button>
          {showQuoted && (
            <div className="mt-2 whitespace-pre-line break-words border-l-2 border-roman-border pl-3 text-[11px] leading-relaxed text-roman-text-sub">
              {quoted}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
