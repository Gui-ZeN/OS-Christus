import type { EmailTemplateSettings } from '../services/settingsApi';
// A prévia desenhava o e-mail por conta própria — e desenhava OUTRO e-mail. Tinha
// bloco "Resumo do chamado", quatro cartões de detalhe e uma tarja colorida que o
// envio real não tem. Quem ajustava um modelo aqui aprovava uma coisa e o
// destinatário recebia outra. Agora a prévia só traduz o modelo em parâmetros; quem
// desenha é o mesmo módulo do envio.
import {
  buildTicketEmailTemplate,
  getStageMeta,
  renderTemplateString,
} from '../../api/_lib/emailTemplates.js';

/**
 * A substituição vem do MESMO módulo que o envio usa. Ela morava aqui e em
 * `api/mail.js`, idênticas — e duas cópias idênticas são só uma divergência que
 * ainda não aconteceu. Reexportada porque a tela de Configurações a consome.
 */
export { renderTemplateString };

export function getTemplateTriggerLabel(trigger: string) {
  return getStageMeta(trigger, '').label;
}

export const SAMPLE_EMAIL_VARIABLES: Record<string, unknown> = {
  requester: {
    name: 'Solicitante',
    email: 'solicitante@christus.com.br',
  },
  ticket: {
    id: 'OS-0051',
    subject: 'Recuperação da coberta do bloco administrativo',
    status: 'Em aprovação',
    region: 'Região Aldeota',
    sede: 'SP',
    sector: 'Infraestrutura',
    location: 'Bloco A, sala 12',
    macroService: 'Cobertas e fachadas',
    service: 'Reparo estrutural de coberta',
  },
  tracking: {
    url: 'https://serv3.vercel.app/?tracking=trk_demo_0051',
  },
  guarantee: {
    summary: '12 meses - até 06/03/2027',
  },
  message: {
    sender: 'Equipe de Infraestrutura',
    body: 'O orçamento foi consolidado e a documentação seguiu para aprovação.',
  },
};

export function buildEmailPreviewHtml(template: EmailTemplateSettings, variables = SAMPLE_EMAIL_VARIABLES) {
  const ticket = (variables.ticket || {}) as Record<string, unknown>;
  const guarantee = (variables.guarantee || {}) as Record<string, unknown>;
  const tracking = (variables.tracking || {}) as Record<string, unknown>;

  const rows = [
    { label: 'Assunto', value: String(ticket.subject || '') },
    { label: 'Região', value: String(ticket.region || '') },
    { label: 'Sede', value: String(ticket.sede || '') },
    { label: 'Setor', value: String(ticket.sector || '') },
    { label: 'Serviço', value: String(ticket.service || ticket.macroService || '') },
    { label: 'Garantia', value: String(guarantee.summary || '') },
  ].filter(row => row.value);

  return buildTicketEmailTemplate({
    trigger: template.trigger,
    title: renderTemplateString(template.subject, variables) || 'Sem assunto definido',
    ticketId: String(ticket.id || ''),
    status: String(ticket.status || ''),
    bodyText: renderTemplateString(template.body, variables) || 'Sem corpo definido.',
    detailCards: rows.length > 0 ? [{ title: 'Chamado', rows }] : [],
    ctaUrl: String(tracking.url || ''),
    ctaLabel: 'Abrir acompanhamento',
  }).html;
}
