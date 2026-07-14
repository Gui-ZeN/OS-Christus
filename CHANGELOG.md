# Changelog — Serv3 / OS Christus

Registro consolidado das mudanças. O histórico granular (com o "porquê") está
nas mensagens de commit; este arquivo agrupa por tema para leitura rápida.

## 2026-07-09

### 🔐 "Segredo inválido" no log: front e back discordavam sobre quem sincroniza
- **Sintoma**: a Saúde de E-mail acumulava `Segredo inválido (via: bearer; ua: Mozilla/…)` **sem ninguém clicar em nada**.
- **Causa**: o `InboxView` dispara `gmail-sync` **sozinho** (a cada ~60s, para quem tem a inbox aberta) e libera isso para **Admin E Gestor** — mas o `authorizeGmailAutomation` aceitava **só Admin**. Cada um dos 6 Gestores batia no endpoint de minuto em minuto e levava recusa; o erro era engolido no `catch {}` do front (invisível na tela) mas logado no back. Não houve queda: o `gmail-sync.yml` (cron do GitHub Actions) continua sincronizando com o segredo.
- **Correções**: (1) `authorizeGmailAutomation(req, allowedRoles)` — o `gmail-sync` passa a aceitar `['Admin','Gestor']`, alinhado ao que o front já assumia (o `reprocess-inbound`, mais pesado, já aceitava Gestor); `gmail-watch`/`gmail-push` seguem restritos a Admin. (2) A mensagem **mentia**: o `catch {}` engolia o erro real do `requireUserWithRoles` e reportava "Segredo inválido", mandando o usuário caçar um segredo de cron sem relação. Agora, quando a chamada é de gente pelo painel (bearer + User-Agent de navegador), propaga o motivo verdadeiro ("Permissão insuficiente" / "Usuário inativo" / "sem cadastro no diretório").

### 📥 E-mails que não viravam OS (117 de 494 perdidos em silêncio)
Auditoria dos **494 inbounds** já registrados (`inboundMessageLocks`) revelou **117 sem OS**. Três causas, e a pior era invisível:
- **Sedes reais fora do catálogo** → o assunto não casava nenhuma sede e o `createTicketFromInbound` devolvia `null`: a OS **não era criada**. Atingia `[CESIU]` (6 e-mails, 0 OS), `[PRÉ SUL]` (12), `[Pré-Nunes]`. **Correção**: mapa `SITE_ALIASES` em `resolveSiteContext` — `CESIU`/`CVU` → `ALD`, `PRÉ SUL` → `PSUL`, `PRÉ NUNES` → `PNV`, `DT1` → `DT`. O pessoal continua escrevendo como escreve; o sistema entende. Casa antes do fallback aproximado por substring (que só acertava `DT1`→`DT` por acaso, já que "dt1" contém "dt").
- **Descarte MUDO**: e-mail sem sede reconhecida sumia **sem log nenhum** — por isso ninguém percebeu os 117. Agora gera `logEmailEvent status:'skipped'` com o motivo, visível na tela de Saúde de E-mail.
- Ruído (`[NotaQuest]`, `[GitHub]`, `[Action Required]`, `[TESTE]`…) segue corretamente descartado.

### 🐛 Resposta de e-mail não abre mais OS duplicada
- **Relato dos usuários**: "mudamos o status da OS e, quando chega e-mail novo, ela volta para Nova OS". **A auditoria do banco refutou a reversão**: em 241 mudanças de status, só 2 foram para "Nova OS" — ambas **manuais**, feitas pelo Admin pelo painel. Nenhuma OS regrediu de status automaticamente (o inbound nunca escreve `status`), e não há reuso de ID/sobrescrita (contador `ticketSequence` à frente do máximo).
- **O que de fato ocorre**: uma resposta `Re: [SEDE] ...` tem o prefixo `Re:` removido no parse e casa como **OS nova**; quando o vínculo de thread falha, abre-se uma **OS duplicada** em "Nova OS" (ex.: OS-0143/OS-0160, mesmo remetente e assunto, 1 dia de diferença). Como quase toda OS de e-mail fica parada em "Nova OS" (87 das 94 do backlog), a duplicata parecia a original "voltando".
- **Correção**: antes de abrir OS nova, se a mensagem é claramente **resposta** (`isLikelyThreadReply`: prefixo Re:/Fw:/Enc: ou headers de thread) e o match por thread falhou, casa por **remetente + assunto normalizado numa OS ainda aberta** (`resolveTicketIdByRequesterSubject`) — a resposta entra na OS original. Nos dois caminhos inbound (Gmail sync + webhook SendGrid). Conservador: só OS não Encerrada/Cancelada, só respostas; sem match, nunca descarta a mensagem.

## 2026-07-02

### 📄 Exportar relatório gerencial em PDF (`5d7f73f`)
- Botão **Exportar PDF** no painel de Indicadores (perspectiva gerencial) → gera um relatório gerencial pronto pra "Salvar como PDF", pra enviar a quem **não tem acesso ao sistema**, com os **números à mostra** (o print da tela não mostrava bem). Traz cards de resumo, tabelas e gráficos, cabeçalho Grupo Christus + período/sede/região. Reaproveita os filtros atuais (mês, sede, região). Só números **gerenciais** (OS por status/sede/etapa, aging, tempo por etapa, tendência, prioridade, equipe) — sem financeiro, mais seguro pra envio externo. `print-color-adjust: exact` garante as cores na impressão.
- **Evoluído para PDF gerado no servidor** (`8ff7b9f`): o "salvar como PDF" do navegador saía fraco (cortava em 1 página, barra do navegador, design pobre). Trocado por um PDF **gerado no servidor com pdfkit** (sem Chromium) — impecável pra diretoria, **1 clique, download direto, sem barra do navegador**. Layout premium: masthead serifado (Times) + "Confidencial", leitura rápida (resumo), banda de KPIs, gráficos de barra com rótulos de valor, tabelas zebradas, rodapé paginado. Endpoint `POST /api/report-pdf` (autenticado); o fluxo de impressão do cliente foi removido.

### 🎛️ Cabeçalho + filtros do painel redesenhados (`44e3437`)
- O cabeçalho do Indicadores era desajeitado (título à esquerda + controles amontoados à direita num card com vazio no meio). Virou um **cabeçalho executivo** (kicker "Grupo Christus · Indicadores" + título + Exportar PDF como ação primária dourada) com uma **barra de filtros unificada** (perspectiva, período, região, sede). Novo **seletor de período** num popover: atalhos (este mês / 6 / 12 meses) + **calendário de meses** (grade Jan–Dez) + **intervalo de datas personalizado** (de–até) — substitui o toggle de rótulos confusos e os selects soltos.

## 2026-06-29

### 🗂️ Nova tela "Gestão de OS" (`96d109a`)
- Tela pros gestores (Admin + Gestor): tabela resumo de **todas** as OS com filtros por sede, macroserviço, serviço, equipe e status + busca. Clicar numa linha abre a OS na Caixa de Entrada. Nova entrada na sidebar (ícone de tabela). Categoria de serviço fica como filtro futuro.

### 🎨 Ajustes de UI da Caixa de Entrada
- **Bolinha de status na lista** (`5e63f05`): vermelha para Nova OS (precisa triagem), verde para as em andamento (antes só aparecia em Nova OS, cor âmbar).
- **Composer responsivo** (`f633ea6`): em telas/janelas baixas o chat (`max-h-[55vh]` + scroll) deixa de cobrir a conversa.
- **Composer compacto + auto-grow** (`9ee091f`): textarea começa em 1 linha (44px, era 80 fixo) e cresce conforme digita (volta ao limpar/enviar/trocar de OS); chrome (abas/etapa/toolbar/rodapé) apertado. Composer vazio ~262→216px, conversa ganha espaço.
- **Minimizar/Maximizar o chat** (`e37202b`): botões no topo do composer — minimizar colapsa pra só a barra de abas (~54px, conversa ocupa quase tudo); maximizar dá um textarea grande (40vh) pra escrever à vontade.

### 📐 Densidade pra laptops 14-15" (UI grande demais em telas menores)
- **Causa-raiz** (`1fe310b`): um bloco em `index.css` inflava **todas** as fontes pequenas com `!important` (`text-sm` 14→15.2px, `text-xs` 12→13.9px, `text-[11px]` 11→13.1px, `text-[10px]` 10→12.2px) em **todas** as telas — daí o "tudo grande". A inflação foi escopada só pra **monitores ≥1536px**; laptops e telas menores voltam aos tamanhos naturais em todas as views. Boundary alinhado ao `2xl`.
- **Inbox densificado** (`d0acd0d`): título da OS 26→21px, item da lista com fonte/padding menores, thread mais apertada. Regra "compacto no laptop, `2xl:` restaura no monitor".
- **Item da lista reestruturado** (`1fe310b`): OS-id movido pro início do assunto; linha de status só badge + prioridade → item 196→**129px**, ~5 OS visíveis (era 3).
- **Tabela "Gestão de OS"** (`e72fada`): apertada (padding/assunto/headers) pra caber sem scroll horizontal em 1280-1366.

## 2026-06-25

### ✉️ Sede da OS no assunto do e-mail
- `buildConversationSubject` passa a injetar o nome da sede entre o código e o
  assunto: `OS-XXXX - <Sede> - <Assunto>` (ex.: `OS-0126 - Aldeota - Troca de piso`).
  O nome vem de `variables.ticket.sede` (já resolvido por `getTicketSiteLabel` no
  front), sem lookup novo no backend. Sede vazia mantém o formato antigo e
  assuntos já-prefixados são idempotentes (sem duplo prefixo). Vale para OS novas —
  threads existentes mantêm o assunto salvo (sem split no Gmail) e a resposta ao
  solicitante que abriu por e-mail continua usando o assunto original dele.

### 📎 Anexos da abertura no e-mail de criação da OS
- As fotos enviadas no formulário de abertura (`ticket.attachments`) passam a
  acompanhar os **dois** e-mails de `EMAIL-NOVA-OS` (`notifyTicketCreated`): a
  confirmação ao solicitante e a cópia interna de triagem ao gestor. Antes nenhum
  dos dois levava anexo. Mesmo caminho já usado no e-mail à diretoria
  (`normalizeEmailAttachments` → `resolveOutboundAttachments` no backend).

### 🔧 Refactor: editor de Cotações (thermo-nuclear / "elefante")
- Estado, handlers e derivados do modal de Cotações saíram do god-component
  `InboxView` para o hook `useQuoteEditor` + `QuoteEditorContext` (5 mordidas:
  estado → handlers → derivados → Context). **Prop-drilling morto:** QuoteItemRow
  15→7 props, QuoteItemsSection 14→4, QuoteComparisonPanel/QuoteConsolidatedView →0,
  QuoteVendorFields 6→4. InboxView 6036→4401 linhas. Behavior-identical, cada mordida
  verificada no emulador (editar item, totais, unidade custom, consolidado).

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
- **Modal de Cotações — decomposição incremental** (`2982cff`, `6d88e8b`, `2eaf1d6`, `0050d53`, `8f3fc83`):
  quebra do "elefante" das cotações (~1.064 linhas) em sub-seções. **5 de 6 feitas:**
  `AdditiveReferenceCard` (card "Orçamento base escolhido", ~42 linhas, 3 props),
  `QuoteHistoryMetrics` (grid Média/Faixa/Último/Referências, ~22 linhas, 1 prop),
  `QuoteHistoryPanel` (painel "Base histórica" inteiro — termos, métricas, fornecedor
  preferencial, casos similares e referência por item, ~116 linhas, 3 props; absorveu o
  QuoteHistoryMetrics), `QuoteComparisonPanel` (tabela "Comparativo consolidado" lado a
  lado por fornecedor, ~110 linhas, 3 props) e `ProposalHeaderForm` (form "Cabeçalho da
  proposta", 6 campos, ~73 linhas, controlado por value+onChange/onCurrencyBlur). Novo
  `inbox/types.ts` (tipos compartilhados): `QuoteDraft` (17 usos viram import),
  `QuoteComparisonSection`, `ProposalHeaderDraft` — todos saíram da InboxView.
  Todos behavior-identical, verificados por tsc+build (+diff).
- **Editor de cotações — núcleo stateful COMPLETO** (`c48e3fc`, `33b7c92`, `98755c0`, `f38afd0`, `f8b3a95`):
  a parte mais complexa do elefante, decomposta em 6 componentes — `QuoteEditorTabs`
  (abas A/B/C/Consolidado), `QuoteItemRow` (linha de item — a mais complexa, 15 props),
  `QuoteEditorCardHeader` (Fornecedor + Remover slot + Anexar PDF), `QuoteVendorFields`
  (Fornecedor/Valor + resumos + dica de preferencial), `QuoteConsolidatedView` (modo
  consolidado read-only) e `QuoteItemsSection` (botões +1/+5, sugeridos, lista de itens).
  O card de fornecedor virou um assembler limpo (header + vendor-fields + items-section).
  Novo `inbox/quotes.ts` (fonte única, sem drift): `CUSTOM_QUOTE_UNIT_VALUE`,
  `QUOTE_SECTION_OPTIONS`, `normalizeQuoteSection`, `normalizeUnitAbbreviation`,
  `buildQuoteItemUnitKey`. **Verificado E2E no emulador** (reload completo, código fresco):
  adicionar cotação/+5 itens, editar (total recalcula, ex.: 7×30 = R$ 210,00), remover o
  item certo, modo consolidado + Editar round-trip — zero erros de runtime.
- 🐘 **ELEFANTE DOMADO.** O modal de Cotações (~1.064 linhas, ~70 deps) agora são **11
  componentes** em `src/views/inbox/` + 2 módulos compartilhados (`types.ts`, `quotes.ts`).
  **InboxView: 6036 (god-component original) → 4835 linhas** (−1201, ~20% menor). Toda
  extração behavior-identical (cópia verbatim do JSX + props zero-rename, script de
  balanceamento de `<div>`), verificada por tsc + build, e o editor stateful no emulador.
- **OS selecionada destacada na lista** (`de32df8`): a OS ativa usava `bg-roman-bg`
  (≈ branco da lista) — destaque mais fraco que uma "Nova OS", então "todas ficavam
  iguais". Hierarquia invertida: selecionada agora tem fundo `roman-primary/20` + anel
  interno + assunto em negrito + barra dourada cheia; new/waiting com barra/fundo leves.
  Sem shift de layout (4px de borda esquerda reservados em todos). Verificado no emulador.
- **Fotos do "Mensagem aos Interessados" viram anexo real**: antes a foto anexada à
  mensagem ia só como link no corpo; agora segue também como anexo de arquivo do e-mail
  (`attachments: normalizeEmailAttachments(...)` no `notifyTicketPublicReply`), espelhando
  o fluxo da Diretoria. O link no corpo continua como fallback.
- **E-mail à Diretoria entra na conversa da OS** (`42ab00b`): antes a Diretoria tinha
  thread exclusiva (`${ticketId}__director`) e o diretor caçava contexto. Agora o e-mail
  ao diretor **herda o threading da thread da OS** (assunto/rootMessageId/References/
  gmailThreadId do doc `${ticketId}`) quando a thread do diretor ainda não tem contexto —
  caindo na mesma conversa. **CC/participantes seguem isolados** no doc `__director` (não
  herda `ccEmail`/`participants` da OS; o envio ao solicitante lê só o doc da OS) → cópias
  das duas audiências nunca se misturam. ⚠️ Envio é externo (Gmail) — **exige 1 teste
  real** pós-deploy; revert isolado se preciso.
- **OS duplicada por ordem de processamento — corrigido** (`c0ba339`): se as mensagens
  de uma thread chegavam fora de ordem (resposta antes do original — ex.: original com
  fotos atrasou), duplicava a OS (a resposta criava uma, e o original — raiz, sem
  In-Reply-To — não casava e criava outra). Caso real: OS-0125 (resposta) + OS-0126
  (original) na mesma conversa. Novo `resolveTicketIdByGmailThread` casa pelo `threadId`
  do Gmail (toda a conversa compartilha) como fallback após References — **independente de
  ordem**. ⚠️ Inbound externo — validar com thread real; mesclar a duplicata já criada;
  concorrência real (2 msgs em paralelo) fica como hardening futuro.
- **E-mail do solicitante + interessados visíveis no Painel da OS** (`de1a0c1`): o painel
  mostrava só o nome do solicitante (e os e-mails da Diretoria), nunca o e-mail de quem
  abriu a OS. Adicionados os campos "E-mail" (`requesterEmail`) e "Interessados (CC)"
  (`requesterCcEmails`) no resumo — quem administra agora vê pra quem o sistema responde.
  Verificado no emulador.

### 🎨 Marca
- Logo/selo Serv3 em login, landing, sidebar, rastreio + favicon (`18d33d0`,
  `99a3d3c`, `e6dde8d`).

---

### ⚠️ Ações pendentes (dependem do usuário)
- **Rotacionar a service account do Firebase** (chave usada em backfill foi
  exposta no chat — comprometida).
- **Deploy das `storage.rules`**: `npx firebase-tools login && npx firebase-tools
  deploy --only storage --project os-christus` (para o fix do Diretor-anexo valer).
