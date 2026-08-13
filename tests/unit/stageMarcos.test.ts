import { describe, expect, it } from 'vitest';
import { addStageMarco } from '../../api/_lib/statusFlow.js';

/**
 * O MAPA DE MARCOS — a linha do tempo que o Serv3 descartava.
 *
 * `stageEnteredAt` é um carimbo só, sobrescrito a cada transição. Medido na produção
 * em 13/08/2026: o sistema reconstruía do histórico a visita técnica em 97% das OS e
 * a conclusão em 36%, mas as quatro etapas do meio em 1-3% — enquanto a planilha que
 * a coordenação mantém tem 226 aprovações de solução, 177 orçamentos e 141 ações
 * preliminares datadas. Não era falta de digitação: o sistema jogava fora.
 */
describe('addStageMarco', () => {
  const t1 = new Date('2026-08-01T10:00:00Z');
  const t2 = new Date('2026-08-05T10:00:00Z');

  it('grava o marco quando a etapa é nova para a OS', () => {
    expect(addStageMarco({}, 'Aguardando Orçamento', t1)).toEqual({ 'Aguardando Orçamento': t1 });
  });

  it('acrescenta sem derrubar os marcos anteriores', () => {
    const atual = { 'Nova OS': t1 };
    expect(addStageMarco(atual, 'Aguardando Parecer Técnico', t2)).toEqual({
      'Nova OS': t1,
      'Aguardando Parecer Técnico': t2,
    });
  });

  it('NÃO sobrescreve: reabrir e voltar à etapa preserva a data original', () => {
    // Encerrar por engano e reabrir é comum aqui — o fluxo permite de propósito.
    // Se a reentrada sobrescrevesse, a OS reaberta perderia a própria linha do tempo,
    // e o "início da execução" passaria a ser o do retrabalho.
    const atual = { 'Em andamento': t1 };
    expect(addStageMarco(atual, 'Em andamento', t2)).toBeNull();
  });

  it('devolve null quando não há o que acrescentar (não reescreve o mapa à toa)', () => {
    expect(addStageMarco({ Encerrada: t1 }, 'Encerrada', t2)).toBeNull();
  });

  it('ignora entrada inválida em vez de gravar lixo na linha do tempo', () => {
    expect(addStageMarco({}, '', t1)).toBeNull();
    expect(addStageMarco({}, 'Encerrada', null)).toBeNull();
    expect(addStageMarco({}, 'Encerrada', undefined)).toBeNull();
  });

  it('sobrevive a um documento antigo sem o campo, ou com o campo corrompido', () => {
    // 181 OS em produção nasceram antes deste mapa existir.
    expect(addStageMarco(undefined, 'Encerrada', t1)).toEqual({ Encerrada: t1 });
    expect(addStageMarco(null, 'Encerrada', t1)).toEqual({ Encerrada: t1 });
    // Array não é mapa: trata como vazio em vez de espalhar índices numéricos.
    expect(addStageMarco([t1] as unknown as Record<string, Date>, 'Encerrada', t1)).toEqual({
      Encerrada: t1,
    });
  });
});
