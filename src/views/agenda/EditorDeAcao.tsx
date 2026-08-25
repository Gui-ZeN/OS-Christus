import React, { useState } from 'react';
import {
  ATTENTION_STATE,
  DEFAULT_SUSPENSION_DAYS,
  SUSPENSION_REASON,
  SUSPENSION_REASON_LABEL,
} from '../../constants/agenda';
import { mensagemDeErro } from '../../utils/errorMessage';
import type { NextAction, SuspensionReason, TicketAttention } from '../../types';

/**
 * O EDITOR DA PRÓXIMA AÇÃO — um só, para as três telas.
 *
 * Nasceu dentro do `TodayView` e ficou preso lá: durante semanas, a agenda foi o
 * ÚNICO lugar onde dava para dizer quando a OS anda. A Caixa de Entrada mostrava a
 * próxima ação sem deixar mexer (117 linhas, zero botões) e a Gestão não tinha nada.
 *
 * Isso é atrito no lugar errado: a data nasce lendo a conversa ("o fornecedor disse
 * que vem sexta") ou varrendo a fila — e para gravá-la era preciso sair da tela onde
 * ela apareceu. O campo que ninguém preenche costuma ser o campo que fica longe.
 *
 * ⚠️ UM SÓ, e não um por tela. Este repositório já pagou o preço de regra duplicada
 * três vezes (moeda em quatro lugares com três comportamentos, `renderTemplateString`
 * dos dois lados da fronteira, o relógio da checagem copiado). Editor de data é
 * exatamente o tipo de coisa que diverge em silêncio: um passa a aceitar data no
 * passado, outro não, e ninguém compara.
 *
 * Quem chama decide o que fazer com o resultado — `onSalvar`, `onSuspender` e
 * `onVirarVisita` são de quem monta. O editor não conhece contexto nem API.
 */

export function dataCurta(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Fortaleza',
  }).format(date);
}

export function paraCampoLocal(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

export function emDias(base: Date, dias: number, hora: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  d.setHours(hora, 0, 0, 0);
  return d;
}

/**
 * Definir a próxima ação em dois toques: uma frase e um "quando".
 *
 * Os atalhos existem porque o custo de registrar é o que decide se a regra única
 * sobrevive ao dia a dia — se exigir abrir calendário, ninguém preenche.
 */
export function EditorDeAcao({
  acao,
  suspensao,
  agora,
  autorEmail,
  autorNome,
  onSalvar,
  onSuspender,
  onVirarVisita,
  onCancelar,
}: {
  acao: NextAction | null | undefined;
  suspensao: TicketAttention | null;
  agora: Date;
  autorEmail?: string;
  autorNome?: string;
  onSalvar: (acao: NextAction | null) => Promise<boolean>;
  onSuspender: (attention: TicketAttention | null) => Promise<boolean>;
  onVirarVisita: (acao: NextAction, fornecedor: string) => Promise<string>;
  onCancelar: () => void;
}) {
  const [oQue, setOQue] = useState(acao?.what || '');
  const [quando, setQuando] = useState(
    paraCampoLocal(acao?.dueAt ? new Date(acao.dueAt) : emDias(agora, 0, 14))
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [suspendendo, setSuspendendo] = useState(false);
  const [ehVisita, setEhVisita] = useState(Boolean(acao?.commitmentId));
  const [fornecedor, setFornecedor] = useState('');
  const [motivo, setMotivo] = useState<SuspensionReason>(
    suspensao?.reason || SUSPENSION_REASON.WAITING_MATERIAL
  );
  const [voltaEm, setVoltaEm] = useState(
    paraCampoLocal(suspensao?.reviewAt || emDias(agora, DEFAULT_SUSPENSION_DAYS, 9))
  );

  const atalhos: Array<[string, Date]> = [
    ['Hoje 14h', emDias(agora, 0, 14)],
    ['Amanhã 9h', emDias(agora, 1, 9)],
    ['Em 3 dias', emDias(agora, 3, 9)],
    ['Em 7 dias', emDias(agora, 7, 9)],
  ];

  const submeter = async (event: React.FormEvent) => {
    event.preventDefault();
    const texto = oQue.trim();
    const data = new Date(quando);
    if (!texto) return setErro('Escreva o que vai acontecer.');
    if (Number.isNaN(data.getTime())) return setErro('Data inválida.');

    setErro('');
    setSalvando(true);
    const nova: NextAction = {
      what: texto,
      dueAt: data,
      // Preserva quem definiu a ação original; só a primeira definição carimba autor.
      ownerEmail: acao?.ownerEmail ?? autorEmail,
      ownerName: acao?.ownerName ?? autorNome,
      commitmentId: acao?.commitmentId ?? null,
      createdAt: acao?.createdAt ?? new Date(),
      createdBy: acao?.createdBy ?? autorEmail,
    };

    // O compromisso nasce ANTES da ação: se ele falhar, a ação não é salva prometendo
    // uma confirmação da sede que nunca vai existir.
    if (ehVisita && !nova.commitmentId) {
      try {
        nova.commitmentId = await onVirarVisita(nova, fornecedor.trim());
      } catch (e) {
        setSalvando(false);
        return setErro(mensagemDeErro(e, 'Não foi possível criar a visita.'));
      }
    }

    const ok = await onSalvar(nova);
    setSalvando(false);
    if (!ok) setErro('Não foi possível salvar. Tente de novo.');
  };

  const remover = async () => {
    setSalvando(true);
    const ok = await onSalvar(null);
    setSalvando(false);
    if (!ok) setErro('Não foi possível remover.');
  };

  const suspender = async () => {
    const data = new Date(voltaEm);
    if (Number.isNaN(data.getTime())) return setErro('Data de revisão inválida.');
    if (data.getTime() <= agora.getTime()) return setErro('A revisão precisa ser no futuro.');
    setErro('');
    setSalvando(true);
    const ok = await onSuspender({
      state: ATTENTION_STATE.SUSPENDED,
      reason: motivo,
      reviewAt: data,
      setBy: autorEmail,
      setByName: autorNome,
      setAt: new Date(),
    });
    setSalvando(false);
    if (!ok) setErro('Não foi possível suspender.');
  };

  const retomar = async () => {
    setSalvando(true);
    const ok = await onSuspender(null);
    setSalvando(false);
    if (!ok) setErro('Não foi possível retomar.');
  };

  if (suspensao && !suspendendo) {
    return (
      <div className="mt-3 border-t border-roman-border pt-3">
        <p className="text-sm text-roman-text-main">
          Suspensa por <strong>{SUSPENSION_REASON_LABEL[suspensao.reason]}</strong> até{' '}
          {dataCurta(suspensao.reviewAt)}
          {suspensao.setByName ? ` · por ${suspensao.setByName}` : ''}
        </p>
        <p className="mt-1 text-xs text-roman-text-sub">
          Na data da revisão ela volta sozinha para "sem próxima ação" — ninguém precisa
          lembrar de retomar.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={retomar}
            disabled={salvando}
            className="rounded-sm bg-roman-primary px-3 py-1.5 text-sm font-medium text-roman-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Retomar agora
          </button>
          <button
            type="button"
            onClick={() => setSuspendendo(true)}
            className="rounded-sm border border-roman-border px-3 py-1.5 text-sm text-roman-text-sub hover:border-roman-primary"
          >
            Mudar motivo ou data
          </button>
          {erro && <span className="text-xs text-roman-danger">{erro}</span>}
        </div>
      </div>
    );
  }

  if (suspendendo) {
    return (
      <div className="mt-3 border-t border-roman-border pt-3">
        <label className="text-xs text-roman-text-sub" htmlFor="motivo-suspensao">
          Por que esta OS fica parada?
        </label>
        <select
          id="motivo-suspensao"
          value={motivo}
          onChange={event => setMotivo(event.target.value as SuspensionReason)}
          className="mt-1 w-full rounded-sm border border-roman-border bg-roman-bg px-2.5 py-1.5 text-sm text-roman-text-main outline-none focus:border-roman-primary"
        >
          {Object.values(SUSPENSION_REASON).map(valor => (
            <option key={valor} value={valor}>
              {SUSPENSION_REASON_LABEL[valor]}
            </option>
          ))}
        </select>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-roman-text-sub">Rever em</span>
          {[7, 15, 30].map(dias => (
            <button
              key={dias}
              type="button"
              onClick={() => setVoltaEm(paraCampoLocal(emDias(agora, dias, 9)))}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                voltaEm === paraCampoLocal(emDias(agora, dias, 9))
                  ? 'border-roman-primary bg-roman-parchment text-roman-primary'
                  : 'border-roman-border text-roman-text-sub hover:border-roman-primary'
              }`}
            >
              {dias} dias
            </button>
          ))}
          <input
            type="datetime-local"
            value={voltaEm}
            onChange={event => setVoltaEm(event.target.value)}
            className="rounded-sm border border-roman-border bg-roman-bg px-2 py-1 text-xs text-roman-text-main outline-none focus:border-roman-primary"
          />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={suspender}
            disabled={salvando}
            className="rounded-sm bg-roman-primary px-3 py-1.5 text-sm font-medium text-roman-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : 'Suspender'}
          </button>
          <button
            type="button"
            onClick={() => setSuspendendo(false)}
            className="rounded-sm border border-roman-border px-3 py-1.5 text-sm text-roman-text-sub hover:border-roman-primary"
          >
            Voltar
          </button>
          {erro && <span className="text-xs text-roman-danger">{erro}</span>}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submeter} className="mt-3 border-t border-roman-border pt-3">
      <input
        type="text"
        value={oQue}
        autoFocus
        onChange={event => setOQue(event.target.value)}
        placeholder="O que vai acontecer? Ex.: cobrar a proposta do eletricista"
        className="w-full rounded-sm border border-roman-border bg-roman-bg px-2.5 py-1.5 text-sm text-roman-text-main outline-none focus:border-roman-primary"
      />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {atalhos.map(([rotulo, data]) => (
          <button
            key={rotulo}
            type="button"
            onClick={() => setQuando(paraCampoLocal(data))}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              quando === paraCampoLocal(data)
                ? 'border-roman-primary bg-roman-parchment text-roman-primary'
                : 'border-roman-border text-roman-text-sub hover:border-roman-primary'
            }`}
          >
            {rotulo}
          </button>
        ))}
        <input
          type="datetime-local"
          value={quando}
          onChange={event => setQuando(event.target.value)}
          className="rounded-sm border border-roman-border bg-roman-bg px-2 py-1 text-xs text-roman-text-main outline-none focus:border-roman-primary"
        />
      </div>
      {/* Marcar como visita é o que faz a OS cair em "Aguardando a sede" quando o
          horário passa, em vez de continuar cobrando quem não pode responder. */}
      <label className="mt-2 flex flex-wrap items-center gap-2 text-sm text-roman-text-sub">
        <input
          type="checkbox"
          checked={ehVisita}
          disabled={Boolean(acao?.commitmentId)}
          onChange={event => setEhVisita(event.target.checked)}
          className="accent-roman-primary"
        />
        É uma visita de fornecedor
        {ehVisita && !acao?.commitmentId && (
          <input
            type="text"
            value={fornecedor}
            onChange={event => setFornecedor(event.target.value)}
            placeholder="quem prometeu vir"
            className="rounded-sm border border-roman-border bg-roman-bg px-2 py-1 text-sm text-roman-text-main outline-none focus:border-roman-primary"
          />
        )}
      </label>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="rounded-sm bg-roman-primary px-3 py-1.5 text-sm font-medium text-roman-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-sm border border-roman-border px-3 py-1.5 text-sm text-roman-text-sub hover:border-roman-primary"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => setSuspendendo(true)}
          className="rounded-sm border border-roman-border px-3 py-1.5 text-sm text-roman-text-sub hover:border-roman-primary"
        >
          Suspender…
        </button>
        {acao && (
          <button
            type="button"
            onClick={remover}
            disabled={salvando}
            className="ml-auto text-xs text-roman-text-sub underline underline-offset-2 hover:text-roman-danger disabled:opacity-50"
          >
            Remover a próxima ação
          </button>
        )}
        {erro && <span className="text-xs text-roman-danger">{erro}</span>}
      </div>
    </form>
  );
}
