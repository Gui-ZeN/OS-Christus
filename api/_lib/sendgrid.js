function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

function parseRecipientList(input) {
  return String(input || '')
    .split(/[;,]+/)
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .map(value => {
      const match = value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      return match ? match[0].toLowerCase() : '';
    })
    .filter(Boolean);
}

export async function sendWithSendGrid({
  toEmail,
  subject,
  text,
  html,
  templateId,
  templateData,
  headers,
  replyTo,
}) {
  const apiKey = requiredEnv('SENDGRID_API_KEY');
  const fromEmail = requiredEnv('SENDGRID_FROM_EMAIL');
  const fromName = process.env.SENDGRID_FROM_NAME || 'OS Christus';

  const recipients = [...new Set(parseRecipientList(toEmail))];
  if (recipients.length === 0) {
    throw new Error('Destinatário de e-mail ausente para envio via SendGrid.');
  }

  const payload = compact({
    personalizations: [
      compact({
        to: recipients.map(email => ({ email })),
        dynamic_template_data: templateId ? (templateData || {}) : undefined,
      }),
    ],
    from: { email: fromEmail, name: fromName },
    subject: templateId ? undefined : subject,
    content: templateId
      ? undefined
      : [
          { type: 'text/plain', value: text || '' },
          { type: 'text/html', value: html || `<pre>${(text || '').replace(/[<>&]/g, '')}</pre>` },
        ],
    template_id: templateId || undefined,
    headers: headers || undefined,
    reply_to: replyTo ? { email: replyTo } : undefined,
  });

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SendGrid ${response.status}: ${body}`);
  }

  return {
    status: response.status,
    messageId: response.headers.get('x-message-id') || null,
  };
}
