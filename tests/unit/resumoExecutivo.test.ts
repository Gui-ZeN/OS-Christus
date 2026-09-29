import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  handleResumoExecutivo,
  limitesDoMes,
  limparCacheDoResumo,
  mesCorrenteEmFortaleza,
} from '../../api/_lib/resumoExecutivo.js';
import { invalidateRefCache } from '../../api/_lib/refCache.js';

/**
 * O Resumo Executivo do Chromos: só contadores por sede, com token próprio.
 * Os números têm que ser os MESMOS do painel de Indicadores — por isso os testes
 * olham as definições, não só o formato.
 */

const TOKEN = 'token-de-teste-do-resumo';

const regions = [
  { id: 'r-col', name: 'Colégio Centro', group: 'operacao' },
  { id: 'r-uni', name: 'Unichristus', group: 'universidade' },
];
const sites = [
  { id: 's-pql1', code: 'PQL1', name: 'Parquelândia 1', regionId: 'r-col' },
  { id: 's-dt', code: 'DT', name: 'Dom Luís', regionId: 'r-col' },
  { id: 's-bn', code: 'BN', name: 'Benfica', regionId: 'r-uni' },
];

/** Fortaleza é UTC-3: `emFortaleza('2026-09-10T10:00')` é o instante daquela hora local. */
const emFortaleza = (local: string) => new Date(`${local}:00-03:00`);

// Dados pessoais de propósito: nenhum deles pode aparecer na resposta.
const PESSOAL = {
  id: 'OS-0999',
  requester: 'Fulana de Tal',
  requesterEmail: 'fulana@christus.com.br',
  description: 'Vazamento no banheiro da diretoria',
  assignedTo: 'Beltrano',
  subject: 'Assunto sigiloso',
};

function os(campos: Record<string, unknown>) {
  return { ...PESSOAL, priority: 'Alta', macroServiceId: 'm', serviceCatalogId: 's', ...campos };
}

function fakeDb(tickets: Record<string, unknown>[]) {
  const leituras = { tickets: 0 };
  const colecoes: Record<string, Record<string, unknown>[]> = { tickets, regions, sites };
  const db = {
    collection(nome: string) {
      const consulta = {
        select: () => consulta,
        get: async () => {
          if (nome === 'tickets') leituras.tickets += 1;
          return { docs: (colecoes[nome] || []).map((data, i) => ({ id: `${nome}-${i}`, data: () => data })) };
        },
      };
      return consulta;
    },
  };
  return { db, leituras };
}

function fakeRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(nome: string, valor: string) {
      res.headers[nome] = valor;
    },
    end(corpo: string) {
      res.body = corpo;
    },
    get json() {
      return JSON.parse(res.body);
    },
  };
  return res;
}

async function chamar(
  tickets: Record<string, unknown>[],
  { mes, token = TOKEN, method = 'GET', agora = emFortaleza('2026-09-29T11:05') } = {} as {
    mes?: string;
    token?: string | null;
    method?: string;
    agora?: Date;
  }
) {
  const { db, leituras } = fakeDb(tickets);
  const res = fakeRes();
  const req = {
    method,
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
    query: mes ? { route: 'resumo-executivo', mes } : { route: 'resumo-executivo' },
  };
  await handleResumoExecutivo(req, res, { db, agora });
  return { res, leituras };
}

beforeEach(() => {
  process.env.RESUMO_EXECUTIVO_TOKEN = TOKEN;
  limparCacheDoResumo();
  invalidateRefCache();
});

afterEach(() => {
  delete process.env.RESUMO_EXECUTIVO_TOKEN;
});

describe('a porta: token próprio, fechada por padrão', () => {
  it('sem a variável configurada responde 503, mesmo com cabeçalho', async () => {
    delete process.env.RESUMO_EXECUTIVO_TOKEN;
    const { res } = await chamar([], { token: '' });
    expect(res.statusCode).toBe(503);
  });

  it('token ausente é 401', async () => {
    const { res } = await chamar([], { token: null });
    expect(res.statusCode).toBe(401);
  });

  it('token errado é 401', async () => {
    const { res } = await chamar([], { token: 'outro-token' });
    expect(res.statusCode).toBe(401);
  });

  it('token certo é 200', async () => {
    const { res } = await chamar([]);
    expect(res.statusCode).toBe(200);
    expect(res.json.versao).toBe(1);
  });

  it('POST é 405, antes de olhar o token', async () => {
    const { res } = await chamar([], { method: 'POST', token: null });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });

  it('mês malformado é 400', async () => {
    const { res } = await chamar([], { mes: '2026-13' });
    expect(res.statusCode).toBe(400);
  });
});

describe('o mês é o de Fortaleza', () => {
  it('OS criada 31/08 às 22h em Fortaleza (01/09 em UTC) conta em agosto', async () => {
    const criada = emFortaleza('2026-08-31T22:00');
    expect(criada.toISOString()).toBe('2026-09-01T01:00:00.000Z');
    const tickets = [os({ sede: 'PQL1', status: 'Em andamento', time: criada })];

    const agosto = await chamar(tickets, { mes: '2026-08' });
    expect(agosto.res.json.geral.abertasNoMes).toBe(1);

    limparCacheDoResumo();
    const setembro = await chamar(tickets, { mes: '2026-09' });
    expect(setembro.res.json.geral.abertasNoMes).toBe(0);
  });

  it('sem `mes`, usa o mês corrente em Fortaleza', async () => {
    // 01/10 às 01h UTC ainda é 30/09 em Fortaleza.
    const agora = new Date('2026-10-01T01:00:00.000Z');
    expect(mesCorrenteEmFortaleza(agora)).toBe('2026-09');
    const { res } = await chamar([], { agora });
    expect(res.json.mes).toBe('2026-09');
    expect(res.json.geradoEm).toBe('2026-09-30T22:00:00-03:00');
  });

  it('os limites do mês vão da meia-noite ao último milissegundo, em Fortaleza', () => {
    const { inicio, fim } = limitesDoMes('2026-09');
    expect(inicio.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-10-01T02:59:59.999Z');
  });
});

describe('as definições são as do painel', () => {
  it('OS marcada como teste (`excludedFromMetrics`) fica fora de tudo', async () => {
    const { res } = await chamar([
      os({ sede: 'PQL1', status: 'Em andamento', time: emFortaleza('2026-09-02T10:00'), excludedFromMetrics: true }),
      os({ sede: 'ZZZ', status: 'Nova OS', time: emFortaleza('2026-09-02T10:00'), excludedFromMetrics: true }),
    ]);
    expect(res.json.geral.abertas).toBe(0);
    expect(res.json.geral.abertasNoMes).toBe(0);
    expect(res.json.porSede).toEqual([]);
    expect(res.json.semSede.abertas).toBe(0);
  });

  it('OS com sede que não resolve no catálogo vai para `semSede`', async () => {
    const { res } = await chamar([
      os({ sede: 'Sede Inventada', status: 'Nova OS', time: emFortaleza('2026-09-02T10:00') }),
      os({ siteId: 's-dt', status: 'Nova OS', time: emFortaleza('2026-09-02T10:00') }),
    ]);
    expect(res.json.semSede.abertas).toBe(1);
    expect(res.json.porSede.map((linha: { sede: string }) => linha.sede)).toEqual(['DT']);
    expect(res.json.geral.abertas).toBe(2);
  });

  it('mediana é `null` sem OS fechada no mês — nunca 0', async () => {
    const { res } = await chamar([os({ sede: 'PQL1', status: 'Em andamento', time: emFortaleza('2026-09-02T10:00') })]);
    expect(res.json.geral.resolucaoMedianaDias).toBeNull();
    expect(res.json.porSede[0].resolucaoMedianaDias).toBeNull();
  });

  it('abertas, urgentes e travadas contam o estado de AGORA, sem recorte de mês', async () => {
    const { res } = await chamar([
      os({ sede: 'PQL1', status: 'Em andamento', priority: 'Urgente', time: emFortaleza('2026-01-10T10:00') }),
      // Parecer técnico sem classificação: é o que `bloqueioParaAvancar` chama de travada.
      os({
        sede: 'PQL1',
        status: 'Aguardando Parecer Técnico',
        macroServiceId: '',
        serviceCatalogId: '',
        time: emFortaleza('2026-09-03T10:00'),
      }),
      os({ sede: 'PQL1', status: 'Encerrada', priority: 'Urgente', time: emFortaleza('2026-09-01T10:00') }),
    ]);
    const pql1 = res.json.porSede[0];
    expect(pql1).toMatchObject({ sede: 'PQL1', grupo: 'operacao', abertas: 2, urgentesAbertas: 1, travadas: 1 });
  });

  it('encerradas no mês = FECHADAS no mês com status Encerrada; Cancelada não conta', async () => {
    const { res } = await chamar([
      // Aberta em agosto, encerrada em setembro: conta em setembro.
      os({ sede: 'DT', status: 'Encerrada', time: emFortaleza('2026-08-20T10:00'), closedAt: emFortaleza('2026-09-05T10:00') }),
      // Cancelada em setembro: não é encerrada.
      os({ sede: 'DT', status: 'Cancelada', time: emFortaleza('2026-09-01T10:00'), closedAt: emFortaleza('2026-09-02T10:00') }),
      // Encerrada em agosto: fora de setembro.
      os({ sede: 'DT', status: 'Encerrada', time: emFortaleza('2026-08-01T10:00'), closedAt: emFortaleza('2026-08-30T10:00') }),
    ], { mes: '2026-09' });
    expect(res.json.porSede[0].encerradasNoMes).toBe(1);
    // A mediana segue o painel e inclui a cancelada: [16 dias, 1 dia] → 8,5 → 9.
    expect(res.json.porSede[0].resolucaoMedianaDias).toBe(9);
  });

  it('mediana de grupo e geral é sobre o conjunto inteiro, não a média das sedes', async () => {
    const fechada = (sede: string, dias: number) =>
      os({
        sede,
        status: 'Encerrada',
        time: emFortaleza('2026-09-01T10:00'),
        closedAt: new Date(emFortaleza('2026-09-01T10:00').getTime() + dias * 86_400_000),
      });
    // PQL1: [1, 2, 3] → 2.  DT: [20] → 20.  Média das sedes seria 11; a mediana de
    // [1, 2, 3, 20] é 2,5 → 3 (arredondada, como no painel).
    const { res } = await chamar([fechada('PQL1', 1), fechada('PQL1', 2), fechada('PQL1', 3), fechada('DT', 20)], {
      mes: '2026-09',
    });
    const porSede = Object.fromEntries(
      res.json.porSede.map((linha: { sede: string; resolucaoMedianaDias: number }) => [linha.sede, linha.resolucaoMedianaDias])
    );
    expect(porSede).toEqual({ DT: 20, PQL1: 2 });
    expect(res.json.porGrupo.operacao.resolucaoMedianaDias).toBe(3);
    expect(res.json.geral.resolucaoMedianaDias).toBe(3);
  });

  it('o grupo é o `region.group` cru, por grupo', async () => {
    const { res } = await chamar([
      os({ sede: 'BN', status: 'Nova OS', time: emFortaleza('2026-09-02T10:00') }),
      os({ sede: 'PQL1', status: 'Nova OS', time: emFortaleza('2026-09-02T10:00') }),
    ]);
    expect(Object.keys(res.json.porGrupo).sort()).toEqual(['operacao', 'universidade']);
    expect(res.json.porSede.find((l: { sede: string }) => l.sede === 'BN').grupo).toBe('universidade');
  });
});

describe('nenhum dado pessoal sai', () => {
  it('a resposta só tem as chaves do contrato e nenhum valor da OS', async () => {
    const { res } = await chamar([
      os({ sede: 'PQL1', status: 'Em andamento', time: emFortaleza('2026-09-02T10:00') }),
      os({ sede: 'Sem Catálogo', status: 'Encerrada', time: emFortaleza('2026-09-02T10:00'), closedAt: emFortaleza('2026-09-04T10:00') }),
    ]);

    const chaves = new Set<string>();
    const visitar = (valor: unknown) => {
      if (Array.isArray(valor)) return valor.forEach(visitar);
      if (valor && typeof valor === 'object') {
        for (const [chave, filho] of Object.entries(valor)) {
          chaves.add(chave);
          visitar(filho);
        }
      }
    };
    visitar(res.json);

    const CONTADORES = ['abertas', 'urgentesAbertas', 'travadas', 'abertasNoMes', 'encerradasNoMes', 'resolucaoMedianaDias'];
    const PERMITIDAS = new Set([
      'versao', 'geradoEm', 'mes', 'porSede', 'porGrupo', 'geral', 'semSede', 'sede', 'grupo',
      'operacao', 'universidade', ...CONTADORES,
    ]);
    expect([...chaves].filter(chave => !PERMITIDAS.has(chave))).toEqual([]);

    for (const valor of Object.values(PESSOAL)) {
      expect(res.body).not.toContain(valor);
    }
  });
});

describe('cache de ~5 min por mês', () => {
  it('a segunda chamada no mesmo mês não relê as OS', async () => {
    const tickets = [os({ sede: 'PQL1', status: 'Nova OS', time: emFortaleza('2026-09-02T10:00') })];
    const { db, leituras } = fakeDb(tickets);
    const agora = emFortaleza('2026-09-29T11:05');
    const pedir = async (quando: Date, mes = '2026-09') => {
      const res = fakeRes();
      await handleResumoExecutivo(
        { method: 'GET', headers: { authorization: `Bearer ${TOKEN}` }, query: { mes } },
        res,
        { db, agora: quando }
      );
      return res;
    };

    await pedir(agora);
    await pedir(new Date(agora.getTime() + 4 * 60_000));
    expect(leituras.tickets).toBe(1);

    await pedir(agora, '2026-08');
    expect(leituras.tickets).toBe(2);

    await pedir(new Date(agora.getTime() + 6 * 60_000));
    expect(leituras.tickets).toBe(3);
  });
});
