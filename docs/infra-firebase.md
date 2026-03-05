# Infra Firebase - Setup inicial

## Scripts criados
- `npm run infra:firebase:enable-apis`
- `npm run infra:firebase:setup`
- `npm run infra:storage:check`
- `npm run infra:storage:signed-url`
- `npm run infra:sendgrid:test`

## Pré-requisitos no projeto GCP/Firebase
1. Ativar billing no projeto.
2. Dar ao service account ao menos:
   - `Service Usage Admin` (habilitar APIs)
   - `Firebase Admin` ou permissões equivalentes
   - `Storage Admin`
   - `Cloud Datastore User` (Firestore)
3. Habilitar APIs (ou rodar script):
   - `serviceusage.googleapis.com`
   - `firestore.googleapis.com`
   - `storage.googleapis.com`
   - `firebase.googleapis.com`
   - `firebasestorage.googleapis.com`

## Variáveis importantes
- `GOOGLE_APPLICATION_CREDENTIALS=.secrets/firebase-admin.json`
- `FIREBASE_PROJECT_ID=os-christus`
- `FIREBASE_STORAGE_BUCKET=os-christus-attachments`
- `FIREBASE_ALLOW_BUCKET_CREATE=true|false`
- `FIREBASE_BUCKET_LOCATION=us-central1`
- `FIREBASE_CORS_ORIGINS=http://localhost:3000,https://os-christus.vercel.app`
- `FIREBASE_SKIP_STORAGE=true|false`
- `FIREBASE_SKIP_FIRESTORE=true|false`

## Execução recomendada
1. `npm run infra:firebase:enable-apis`
2. `npm run infra:firebase:setup`
3. `npm run infra:storage:check`

## O que o setup provisiona
- Docs de configuração no Firestore:
  - `config/system`
  - `config/presence`
  - `config/attachments`
- Estrutura de diretórios no Storage:
  - `attachments/tickets/images/`
  - `attachments/tickets/pdfs/`
  - `attachments/contracts/`
  - `attachments/quotes/`
- CORS no bucket.

## Gerar Signed URL (upload/download)
Exemplo upload (PowerShell):

```powershell
$env:TICKET_ID="OS-0050"
$env:FILE_NAME="foto.jpg"
$env:FILE_MIME_TYPE="image/jpeg"
npm run infra:storage:signed-url
```

Exemplo download (PowerShell):

```powershell
$env:STORAGE_SIGN_MODE="download"
$env:STORAGE_OBJECT_PATH="attachments/tickets/pdfs/OS-0050/arquivo.pdf"
$env:TICKET_ID="OS-0050"
$env:FILE_NAME="arquivo.pdf"
npm run infra:storage:signed-url
```

## SendGrid
Teste rápido de envio:

```powershell
$env:SENDGRID_API_KEY="SG.xxxxx"
$env:SENDGRID_FROM_EMAIL="no-reply@seudominio.com.br"
$env:SENDGRID_FROM_NAME="OS Christus"
$env:SENDGRID_TO_EMAIL_TEST="voce@dominio.com"
npm run infra:sendgrid:test
```

## Regras
- `firestore.rules` e `storage.rules` já foram criados no repositório.
