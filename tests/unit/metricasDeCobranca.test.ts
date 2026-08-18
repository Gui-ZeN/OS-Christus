import { describe, expect, it } from 'vitest';
import { metricasDeCobranca } from '../../api/_lib/metricasDeCobranca.js';

const de = new Date('2026-08-10T00:00:00Z');
const ate = new Date('2026-08-17T23:59:59Z');
const dia = (d: number, h = 10) => new Date(`2026-08-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`);

const visita = (extra: Record<string, unknown> = {}) => ({
  id: 'c1',
  state: 'faltou',
  startAt: dia(12),
  sede: 'BN',
  vendorName: 'Elétrica Ceará',
  ...extra,
});

describe('o sistema mede o que a folha de papel mediria', () => {
  it('conta tentativas e cobranças concluídas separadamente', () => {
    // Abrir o WhatsApp não é ter cobrado. Contar junto inflaria justamente a
    // métrica que existe para proteger quem cobrou.
    const m = metricasDeCobranca({
      commitments: [
        visita({
          cobrancas: [
            { em: dia(12, 11), desfecho: 'nao-respondeu', desfechoEm: dia(12, 15) },
            { em: dia(13, 9), desfecho: null },
          ],
        }),
      ],
      de,
      ate,
    });
    expect(m.tentativas).toBe(2);
    expect(m.cobrancasConcluidas).toBe(1);
    expect(m.semDesfecho).toBe(1);
  });

  it('a taxa de não-resposta é o número que a folha queria', () => {
    const m = metricasDeCobranca({
      commitments: [
        visita({ id: 'a', cobrancas: [{ em: dia(11), desfecho: 'nao-respondeu', desfechoEm: dia(11, 14) }] }),
        visita({ id: 'b', cobrancas: [{ em: dia(12), desfecho: 'respondeu', desfechoEm: dia(12, 12) }] }),
        visita({ id: 'c', cobrancas: [{ em: dia(13), desfecho: 'nova-data', desfechoEm: dia(13, 12) }] }),
        visita({ id: 'd', cobrancas: [{ em: dia(14), desfecho: 'nao-respondeu', desfechoEm: dia(14, 16) }] }),
      ],
      de,
      ate,
    });
    expect(m.percentualSemResposta).toBe(50);
    expect(m.percentualComNovaData).toBe(25);
    expect(m.novasDatas).toBe(1);
  });

  it('mede em TAXA, não só em total — total mente quando o volume muda', () => {
    const m = metricasDeCobranca({
      commitments: [
        visita({ id: 'a', cobrancas: [{ em: dia(11), desfecho: 'respondeu', desfechoEm: dia(11, 12) }] }),
        visita({ id: 'b' }),
        visita({ id: 'c' }),
        visita({ id: 'd' }),
      ],
      de,
      ate,
    });
    expect(m.visitas).toBe(4);
    expect(m.cobrancasPorCemVisitas).toBe(25);
  });

  it('a mediana até o desfecho mostra quanto o assunto fica aberto', () => {
    const m = metricasDeCobranca({
      commitments: [
        visita({ id: 'a', cobrancas: [{ em: dia(11, 10), desfecho: 'respondeu', desfechoEm: dia(11, 11) }] }),
        visita({ id: 'b', cobrancas: [{ em: dia(12, 10), desfecho: 'respondeu', desfechoEm: dia(12, 12) }] }),
        visita({ id: 'c', cobrancas: [{ em: dia(13, 10), desfecho: 'respondeu', desfechoEm: dia(13, 13) }] }),
      ],
      de,
      ate,
    });
    expect(m.medianaAteODesfechoEmMinutos).toBe(120);
  });

  it('conta a segunda tentativa, que é o retrabalho que mais cansa', () => {
    const m = metricasDeCobranca({
      commitments: [
        visita({ id: 'a', cobrancas: [{ em: dia(11), desfecho: 'nao-respondeu', desfechoEm: dia(11, 12) }, { em: dia(12), desfecho: null }] }),
        visita({ id: 'b', cobrancas: [{ em: dia(13), desfecho: 'respondeu', desfechoEm: dia(13, 12) }] }),
      ],
      de,
      ate,
    });
    expect(m.segundasTentativas).toBe(1);
  });

  it('período vazio não inventa taxa — devolve null em vez de zero', () => {
    // Zero por cento e "não houve nenhuma" são coisas diferentes, e confundi-las é
    // como um indicador vira mentira tranquila.
    const m = metricasDeCobranca({ commitments: [], de, ate });
    expect(m.percentualSemResposta).toBeNull();
    expect(m.cobrancasPorCemVisitas).toBeNull();
    expect(m.medianaAteODesfechoEmMinutos).toBeNull();
  });

  it('o que caiu fora do período fica fora', () => {
    const m = metricasDeCobranca({
      commitments: [visita({ startAt: dia(2), cobrancas: [{ em: dia(2), desfecho: 'respondeu', desfechoEm: dia(2, 12) }] })],
      de,
      ate,
    });
    expect(m.visitas).toBe(0);
    expect(m.tentativas).toBe(0);
  });
});

describe('as datas atravessam o JSON da API sem virar zero', () => {
  it('entende o Timestamp do Firestore nas duas grafias', () => {
    // O serializador copia o campo cru, e o `toJSON()` do Timestamp usa o nome
    // PRIVADO: `{_seconds, _nanoseconds}`. Só entender `seconds` fazia o painel
    // mostrar zero cobrança com visitas na tela — plausível e falso.
    const m = metricasDeCobranca({
      commitments: [
        {
          id: 'a',
          state: 'faltou',
          startAt: { _seconds: Math.floor(dia(12).getTime() / 1000), _nanoseconds: 0 },
          cobrancas: [
            {
              em: { _seconds: Math.floor(dia(12, 11).getTime() / 1000), _nanoseconds: 0 },
              desfecho: 'nao-respondeu',
              desfechoEm: { _seconds: Math.floor(dia(12, 12).getTime() / 1000), _nanoseconds: 0 },
            },
          ],
        },
      ],
      de,
      ate,
    });
    expect(m.visitas).toBe(1);
    expect(m.cobrancasConcluidas).toBe(1);
    expect(m.percentualSemResposta).toBe(100);
    expect(m.medianaAteODesfechoEmMinutos).toBe(60);
  });
});

describe('os filtros: por território e por quem cobrou', () => {
  const base = [
    {
      id: 'a',
      state: 'faltou',
      startAt: dia(11),
      ticketIds: ['OS-1', 'OS-2'],
      cobrancas: [
        { em: dia(11, 10), por: 'ana@x', desfecho: 'nao-respondeu', desfechoEm: dia(11, 11) },
        { em: dia(11, 14), por: 'bruno@x', desfecho: 'nova-data', desfechoEm: dia(11, 15) },
      ],
    },
    {
      id: 'b',
      state: 'faltou',
      startAt: dia(12),
      ticketIds: ['OS-9'],
      cobrancas: [{ em: dia(12, 10), por: 'ana@x', desfecho: 'respondeu', desfechoEm: dia(12, 12) }],
    },
  ];

  it('uma visita entra se QUALQUER OS dela está no recorte', () => {
    // A visita atende várias OS da mesma sede. Exigir todas faria a sede filtrada
    // perder justamente as visitas que resolvem mais de uma coisa por viagem.
    const m = metricasDeCobranca({ commitments: base, de, ate, ticketIds: ['OS-2'] });
    expect(m.visitas).toBe(1);
    expect(m.cobrancasConcluidas).toBe(2);
  });

  it('lista vazia é "nada passou"; null é "sem filtro"', () => {
    expect(metricasDeCobranca({ commitments: base, de, ate, ticketIds: [] }).visitas).toBe(0);
    expect(metricasDeCobranca({ commitments: base, de, ate, ticketIds: null }).visitas).toBe(2);
  });

  it('filtrar por pessoa conta só as cobranças dela', () => {
    const m = metricasDeCobranca({ commitments: base, de, ate, porEmail: 'ana@x' });
    expect(m.cobrancasConcluidas).toBe(2);
    expect(m.percentualSemResposta).toBe(50);
    // Duas cobranças na mesma visita, mas só uma é da Ana: não é segunda tentativa dela.
    expect(m.segundasTentativas).toBe(0);
  });

  it('por pessoa NÃO divide por visitas — a visita não tem dono', () => {
    // Dividir as cobranças de uma pessoa por todas as visitas viraria ranking de
    // funcionário: quanto mais gente cobrando, pior o número de cada uma.
    const m = metricasDeCobranca({ commitments: base, de, ate, porEmail: 'ana@x' });
    expect(m.cobrancasPorCemVisitas).toBeNull();
    expect(metricasDeCobranca({ commitments: base, de, ate }).cobrancasPorCemVisitas).toBe(150);
  });

  it('a lista de quem cobrou não encolhe quando se filtra por uma pessoa', () => {
    const m = metricasDeCobranca({ commitments: base, de, ate, porEmail: 'ana@x' });
    expect(m.quemCobrou).toEqual(['ana@x', 'bruno@x']);
  });
});
