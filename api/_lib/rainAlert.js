import { readCityRain, describeStationRain } from './cemaden.js';
import { readObservation, describeRain } from './metar.js';
import { readRainSignal } from './rainWatch.js';
import { buildNoticeEmailTemplate } from './emailTemplates.js';
import { isTicketOpen } from './statusFlow.js';

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

/**
 * QUAIS OS ENTRAM NA LISTA DE GOTEIRA — puro, sem Firestore.
 *
 * A rota (`api/mail.js`) faz a única leitura: `where('waterIssue', '==', true')`,
 * igualdade simples, sem índice composto. O que sobra — abrir só as OS ainda em
 * andamento, restringir à sede do aviso quando há uma, decidir a ordem — é decisão,
 * não busca, e mora aqui pelo mesmo motivo que `destinatariosDoAviso` mora em
 * `avisoDeChuva.js`: testável com objetos soltos, sem precisar do emulador de pé.
 */
export function selecionarPontosDeGoteira(tickets, sede = null) {
  return tickets
    .filter(ticket => isTicketOpen(ticket.status))
    .filter(ticket => !sede || ticket.sede === sede)
    .map(ticket => ({ id: ticket.id, sede: ticket.sede || null, assunto: ticket.subject || '(sem assunto)' }))
    .sort((a, b) => (a.sede || '').localeCompare(b.sede || '', 'pt-BR') || a.id.localeCompare(b.id));
}

/**
 * As linhas da lista de goteira — usada no texto E no HTML, para as duas versões
 * dizerem exatamente a mesma coisa.
 *
 * ⚠️ AUSÊNCIA É DITA, NÃO OMITIDA. Uma lista vazia sem nada no lugar do placeholder
 * se leria como "a seção sumiu" — quem confere o e-mail não saberia se ninguém tem
 * goteira marcada ou se a busca falhou.
 *
 * ⚠️ A SEDE só aparece por item quando o aviso é da CIDADE inteira (`sede` do
 * chamador nulo). Quando o aviso já é de uma sede só, repetir o mesmo código em cada
 * linha seria ruído — quem lê já sabe onde está.
 */
function linhasDeGoteira(goteiras, sedeDoAviso) {
  if (!goteiras.length) return ['Nenhuma OS marcada com risco de goteira no momento.'];
  return goteiras.map(g => (sedeDoAviso ? `${g.id} · ${g.assunto}` : `${g.id} · ${g.sede || 'sede não informada'} · ${g.assunto}`));
}

/** As mesmas linhas, no formato {label, value} do `detailCards` do HTML. */
function linhasDeGoteiraParaCard(goteiras, sedeDoAviso) {
  if (!goteiras.length) {
    return [{ label: 'Situação', value: 'Nenhuma OS marcada com risco de goteira no momento.' }];
  }
  return goteiras.map(g => ({
    label: g.id,
    value: sedeDoAviso ? g.assunto : `${g.sede || 'sede não informada'} · ${g.assunto}`,
  }));
}

/** Corpo do e-mail. Mostra as DUAS fontes: se uma errar, quem lê enxerga a outra. */
export function montarEmail(sinal, quando, sede = null, goteiras = []) {
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
    ...linhasDeGoteira(goteiras, sede).map(linha => `  ${linha}`),
    '',
    'Aviso automático do Serv3. Fontes: CEMADEN e aviationweather.gov (NOAA).',
  ];
  // O texto continua sendo a versão de referência — é o que chega em cliente sem
  // HTML e o que o log guarda. O HTML diz a mesma coisa na moldura dos outros
  // e-mails; até hoje este era o único aviso que saía em texto puro.
  const html = buildNoticeEmailTemplate({
    eyebrow: 'Clima',
    title: `Começou a chover ${onde}`,
    subtitle: `Detectado às ${quando} por ${sinal.source === 'aeroporto' ? 'estação do aeroporto' : 'pluviômetro'}`,
    alerta: sinal.simulado
      ? { titulo: 'Teste — não é chuva de verdade', detalhe: 'Disparo simulado para validar o caminho do aviso.' }
      : null,
    // Sem corpo solto: a leitura que detectou já está na tabela abaixo, e repetir
    // a mesma frase duas vezes na mesma tela é o tipo de peso que se quis tirar.
    detailCards: [
      {
        title: 'As duas fontes neste momento',
        rows: [
          { label: 'Pluviômetros', value: sinal.fontes.posto.detalhe },
          {
            label: 'Aeroporto',
            value: `${sinal.fontes.aeroporto.detalhe}${sinal.fontes.aeroporto.speci ? ' (relatório especial — o tempo acabou de mudar)' : ''}`,
          },
        ],
      },
      {
        title: 'Pontos de goteira a verificar',
        rows: linhasDeGoteiraParaCard(goteiras, sede),
      },
    ],
    rodape: 'Aviso automático do Serv3. Fontes: CEMADEN e aviationweather.gov (NOAA).',
  }).html;

  return {
    subject: `${sinal.simulado ? '[TESTE] ' : ''}Começou a chover ${onde} — verificar pontos de goteira`,
    text: linhas.join('\n'),
    html,
  };
}

/**
 * A MESMA MENSAGEM, para Discord e Telegram.
 *
 * ⚠️ NÃO É UM TEXTO NOVO — é `email.subject` + `email.text` reaproveitados. Uma
 * segunda montagem divergiria do e-mail no dia em que só uma das duas mudasse, e é
 * a mesma regra que já valeu para não duplicar `destinatariosDoAviso`: uma decisão,
 * um lugar.
 *
 * ⚠️ O CORTE É DITO, NÃO CALADO. Discord aceita até 2000 caracteres por mensagem de
 * webhook; Telegram, 4096. Truncar em silêncio esconderia justamente o fim da lista
 * de goteira num dia de chuva grande — a nota diz que faltou e aponta para o
 * e-mail, que não tem esse limite.
 */
export function montarMensagemDeChat(email, limite = null) {
  const texto = `${email.subject}\n\n${email.text}`;
  if (!limite || texto.length <= limite) return texto;
  const nota = '\n\n[…] cortado por limite do canal — o e-mail tem a versão completa.';
  return `${texto.slice(0, limite - nota.length)}${nota}`;
}
