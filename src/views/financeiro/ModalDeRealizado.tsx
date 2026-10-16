import React, { useEffect, useState } from 'react';
import { FileText, Loader2, Paperclip, Plus, Trash2 } from 'lucide-react';
import { ModalShell } from '../../components/ui/ModalShell';
import { formatCurrency, sanitizeCurrencyTypingInput } from '../../utils/currency';
import { mensagemDeErro } from '../../utils/errorMessage';
import { uploadOrcamentoAttachment } from '../../services/ticketStorage';
import { problemasNasNotas, totalDasNotas, valorDe } from './orcamento';
import type { NotaFiscalDaOs, Ticket } from '../../types';

/**
 * O REALIZADO DE UMA OS — as notas fiscais do que se pagou (16/10/2026).
 *
 * Antes o realizado era um número digitado direto na tabela, sem comprovante: 19 OS
 * tinham valor e nenhuma tinha nota. Agora cada nota leva o valor, a DATA DO PAGAMENTO
 * (é ela que fecha o custo por mês contra o teto) e o arquivo; o realizado é a soma.
 *
 * ⚠️ O ARQUIVO NÃO É LIDO, como no orçamento: o valor que conta é o digitado.
 */

const CAMPO =
  'rounded-sm border border-roman-border bg-roman-surface px-2 py-1.5 text-sm text-roman-text-main ' +
  'outline-none focus:border-roman-primary';

const novaNota = (): NotaFiscalDaOs => ({
  id: globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
  valor: '',
  pagoEm: null,
  anexo: null,
});

export function ModalDeRealizado({
  ticket,
  onFechar,
  onSalvar,
}: {
  ticket: Ticket | null;
  onFechar: () => void;
  onSalvar: (entrada: { notas: NotaFiscalDaOs[] }) => Promise<void>;
}) {
  const [notas, setNotas] = useState<NotaFiscalDaOs[]>([]);
  const [enviandoDe, setEnviandoDe] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Recarrega do ticket a cada abertura: o modal é um só para a tabela inteira.
  useEffect(() => {
    if (!ticket) return;
    const atuais = ticket.orcamento?.notas;
    setNotas(atuais?.length ? atuais : [novaNota()]);
    setErro('');
  }, [ticket]);

  if (!ticket) return null;

  const total = totalDasNotas(notas);
  const digitadoAntes = valorDe(ticket.orcamento?.realizado);
  const mudar = (id: string, campos: Partial<NotaFiscalDaOs>) =>
    setNotas(lista => lista.map(n => (n.id === id ? { ...n, ...campos } : n)));

  const anexar = async (id: string, arquivo: File) => {
    setEnviandoDe(id);
    setErro('');
    try {
      const anexo = await uploadOrcamentoAttachment(ticket.id, arquivo);
      mudar(id, { anexo });
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao anexar a nota.'));
    } finally {
      setEnviandoDe(null);
    }
  };

  const salvar = async () => {
    const problemas = problemasNasNotas(notas);
    if (problemas.length) {
      setErro(problemas.join(' '));
      return;
    }
    setSalvando(true);
    try {
      await onSalvar({ notas });
      onFechar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao salvar o realizado.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalShell
      isOpen
      // Fechar no meio do envio deixaria o arquivo órfão no Storage, sem nota que o cite.
      onClose={enviandoDe ? () => {} : onFechar}
      title={`Realizado da ${ticket.id}`}
      description={ticket.subject}
      maxWidthClass="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-roman-text-sub">
            {total !== null ? (
              <>Realizado: <strong className="text-roman-text-main">{formatCurrency(total)}</strong></>
            ) : (
              'Sem nota com valor.'
            )}
          </span>
          <span className="flex gap-2">
            <button type="button" onClick={onFechar} disabled={enviandoDe !== null} className="rounded-sm border border-roman-border px-3 py-1.5 text-sm text-roman-text-sub hover:text-roman-text-main disabled:opacity-60">
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || enviandoDe !== null}
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

      {digitadoAntes !== null && !ticket.orcamento?.notas?.length && (
        <p className="mb-3 rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-sm text-roman-text-sub">
          Valor digitado antes, sem nota: <strong className="text-roman-text-main">{formatCurrency(digitadoAntes)}</strong>. Ao
          lançar notas, o realizado passa a ser a soma delas.
        </p>
      )}

      <h3 className="mb-1.5 text-[11px] uppercase tracking-widest text-roman-text-sub">Notas fiscais</h3>
      <ul className="space-y-2">
        {notas.map((nota, i) => (
          <li key={nota.id} className="rounded-sm border border-roman-border bg-roman-bg p-2">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[11px] text-roman-text-sub">
                Valor
                <input
                  className={`${CAMPO} mt-0.5 block w-32 text-right`}
                  placeholder="0,00"
                  aria-label={`Valor da nota ${i + 1}`}
                  value={nota.valor}
                  onChange={e => mudar(nota.id, { valor: sanitizeCurrencyTypingInput(e.target.value) })}
                />
              </label>
              <label className="text-[11px] text-roman-text-sub">
                Data do pagamento
                <input
                  type="date"
                  className={`${CAMPO} mt-0.5 block`}
                  aria-label={`Data do pagamento da nota ${i + 1}`}
                  value={nota.pagoEm || ''}
                  onChange={e => mudar(nota.id, { pagoEm: e.target.value || null })}
                />
              </label>
              <div className="min-w-0 flex-1">
                {nota.anexo ? (
                  <span className="flex min-w-0 items-center gap-1.5 text-sm text-roman-text-main">
                    <FileText size={14} className="shrink-0 text-roman-text-sub" />
                    <span className="truncate">{nota.anexo.name}</span>
                    {/* Só tira daqui: o arquivo continua no Storage — apagar de dentro
                        de um modal de valor seria exclusão sem confirmação. */}
                    <button
                      type="button"
                      onClick={() => mudar(nota.id, { anexo: null })}
                      className="shrink-0 text-roman-text-sub hover:text-roman-danger"
                      aria-label={`Remover o arquivo da nota ${i + 1}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-dashed border-roman-border px-2 py-1.5 text-sm text-roman-text-sub hover:border-roman-primary/50 hover:text-roman-text-main">
                    {enviandoDe === nota.id ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
                    {enviandoDe === nota.id ? 'Enviando…' : 'Anexar a nota (PDF ou foto)'}
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      disabled={enviandoDe !== null}
                      onChange={e => { const f = e.target.files?.[0]; if (f) anexar(nota.id, f); e.target.value = ''; }}
                    />
                  </label>
                )}
              </div>
              <button
                type="button"
                onClick={() => setNotas(l => (l.length > 1 ? l.filter(n => n.id !== nota.id) : [novaNota()]))}
                disabled={enviandoDe !== null}
                className="shrink-0 self-center text-roman-text-sub hover:text-roman-danger disabled:opacity-40"
                aria-label={`Remover a nota ${i + 1}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setNotas(l => [...l, novaNota()])}
        className="mt-2 inline-flex items-center gap-1.5 text-sm text-roman-text-sub hover:text-roman-text-main"
      >
        <Plus size={14} /> Adicionar nota
      </button>
    </ModalShell>
  );
}
