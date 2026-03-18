# Fluxo Operacional OS-CHRISTUS (Raia por Papel)

Este documento descreve o ciclo completo da OS, da abertura ao encerramento, indicando quem atua em cada ponto.

## Papéis (raias)
- Solicitante: abre chamado e acompanha andamento sem acesso a valores financeiros.
- Gestor: conduz triagem, solução, orçamento, execução e atualização financeira no sistema.
- Diretoria: aprova decisões de orçamento e aditivos quando houver ação de diretoria.
- Financeiro: recebe comunicações de pagamento e opera fora do sistema quando aplicável.
- Sistema: calcula valores, registra histórico/auditoria e dispara comunicações.

## Fluxo ponta a ponta

1. Abertura da OS
- Quem entra: Solicitante ou equipe interna.
- O que faz: informa assunto, local, descrição e anexos.
- Sistema: cria ticket em `Nova OS`, registra histórico e dispara e-mail do fluxo do solicitante.

2. Triagem
- Quem entra: Gestor.
- O que faz: classifica prioridade (`Trivial`, `Alta`, `Urgente`), tipo e território (região/sede), define encaminhamento técnico.
- Sistema: atualiza status e trilha de auditoria.

3. Solução técnica
- Quem entra: Gestor / responsável técnico.
- O que faz: define solução e necessidade de orçamento/terceiro.
- Sistema: move para fluxo de orçamento.

4. Orçamento inicial
- Quem entra: Gestor.
- O que faz: cadastra até 3 cotações, separando `Mão de Obra` e `Material`, com `Custo Unitário x Quantidade`.
- Sistema: calcula total de mão de obra, total de material e total da obra; exibe quantidade de cotações dinamicamente (2 ou 3).

5. Aprovação de orçamento
- Quem entra: Diretoria (quando houver ação de diretoria).
- O que faz: aprova/reprova orçamento.
- Sistema: valor aprovado vira `Previsto Inicial` (base de 100%).

6. Aditivos durante a obra
- Quem entra: Gestor cria, Diretoria aprova.
- O que faz: registra aditivo com motivo e cotação (1 cotação por aditivo).
- Sistema: soma os aditivos aprovados no realizado (`Realizado = Previsto Inicial + Aditivos`).
- Observação: podem existir múltiplos aditivos ao longo da OS.

7. Execução
- Quem entra: Gestor + equipe/terceiros.
- O que faz: executa serviço e atualiza andamento.
- Sistema: mantém timeline, anexos e histórico.

8. Financeiro e parcelas
- Quem entra: Gestor.
- O que faz: informa valor bruto da parcela, impostos e anexos da parcela.
- Sistema:
  - calcula líquido da parcela automaticamente;
  - acumula valor bruto pago;
  - calcula `% conclusão financeira = bruto acumulado / previsto inicial`;
  - percentual pode passar de 100%.

9. Comunicação por e-mail (3 fluxos)
- Solicitante: começa na abertura; acompanha andamento sem dados de orçamento/pagamento.
- Diretoria: começa quando há ação de diretoria (decisão), evitando spam.
- Financeiro: recebe apenas quando há ação de pagamento.
- Sistema: destinatários configuráveis em Configurações.

10. Link do solicitante
- Mostra: status e progresso da obra.
- Não mostra: valores e detalhes financeiros.
- Aceite: pode haver etapa de aceite no ponto configurado do fluxo.

11. Encerramento
- Quem entra: Gestor.
- O que faz: conclui OS após execução/aceite e pendências tratadas.
- Sistema: fecha chamado, registra checklist final e mantém auditoria.

## Diagrama (Mermaid)

```mermaid
flowchart LR
  subgraph S[Solicitante]
    S1["Abre OS (assunto, local, descrição, anexos)"]
    S2["Acompanha andamento no link público"]
    S3["(Opcional) Aceita entrega"]
  end

  subgraph G[Gestor]
    G1["Triagem: prioridade, tipo, território"]
    G2["Define solução técnica"]
    G3["Lança orçamento inicial (até 3 cotações)"]
    G4["Executa obra e atualiza andamento"]
    G5["Lança parcelas: bruto + impostos + anexos"]
    G6["Fecha OS"]
    G7["Registra aditivo com motivo"]
  end

  subgraph D[Diretoria]
    D1["Aprova orçamento inicial"]
    D2["Aprova aditivos"]
  end

  subgraph F[Financeiro]
    F1["Recebe comunicação de pagamento"]
    F2["Trata pagamento fora do sistema"]
  end

  subgraph X[Sistema]
    X1["Cria ticket e histórico"]
    X2["Calcula totais de orçamento"]
    X3["Define previsto inicial (100%)"]
    X4["Calcula realizado = previsto + aditivos"]
    X5["Calcula líquido e % conclusão financeira"]
    X6["Dispara e-mails por fluxo"]
    X7["Registra auditoria e encerramento"]
  end

  S1 --> X1 --> G1 --> G2 --> G3 --> X2 --> D1 --> X3 --> G4
  G4 --> G7 --> D2 --> X4 --> G4
  G4 --> G5 --> X5 --> F1 --> F2
  X5 --> S2 --> S3 --> G6 --> X7
  X1 --> X6
  X3 --> X6
  X4 --> X6
  X5 --> X6
```

