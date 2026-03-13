import type { EmailTemplateSettings } from '../services/settingsApi';

function esc(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readPathValue(source: Record<string, unknown>, path: string) {
  return String(path || '')
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((current, key) => {
      if (current && typeof current === 'object') {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, source);
}

export function renderTemplateString(template: string, variables: Record<string, unknown>) {
  return String(template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = readPathValue(variables, path);
    return value == null ? '' : String(value);
  });
}

function normalizeToken(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function getStageMeta(trigger: string) {
  const token = normalizeToken(trigger);
  if (token.includes('nova-os') || token.includes('nova os')) return { eyebrow: 'Recebimento', label: 'Nova solicitação', accent: '#9a6b33' };
  if (token.includes('triagem')) return { eyebrow: 'Andamento', label: 'Triagem em andamento', accent: '#8c6239' };
  if (token.includes('parecer')) return { eyebrow: 'Andamento', label: 'Parecer técnico', accent: '#6d5a95' };
  if (token.includes('orcamento') || token.includes('cotacao')) return { eyebrow: 'Comercial', label: 'Orçamentação', accent: '#c07a2f' };
  if (token.includes('diretoria-solucao') || token.includes('diretoria solucao')) return { eyebrow: 'Diretoria', label: 'Avaliação da solução', accent: '#6f4f1e' };
  if (token.includes('diretoria-aprovacao') || token.includes('diretoria aprovacao')) return { eyebrow: 'Diretoria', label: 'Aprovação da diretoria', accent: '#73421f' };
  if (token.includes('aprovacao')) return { eyebrow: 'Governança', label: 'Em aprovação', accent: '#8f5f2a' };
  if (token.includes('preliminar')) return { eyebrow: 'Planejamento', label: 'Ações preliminares', accent: '#5f6f8f' };
  if (token.includes('execucao')) return { eyebrow: 'Operação', label: 'Execução iniciada', accent: '#7c4f8f' };
  if (token.includes('validacao')) return { eyebrow: 'Validação', label: 'Confirmação do solicitante', accent: '#8f6a3c' };
  if (token.includes('financeiro-pagamento') || token.includes('financeiro pagamento')) return { eyebrow: 'Financeiro', label: 'Pagamento pendente', accent: '#8f5a2b' };
  if (token.includes('pagamento')) return { eyebrow: 'Financeiro', label: 'Aguardando pagamento', accent: '#8f5a2b' };
  if (token.includes('encerrada')) return { eyebrow: 'Conclusão', label: 'OS encerrada', accent: '#2e6b47' };
  if (token.includes('cancelada')) return { eyebrow: 'Atenção', label: 'OS cancelada', accent: '#8a2f2f' };
  if (token.includes('mensagem')) return { eyebrow: 'Comunicação', label: 'Nova mensagem registrada', accent: '#4e5f7f' };
  return { eyebrow: 'Atualização', label: 'Atualização da OS', accent: '#6f4f1e' };
}

function renderBody(text: string) {
  const blocks = String(text || '')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean);

  return blocks
    .map(block => `<p style="margin:0 0 14px;color:#544b41;font-size:14px;line-height:1.75;">${esc(block).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

export function getTemplateTriggerLabel(trigger: string) {
  return getStageMeta(trigger).label;
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
    macroService: 'Cobertas e fachadas',
    service: 'Reparo estrutural de coberta',
  },
  tracking: {
    url: 'https://os-christus.vercel.app/?tracking=trk_demo_0051',
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
  const stage = getStageMeta(template.trigger);
  const subject = renderTemplateString(template.subject, variables);
  const body = renderTemplateString(template.body, variables);
  const ticket = (variables.ticket || {}) as Record<string, unknown>;
  const guarantee = (variables.guarantee || {}) as Record<string, unknown>;

  const details = [
    { label: 'Ticket', value: String(ticket.id || '-') },
    { label: 'Status', value: String(ticket.status || '-') },
    { label: 'Região', value: String(ticket.region || '-') },
    { label: 'Sede', value: String(ticket.sede || '-') },
    { label: 'Setor', value: String(ticket.sector || '-') },
    { label: 'Serviço', value: String(ticket.service || ticket.macroService || '-') },
  ].filter(item => item.value && item.value !== '-');

  const guaranteeSummary = String(guarantee.summary || '').trim();

  return `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:20px;background:#efe8de;font-family:Georgia,'Times New Roman',serif;color:#2d241d;">
    <div style="max-width:680px;margin:0 auto;border:1px solid #d7cbb7;background:#fffdf9;box-shadow:0 18px 42px rgba(34,27,21,0.08);">
      <div style="padding:22px 28px;background:#1f1a15;color:#f8f2e9;">
        <div style="font-size:11px;letter-spacing:2.4px;text-transform:uppercase;opacity:0.72;">OS Christus</div>
        <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div>
            <div style="display:inline-block;padding:5px 10px;border:1px solid rgba(255,255,255,0.16);border-radius:999px;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;">${esc(stage.eyebrow)}</div>
            <div style="margin-top:12px;font-size:28px;line-height:1.2;">${esc(stage.label)}</div>
          </div>
          <div style="padding:10px 14px;border:1px solid rgba(255,255,255,0.16);border-radius:16px;text-align:right;min-width:130px;">
            <div style="font-size:10px;letter-spacing:1.6px;text-transform:uppercase;opacity:0.72;">Ticket</div>
            <div style="margin-top:6px;font-size:18px;font-weight:bold;">${esc(ticket.id || '-')}</div>
          </div>
        </div>
      </div>
      <div style="padding:28px;">
        <div style="border-left:4px solid ${esc(stage.accent)};background:#f7f1e7;padding:16px 18px;margin-bottom:24px;">
          <div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#7d6b56;">${esc(stage.label)}</div>
          <div style="margin-top:8px;font-size:16px;line-height:1.65;color:#3d332b;">${esc(subject || 'Sem assunto definido')}</div>
        </div>

        <div style="margin-bottom:18px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#8a7a67;">Resumo do chamado</div>
        <div style="padding:16px 18px;background:#fbf8f2;border:1px solid #e5dac8;border-radius:18px;margin-bottom:16px;">
          <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#8a7a67;">Assunto</div>
          <div style="margin-top:8px;font-size:20px;line-height:1.4;color:#2d241d;">${esc(String(ticket.subject || '-'))}</div>
        </div>

        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:22px;">
          <tr>
            ${details
              .slice(0, 4)
              .map(
                item => `
              <td style="width:25%;padding:0 6px 12px 0;vertical-align:top;">
                <div style="min-height:84px;padding:14px;background:#fbf8f2;border:1px solid #e5dac8;border-radius:16px;">
                  <div style="font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#8a7a67;">${esc(item.label)}</div>
                  <div style="margin-top:8px;font-size:15px;line-height:1.5;color:#332920;">${esc(item.value)}</div>
                </div>
              </td>`
              )
              .join('')}
          </tr>
        </table>

        ${
          details.length > 4 || guaranteeSummary
            ? `<div style="padding:16px 18px;background:#fbf8f2;border:1px solid #e5dac8;border-radius:18px;margin-bottom:22px;">
                ${details
                  .slice(4)
                  .map(
                    item => `<div style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#544b41;"><strong style="color:#2d241d;">${esc(item.label)}:</strong> ${esc(item.value)}</div>`
                  )
                  .join('')}
                ${guaranteeSummary ? `<div style="margin:0;font-size:14px;line-height:1.7;color:#544b41;"><strong style="color:#2d241d;">Garantia:</strong> ${esc(guaranteeSummary)}</div>` : ''}
              </div>`
            : ''
        }

        <div style="margin-bottom:18px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#8a7a67;">Mensagem</div>
        <div style="padding:18px;border:1px solid #e5dac8;border-radius:18px;background:#ffffff;">
          ${renderBody(body || 'Sem corpo definido.')}
        </div>

        <div style="margin-top:26px;">
          <a href="${esc(String((variables.tracking as Record<string, unknown>)?.url || '#'))}" style="display:inline-block;background:#241c15;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:999px;font-size:14px;font-weight:bold;letter-spacing:0.2px;">
            Abrir acompanhamento
          </a>
        </div>
      </div>
      <div style="padding:16px 28px;border-top:1px solid #e9dfd0;background:#faf6ef;color:#7d6b56;font-size:12px;line-height:1.7;">
        Prévia visual do e-mail institucional enviado pelo OS Christus.
      </div>
    </div>
  </body>
</html>`;
}
