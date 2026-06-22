# Ambiente de desenvolvimento local (emulador Firebase)

Roda o app inteiro localmente — front + funções `api/*.js` + Firebase — sem
tocar em produção. Útil pra desenvolver/testar telas autenticadas (Inbox,
Financeiro, etc.) sem credenciais reais.

## Pré-requisitos
- Node 20+ e **Java 11+** (o emulador do Firestore precisa de Java).
- `firebase-tools` (usado via `npx`, não precisa instalar global).

## Subir (4 terminais, ou rode em background)

```bash
# 1) Emuladores Auth (9099) + Firestore (8080)
npm run dev:emulator

# 2) Seed: usuário Admin de teste + regiões/sedes/equipes/tickets
npm run dev:seed

# 3) Adaptador que serve api/*.js em :3001 apontando pro emulador
npm run dev:api

# 4) Front (Vite em :3000, com proxy /api -> :3001)
npm run dev
```

Crie um `.env.local` (gitignored) com:

```
VITE_FIREBASE_API_KEY="demo-os-christus"
VITE_FIREBASE_AUTH_DOMAIN="os-christus.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="os-christus"
VITE_FIREBASE_STORAGE_BUCKET="os-christus.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="000000000000"
VITE_FIREBASE_APP_ID="1:000000000000:web:demo"
VITE_USE_FIREBASE_EMULATOR="true"
VITE_API_PROXY="http://localhost:3001"
```

## Login de teste
- **admin@test.local** / **Test@123456** (papel Admin)

## Como funciona
- `firebaseAdmin.js` e `firebaseClient.ts` detectam o modo emulador por env
  (`FIRESTORE_EMULATOR_HOST` no backend, `VITE_USE_FIREBASE_EMULATOR` no front).
  Em produção essas flags não existem → comportamento normal, zero impacto.
- O adaptador (`api-adapter.mjs`) replica os rewrites do `vercel.json` e injeta
  `req.query`, já que não há `vercel dev`.
- Os dados do emulador são **em memória** — somem ao parar; rode o seed de novo.
