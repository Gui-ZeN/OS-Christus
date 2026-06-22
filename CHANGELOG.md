# Changelog — Serv3 / OS Christus

Registro consolidado das mudanças. O histórico granular (com o "porquê") está
nas mensagens de commit; este arquivo agrupa por tema para leitura rápida.

## 2026-06-22

### 🐛 Bugs de produção reportados (correções)
6 inconsistências relatadas no uso real, todas com causa-raiz confirmada e corrigida:
- **E-mails não encadeavam a conversa** (`9a55dc3`~): `gmailSend` retornava o id
  interno do Gmail em vez do header `Message-Id` próprio → cada resposta virava
  thread nova. Agora gera/seta/retorna um `Message-Id` RFC.
- **Só 1 foto por atendimento/parecer e no formulário público**: os handlers de
  arquivo substituíam a lista; agora acumulam e limpam o input (`prev => [...prev, ...next]`).
- **Anexo (foto) não ia no e-mail à Diretoria**: só iam anexos de parecer/contrato;
  agora as fotos da OS (`ticket.attachments`) sempre acompanham.
- **Trava a cada resposta**: `budgetHistory` (O(n×m) sobre todos os tickets) só é
  usado no modal de cotações; passou a só calcular com o modal aberto + `activeTicket`
  memoizado → responder deixou de disparar o recálculo.
- **Resposta salva mas e-mail não enviado, sem aviso**: envio era fire-and-forget;
  agora as funções retornam status e o composer dá toast quando o e-mail não sai
  (sem destinatário / falha).
- **Parcial — imagem inline no corpo do parecer**: ainda não suportado (corpo é
  `<textarea>`; exigiria editor rich-text — fica como feature à parte).

### 🔐 Segurança & Autorização
- **Gestor escopado por região** (`717e358`): deixa de ter visão global; vê apenas
  OS do seu `regionIds`/`siteIds` (Inbox, números/KPI, filtros, procurement) —
  fail-closed sem escopo.
- **PATCH de ticket blindado** (`777e8d4`): bloqueia campos imutáveis (`id`,
  `trackingToken`, `createdAt`) e impede perfis não-Admin de reclassificar
  região/sede (evitava mover OS para fora do território).
- **Escopo no `/email/send`** (`cc6e966`): perfis não-Admin só disparam e-mail de
  OS dentro do seu escopo (anti-relay).
- **Escopo de notificações** (`777e8d4`): notificação ligada a OS só é visível/
  acionável se a OS estiver no escopo (resolve `ticketId` e `action.ticketId`).
- **Diretor anexa em mensagens** (`741fba2`): `storage.rules` `canAttachMessage`
  inclui `diretor` (a UI permitia, as rules negavam). **Requer deploy das rules.**
- Provider de e-mail no reset de senha com autodetect de Gmail (`741fba2`).

### 🐞 Fluxo de tickets
- **Aceitar OS sem exigir motivo na triagem** (`deacad0`).
- **Cancelar** reverte a etapa e o motivo do composer (`1274cbe`).
- **Seleção de diretores persistida** nas transições de aprovação (`4f5593e`).
- Menores no composer: `replyMode`/`statusDraft` resetam ao trocar de OS;
  total de cotação (breakdown = value) (`455e56b`).

### 📧 E-mail / inbound (Gmail)
- **Tolerar variação de código de sede** no inbound (`PQL 3`/`D.L` → `PQL3`/`DL`) (`b4246b8`).
- **Impedir OS duplicada** em reentrega push→sync (lock persistente como `done`) (`1ec16a7`).

### 💰 Procurement / dados
- **Persistir campos de cotação** (`initialRoundIndex`, `attachmentUrl/Path`) +
  guardas de NaN/ID (`finiteOrNull`, `randomUUID`) (`35d6cd7`).
- **`writeQuotes` atômico** — todas as cotações num único batch (`736981e`).
- Backfill de 13 chamados "indefinidos" (região/sede) em produção (operação manual).

### ⚡ Performance
- Notificações: leitura de tickets em **lote** (`getAll`), N→1 (`cc6e966`).

### 🖥️ UI / acessibilidade / mobile
- Trava de **double-submit** em medição e duplicar OS (`882c056`).
- Cotação imutável + `aria-label` nos botões de formatação (`3c38fae`).
- Overflow de tabela de comparativo em mobile + erros tratados (`81555a9`).
- `SettingsView`: hooks antes de early-return + erro real ao salvar template (`df2a65d`).

### 🛠️ Infra
- `vercel.json`: `maxDuration` 60s + região `gru1`; `.env.example` atualizado;
  `npm audit fix` (2 vulnerabilidades HIGH) (`e54ec5d`).
- `firestore.indexes.json` versionado (estado real exportado) (`4cfd579`).

### 🧪 Ambiente de desenvolvimento (novo)
- **Emulador Firebase local** (Auth+Firestore) + adaptador de API + seed (`6e20748`).
  Roda o app inteiro local sem credenciais reais: `npm run dev:emulator` /
  `dev:seed` / `dev:api` / `dev`. Login de teste: `admin@test.local` / `Test@123456`.
  Detalhes em `scripts/dev/README.md`.

### ♻️ Refactor — decomposição do InboxView
God component reduzido de **6036 → 5457 linhas** extraindo modais para
`src/views/inbox/` (estado permanece no InboxView; comportamento idêntico):
- `ThirdPartyModal` (`213b806`), `ContractDispatchModal` (`5e098dd`),
  `PreliminaryActionsModal` + `ExecutionSetupModal` (`8103740`),
  `ProgressUpdateModal` (`53efa15`).
- Modal de Cotações ("elefante", ~1000 linhas): extração incremental iniciada —
  `DirectorInterestsPanel` (`0f4c451`). **Em andamento** (ver
  `memory`/roadmap interno).

### 🎨 Marca
- Logo/selo Serv3 em login, landing, sidebar, rastreio + favicon (`18d33d0`,
  `99a3d3c`, `e6dde8d`).

---

### ⚠️ Ações pendentes (dependem do usuário)
- **Rotacionar a service account do Firebase** (chave usada em backfill foi
  exposta no chat — comprometida).
- **Deploy das `storage.rules`**: `npx firebase-tools login && npx firebase-tools
  deploy --only storage --project os-christus` (para o fix do Diretor-anexo valer).
