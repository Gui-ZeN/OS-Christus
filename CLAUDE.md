# CLAUDE.md — Serv3 / OS Christus

Instruções específicas deste repositório. Somam-se ao `CLAUDE.md` da pasta-guarda-chuva
(`Meus Projetos/CLAUDE.md`) e ao global.

## 🗺️ Consulte o grafo antes de sair lendo

Este repositório tem um grafo de conhecimento em `graphify-out/` (gitignorado, gerado
localmente pelo [graphify](https://github.com/Graphify-Labs/graphify), sem LLM e sem
chave de API). São 2.915 nós e 7.507 arestas cobrindo os 400 arquivos de código, os 11
workflows, o README, o CHANGELOG e os manuais.

**Use para descobrir ONDE olhar:**

```bash
graphify query "como o aviso de chuva escolhe os destinatarios"
graphify affected "etapaDe"     # raio de impacto de uma mudança
graphify explain "resolvedAttentionOf"
graphify god-nodes              # os hubs arquiteturais
graphify path "InboxView" "gmailSend"
```

**⚠️ E LEIA O ARQUIVO DEPOIS.** O grafo tem os símbolos e as relações; não tem o corpo
das funções. Medido em 04/09/2026: `graph.json` é **maior** que o código-fonte (3,9 MB
contra 3,4 MB) e contém **zero** das 79.186 linhas — cada nó são onze campos de
metadado no lugar de ~29 linhas que não estão lá.

Isso não é limitação de configuração, é o desenho. E significa que uma classe inteira
de resposta não está no grafo. O exemplo que custou meia hora: a página pública de
acompanhamento parecia ler `ticket.history`, mas `hydrateTicketHistoryForRead` troca o
array embutido pelo da subcoleção quando `historySubcollectionReady` é true — e essa
propriedade **não é nó**, é uma condição dentro de um `if`. O grafo apontava o bairro
certo e não tinha a resposta.

Regra prática: **o grafo decide o que ler; a leitura decide o que fazer.**

Neste projeto o raciocínio mora nos comentários `⚠️` dos arquivos, que também não estão
no grafo. Eles explicam POR QUE uma decisão foi tomada, e costumam ser o que impede de
refazer um erro já pago.

## Mantendo o grafo honesto

Um grafo desatualizado que responde com confiança é pior que nenhum grafo.

- O gancho `post-commit` reextrai sozinho a cada commit (instalado em `.git/hooks/`,
  sem custo de LLM). Se você clonou o repo agora, rode `graphify hook install`.
- Depois de refatoração grande: `graphify update .`
- Para conferir se está fresco: o `GRAPH_REPORT.md` declara de qual commit ele nasceu.

⚠️ **Não versione `graphify-out/`** — são ~4,7 MB de artefato gerado, e ele já está no
`.gitignore`. Pelo mesmo motivo, não aceite a linha `graphify-out/graph.json
merge=graphify` no `.gitattributes`: o `graphify hook install` tenta escrevê-la, e ela
é uma regra de merge para um caminho que nunca entra no repositório. (Na primeira
instalação ela ainda corrompeu o comentário do topo do arquivo, que contém um CR
literal.) O merge driver em `.git/config` é local e inofensivo.

## Deriva conhecida entre documentação e sistema

O grafo marcou como **AMBIGUOUS** a relação entre a reforma "de ETAPAS para
ACOMPANHAMENTO" e o `docs/guia-treinamento-operacional-serv3.md`: o guia documenta
**13 etapas** e o sistema foi reorganizado em torno de **seis** (`api/_lib/etapas.js`).
Se você for mexer em qualquer um dos dois, confira o outro.
