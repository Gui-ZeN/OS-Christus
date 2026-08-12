import { describe, expect, it } from 'vitest';
import type { Ticket } from '../../src/types';
import {
  granularidadeSugerida,
  inicioDaSemana,
  resumoDoFluxo,
  serieDeFluxo,
} from '../../src/utils/fluxoDemandas';

const os = (id: string, aberta: string, fechada?: string, status = 'Encerrada'): Ticket =>
  ({
    id,
    time: new Date(aberta),
    closedAt: fechada ? new Date(fechada) : null,
    status: fechada ? status : 'Em andamento',
  }) as unknown as Ticket;

describe('semana', () => {
  it('começa na segunda-feira', () => {
    // 12/08/2026 é uma quarta; a semana dela abre no dia 10.
    expect(inicioDaSemana(new Date(2026, 7, 12)).getDate()).toBe(10);
    // Domingo pertence à semana que começou na segunda anterior, não à seguinte.
    expect(inicioDaSemana(new Date(2026, 7, 16)).getDate()).toBe(10);
    expect(inicioDaSemana(new Date(2026, 7, 10)).getDate()).toBe(10);
  });
});

describe('série de fluxo', () => {
  it('conta abertas e saídas na semana em que aconteceram', () => {
    const serie = serieDeFluxo(
      [
        os('A', '2026-08-03T10:00:00', '2026-08-11T10:00:00'),
        os('B', '2026-08-11T10:00:00'),
        os('C', '2026-08-12T10:00:00', '2026-08-13T10:00:00', 'Cancelada'),
      ],
      { inicio: new Date(2026, 7, 3), fim: new Date(2026, 7, 16, 23, 59), granularidade: 'semana' }
    );

    expect(serie.map(p => p.rotulo)).toEqual(['03/08', '10/08']);
    expect(serie[0]).toMatchObject({ abertas: 1, encerradas: 0, canceladas: 0, saidas: 0 });
    expect(serie[1]).toMatchObject({ abertas: 2, encerradas: 1, canceladas: 1, saidas: 2 });
  });

  it('o exemplo do diretor: 20 abertas, 21 fechadas, 200 viram 199', () => {
    const tickets: Ticket[] = [];
    // 200 pendências herdadas, todas abertas antes da janela.
    for (let i = 0; i < 200; i += 1) tickets.push(os(`velha-${i}`, '2026-06-01T09:00:00'));
    // Na semana: 20 novas e 21 fechadas (uma das novas fecha na mesma semana).
    for (let i = 0; i < 20; i += 1) tickets.push(os(`nova-${i}`, '2026-08-11T09:00:00'));
    for (let i = 0; i < 20; i += 1) tickets[i].closedAt = new Date('2026-08-12T09:00:00');
    for (let i = 0; i < 20; i += 1) (tickets[i] as { status: string }).status = 'Encerrada';
    tickets[200].closedAt = new Date('2026-08-13T09:00:00');
    (tickets[200] as { status: string }).status = 'Encerrada';

    const serie = serieDeFluxo(tickets, {
      inicio: new Date(2026, 7, 10),
      fim: new Date(2026, 7, 16, 23, 59),
      granularidade: 'semana',
    });

    expect(serie).toHaveLength(1);
    expect(serie[0].abertas).toBe(20);
    expect(serie[0].saidas).toBe(21);
    expect(serie[0].pendencias).toBe(199);

    const resumo = resumoDoFluxo(serie);
    expect(resumo.pendenciasInicio).toBe(200);
    expect(resumo.pendenciasFim).toBe(199);
    expect(resumo.saldo).toBe(-1);
  });

  it('o estoque carrega o que veio ANTES da janela', () => {
    // A armadilha central: filtrar "última semana" não pode zerar a fila herdada.
    const serie = serieDeFluxo([os('antiga', '2026-05-20T09:00:00')], {
      inicio: new Date(2026, 7, 10),
      fim: new Date(2026, 7, 16, 23, 59),
      granularidade: 'semana',
    });

    expect(serie[0].abertas).toBe(0);
    expect(serie[0].pendencias).toBe(1);
  });

  it('OS reaberta volta a ser pendência', () => {
    // Reabrir limpa o `closedAt` no servidor. Se o gráfico ignorasse isso, a OS
    // ficaria viva na tela e morta na contagem.
    const reaberta = os('R', '2026-08-03T09:00:00');
    const serie = serieDeFluxo([reaberta], {
      inicio: new Date(2026, 7, 3),
      fim: new Date(2026, 7, 16, 23, 59),
      granularidade: 'semana',
    });

    expect(serie.map(p => p.pendencias)).toEqual([1, 1]);
    expect(serie.reduce((soma, p) => soma + p.saidas, 0)).toBe(0);
  });

  it('OS sem data de fechamento não é contada como saída', () => {
    // Antes do backfill, as 92 fechadas não têm `closedAt`. O gráfico deve mostrar
    // isso como "não saiu", nunca inventar uma data — inventar é o que produziria a
    // linha bonita e errada.
    const semData = { ...os('S', '2026-08-03T09:00:00'), status: 'Encerrada', closedAt: null } as Ticket;
    const serie = serieDeFluxo([semData], {
      inicio: new Date(2026, 7, 3),
      fim: new Date(2026, 7, 9, 23, 59),
      granularidade: 'semana',
    });

    expect(serie[0].saidas).toBe(0);
    expect(serie[0].pendencias).toBe(1);
  });

  it('OS marcada como teste não entra na conta — nem na fila, nem na saída', () => {
    // As 13 canceladas com "Motivo: Teste!" em 21/07 respondiam por 13 das 14 saídas
    // daquela semana. Quem lesse o gráfico veria uma semana produtiva que não houve.
    const real = os('R', '2026-08-03T09:00:00', '2026-08-04T09:00:00');
    const teste = {
      ...os('T', '2026-08-03T09:00:00', '2026-08-04T09:00:00', 'Cancelada'),
      excludedFromMetrics: true,
    } as Ticket;

    const serie = serieDeFluxo([real, teste], {
      inicio: new Date(2026, 7, 3),
      fim: new Date(2026, 7, 9, 23, 59),
      granularidade: 'semana',
    });

    expect(serie[0].abertas).toBe(1);
    expect(serie[0].saidas).toBe(1);
    expect(serie[0].pendencias).toBe(0);
  });

  it('a distância entre as curvas acumuladas É a fila, em todo balde', () => {
    // Esta identidade é o que o gráfico acumulado desenha: a faixa entre as duas
    // curvas. Se ela deixar de valer, o gráfico passa a mostrar uma distância que não
    // significa nada — e continuaria bonito, que é o perigo.
    const tickets = [
      os('A', '2026-06-01T09:00:00', '2026-08-04T09:00:00'),
      os('B', '2026-07-01T09:00:00'),
      os('C', '2026-08-03T09:00:00', '2026-08-12T09:00:00', 'Cancelada'),
      os('D', '2026-08-11T09:00:00'),
    ];
    const serie = serieDeFluxo(tickets, {
      inicio: new Date(2026, 6, 20),
      fim: new Date(2026, 7, 16, 23, 59),
      granularidade: 'semana',
    });

    expect(serie.length).toBeGreaterThan(2);
    for (const ponto of serie) {
      expect(ponto.abertasAcumuladas - ponto.saidasAcumuladas).toBe(ponto.pendencias);
    }
    // Os acumulados carregam o que veio antes da janela: A e B abriram em junho/julho.
    expect(serie[0].abertasAcumuladas).toBe(2);
    expect(serie[serie.length - 1].abertasAcumuladas).toBe(4);
    expect(serie[serie.length - 1].saidasAcumuladas).toBe(2);
  });

  it('janela absurda não trava a tela', () => {
    const serie = serieDeFluxo([], { inicio: new Date(1990, 0, 1), fim: new Date(2090, 0, 1) });
    expect(serie.length).toBeLessThanOrEqual(400);
  });
});

describe('granularidade', () => {
  it('semana até ~4 meses, mês acima disso', () => {
    expect(granularidadeSugerida(new Date(2026, 7, 1), new Date(2026, 7, 31))).toBe('semana');
    expect(granularidadeSugerida(new Date(2026, 0, 1), new Date(2026, 11, 31))).toBe('mes');
  });
});
