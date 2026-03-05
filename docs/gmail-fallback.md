# Gmail Fallback (sem DNS corporativo)

Quando não for possível configurar DNS para inbound no SendGrid, use Gmail API.

## Endpoints
- `POST /api/email/send` com `EMAIL_PROVIDER=gmail`
- `POST /api/email/gmail-sync?secret=...` para importar respostas da caixa

## Variáveis necessárias (Vercel)
- `EMAIL_PROVIDER=gmail`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `GMAIL_REDIRECT_URI` (padrão OAuth Playground)
- `GMAIL_FROM_EMAIL`
- `GMAIL_SYNC_SECRET`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_PROJECT_ID`

## Como funciona
1. Sistema envia e-mails via Gmail API mantendo cabeçalhos de thread.
2. Endpoint `gmail-sync` lê mensagens recentes da Inbox.
3. Cada resposta é gravada em:
   - `emailThreads/{ticketId}/messages`
   - `ticketInbound`

## Agendamento recomendado
Na Vercel, crie um cron para chamar:

`POST https://SEU_APP.vercel.app/api/email/gmail-sync?secret=SEU_SEGREDO`

Intervalo sugerido: a cada 5 minutos.

## Limitações
- Solução de transição para baixo volume.
- Menos robusta que inbound dedicado com DNS autenticado.
