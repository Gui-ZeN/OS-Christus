import { DEFAULT_TOLERANCE_MINUTES } from './commitments.js';

/**
 * O LAÇO QUE FECHA A CONFIRMAÇÃO.
 *
 * O e-mail das 07h sozinho é aviso solto: quem não abriu de manhã nunca é
 * perguntado, e a visita morre em "sem confirmação" sem ninguém saber. Aqui ficam
 * as duas perguntas que fecham o circuito:
 *
 *  1. passou o horário e a sede não disse nada -> pergunta de novo, à SEDE;
 *  2. a sede disse que não veio -> avisa a manutenção, na hora.
 *
 * A (2) é o ÚNICO alerta individual e imediato do desenho. Todo o resto é
 * agrupado, porque alerta por evento viraria 80 e-mails por dia.
 *
 * ⚠️ Sem I/O e sem relógio próprio: `now` sempre entra por parâmetro, senão não
 * dá para testar "passou 30 minutos" sem esperar 30 minutos.
 */

const ABERTOS = new Set(['agendado', 'sem-confirmacao']);

export function toleranciaEmMinutos(commitment) {
  const valor = Number(commitment?.toleranceMinutes);
  return Number.isFinite(valor) && valor > 0 ? valor : DEFAULT_TOLERANCE_MINUTES;
}

/** Quando a pergunta "chegou?" passa a valer. */
export function momentoDaChecagem(commitment) {
  const inicio = commitment?.startAt instanceof Date ? commitment.startAt : new Date(commitment?.startAt || NaN);
  if (Number.isNaN(inicio.getTime())) return null;
  return new Date(inicio.getTime() + toleranciaEmMinutos(commitment) * 60_000);
}

/**
 * Está na hora de perguntar de novo?
 *
 * `checagemEnviadaEm` é o que impede o reenvio: a varredura roda de poucos em
 * poucos minutos, e sem a marca a sede receberia a mesma pergunta a cada volta —
 * exatamente o ruído que faz o aviso ser arquivado sem ler.
 */
export function precisaDeChecagem(commitment, now = new Date()) {
  if (!ABERTOS.has(String(commitment?.state || ''))) return false;
  if (commitment?.checagemEnviadaEm) return false;
  const momento = momentoDaChecagem(commitment);
  if (!momento) return false;
  return now.getTime() >= momento.getTime();
}

/**
 * A sede disse que não veio e a manutenção ainda não foi avisada?
 *
 * Só `faltou` dispara. `sem-confirmacao` NÃO é falta — a diferença é a que mais
 * importa neste sistema: falta entra no histórico do fornecedor, que é o dado
 * usado para decidir quem continua atendendo. Avisar "faltou" quando ninguém
 * respondeu acusaria fornecedor pelo silêncio da sede.
 */
export function precisaDeAlertaDeFalta(commitment) {
  return String(commitment?.state || '') === 'faltou' && !commitment?.faltaAvisadaEm;
}

/**
 * Quem recebe o alerta de falta: quem cobra.
 *
 * Vale escopo por sede OU por região — a gestora responde por uma operação
 * inteira, e prender o alerta a `siteIds` a deixaria de fora justamente de quem
 * vai ligar para o fornecedor.
 */
export function responsaveisPelaCobranca(users, { siteId, regiao }) {
  return (users || []).filter(u => {
    if (String(u?.status || 'Ativo') !== 'Ativo') return false;
    if (!String(u?.email || '').trim()) return false;
    const papel = String(u?.role || '');
    if (papel !== 'Gestor' && papel !== 'Admin') return false;
    return cobreASede(u, { siteId, regiao });
  });
}

/**
 * O escopo desta pessoa alcança esta sede?
 *
 * Serve para decidir sobre uma VISITA, que sabe a sede mas não carrega as OS. Sem
 * isto o filtro caía só em `siteIds`, e quem tem escopo por REGIÃO — que é o caso
 * da gestora que toca uma operação inteira — ficava de fora dos resumos. Foi
 * exatamente o que um teste pegou: a gestora não recebia o "sem confirmação".
 *
 * Para decidir sobre uma OS, continua valendo `canUserAccessTicket`; esta função é
 * o recorte mais grosso, para quando só existe a sede.
 */
export function cobreASede(user, { siteId, regiao }) {
  const sede = String(siteId || '').trim();
  const reg = String(regiao || '').trim();
  const sedes = Array.isArray(user?.siteIds) ? user.siteIds.map(v => String(v || '').trim()).filter(Boolean) : [];
  const regioes = Array.isArray(user?.regionIds) ? user.regionIds.map(v => String(v || '').trim()).filter(Boolean) : [];

  // Admin sem escopo nenhum responde por tudo — é o que o resto do sistema já faz.
  if (String(user?.role || '') === 'Admin' && sedes.length === 0 && regioes.length === 0) return true;
  return (sede !== '' && sedes.includes(sede)) || (reg !== '' && regioes.includes(reg));
}
