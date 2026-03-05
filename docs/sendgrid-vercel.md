# SendGrid + Vercel (conversa bidirecional)

## Endpoints criados
- `POST /api/email/send`
- `POST /api/email/inbound`

## Variáveis na Vercel
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`
- `SENDGRID_FROM_NAME`
- `SENDGRID_REPLY_TO_EMAIL`
- `SENDGRID_INBOUND_SECRET`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_SERVICE_ACCOUNT_JSON`

## Fluxo de envio interno -> e-mail
`POST /api/email/send`

Payload mínimo:

```json
{
  "ticketId": "OS-0050",
  "toEmail": "solicitante@empresa.com",
  "subject": "Atualização da OS OS-0050",
  "text": "Seu ticket foi atualizado."
}
```

Payload com template dinâmico:

```json
{
  "ticketId": "OS-0050",
  "toEmail": "solicitante@empresa.com",
  "templateId": "d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "templateData": {
    "ticketId": "OS-0050",
    "status": "Em andamento"
  }
}
```

O endpoint salva thread no Firestore:
- `emailThreads/{ticketId}`
- `emailThreads/{ticketId}/messages`

## Fluxo de resposta por e-mail -> sistema
Configurar Inbound Parse no SendGrid para:

`https://SEU-DOMINIO.vercel.app/api/email/inbound?secret=SUA_CHAVE`

Cada inbound é salvo em:
- `emailThreads/{ticketId}/messages` (direction=`inbound`)
- `ticketInbound` (espelho para consumo do app)

## Thread única por ticket
No envio, o backend inclui cabeçalhos:
- `X-OS-Ticket-ID`
- `In-Reply-To`
- `References`

Isso mantém os e-mails do mesmo ticket agrupados na conversa.

## Observações importantes
- O remetente (`SENDGRID_FROM_EMAIL`) deve estar validado no SendGrid.
- O `SENDGRID_FROM_EMAIL` pode ser diferente do login da conta.
- Para melhor entrega, configure Domain Authentication (SPF/DKIM).
