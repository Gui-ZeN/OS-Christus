import React from 'react';
import { diaEmFortaleza } from '../../../api/_lib/dataDaEtapa.js';

/**
 * O DIA EM QUE A OS ENTROU NA ETAPA — o mesmo campo na Caixa e na Gestão (16/10/2026).
 *
 * Padrão hoje: quem registra na hora não mexe; quem registra atrasado corrige. O
 * servidor confere (api/_lib/dataDaEtapa.js) e é este dia que vira `stageEnteredAt`,
 * `closedAt` e o marco da etapa.
 */

/** Hoje, no calendário de Fortaleza. */
export const hojeEmFortaleza = () => diaEmFortaleza(new Date());

/** O dia de uma data da OS (`time`, `stageEnteredAt`) no calendário de Fortaleza. */
export function diaDaOs(valor: unknown): string | undefined {
  const data = valor instanceof Date ? valor : valor ? new Date(String(valor)) : null;
  return data && !Number.isNaN(data.getTime()) ? diaEmFortaleza(data) : undefined;
}

/**
 * Os dois limites de baixo que o servidor confere: a abertura (`time`) e a entrada na
 * etapa ATUAL (`stageEnteredAt`) — esta para o tempo por etapa não sair negativo.
 */
export interface LimitesDaData {
  abertura?: string;
  etapaAtual?: string;
}

/**
 * Reabrir (OS Encerrada ou Cancelada) não trava pela etapa atual: é por ali que se
 * corrige um encerramento com a data errada — mesma regra do servidor.
 */
export function limitesDaData(ticket: { time?: unknown; stageEnteredAt?: unknown; status?: unknown }): LimitesDaData {
  const fechada = ticket.status === 'Encerrada' || ticket.status === 'Cancelada';
  return { abertura: diaDaOs(ticket.time), etapaAtual: fechada ? undefined : diaDaOs(ticket.stageEnteredAt) };
}

const minimoDe = ({ abertura, etapaAtual }: LimitesDaData) =>
  [abertura, etapaAtual].filter((d): d is string => Boolean(d)).sort().pop();

/**
 * Por que a data não pode ser enviada, ou `null`. Repete a regra do servidor para a
 * pessoa saber NA HORA — o input não impede digitar fora do min/max, e a recusa do
 * servidor chegaria como "verifique a conexão".
 */
export function problemaNaDataDaEtapa(dia: string, { abertura, etapaAtual }: LimitesDaData = {}): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return 'Informe a data em que a OS entrou na etapa.';
  if (dia > hojeEmFortaleza()) return 'A data da etapa não pode ser no futuro.';
  if (abertura && dia < abertura) return 'A data da etapa não pode ser anterior à abertura da OS.';
  if (etapaAtual && dia < etapaAtual) {
    const [ano, mes, d] = etapaAtual.split('-');
    return `A data não pode ser anterior à entrada na etapa atual (${d}/${mes}/${ano}).`;
  }
  return null;
}

export function CampoDataDaEtapa({
  rotulo,
  valor,
  aoMudar,
  limites,
  desabilitado,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (dia: string) => void;
  limites?: LimitesDaData;
  desabilitado?: boolean;
}) {
  const hoje = hojeEmFortaleza();
  return (
    <label className="block text-[11px] text-roman-text-sub">
      {rotulo}
      <input
        type="date"
        value={valor}
        min={limites ? minimoDe(limites) : undefined}
        max={hoje}
        onChange={event => aoMudar(event.target.value || hoje)}
        disabled={desabilitado}
        className="mt-1 block w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-1.5 text-sm text-roman-text-main outline-none focus:border-roman-primary"
      />
    </label>
  );
}
