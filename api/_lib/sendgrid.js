function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
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

  const payload = compact({
    personalizations: [
      compact({
        to: [{ email: toEmail }],
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
