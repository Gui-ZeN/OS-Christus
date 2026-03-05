# Gmail Fallback (sem DNS corporativo)

Quando não for possível configurar DNS para inbound no SendGrid, use Gmail API.

## Endpoints
- `POST /api/email/send` com `EMAIL_PROVIDER=gmail`
- `POST /api/email/gmail-sync?secret=...` para importar respostas da caixa
- `GET /api/email/health` para monitoramento (últimas 24h)

## Variáveis necessárias (Vercel)
- `EMAIL_PROVIDER=gmail`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `GMAIL_REDIRECT_URI` (padrão OAuth Playground)
- `GMAIL_FROM_EMAIL`
- `GMAIL_SYNC_SECRET`
- `CRON_SECRET` (recomendado para cron da Vercel)
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_PROJECT_ID`

## Como funciona
1. Sistema envia e-mails via Gmail API mantendo cabeçalhos de thread.
2. Endpoint `gmail-sync` lê mensagens recentes da Inbox.
3. Cada resposta é gravada em:
   - `emailThreads/{ticketId}/messages`
   - `ticketInbound`
4. Eventos de saúde são gravados em `emailEvents`.

## Agendamento recomendado
Cron já configurado em `vercel.json` para chamar:

`/api/email/gmail-sync` a cada 5 minutos.

Proteção recomendada:
- definir `CRON_SECRET` na Vercel;
- o endpoint aceita `Authorization: Bearer <CRON_SECRET>`.
- também aceita `GMAIL_SYNC_SECRET` via query/header para execução manual.

## Limitações
- Solução de transição para baixo volume.
- Menos robusta que inbound dedicado com DNS autenticado.
