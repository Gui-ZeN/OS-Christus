import React, { useEffect, useState } from 'react';
import { FileText, Loader2, Paperclip, Plus, Trash2 } from 'lucide-react';
import { ModalShell } from '../../components/ui/ModalShell';
import { formatCurrency, sanitizeCurrencyTypingInput } from '../../utils/currency';
import { mensagemDeErro } from '../../utils/errorMessage';
import { uploadOrcamentoAttachment } from '../../services/ticketStorage';
import { totalDosItens, valorDe } from './orcamento';
import type { ItemDoOrcamento, OrcamentoDaOs, Ticket } from '../../types';

/**
 * O ORÇAMENTO DE UMA OS — o PDF do fornecedor, as linhas à mão, ou os dois.
 *
 * ⚠️ MODAL SÓ AQUI, e a linha da tabela continua editando o realizado direto. Orçado
 * tem detalhamento (material, valor, a proposta anexada); realizado é um número. Pôr
 * os dois em modal cobraria dois cliques por OS para digitar um valor.
 *
 * ⚠️ O PDF NÃO É LIDO. Ele fica anexado para quem quiser conferir; o número que entra
 * na conta é sempre o que alguém digitou. Extrair valor de PDF e apresentar como dado
 * do sistema seria inventar precisão que ninguém verificou.
 */

const CAMPO =
  'rounded-sm border border-roman-border bg-roman-surface px-2 py-1.5 text-sm text-roman-text-main ' +
  'outline-none focus:border-roman-primary';

const novaLinha = (): ItemDoOrcamento => ({
  id: (globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random())),
  descricao: '',
  valor: '',
});

export function ModalDeOrcamento({
  ticket,
  onFechar,
  onSalvar,
}: {
  ticket: Ticket | null;
  onFechar: () => void;
  onSalvar: (entrada: {
    previsto: string;
    itens: ItemDoOrcamento[];
    anexo: OrcamentoDaOs['anexo'];
  }) => Promise<void>;
}) {
  const [itens, setItens] = useState<ItemDoOrcamento[]>([]);
  const [total, setTotal] = useState('');
  const [anexo, setAnexo] = useState<OrcamentoDaOs['anexo']>(null);
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Recarrega do ticket a cada abertura: o modal é um só para a tabela inteira.
  useEffect(() => {
    if (!ticket) return;
    const o = ticket.orcamento;
    setItens(o?.itens?.length ? o.itens : [novaLinha()]);
    setTotal(o?.previsto ?? '');
    setAnexo(o?.anexo ?? null);
    setErro('');
  }, [ticket]);

  if (!ticket) return null;

  const soma = totalDosItens(itens);
  const temLinhas = soma !== null;

  const anexar = async (arquivo: File) => {
    setEnviando(true);
    setErro('');
    try {
      setAnexo(await uploadOrcamentoAttachment(ticket.id, arquivo));
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao anexar o arquivo.'));
    } finally {
      setEnviando(false);
    }
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      await onSalvar({ previsto: total, itens, anexo });
      onFechar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao salvar o orçamento.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalShell
      isOpen
      onClose={onFechar}
      title={`Orçamento da ${ticket.id}`}
      description={ticket.subject}
      maxWidthClass="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-roman-text-sub">
            {temLinhas ? (
              <>Total das linhas: <strong className="text-roman-text-main">{formatCurrency(soma)}</strong></>
            ) : (
              'Sem linhas — vale o total informado.'
            )}
          </span>
          <span className="flex gap-2">
            <button type="button" onClick={onFechar} className="rounded-sm border border-roman-border px-3 py-1.5 text-sm text-roman-text-sub hover:text-roman-text-main">
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="inline-flex items-center gap-1.5 rounded-sm bg-roman-sidebar px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {salvando && <Loader2 size={13} className="animate-spin" />}
              Salvar
            </button>
          </span>
        </div>
      }
    >
      {erro && <p className="mb-3 rounded-sm border border-roman-danger/35 bg-roman-danger/10 px-3 py-2 text-sm text-roman-danger">{erro}</p>}

      {/* ── A proposta do fornecedor ───────────────────────────── */}
      <section className="mb-4">
        <h3 className="mb-1.5 text-[11px] uppercase tracking-widest text-roman-text-sub">Proposta do fornecedor</h3>
        {anexo ? (
          <div className="flex items-center justify-between gap-2 rounded-sm border border-roman-border bg-roman-bg px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-sm text-roman-text-main">
              <FileText size={14} className="shrink-0 text-roman-text-sub" />
              <span className="truncate">{anexo.name}</span>
            </span>
            {/* Só tira daqui: o arquivo em si continua no Storage, e apagá-lo de
                dentro de um modal de valor seria uma exclusão sem confirmação. */}
            <button type="button" onClick={() => setAnexo(null)} className="shrink-0 text-roman-text-sub hover:text-roman-danger" title="Remover do orçamento">
              <Trash2 size={14} />
            </button>
          </div>
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-dashed border-roman-border px-3 py-2 text-sm text-roman-text-sub hover:border-roman-primary/50 hover:text-roman-text-main">
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
            {enviando ? 'Enviando…' : 'Anexar PDF ou foto do orçamento'}
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              disabled={enviando}
              onChange={e => { const f = e.target.files?.[0]; if (f) anexar(f); e.target.value = ''; }}
            />
          </label>
        )}
      </section>

      {/* ── As linhas, à mão ───────────────────────────────────── */}
      <section>
        <h3 className="mb-1.5 text-[11px] uppercase tracking-widest text-roman-text-sub">Materiais e serviços</h3>
        <div className="space-y-1.5">
          {itens.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2">
              <input
                className={`${CAMPO} flex-1`}
                placeholder="Material ou serviço"
                aria-label={`Descrição da linha ${i + 1}`}
                value={item.descricao}
                onChange={e => setItens(l => l.map(x => (x.id === item.id ? { ...x, descricao: e.target.value } : x)))}
              />
              <input
                className={`${CAMPO} w-28 text-right`}
                placeholder="0,00"
                aria-label={`Valor da linha ${i + 1}`}
                value={item.valor}
                onChange={e => setItens(l => l.map(x => (x.id === item.id ? { ...x, valor: sanitizeCurrencyTypingInput(e.target.value) } : x)))}
              />
              <button
                type="button"
                onClick={() => setItens(l => (l.length > 1 ? l.filter(x => x.id !== item.id) : [novaLinha()]))}
                className="shrink-0 text-roman-text-sub hover:text-roman-danger"
                aria-label={`Remover a linha ${i + 1}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setItens(l => [...l, novaLinha()])}
          className="mt-2 inline-flex items-center gap-1.5 text-sm text-roman-text-sub hover:text-roman-text-main"
        >
          <Plus size={14} /> Adicionar linha
        </button>
      </section>

      {/* ── O total ────────────────────────────────────────────── */}
      <section className="mt-4 border-t border-roman-border pt-3">
        <label className="block text-[11px] uppercase tracking-widest text-roman-text-sub" htmlFor="orcamento-total">
          Valor orçado
        </label>
        {/* ⚠️ COM LINHAS, O TOTAL É A SOMA E O CAMPO SAI DE CENA. Deixá-lo editável
            permitiria gravar um total que o próprio detalhamento contradiz — e é a
            soma que a tabela usa (`previstoEfetivo`). Some em vez de ficar cinza:
            campo desabilitado convida a tentar e não explica por quê. */}
        {temLinhas ? (
          <p className="mt-1 text-sm text-roman-text-main">
            <strong>{formatCurrency(soma)}</strong>
            <span className="ml-2 text-xs text-roman-text-sub">somado das {itens.filter(i => valorDe(i.valor) !== null).length} linhas acima</span>
          </p>
        ) : (
          <input
            id="orcamento-total"
            className={`${CAMPO} mt-1 w-40`}
            placeholder="0,00"
            value={total}
            onChange={e => setTotal(sanitizeCurrencyTypingInput(e.target.value))}
          />
        )}
      </section>
    </ModalShell>
  );
}
