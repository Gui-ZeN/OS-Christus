import process from 'node:process';
import { fetchCemaden } from '../../api/_lib/cemaden.js';
import { fetchMetar } from '../../api/_lib/metar.js';
import { detectRainTransition } from '../../api/_lib/rainWatch.js';
import { avaliarChuva, montarEmail, sinalSimulado } from '../../api/_lib/rainAlert.js';

/**
 * AVISO DE CHUVA — ENSAIO LOCAL. Este script NÃO envia e-mail.
 *
 * Quem envia é o servidor, em `?route=rain-alert`, chamado pelo workflow do GitHub
 * com o `CRON_SECRET` — mesmo padrão dos outros três agendados. Aqui ficou só a
 * leitura, para você ver o que as fontes estão dizendo e como o e-mail sairia.
 *
 * Ter dois caminhos de envio seria pior que não ter ferramenta local: dois lugares
 * para as credenciais do Gmail, dois lugares para consertar quando o texto mudar, e
 * duas versões da mesma regra discordando com o tempo. Toda a decisão vive em
 * `api/_lib/rainAlert.js`, que os dois importam.
 *
 * Uso:
 *   npm run infra:rain:alert                        (o que as fontes dizem AGORA)
 *   npm run infra:rain:alert -- --simular=chovendo  (como o e-mail sairia)
 *   npm run infra:rain:alert -- --sede=EUS
 */

const arg = name => {
  const found = process.argv.find(item => item.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : null;
};

const SIMULAR = arg('simular');
const SEDE = arg('sede') || null;

async function main() {
  const alvo = SIMULAR ? `SIMULAÇÃO (${SIMULAR})` : 'leitura real';
  console.log(`\nAviso de chuva — ${alvo} · ENSAIO (este script nunca envia)\n`);

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

  const now = new Date();
  const real = avaliarChuva({ lista, metar, sede: SEDE, now });
  const sinal = SIMULAR ? sinalSimulado(real, SIMULAR) : real;

  console.log(`pluviômetros : ${sinal.fontes.posto.state.padEnd(13)} ${sinal.fontes.posto.detalhe}`);
  console.log(`aeroporto    : ${sinal.fontes.aeroporto.state.padEnd(13)} ${sinal.fontes.aeroporto.detalhe}`);
  console.log(`\nestado agora : ${sinal.state}`);

  // O estado real vive no Firestore (`config/rainWatch`) e é do servidor. Aqui a
  // simulação mostra as duas transições possíveis, para não dar a impressão de que
  // o ensaio sabe o que o servidor guardou.
  console.log(`transição se estava seco   : ${detectRainTransition('nao-chovendo', sinal.state)}`);
  console.log(`transição se já chovia     : ${detectRainTransition('chovendo', sinal.state)}\n`);

  if (sinal.state !== 'chovendo') {
    console.log('Não está chovendo — nenhum e-mail sairia agora.');
    return;
  }

  const email = montarEmail(sinal, now.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }), SEDE);
  console.log('--- o e-mail que o servidor mandaria ---\n');
  console.log(`Assunto: ${email.subject}\n`);
  console.log(email.text);
  // ⚠️ Este script não tem acesso ao Firestore — de propósito, para não duplicar
  // credencial. A seção "Pontos de goteira" acima sempre sai como "nenhuma OS
  // marcada" porque a lista real nunca foi consultada, não porque não haja nenhuma.
  console.log('⚠️  "Pontos de goteira" acima é sempre vazio aqui: este ensaio não lê o Firestore.');
  console.log('   A lista real só existe quando o servidor monta o e-mail de verdade.');
}

main().catch(erro => {
  console.error('Falhou:', erro?.message || erro);
  process.exitCode = 1;
});
