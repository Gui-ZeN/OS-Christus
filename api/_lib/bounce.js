import { firstEmail } from './email.js';
import { stripHtml } from './inboundBody.js';

/**
 * Detecta um bounce/NDR (a devolução do provedor: "Message blocked", "Address not
 * found", DSN) e extrai QUEM não recebeu + o motivo curto.
 *
 * Saiu do mail.js para poder ser testado: era a peça que decidia o texto do aviso na
 * OS e não tinha um único teste. Em produção, 261 bounces foram gravados sem UM
 * destinatário sequer — o aviso virava "e-mail bloqueado" sem dizer para quem, que é
 * a informação que faz alguém agir.
 */
export function detectBounce(message) {
  const fromRaw = String(message?.from || '');
  // `firstEmail` devolve null quando o From não tem endereço parseável — e o
  // remetente nulo (`<>`) é justamente o padrão de um bounce. Chamar `.toLowerCase()`
  // direto derrubava o processamento da mensagem inteira.
  const fromEmail = String(firstEmail(message?.from) || '').toLowerCase();
  const subject = String(message?.subject || '');

  const isDaemon =
    /(mailer-daemon|postmaster)@/i.test(fromEmail) ||
    /mail delivery (subsystem|system)/i.test(fromRaw);
  const subjectHint =
    /delivery status notification|undeliver|failure notice|returned mail|message blocked|delivery has failed|n[ãa]o foi entregue|mensagem rejeitada|address not found|endere[çc]o n[ãa]o encontrado/i.test(
      subject
    );
  if (!isDaemon && !subjectHint) return null;

  // O NDR do Gmail chega em HTML, com o endereço dentro de <a href="mailto:">. Sem
  // tirar as tags, TODOS os padrões abaixo falham — foi exatamente assim que os 261
  // bounces ficaram sem destinatário.
  const body = `${message?.text || ''}\n${stripHtml(message?.html || '')}`;

  // Um único NDR pode listar VÁRIOS destinatários (DSN com múltiplos
  // Final-Recipient); senão avisaríamos só 1 de N.
  const recipients = [
    ...new Set(
      [
        ...[...body.matchAll(/Final-Recipient:\s*rfc822;\s*([^\s<>]+@[^\s<>]+)/gi)].map(m => m[1]),
        ...[...body.matchAll(/(?:Your message to|Sua mensagem para)\s+\*?\s*([^\s*<>]+@[^\s*<>]+)/gi)].map(
          m => m[1]
        ),
        ...[
          ...body.matchAll(
            /(?:wasn'?t delivered to|was not delivered to|n[ãa]o foi entregue (?:a|para))\s+\*?\s*([^\s*<>]+@[^\s*<>]+)/gi
          ),
        ].map(m => m[1]),
        ...[
          ...body.matchAll(/([^\s<>]+@[^\s<>]+)\s+(?:has been blocked|was not delivered|foi bloque)/gi),
        ].map(m => m[1]),
      ]
        .map(e => String(e).toLowerCase().replace(/[.,;>]+$/, ''))
        .filter(Boolean)
    ),
  ];

  const reasonMatch =
    body.match(/Message rejected[^\n]*/i) ||
    body.match(/\b5\d\d[\s.-][^\n]{0,120}/) ||
    body.match(/(blocked|rejected|denied|not authorized|policy|spam)[^\n]{0,120}/i);
  const reason = reasonMatch
    ? reasonMatch[0].trim().replace(/\s+/g, ' ').slice(0, 200)
    : 'O provedor de destino rejeitou a mensagem.';

  return { recipients, reason };
}
