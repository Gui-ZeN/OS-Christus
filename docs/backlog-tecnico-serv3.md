# Backlog técnico do Serv3

Última revisão: 24/07/2026

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
| SEC-ATT-01 | P1 | Em andamento | Download autenticado de anexos |
| REL-OUTBOX-01 | P1 | Em andamento | Processamento automático da outbox de e-mail |
| DATA-HIST-01 | P1 | Em andamento | Migrar histórico da OS para subcoleção |
| QA-E2E-01 | P2 | Pendente | E2E confiável no CI com emuladores |
| ARCH-01 | P2 | Pendente | Dividir arquivos grandes por domínio |
| UX-FORM-01 | P2 | Pendente | Simplificar formulário e corrigir alvos de toque |
| SEC-FILE-02 | P3 | Em andamento | Validar assinatura real e analisar arquivos |

## Correções concluídas

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

**Ainda necessário para concluir**

1. Implantar primeiro API e frontend atualizados.
2. Fazer smoke test de imagem, PDF, cotação, contrato, medição e pagamento.
3. Implantar `storage.rules` junto da API e frontend atualizados; as regras
   passam a bloquear leitura e escrita direta pelo SDK.
4. Executar migração para apagar `url`, `attachmentUrl` e `signedFileUrl` legados
   dos documentos que já possuem `path`.
5. Revogar `firebaseStorageDownloadTokens` antigos nos objetos.
6. Tratar signed URLs antigas de longa duração. Elas ignoram Storage Rules; para
   revogação integral é necessário migrar o objeto para outro caminho ou rotacionar
   com cuidado a chave da service account que assinou as URLs.
7. Medir latência/custo em galerias grandes e, se necessário, criar autorização
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

O CI executa TypeScript, ESLint, Vitest e build. Os testes Playwright existem, mas
não são executados no workflow e dependem de IDs/dados fixos.

**Implementação recomendada**

1. Subir Auth e Firestore Emulator no CI.
2. Gerar usuários e tickets por seed determinístico.
3. Remover dependência de IDs fixos de produção.
4. Executar cenários mínimos: login, escopo territorial, abertura de OS,
   aprovação, pagamento e notificação individual.
5. Salvar trace e screenshot quando houver falha.

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

O formulário ainda pede classificações que o solicitante pode não conhecer e
existem controles abaixo do alvo recomendado de 44 px para uso por toque.

**Implementação recomendada**

1. Manter para o solicitante apenas problema, descrição, sede, local e anexos.
2. Deixar macroserviço, serviço e prioridade para triagem ou sugestão opcional.
3. Aumentar área clicável de botões, checkboxes e seletores.
4. Validar teclado, foco, mensagens de erro e leitores de tela.
5. Testar em 360 px, 390 px, tablet e notebook sem rolagem horizontal.

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

1. `SEC-ATT-01` — concluir implantação e migração dos links legados.
2. `REL-OUTBOX-01` — garantir comunicação automática.
3. `DATA-HIST-01` — remover risco de crescimento do documento da OS.
4. `QA-E2E-01` — proteger as migrações seguintes.
5. `ARCH-01` — reduzir custo de manutenção.
6. `UX-FORM-01` — simplificar a experiência do solicitante.
7. `SEC-FILE-02` — defesa adicional para conteúdo de arquivos.

## Regra de atualização

Ao concluir um item:

1. alterar o estado na tabela;
2. registrar arquivos e decisões relevantes;
3. marcar os critérios de aceite validados;
4. informar testes executados;
5. referenciar o ID do item no commit ou PR.
