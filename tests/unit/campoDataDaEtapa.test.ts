import { describe, expect, it } from 'vitest';
import { limitesDaData, problemaNaDataDaEtapa } from '../../src/components/ui/CampoDataDaEtapa';

/** A mesma trava do servidor, na tela — para a pessoa saber na hora, não por "verifique a conexão". */
describe('limites da data da etapa na tela', () => {
  const ticket = {
    time: new Date('2026-10-01T09:00:00-03:00'),
    stageEnteredAt: new Date('2026-10-05T10:00:00-03:00'),
    status: 'Em andamento',
  };

  it('antes da entrada na etapa atual é barrado, com a data na mensagem', () => {
    expect(problemaNaDataDaEtapa('2026-10-04', limitesDaData(ticket))).toBe(
      'A data não pode ser anterior à entrada na etapa atual (05/10/2026).'
    );
    expect(problemaNaDataDaEtapa('2026-10-05', limitesDaData(ticket))).toBeNull();
  });

  it('antes da abertura, a mensagem é a da abertura', () => {
    expect(problemaNaDataDaEtapa('2026-09-30', limitesDaData(ticket))).toBe(
      'A data da etapa não pode ser anterior à abertura da OS.'
    );
  });

  it('reabrir não trava pela etapa atual — é por ali que se corrige um encerramento errado', () => {
    const encerrada = { ...ticket, status: 'Encerrada', stageEnteredAt: new Date('2026-10-10T10:00:00-03:00') };
    expect(limitesDaData(encerrada).etapaAtual).toBeUndefined();
    expect(problemaNaDataDaEtapa('2026-10-03', limitesDaData(encerrada))).toBeNull();
  });
});
