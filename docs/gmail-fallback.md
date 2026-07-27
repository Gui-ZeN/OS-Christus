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
- `FIREBASE_SERVICE_ACCOUNT_B64` (recomendado)
- `FIREBASE_SERVICE_ACCOUNT_JSON` (alternativo)
- `FIREBASE_PROJECT_ID`

## Como funciona
1. Sistema envia e-mails via Gmail API mantendo cabeçalhos de thread.
2. Endpoint `gmail-sync` lê mensagens recentes da Inbox.
3. Cada resposta é gravada em:
   - `emailThreads/{ticketId}/messages`
   - `ticketInbound`
4. Eventos de saúde são gravados em `emailEvents`.

## Agendamento recomendado (sem Vercel Pro)
Workflow do GitHub Actions em:

`.github/workflows/gmail-sync.yml`

Ele chama `POST /api/email/gmail-sync` a cada 5 minutos com:

`Authorization: Bearer <CRON_SECRET>`

Secrets necessários no GitHub:
- `SYNC_URL` (ex.: `https://seu-app.vercel.app/api/email/gmail-sync`)
- `CRON_SECRET` (mesmo segredo definido no projeto)

## Worker da fila de e-mails

Pagamentos confirmados são gravados primeiro e o e-mail correspondente entra em
uma outbox. O workflow `.github/workflows/email-outbox.yml` processa essa fila a
cada cinco minutos, sem depender de uma tela do Serv3 aberta.

Secret adicional no GitHub Environment `Production`:

- `OUTBOX_URL` (em produção:
  `https://serv3.vercel.app/api/email/outbox-worker`)

O `CRON_SECRET` deve ser exatamente o mesmo configurado na Vercel. O worker
recupera tentativas interrompidas, aplica espera progressiva e envia para
intervenção administrativa após seis falhas.

O endpoint também aceita `GMAIL_SYNC_SECRET` via query/header para execução manual.

## Limitações
- Solução de transição para baixo volume.
- Menos robusta que inbound dedicado com DNS autenticado.

## Gerar FIREBASE_SERVICE_ACCOUNT_B64 (PowerShell)
```powershell
$raw = Get-Content -Raw "C:\caminho\service-account.json"
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($raw))
```
