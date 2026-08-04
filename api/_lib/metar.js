/**
 * CHUVA OBSERVADA, RÁPIDO — METAR/SPECI do aeroporto Pinto Martins (SBFZ), via
 * `aviationweather.gov` (NOAA). Sem chave, sem token, domínio público.
 *
 * POR QUE ESTA FONTE EXISTE AO LADO DO CEMADEN: o pluviômetro do CEMADEN é preciso
 * por bairro, mas **lento** — 15 a 60 min entre a chuva e a publicação, e só registra
 * a partir de 0,2 mm (báscula). O METAR reporta o FENÔMENO, e o **SPECI sai quando a
 * condição MUDA** — inclusive quando começa a chover. Da observação até a API leva
 * menos de um minuto (medido: observação das 18h00Z disponível às 17h51Z).
 *
 * O preço: é **um ponto só**, a ~15 km do centro, na zona oeste. Chuva convectiva em
 * Fortaleza é local — pode chover na Aldeota e não no aeroporto.
 *
 * Divisão de trabalho: METAR diz **quando**, CEMADEN diz **onde e quanto**.
 *
 * Módulo puro, exceto `fetchMetar` (que recebe o `fetch` por parâmetro).
 */

export const FORTALEZA_ICAO = 'SBFZ';
export const METAR_API = 'https://aviationweather.gov/api/data/metar';

/** Acima disto, "não está chovendo" deixa de ser informação e vira ignorância. */
export const MAX_OBSERVATION_AGE_MINUTES = 90;

/** Códigos de precipitação do METAR (Anexo 3 da OACI). */
const PRECIPITATION = {
  RA: 'chuva',
  DZ: 'chuvisco',
  SHRA: 'pancada de chuva',
  TSRA: 'chuva com trovoada',
  GR: 'granizo',
  GS: 'granizo miúdo',
  SN: 'neve',
  PL: 'pelotas de gelo',
  UP: 'precipitação não identificada',
};

const INTENSITY = { '-': 'fraca', '': 'moderada', '+': 'forte' };

/**
 * Grupo de tempo presente: `[RE] [- + VC] [descritor…] [precipitação…]`
 *
 * Ancorado no TOKEN inteiro, e não solto no texto: `FEW025TCU` e `SCT006` não podem
 * virar precipitação por conterem letras parecidas. A precipitação é opcional porque
 * `VCSH` e `TS` existem sozinhos — mas aí não é chuva **na** estação.
 */
const WX_TOKEN = /^(RE)?([-+]|VC)?((?:MI|PR|BC|DR|BL|SH|TS|FZ)*)((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP)*)$/;

/**
 * Diz se está chovendo AGORA, na estação.
 *
 *  · `RE…` é tempo RECENTE — choveu e **parou**. Não conta.
 *  · `VC…` é *vicinity*, nas redondezas (~16 km) e **não** sobre a estação.
 *  · descritor sem precipitação (`TS`, `SH`) não é chuva na estação.
 */
export function parseWeatherCodes(value) {
  const text = String(value || '').toUpperCase().trim();
  const result = { raining: false, nearby: false, recent: false, intensity: null, phenomena: [], codes: [] };
  if (!text) return result;

  for (const token of text.split(/\s+/)) {
    const match = WX_TOKEN.exec(token);
    if (!match) continue;
    const [, recent, modifier, descriptor, precipitation] = match;
    if (!descriptor && !precipitation) continue;

    result.codes.push(token);

    if (recent) {
      result.recent = true;
      continue;
    }
    if (modifier === 'VC') {
      result.nearby = true;
      continue;
    }
    if (!precipitation) continue;

    const label =
      PRECIPITATION[`${descriptor}${precipitation}`] ||
      PRECIPITATION[precipitation] ||
      PRECIPITATION[precipitation.slice(0, 2)] ||
      'precipitação';

    result.raining = true;
    result.phenomena.push(label);
    const intensity = INTENSITY[modifier === '+' ? '+' : modifier === '-' ? '-' : ''];
    if (result.intensity !== 'forte') {
      result.intensity = result.intensity === 'moderada' && intensity === 'fraca' ? 'moderada' : intensity;
    }
  }

  return result;
}

/** Minutos entre a observação e agora. */
export function observationAgeMinutes(observation, now = new Date()) {
  const epoch = Number(observation?.obsTime);
  if (!Number.isFinite(epoch) || epoch <= 0) return null;
  return Math.round((now.getTime() - epoch * 1000) / 60000);
}

/** Normaliza num estado decidível: `chovendo` · `nao-chovendo` · `desconhecido`. */
export function readObservation(observation, now = new Date()) {
  if (!observation) {
    return { state: 'desconhecido', raining: false, reason: 'sem observação', ageMinutes: null };
  }

  const ageMinutes = observationAgeMinutes(observation, now);
  // `wxString` é o campo já extraído pela NOAA; o METAR cru é a rede de segurança
  // para quando o campo vier vazio mas o relatório trouxer o grupo.
  const doCampo = parseWeatherCodes(observation.wxString || '');
  const parsed = doCampo.codes.length > 0 ? doCampo : parseWeatherCodes(observation.rawOb || '');

  if (ageMinutes === null || ageMinutes > MAX_OBSERVATION_AGE_MINUTES) {
    return {
      state: 'desconhecido',
      raining: false,
      reason: ageMinutes === null ? 'observação sem horário' : `observação de ${ageMinutes} min atrás`,
      ageMinutes,
      icao: observation.icaoId || null,
      raw: observation.rawOb || null,
    };
  }

  return {
    state: parsed.raining ? 'chovendo' : 'nao-chovendo',
    raining: parsed.raining,
    nearby: parsed.nearby,
    recent: parsed.recent,
    intensity: parsed.intensity,
    phenomena: parsed.phenomena,
    codes: parsed.codes,
    ageMinutes,
    icao: observation.icaoId || null,
    // SPECI = relatório especial, emitido FORA do horário cheio porque a condição
    // mudou. É o sinal de que algo acabou de acontecer.
    speci: String(observation.metarType || '').toUpperCase() === 'SPECI',
    raw: observation.rawOb || null,
  };
}

/** Frase pronta para o e-mail. */
export function describeRain(reading) {
  if (!reading?.raining) return 'sem chuva no aeroporto';
  const intensity = reading.intensity ? ` ${reading.intensity}` : '';
  const what = reading.phenomena?.length > 0 ? reading.phenomena.join(' e ') : 'chuva';
  return `${what}${intensity}`.trim();
}

/** Busca a observação mais recente. `fetchImpl` entra por parâmetro para o teste não tocar a rede. */
export async function fetchMetar({ icao = FORTALEZA_ICAO, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch indisponível para consultar o METAR.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${METAR_API}?ids=${encodeURIComponent(icao)}&format=json`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response?.ok) throw new Error(`aviationweather respondeu ${response?.status ?? '???'}`);
    const list = await response.json();
    return Array.isArray(list) ? list[0] || null : null;
  } finally {
    clearTimeout(timer);
  }
}
