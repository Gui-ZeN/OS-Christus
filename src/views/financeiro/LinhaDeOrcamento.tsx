import React from 'react';
import { Paperclip } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { anexosDoOrcamento, previstoEfetivo, realizadoEfetivo, valorDe, variacaoDe } from './orcamento';
import type { OrcamentoDaOs } from '../../types';

/**
 * AS CÉLULAS DE DINHEIRO DE UMA OS — orçado e realizado abrem o detalhamento.
 *
 * ⚠️ O REALIZADO ERA DIGITADO NA LINHA ATÉ 16/10/2026 — sem nota fiscal nenhuma: 19
 * OS tinham valor e nenhuma tinha comprovante. Agora ele abre o modal das notas
 * (valor, data do pagamento, arquivo) e a célula mostra a soma (`realizadoEfetivo`).
 */

/** A CÉLULA DO REALIZADO — a soma das notas (ou o valor digitado antes delas). */
export function BotaoDeRealizado({ orcamento, onAbrir }: { orcamento?: OrcamentoDaOs | null; onAbrir: () => void }) {
  const valor = realizadoEfetivo(orcamento);
  const notas = orcamento?.notas?.length || 0;
  const semArquivo = orcamento?.notas?.filter(n => !n.anexo).length || 0;
  const semNota = valor !== null && notas === 0;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="inline-flex items-center gap-1.5 rounded-sm border border-roman-border bg-roman-surface px-2 py-1 text-sm text-roman-text-main hover:border-roman-primary/50"
      title="Abrir as notas fiscais desta OS"
    >
      <span className={valor === null ? 'text-roman-text-sub' : ''}>{valor === null ? '—' : formatCurrency(valor)}</span>
      {notas > 0 && <span className="text-[10px] text-roman-text-sub">{notas} NF</span>}
      {/* Nota lançada sem o arquivo: o valor conta, mas o comprovante falta. */}
      {semArquivo > 0 && <span className="text-[10px] text-roman-danger">{semArquivo} sem arquivo</span>}
      {/* Valor de antes das notas: aparece, mas avisa que não tem comprovante. */}
      {semNota && <span className="text-[10px] text-roman-danger">sem NF</span>}
    </button>
  );
}

/**
 * A CÉLULA DO ORÇADO — mostra o valor e abre o detalhamento.
 *
 * Não é campo de digitar como o realizado: o orçado tem linhas de material e a
 * proposta do fornecedor anexada, e isso não cabe numa célula. O que aparece aqui é
 * o `previstoEfetivo` — a soma das linhas quando elas existem.
 */
export function BotaoDeOrcado({ orcamento, onAbrir }: { orcamento?: OrcamentoDaOs | null; onAbrir: () => void }) {
  const valor = previstoEfetivo(orcamento);
  const linhas = orcamento?.itens?.filter(i => valorDe(i.valor) !== null).length || 0;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="inline-flex items-center gap-1.5 rounded-sm border border-roman-border bg-roman-surface px-2 py-1 text-sm text-roman-text-main hover:border-roman-primary/50"
      title="Abrir o orçamento desta OS"
    >
      <span className={valor === null ? 'text-roman-text-sub' : ''}>{valor === null ? '—' : formatCurrency(valor)}</span>
      {/* Os dois sinais do que existe atrás do número, sem abrir: quantas linhas
          foram lançadas e se a proposta está anexada. */}
      {linhas > 0 && <span className="text-[10px] text-roman-text-sub">{linhas} ln</span>}
      {anexosDoOrcamento(orcamento).length > 0 && <Paperclip size={11} className="text-roman-text-sub" />}
    </button>
  );
}

/** A variação, quando ela existe. Ver `variacaoDe`: meia-preenchida não vira "-100%". */
export function Variacao({ orcamento }: { orcamento?: OrcamentoDaOs | null }) {
  const v = variacaoDe(orcamento);
  if (!v) {
    const falta = previstoEfetivo(orcamento) === null ? 'orçado' : 'realizado';
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

