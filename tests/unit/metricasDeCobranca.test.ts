import { describe, expect, it } from 'vitest';
import { metricasDeCobranca } from '../../api/_lib/metricasDeCobranca.js';

const de = new Date(2026, 7, 10, 0, 0, 0);
const ate = new Date(2026, 7, 17, 23, 59, 59);
const dia = (d: number, h = 10) => new Date(2026, 7, d, h, 0, 0);

const visita = (extra: Record<string, unknown> = {}) => ({
  id: 'c1',
  state: 'faltou',
  startAt: dia(12),
  sede: 'BN',
  vendorName: 'Elétrica Ceará',
  ...extra,
});

describe('o sistema mede o que a folha de papel mediria', () => {
  it('separa ACIONAMENTO de cobrança CLASSIFICADA', () => {
    // Abrir o WhatsApp não é ter cobrado. Contar junto inflaria justamente a
    // métrica que existe para proteger quem cobrou — e chamar os dois de "cobrança"
    // foi o que pôs dois números que não batem lado a lado na tela.
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
    expect(m.acionamentos).toBe(2);
    expect(m.classificados).toBe(1);
    expect(m.semDesfecho).toBe(1);
    expect(m.percentualClassificado).toBe(50);
  });

  it('a taxa por visita divide ACIONAMENTOS, e o nome diz isso', () => {
    const m = metricasDeCobranca({
      commitments: [
        visita({ id: 'a', cobrancas: [{ em: dia(11), desfecho: null }] }),
        visita({ id: 'b' }),
      ],
      de,
      ate,
    });
    expect(m.acionamentos).toBe(1);
    expect(m.classificados).toBe(0);
    expect(m.acionamentosPorCemVisitas).toBe(50);
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
    expect(m.acionamentosPorCemVisitas).toBeNull();
    expect(m.medianaAteODesfechoEmMinutos).toBeNull();
    expect(m.semCobertura).toBe(false);
  });

  it('o que caiu fora do período fica fora', () => {
    const m = metricasDeCobranca({
      commitments: [visita({ startAt: dia(2), cobrancas: [{ em: dia(2), desfecho: 'respondeu', desfechoEm: dia(2, 12) }] })],
      de,
      ate,
    });
    expect(m.visitas).toBe(0);
    expect(m.acionamentos).toBe(0);
  });
});

describe('a coorte é a VISITA — numerador e denominador do mesmo conjunto', () => {
  it('cobrança feita depois do período conta na visita a que pertence', () => {
    // Antes, visita entrava por `startAt` e cobrança por `em`: uma visita de julho
    // cobrada em agosto dava "1 visita, 1 cobrança, 100 por 100" em agosto, com a
    // cobrança pertencendo a outra visita. Taxa de conjuntos diferentes não é taxa.
    const m = metricasDeCobranca({
      commitments: [visita({ startAt: dia(16), cobrancas: [{ em: dia(25), desfecho: 'respondeu', desfechoEm: dia(25, 12) }] })],
      de,
      ate,
    });
    expect(m.visitas).toBe(1);
    expect(m.acionamentos).toBe(1);
    expect(m.acionamentosPorCemVisitas).toBe(100);
  });

  it('cobrança de visita FORA do período não entra, mesmo tendo sido feita dentro', () => {
    const m = metricasDeCobranca({
      commitments: [visita({ startAt: dia(2), cobrancas: [{ em: dia(12), desfecho: 'respondeu', desfechoEm: dia(12, 12) }] })],
      de,
      ate,
    });
    expect(m.visitas).toBe(0);
    expect(m.acionamentos).toBe(0);
  });

  it('cobrança sem data ainda conta como acionamento', () => {
    // A data só é necessária para a mediana. Exigi-la para contar fazia registro
    // legado sumir sem deixar rastro — subcontagem limpa, que é pior que erro visível.
    const m = metricasDeCobranca({
      commitments: [visita({ cobrancas: [{ desfecho: 'respondeu', desfechoEm: dia(12, 12) }] })],
      de,
      ate,
    });
    expect(m.acionamentos).toBe(1);
    expect(m.classificados).toBe(1);
    expect(m.medianaSobre).toBe(0);
  });

  it('visita CANCELADA não engorda o denominador', () => {
    const m = metricasDeCobranca({
      commitments: [visita({ id: 'a', state: 'cancelado' }), visita({ id: 'b', state: 'chegou' })],
      de,
      ate,
    });
    expect(m.visitas).toBe(1);
  });
});

describe('as porcentagens não escondem a amostra que as formou', () => {
  it('nove sem desfecho e uma respondida NÃO viram "0% sem resposta" sozinhos', () => {
    // O número continua certo; o que faltava era a tela saber que ele fala de 1 de 10.
    const cobrancas: Array<Record<string, unknown>> = [
      { em: dia(11, 10), desfecho: 'respondeu', desfechoEm: dia(11, 11) },
    ];
    for (let i = 0; i < 9; i += 1) cobrancas.push({ em: dia(12, 10), desfecho: null });
    const m = metricasDeCobranca({ commitments: [visita({ cobrancas })], de, ate });

    expect(m.percentualSemResposta).toBe(0);
    expect(m.classificados).toBe(1);
    expect(m.semDesfecho).toBe(9);
    expect(m.percentualClassificado).toBe(10);
  });

  it('desfecho fora dos três conhecidos não vira "não respondeu"', () => {
    const m = metricasDeCobranca({
      commitments: [visita({ cobrancas: [{ em: dia(12), desfecho: 'ligou-e-resolveu', desfechoEm: dia(12, 12) }] })],
      de,
      ate,
    });
    expect(m.naoResponderam).toBe(0);
    expect(m.desfechosDesconhecidos).toBe(1);
    expect(m.percentualSemResposta).toBe(0);
  });

  it('a mediana de quantidade PAR é a média dos dois centrais', () => {
    const m = metricasDeCobranca({
      commitments: [
        visita({ id: 'a', cobrancas: [{ em: dia(11, 10), desfecho: 'respondeu', desfechoEm: dia(11, 11) }] }),
        visita({ id: 'b', cobrancas: [{ em: dia(12, 10), desfecho: 'respondeu', desfechoEm: dia(12, 13) }] }),
      ],
      de,
      ate,
    });
    // 60 e 180 minutos: a mediana é 120, não 180.
    expect(m.medianaAteODesfechoEmMinutos).toBe(120);
    expect(m.medianaSobre).toBe(2);
  });

  it('a mediana de quantidade ímpar continua sendo o do meio', () => {
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

  it('a mediana diz sobre quantos ela foi calculada', () => {
    const m = metricasDeCobranca({
      commitments: [
        visita({ id: 'a', cobrancas: [{ em: dia(11, 10), desfecho: 'respondeu', desfechoEm: dia(11, 10, ) }] }),
        visita({ id: 'b', cobrancas: [{ em: dia(12, 10), desfecho: 'respondeu' }] }),
      ],
      de,
      ate,
    });
    expect(m.classificados).toBe(2);
    expect(m.medianaSobre).toBe(1);
  });
});

describe('período sem cobertura não é período vazio', () => {
  it('intervalo invertido se declara em vez de devolver zeros', () => {
    // A tela recorta o período escolhido contra a janela de dados; escolher janeiro
    // em agosto produzia `de` depois de `ate` e zeros com cara de resultado.
    const m = metricasDeCobranca({
      commitments: [visita({ cobrancas: [{ em: dia(12), desfecho: 'respondeu', desfechoEm: dia(12, 12) }] })],
      de: new Date(2026, 6, 19),
      ate: new Date(2026, 0, 31),
    });
    expect(m.semCobertura).toBe(true);
    expect(m.visitas).toBe(0);
    expect(m.percentualSemResposta).toBeNull();
  });
});

describe('as datas atravessam o JSON da API sem virar zero', () => {
  it('entende o Timestamp do Firestore nas duas grafias, com os nanossegundos', () => {
    // O serializador copia o campo cru, e o `toJSON()` do Timestamp usa o nome
    // PRIVADO: `{_seconds, _nanoseconds}`. Só entender `seconds` fazia o painel
    // mostrar zero cobrança com visitas na tela — plausível e falso.
    const stamp = (d: Date) => ({ _seconds: Math.floor(d.getTime() / 1000), _nanoseconds: (d.getTime() % 1000) * 1e6 });
    const m = metricasDeCobranca({
      commitments: [
        {
          id: 'a',
          state: 'faltou',
          startAt: stamp(dia(12)),
          cobrancas: [
            { em: stamp(dia(12, 11)), desfecho: 'nao-respondeu', desfechoEm: stamp(dia(12, 12)) },
          ],
        },
      ],
      de,
      ate,
    });
    expect(m.visitas).toBe(1);
    expect(m.classificados).toBe(1);
    expect(m.percentualSemResposta).toBe(100);
    expect(m.medianaAteODesfechoEmMinutos).toBe(60);
  });

  it('os nanossegundos decidem a fronteira do período', () => {
    const inicio = new Date(2026, 7, 12, 0, 0, 0, 500);
    const m = metricasDeCobranca({
      commitments: [
        {
          id: 'a',
          state: 'faltou',
          // 00:00:00.900 — descartar os nanossegundos jogaria para 00:00:00.000 e
          // deixaria de fora por arredondamento, não por calendário.
          startAt: { _seconds: Math.floor(new Date(2026, 7, 12, 0, 0, 0, 900).getTime() / 1000), _nanoseconds: 900e6 },
          cobrancas: [],
        },
      ],
      de: inicio,
      ate,
    });
    expect(m.visitas).toBe(1);
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
    expect(m.classificados).toBe(2);
  });

  it('lista vazia é "nada passou"; null é "sem filtro"', () => {
    expect(metricasDeCobranca({ commitments: base, de, ate, ticketIds: [] }).visitas).toBe(0);
    expect(metricasDeCobranca({ commitments: base, de, ate, ticketIds: null }).visitas).toBe(2);
  });

  it('filtrar por pessoa conta só as cobranças dela', () => {
    const m = metricasDeCobranca({ commitments: base, de, ate, porEmail: 'ana@x' });
    expect(m.classificados).toBe(2);
    expect(m.percentualSemResposta).toBe(50);
    // Duas cobranças na mesma visita, mas só uma é da Ana: não é segunda tentativa dela.
    expect(m.segundasTentativas).toBe(0);
  });

  it('espaço sobrando no cadastro não zera o filtro', () => {
    // O seletor da tela oferece o valor aparado; comparar contra o cru devolvia zero
    // sem erro nenhum, que é a falha mais difícil de perceber olhando a tela.
    const comEspaco = [{ ...base[1], cobrancas: [{ ...base[1].cobrancas[0], por: 'ana@x ' }] }];
    const m = metricasDeCobranca({ commitments: comEspaco, de, ate });
    expect(m.quemCobrou).toEqual(['ana@x']);
    expect(metricasDeCobranca({ commitments: comEspaco, de, ate, porEmail: 'ana@x' }).classificados).toBe(1);
  });

  it('por pessoa NÃO divide por visitas — a visita não tem dono', () => {
    // Dividir as cobranças de uma pessoa por todas as visitas viraria ranking de
    // funcionário: quanto mais gente cobrando, pior o número de cada uma.
    const m = metricasDeCobranca({ commitments: base, de, ate, porEmail: 'ana@x' });
    expect(m.acionamentosPorCemVisitas).toBeNull();
    expect(metricasDeCobranca({ commitments: base, de, ate }).acionamentosPorCemVisitas).toBe(150);
  });

  it('a lista de quem cobrou não encolhe quando se filtra por uma pessoa', () => {
    const m = metricasDeCobranca({ commitments: base, de, ate, porEmail: 'ana@x' });
    expect(m.quemCobrou).toEqual(['ana@x', 'bruno@x']);
  });
});
