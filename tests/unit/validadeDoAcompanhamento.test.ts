import { describe, expect, it } from 'vitest';
import { acompanhamentoExpirado } from '../../api/_lib/validadeDoAcompanhamento.js';

/**
 * O link público de acompanhamento não expirava (auditoria de 14/10/2026): um e-mail
 * encaminhado dava acesso à OS para sempre. Agora vale com a OS aberta e por mais 30
 * dias depois de Encerrada ou Cancelada.
 */
const agora = new Date('2026-10-14T12:00:00Z');
const diasAtras = (n: number) => new Date(agora.getTime() - n * 86_400_000);

describe('validade do link de acompanhamento', () => {
  it('OS aberta: vale, por mais antiga que seja', () => {
    expect(acompanhamentoExpirado({ status: 'Em andamento', closedAt: null, updatedAt: diasAtras(400) }, agora)).toBe(false);
    expect(acompanhamentoExpirado({ status: 'Aguardando Execução' }, agora)).toBe(false);
  });

  it('fechada há menos de 30 dias: vale', () => {
    expect(acompanhamentoExpirado({ status: 'Encerrada', closedAt: diasAtras(29) }, agora)).toBe(false);
    expect(acompanhamentoExpirado({ status: 'Cancelada', closedAt: diasAtras(1) }, agora)).toBe(false);
  });

  it('fechada há mais de 30 dias: expirou — Encerrada e Cancelada', () => {
    expect(acompanhamentoExpirado({ status: 'Encerrada', closedAt: diasAtras(31) }, agora)).toBe(true);
    expect(acompanhamentoExpirado({ status: 'Cancelada', closedAt: diasAtras(31) }, agora)).toBe(true);
  });

  it('a data pode vir como Timestamp do Firestore', () => {
    const ts = { toDate: () => diasAtras(45) };
    expect(acompanhamentoExpirado({ status: 'Encerrada', closedAt: ts }, agora)).toBe(true);
  });

  it('OS antiga sem `closedAt` usa a entrada na etapa ou a última alteração', () => {
    expect(acompanhamentoExpirado({ status: 'Encerrada', stageEnteredAt: diasAtras(10) }, agora)).toBe(false);
    expect(acompanhamentoExpirado({ status: 'Encerrada', updatedAt: diasAtras(90) }, agora)).toBe(true);
  });

  it('fechada sem data nenhuma: FECHADO — link eterno é o defeito', () => {
    expect(acompanhamentoExpirado({ status: 'Encerrada' }, agora)).toBe(true);
  });
});
