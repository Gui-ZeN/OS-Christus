import { readObservation, describeRain } from './metar.js';
import { readSiteRain, describeStationRain } from './cemaden.js';

/**
 * O SINAL DE CHUVA que o aviso usa — combina as duas fontes, porque nenhuma sozinha
 * responde "começou a chover" com precisão E rapidez.
 *
 * | fonte   | responde        | latência    | alcance                    |
 * |---------|-----------------|-------------|----------------------------|
 * | METAR   | **quando**      | ~1–5 min    | um ponto, aeroporto, ~15 km |
 * | CEMADEN | **onde/quanto** | ~15–60 min  | pluviômetro no bairro      |
 *
 * O METAR dispara cedo (SPECI sai quando a condição muda); o CEMADEN confirma no
 * bairro e diz o volume. Quem chegar primeiro vale — é o que faz o aviso sair perto
 * do "começou" sem perder a precisão de localização quando ela existe.
 */

/**
 * A VIRADA — o evento que dispara o aviso.
 *
 * Só `comecou` vira e-mail. Sair de `desconhecido` **não** conta: fonte que ficou muda
 * e voltou não é chuva nova, e avisar ali seria alarme falso a cada atraso de
 * publicação.
 */
export function detectRainTransition(previousState, currentState) {
  const before = previousState || 'desconhecido';
  const after = currentState || 'desconhecido';
  if (before === after) return 'sem-mudanca';
  if (after === 'chovendo' && before === 'nao-chovendo') return 'comecou';
  if (after === 'nao-chovendo' && before === 'chovendo') return 'parou';
  return 'sem-mudanca';
}

/**
 * Estado de chuva de uma sede, das duas fontes.
 *
 * Regra: **basta uma dizer que está chovendo.** Chuva é evento local — o pluviômetro
 * do bairro pode registrar sem o aeroporto ver, e vice-versa. Exigir concordância
 * perderia justamente a pancada isolada, que é quando a goteira pinga.
 *
 * "Não está chovendo" exige que **nenhuma** fonte confiável veja chuva; se as duas
 * estiverem mudas ou velhas, o estado é `desconhecido` — nunca ausência.
 */
export function readRainSignal({ siteCode, cemadenList, metarObservation, now = new Date(), mapping } = {}) {
  const posto = readSiteRain(cemadenList, siteCode, { now, ...(mapping ? { mapping } : {}) });
  const aeroporto = readObservation(metarObservation, now);

  const fontes = {
    posto: { state: posto.state, detalhe: describeStationRain(posto), gauge: posto.gauge || null },
    aeroporto: { state: aeroporto.state, detalhe: describeRain(aeroporto), speci: aeroporto.speci === true },
  };

  if (posto.state === 'chovendo') {
    return { state: 'chovendo', raining: true, source: 'posto', detalhe: fontes.posto.detalhe, fontes, siteCode };
  }
  if (aeroporto.state === 'chovendo') {
    return {
      state: 'chovendo',
      raining: true,
      source: 'aeroporto',
      // O alcance entra na frase de propósito: quem lê precisa saber que a chuva foi
      // vista a 15 km, e não no bairro da sede.
      detalhe: `${fontes.aeroporto.detalhe} no aeroporto (a ~15 km) — o posto do bairro ainda não registrou`,
      fontes,
      siteCode,
    };
  }
  if (posto.state === 'nao-chovendo' || aeroporto.state === 'nao-chovendo') {
    return { state: 'nao-chovendo', raining: false, source: posto.state === 'nao-chovendo' ? 'posto' : 'aeroporto', fontes, siteCode };
  }
  return { state: 'desconhecido', raining: false, source: null, reason: posto.reason || aeroporto.reason || 'sem leitura', fontes, siteCode };
}
