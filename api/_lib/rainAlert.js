import { readCityRain, describeStationRain } from './cemaden.js';
import { readObservation, describeRain } from './metar.js';
import { readRainSignal } from './rainWatch.js';

/**
 * A DECISÃO do aviso de chuva, sem I/O.
 *
 * Existe para que a rota do servidor e o ensaio local usem o MESMO cálculo e o MESMO
 * texto. Antes o script fazia tudo — inclusive mandar o e-mail — e era o único
 * workflow que enviava do próprio runner, o que exigia as credenciais do Gmail num
 * segundo lugar. Aqui ficou só o que é puro; quem busca fonte, grava estado e envia
 * é a rota.
 */

/** Sinal de chuva de uma sede, ou o agregado da cidade quando não há sede. */
export function avaliarChuva({ lista, metar, sede = null, now = new Date() }) {
  if (sede) return readRainSignal({ siteCode: sede, cemadenList: lista, metarObservation: metar, now });

  const cidade = readCityRain(lista, undefined, now);
  const aero = readObservation(metar, now);
  const fontes = {
    posto: { state: cidade.state, detalhe: describeStationRain(cidade) },
    aeroporto: { state: aero.state, detalhe: describeRain(aero), speci: aero.speci === true },
  };
  if (cidade.state === 'chovendo') {
    return { state: 'chovendo', raining: true, source: 'posto', detalhe: fontes.posto.detalhe, fontes };
  }
  if (aero.state === 'chovendo') {
    return {
      state: 'chovendo',
      raining: true,
      source: 'aeroporto',
      detalhe: `${fontes.aeroporto.detalhe} no aeroporto (a ~15 km)`,
      fontes,
    };
  }
  if (cidade.state === 'nao-chovendo' || aero.state === 'nao-chovendo') {
    return { state: 'nao-chovendo', raining: false, source: null, fontes };
  }
  return { state: 'desconhecido', raining: false, source: null, fontes };
}

/**
 * Leitura sintética para a simulação.
 *
 * Sem isto o e-mail de teste sai INCOERENTE: cabeçalho dizendo "começou a chover" e
 * corpo dizendo "sem chuva" nas duas fontes — um teste que não se parece com o real
 * não valida nada.
 */
export function sinalSimulado(sinalReal, simular) {
  if (simular !== 'chovendo') return { ...sinalReal, state: simular, simulado: true };
  return {
    state: 'chovendo',
    raining: true,
    source: 'posto',
    detalhe: 'chuva agora (0.6 mm na leitura, 0.8 mm na última hora) — Edson Queiroz',
    fontes: {
      posto: { state: 'chovendo', detalhe: 'chuva agora (0.6 mm na leitura, 0.8 mm na última hora)' },
      aeroporto: { state: 'nao-chovendo', detalhe: 'sem chuva no aeroporto', speci: false },
    },
    simulado: true,
  };
}

/** Corpo do e-mail. Mostra as DUAS fontes: se uma errar, quem lê enxerga a outra. */
export function montarEmail(sinal, quando, sede = null) {
  const onde = sede ? `na sede ${sede}` : 'em Fortaleza';
  const linhas = [
    // O aviso de simulação vem PRIMEIRO e no assunto: e-mail de teste que chega numa
    // caixa real sem se identificar é o jeito mais rápido de alguém sair correndo
    // atrás de goteira que não existe.
    ...(sinal.simulado
      ? ['*** TESTE — NÃO É CHUVA DE VERDADE ***', 'Disparo simulado para validar o caminho do aviso.', '']
      : []),
    `Começou a chover ${onde}.`,
    '',
    `Detectado às ${quando} por: ${sinal.source === 'aeroporto' ? 'estação do aeroporto' : 'pluviômetro'}`,
    `  ${sinal.detalhe || ''}`,
    '',
    'As duas fontes neste momento:',
    `  · pluviômetros: ${sinal.fontes.posto.detalhe}`,
    `  · aeroporto:    ${sinal.fontes.aeroporto.detalhe}${sinal.fontes.aeroporto.speci ? ' (relatório especial — o tempo acabou de mudar)' : ''}`,
    '',
    '— Pontos de goteira a verificar —',
    '  (a lista da Thaís ainda não existe no sistema; quando existir, entra aqui)',
    '',
    'Aviso automático do Serv3. Fontes: CEMADEN e aviationweather.gov (NOAA).',
  ];
  return {
    subject: `${sinal.simulado ? '[TESTE] ' : ''}Começou a chover ${onde} — verificar pontos de goteira`,
    text: linhas.join('\n'),
  };
}
