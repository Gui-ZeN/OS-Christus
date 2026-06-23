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
- **Inserir foto no corpo da mensagem** (`5adc232`): novo botão no composer que
  faz upload da imagem ao Storage, anexa à mensagem e insere um link clicável no
  texto (renderBodyText passou a auto-linkar URLs). Imagem **inline** (`<img>` no
  corpo) segue como feature à parte (exigiria editor rich-text e é frágil entre
  clientes de e-mail).
- **@menção no composer** (`87a59d0`): digitar `@` abre autocomplete do diretório;
  escolher insere `@Nome` no texto e adiciona o e-mail da pessoa ao CC (ela recebe
  a resposta). No e-mail o `@Nome` sai destacado. Réplica do `@` do Gmail (sem o
  pill interativo nativo, que é UI do Workspace).
- **Aviso de e-mail bloqueado/rejeitado (bounce)** (`eaa6e1f`, `d95ef79`, `c540535`):
  quando o provedor de destino rejeita um e-mail enviado, o Gmail devolve um NDR
  ("Message blocked") que antes era descartado. Agora o sistema detecta o bounce,
  resolve a OS (pelo `X-OS-Ticket-ID` embutido) e registra **um único aviso por OS**
  ("E-mail bloqueado") no histórico + notificação Admin/Gestor. Vários bounces do
  mesmo envio (ou um NDR por destinatário) colapsam num só aviso — chaveado por
  OS+dia, então um envio futuro que falhar volta a avisar.

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
- **Dropdown de Sede na Inbox escopado** (`32ecd5d`): o filtro listava **todas** as
  sedes do catálogo; agora só Admin vê todas — Gestor/Diretor/Usuario veem apenas as
  sedes que aparecem nos seus tickets (já escopados pelo backend). Não vaza sedes de
  outras regiões.
- **Diretor anexa em mensagens** (`741fba2`): `storage.rules` `canAttachMessage`
  inclui `diretor` (a UI permitia, as rules negavam). **Requer deploy das rules.**
- Provider de e-mail no reset de senha com autodetect de Gmail (`741fba2`).

### 🐞 Fluxo de tickets
- **Redesenho do aceite — Aceitar/Recusar OS** (`35ac318`, `db16aa7`): a OS nova começa
  pela **decisão** ("Aceitar OS / Recusar OS" + "Definir equipe, urgência e
  classificação"), sem a parede de campos de triagem — reaproveita o colapsar do painel.
  Aceitar com equipe/urgência vazias **expande** o painel pra preencher. **Trava:** não
  avança de "Parecer Técnico" para orçamento sem macroserviço+serviço (a classificação
  adiada na triagem não é esquecida). "Recusar OS" usa o fluxo de **motivo + notificação
  ao solicitante** já existente. Construído e **verificado no emulador local** (login →
  Nova OS → decisão → aceite → mudança de status; trava bloqueando o avanço).
- **Data da OS = data da conversa** (`8304c05`): em OS retroativas o card/inbox mostrava
  a data de registro e a conversa a data real do pedido. Agora editar a data da 1ª
  mensagem (do solicitante) sincroniza a data de abertura da OS (card, cabeçalho, KPIs).
  Backfill alinhou **19 OS** retroativas existentes (`ticket.time` = 1ª mensagem) —
  16 voltaram de jun→mai; backup reversível em `_date_backups/`.
- **Encerradas/Canceladas saem da Inbox** (`ad95d36`): a lista mostra só OS ativas;
  botão fixo no rodapé "Mostrar encerradas (N)" traz as finalizadas (que vão pro fim
  da lista). Filtro explícito por status finalizado é respeitado (botão some).
- **Aceitar OS sem exigir motivo na triagem** (`deacad0`).
- **Cancelar** reverte a etapa e o motivo do composer (`1274cbe`).
- **Seleção de diretores persistida** nas transições de aprovação (`4f5593e`).
- Menores no composer: `replyMode`/`statusDraft` resetam ao trocar de OS;
  total de cotação (breakdown = value) (`455e56b`).

### 📧 E-mail / inbound (Gmail)
- **E-mail encaminhado formatado** (`5e9da3d`): respostas/encaminhamentos deixam de
  virar um parágrafo único ilegível — remove marcadores `>`, `[image: ...]` inline e
  divisórias de encaminhamento, e o histórico passa a preservar as quebras de linha
  (`whitespace-pre-line`).
- **Histórico citado colapsável** (`144fb7d`): threads encaminhadas N vezes mostram só
  a mensagem mais recente; o resto fica atrás de "Mostrar conversa anterior" (igual ao
  Gmail). `splitMessageQuote` separa recente/citado; remove ainda linhas de lista de
  destinatários (3+ e-mails) e separadores `--`. Componente `inbox/MessageBody`.
- *(opcional, não recomendado)* `scripts/infra/fix-forwarded-texts.mjs` (`f7cca5c`):
  backfill que limpa o texto guardado no banco. Como o colapso depende dos `>` para
  separar bem, é melhor **não** rodar — o render já resolve sem destruir os dados.
- **Tolerar variação de código de sede** no inbound (`PQL 3`/`D.L` → `PQL3`/`DL`) (`b4246b8`).
- **Sede sem separador no assunto** (`89253b0`, `2b1dc3f`): o parser exigia `-`/`:` logo
  após o `[SEDE]`. Agora `[PE] 7° andar... - Haste...` (colchete colado no texto, traço
  só no meio) cria a OS na sede PE. Separador opcional; traço interno preservado. Como
  isso faz `[X] texto` casar, foi adicionada uma **trava**: só vira OS se o `[CÓDIGO]`
  resolver para uma sede real do catálogo — senão notificações (`[GitHub]`,
  `[Action Required]`, `[NotaQuest]`…) virariam OS-lixo. Auditoria do banco
  (`inboundMessageLocks`): 12 assuntos foram afetados pelo bug; só 1 era OS real
  (`[PE]`, de operacional11) — as outras 11 eram notificações, agora filtradas.
- **Impedir OS duplicada** em reentrega push→sync (lock persistente como `done`) (`1ec16a7`).

### 💰 Procurement / dados
- **Persistir campos de cotação** (`initialRoundIndex`, `attachmentUrl/Path`) +
  guardas de NaN/ID (`finiteOrNull`, `randomUUID`) (`35d6cd7`).
- **`writeQuotes` atômico** — todas as cotações num único batch (`736981e`).
- Backfill de 13 chamados "indefinidos" (região/sede) em produção (operação manual).

### ⚡ Performance
- Notificações: leitura de tickets em **lote** (`getAll`), N→1 (`cc6e966`).
- **Auditoria de performance** (jun/2026) e 1ª leva de otimizações (Tier 1 seguro):
  - `emailEvents` ganha `ttlAt` (now+90d) p/ habilitar TTL policy do Firestore e
    parar o crescimento ilimitado; removida dep morta `motion` (`a6df4d4`).
  - `TicketListItem` memoizado (`React.memo` + `onSelect` estável) — a lista para
    de re-renderizar a cada tecla/poll; removido o poll de tickets **duplicado**
    do InboxView (o AppContext já cobre) (`70d84bc`).
  - `MessageBody` memoizado + limpeza-regex deixa de rodar por mensagem a cada
    tecla (só itens de sistema usam `displayText`) (`b5c0248`).
  - **2ª leva — backend (cache + escopo):** cache TTL (~60s) de sites/regions/users
    (`api/_lib/refCache.js`), aplicado em `readTerritoryCatalog` (todo poll de
    notificações/PATCH/procurement), `resolveSiteContext` (por e-mail) e nas listas de
    users — 2ª leitura das 3 coleções cai de ~765ms→0ms no hit quente (`ce909ca`).
    Notificações deixam de refazer a leitura quando a lista filtrada vem vazia
    (`e5cd034`).
  - **3ª leva — poll O(N) (`fdb392c`):** `areTicketListsEqual` deixa de fazer
    `JSON.stringify` da lista inteira a cada 10s; compara uma assinatura por ticket
    (`id|updatedAt|history.length|status|priority|viewingBy`), com `updatedAt`
    serializado no payload e carimbado em toda escrita. Remove a micro-trava periódica.
  - **Pendente (maior, precisa de teste ao vivo):** extrair o composer de resposta — a
    correção direta da travada de digitar, mas `replyText` está entrelaçado com
    send/@menção/formatação/foto no InboxView (refactor de risco). Memoizar o value do
    `AppContext` tem ganho baixo. Virtualizar listas (precisa de lib). Backend restante:
    `tickets` Admin sem `history` na lista + os 4 `collectionGroup` do procurement Admin.

### 📊 Indicadores (KPI)
- **Filtro "Por Mês"** (`4c1da3d`): escolher um mês de calendário específico
  (mês + ano) no dashboard, além de Este Mês / Semestre / Últimos 12 Meses. O
  período passa a recortar exatamente aquele mês (com fim de mês/bissexto certos).

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
- **Lista do histórico → `TicketHistory` memoizado** (`85f66d2`): ~143 linhas de JSX
  saem do InboxView para um componente `React.memo`. Motivado por perf: com `history`
  + callbacks estáveis (`handleUpdateHistoryItemTime` virou `useCallback`), a lista
  **não re-renderiza a cada tecla** no composer — era a maior parcela da travada ao
  digitar. Construído e **verificado no emulador**.
- **Composer textarea não-controlado** (`d5a45f1`): 2ª mordida — o `replyText` deixa de
  ser state do InboxView; o valor vive no DOM (via `replyTextRef`) com 2 helpers
  (`getReplyText`/`setReplyTextValue`). **Digitar não dispara mais re-render** do
  componente de ~5.700 linhas (causa-raiz da travada). 10 pontos convertidos (onChange,
  3 resets, foto, @menção, formatação, envio). **Verificado no emulador** (verify-or-revert):
  digitar/@menção/envio/negrito/resets — tudo OK, zero erro de console.
- **Modal de Cotações — decomposição incremental** (`2982cff`, `6d88e8b`, `2eaf1d6`):
  quebra do "elefante" das cotações (~1.064 linhas) em sub-seções apresentacionais.
  Feito: `AdditiveReferenceCard` (card "Orçamento base escolhido", ~42 linhas, 3 props),
  `QuoteHistoryMetrics` (grid Média/Faixa/Último/Referências, ~22 linhas, 1 prop) e
  `QuoteHistoryPanel` (painel "Base histórica" inteiro — termos, métricas, fornecedor
  preferencial, casos similares e referência por item, ~116 linhas, 3 props; absorveu o
  QuoteHistoryMetrics). Todos behavior-identical, verificados por tsc+build. InboxView:
  5457 → 5425 linhas. Próximas: comparativo, contexto/cabeçalho, editor núcleo.

### 🎨 Marca
- Logo/selo Serv3 em login, landing, sidebar, rastreio + favicon (`18d33d0`,
  `99a3d3c`, `e6dde8d`).

---

### ⚠️ Ações pendentes (dependem do usuário)
- **Rotacionar a service account do Firebase** (chave usada em backfill foi
  exposta no chat — comprometida).
- **Deploy das `storage.rules`**: `npx firebase-tools login && npx firebase-tools
  deploy --only storage --project os-christus` (para o fix do Diretor-anexo valer).
