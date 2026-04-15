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

function stripSignature(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const markers = [
    /^\s*--\s*$/m,
    /^\s*__+\s*$/m,
    /^\s*Atenciosamente[,!.\s]*$/im,
    /^\s*Cordialmente[,!.\s]*$/im,
    /^\s*Abs[,!.\s]*$/im,
    /^\s*Assinatura[:\s]*$/im,
    /^\s*\[image:.*\]\s*$/im,
  ];

  let next = text;
  for (const marker of markers) {
    const match = marker.exec(next);
    if (match?.index != null && match.index > 0) {
      next = next.slice(0, match.index).trim();
      break;
    }
  }

  return next
    .split('\n')
    .filter(line => {
      const normalized = line.trim();
      if (!normalized) return true;
      if (/^\[image:.*\]$/i.test(normalized)) return false;
      if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(normalized)) return false;
      if (/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/.test(normalized.replace(/\s+/g, ' '))) return false;
      if (/^(R\.|Av\.|Rua|Avenida)\s/i.test(normalized)) return false;
      return true;
    })
    .join('\n')
    .trim();
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

function renderMetricRows(metricRows) {
  const items = Array.isArray(metricRows)
    ? metricRows
        .map(item => ({
          label: String(item?.label || '').trim(),
          value: String(item?.value || '').trim(),
        }))
        .filter(item => item.label && item.value)
    : [];

  if (items.length === 0) return '';

  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2));
  }

  const rowHtml = rows
    .map(row => {
      const cells = row
        .map(
          item => `
            <td width="50%" valign="top" style="padding:0 8px 14px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5dac8;border-radius:16px;background:#faf6ef;">
                <tr>
                  <td style="padding:14px 16px;">
                    <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#8a7a67;">${esc(item.label)}</div>
                    <div style="margin-top:8px;font-size:22px;line-height:1.3;font-weight:bold;color:#2d241d;">${esc(item.value)}</div>
                  </td>
                </tr>
              </table>
            </td>`,
        )
        .join('');

      const filler = row.length === 1 ? '<td width="50%" style="padding:0 8px 14px;"></td>' : '';
      return `<tr>${cells}${filler}</tr>`;
    })
    .join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:separate;border-spacing:0;">
      ${rowHtml}
    </table>`;
}

function renderDetailCards(detailCards) {
  const cards = Array.isArray(detailCards)
    ? detailCards
        .map(card => ({
          title: String(card?.title || '').trim(),
          rows: Array.isArray(card?.rows)
            ? card.rows
                .map(row => ({
                  label: String(row?.label || '').trim(),
                  value: String(row?.value || '').trim(),
                }))
                .filter(row => row.label && row.value)
            : [],
        }))
        .filter(card => card.title && card.rows.length > 0)
    : [];

  if (cards.length === 0) return '';

  const cardHtml = cards
    .map(
      card => `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border:1px solid #e5dac8;border-radius:16px;background:#fffaf3;">
          <tr>
            <td style="padding:14px 16px;border-bottom:1px solid #eee3d5;">
              <div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#8a7a67;">${esc(card.title)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 16px 12px;">
              ${card.rows
                .map(
                  row => `
                    <div style="padding:8px 0;border-bottom:1px solid #f1e8dc;">
                      <div style="font-size:10px;letter-spacing:1.3px;text-transform:uppercase;color:#8a7a67;">${esc(row.label)}</div>
                      <div style="margin-top:4px;font-size:16px;line-height:1.5;color:#2d241d;">${esc(row.value)}</div>
                    </div>`,
                )
                .join('')}
            </td>
          </tr>
        </table>`,
    )
    .join('');

  return `<div style="margin:0 0 18px;">${cardHtml}</div>`;
}

export function buildTicketEmailTemplate({
  trigger,
  title,
  intro,
  ticketId,
  status,
  ctaUrl,
  ctaLabel = 'Acompanhar OS',
  bodyText,
  metricRows,
  detailCards,
}) {
  const stage = getStageMeta(trigger, status);
  const isCommunication = normalizeToken(trigger).includes('mensagem');
  const cleanedBody = stripSignature(bodyText);
  const messageParts = [cleanedBody || intro || ''].filter(Boolean);
  const messageHtml = renderBodyText(messageParts.join('\n\n'));
  const metricsHtml = renderMetricRows(metricRows);
  const detailCardsHtml = renderDetailCards(detailCards);
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
                <div style="margin-top:18px;display:table;width:100%;table-layout:fixed;">
                  <div style="display:table-cell;vertical-align:top;padding-right:36px;">
                    <div style="display:inline-block;padding:5px 10px;border:1px solid rgba(255,255,255,0.16);border-radius:999px;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;">${esc(stage.eyebrow)}</div>
                    <div style="margin-top:14px;font-size:28px;line-height:1.22;letter-spacing:-0.2px;">${esc(title || stage.label)}</div>
                  </div>
                  <div style="display:table-cell;vertical-align:top;width:180px;">
                    <div style="padding:14px 18px;border:1px solid rgba(255,255,255,0.16);border-radius:20px;text-align:right;min-width:160px;background:rgba(255,255,255,0.02);">
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
                  ${metricsHtml}
                  ${detailCardsHtml}
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
    `Ticket: ${ticketId || '-'}`,
    '',
    ...(Array.isArray(metricRows)
      ? metricRows
          .map(item => {
            const label = String(item?.label || '').trim();
            const value = String(item?.value || '').trim();
            return label && value ? `${label}: ${value}` : '';
          })
          .filter(Boolean)
      : []),
    ...(Array.isArray(metricRows) && metricRows.length > 0 ? [''] : []),
    ...(Array.isArray(detailCards)
      ? detailCards.flatMap(card => {
          const title = String(card?.title || '').trim();
          const rows = Array.isArray(card?.rows)
            ? card.rows
                .map(row => {
                  const label = String(row?.label || '').trim();
                  const value = String(row?.value || '').trim();
                  return label && value ? `${label}: ${value}` : '';
                })
                .filter(Boolean)
            : [];
          return title && rows.length > 0 ? [title, ...rows, ''] : [];
        })
      : []),
    cleanedBody || intro || '',
    '',
    ctaUrl ? `Link completo: ${ctaUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}

export function buildAccessEmailTemplate({
  title,
  intro,
  recipientName,
  ctaUrl,
  ctaLabel = 'Criar senha',
}) {
  const safeTitle = esc(title || 'Defina sua senha de acesso');
  const safeIntro = esc(intro || 'Use o botão abaixo para definir sua senha de acesso ao sistema.');
  const greeting = recipientName ? `Olá ${esc(recipientName)},` : 'Olá,';
  const safeUrl = esc(ctaUrl || '');
  const safeLabel = esc(ctaLabel);

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
                <div style="margin-top:14px;font-size:28px;line-height:1.22;letter-spacing:-0.2px;">${safeTitle}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="padding:20px;border:1px solid #e5dac8;border-radius:18px;background:#ffffff;">
                  <p style="margin:0 0 14px;color:#544b41;font-size:14px;line-height:1.8;">${greeting}</p>
                  <p style="margin:0 0 14px;color:#544b41;font-size:14px;line-height:1.8;">${safeIntro}</p>
                  <p style="margin:0;color:#544b41;font-size:13px;line-height:1.8;">
                    Por segurança, este link expira automaticamente após um período.
                  </p>
                </div>
                ${
                  safeUrl
                    ? `<div style="margin-top:26px;text-align:left;">
                        <a href="${safeUrl}" style="display:inline-block;background:#241c15;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:999px;font-size:14px;font-weight:bold;letter-spacing:0.2px;">
                          ${safeLabel}
                        </a>
                        <div style="margin-top:12px;color:#6f6256;font-size:12px;line-height:1.7;">
                          Link completo: <a href="${safeUrl}" style="color:#855922;">${safeUrl}</a>
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
    title || 'Defina sua senha de acesso',
    '',
    recipientName ? `Olá ${recipientName},` : 'Olá,',
    intro || 'Use o botão abaixo para definir sua senha de acesso ao sistema.',
    '',
    ctaUrl ? `Link para criar senha: ${ctaUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}
