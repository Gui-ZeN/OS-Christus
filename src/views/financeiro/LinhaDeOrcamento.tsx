import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { formatCurrency, sanitizeCurrencyTypingInput } from '../../utils/currency';
import { valorDe, variacaoDe } from './orcamento';
import type { OrcamentoDaOs } from '../../types';

/**
 * OS DOIS CAMPOS DE DINHEIRO DE UMA OS, editáveis na própria linha.
 *
 * Sem modal: o painel existe para preencher MUITAS OS, e um modal por linha
 * transforma "lançar o orçamento da semana" em vinte aberturas e vinte fechamentos.
 *
 * ⚠️ SALVA AO SAIR DO CAMPO, não a cada tecla. Gravar por tecla mandaria "2", "24",
 * "240" ao servidor — e a OS ficaria, por um instante, valendo R$ 2,00 para quem
 * abrisse a lista ao lado.
 *
 * ⚠️ E SÓ SALVA SE MUDOU. Passar pelo campo com Tab não é edição; sem esta guarda,
 * navegar pela tabela carimbaria `atualizadoPor` em toda OS que o cursor tocasse.
 */

const CAMPO =
  'w-28 rounded-sm border border-roman-border bg-roman-surface px-2 py-1 text-right text-sm ' +
  'text-roman-text-main outline-none focus:border-roman-primary';

export function CampoDeValor({
  valor,
  aoSalvar,
  rotulo,
}: {
  valor?: string | null;
  aoSalvar: (novo: string) => Promise<void>;
  rotulo: string;
}) {
  const [texto, setTexto] = useState(valor ?? '');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  // O valor pode mudar por fora (outra pessoa gravou, o poll trouxe). Enquanto o
  // campo não está sendo editado, ele acompanha.
  useEffect(() => {
    if (!salvando) setTexto(valor ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  const sair = async () => {
    const novo = texto.trim();
    if (novo === String(valor ?? '').trim()) return;
    setSalvando(true);
    try {
      await aoSalvar(novo);
      setSalvo(true);
      window.setTimeout(() => setSalvo(false), 1200);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <span className="relative inline-flex items-center gap-1">
      <input
        aria-label={rotulo}
        value={texto}
        disabled={salvando}
        onChange={e => setTexto(sanitizeCurrencyTypingInput(e.target.value))}
        onBlur={sair}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          // Esc desfaz: quem digitou errado precisa de uma saída que não grave.
          if (e.key === 'Escape') {
            setTexto(valor ?? '');
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="—"
        className={CAMPO}
      />
      {salvando && <Loader2 size={12} className="animate-spin text-roman-text-sub" />}
      {salvo && !salvando && <Check size={12} className="text-roman-success" />}
    </span>
  );
}

/** A variação, quando ela existe. Ver `variacaoDe`: meia-preenchida não vira "-100%". */
export function Variacao({ orcamento }: { orcamento?: OrcamentoDaOs | null }) {
  const v = variacaoDe(orcamento);
  if (!v) {
    const falta = valorDe(orcamento?.previsto) === null ? 'orçado' : 'realizado';
    return <span className="text-xs text-roman-text-sub">falta o {falta}</span>;
  }
  const acima = v.diferenca > 0;
  const cor = v.diferenca === 0 ? 'text-roman-text-sub' : acima ? 'text-roman-danger' : 'text-roman-success';
  return (
    <span className={`text-sm ${cor}`}>
      {acima ? '+' : ''}{formatCurrency(v.diferenca)}
      {v.fracao !== null && (
        <span className="ml-1 text-xs opacity-80">
          ({acima ? '+' : ''}{(v.fracao * 100).toFixed(0)}%)
        </span>
      )}
    </span>
  );
}

