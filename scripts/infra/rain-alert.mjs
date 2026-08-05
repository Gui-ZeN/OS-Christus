import process from 'node:process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fetchCemaden, readCityRain, describeStationRain } from '../../api/_lib/cemaden.js';
import { fetchMetar, readObservation, describeRain } from '../../api/_lib/metar.js';
import { readRainSignal, detectRainTransition } from '../../api/_lib/rainWatch.js';
import { gmailSend } from '../../api/_lib/gmail.js';

/**
 * AVISO DE CHUVA — pronto para disparar quando chover.
 *
 * Lê as duas fontes (pluviômetros do CEMADEN + METAR do aeroporto), compara com o
 * último estado guardado e **só manda e-mail na virada** `nao-chovendo → chovendo`.
 *
 * ⚠️ Estamos na ESTAÇÃO SECA: Fortaleza chove de fevereiro a maio. Sem `--simular`,
 * este script vai corretamente não fazer nada por meses. Para testar o caminho
 * inteiro agora, use `--simular=chovendo`.
 *
 * Uso:
 *   npm run infra:rain:alert -- --dry-run                 (não envia, só mostra)
 *   npm run infra:rain:alert -- --simular=chovendo --dry-run
 *   npm run infra:rain:alert -- --simular=chovendo        (envia de verdade, via Gmail)
 *   npm run infra:rain:alert                              (real: só age se chover)
 *
 * Flags:
 *   --to=<email>     destinatário (ou a variável RAIN_ALERT_TO)
 *   --sede=<código>  sede a consultar (padrão: agregado de Fortaleza)
 *   --estado=<path>  arquivo de estado (padrão: .rain-watch-state.json)
 *   --forcar         envia mesmo sem virada (para ver o e-mail com chuva real)
 */

const arg = name => {
  const found = process.argv.find(item => item.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : null;
};
const flag = name => process.argv.includes(`--${name}`);

// Sem endereço fixo no código: este repositório é PÚBLICO, e e-mail de pessoa não
// precisa estar aqui. Vem de `RAIN_ALERT_TO` (secret) ou de `--to=`.
const DESTINO = arg('to') || process.env.RAIN_ALERT_TO || '';
const SEDE = arg('sede') || null;
const ESTADO_PATH = arg('estado') || '.rain-watch-state.json';
const SIMULAR = arg('simular');
const DRY_RUN = flag('dry-run');
const FORCAR = flag('forcar');

function lerEstado() {
  if (!existsSync(ESTADO_PATH)) return {};
  try {
    return JSON.parse(readFileSync(ESTADO_PATH, 'utf-8'));
  } catch {
    // Estado corrompido não pode derrubar o aviso: começa do zero, e o pior que
    // acontece é perder UMA transição.
    return {};
  }
}

function gravarEstado(estado) {
  writeFileSync(ESTADO_PATH, `${JSON.stringify(estado, null, 2)}\n`, 'utf-8');
}

/**
 * Leitura sintética para a simulação.
 *
 * Sem isto, o e-mail de teste sai INCOERENTE: cabeçalho dizendo "começou a chover" e
 * corpo dizendo "sem chuva" nas duas fontes — um teste que não se parece com o real
 * não valida nada.
 */
function sinalSimulado(sinalReal) {
  if (SIMULAR !== 'chovendo') return { ...sinalReal, state: SIMULAR };
  return {
    state: 'chovendo',
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
function montarEmail(sinal, quando) {
  const onde = SEDE ? `na sede ${SEDE}` : 'em Fortaleza';
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

async function main() {
  if (!DESTINO) {
    // Sai com SUCESSO de propósito: este script roda de 5 em 5 min no Actions, e
    // enquanto o secret não existir cada execução viraria uma falha — ~288 por dia,
    // com notificação. Ruído nesse volume treina todo mundo a ignorar o vermelho,
    // inclusive quando ele for de verdade. A mensagem fica no log.
    console.warn('Destinatário não configurado (RAIN_ALERT_TO ou --to=). Nada a fazer.');
    return;
  }

  const alvo = SIMULAR ? `SIMULAÇÃO (${SIMULAR})` : 'leitura real';
  console.log(`\nAviso de chuva — ${alvo}${DRY_RUN ? ' · DRY-RUN (não envia)' : ''}`);
  console.log(`destinatário: ${DESTINO}\n`);

  const [lista, metar] = await Promise.all([
    fetchCemaden({}).catch(erro => {
      console.warn(`CEMADEN indisponível: ${erro.message}`);
      return [];
    }),
    fetchMetar({}).catch(erro => {
      console.warn(`METAR indisponível: ${erro.message}`);
      return null;
    }),
  ]);

  const sinal = SEDE
    ? readRainSignal({ siteCode: SEDE, cemadenList: lista, metarObservation: metar })
    : {
        // Sem sede, o sinal é a cidade + o aeroporto — mesma regra do readRainSignal.
        ...(() => {
          const cidade = readCityRain(lista);
          const aero = readObservation(metar);
          const fontes = {
            posto: { state: cidade.state, detalhe: describeStationRain(cidade) },
            aeroporto: { state: aero.state, detalhe: describeRain(aero), speci: aero.speci === true },
          };
          if (cidade.state === 'chovendo') return { state: 'chovendo', source: 'posto', detalhe: fontes.posto.detalhe, fontes };
          if (aero.state === 'chovendo') return { state: 'chovendo', source: 'aeroporto', detalhe: `${fontes.aeroporto.detalhe} no aeroporto (a ~15 km)`, fontes };
          if (cidade.state === 'nao-chovendo' || aero.state === 'nao-chovendo') {
            return { state: 'nao-chovendo', source: null, fontes };
          }
          return { state: 'desconhecido', source: null, fontes };
        })(),
      };

  const sinalFinal = SIMULAR ? sinalSimulado(sinal) : sinal;
  const estadoAtual = sinalFinal.state;
  const chave = SEDE || 'FORTALEZA';
  const estado = lerEstado();
  const anterior = estado[chave]?.state || null;
  const transicao = detectRainTransition(anterior, estadoAtual);

  console.log(`pluviômetros : ${sinalFinal.fontes.posto.state.padEnd(13)} ${sinalFinal.fontes.posto.detalhe}`);
  console.log(`aeroporto    : ${sinalFinal.fontes.aeroporto.state.padEnd(13)} ${sinalFinal.fontes.aeroporto.detalhe}`);
  console.log(`\nestado anterior: ${anterior ?? '(primeira execução)'}`);
  console.log(`estado agora   : ${estadoAtual}`);
  console.log(`transição      : ${transicao}\n`);

  const deveEnviar = transicao === 'comecou' || FORCAR;
  if (!deveEnviar) {
    console.log('Nada a enviar. (Só a virada para "chovendo" dispara e-mail.)');
    if (!DRY_RUN) {
      estado[chave] = { state: estadoAtual, at: new Date().toISOString() };
      gravarEstado(estado);
      console.log(`Estado guardado em ${ESTADO_PATH}.`);
    }
    return;
  }

  const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' });
  const email = montarEmail(sinalFinal, quando);

  console.log('─'.repeat(72));
  console.log(`Para: ${DESTINO}`);
  console.log(`Assunto: ${email.subject}\n`);
  console.log(email.text);
  console.log('─'.repeat(72));

  if (DRY_RUN) {
    console.log('\nDRY-RUN: nada foi enviado.');
    return;
  }

  // Este projeto envia por Gmail.
  const faltando = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_FROM_EMAIL'].filter(
    nome => !process.env[nome]
  );
  if (faltando.length > 0) {
    console.error(
      `\nNÃO ENVIADO: faltam no ambiente — ${faltando.join(', ')}.\n` +
        'Elas existem na Vercel, não no .env.local. Para enviar daqui, exporte-as na\n' +
        'sessão do terminal — ou rode com --dry-run para ver o e-mail sem enviar.'
    );
    process.exitCode = 1;
    return;
  }

  // `ticketId` identifica a mensagem no Message-Id gerado; este aviso não pertence a
  // nenhuma OS, então usa um rótulo próprio em vez de fingir que é de um chamado.
  await gmailSend({
    toEmail: DESTINO,
    subject: email.subject,
    text: email.text,
    ticketId: SIMULAR ? 'aviso-chuva-teste' : 'aviso-chuva',
    references: [],
  });
  console.log('\nE-mail enviado.');

  estado[chave] = { state: estadoAtual, at: new Date().toISOString() };
  gravarEstado(estado);
  console.log(`Estado guardado em ${ESTADO_PATH}.`);
}

main().catch(erro => {
  console.error('Falhou:', erro?.message || erro);
  process.exitCode = 1;
});
