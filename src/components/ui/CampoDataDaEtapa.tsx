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

/** O dia da abertura da OS — o mesmo que o servidor usa como limite (`time`). */
export function aberturaDaOs(time: unknown): string | undefined {
  const data = time instanceof Date ? time : time ? new Date(String(time)) : null;
  return data && !Number.isNaN(data.getTime()) ? diaEmFortaleza(data) : undefined;
}

/**
 * Por que a data não pode ser enviada, ou `null`. Repete a regra do servidor para a
 * pessoa saber NA HORA — o input não impede digitar fora do min/max, e a recusa do
 * servidor chegaria como "verifique a conexão".
 */
export function problemaNaDataDaEtapa(dia: string, abertura?: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return 'Informe a data em que a OS entrou na etapa.';
  if (dia > hojeEmFortaleza()) return 'A data da etapa não pode ser no futuro.';
  if (abertura && dia < abertura) return 'A data da etapa não pode ser anterior à abertura da OS.';
  return null;
}

export function CampoDataDaEtapa({
  rotulo,
  valor,
  aoMudar,
  abertura,
  desabilitado,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (dia: string) => void;
  abertura?: string;
  desabilitado?: boolean;
}) {
  const hoje = hojeEmFortaleza();
  return (
    <label className="block text-[11px] text-roman-text-sub">
      {rotulo}
      <input
        type="date"
        value={valor}
        min={abertura}
        max={hoje}
        onChange={event => aoMudar(event.target.value || hoje)}
        disabled={desabilitado}
        className="mt-1 block w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-1.5 text-sm text-roman-text-main outline-none focus:border-roman-primary"
      />
    </label>
  );
}
