# Infra Firebase - Setup inicial

## Scripts criados
- `npm run infra:firebase:enable-apis`
- `npm run infra:firebase:setup`
- `npm run infra:storage:check`
- `npm run infra:storage:signed-url`

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
- `FIREBASE_STORAGE_BUCKET=` (opcional)
- `FIREBASE_ALLOW_BUCKET_CREATE=true|false`
- `FIREBASE_BUCKET_LOCATION=us-central1`
- `FIREBASE_CORS_ORIGINS=http://localhost:3000`
- `FIREBASE_SKIP_STORAGE=true|false`

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
Exemplo upload:

```bash
TICKET_ID=OS-0050 FILE_NAME=foto.jpg FILE_MIME_TYPE=image/jpeg npm run infra:storage:signed-url
```

Exemplo download:

```bash
STORAGE_SIGN_MODE=download STORAGE_OBJECT_PATH=attachments/tickets/pdfs/OS-0050/arquivo.pdf TICKET_ID=OS-0050 FILE_NAME=arquivo.pdf npm run infra:storage:signed-url
```

## Regras
- `firestore.rules` e `storage.rules` já foram criados no repositório.
