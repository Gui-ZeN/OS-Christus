/**
 * QUEM PODE FALAR NUMA OS POR E-MAIL — citando o número dela no assunto.
 *
 * ⚠️ O ASSUNTO NÃO É CREDENCIAL. Até 14/10/2026 bastava escrever "OS-0331" no assunto
 * para a mensagem e os anexos entrarem na conversa daquela OS, e o CC do e-mail
 * SUBSTITUIA o da conversa — que os envios seguintes usam. Os números são
 * sequenciais e a caixa `os@` está no repositório público: qualquer pessoa entrava em
 * qualquer OS e passava a receber as atualizações dela (auditoria de segurança).
 *
 * Agora quem cita uma OS precisa já fazer parte dela. Quem não faz vai para a fila de
 * e-mail solto (`inboundDropped`, motivo `remetente-desconhecido`), onde alguém da
 * equipe confere e vincula se for legítimo — um fornecedor novo, por exemplo.
 *
 * Só o caminho pelo NÚMERO passa por aqui. Os outros vínculos (References/In-Reply-To
 * com Message-ID nosso, thread do Gmail, remetente+assunto do solicitante) já exigem
 * algo que um estranho não tem.
 *
 * Limite conhecido: `From` é falsificável. Contra quem forja o remetente do
 * solicitante, quem segura é o SPF/DKIM/DMARC na entrega do Gmail, não este arquivo.
 */

import { firstEmail, parseEmailList } from './email.js';

/** Domínios da casa: qualquer endereço deles pode falar em qualquer OS. */
export const DOMINIOS_INTERNOS = ['christus.com.br'];

function lista(valor) {
  if (Array.isArray(valor)) return valor.flatMap(item => parseEmailList(item));
  return parseEmailList(valor || '');
}

/**
 * @param {object} p
 * @param {string|null} p.fromEmail  remetente já normalizado (`firstEmail`)
 * @param {object|null} p.ticket     doc da OS citada
 * @param {object[]} [p.threads]      docs de `emailThreads` com `ticketId` desta OS (uma OS
 *                                   pode ter mais de uma conversa)
 * @param {string[]} [p.emailsDaEquipe] e-mails dos usuários ativos do Serv3
 */
export function remetenteReconhecido({ fromEmail, ticket, threads = [], emailsDaEquipe = [] }) {
  const email = firstEmail(fromEmail);
  if (!email) return false;

  const dominio = email.split('@')[1] || '';
  if (DOMINIOS_INTERNOS.includes(dominio)) return true;
  if (emailsDaEquipe.some(item => firstEmail(item) === email)) return true;
  if (!ticket) return false;

  if (remetenteDonoDaOs({ fromEmail: email, ticket })) return true;
  // `participants` inclui quem a equipe aprovou ao vincular uma mensagem da fila
  // (`registrarThreadDaFila`): a decisão de quem triou vale para as próximas.
  const dasConversas = new Set(
    threads.flatMap(thread => [...lista(thread?.participants), ...lista(thread?.ccEmail)])
  );
  return dasConversas.has(email);
}

/**
 * Quem pode TROCAR a cópia da conversa — tirar gente, não só pôr.
 *
 * ⚠️ É MAIS ESTREITO QUE `remetenteReconhecido` DE PROPÓSITO (revisão de segurança,
 * 14/10/2026). "Reconhecido" inclui qualquer @christus.com.br e qualquer usuário
 * ativo: um funcionário do Colégio respondendo numa OS da Universidade trocaria a
 * cópia inteira, e as atualizações daquela OS passariam a ir para outro território —
 * por cima do escopo que o RBAC aplica em todo o resto. Quem não é dono só acrescenta.
 */
export function remetenteDonoDaOs({ fromEmail, ticket }) {
  const email = firstEmail(fromEmail);
  if (!email || !ticket) return false;
  const donos = new Set([
    ...lista(ticket.requesterEmail),
    ...lista(ticket.requesterCcEmails),
    ...lista(ticket.ccEmail),
    ...lista(ticket.directorEmails),
  ]);
  return donos.has(email);
}
