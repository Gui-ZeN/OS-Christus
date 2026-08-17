import { normalizeKey } from './text.js';

/**
 * CHUVA OBSERVADA POR BAIRRO — rede de pluviômetros automáticos do CEMADEN
 * (Centro Nacional de Monitoramento e Alertas de Desastres Naturais).
 *
 * POR QUE ESTA FONTE:
 *  · o INMET **não tem estação em Fortaleza** (a operante mais próxima fica na serra);
 *  · a FUNCEME tem, mas a API exige token e a documentação está fora do ar;
 *  · o METAR do aeroporto (`metar.js`) é uma leitura só, na zona oeste;
 *  · o CEMADEN tem **12 postos dentro de Fortaleza**, por bairro, reportando a cada
 *    ~10 min. Dá chuva POR SEDE, não por cidade.
 *
 * ⚠️ **Eusébio não tem posto** (o CEMADEN cobre 136 dos 184 municípios do CE, e Eusébio
 * não é um deles). Decisão do dono: usar o posto vizinho e seguir.
 *
 * Módulo puro, exceto `fetchCemaden` (que recebe o `fetch` por parâmetro).
 */

export const CEMADEN_BASE = 'https://resources.cemaden.gov.br/graficos/interativo/getJson2.php';

/**
 * Postos param de transmitir e o painel **congela o último valor**: o "Panamericano"
 * marcava 0,39 mm com carimbo de dois dias antes. Sem corte por idade, ele reportaria
 * chuva para sempre. Acima disto o estado vira `desconhecido`.
 */
export const MAX_READING_AGE_MINUTES = 60;

/**
 * Relógio de estação deriva: vimos carimbo ~13 min à frente do UTC. Uma margem
 * pequena para o futuro evita descartar leitura boa por causa disso.
 */
export const MAX_CLOCK_DRIFT_MINUTES = 30;

/**
 * **UMA báscula basta.** O pluviômetro é de báscula com resolução de 0,2 mm — uma
 * concha que reporta ao encher. Este limiar é o menor evento que o aparelho sabe
 * medir: abaixo dele não existe leitura, então na prática é "qualquer chuva".
 *
 * Já foi 0,4 mm ("encheu duas vezes"), por um motivo real: em 96h secas o posto
 * João XXIII registrou uma báscula sozinha, e com o limite em qualquer-valor isso
 * viraria e-mail para um respingo que ninguém veria no telhado.
 *
 * **Decisão do dono, 17/08: avisar QUALQUER chuva.** O raciocínio dele vence o meu
 * porque ele conhece o custo dos dois erros, e eles não são simétricos: alerta a
 * mais custa um e-mail ignorado; alerta a menos custa uma goteira que ninguém foi
 * ver. Numa operação de manutenção predial, o segundo é mais caro.
 *
 * O que fica de pé do argumento antigo: se as pessoas pararem de abrir o e-mail, é
 * ESTE número que se ajusta — e a métrica para decidir isso é quantos alertas
 * viraram OS, não a impressão de quem recebe.
 */
export const MIN_RAIN_MM = 0.2;

/**
 * **Todas as sedes são em Fortaleza, menos Eusébio** (informado pelo dono). Então o
 * padrão é o sinal AGREGADO da cidade, e só Eusébio precisa de posto nomeado.
 *
 * Isso troca precisão por simplicidade de propósito: não há mapa de 20 sedes para
 * manter, e nenhuma sede fica cega. O custo está declarado em `readCityRain`.
 */
export const DEFAULT_CITY = 'FORTALEZA';

/**
 * Sedes que NÃO usam o agregado da cidade.
 *
 * @type {Record<string, { city: string, name: string }>}
 */
export const GAUGE_BY_SITE = {
  // Eusébio é outro município e não tem posto no CEMADEN; Edson Queiroz é o bairro
  // colado nele, ~8 km. Decisão do dono: usar o vizinho e seguir.
  EUS: { city: 'FORTALEZA', name: 'Edson Queiroz' },
};

/** `31/07/26 18:20` → Date. O carimbo é **UTC** (verificado em 2026-07-31). */
export function parseCemadenTimestamp(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  return new Date(Date.UTC(2000 + Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
}

/**
 * Acumulado do CEMADEN. `-` significa **zero**, não "sem dado": o posto João XXIII
 * trazia `acc1hr: '-'` junto de `acc24hr: 1.59` — ou seja, choveu no dia e não na
 * última hora.
 */
export function parseAccumulation(value) {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!text || text === '-') return 0;
  const parsed = Number(text.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Achata o registro cru do CEMADEN. */
export function normalizeStation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.idestacao ?? null,
    city: String(raw.cidade || '').trim(),
    name: String(raw.nomeestacao || '').trim(),
    // `Number(null)` é 0 e passa no isFinite: sem o descarte explícito, posto sem
    // valor viraria "0 mm = não está chovendo" em vez de "não sei".
    mm:
      raw.ultimovalor === null || raw.ultimovalor === undefined || raw.ultimovalor === ''
        ? null
        : Number.isFinite(Number(raw.ultimovalor))
          ? Number(raw.ultimovalor)
          : null,
    at: parseCemadenTimestamp(raw.datahoraUltimovalor),
    acc1h: parseAccumulation(raw.acc1hr),
    acc24h: parseAccumulation(raw.acc24hr),
  };
}

/** Idade da leitura em minutos. Negativo = carimbo no futuro (relógio derivado). */
export function readingAgeMinutes(station, now = new Date()) {
  if (!station?.at) return null;
  return Math.round((now.getTime() - station.at.getTime()) / 60000);
}

/**
 * Estado decidível de um posto: `chovendo` · `nao-chovendo` · `desconhecido`.
 *
 * "Chovendo" é leitura FRESCA com volume acima de zero. Leitura velha nunca vira
 * "não está chovendo" — vira `desconhecido`, porque afirmar ausência de chuva a partir
 * de um posto mudo é inventar.
 */
export function readStation(rawOrStation, now = new Date()) {
  const station = rawOrStation?.at !== undefined ? rawOrStation : normalizeStation(rawOrStation);
  // Forma UNICA de retorno em todos os ramos: quem consome nao precisa checar se o
  // campo existe, e o TypeScript nao vira uniao impossivel de estreitar.
  const vazio = { city: null, name: null, mm: null, acc1h: 0, acc24h: 0, ageMinutes: null, reason: null };
  if (!station) return { ...vazio, state: 'desconhecido', raining: false, reason: 'posto inexistente' };

  const ageMinutes = readingAgeMinutes(station, now);
  const base = {
    ...vazio,
    city: station.city,
    name: station.name,
    mm: station.mm,
    acc1h: station.acc1h,
    acc24h: station.acc24h,
    ageMinutes,
  };

  if (ageMinutes === null) return { ...base, state: 'desconhecido', raining: false, reason: 'leitura sem horário' };
  if (ageMinutes > MAX_READING_AGE_MINUTES) {
    return { ...base, state: 'desconhecido', raining: false, reason: `leitura de ${ageMinutes} min atrás` };
  }
  if (ageMinutes < -MAX_CLOCK_DRIFT_MINUTES) {
    return { ...base, state: 'desconhecido', raining: false, reason: 'carimbo no futuro' };
  }
  if (station.mm === null) return { ...base, state: 'desconhecido', raining: false, reason: 'sem valor' };

  // Duas básculas, na leitura OU na hora. O segundo caso pega a chuva fina e
  // constante — 0,2 mm por leitura, que nunca atinge o limite sozinha mas acumula:
  // é exatamente a que enche calha e faz goteira pingar.
  const raining = station.mm >= MIN_RAIN_MM || station.acc1h >= MIN_RAIN_MM;
  return { ...base, state: raining ? 'chovendo' : 'nao-chovendo', raining };
}

const sameText = (a, b) => normalizeKey(a) === normalizeKey(b);

/** Postos de uma cidade, já normalizados. */
export function stationsForCity(list, city) {
  return (Array.isArray(list) ? list : []).map(normalizeStation).filter(item => item && sameText(item.city, city));
}

/** Acha um posto por cidade + nome (sem depender de acento nem de caixa). */
export function findStation(list, { city, name }) {
  return stationsForCity(list, city).find(item => sameText(item.name, name)) || null;
}

/**
 * Chuva na CIDADE, agregando todos os postos vivos.
 *
 * Regra: **basta um posto vivo registrando chuva**. Fortaleza tem 12 postos e ~7 vivos;
 * chuva convectiva é local, então exigir maioria calaria justamente a pancada de bairro.
 *
 * ⚠️ **O custo, declarado**: chove no Antônio Bezerra (oeste) e a sede da Aldeota
 * (leste) também é avisada. Para goteira isso é aceitável — o aviso é "vai dar uma
 * olhada", não "a água está entrando aí". Se um dia incomodar, o caminho já existe:
 * nomear o posto da sede em `GAUGE_BY_SITE`, sem mexer em mais nada.
 *
 * Posto mudo não conta em nenhuma direção: se NENHUM estiver vivo, o estado é
 * `desconhecido` — nunca "não está chovendo".
 */
export function readCityRain(list, city = DEFAULT_CITY, now = new Date()) {
  const leituras = stationsForCity(list, city).map(station => readStation(station, now));
  const vivos = leituras.filter(item => item.state !== 'desconhecido');
  const chovendo = vivos.filter(item => item.raining);

  // Forma UNICA em todos os ramos — mesmo motivo do readStation.
  const base = {
    city,
    gaugesTotal: leituras.length,
    gaugesLive: vivos.length,
    rainingAt: chovendo.map(item => item.name),
    mm: null,
    acc1h: 0,
    name: null,
    reason: null,
  };

  if (vivos.length === 0) {
    return { ...base, state: 'desconhecido', raining: false, reason: `nenhum posto vivo em ${city}` };
  }
  if (chovendo.length === 0) return { ...base, state: 'nao-chovendo', raining: false };

  // O maior volume representa a intensidade do evento — e o acumulado da hora vem
  // junto porque é ele que diz se já deu tempo de encher alguma coisa.
  const forte = chovendo.reduce((maior, item) => (item.mm > maior.mm ? item : maior), chovendo[0]);
  return { ...base, state: 'chovendo', raining: true, mm: forte.mm, acc1h: forte.acc1h, name: forte.name };
}

/**
 * Estado da chuva para uma sede.
 *
 * Sede com posto nomeado usa o posto; **todas as demais usam o agregado da cidade**,
 * porque todas ficam em Fortaleza. Nenhuma sede fica sem sinal.
 */
export function readSiteRain(list, siteCode, { now = new Date(), mapping = GAUGE_BY_SITE, city = DEFAULT_CITY } = {}) {
  const gauge = mapping?.[String(siteCode || '').trim().toUpperCase()];
  // `fallbackFrom` sempre presente (null quando nao houve queda para o agregado):
  // forma unica de retorno, como nas demais leituras deste modulo.
  if (!gauge) {
    return { ...readCityRain(list, city, now), siteCode, gauge: `todos os postos de ${city}`, fallbackFrom: null };
  }
  const station = findStation(list, gauge);
  if (!station) {
    // Posto nomeado que sumiu da lista: cai no agregado em vez de deixar a sede cega.
    return {
      ...readCityRain(list, gauge.city || city, now),
      siteCode,
      gauge: `todos os postos de ${gauge.city || city}`,
      fallbackFrom: gauge.name,
    };
  }
  return { ...readStation(station, now), siteCode, gauge: `${gauge.name} (${gauge.city})`, fallbackFrom: null };
}

/** Frase pronta para o e-mail. */
export function describeStationRain(reading) {
  if (!reading) return 'sem leitura';
  if (reading.state === 'desconhecido') return `sem leitura confiável — ${reading.reason || 'motivo desconhecido'}`;
  if (!reading.raining) {
    // No agregado, dizer QUANTOS postos sustentam o "não está chovendo" evita que a
    // frase soe mais confiante do que o dado permite.
    return reading.gaugesLive ? `sem chuva em ${reading.gaugesLive} postos de ${reading.city}` : 'sem chuva no posto agora';
  }
  const acumulado = reading.acc1h > 0 ? `, ${reading.acc1h} mm na última hora` : '';
  const onde = reading.rainingAt?.length > 0 ? ` — ${reading.rainingAt.join(', ')}` : '';
  return `chuva agora (${reading.mm} mm na leitura${acumulado})${onde}`;
}

/**
 * @typedef {(url: string, init?: Record<string, unknown>) => Promise<{
 *   ok?: boolean; status?: number; json?: () => Promise<unknown>;
 * }>} FetchLike
 */

/**
 * Busca as leituras de um estado. `fetchImpl` entra por parâmetro para o teste não
 * tocar a rede.
 *
 * @param {{ uf?: string, fetchImpl?: FetchLike, timeoutMs?: number }} [options]
 */
export async function fetchCemaden({ uf = 'CE', fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch indisponível para consultar o CEMADEN.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${CEMADEN_BASE}?uf=${encodeURIComponent(uf)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response?.ok) throw new Error(`CEMADEN respondeu ${response?.status ?? '???'}`);
    const list = await response.json();
    return Array.isArray(list) ? list : [];
  } finally {
    clearTimeout(timer);
  }
}
