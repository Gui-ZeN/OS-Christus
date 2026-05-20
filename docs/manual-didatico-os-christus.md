# Manual Didatico do Sistema OS Christus

Atualizado em: 20/05/2026

Este manual explica, de forma simples, o que e o sistema, quem usa, como cada tela funciona e como uma OS caminha desde a abertura ate o encerramento.

## 1. O que e o sistema

O OS Christus e o sistema usado para controlar solicitacoes de manutencao, obras, servicos e acompanhamentos internos.

Ele centraliza:

- abertura de OS por formulario ou e-mail;
- caixa de entrada das novas solicitacoes;
- triagem e classificacao da OS;
- conversa com solicitante e interessados;
- parecer tecnico;
- aprovacoes da Diretoria;
- orcamentos, contratos e aditivos;
- execucao da obra;
- validacao do solicitante;
- financeiro;
- historico completo da OS;
- alertas de local recorrente.

Na pratica, ele substitui o controle solto por e-mail, planilha e conversa paralela. Tudo que acontece na OS fica registrado em um unico lugar.

## 2. Ideia principal do funcionamento

Cada OS tem um status. O status mostra em que etapa ela esta.

Exemplos:

- `Nova OS`: acabou de chegar e ainda precisa ser analisada.
- `Aguardando Parecer Tecnico`: a OS foi aceita e precisa de solucao tecnica.
- `Aguardando Aprovacao da Solucao`: a Diretoria precisa aprovar o parecer.
- `Aguardando Orcamento`: a equipe precisa montar as cotacoes.
- `Aguardando Aprovacao do Orcamento`: a Diretoria precisa escolher/aprovar.
- `Aguardando Anexo do Contrato`: o contrato precisa ser anexado.
- `Aguardando Aprovacao do Contrato`: a Diretoria precisa aprovar o contrato.
- `Aguardando Acoes Preliminares`: preparar compras, equipe, acesso e cronograma.
- `Em andamento`: obra em execucao.
- `Aguardando aprovacao da manutencao`: solicitante precisa validar entrega.
- `Aguardando pagamento`: etapa financeira.
- `Encerrada`: OS finalizada.
- `Cancelada`: OS recusada/cancelada.

O sistema usa esses status para mostrar os botoes certos, enviar e-mails certos e liberar a proxima etapa.

## 3. Quem usa o sistema

### Admin

Perfil com acesso completo.

Pode:

- gerenciar usuarios;
- gerenciar OS;
- aceitar, cancelar, reabrir e excluir OS;
- alterar datas;
- editar catalogos, sedes, servicos, materiais e terceiros;
- ver configuracoes sensiveis;
- acessar auditoria, integracoes e saude do sistema.

### Gestor

Perfil operacional parecido com Admin, mas sem acesso sensivel.

Pode:

- gerenciar OS;
- aceitar OS;
- alterar status operacional;
- enviar mensagens;
- montar orcamentos;
- criar aditivos;
- anexar contrato;
- atualizar execucao;
- gerenciar macroservicos, servicos, materiais, terceiros e tags.

Nao pode:

- gerenciar usuarios;
- excluir OS;
- acessar auditoria;
- acessar integracoes;
- acessar saude do sistema;
- alterar templates sensiveis de e-mail;
- alterar configuracoes sensiveis.

### Diretor

Perfil de aprovacao.

Pode:

- acessar o painel da Diretoria;
- aprovar ou reprovar parecer tecnico;
- aprovar ou reprovar orcamento;
- aprovar ou reprovar aditivo;
- aprovar ou reprovar contrato;
- ver apenas as OS em que foi marcado como Diretor envolvido.

### Usuario

Perfil restrito.

Normalmente ve apenas as OS vinculadas ao seu escopo de regiao/sede, sem poder operar o fluxo completo.

### Solicitante

Pessoa que abriu a OS.

Pode:

- abrir chamado por formulario ou e-mail;
- acompanhar a OS por link publico seguro;
- enviar mensagem pelo link;
- validar entrega quando a obra for concluida.

Nao ve dados internos, financeiros ou aprovacoes da Diretoria.

## 4. Formas de abrir uma OS

### 4.1. Abertura pelo formulario

O solicitante acessa o formulario e informa:

- nome;
- e-mail;
- e-mails de interessados;
- assunto;
- descricao;
- sede;
- setor;
- tipo de solicitacao;
- anexos, quando necessario.

No campo de interessados, os e-mails devem ser separados por virgula, ponto e virgula ou espaco.

Exemplo:

```text
pessoa1@empresa.com.br, pessoa2@empresa.com.br; pessoa3@empresa.com.br
```

Esses interessados podem receber mensagens publicas da OS quando a equipe incluir ou manter eles em copia.

### 4.2. Abertura por e-mail

O solicitante tambem pode enviar e-mail para a caixa do sistema.

Quando o sistema identifica o e-mail, ele cria uma OS automaticamente.

O sistema tenta guardar:

- solicitante;
- e-mail do solicitante;
- pessoas em copia;
- assunto;
- corpo do e-mail;
- anexos;
- identificadores da conversa original.

Isso e importante porque as respostas ao e-mail original podem ser registradas dentro da OS, em vez de criar outra OS.

## 5. Caixa de Entrada

A Caixa de Entrada e a tela principal de trabalho do Admin e do Gestor.

Nela aparecem:

- lista de OS;
- filtros por status, sede e outros criterios;
- painel da conversa;
- painel lateral da OS;
- botoes de acao conforme o status.

### 5.1. Lista da Inbox

Cada item mostra:

- solicitante;
- assunto;
- numero da OS;
- status;
- prioridade;
- data.

Quando o sistema identifica que ja houve outra OS na mesma `Sede + Setor`, ele mostra um indicador de `Local recorrente`.

Esse alerta serve para indicar possivel problema cronico, manutencao mal resolvida ou demanda repetida.

### 5.2. Painel da OS

No painel lateral ficam os dados de contexto:

- solicitante;
- e-mail;
- interessados;
- setor;
- regiao;
- sede;
- status;
- Diretoria envolvida;
- classificacao interna;
- execucao;
- orcamentos;
- recorrencia de local.

Quando existe recorrencia por `Sede + Setor`, o sistema mostra:

- quantas OS abertas existem nesse local;
- quantas OS encerradas/concluidas existem nesse local;
- ultima ocorrencia;
- IDs das OS relacionadas para abrir e comparar.

## 6. Triagem da OS

Quando a OS chega como `Nova OS`, o Admin ou Gestor precisa fazer a triagem.

Na triagem, deve preencher:

- responsavel tecnico;
- prioridade;
- setor correto;
- local exato;
- macroservico;
- servico;
- terceiros, se for equipe externa;
- Diretores envolvidos.

Quando a OS vem por e-mail, o setor pode chegar como `Email`. Nesse caso, o Gestor deve corrigir o campo `Setor` e preencher o `Local exato` antes de aceitar ou salvar a OS.

Importante: para aceitar uma OS, e obrigatorio selecionar pelo menos um Diretor envolvido.

Depois disso, o sistema muda a OS para `Aguardando Parecer Tecnico`.

Se a OS nao deve seguir, o usuario pode cancelar ou recusar. Nesse caso, o sistema abre um modal para informar o motivo. O motivo fica registrado no historico.

## 7. Diretores envolvidos

Ao aceitar uma OS, o sistema pede quais Diretores participam daquela OS.

Somente os Diretores selecionados:

- recebem e-mails daquela OS;
- veem a OS no painel de aprovacoes;
- conseguem atuar nas aprovacoes dela.

Admin e Gestor continuam vendo a OS normalmente na operacao.

Esse recurso evita que todos os Diretores recebam tudo, quando apenas alguns precisam participar.

## 8. Conversas e mensagens

O sistema separa a comunicacao em tres linhas principais.

### 8.1. Mensagem aos Interessados

Usada para falar com o solicitante e as pessoas interessadas.

Funciona como resposta na corrente original do solicitante, quando a OS veio de e-mail.

O solicitante entra como destinatario principal. Os interessados entram em copia, conforme o usuario selecionar.

O sistema tambem tenta facilitar mostrando os e-mails que ja estavam em copia, para o usuario remover ou adicionar pessoas.

### 8.2. Nota interna

Usada para registrar informacoes internas.

Nao vai para o solicitante.

Boa para:

- observacoes tecnicas;
- decisoes internas;
- detalhes de atendimento;
- registros que nao devem aparecer no link publico.

### 8.3. Mensagem a Diretoria

Usada para comunicar a Diretoria dentro da OS.

A mensagem segue para os Diretores envolvidos, respeitando a selecao feita no aceite da OS.

## 9. Link do Solicitante

Cada OS tem um link publico seguro para acompanhamento.

O solicitante pode ver:

- numero da OS;
- assunto;
- status publico;
- andamento da execucao;
- linha do tempo publica;
- mensagens publicas;
- campo para enviar mensagem;
- botao de validacao da entrega, quando liberado.

O solicitante nao ve:

- orcamentos;
- valores;
- contratos;
- conversas internas;
- aprovacoes da Diretoria;
- dados financeiros.

### 9.1. Chat pelo link

O solicitante pode escrever uma mensagem diretamente pelo link, sem login.

Quando ele envia:

- a mensagem entra no historico publico da OS;
- a equipe interna recebe alerta;
- Admin/Gestor conseguem responder pela Inbox.

Nesta primeira versao, esse chat aceita apenas texto. Nao aceita anexos.

## 10. Parecer tecnico

Depois da triagem, a OS entra em `Aguardando Parecer Tecnico`.

Nessa etapa, a equipe define:

- o que precisa ser feito;
- se precisa de orcamento;
- se envolve terceiro;
- se precisa de material;
- anexos tecnicos, se houver.

Quando o parecer e enviado para a Diretoria, a OS vai para `Aguardando Aprovacao da Solucao`.

A Diretoria pode:

- aprovar;
- reprovar;
- cancelar, informando motivo.

Se aprovar, a OS segue para orcamento.

## 11. Orcamentos

Na etapa de orcamento, o Gestor monta a rodada inicial de cotacoes.

Regras:

- minimo de 2 cotacoes;
- maximo de 5 cotacoes;
- cada cotacao pode ter fornecedor, PDF e itens;
- o sistema calcula os totais;
- existe modo consolidado para comparar os fornecedores.

Cada item pode ter:

- secao;
- descricao;
- material;
- unidade;
- quantidade;
- custo unitario;
- total.

O sistema separa os valores de material e mao de obra para facilitar a comparacao.

Depois de montar a rodada, o Gestor envia para Diretoria.

## 12. Aprovacao do orcamento

No painel da Diretoria, o Diretor envolvido ve a OS que esta aguardando aprovacao.

Ele pode:

- comparar cotacoes;
- ver resumo;
- baixar comparativo;
- aprovar uma cotacao;
- reprovar a rodada.

Se aprovar:

- a cotacao escolhida vira a referencia da OS;
- a OS segue para contrato.

Se reprovar:

- a OS volta para nova rodada de orcamento;
- o motivo fica registrado.

## 13. Contrato

Depois do orcamento aprovado, o Gestor anexa o contrato.

O sistema envia o contrato para a Diretoria envolvida.

A Diretoria pode:

- aprovar o contrato;
- reprovar o contrato com motivo.

Se aprovar, a OS segue para preparacao da execucao.

Se reprovar, o Gestor precisa anexar novo contrato.

## 14. Acoes preliminares

Antes de iniciar a obra, o sistema pode pedir um checklist de preparacao.

Exemplos:

- compra de material solicitada;
- equipe confirmada;
- local preparado;
- cronograma definido;
- alinhamento com direcao/supervisao;
- acesso liberado.

Quando tudo estiver pronto, a execucao pode ser iniciada.

## 15. Execucao da obra

Quando a OS esta `Em andamento`, o painel de execucao fica ativo.

Nessa etapa, o Gestor pode:

- atualizar andamento da obra;
- registrar percentual;
- anexar medicao;
- registrar observacoes;
- criar aditivo;
- concluir execucao e enviar para validacao do solicitante.

## 16. Aditivos

Aditivo e uma alteracao de valor/escopo durante a execucao.

O botao `Criar Aditivo` aparece de forma clara no painel de execucao quando a OS esta `Em andamento`.

Fluxo do aditivo:

1. Gestor informa o motivo.
2. Gestor registra 1 cotacao.
3. Sistema envia para Diretoria.
4. Diretoria aprova ou reprova.
5. Se aprovado, o valor entra no realizado da OS.

O aditivo nao muda a regra do orcamento inicial. O orcamento inicial aceita de 2 a 5 cotacoes. O aditivo aceita 1 cotacao.

## 17. Validacao do solicitante

Quando a equipe conclui a execucao, a OS vai para `Aguardando aprovacao da manutencao`.

O solicitante recebe ou acessa o link publico e pode confirmar a entrega.

Se confirmar:

- a OS segue para `Aguardando pagamento`;
- o fluxo financeiro pode continuar.

Se houver problema:

- a equipe pode voltar a OS para execucao;
- o historico fica registrado.

## 18. Financeiro

A etapa financeira trata lancamentos, pagamentos e encerramento final.

O sistema pode registrar:

- fornecedor;
- valor bruto;
- impostos;
- valor liquido;
- anexos;
- medicao;
- status do lancamento;
- garantia.

O financeiro recebe comunicacao separada da Diretoria e do solicitante.

## 19. Encerramento

Quando tudo estiver resolvido, a OS pode ser encerrada.

Ao encerrar, o sistema preserva:

- historico;
- mensagens;
- anexos;
- aprovacoes;
- orcamentos;
- contrato;
- aditivos;
- financeiro;
- garantia;
- auditoria.

Mesmo encerrada, a OS continua sendo considerada no indicador de local recorrente. Isso ajuda a identificar problemas repetidos no mesmo local.

## 20. Datas editaveis

Admin e Gestor podem ajustar datas operacionais quando necessario.

Isso e util porque, no inicio da operacao, muitas OS podem chegar por encaminhamento de e-mail e com datas incorretas.

Podem ser ajustadas:

- data de abertura da OS;
- datas de mensagens no historico;
- datas operacionais ligadas a execucao e encerramento, conforme a tela permitir.

## 21. Catalogos

O sistema usa catalogos para padronizar as informacoes.

Exemplos:

- regioes;
- sedes;
- macroservicos;
- servicos;
- materiais;
- terceiros;
- tags.

O Admin pode gerenciar tudo.

O Gestor pode gerenciar:

- macroservicos;
- servicos;
- materiais;
- terceiros;
- tags.

O Gestor nao altera usuarios, regioes/sedes nem configuracoes sensiveis.

## 22. Regras importantes para o dia a dia

- Sempre selecione os Diretores envolvidos ao aceitar a OS.
- Use `Mensagem aos Interessados` para falar com solicitante e copiados.
- Use nota interna para informacao que nao deve ir para fora.
- Cancele ou recuse sempre informando motivo.
- Confira o alerta de local recorrente antes de decidir a solucao.
- Em orcamento inicial, use de 2 a 5 cotacoes.
- Em aditivo, use 1 cotacao.
- Quando a obra estiver em execucao, use `Criar Aditivo` se aparecer valor ou escopo novo.
- Use o link do solicitante para acompanhamento e validacao da entrega.

## 23. Fluxo resumido

```text
Nova OS
  -> Triagem
  -> Aguardando Parecer Tecnico
  -> Aguardando Aprovacao da Solucao
  -> Aguardando Orcamento
  -> Aguardando Aprovacao do Orcamento
  -> Aguardando Anexo do Contrato
  -> Aguardando Aprovacao do Contrato
  -> Aguardando Acoes Preliminares
  -> Em andamento
  -> Aguardando aprovacao da manutencao
  -> Aguardando pagamento
  -> Encerrada
```

Durante `Em andamento`, podem existir aditivos:

```text
Em andamento
  -> Criar Aditivo
  -> Diretoria aprova/reprova
  -> volta para Em andamento
```

## 24. Exemplo pratico

1. Solicitante envia e-mail sobre vazamento no setor X.
2. Sistema cria a OS como `Nova OS`.
3. Gestor abre a Inbox, ve que ja existem OS antigas na mesma sede e setor.
4. Gestor seleciona prioridade, equipe, servico e Diretores envolvidos.
5. Gestor aceita a OS.
6. Equipe faz parecer tecnico.
7. Diretoria envolvida aprova a solucao.
8. Gestor monta 3 cotacoes e envia para Diretoria.
9. Diretor envolvido aprova uma cotacao.
10. Gestor anexa contrato.
11. Diretoria aprova contrato.
12. Gestor inicia execucao.
13. Durante a obra aparece custo extra; Gestor cria aditivo.
14. Diretoria aprova o aditivo.
15. Gestor conclui execucao e envia para validacao.
16. Solicitante valida pelo link.
17. Financeiro trata pagamento.
18. OS e encerrada.

## 25. Boas praticas

- Escreva mensagens claras e objetivas.
- Nao coloque dados financeiros em mensagem ao solicitante.
- Use anexos sempre que eles ajudam a comprovar decisao.
- Quando recusar ou cancelar, explique o motivo.
- Confira os interessados antes de enviar mensagem publica.
- Evite criar nova OS se o assunto ja pertence a uma OS existente.
- Use o historico de local recorrente para investigar problema cronico.
- Mantenha catalogos padronizados para melhorar filtros e relatorios.
