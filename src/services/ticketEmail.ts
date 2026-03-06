import { Ticket } from '../types';
import { getAuthenticatedActorHeaders } from './actorHeaders';

function requesterEmailFallback(requester: string): string | null {
  const key = requester.toLowerCase();
  const map: Record<string, string> = {
    'recepção': 'recepcao@empresa.com',
    'diretoria': 'diretoria@empresa.com',
    'rh': 'rh@empresa.com',
    'ti': 'ti@empresa.com',
    'limpeza': 'limpeza@empresa.com',
    'facilities': 'facilities@empresa.com',
    'engenharia predial': 'engenharia@empresa.com',
  };
  return map[key] || null;
}

function resolveTicketEmail(ticket: Ticket): string | null {
  if (ticket.requesterEmail?.trim()) return ticket.requesterEmail.trim();
  return requesterEmailFallback(ticket.requester);
}

async function postEmail(payload: Record<string, unknown>) {
  try {
    const headers = await getAuthenticatedActorHeaders();
    await fetch('/api/mail?route=send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    });
  } catch {
    // Não interrompe o fluxo da UI se o e-mail falhar.
  }
}

export async function notifyTicketCreated(ticket: Ticket) {
  const toEmail = resolveTicketEmail(ticket);
  if (!toEmail) return;

  const link = `${window.location.origin}/?tracking=${encodeURIComponent(ticket.trackingToken)}`;
  await postEmail({
    ticketId: ticket.id,
    trackingToken: ticket.trackingToken,
    toEmail,
    subject: `OS ${ticket.id} registrada com sucesso`,
    text: [
      `Olá, sua solicitação foi registrada.`,
      `Ticket: ${ticket.id}`,
      `Assunto: ${ticket.subject}`,
      `Status: ${ticket.status}`,
      `Acompanhe pelo link: ${link}`,
    ].join('\n'),
    templateData: {
      title: `OS ${ticket.id} registrada`,
      intro: 'Recebemos sua solicitação e ela já está em análise pela equipe.',
      ticketSubject: ticket.subject,
      status: ticket.status,
      ctaUrl: link,
      ctaLabel: 'Acompanhar OS',
    },
  });
}

export async function notifyTicketStatusChange(ticket: Ticket, previousStatus: string) {
  const toEmail = resolveTicketEmail(ticket);
  if (!toEmail) return;
  if (previousStatus === ticket.status) return;

  const link = `${window.location.origin}/?tracking=${encodeURIComponent(ticket.trackingToken)}`;
  await postEmail({
    ticketId: ticket.id,
    trackingToken: ticket.trackingToken,
    toEmail,
    subject: `Atualização da OS ${ticket.id}`,
    text: [
      `Sua OS foi atualizada.`,
      `Ticket: ${ticket.id}`,
      `Assunto: ${ticket.subject}`,
      `De: ${previousStatus}`,
      `Para: ${ticket.status}`,
      `Acompanhe pelo link: ${link}`,
    ].join('\n'),
    templateData: {
      title: `Atualização da OS ${ticket.id}`,
      intro: `Status alterado de "${previousStatus}" para "${ticket.status}".`,
      ticketSubject: ticket.subject,
      status: ticket.status,
      ctaUrl: link,
      ctaLabel: 'Ver atualização',
    },
  });
}

export async function notifyTicketPublicReply(ticket: Ticket, sender: string, message: string) {
  const toEmail = resolveTicketEmail(ticket);
  if (!toEmail || !message.trim()) return;

  await postEmail({
    ticketId: ticket.id,
    trackingToken: ticket.trackingToken,
    toEmail,
    subject: `Nova mensagem na OS ${ticket.id}`,
    text: `${sender} enviou uma atualização:\n\n${message.trim()}`,
    templateData: {
      title: `Nova mensagem na OS ${ticket.id}`,
      intro: `${sender} enviou uma nova mensagem no ticket.`,
      ticketSubject: ticket.subject,
      status: ticket.status,
      bodyText: message.trim(),
    },
  });
}
