# Guia de Treinamento Operacional - OS Christus

Atualizado em: 15/04/2026

## 1) O que o sistema faz

O OS Christus controla o ciclo completo da Ordem de Serviço, da abertura ao encerramento, com registro de histórico, anexos, aprovações, execução, financeiro e acompanhamento do solicitante.

Objetivos principais:

- centralizar chamados de manutenção em um fluxo único;
- separar comunicação pública, comunicação da diretoria e comunicação do financeiro;
- controlar orçamento inicial, aditivos, contrato e execução;
- manter trilha de auditoria de tudo o que foi feito;
- permitir acompanhamento seguro pelo link do solicitante sem expor dados internos.

## 2) Perfis de acesso

### Admin

- opera a Inbox;
- faz triagem;
- envia parecer técnico;
- monta orçamento e aditivos;
- anexa contrato;
- inicia execução;
- atualiza andamento;
- opera financeiro dentro do sistema;
- pode reabrir OS encerrada ou cancelada.

### Diretor

- atua no painel da Diretoria;
- aprova ou reprova solução técnica;
- aprova ou reprova orçamento inicial;
- aprova ou reprova aditivos;
- aprova ou reprova contrato;
- recebe e responde mensagens da trilha interna da diretoria.

### Usuario

- não opera o fluxo técnico;
- vê apenas os tickets da sua estrutura;
- acompanha abertos e histórico no painel simplificado.

### Solicitante

- abre chamado por formulário ou e-mail;
- acompanha pelo link seguro;
- recebe apenas mensagens públicas;
- valida a entrega quando a obra for concluída.

## 3) Como abrir uma OS

### 3.1 Abertura por formulário

Tela: `Landing > Abrir Chamado`

Campos básicos:

- nome;
- e-mail;
- assunto;
- descrição;
- setor;
- região;
- sede.

Resultado:

- a OS nasce em `Nova OS`;
- o solicitante recebe e-mail de confirmação de abertura;
- o histórico já registra a abertura.

### 3.2 Abertura por e-mail

Formato do assunto:

- `[SIGLA_DA_SEDE] - Assunto do chamado`
- exemplo: `[PQL3] - Vazamento no bloco A`

Resultado:

- o sistema cria a OS automaticamente;
- associa a sede pela sigla;
- mantém a thread de e-mail vinculada ao ticket;
- respostas seguintes entram no histórico do ticket.

## 4) Fluxo completo da OS

### Etapa 1 - Nova OS

- responsável: Admin;
- ação principal: triagem inicial.

O Admin define:

- prioridade: `Trivial`, `Alta` ou `Urgente`;
- região e sede;
- macroserviço e serviço;
- responsável técnico;
- terceiros, quando necessário.

Saídas possíveis:

- `Aguardando Parecer Técnico`;
- `Cancelada`.

### Etapa 2 - Aguardando Parecer Técnico

- responsável: Admin ou gestão técnica;
- ação principal: consolidar solução técnica.

Nessa etapa o time pode:

- escrever nota interna;
- anexar documentos técnicos;
- enviar `Mensagem ao Solicitante`;
- enviar `Mensagem à Diretoria`, quando necessário.

Saídas possíveis:

- `Aguardando Aprovação da Solução`;
- `Cancelada`.

### Etapa 3 - Aguardando Aprovação da Solução

- responsável: Diretoria;
- ação principal: aprovar ou reprovar o parecer técnico.

Se aprovar:

- a OS segue para `Aguardando Orçamento`.

Se reprovar:

- a OS é cancelada ou devolvida conforme a decisão operacional adotada na análise.

### Etapa 4 - Aguardando Orçamento

- responsável: Admin;
- ação principal: montar a rodada de orçamento inicial.

Regras:

- mínimo de 2 cotações;
- máximo de 3 cotações;
- composição por item;
- separação entre Material e Mão de obra;
- total calculado por item e por cotação;
- base histórica de apoio para comparação.

Cada cotação pode ter:

- fornecedor;
- PDF da proposta;
- itens com tipo, descrição, quantidade, unidade e custo unitário;
- resumo automático de material, mão de obra e total da obra.

Saída:

- `Aguardando Aprovação do Orçamento`.

### Etapa 5 - Aguardando Aprovação do Orçamento

- responsável: Diretoria;
- ação principal: aprovar ou reprovar a rodada.

Se aprovar:

- o valor aprovado vira o `Previsto Inicial`;
- a OS vai para `Aguardando Anexo de Contrato`.

Se reprovar:

- a OS não é cancelada;
- a rodada recusada fica como histórico;
- o sistema libera uma nova rodada de orçamento;
- o gestor volta para `Aguardando Orçamento`.

### Etapa 6 - Aguardando Anexo de Contrato

- responsável: Admin;
- ação principal: anexar o contrato aprovado.

O contrato anexado:

- fica registrado no ticket;
- é enviado para a Diretoria como anexo real no e-mail;
- passa a compor o dossiê da OS.

Saída:

- `Aguardando aprovação do contrato`.

### Etapa 7 - Aguardando aprovação do contrato

- responsável: Diretoria;
- ação principal: aprovar ou reprovar o contrato.

Se aprovar:

- a OS segue para `Aguardando Ações Preliminares`.

Se reprovar:

- a OS não é cancelada;
- volta para `Aguardando Anexo de Contrato`;
- o gestor reenviará o contrato ajustado.

### Etapa 8 - Aguardando Ações Preliminares

- responsável: Admin;
- ação principal: preparar a mobilização da obra.

Itens típicos:

- equipe;
- compra inicial;
- materiais;
- acesso ao local;
- observações preliminares;
- planilha de medição da obra.

Saída:

- `Em andamento`.

### Etapa 9 - Em andamento

- responsável: Admin;
- ação principal: atualizar execução e registrar lançamentos.

Nessa etapa o sistema faz duas coisas em paralelo:

- controla avanço físico e histórico da obra;
- gera lançamentos financeiros conforme os valores informados no andamento.

O andamento:

- usa valor bruto lançado;
- calcula a porcentagem automaticamente sobre o `Previsto Inicial`;
- pode ultrapassar 100% quando existem aditivos.

### Etapa 10 - Aguardando aprovação da manutenção

- responsável: Solicitante;
- ação principal: validar a entrega pelo link de acompanhamento.

Se aprovar:

- a OS vai para `Aguardando pagamento`.

Se reprovar:

- a OS volta para `Em andamento`.

### Etapa 11 - Aguardando pagamento

- responsável: Financeiro, operado pelo Admin ou Diretor no sistema;
- ação principal: concluir os lançamentos e fechar a etapa financeira.

O último lançamento só pode ser concluído quando:

- o solicitante já validou a entrega;
- o checklist final foi preenchido;
- datas de início e término foram informadas;
- garantia foi definida;
- aprovações técnicas finais foram marcadas.

### Etapa 12 - Encerrada

- resultado final da OS;
- garantia passa a ser acompanhada;
- histórico e anexos permanecem registrados.

### Etapa 13 - Cancelada

- usada quando a demanda não seguirá;
- pode ser reaberta para `Nova OS`.

## 5) Como usar orçamento e aditivos

### Orçamento inicial

- representa a base da obra;
- o valor aprovado vira o `Previsto Inicial`;
- é a referência para o cálculo principal de andamento.

### Rodadas de orçamento

- se a diretoria reprovar, uma nova rodada é aberta;
- a rodada anterior continua no histórico;
- a nova rodada começa limpa para preenchimento;
- o e-mail da diretoria informa a rodada correta.

### Aditivos

- cada rodada de aditivo aceita apenas 1 cotação;
- o motivo do aditivo é obrigatório;
- vários aditivos podem existir na mesma obra;
- cada aditivo aprovado aumenta o `Realizado`.

### Valores principais

- `Previsto Inicial`: valor aprovado no orçamento inicial;
- `Realizado`: previsto inicial + aditivos aprovados;
- `Valor Pago`: soma do que já foi quitado no financeiro.

## 6) Como funciona a execução e o financeiro

### Atualização de andamento

O gestor informa:

- valor bruto do lançamento;
- origem do valor, quando aplicável;
- observações;
- anexos de relatório.

O sistema:

- calcula a nova porcentagem da obra;
- registra histórico;
- cria um lançamento para o financeiro.

### Lançamentos financeiros

Cada lançamento pode ter:

- valor bruto;
- imposto;
- valor líquido calculado;
- anexos do lançamento;
- e-mail ao financeiro.

Arquivos aceitos no fluxo financeiro:

- Excel;
- CSV;
- PDF;
- Word;
- imagens;
- outros anexos operacionais usados na prestação.

### E-mail do financeiro

Quando o gestor dispara o e-mail de pagamento, o sistema envia:

- resumo da OS;
- identificação do lançamento;
- valor bruto;
- imposto;
- valor líquido;
- planilha de medição, quando houver;
- anexos do lançamento como anexos reais do e-mail.

## 7) Como funciona a comunicação por e-mail

O sistema trabalha com três trilhas independentes.

### Solicitante

Recebe:

- confirmação de abertura;
- aceite ou cancelamento;
- solução técnica autorizada para seguir;
- avanço público da obra;
- execução concluída;
- pedido de validação;
- encerramento;
- mensagens públicas.

Não recebe:

- valores de orçamento;
- contrato;
- pagamentos;
- notas internas.

### Diretoria

Recebe somente quando existe ação de decisão:

- aprovação da solução;
- aprovação do orçamento;
- aprovação de aditivo;
- aprovação do contrato;
- mensagens da trilha interna da diretoria.

Os e-mails da Diretoria:

- informam a rodada correta;
- mostram cada cotação em bloco separado;
- enviam anexo técnico quando a etapa é solução;
- enviam contrato anexado quando a etapa é contrato.

### Financeiro

Recebe somente quando há ação financeira:

- entrada na etapa financeira;
- disparo manual de lançamento de pagamento.

## 8) Como funciona a conversa no ticket

### Inbox

Na Inbox existem três trilhas de comunicação:

- `Nota Interna`;
- `Mensagem ao Solicitante`;
- `Mensagem à Diretoria`.

### Regras

- `Nota Interna` é só uso interno;
- `Mensagem ao Solicitante` entra no tracking e no e-mail público;
- `Mensagem à Diretoria` fica restrita a Admin e Diretor.

### Respostas por e-mail

- respostas do solicitante entram na conversa pública;
- respostas da diretoria entram na trilha interna da diretoria;
- respostas financeiras podem ser registradas na inbox quando responderem no thread correto.

## 9) O que o solicitante vê no link

O link do solicitante mostra:

- identificação da OS;
- status atual;
- linha do tempo pública;
- mensagens públicas;
- barra de andamento quando a obra está em execução;
- ação de validação quando a obra é concluída.

O link não mostra:

- notas internas;
- orçamento;
- contrato;
- financeiro;
- dados sensíveis de operação.

## 10) Passo a passo rápido por perfil

### Admin

1. Abrir a Inbox.
2. Triar a `Nova OS`.
3. Definir macroserviço, serviço e responsável técnico.
4. Consolidar o parecer técnico.
5. Enviar para Diretoria.
6. Montar a rodada de orçamento.
7. Enviar orçamento para Diretoria.
8. Anexar contrato após aprovação.
9. Iniciar execução.
10. Atualizar andamento da obra.
11. Disparar e-mails de pagamento no Financeiro.
12. Finalizar checklist e garantia no fechamento.

### Diretor

1. Abrir o painel da Diretoria.
2. Revisar solução técnica.
3. Aprovar ou reprovar orçamento.
4. Aprovar ou reprovar contrato.
5. Aprovar ou reprovar aditivos.
6. Usar `Mensagem à Diretoria` quando precisar devolver orientação ao gestor.

### Usuario

1. Acessar o Home.
2. Visualizar tickets da própria estrutura.
3. Consultar abertos e histórico.
4. Acompanhar status sem entrar nos módulos operacionais.

### Solicitante

1. Abrir chamado por formulário ou e-mail.
2. Acompanhar pelo link enviado.
3. Ler apenas mensagens públicas.
4. Validar a entrega quando solicitado.

## 11) Regras de negócio importantes

- orçamento interno não vai para o solicitante;
- contrato interno não vai para o solicitante;
- pagamento interno não vai para o solicitante;
- orçamento recusado abre nova rodada, não cancela a OS;
- contrato recusado volta para anexo de contrato, não cancela a OS;
- aditivo é aprovado em rodada própria;
- o valor da obra pode passar de 100% por causa dos aditivos;
- o último lançamento financeiro não fecha antes da validação final.

## 12) Checklist de implantação

1. Configurar a caixa de e-mail do sistema.
2. Validar inbound e outbound do provedor.
3. Revisar templates de e-mail.
4. Configurar destinatários padrão da Diretoria.
5. Configurar destinatários padrão do Financeiro.
6. Cadastrar regiões e sedes.
7. Cadastrar macroserviços, serviços e materiais.
8. Cadastrar terceiros e tags compartilhadas.
9. Criar usuários com escopo correto.
10. Testar abertura por formulário.
11. Testar abertura por e-mail.
12. Testar tracking do solicitante.

## 13) Dúvidas frequentes

- Posso abrir OS por e-mail?
  - Sim. Use o assunto com a sigla da sede.

- O solicitante vê orçamento?
  - Não. O tracking é público apenas para a execução.

- Se a diretoria reprovar o orçamento, perco a rodada anterior?
  - Não. A rodada fica no histórico e uma nova rodada é liberada.

- Se a diretoria reprovar o contrato, a OS é cancelada?
  - Não. Ela volta para `Aguardando Anexo de Contrato`.

- O financeiro usa o sistema?
  - O disparo é feito pelo sistema, mas o processo operacional pode ocorrer fora dele.

- O usuário comum vê todos os módulos?
  - Não. Ele vê apenas o painel simplificado da sua estrutura.
