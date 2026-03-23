# Matriz de Fluxo e Status (OS Christus)

## Perfis
- `Admin`: opera Inbox, Diretoria, Financeiro e ajustes.
- `Diretor`: decide em Diretoria e Financeiro.
- `Usuario`: leitura do painel da sua estrutura.

## Tela Inbox (Admin)
- `Nova OS` -> `Aguardando Parecer Técnico` | `Cancelada`
- `Aguardando Parecer Técnico` -> `Aguardando Aprovação da Solução` | `Cancelada`
- `Aguardando Aprovação da Solução` -> `Aguardando Orçamento` | `Cancelada`
- `Aguardando Orçamento` -> `Aguardando Aprovação do Orçamento` | `Cancelada`
- `Aguardando Aprovação do Orçamento` -> `Aguardando Anexo de Contrato` | `Cancelada`
- `Aguardando Anexo de Contrato` -> `Aguardando aprovação do contrato` | `Cancelada`
- `Aguardando aprovação do contrato` -> `Aguardando Ações Preliminares` | `Cancelada`
- `Aguardando Ações Preliminares` -> `Em andamento` | `Cancelada`
- `Em andamento` -> `Aguardando aprovação da manutenção` | `Cancelada`
- `Aguardando aprovação da manutenção` -> `Aguardando pagamento` | `Em andamento` | `Cancelada`
- `Aguardando pagamento` -> `Encerrada` | `Cancelada`
- `Encerrada` -> `Em andamento` (reabertura)
- `Cancelada` -> `Nova OS` (reabertura)

## Tela Diretoria (Admin/Diretor)
- `Aguardando Aprovação da Solução` -> `Aguardando Orçamento` | `Cancelada`
- `Aguardando Aprovação do Orçamento` -> `Aguardando Anexo de Contrato` | `Cancelada`
- `Aguardando aprovação do contrato` -> `Aguardando Ações Preliminares` | `Cancelada`

## Tela Financeiro (Admin/Diretor)
- `Aguardando pagamento` -> `Encerrada`

## Tracking (Solicitante)
- `Aguardando aprovação da manutenção` -> `Aguardando pagamento` (aprova) | `Em andamento` (reprova)

