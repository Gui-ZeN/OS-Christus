# Guia de Treinamento Operacional — OS Christus

Atualizado em: 09/04/2026

## 1) Visão geral do sistema

O OS Christus gerencia o ciclo completo de Ordens de Serviço (OS), da abertura ao encerramento, com três trilhas de comunicação:

- Solicitante: recebe somente atualizações públicas da obra.
- Diretoria: recebe apenas quando existe ação de aprovação.
- Financeiro: recebe apenas quando existe ação de pagamento.

Perfis de acesso:

- Admin: acesso completo (Inbox, Diretoria, Financeiro, KPI, Configurações, Auditoria).
- Diretor: Home, Inbox, Painel da Diretoria, Financeiro e KPI.
- Usuario: apenas Home com painel da sua estrutura (abertos/histórico), sem módulos operacionais.

## 2) Como abrir ticket

### 2.1 Abertura via formulário público

Tela: `Landing > Abrir Chamado`

Campos obrigatórios:

- Nome
- E-mail
- Assunto
- Descrição
- Tipo
- Setor
- Região
- Sede

Comportamento:

- Status inicial: `Nova OS`
- Histórico inicial:
  - mensagem do solicitante
  - evento de sistema: solicitação registrada e aguardando triagem
- Disparo de e-mail automático ao solicitante (`EMAIL-NOVA-OS`)

### 2.2 Abertura via e-mail

Formato obrigatório do assunto para criar nova OS:

- `[SIGLA_DA_SEDE] - Assunto da solicitação`
- Exemplo: `[PQL3] - Ponta a Ponta`

Comportamento:

- Sistema cria OS automaticamente
- Identifica sede/região pela sigla
- Registra histórico: mensagem do e-mail + evento de criação automática
- Cria vínculo de thread para manter conversa no mesmo ticket

## 3) Fluxo ponta a ponta (status e responsáveis)

1. `Nova OS`
- Ator: Admin (triagem)
- Próximo: `Aguardando Parecer Técnico` ou `Cancelada`

2. `Aguardando Parecer Técnico`
- Ator: Admin/gestão técnica
- Próximo: `Aguardando Aprovação da Solução` ou `Cancelada`

3. `Aguardando Aprovação da Solução`
- Ator: Diretoria
- Próximo: `Aguardando Orçamento` ou `Cancelada`

4. `Aguardando Orçamento`
- Ator: Admin
- Ações: cotações iniciais (2 a 3), itens por Material/Mão de obra, comparativo
- Próximo: `Aguardando Aprovação do Orçamento` ou `Cancelada`

5. `Aguardando Aprovação do Orçamento`
- Ator: Diretoria
- Próximo: `Aguardando Anexo de Contrato` ou `Cancelada`

6. `Aguardando Anexo de Contrato`
- Ator: Admin
- Ações: anexa contrato PDF e envia para diretoria
- Próximo: `Aguardando aprovação do contrato` ou `Cancelada`

7. `Aguardando aprovação do contrato`
- Ator: Diretoria
- Próximo: `Aguardando Ações Preliminares` ou `Cancelada`

8. `Aguardando Ações Preliminares`
- Ator: Admin
- Ações: checklist preliminar + preparação
- Próximo: `Em andamento` ou `Cancelada`

9. `Em andamento`
- Ator: Admin
- Ações:
  - atualiza andamento por valor bruto
  - sistema calcula `% conclusão = bruto acumulado / previsto inicial`
  - pode passar de 100%
- Próximo: `Aguardando aprovação da manutenção` ou `Cancelada`

10. `Aguardando aprovação da manutenção`
- Ator: Solicitante (tracking) valida entrega
- Próximo: `Aguardando pagamento` (aprova) ou volta para `Em andamento` (reprova)

11. `Aguardando pagamento`
- Ator: Financeiro (operado pelo gestor no sistema)
- Ações:
  - confirmação de lançamento
  - envio de e-mail ao financeiro com dados completos
- Próximo: `Encerrada` (quando requisitos finais cumpridos)

12. `Encerrada`
- Pode ser reaberta para `Em andamento` por Admin

13. `Cancelada`
- Pode ser reaberta para `Nova OS` por Admin

## 4) Regras de orçamento, aditivo e execução

### 4.1 Orçamento inicial

- Até 3 cotações
- Tela dinâmica: mostra apenas quantidade usada
- Composição por item com:
  - tipo (Material / Mão de obra)
  - descrição
  - quantidade
  - unidade
  - custo unitário
  - total automático

### 4.2 Aditivos

- 1 cotação por rodada de aditivo
- Motivo do aditivo obrigatório
- Múltiplas rodadas permitidas
- Diretoria aprova cada rodada

### 4.3 Base financeira

- `Previsto inicial`: valor aprovado no orçamento inicial
- `Realizado`: previsto inicial + aditivos aprovados
- Atualização de andamento usa valor bruto lançado

## 5) Fluxo de e-mails: quem recebe e quando

## 5.1 Solicitante

Recebe:

- criação da OS
- aceite para atendimento
- solução técnica definida
- ações preliminares
- execução iniciada
- execução concluída (pedido de validação)
- OS encerrada
- OS cancelada
- mensagens públicas (`Mensagem ao Solicitante`)

Não recebe:

- detalhes de orçamento
- aprovação de contrato
- detalhes de pagamento

## 5.2 Diretoria

Recebe a partir de etapas com ação de decisão:

- `Aguardando Aprovação da Solução`
- `Aguardando Aprovação do Orçamento`
- `Aguardando aprovação do contrato`
- aditivos para aprovação
- mensagens da aba `Mensagem à Diretoria`

Destinatários:

- primeiro: e-mails configurados no template da diretoria
- fallback: usuários ativos com papel `Diretor`

## 5.3 Financeiro

Recebe quando há ação financeira:

- entrada em etapa financeira (`Aguardando pagamento`)
- confirmação de lançamento no modal de pagamento

E-mail de lançamento inclui:

- valor bruto
- imposto
- valor líquido
- link da planilha de medição (quando preenchido)
- links de anexos do lançamento

## 6) Assuntos padrão dos e-mails

Padrão principal (mantém thread por OS):

- `{{ticket.id}} - {{ticket.subject}}`

Exceções padrão:

- Diretoria (solução): `{{ticket.id}} - Avaliação da Diretoria`
- Diretoria (aprovação): `{{ticket.id}} - Aprovação da Diretoria`
- Financeiro (gatilho de status): `{{ticket.id}} - Pagamento pendente`
- Financeiro (envio por lançamento): `${ticket.id} - Pagamento - Lançamento X`

Observação importante:

- O sistema força assunto canônico por OS para manter a conversa no mesmo thread de e-mail.

## 7) Conversa por e-mail e registro no ticket

- Respostas do solicitante no mesmo thread entram no histórico público do ticket.
- Respostas de colaboradores/diretoria entram como histórico interno.
- Mensagens automáticas e auto-responses são ignoradas.
- Histórico público (tracking) filtra conteúdo sensível interno/financeiro.

## 8) Link do solicitante (tracking)

Mostra:

- status público da OS
- linha do tempo (status + mensagens públicas)
- barra de andamento durante `Em andamento`
- botão de validação da entrega quando aplicável

Não mostra:

- notas internas
- orçamento, contrato e pagamento

## 9) Operação diária recomendada (treinamento rápido)

### Admin

1. Triar `Nova OS`.
2. Conduzir parecer técnico.
3. Montar orçamento e enviar para diretoria.
4. Anexar contrato após aprovação de orçamento.
5. Iniciar execução e atualizar andamento com valores brutos.
6. Acompanhar financeiro até encerramento.

### Diretor

1. Abrir painel da diretoria pelos links de e-mail ou menu.
2. Decidir solução, orçamento e contrato.
3. Usar `Mensagem à Diretoria` para comunicação interna registrada.

### Usuario

1. Acompanhar tickets da própria estrutura no Home.
2. Consultar abertos e histórico.

## 10) Checklist de configuração inicial

1. Configurar `EMAIL_PROVIDER`, credenciais e caixa do sistema.
2. Ajustar `GMAIL_FROM_EMAIL`/`SENDGRID_FROM_EMAIL` e segredos de sync.
3. Revisar templates em `Configurações > Comunicação`.
4. Definir destinatários padrão:
- diretoria (`EMAIL-DIRETORIA-*`)
- financeiro (`EMAIL-FINANCEIRO-PAGAMENTO`)
5. Cadastrar regiões, sedes, macroserviços, serviços, materiais e terceiros.
6. Criar usuários com escopo correto (região/sede).

## 11) Dúvidas frequentes

- Por que alguns e-mails não vão para o solicitante?
  - Porque orçamento, contrato e pagamento são internos por regra.

- Como garantir thread única por OS?
  - Manter assuntos padrão por ticket e não remover o prefixo `OS-XXXX`.

- Como abrir OS por e-mail?
  - Use sempre `[SIGLA_SEDE] - assunto`.

- Resposta de diretor/financeiro entra no ticket?
  - Sim, via inbound, desde que responda no thread existente.
