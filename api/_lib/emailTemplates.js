function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('encerr')) return '#166534';
  if (s.includes('pagamento')) return '#92400e';
  if (s.includes('cancel')) return '#991b1b';
  return '#6f4f1e';
}

export function buildTicketEmailTemplate({
  title,
  intro,
  ticketId,
  subject,
  status,
  ctaUrl,
  ctaLabel = 'Acompanhar OS',
  bodyText,
}) {
  const color = statusColor(status);
  const html = `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f4efe7;color:#2f2a24;font-family:Georgia,'Times New Roman',serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe7;padding:24px 0;">
      <tr>
        <td align="center">
          <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #d7cbb7;">
            <tr>
              <td style="background:#1f1a15;padding:18px 24px;color:#f8f4ed;">
                <div style="font-size:12px;letter-spacing:1.8px;text-transform:uppercase;opacity:.85;">OS CHRISTUS</div>
                <div style="font-size:20px;margin-top:4px;">${esc(title || 'Atualização da Ordem de Serviço')}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 16px;line-height:1.6;color:#4b4338;">${esc(intro || 'Sua solicitação recebeu uma nova atualização.')}</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5dac8;background:#fbf8f2;">
                  <tr><td style="padding:14px 16px;font-size:14px;"><strong>Ticket:</strong> ${esc(ticketId)}</td></tr>
                  <tr><td style="padding:14px 16px;font-size:14px;border-top:1px solid #e5dac8;"><strong>Assunto:</strong> ${esc(subject)}</td></tr>
                  <tr><td style="padding:14px 16px;font-size:14px;border-top:1px solid #e5dac8;"><strong>Status:</strong> <span style="color:${color};font-weight:bold;">${esc(status)}</span></td></tr>
                </table>
                ${bodyText ? `<p style="margin:16px 0 0;line-height:1.6;color:#4b4338;white-space:pre-line;">${esc(bodyText)}</p>` : ''}
                ${
                  ctaUrl
                    ? `<div style="margin-top:24px;"><a href="${esc(ctaUrl)}" style="display:inline-block;background:#2f261a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:2px;">${esc(ctaLabel)}</a></div>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px;border-top:1px solid #eee3d2;color:#7a6f61;font-size:12px;">
                Sistema interno OS Christus • ${new Date().toLocaleString('pt-BR')}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    title || 'Atualização da Ordem de Serviço',
    intro || 'Sua solicitação recebeu uma nova atualização.',
    '',
    `Ticket: ${ticketId || '-'}`,
    `Assunto: ${subject || '-'}`,
    `Status: ${status || '-'}`,
    bodyText ? `\n${bodyText}` : '',
    ctaUrl ? `\n${ctaLabel}: ${ctaUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}
