# Backlog técnico do Serv3

Última revisão: 27/07/2026

Este documento concentra os achados da auditoria técnica, as correções já
implementadas e o trabalho que ainda precisa ser concluído. Os IDs são estáveis e
devem ser usados em commits, PRs e registros de implantação.

## Legenda

- `Concluído`: implementado e validado.
- `Em andamento`: existe implementação local ainda não consolidada.
- `Pendente`: ainda não implementado.
- `P1`: risco alto ou impacto operacional direto.
- `P2`: confiabilidade, qualidade ou manutenção relevante.
- `P3`: melhoria desejável sem risco imediato.

## Visão geral

| ID | Prioridade | Estado | Frente |
| --- | --- | --- | --- |
| RBAC-01 | P1 | Concluído | Separar edição e aprovação de compras |
| TX-01 | P1 | Concluído | Aprovações e financeiro transacionais |
| NOTIF-01 | P1 | Concluído | Estado de notificação por usuário |
| RES-01 | P2 | Concluído | Preservar tickets quando a atualização falhar |
| SEC-API-01 | P1 | Concluído | Limites multipart, rate limit antecipado e erros sanitizados |
| FIN-LEGACY-01 | P1 | Em andamento | Impedir pagamento duplicado no fallback de medições legadas |
| SEC-ATT-01 | P1 | Em andamento | Download autenticado de anexos |
| REL-OUTBOX-01 | P1 | Em andamento | Processamento automático da outbox de e-mail |
| DATA-HIST-01 | P1 | Em andamento | Migrar histórico da OS para subcoleção |
| PERF-HIST-01 | P2 | Em andamento | Carregar histórico somente para a OS ativa |
| PERF-NOTIF-01 | P2 | Em andamento | Paginar notificações e definir retenção |
| QA-E2E-01 | P2 | Em andamento | Integração e E2E confiáveis no CI com emuladores |
| ARCH-01 | P2 | Pendente | Dividir arquivos grandes por domínio |
| UX-FORM-01 | P2 | Em andamento | Simplificar formulário e corrigir alvos de toque |
| SEC-FILE-02 | P3 | Em andamento | Validar assinatura real e analisar arquivos |

## Correções concluídas

### Frente de 27/07/2026 — integridade e escala

**FIN-LEGACY-01**

- O comando de liquidação não aceita mais `status` e valores financeiros de um
  pagamento legado construído pelo navegador.
- O servidor reconstrói o lançamento a partir da medição persistida.
- O ID precisa ser determinístico (`measurement-payment-{measurementId}`).
- Um segundo pagamento vinculado à mesma medição é rejeitado.
- Se a base já contiver duplicidade para uma medição, a liquidação é bloqueada
  até o saneamento dos documentos.
- Foram adicionados testes unitários para reconstrução segura, ID arbitrário e
  duplicidade. A frente passa a `Concluído` após a execução da suíte.

**PERF-HIST-01**

- A listagem geral e os polls delta não consultam mais `historyEntries` para cada
  OS retornada.
- O documento principal continua trazendo a janela recente.
- Ao abrir uma OS na Inbox, o frontend carrega a primeira página da subcoleção.
- Páginas já carregadas são preservadas durante o refresh automático.
- Falta validar com volume representativo e teste de integração do contrato de
  listagem para mover a frente a `Concluído`.

**PERF-NOTIF-01**

- A API passou a devolver páginas de até 100 notificações; a interface usa 50.
- O estado individual é lido somente para os IDs da página, em vez de carregar
  toda a subcoleção do usuário.
- A central ganhou a ação `Carregar anteriores`.
- `Marcar todas como lidas` percorre as páginas no servidor.
- Ainda falta configurar retenção/TTL e validar a paginação no emulador.

### RBAC-01 — Segregação de funções em compras

**Resultado**

- Admin/Gestor editam orçamento, contrato e informações operacionais.
- Admin/Diretor aprovam ou rejeitam.
- O comando de aprovação não aceita o objeto financeiro inteiro enviado pelo
  navegador.
- O servidor registra quem submeteu, quem aprovou e os valores congelados no
  momento da decisão.

**Arquivos centrais**

- `api/_lib/procurementAccess.js`
- `api/_lib/approvalCommands.js`
- `api/approvals.js`
- `src/services/approvalApi.ts`

### TX-01 — Comandos transacionais e outbox

**Resultado**

- Aprovação, medição e pagamento são gravados por comandos no servidor.
- Alterações relacionadas são aplicadas em transação.
- E-mails financeiros são registrados em uma outbox idempotente.
- Falhas de envio não desfazem a operação financeira já confirmada.

**Limite conhecido**

- O reenvio ainda depende da interface aberta. A automação está registrada em
  `REL-OUTBOX-01`.

### NOTIF-01 — Leitura e dispensa por usuário

**Resultado**

- O conteúdo da notificação continua compartilhado.
- Leitura e dispensa ficam em
  `users/{userId}/notificationStates/{notificationId}`.
- Dispensar um aviso não o remove para os demais usuários.
- O sino da navegação consome a API, exibe contador e abre a OS relacionada.
- Notificações demonstrativas não são mais criadas em produção.

### RES-01 — Falha de atualização sem perda visual

**Resultado**

- Uma falha temporária ao consultar tickets mantém os dados já carregados.
- A interface mostra um aviso com ação de nova tentativa.

### SEC-API-01 — Endurecimento de upload e erros

**Resultado**

- O rate limit da abertura pública é aplicado antes do parsing multipart.
- O parser limita arquivos, tamanho individual, tamanho total, campos e partes.
- O formulário de ticket aceita no máximo 10 anexos, 10 MB por arquivo e 25 MB
  somados.
- Exceções inesperadas retornam mensagem genérica; detalhes ficam somente no log
  do servidor.
- Erros operacionais explícitos (`HttpError`) continuam retornando mensagens
  úteis ao usuário.

**Critérios validados**

- Multipart válido continua sendo processado.
- Arquivo e requisição acima do limite retornam HTTP 413.
- Exceção inesperada não expõe sua mensagem na resposta.

## Trabalho pendente

### SEC-ATT-01 — Download autenticado de anexos

**Problema**

Hoje ainda existem URLs permanentes de Storage e tokens-capacidade determinísticos.
Quem obtiver um link pode continuar acessando o arquivo sem que o Serv3 revalide
papel, região, sede ou vínculo com a OS. As regras do Storage também não conseguem
aplicar todo o escopo territorial no caminho atual.

O código anterior possuía apenas um helper baseado em token-capacidade sem
expiração e não tinha endpoint autenticado ativo.

**Implementado nesta frente**

- Criado `GET /api/attachments` com autenticação Firebase.
- O endpoint valida papel, território, acesso à OS e referência do arquivo antes
  do streaming.
- Storage e Drive usam resposta privada, sem cache e com `nosniff`.
- Inbox, Diretoria, Financeiro e visualizador global resolvem anexos pela API.
- Exclusão de anexos também passa pela API e é limitada a Admin/Gestor.
- Uploads autenticados de mensagens, cotações, contratos, medições, pagamentos e
  encerramento também passam por `POST /api/attachments`; o servidor valida
  papel, território, vínculo com a OS, caminho permitido e assinatura do arquivo.
- Uploads novos não chamam mais `getDownloadURL` nem geram signed URL até 2035.
- APIs de tickets e procurement ocultam URL legada quando existe `path`.
- Mensagens de e-mail listam o nome do anexo, sem republicar o link permanente.
- `storage.rules` foi preparado para bloquear leitura direta pelo SDK.
- Criada migração administrativa paginada com ensaio obrigatório antes da
  aplicação. Ela cobre ticket, histórico completo, cotações, contratos,
  pagamentos e medições.
- A migração remove `url`, `attachmentUrl` e `signedFileUrl` somente quando há
  `path` protegido equivalente; URLs sem caminho seguro são preservadas e
  relatadas.
- Objetos com `firebaseStorageDownloadTokens` são identificados no ensaio e têm
  o token revogado na aplicação real.
- Caminhos fora do namespace da própria OS são bloqueados pelo migrador e entram
  no relatório como inconsistência; a rotina não toca nesses objetos.
- O proxy passou a procurar anexos antigos também em `historyEntries`, pois eles
  podem estar fora da janela de 50 entradas do documento principal.

**Ainda necessário para concluir**

1. Implantar primeiro API e frontend atualizados.
2. Fazer smoke test de imagem, PDF, cotação, contrato, medição e pagamento.
3. Implantar `storage.rules` junto da API e frontend atualizados; as regras
   passam a bloquear leitura e escrita direta pelo SDK.
4. Executar todos os lotes do ensaio da migração de anexos em produção.
5. Revisar as URLs relatadas como `sem path seguro` e criar/migrar o objeto antes
   de removê-las.
6. Executar todos os lotes da aplicação real e conferir URLs removidas, tokens
   revogados, objetos ausentes e falhas.
7. Tratar signed URLs antigas de longa duração. Elas ignoram Storage Rules; para
   revogação integral é necessário migrar o objeto para outro caminho ou rotacionar
   com cuidado a chave da service account que assinou as URLs.
8. Medir latência/custo em galerias grandes e, se necessário, criar autorização
   em lote para reduzir leituras.

**Implementação recomendada**

1. Concluir a migração e revogação dos links antigos.
2. Adicionar log operacional agregado sem gerar um documento de auditoria por
   imagem carregada.
3. Adicionar teste de integração com dois usuários de territórios diferentes.

**Critérios de aceite**

- Usuário sem acesso à OS recebe 403 mesmo conhecendo o caminho do arquivo.
- O app não recebe nem persiste novo link permanente.
- Admin/Gestor/Diretor preservam apenas os acessos previstos para cada OS.
- Imagens, PDFs, contratos, cotações, medições e mensagens continuam abrindo.
- Links antigos são removidos ou revogados após a migração.

**Risco de implantação**

Alto. A migração precisa aceitar anexos antigos durante uma janela de transição
para evitar quebrar documentos já cadastrados.

### REL-OUTBOX-01 — Worker automático da outbox

**Problema**

E-mails pendentes ou com falha só são reenviados quando a tela financeira tenta
processá-los. Uma operação concluída fora dessa tela pode deixar comunicação
pendente por tempo indefinido.

**Implementado nesta frente**

- Criada rota `POST /api/email/outbox-worker`, restrita a Admin ou
  `CRON_SECRET`.
- O worker processa lotes de até oito itens e cada envio adquire lease
  transacional própria.
- Itens `pending`, falhas cujo backoff venceu e leases interrompidas são
  recuperados automaticamente.
- A política usa seis tentativas e espera progressiva de 1 minuto a 4 horas.
- Falha definitiva vira `dead-letter`, aparece na saúde de e-mail e gera
  notificação para Admin/Gestor.
- O Financeiro continua permitindo uma tentativa manual após `dead-letter`.
- Criado workflow `.github/workflows/email-outbox.yml` para execução a cada
  cinco minutos.

**Ainda necessário para concluir**

1. Criar no GitHub Environment `Production` o secret
   `OUTBOX_URL=https://serv3.vercel.app/api/email/outbox-worker`.
2. Confirmar que `CRON_SECRET` no GitHub é idêntico ao da Vercel.
3. Implantar e executar manualmente o workflow `Email Outbox`.
4. Validar no Gmail uma entrega automática sem a tela Financeiro aberta.
5. Acompanhar o painel Saúde de E-mail durante uma falha simulada e sua
   recuperação.

**Critérios de aceite**

- E-mail pendente é enviado sem depender de navegador aberto.
- Execuções concorrentes não duplicam mensagens.
- Lease vencida é recuperada automaticamente.
- Falha definitiva gera alerta operacional e mantém trilha de auditoria.

### DATA-HIST-01 — Histórico em subcoleção

**Problema**

O histórico completo ainda fica em `tickets/{ticketId}.history[]`. OS com muitas
mensagens e anexos podem atingir o limite de 1 MiB por documento do Firestore,
impedindo novas atualizações justamente nos tickets mais longos.

**Implementado nesta primeira etapa**

- Criada a estrutura `tickets/{ticketId}/historyEntries/{entryId}` com ID
  determinístico, portanto segura contra retries e duplicações.
- Criação de OS, mensagens inbound/públicas, transições de status, decisões da
  Diretoria e comandos financeiros passaram a espelhar novas entradas.
- Criado endpoint administrativo `POST /api/ticket-history-backfill` para copiar
  lotes do array legado, usando cursor e execução idempotente.
- Exclusão de OS agora remove também a nova subcoleção.
- Inbox e tracking passam a ler a subcoleção somente quando a OS estiver marcada
  como migrada; as demais continuam usando o array legado.
- Criada rota autenticada de paginação de timeline com cursor opaco e validação
  territorial. A Inbox recebe inicialmente as 50 entradas mais recentes e pode
  carregar páginas anteriores sob demanda, sem perder páginas já abertas durante
  o refresh automático.
- O array atual ainda é preservado durante a janela de migração; uma falha no
  espelho não impede a criação da OS.

**Próxima etapa obrigatória**

1. Executar o backfill em lotes até `nextCursor` retornar `null`.
2. Comparar, por OS, contagem/IDs do array legado e da subcoleção.
3. Validar em produção a leitura paginada da Inbox e definir se o tracking
   público também precisa de paginação ou se a leitura completa continuará
   adequada para a sua audiência.
4. Passar a manter no documento principal apenas um resumo das últimas ações.
5. Só então remover o array legado após backup e auditoria de divergências.

**Implementação recomendada**

1. Definir `tickets/{ticketId}/history/{entryId}` como fonte do histórico.
2. Criar API paginada e ordenada por data.
3. Gravar novas entradas na subcoleção e manter, temporariamente, dupla escrita.
4. Executar backfill idempotente do array atual.
5. Conferir contagem/hash por ticket antes de remover o array legado.
6. Atualizar Inbox, tracking público e e-mails para leitura paginada.
7. Manter no documento principal apenas resumo da última atividade.

**Critérios de aceite**

- Nenhuma entrada existente é perdida ou duplicada.
- Histórico carrega por páginas e preserva ordem.
- Nova mensagem não aumenta indefinidamente o documento principal.
- Tracking público continua exibindo somente entradas públicas.

**Dependência**

Planejar junto de `SEC-ATT-01`, pois entradas de histórico também possuem anexos.

### QA-E2E-01 — E2E no CI

**Situação atual**

O CI executa TypeScript, ESLint, Vitest, integração com Auth/Firestore Emulator,
uma suíte Playwright determinística e build. Os fluxos críticos possuem fixtures
próprias; a suíte antiga baseada em dados manuais permanece apenas como referência
fora do CI.

**Implementado nesta frente**

- O workflow instala Java 21 e sobe Auth + Firestore Emulator de forma isolada.
- Um executor aguarda o adaptador local da API ficar disponível antes de aplicar
  o seed e iniciar os testes, sem depender de pausas fixas.
- O seed determinístico cria Admin, Diretor, Gestor, Usuário territorial, regiões,
  sedes, equipes e tickets de teste.
- O seed também cria um Usuário vinculado somente à sede PE e tickets em outras
  sedes da mesma região, reproduzindo a regressão territorial já observada.
- Entraram no CI os cenários de corte e backfill de histórico, escopo de leitura
  de anexos por papel, migração de links legados e paginação de notificações.
- A listagem de OS é verificada para garantir que devolva somente a janela
  embutida, sem hidratar uma subcoleção por ticket.
- A central de notificações é verificada com mais de duas páginas, cursor
  inválido, ausência de duplicidade e marcação integral como lida.
- A migração de anexos é validada em dry-run e aplicação real, incluindo
  revogação de tokens, documentos em `historyEntries`, URL sem caminho seguro e
  caminho fora do namespace da OS.
- O Playwright reutiliza os mesmos emuladores e o mesmo adaptador da API.
- A suíte de navegador cobre login Admin, navegação principal, notificações,
  ausência de rolagem horizontal em 390 px e isolamento do Usuário da sede PE.
- O formulário público é enviado de verdade no emulador em 390 px, validando
  foco no primeiro erro, campos essenciais e classificação interna opcional.
- Diretor e Gestor usam contas distintas no E2E do ciclo crítico.
- Aprovação da solução valida transição, ator e snapshot de auditoria.
- Aprovação do orçamento valida cotação vencedora, rejeição das demais, contrato
  canônico e congelamento dos valores submetidos pelo Gestor.
- Pagamento final passa pela API transacional, valida valores, ator, destinatários,
  garantia e encerramento da OS. Somente a entrega externa do e-mail é simulada.
- As fixtures são reaplicadas antes de cada cenário, permitindo retry sem depender
  do estado deixado pela tentativa anterior.
- Falhas preservam relatório HTML, trace, screenshot e vídeo por 14 dias no
  GitHub Actions.

**Implementação recomendada**

1. Validar duas execuções consecutivas do workflow antes de concluir o item.
2. Adicionar aprovação de contrato com upload protegido em fixture própria.
3. Cobrir reprovações e concorrência/idempotência no navegador; os comandos já
   possuem cobertura unitária e transacional.

**Critérios de aceite**

- E2E roda em todo pull request sem acessar produção.
- Duas execuções consecutivas produzem o mesmo resultado.
- Falhas disponibilizam artefatos para diagnóstico.

### ARCH-01 — Decomposição dos arquivos grandes

**Situação atual**

- `src/views/InboxView.tsx`: aproximadamente 4.500 linhas.
- `src/views/FinanceView.tsx`: aproximadamente 2.600 linhas.
- `api/mail.js`: aproximadamente 2.800 linhas.

**Implementação recomendada**

1. Extrair hooks de carregamento e comandos de cada domínio.
2. Mover modais e painéis autocontidos para componentes próprios.
3. Separar parsing inbound, envio outbound, Gmail sync e templates de `mail.js`.
4. Manter regras de negócio em módulos puros com testes.
5. Fazer extrações pequenas, sem refatoração visual simultânea.

**Critérios de aceite**

- Views passam a coordenar componentes, sem conter toda a regra de negócio.
- Cada módulo tem responsabilidade explícita e testes focados.
- Nenhuma extração altera payloads ou comportamento da OS.

### UX-FORM-01 — Formulário público e acessibilidade

**Problema**

O fluxo principal foi simplificado, mas ainda precisa de validação visual ampla
em dispositivos e tecnologias assistivas.

**Implementado nesta frente**

- Tipo de manutenção, macroserviço e serviço deixaram o fluxo principal e ficam
  recolhidos em `Classificação opcional`.
- O formulário direciona o foco para o primeiro campo inválido e associa erros
  aos respectivos controles com `aria-invalid`/`aria-describedby`.
- Voltar, ações de sucesso, campos e remoção de anexo possuem pelo menos 44 px.
- A seleção de imagens valida formatos, máximo de 10 arquivos, 10 MB por imagem
  e 25 MB no total antes de chamar a API; GIF é recusado.
- Imagens podem ser removidas individualmente e a área de upload aceita
  arrastar/soltar de verdade.
- O Playwright abre uma OS real no emulador em 390 px sem preencher a taxonomia
  interna e verifica ausência de rolagem horizontal na página.

**Ainda necessário para concluir**

1. Validar visualmente em 360 px, tablet e notebook.
2. Fazer uma passagem manual com leitor de tela.
3. Confirmar duas execuções consecutivas do cenário no GitHub Actions.

**Critérios de aceite**

- Solicitante consegue abrir uma OS sem conhecer a taxonomia interna.
- Controles essenciais possuem pelo menos 44 x 44 px.
- Nenhum conteúdo ou ação fica inacessível por viewport ou zoom.

### SEC-FILE-02 — Validação real do conteúdo do arquivo

**Problema**

O backend possui allowlist de MIME e bloqueia formatos ativos como SVG, mas o MIME
de upload ainda pode ser declarado pelo cliente. Isso não comprova que o conteúdo
real corresponde ao formato informado.

**Implementado nesta frente**

- Uploads do formulário, anexos inbound e uploads autenticados do painel agora
  validam assinatura/conteúdo antes de persistir no Storage.
- JPEG, PNG, GIF, WebP, BMP, TIFF, HEIC/HEIF, PDF e Office legado têm assinatura
  binária conferida.
- DOCX, XLSX e PPTX precisam ser pacotes Office Open XML compatíveis com a família
  declarada; ZIP genérico não é aceito.
- Texto e CSV só são aceitos quando forem UTF-8 sem bytes nulos.
- Arquivo binário disfarçado de imagem/PDF/documento é recusado no upload público
  ou ignorado no inbound para não interromper a leitura do e-mail.

**Ainda necessário para concluir**

1. Avaliar malware scanning para documentos corporativos.
2. Executar a nova suíte unitária de assinaturas quando o runner de testes estiver
   disponível.

**Implementação recomendada**

1. Validar assinatura binária de imagens, PDF e documentos Office.
2. Rejeitar divergência entre conteúdo, extensão e MIME.
3. Avaliar antivírus/Cloud Storage malware scanning para documentos corporativos.
4. Servir documentos com `nosniff` e disposição adequada.

**Critérios de aceite**

- Arquivo executável renomeado como imagem/PDF é rejeitado.
- Formatos permitidos continuam funcionando no formulário e no painel.

## Ordem recomendada

1. Validar `FIN-LEGACY-01`, `PERF-HIST-01` e `PERF-NOTIF-01` no emulador.
2. `SEC-ATT-01` — concluir implantação e migração dos links legados.
3. `REL-OUTBOX-01` — garantir comunicação automática.
4. `DATA-HIST-01` — executar e conferir o backfill em produção.
5. `QA-E2E-01` — proteger as migrações seguintes.
6. `ARCH-01` — reduzir custo de manutenção.
7. `UX-FORM-01` — simplificar a experiência do solicitante.
8. `SEC-FILE-02` — defesa adicional para conteúdo de arquivos.

## Regra de atualização

Ao concluir um item:

1. alterar o estado na tabela;
2. registrar arquivos e decisões relevantes;
3. marcar os critérios de aceite validados;
4. informar testes executados;
5. referenciar o ID do item no commit ou PR.
