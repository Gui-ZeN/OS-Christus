import process from 'node:process';

function getEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

async function main() {
  const apiKey = getEnv('SENDGRID_API_KEY');
  const fromEmail = getEnv('SENDGRID_FROM_EMAIL');
  const toEmail = process.env.SENDGRID_TO_EMAIL_TEST?.trim() || fromEmail;
  const fromName = process.env.SENDGRID_FROM_NAME?.trim() || 'OS Christus';

  const payload = {
    personalizations: [{ to: [{ email: toEmail }] }],
    from: { email: fromEmail, name: fromName },
    subject: 'OS Christus - teste de integração SendGrid',
    content: [
      {
        type: 'text/plain',
        value: `Teste de envio concluído em ${new Date().toISOString()}.`,
      },
      {
        type: 'text/html',
        value: `<p>Teste de envio concluído em <strong>${new Date().toISOString()}</strong>.</p>`,
      },
    ],
  };

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
    throw new Error(`SendGrid falhou (${response.status}): ${body}`);
  }

  console.log(`E-mail de teste enviado para ${toEmail}.`);
}

main().catch(error => {
  console.error('Erro no teste SendGrid:', error.message);
  process.exitCode = 1;
});
