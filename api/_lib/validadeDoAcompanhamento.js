/**
 * ATÉ QUANDO O LINK PÚBLICO DE ACOMPANHAMENTO VALE.
 *
 * ⚠️ ELE NÃO EXPIRAVA (auditoria de segurança, 14/10/2026). O link `?tracking=` é a
 * única credencial da página pública e não vale uma vez só: um e-mail encaminhado
 * dava acesso à OS para sempre — inclusive às ações do solicitante.
 *
 * Agora vale enquanto a OS está aberta e por mais 30 dias depois de Encerrada ou
 * Cancelada (decisão do dono). Vale também para os links já enviados: a regra olha a
 * OS, não o link.
 *
 * O token continua em texto no banco de propósito: os e-mails de cada etapa e a tela
 * remontam o link a partir dele, e guardar só o hash pediria um segredo novo para
 * proteger contra quem lê o banco — que já vê a OS inteira.
 */

import { toDateOrNull } from './dates.js';
import { isTicketOpen } from './statusFlow.js';

export const DIAS_DEPOIS_DE_FECHAR = 30;

/**
 * @returns {boolean} true quando o link não vale mais.
 */
export function acompanhamentoExpirado(ticket, agora = new Date()) {
  if (isTicketOpen(ticket?.status)) return false;
  // OS antiga pode ter fechado antes de `closedAt` existir: a entrada na etapa final
  // e a última alteração são a melhor data que sobra. Sem data nenhuma, FECHADO —
  // link eterno é justamente o defeito.
  const fechouEm =
    toDateOrNull(ticket?.closedAt) || toDateOrNull(ticket?.stageEnteredAt) || toDateOrNull(ticket?.updatedAt);
  if (!fechouEm) return true;
  return agora.getTime() > fechouEm.getTime() + DIAS_DEPOIS_DE_FECHAR * 86_400_000;
}

export const MENSAGEM_DE_LINK_EXPIRADO =
  'Este link de acompanhamento expirou: a OS foi encerrada há mais de 30 dias. Para falar sobre ela, responda o e-mail da OS.';
