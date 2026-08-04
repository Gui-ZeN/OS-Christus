import { describe, expect, it } from 'vitest';
import { detectRainTransition, readRainSignal } from '../../api/_lib/rainWatch.js';
import { parseWeatherCodes, readObservation, describeRain, fetchMetar } from '../../api/_lib/metar.js';

/** Observações REAIS capturadas em 2026-07-31 da aviationweather.gov e do CEMADEN. */
const AGORA = new Date('2026-07-31T19:00:00Z');

const SBFZ_SECO = {
  icaoId: 'SBFZ',
  obsTime: 1785520800, // 18:00Z
  metarType: 'METAR',
  wxString: null,
  rawOb: 'METAR SBFZ 311800Z 08010KT 9999 FEW028 29/21 Q1012',
};
const SBFZ_CHUVA = {
  icaoId: 'SBFZ',
  obsTime: 1785523140, // 18:39Z
  metarType: 'SPECI',
  wxString: '-RA',
  rawOb: 'SPECI SBFZ 311839Z 08010KT 8000 -RA SCT020 26/22 Q1012',
};

const POSTO_SECO = { cidade: 'FORTALEZA', nomeestacao: 'Edson Queiroz', ultimovalor: 0, datahoraUltimovalor: '31/07/26 18:20', acc1hr: '-', acc24hr: '-' };
const POSTO_CHUVA = { cidade: 'FORTALEZA', nomeestacao: 'Edson Queiroz', ultimovalor: 0.6, datahoraUltimovalor: '31/07/26 18:50', acc1hr: '0.8', acc24hr: '3.2' };
const POSTO_MUDO = { cidade: 'FORTALEZA', nomeestacao: 'Edson Queiroz', ultimovalor: 0.39, datahoraUltimovalor: '29/07/26 05:30', acc1hr: '-', acc24hr: '-' };

describe('parseWeatherCodes', () => {
  it('reconhece chuva e intensidade', () => {
    expect(parseWeatherCodes('-RA')).toMatchObject({ raining: true, intensity: 'fraca' });
    expect(parseWeatherCodes('+TSRA')).toMatchObject({ raining: true, intensity: 'forte', phenomena: ['chuva com trovoada'] });
    expect(parseWeatherCodes('SHRA').phenomena).toEqual(['pancada de chuva']);
  });

  it('RE… é chuva RECENTE — já parou', () => {
    expect(parseWeatherCodes('RERA')).toMatchObject({ raining: false, recent: true });
  });

  it('VC… é nas redondezas, não sobre a estação', () => {
    expect(parseWeatherCodes('VCSH')).toMatchObject({ raining: false, nearby: true });
  });

  it('não confunde sigla de nuvem com precipitação', () => {
    expect(parseWeatherCodes('METAR SBGR 311800Z 07008KT CAVOK 23/11 Q1024').raining).toBe(false);
    expect(parseWeatherCodes('SCT006 BKN023 FEW025TCU BKN060').raining).toBe(false);
  });

  it('lê o grupo dentro do METAR cru', () => {
    expect(parseWeatherCodes(SBFZ_CHUVA.rawOb).raining).toBe(true);
  });
});

describe('readObservation', () => {
  it('lê seco e chuva de observações reais', () => {
    expect(readObservation(SBFZ_SECO, AGORA).state).toBe('nao-chovendo');
    const chuva = readObservation(SBFZ_CHUVA, AGORA);
    expect(chuva.state).toBe('chovendo');
    expect(chuva.speci).toBe(true);
    expect(describeRain(chuva)).toBe('chuva fraca');
  });

  it('observação velha vira DESCONHECIDO, não "não está chovendo"', () => {
    const tarde = new Date(AGORA.getTime() + 3 * 60 * 60000);
    expect(readObservation(SBFZ_SECO, tarde).state).toBe('desconhecido');
    expect(readObservation(null, AGORA).state).toBe('desconhecido');
  });
});

describe('detectRainTransition', () => {
  it('só a virada para chuva é evento', () => {
    expect(detectRainTransition('nao-chovendo', 'chovendo')).toBe('comecou');
    expect(detectRainTransition('chovendo', 'nao-chovendo')).toBe('parou');
    expect(detectRainTransition('chovendo', 'chovendo')).toBe('sem-mudanca');
  });

  it('sair de DESCONHECIDO não conta como chuva começando', () => {
    // Fonte que ficou muda e voltou não é chuva nova — seria alarme falso a cada
    // atraso de publicação.
    expect(detectRainTransition('desconhecido', 'chovendo')).toBe('sem-mudanca');
    expect(detectRainTransition(null, 'chovendo')).toBe('sem-mudanca');
    expect(detectRainTransition('chovendo', 'desconhecido')).toBe('sem-mudanca');
  });
});

describe('readRainSignal — as duas fontes juntas', () => {
  const args = (posto: unknown, metar: unknown) => ({
    siteCode: 'EUS',
    cemadenList: [posto],
    metarObservation: metar,
    now: AGORA,
  });

  it('posto do bairro vence quando registra chuva', () => {
    const r = readRainSignal(args(POSTO_CHUVA, SBFZ_SECO));
    expect(r.state).toBe('chovendo');
    expect(r.source).toBe('posto');
    expect(r.detalhe).toContain('0.8 mm na última hora');
  });

  it('🚀 aeroporto dispara sozinho — é ele que chega primeiro', () => {
    // O SPECI sai em minutos; o pluviômetro pode levar 15 a 60. Exigir concordância
    // perderia justamente o começo da chuva, que é o que a Thaís pediu.
    const r = readRainSignal(args(POSTO_SECO, SBFZ_CHUVA));
    expect(r.state).toBe('chovendo');
    expect(r.source).toBe('aeroporto');
  });

  it('quando é o aeroporto, a frase avisa que foi visto a 15 km', () => {
    // Quem lê precisa saber que a chuva não foi medida no bairro da sede.
    const r = readRainSignal(args(POSTO_SECO, SBFZ_CHUVA));
    expect(r.detalhe).toContain('~15 km');
    expect(r.detalhe).toContain('ainda não registrou');
  });

  it('as duas seco é ausência de chuva', () => {
    expect(readRainSignal(args(POSTO_SECO, SBFZ_SECO)).state).toBe('nao-chovendo');
  });

  it('posto mudo + aeroporto seco ainda é "não chovendo" (uma fonte confiável basta)', () => {
    const r = readRainSignal(args(POSTO_MUDO, SBFZ_SECO));
    expect(r.state).toBe('nao-chovendo');
    expect(r.source).toBe('aeroporto');
  });

  it('as duas mudas é DESCONHECIDO — nunca ausência inventada', () => {
    const r = readRainSignal(args(POSTO_MUDO, null));
    expect(r.state).toBe('desconhecido');
    expect(r.raining).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('sede sem posto nomeado usa o agregado da cidade, não o aeroporto', () => {
    // Todas as sedes menos Eusébio são em Fortaleza: o padrão passou a ser o conjunto
    // dos postos da cidade, que é mais perto do que o aeroporto a 15 km.
    const r = readRainSignal({ ...args(POSTO_CHUVA, SBFZ_SECO), siteCode: 'ALD' });
    expect(r.state).toBe('chovendo');
    expect(r.source).toBe('posto');
    expect(r.fontes.posto.detalhe).toContain('Edson Queiroz');
  });

  it('e mesmo assim o aeroporto ainda cobre quando a cidade está muda', () => {
    const r = readRainSignal({ ...args(POSTO_MUDO, SBFZ_CHUVA), siteCode: 'ALD' });
    expect(r.state).toBe('chovendo');
    expect(r.source).toBe('aeroporto');
  });

  it('sempre expõe as duas leituras, para o e-mail poder mostrar as duas', () => {
    const r = readRainSignal(args(POSTO_CHUVA, SBFZ_CHUVA));
    expect(r.fontes.posto.state).toBe('chovendo');
    expect(r.fontes.aeroporto.state).toBe('chovendo');
    expect(r.fontes.aeroporto.speci).toBe(true);
  });
});

describe('fetchMetar', () => {
  it('monta a URL de Fortaleza', async () => {
    let url = '';
    await fetchMetar({
      fetchImpl: async (u: string) => {
        url = u;
        return { ok: true, json: async () => [SBFZ_SECO] };
      },
    });
    expect(url).toBe('https://aviationweather.gov/api/data/metar?ids=SBFZ&format=json');
  });

  it('falha explicitamente no erro da NOAA', async () => {
    await expect(fetchMetar({ fetchImpl: async () => ({ ok: false, status: 503 }) })).rejects.toThrow('503');
  });
});
