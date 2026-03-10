function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function getStageMeta(trigger, status) {
  const token = normalizeToken(trigger || status);

  if (token.includes('nova-os') || token.includes('nova os')) {
    return { eyebrow: 'Recebimento', label: 'Nova solicitação', accent: '#9a6b33' };
  }
  if (token.includes('triagem')) {
    return { eyebrow: 'Andamento', label: 'Triagem em andamento', accent: '#8c6239' };
  }
  if (token.includes('parecer')) {
    return { eyebrow: 'Andamento', label: 'Parecer técnico', accent: '#6d5a95' };
  }
  if (token.includes('orcamento') || token.includes('cotacao')) {
    return { eyebrow: 'Comercial', label: 'Orçamentação', accent: '#c07a2f' };
  }
  if (token.includes('aprovacao')) {
    return { eyebrow: 'Governança', label: 'Em aprovação', accent: '#8f5f2a' };
  }
  if (token.includes('preliminar')) {
    return { eyebrow: 'Planejamento', label: 'Ações preliminares', accent: '#5f6f8f' };
  }
  if (token.includes('execucao') || token.includes('andamento')) {
    return { eyebrow: 'Operação', label: 'Execução iniciada', accent: '#7c4f8f' };
  }
  if (token.includes('validacao')) {
    return { eyebrow: 'Validação', label: 'Confirmação do solicitante', accent: '#8f6a3c' };
  }
  if (token.includes('pagamento')) {
    return { eyebrow: 'Financeiro', label: 'Aguardando pagamento', accent: '#8f5a2b' };
  }
  if (token.includes('encerrada')) {
    return { eyebrow: 'Conclusão', label: 'OS encerrada', accent: '#2e6b47' };
  }
  if (token.includes('cancelada')) {
    return { eyebrow: 'Atenção', label: 'OS cancelada', accent: '#8a2f2f' };
  }
  if (token.includes('mensagem')) {
    return { eyebrow: 'Comunicação', label: 'Nova mensagem registrada', accent: '#4e5f7f' };
  }

  return { eyebrow: 'Atualização', label: 'Atualização da OS', accent: '#6f4f1e' };
}

function renderBodyText(text) {
  const blocks = String(text || '')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean);

  return blocks
    .map(block => {
      const lines = block
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      const isList = lines.length > 1 && lines.every(line => line.startsWith('- ') || line.startsWith('• '));

      if (isList) {
        const items = lines
          .map(line => line.replace(/^[-•]\s*/, '').trim())
          .filter(Boolean)
          .map(item => `<li style="margin:0 0 8px;">${esc(item)}</li>`)
          .join('');
        return `<ul style="margin:0 0 18px 18px;padding:0;color:#544b41;font-size:14px;line-height:1.7;">${items}</ul>`;
      }

      return `<p style="margin:0 0 16px;color:#544b41;font-size:14px;line-height:1.8;">${esc(lines.join(' '))}</p>`;
    })
    .join('');
}

export function buildTicketEmailTemplate({
  trigger,
  title,
  intro,
  ticketId,
  subject,
  status,
  region,
  site,
  sector,
  service,
  guaranteeSummary,
  ctaUrl,
  ctaLabel = 'Acompanhar OS',
  bodyText,
}) {
  const stage = getStageMeta(trigger, status);
  const messageParts = [
    intro || '',
    bodyText || '',
    status ? `Status atual: ${status}` : '',
  ].filter(Boolean);
  const messageHtml = renderBodyText(messageParts.join('\n\n'));
  const fullLinkLabel = ctaUrl ? esc(ctaUrl) : '';

  const html = `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px 0;background:#efe8de;color:#2d241d;font-family:Georgia,'Times New Roman',serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#efe8de;">
      <tr>
        <td align="center">
          <table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;background:#fffdf9;border:1px solid #d7cbb7;box-shadow:0 18px 42px rgba(34,27,21,0.08);">
            <tr>
              <td style="padding:24px 28px;background:#1f1a15;color:#f8f2e9;">
                <div style="font-size:11px;letter-spacing:2.4px;text-transform:uppercase;opacity:0.72;">OS Christus</div>
                <div style="margin-top:18px;display:table;width:100%;">
                  <div style="display:table-cell;vertical-align:top;padding-right:28px;">
                    <div style="display:inline-block;padding:5px 10px;border:1px solid rgba(255,255,255,0.16);border-radius:999px;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;">${esc(stage.eyebrow)}</div>
                    <div style="margin-top:14px;font-size:28px;line-height:1.22;letter-spacing:-0.2px;">${esc(title || stage.label)}</div>
                  </div>
                  <div style="display:table-cell;vertical-align:top;width:168px;">
                    <div style="padding:14px 18px;border:1px solid rgba(255,255,255,0.16);border-radius:20px;text-align:right;min-width:148px;background:rgba(255,255,255,0.02);">
                    <div style="font-size:10px;letter-spacing:1.6px;text-transform:uppercase;opacity:0.72;">Ticket</div>
                    <div style="margin-top:6px;font-size:22px;font-weight:bold;">${esc(ticketId || '-')}</div>
                  </div>
                </div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="margin-bottom:16px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#8a7a67;">Mensagem</div>
                <div style="padding:20px;border:1px solid #e5dac8;border-radius:18px;background:#ffffff;">
                  ${messageHtml || `<p style="margin:0;color:#544b41;font-size:14px;line-height:1.8;">Atualização registrada na OS.</p>`}
                </div>

                ${
                  ctaUrl
                    ? `<div style="margin-top:26px;text-align:left;">
                        <a href="${esc(ctaUrl)}" style="display:inline-block;background:#241c15;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:999px;font-size:14px;font-weight:bold;letter-spacing:0.2px;">
                          ${esc(ctaLabel)}
                        </a>
                        <div style="margin-top:12px;color:#6f6256;font-size:12px;line-height:1.7;">
                          Link completo: <a href="${esc(ctaUrl)}" style="color:#855922;">${fullLinkLabel}</a>
                        </div>
                      </div>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid #e9dfd0;background:#faf6ef;color:#7d6b56;font-size:12px;line-height:1.7;">
                Este é um comunicado automático do sistema OS Christus.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    title || stage.label,
    intro || '',
    '',
    `Ticket: ${ticketId || '-'}`,
    `Status: ${status || '-'}`,
    bodyText ? `\n${bodyText}` : '',
    '',
    ctaUrl ? `Link completo: ${ctaUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}
