import { describe, expect, it } from 'vitest';
import {
  GAUGE_BY_SITE,
  MAX_READING_AGE_MINUTES,
  MIN_RAIN_MM,
  describeStationRain,
  fetchCemaden,
  findStation,
  normalizeStation,
  parseAccumulation,
  parseCemadenTimestamp,
  readCityRain,
  readSiteRain,
  readStation,
  readingAgeMinutes,
  stationsForCity,
} from '../../api/_lib/cemaden.js';

/**
 * Registros REAIS capturados em 2026-07-31 ~18:57 UTC do painel do CEMADEN.
 * O "Panamericano" é o caso perigoso: valor > 0 congelado com carimbo de dois dias.
 */
const AGORA = new Date('2026-07-31T19:00:00Z');
const EDSON = { idestacao: 3001, uf: 'CE', codibge: 2304400, cidade: 'FORTALEZA', nomeestacao: 'Edson Queiroz', ultimovalor: 0, datahoraUltimovalor: '31/07/26 18:20', acc1hr: '-', acc24hr: '-' };
const JOAO = { idestacao: 2988, cidade: 'FORTALEZA', nomeestacao: 'João XXIII', ultimovalor: 0, datahoraUltimovalor: '31/07/26 18:00', acc1hr: '-', acc24hr: 1.59 };
const PANAMERICANO = { idestacao: 2992, cidade: 'FORTALEZA', nomeestacao: 'Panamericano', ultimovalor: 0.39, datahoraUltimovalor: '29/07/26 05:30', acc1hr: '-', acc24hr: '-' };
const RIO_COCO = { idestacao: 6665, cidade: 'FORTALEZA', nomeestacao: 'Rio Coco', ultimovalor: 0, datahoraUltimovalor: '15/06/22 10:10', acc1hr: '-', acc24hr: '-' };
const CHOVENDO = { idestacao: 9999, cidade: 'FORTALEZA', nomeestacao: 'Passare', ultimovalor: 0.6, datahoraUltimovalor: '31/07/26 18:50', acc1hr: '0.8', acc24hr: '3.2' };
/** UMA báscula (0,2 mm) — o menor evento mensurável. Visto no João XXIII em 96h secas. */
const UMA_BASCULA = { cidade: 'FORTALEZA', nomeestacao: 'Dias Macedo', ultimovalor: 0.2, datahoraUltimovalor: '31/07/26 18:50', acc1hr: '-', acc24hr: '0.2' };
/** Chuva fina e constante: nunca 0,4 numa leitura, mas acumula na hora. */
const FINA_CONSTANTE = { cidade: 'FORTALEZA', nomeestacao: 'Vila Pery', ultimovalor: 0.2, datahoraUltimovalor: '31/07/26 18:50', acc1hr: '1.2', acc24hr: '2.0' };
const LISTA = [EDSON, JOAO, PANAMERICANO, RIO_COCO, CHOVENDO, { cidade: 'MARACANAÚ', nomeestacao: 'Jereissati', ultimovalor: 0, datahoraUltimovalor: '31/07/26 18:40', acc1hr: '-', acc24hr: '-' }];

describe('parseCemadenTimestamp', () => {
  it('lê o carimbo como UTC', () => {
    // Verificado em produção: com o relógio em 18h57 UTC, o grosso das estações
    // marcava 18h10. Ler como hora de Fortaleza daria 3 horas de erro.
    expect(parseCemadenTimestamp('31/07/26 18:20')?.toISOString()).toBe('2026-07-31T18:20:00.000Z');
  });

  it('devolve null no que não for carimbo', () => {
    expect(parseCemadenTimestamp('')).toBeNull();
    expect(parseCemadenTimestamp('ontem')).toBeNull();
    expect(parseCemadenTimestamp(null)).toBeNull();
  });
});

describe('parseAccumulation', () => {
  it('trata "-" como ZERO, não como ausência de dado', () => {
    // O João XXIII trazia acc1hr:"-" junto de acc24hr:1.59 — choveu no dia, não na hora.
    expect(parseAccumulation('-')).toBe(0);
    expect(parseAccumulation(1.59)).toBe(1.59);
    expect(parseAccumulation('0,6')).toBe(0.6);
    expect(parseAccumulation(null)).toBe(0);
  });
});

describe('readStation', () => {
  it('leitura fresca com volume é chuva', () => {
    const r = readStation(CHOVENDO, AGORA);
    expect(r.state).toBe('chovendo');
    expect(r.raining).toBe(true);
    expect(r.acc1h).toBe(0.8);
  });

  it('leitura fresca com zero é ausência de chuva', () => {
    expect(readStation(EDSON, AGORA).state).toBe('nao-chovendo');
  });

  it('🪣 UMA báscula (0,2 mm) NÃO é chuva', () => {
    // Medido em produção: em 96h secas, o João XXIII registrou uma báscula. Com o
    // limite antigo (`> 0`) isso viraria e-mail, a Thaís iria olhar a goteira e não
    // teria nada para ver — e alerta que erra assim é alerta que ninguém abre depois.
    const r = readStation(UMA_BASCULA, AGORA);
    expect(r.state).toBe('nao-chovendo');
    expect(r.mm).toBe(0.2);
  });

  it('duas básculas na MESMA leitura é chuva', () => {
    expect(readStation({ ...UMA_BASCULA, ultimovalor: MIN_RAIN_MM }, AGORA).state).toBe('chovendo');
  });

  it('chuva fina e constante conta pelo acumulado da hora', () => {
    // 0,2 mm por leitura nunca atinge o limite sozinha, mas acumula — é a chuva que
    // enche calha e faz goteira pingar. Sem esta regra, ela passaria despercebida.
    const r = readStation(FINA_CONSTANTE, AGORA);
    expect(r.state).toBe('chovendo');
    expect(r.mm).toBe(0.2);
    expect(r.acc1h).toBe(1.2);
  });

  it('🚨 posto CONGELADO com valor > 0 não vira chuva eterna', () => {
    // O painel guarda o último valor quando a estação cai. O Panamericano marcava
    // 0,39 mm com carimbo de 2 dias antes: sem corte por idade, reportaria chuva
    // para sempre e a Thaís receberia alerta todo dia.
    const r = readStation(PANAMERICANO, AGORA);
    expect(r.state).toBe('desconhecido');
    expect(r.raining).toBe(false);
    expect(r.reason).toContain('min atrás');
  });

  it('posto morto há anos também é desconhecido, não "sem chuva"', () => {
    expect(readStation(RIO_COCO, AGORA).state).toBe('desconhecido');
  });

  it('tolera relógio da estação adiantado, mas não absurdo', () => {
    const poucoAdiantado = { ...EDSON, datahoraUltimovalor: '31/07/26 19:10' }; // 10 min à frente
    expect(readStation(poucoAdiantado, AGORA).state).toBe('nao-chovendo');
    const muitoAdiantado = { ...EDSON, datahoraUltimovalor: '31/07/26 23:00' };
    expect(readStation(muitoAdiantado, AGORA).state).toBe('desconhecido');
  });

  it('valor nulo é desconhecido', () => {
    expect(readStation({ ...EDSON, ultimovalor: null }, AGORA).state).toBe('desconhecido');
    expect(readStation(null, AGORA).state).toBe('desconhecido');
  });

  it('a borda da idade é o limite declarado', () => {
    const noLimite = new Date(parseCemadenTimestamp(EDSON.datahoraUltimovalor)!.getTime() + MAX_READING_AGE_MINUTES * 60000);
    expect(readStation(EDSON, noLimite).state).toBe('nao-chovendo');
    const passouUmMinuto = new Date(noLimite.getTime() + 60000);
    expect(readStation(EDSON, passouUmMinuto).state).toBe('desconhecido');
  });
});

describe('readingAgeMinutes', () => {
  it('mede a idade', () => {
    expect(readingAgeMinutes(normalizeStation(EDSON), AGORA)).toBe(40);
  });
});

describe('stationsForCity / findStation', () => {
  it('filtra por cidade ignorando acento e caixa', () => {
    expect(stationsForCity(LISTA, 'fortaleza')).toHaveLength(5);
    expect(stationsForCity(LISTA, 'MARACANAU')).toHaveLength(1);
  });

  it('acha o posto pelo nome sem depender de acento', () => {
    expect(findStation(LISTA, { city: 'FORTALEZA', name: 'joao xxiii' })?.acc24h).toBe(1.59);
    expect(findStation(LISTA, { city: 'FORTALEZA', name: 'Inexistente' })).toBeNull();
  });

  it('aguenta lista inválida', () => {
    expect(stationsForCity(null, 'FORTALEZA')).toEqual([]);
  });
});

describe('readCityRain — o agregado da cidade', () => {
  it('basta UM posto vivo com chuva', () => {
    // Chuva convectiva é local: exigir maioria calaria a pancada de bairro.
    const r = readCityRain([EDSON, JOAO, CHOVENDO], 'FORTALEZA', AGORA);
    expect(r.state).toBe('chovendo');
    expect(r.rainingAt).toEqual(['Passare']);
    expect(r.gaugesLive).toBe(3);
  });

  it('todos vivos e secos é ausência de chuva', () => {
    const r = readCityRain([EDSON, JOAO], 'FORTALEZA', AGORA);
    expect(r.state).toBe('nao-chovendo');
    expect(r.gaugesLive).toBe(2);
  });

  it('postos MUDOS não contam em nenhuma direção', () => {
    // Só posto congelado e morto: não dá para afirmar seca nem chuva.
    const r = readCityRain([PANAMERICANO, RIO_COCO], 'FORTALEZA', AGORA);
    expect(r.state).toBe('desconhecido');
    expect(r.gaugesLive).toBe(0);
    expect(r.reason).toContain('nenhum posto vivo');
  });

  it('o posto congelado com 0,39 mm não arrasta a cidade para "chovendo"', () => {
    const r = readCityRain([EDSON, PANAMERICANO], 'FORTALEZA', AGORA);
    expect(r.state).toBe('nao-chovendo');
    expect(r.rainingAt).toEqual([]);
  });

  it('reporta o maior volume entre os que registram', () => {
    const forte = { ...CHOVENDO, nomeestacao: 'Dias Macedo', ultimovalor: 1.4, acc1hr: '2.8' };
    const r = readCityRain([CHOVENDO, forte], 'FORTALEZA', AGORA);
    expect(r.mm).toBe(1.4);
    expect(r.name).toBe('Dias Macedo');
    expect(r.rainingAt).toHaveLength(2);
  });

  it('cidade sem posto nenhum é desconhecido', () => {
    expect(readCityRain(LISTA, 'SOBRAL', AGORA).state).toBe('desconhecido');
  });
});

describe('readSiteRain', () => {
  it('Eusébio usa o posto vizinho nomeado', () => {
    expect(GAUGE_BY_SITE.EUS).toMatchObject({ city: 'FORTALEZA', name: 'Edson Queiroz' });
    const r = readSiteRain(LISTA, 'EUS', { now: AGORA });
    expect(r.gauge).toBe('Edson Queiroz (FORTALEZA)');
    expect(r.state).toBe('nao-chovendo');
  });

  it('as demais sedes usam o agregado de Fortaleza — nenhuma fica cega', () => {
    // Todas as sedes menos Eusébio são em Fortaleza (informado pelo dono), então não
    // existe mapa de 20 sedes para manter.
    const r = readSiteRain(LISTA, 'ALD', { now: AGORA });
    expect(r.state).toBe('chovendo'); // a LISTA tem o posto "Passare" com chuva
    expect(r.gauge).toBe('todos os postos de FORTALEZA');
  });

  it('posto nomeado que sumiu da lista cai no agregado, não fica cego', () => {
    const r = readSiteRain(LISTA, 'XPT', { now: AGORA, mapping: { XPT: { city: 'FORTALEZA', name: 'Fantasma' } } });
    expect(r.state).toBe('chovendo');
    expect(r.fallbackFrom).toBe('Fantasma');
  });

  it('aceita o código da sede em qualquer caixa', () => {
    expect(readSiteRain(LISTA, 'eus', { now: AGORA }).gauge).toBe('Edson Queiroz (FORTALEZA)');
  });
});

describe('describeStationRain', () => {
  it('descreve para o e-mail', () => {
    expect(describeStationRain(readStation(CHOVENDO, AGORA))).toBe('chuva agora (0.6 mm na leitura, 0.8 mm na última hora)');
    expect(describeStationRain(readStation(EDSON, AGORA))).toBe('sem chuva no posto agora');
    expect(describeStationRain(readStation(PANAMERICANO, AGORA))).toContain('sem leitura confiável');
  });
});

describe('fetchCemaden', () => {
  it('monta a URL do estado', async () => {
    let url = '';
    const list = await fetchCemaden({
      fetchImpl: async u => {
        url = u;
        return { ok: true, json: async () => LISTA };
      },
    });
    expect(url).toBe('https://resources.cemaden.gov.br/graficos/interativo/getJson2.php?uf=CE');
    expect(list).toHaveLength(6);
  });

  it('resposta fora do formato vira lista vazia, não estouro', async () => {
    expect(await fetchCemaden({ fetchImpl: async () => ({ ok: true, json: async () => ({}) }) })).toEqual([]);
  });

  it('falha explicitamente no erro do CEMADEN', async () => {
    await expect(fetchCemaden({ fetchImpl: async () => ({ ok: false, status: 500 }) })).rejects.toThrow('500');
  });
});
