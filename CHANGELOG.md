# Changelog — Serv3 / OS Christus

Registro consolidado das mudanças. O histórico granular (com o "porquê") está
nas mensagens de commit; este arquivo agrupa por tema para leitura rápida.

## 2026-08-25 (a citação entrava no corpo porque a linha quebrava no meio do cabeçalho)

Reclamação ao ler a OS-0344: "meio que os textos ficam repetindo". Estavam. O
Murilo aparecia duas vezes com a mesma pergunta — uma entrada de 125 caracteres e
outra de 1.355, a segunda arrastando a conversa inteira atrás.

A causa não era a importação. **204 das 824 mensagens que o sistema recebeu**
tinham a corrente citada colada no corpo, porque o `text/plain` quebra em ~72
colunas e parte o cabeçalho da citação em qualquer ponto:

```
Em ter., 28 de jul. de 2026 às 12:31, Silvia Helena Tobias <
infra01.pq@px.com.br> escreveu:
```

Nenhum marcador casa numa linha partida — e sem marcador o corte não acontece.
`unwrapQuoteHeaders` junta o cabeçalho antes de procurar a marca, e agora vale
para os dois lados: a ingestão (que corta) e a importação (que reconstrói).

**204 → 53.** Os 53 que sobram são mensagens que são SÓ citação: cortar deixaria
a OS sem texto, e o guard preserva de propósito. **3,35 milhões de caracteres** de
citação deixam de entrar nos corpos das OS daqui em diante.

Para o que já está gravado, `infra:inbound:repair --encolher`. O reparo nasceu
para o caso em que o parser passou a EXTRAIR mais texto, e tinha trava de tamanho
que só deixava passar reparo que cresce. O modo novo inverte a direção e a trava
junto: em vez de exigir que o núcleo velho sobreviva no novo, exige que o texto
novo seja o COMEÇO do atual — prova de que só se cortou o rabo, sem trocar nem
inventar palavra no meio. A comparação ignora acento e pontuação, porque os dois
textos passaram por acabamentos diferentes ("- *Subsolo;*" contra "- Subsolo;").

Dry-run na base: **492 entradas em 126 OS, 16.209 caracteres**. É pouco, e o
relatório explica por quê: **55 ficam bloqueadas**, e são justamente as maiores
(uma de 7.667 caracteres). Nelas o texto novo não é um corte do atual — a ingestão
da época removia linhas que o parser de hoje mantém, então os dois não estão em
relação de subtração e a trava recusa em vez de chutar.

**32 dessas 55 continuariam com citação mesmo depois de reescritas.** Afrouxar a
trava não resolveria: o que falta é o parser aprender aquele formato. O relatório
marca cada uma.

Nada foi aplicado — dry-run.

### E o resto era um desvio, não um formato

Levantei os 62 casos que ainda traziam citação no corpo esperando achar formatos
de cliente que o parser não conhece. Não havia nenhum: **39 deles entravam por um
desvio.**

`extractForwardedMessageBody` devolve tudo que vem depois do marcador SEM cortar
citação — correto quando a conversa encaminhada É o chamado, como na OS-0289, que
existe por causa do que veio dentro. Só que ele disparava com o marcador em
QUALQUER lugar do texto, e reivindicava também resposta comum que carrega um
encaminhamento velho no fundo da corrente.

O que separa os dois casos é a PROFUNDIDADE do marcador na citação:

| onde está o marcador | o que é |
| --- | --- |
| sem `>` | o remetente encaminhou direto |
| `>` | quem respondeu a ele encaminhou, e ele repassou — ainda é entregar uma conversa (OS-0289) |
| `>>>>` ou mais | história velha enterrada na corrente (OS-0344: seis meses e cinco respostas atrás) |

A medida é feita no valor ORIGINAL, antes de `stripQuoteMarkers` apagar os `>`
que são justamente a prova.

**62 → 34.** Os 34 que ficam são os que o parser reconhece e decide preservar: 23
onde o cabeçalho abre a mensagem (cortar deixaria a OS sem texto) e 11 que são
encaminhamento de verdade. E o encolher, que antes achava 16.209 caracteres para
tirar, agora acha **59.434** em 529 entradas.

Uma correção de diagnóstico: na primeira classificação eu tinha contado 25 casos
de "atribuição nua" e 26 "sem endereço". Fui ao e-mail original e nenhum dos dois
existe — era artefato de olhar a saída depois da higienização, que remove o
endereço e a linha do `escreveu:`.

De quebra, a importação foi refeita: a versão limpa que ela reconstrói é um
PREFIXO da versão inchada já gravada, e a dedupe por igualdade não casava. Agora
compara por contenção nos dois sentidos, com piso de 25 caracteres — "sim", "ok" e
"concordo" são prefixo de qualquer coisa. **1.205 mensagens em 144 OS** (eram
1.280 em 152; as 75 a menos eram redundantes).

## 2026-08-25 (a conversa começava meses antes da OS — e estava toda ali, citada)

A OS-0345 ("Gatos Loan e forro almoxarifado") nasceu em 12/08 com um corpo de
**24 caracteres**: "Bom dia, Serv 3 em cópia.". A conversa real rodava desde
**09 de abril** entre seis pessoas e já tinha passado pelo orçamento de
R$ 3.899,39 e pela autorização. Nada disso estava na OS.

Pedir a thread ao Gmail **não resolve**: aquelas mensagens nunca chegaram à caixa
do sistema, então a API não as tem. Mas elas vêm dentro da mensagem que chegou,
citadas — e a ingestão joga a citação fora de propósito (`stripQuotedReply`),
senão cada resposta repetiria o histórico inteiro dentro da OS.

Novo `api/_lib/quotedChain.js` faz o caminho inverso, e o script
`infra:corrente:importar` importa por decisão explícita — nunca no fluxo de
entrada. Dry-run por padrão; id derivado do conteúdo, então rodar duas vezes não
duplica.

**Na OS-0345**: 18 mensagens importadas, de abril a agosto. O histórico foi de
6 para 27 entradas.

**No resto da base**: aplicado. **1.280 mensagens** recuperadas em **152 OS**,
média de 8,4 por OS e até 36 numa só. A mais antiga é de **12/12/2024** — uma
conversa sobre elevador que começou antes de o sistema existir.

Seis defeitos que só apareceram rodando contra a base real:

| o que quebrava | por quê |
| --- | --- |
| as três mensagens da Caroline sumiam | a exportação quebra o endereço no meio (`christus.com. br`) e o marcador não casava |
| `sáb.` engolia a mensagem seguinte | `\w` não casa letra acentuada em JS |
| a mesma mensagem entrava duas vezes | o e-mail traz a corrente em texto **e** em HTML; numa das versões o corpo engolia a citação seguinte |
| um aviso do próprio Serv3 entraria como pessoa | as notificações que ele manda voltam citadas quando alguém responde por cima |
| 20 entradas ficaram com o cabeçalho colado no corpo | a quebra de linha cai **dentro** dos sinais de menor/maior, e o endereço começa na linha seguinte |
| 9 mensagens da Larissa Castro sumiam | o cliente dela escreve relógio de 12 horas ("às 3:36 PM") e a vírgula esperada não vinha logo após os minutos |

Os dois últimos só apareceram **depois** de aplicar: por isso o `--refazer`, que
apaga o que o script escreveu antes de reescrever. É seguro porque cada entrada
leva `importedFromQuote` — nada mais é tocado. Ao fim, **zero** entradas com
resto de citação no corpo.

O que **não** vem junto: anexos. A citação carrega texto — as fotos e as planilhas
daquela época continuam só nas caixas de quem participou. A tabela do orçamento
chega como texto corrido.

## 2026-08-17 (o e-mail era caixa dentro de caixa — e a prévia mostrava outro e-mail)

Pedido do dono: "os e-mails estão muito carregados". Estavam. Medindo o que sai:

- **Quatro níveis de caixa** — moldura → bloco "Mensagem" → cartão por valor →
  linha com borda. Quatro valores viravam quatro quadros; ninguém enxergava que
  bruto menos imposto dava o valor a pagar.
- **Três textos abaixo de 4,5:1** — os rotulinhos de 10px em maiúscula espaçada
  davam **3,85:1**.
- **A OS aparecia duas vezes** no cabeçalho, e o quadro do lado espremia o título
  a ponto de quebrá-lo em duas linhas.
- **O endereço do botão vinha repetido** logo abaixo, como "Link completo".

E o achado que ninguém tinha visto: existiam **dois desenhos**. `api/_lib/emailTemplates.js`
mandava um e-mail; `src/utils/emailTemplatePreview.ts` desenhava outro, com blocos
que o envio não tem. Quem ajustava um modelo nas Configurações aprovava uma coisa e
o destinatário recebia outra. Agora a prévia só traduz o modelo em parâmetros —
quem desenha é o módulo do envio.

A divergência escondia um defeito real: o envio juntava quebras de linha com
espaço (a prévia usava `<br/>`). O aviso de nova OS chegava como parágrafo corrido —
"Assunto: … Solicitante: … Sede: ALD Região: Fortaleza". Agora esses campos vão na
tabela de detalhes, que é o que eles são.

| | antes | depois |
|---|---|---|
| caixas aninhadas | 4 níveis | **1 moldura** |
| textos abaixo de 4,5:1 | 3 | **0** (pior caso 5,90) |
| HTML do aviso financeiro | 7.658 B | **6.125 B** |
| desenhos do mesmo e-mail | 2 | **1** |
| testes de template | 0 | **22** |

Feito o primeiro, veio a pergunta certa: "arruma só 1 e-mail?". Levantando **todos**
os que o sistema manda, dois nunca tinham passado por moldura nenhuma:

- **O aviso de chuva saía em texto puro** — chegava na fonte de máquina de escrever
  do cliente, com as duas fontes de medição em linhas indentadas por espaço. Agora
  usa a mesma moldura, e o disparo de teste se identifica numa tarja âmbar (a única
  caixa colorida que sobrou no sistema: e-mail de teste que chega numa caixa real
  sem se identificar faz alguém sair atrás de goteira que não existe).
- **A resposta da conversa** — o e-mail mais enviado — saía em `<p>` cru, sem fonte,
  tamanho ou cor, no padrão de cada cliente. Continua **sem cartão** de propósito
  (cai na thread do solicitante e tem que ler como mensagem de gente), mas ganhou a
  tipografia dos outros e o mesmo tratamento de link e @menção — antes, a foto
  colada no corpo virava texto morto justamente no e-mail mais enviado.

O encerramento financeiro em `financeClosure.ts` também monta HTML, mas é documento
de impressão, não e-mail — ficou de fora de propósito.

## 2026-08-17 (nenhum e-mail automático jamais saiu — e o sistema não sabia dizer)

A pergunta era simples: "choveu de madrugada, nossos alertas pegaram?". Não
pegaram. Puxando o fio, a `emailOutbox` tinha **213 documentos e todos em
dead-letter — zero enviados**. Nunca, nem uma vez, um e-mail automático chegou.

Pior: o motivo de cada uma das 213 falhas estava gravado como `[object Object]`.
Meses de evidência apagada na hora de escrever. A causa foi reproduzida no
emulador com controle negativo e positivo: quando o erro não é um `Error`, o
`String(error.message)` vira `[object Object]` e leva o diagnóstico junto.

Três consertos, todos no mesmo defeito de forma diferente:

| Onde | O que acontecia | Agora |
|---|---|---|
| `emailOutbox` | motivo virava `[object Object]` | `describeOutboxError` tenta 6 formatos antes de desistir |
| despacho em `api/mail.js` | HTTP 500 sem corpo lido | o corpo entra na mensagem do erro |
| `?route=rain-alert` | respondia só "Falha ao avaliar a chuva." | vem o `motivo` (ex.: `invalid_client`) |

Novidades para operar: `?route=email-diagnose` responde **por que** o e-mail não
sai sem expor segredo nenhum (só nomes de variável e booleanos), e o aviso de
chuva aceita `?para=` para testar num endereço só — travado em simulação, senão
quem tivesse o `CRON_SECRET` teria um relé aberto na identidade do Serv3.

Também de hoje: a báscula do CEMADEN (0,2 mm) passou a ser o limiar do alerta —
decisão do dono, "qualquer chuva tem que avisar"; visita desmarcada deixou de
virar falta; e no Rubronegro o vermelho de perigo virou âmbar, porque acento e
perigo eram a mesma cor e "salvar" parecia "excluir".

**Fica pendente:** nada disso está em produção — os commits não foram enviados.

## 2026-08-14 (o dourado da marca não passava em contraste — nos dois sentidos)

Consultei o gpt-5.6-sol sobre o que ainda faltava no visual e pedi contestação.
Ele acertou os três pontos que eu pude medir, incluindo um em que **eu ia mexer no
token errado**:

| Ele disse | Veredito | Medição |
|---|---|---|
| "Não conserte os textos fracos escurecendo `text-sub`" | ✅ | `#465563` no branco já dá **7,66:1** |
| "A borda `#cfcfcf` é fraca pra significar 'interativo'" | ✅ | **1,56:1**; WCAG 1.4.11 exige 3,0 |
| "A tabela da Gestão está superajustada em 1209px" | ✅ | sobra **0px** a 100%; a 110% transborda 63px |

Medindo a tela com as transições desligadas, apareceu o que nenhum de nós tinha
visto: não eram 13 textos fracos, eram **21** — e todos no mesmo número, **3,09:1**.
Onze em branco sobre o botão dourado, dez em dourado sobre o fundo branco. Todos a
12px, tamanho que exige 4,5:1. O acento da marca reprovava **nos dois sentidos**.

Um token conserta os dois lados: `--theme-roman-primary` de `#b08d57` para
`#8c7045` (hover `#7a5f33`). Zero componentes tocados, e continua lendo como dourado.

| | antes | depois |
|---|---|---|
| pior contraste | 3,09 | **4,65** |
| textos abaixo de 4,5 | 21 | **0** |
| mediana | 7,66 | 7,66 |

### A cor da etapa não dizia nada — 6 status, 1 aparência

O ponto do Sol sobre semântica de cor, medido no navegador. O `StatusBadge` dava um
matiz diferente para cada etapa (sky, violet, amber, orange, emerald, cyan, indigo).
Na tela da Gestão:

| | antes | depois |
|---|---|---|
| status distintos | 6 | 6 |
| **aparências distintas** | **1** | **3** |

O `.theme-bridge` captura todos esses matizes e os achata no dourado do tema — todos
menos o vermelho. A cor prometia dizer a etapa e não dizia nada, em nenhum dos 4 temas.

Restaurar os 7 matizes seria pior: teriam de passar em contraste nos 4 temas, e o
olho não separa 7 tons parecidos numa tabela densa. O agrupamento não foi inventado
— está no vocabulário do próprio sistema, onde **9 dos 13 status começam com
"Aguardando"**:

| grupo | status | tratamento |
|---|---|---|
| precisa de triagem | Nova OS | acento, pílula contornada |
| parado esperando | **9 "Aguardando…"** | neutro |
| está andando | Em andamento | `success` (verde) |
| terminou | Encerrada | neutro claro |
| morreu | Cancelada / Reprovada | `danger` (vermelho) |

Numa tabela onde 70% das linhas dizem "Aguardando alguma coisa", a pergunta do gestor
é **quais estão de fato andando** — e essa varredura passou a funcionar. Uma cor nova
só: verde. Dourado, vermelho e neutro já existiam.

Dois tokens de função entraram (`success`, `danger`), escolhidos já **contra a própria
tinta de 12%** em cada tema. O acento não pôde ganhar fundo pelo mesmo motivo: ele tem
só 4,8:1 de folga sobre a superfície, e uma tinta dele mesmo come essa folga — a 12% o
texto cai para 3,96 e nem a 6% chega aos 4,5. Por isso a pílula da triagem é
contornada. Medido depois: **zero textos de badge abaixo de 4,5:1 nos 4 temas**.

### O resto do bridge: 353 classes migradas para função

Fechando o item. Fora do badge sobravam 207 classes de matiz cru em 24 arquivos, mais
153 de vermelho. O mapa saiu do contexto de cada uso, conferido antes:

| matiz | significado real | vira |
|---|---|---|
| amber, orange | atenção / pendência | **acento** — o bridge já pintava de dourado, então a aparência não muda; muda a honestidade |
| emerald, green | sucesso | **`success`** — aqui a aparência muda, e é o ganho |
| sky, blue, indigo, cyan, violet | informação | **neutro** — deixa de gritar como acento |
| red | erro / destrutivo | **`danger`** |

**O vermelho entrou por medição, não por simetria.** O bridge nunca o achatou, então
ele renderizava vermelho de verdade — inclusive no tema escuro, onde `text-red-700`
sobre `#0b0f14` media **2,73:1**. Migrar para o token o torna claro nos temas escuros.

Dois casos exigiram julgamento, não regra:

- **`AuditLogsView`** pinta **categorias**, não severidades. O mapa automático
  transformou "financeiro" em sucesso e "aprovação" em atenção — pior que o defeito
  original, porque passa a *afirmar* algo falso. Todas ficaram neutras; só `exclusao`
  é vermelha, porque apagar é destrutivo de verdade.
- **Os gradientes de Configurações** são decoração de cabeçalho de seção, escapam do
  bridge e não prometem significado. Ficaram.

E a armadilha do acento reapareceu, espalhada pela própria migração: `bg-primary/12`
com `text-primary` reproduziu 21 vezes o que eu tinha documentado para o badge. Onde o
bloco é tingido de acento, o texto passou a ser o principal — o bloco já é o sinal.
Junto, saiu a opacidade de `text-sub` em texto (`/70` mede 3,53 e `/80`, 4,45).

Dois tokens de rótulo entraram pelo mesmo motivo do `on-primary`: `on-success` e
`on-danger`. Nos temas escuros o verde e o vermelho são claros, e branco em cima deles
mede 1,92 e 2,77.

**Medido depois, nos quatro temas, ~470 elementos cada: zero abaixo de 4,5:1.**
Antes: 24 no tema claro, 3 grupos no escuro. Restam 16 cores cruas, todas
deliberadas — 12 gradientes decorativos e os tons de grupo da agenda.

### No Rubronegro, acento e perigo eram a mesma cor

Achado que **só o print revelou** — a medição dizia que estava tudo certo.

Naquele tema o acento da marca é vermelho (`#e83d38`) e `danger` também era
(`#f87171`). Resultado: o botão "Definir próxima ação" e a borda de "Vencidas"
gritavam igual, e a distinção entre *"isto se clica"* e *"isto está atrasado"*
sumia. Contraste passava nos dois; **significado, não**. É a advertência do Sol na
prática: *mesma luminância preserva contraste, não preserva percepção*.

Duas mudanças, porque uma sozinha não apareceria na tela:

1. **`danger` do Rubronegro virou âmbar** (`#fbbf24`) — 41 graus de matiz do acento,
   9,83:1 sobre a própria tinta, 11,95:1 com o rótulo escuro. É o único tema em que
   `danger` não é vermelho, e a razão está escrita ao lado do token.
2. **Os tons de grupo da agenda saíram de cor crua para token.** Eram `red-600`,
   `amber-500` e `slate-400` literais — escolhidos em 13/08 para resolver o sumiço
   das tintas pastel no tema escuro, e que resolviam aquilo criando outro problema:
   cor crua não segue tema nenhum, então trocar o token não mudaria nada na tela.

E `aguardando-sede` saiu do âmbar para neutro por causa do texto que ele mesmo
exibe: *"o horário passou — a pergunta já foi enviada, ninguém precisa ligar"*. Grupo
que declara não precisar de ação não devia vestir cor de alerta — e, com o `danger`
em âmbar, os dois ficariam a 5 graus de matiz um do outro.

### A visita desmarcada deixa de ser registrada como falta

O estado `cancelado` existia no domínio (`COMMITMENT_STATE`, com o comentário *"não é
mais necessário — a sede resolveu, a OS caiu"*), o cliente existia
(`cancelCommitment`) e o servidor tratava (`api/tickets.js`, grava o estado e recusa
com 409 se o compromisso já foi encerrado). **Faltava o botão.**

Sem ele, quem opera só tinha duas respostas para uma visita marcada:

| situação | o que dava para registrar |
|---|---|
| a visita aconteceu | "veio" + desfecho |
| o fornecedor não apareceu | "não veio" |
| **a visita foi desmarcada** | **nada — ou mentir "não veio"** |

E "não veio" não é rótulo inocente: é o sinal que a agenda usa para apontar
fornecedor que falha. Cada cancelamento registrado como falta **sujava a métrica de
quem realmente falhou**.

Agora existe nos dois momentos em que faz sentido, porque o servidor aceita enquanto
o estado guardado for `agendado`:

- **antes da hora** — linha discreta no cartão ("Elétrica Norte às 09:00 · Foi
  desmarcada"), em dois toques, porque cancelar é decisão e clique solto em cartão
  denso erra fácil;
- **depois da hora** — terceira opção ao lado de "Veio" e "Não veio", que é
  exatamente onde hoje se era forçado a mentir.

Verificado de ponta a ponta no emulador: criei a visita pela interface, cancelei, e
li o banco pelo SDK admin — `state = cancelado`. O 409 do servidor (compromisso já
encerrado por outra pessoa) aparece como mensagem no próprio cartão.

### Caça de bugs

Varredura medida — transbordo, rótulo acessível, estado vazio, console, e leitura do
código nos pontos de risco. Quatro defeitos reais.

**1. A data adiantava um dia a partir das 21h.** `formatInputDate` usava
`toISOString()` direto; em Fortaleza (UTC-3) isso joga o fim do dia para o dia
seguinte. Estava documentado como P3 do backlog, mas chega ao usuário no **checklist
de encerramento financeiro**, que pré-preenche "serviço iniciado em" e "concluído em":
um registro salvo às 21h30 voltava com a data de amanhã. Provado no fuso -3:

```
hora local   antes        depois
20h30        2026-03-10   2026-03-10
21h30        2026-03-11   2026-03-10   <-- adiantava
```

O conserto é o mesmo que a função irmã já fazia — as duas viraram uma conta só. O
teste que *documentava* o desvio agora cobra o acerto.

**2. Buscar algo inexistente na tela Hoje deixava a tela em branco.** Cada grupo da
agenda devolve `null` quando fica vazio, e o único estado vazio existente cobria
"nenhuma OS carregada" — não "a busca não achou". Medido: o texto da tela caía de
**3.165 para 48 caracteres**, sem uma palavra explicando. Tela em branco é
indistinguível de defeito, e esta é a porta de entrada de quem opera. A Gestão já
dizia "Nenhuma OS corresponde aos filtros"; aqui não dizia nada. Agora diz, e oferece
"Limpar a busca".

**3. O modal de confirmação não prendia o Tab.** O comentário dizia "simple focus
trap" e só dava foco inicial — Tab saía para a página atrás. É justamente o modal que
confirma **ações destrutivas**: sair dele por Tab e apertar Enter num controle de
fundo é o acidente que a confirmação existe para evitar. A lógica correta já existia
no `ModalShell`.

**4. Quatro filtros sem nome acessível** (2 na Caixa de Entrada, 2 na Auditoria) —
um leitor de tela anunciava "caixa de seleção" sem dizer do quê.

**O que investiguei e NÃO era defeito**, para não virar retrabalho depois:

- Os gráficos avisam `width(-1)` no console em 390px, mas **renderizam** (252×288). É
  ruído do primeiro quadro, não gráfico invisível.
- `parseCurrency("1,234.56")` devolve 0. É **por projeto**: adivinhar formato foi o
  que causou o defeito de inflar valores 100× que já foi corrigido. Recusar entrada
  ambígua é mais seguro que chutar.
- Nenhuma tela tem rolagem horizontal indevida a 390px (a tabela da Gestão rola
  dentro do próprio contêiner, que é o esperado).

### Código morto: o que saiu, e o que NÃO saiu

Levantamento por grafo de imports a partir do `src/main.tsx`, não por casamento de
nome — a primeira tentativa acusou `App.tsx` como órfão.

**Saiu:**

| | |
|---|---|
| `.theme-bridge` inteiro | **154 linhas** de CSS |
| Cormorant Garamond + Inter no `index.html` | duas famílias baixadas em toda visita |
| exports sem consumidor | 9 |

O bridge existia para remapear classes legadas do Tailwind (`bg-white`, `bg-stone-*`,
e os matizes semânticos) para os tokens do tema. Depois das migrações de hoje,
**nenhuma classe viva casava com nenhuma das 104 regras** — era casca. Medido depois
de remover: 605 elementos no tema claro e 661 no escuro, **zero abaixo de 4,5:1**.
Nada mudou de aparência, que era a aposta.

As fontes do `index.html` não eram usadas desde que o app adotou Manrope e Source
Serif 4 — o CSS as importa por conta própria. Eram duas requisições bloqueantes para
não pintar um caractere.

**NÃO saiu — e a distinção importa:**

Os **22 arquivos** de `src/views/inbox/` que o grafo aponta como inalcançáveis são o
editor de Cotações. Não é código esquecido: o commit `f7493ce` os deixou de fora de
propósito e escreveu por quê —

> *"ficam no repositório sem ninguém importando — não entram no bundle, e são a
> ÚNICA CÓPIA desse editor caso a decisão seja manter o financeiro."*

O fluxo teve **235 ações auditadas entre março e maio**, parou em 19/05 e ninguém
decidiu se volta. Apagar seria destruir a única cópia de uma funcionalidade que foi
usada, para resolver um problema que não existe: eles não entram no bundle.

Junto ficam os oito exports que os servem (`saveQuotes`, `saveContract`, os uploads,
`executionFlow`), pela mesma razão. E fica `cancelCommitment`: o servidor **trata** o
cancelamento (`api/tickets.js:980`), então é um cliente funcional sem botão — apagar
metade deixaria a outra órfã.

### Ícones: a régua, e o teste que importava mais que ela

Último item da fila, e o próprio Sol o colocou por último: *"convergir significados
importa mais que convergir números"*. Então a auditoria começou pelo significado.

**A mesma ação usa sempre o mesmo ícone?** Quase. O cruzamento rótulo × ícone
acusou 13 pares, mas **12 eram falso positivo meu**: o `Loader2` é o giro de
"carregando" do *mesmo* botão, não um segundo desenho para a mesma ação. Sobrou um
par real — `Plus` e `PlusCircle`, ambos querendo dizer "adicionar". Unificados.

**O mesmo ícone significa sempre a mesma coisa?** O caso que mais assustava era
`ArrowRight` rotulado "Voltar" no acompanhamento público. Fui ver: é
`<ArrowRight className="rotate-180" />` — girado, **desenha uma seta para a
esquerda**. Não era defeito visual, era vocabulário redundante no código, com
`ArrowLeft` já em uso para "Voltar" no resto do app. Trocado pelo ícone certo.

**Os tamanhos, aí sim.** De 15 distintos para 6:

| | antes | depois |
|---|---|---|
| interface | 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24 | **14 · 16 · 20** |
| ilustração | 28, 32, 64 | 28 · 32 · 64 *(mantidos)* |

Os grandes ficam por recomendação explícita do Sol — "não force os ícones de 64px a
virar 20px só para satisfazer a contagem". São estado vazio e cabeçalho de modal,
categoria separada.

O risco real era a **tabela da Gestão**, que cabe com folga zero em 1280px e tinha
ícones de 12 e 13px crescendo para 14. Medido depois: **1209px, sobra 0, sem
rolagem horizontal** — igual a antes.

De quebra, a guarda de alvo de clique acusou instabilidade na Caixa de Entrada e
passou no retry. Isolada, 4 de 4 verdes: a espera fixa media a tela no meio da
montagem, e um controle ainda sem conteúdo mede menos do que vai medir. Agora ela
lê até estabilizar. Guarda que falha à toa é guarda que o time aprende a ignorar.

### Piloto de peso tipográfico — e uma correção ao que eu disse ao Sol

O briefing afirmava que "a interface inteira tem um peso só", a partir da contagem
de classes: 499 `font-medium` contra 1 `font-normal`. **Isso estava errado.** Contei
classe, não renderização — o corpo sem classe herda 400 do `body`. Medido na tela:

| | Hoje | Caixa de Entrada |
|---|---|---|
| sans 400 (corpo) | 49 | 30 |
| sans 500 (rótulo, controle) | 61 | 31 |
| sans 600 (ênfase) | 21 | 22 |
| serifa 600 (título) | 6 | 36 |

Os quatro papéis que o Sol propôs já existiam. O defeito não era a falta de sistema,
era **onde o peso estava**:

- **Na tela Hoje, o item mais pesado do cartão era o menos importante.** O comentário
  do código diz "a AÇÃO é o título, o assunto vira contexto embaixo" — e o título
  vinha em 500 enquanto o número da OS, na linha de contexto, vinha em 600. O código
  contradizia o próprio comentário. Título → 600; número → 500 (ele já se distingue
  por fonte monoespaçada *e* cor, o 600 era um terceiro sinal para o mesmo fim).
- **Na Caixa de Entrada, o 600 da seleção competia com um 600 permanente.** O nome do
  solicitante estava sempre em 600, e o assunto só chegava a 600 quando o item estava
  aberto — então a marca de "é este" nascia disputando atenção. Solicitante → 500.

Resultado medido: na Hoje, o que está em 600 deixou de ser número de OS e passou a
ser **título de ação**. Na Caixa de Entrada, sans 600 caiu de **22 para 1** — e esse
um é o nome do autor de uma mensagem na conversa, que é ênfase legítima.

Nenhuma das 499 ocorrências foi substituída em massa: o Sol pediu piloto nas duas
telas mais usadas antes de mexer no resto, e o piloto mostrou que a régua já existe.

### Algarismos tabulares e alvo de clique

Dois itens da fila do Sol, os dois decididos por medição.

**Algarismos.** A pergunta que decide era se a fonte sequer tem a variante:

| fonte | larguras distintas dos 10 dígitos | com `tabular-nums` |
|---|---|---|
| **Manrope** (sans) | **9** — de 40,6 a 62,6px em corpo 100 | uniformes (62) |
| Source Serif 4 | **1** — já uniformes | sem efeito |

O "1" da Manrope é **35% mais estreito** que o "0" — numa coluna de datas,
"11/11" e "08/08" não se alinham. A serifa já é tabular por padrão, então títulos
e totais nunca tiveram o problema.

Uma regra em `table` resolve a Gestão inteira: **32 números proporcionais viraram 1**.
Fora da tabela, só onde valores se empilham para comparação (bruto/imposto/líquido
no Financeiro). Número dentro de frase — "20 obras", "Últimos 30 dias" — fica
proporcional de propósito: alargar o "1" no meio de um texto abre um buraco.

**Alvo de clique.** A WCAG 2.5.8 pede 24×24px. Medido em 7 telas, 220 controles:
**15 reprovavam** — ícones de 16×16 sem área ao redor na Caixa de Entrada,
"Editar"/"Excluir" de 20px de altura em Acessos, o rótulo de um checkbox na Gestão.
Todos corrigidos; agora **zero**.

Os 111 controles entre 24 e 36px ficaram como estão. O Sol recomenda 36–40, mas
isso é conselho de usabilidade, não norma — e engordá-los quebraria a tabela da
Gestão, que cabe com folga zero em 1280px.

Duas escolhas de medição que mudam o resultado, registradas no teste: o alvo de um
checkbox é o **`<label>`** que o envolve, não o `<input>` de 14px; e só conta o que
está visível, senão menu fechado e modal não aberto entram na conta.

Trava em `tests/alvo-de-clique.e2e.spec.ts`, no `test:e2e`.

### Os gráficos dos Indicadores passam a ter tema

O `KpiView` tinha **79 cores cravadas** em props do Recharts — `fill`, `stroke`,
`contentStyle` recebem cor por *valor*, não por classe, então esta tela nunca
participou de tema nenhum. No tema escuro a barra de "Concluídas" (`#1a1a1a`) sobre
o fundo `#0b0f14` media **1,01:1**: invisível. E a linha de destaque ainda usava
`#b08d57`, o dourado *anterior* ao ajuste de contraste — os gráficos ficaram para
trás quando o acento escureceu.

Um `usePaletaDeGraficos()` lê as variáveis do tema ativo. As séries saem de tokens
que já têm contraste garantido, em degraus distintos de luminância para se separarem
entre si:

| papel | token | contraste sobre a superfície (4 temas) |
|---|---|---|
| série A | `text-main` | 16,4 – 18,1 |
| série B | `text-sub` | 7,66 – 12,4 |
| série C | `border-control` | 3,05 – 3,29 |
| destaque | `primary` | 4,64 – 6,67 |

A barra empilhada usa A e C, não A e B: no tema escuro esses dois ficam a **1,45**
um do outro e virariam um bloco só.

**Duas coisas quebraram e só a medição pegou:**

1. **Um `useEffect` dependente do `theme` do contexto não funciona.** O `data-theme`
   é escrito no `<html>` por um efeito do AppContext, e no React os efeitos dos
   filhos rodam **antes** dos do pai — a leitura pegava o tema anterior e, como
   `theme` não mudava de novo, ficava velha para sempre. Trocar para o tema escuro
   deixava os gráficos com as cores do claro. A fonte da verdade virou o **atributo**,
   observado com `MutationObserver`.
2. **A legenda do Recharts pinta o rótulo com a cor da série**, ignorando o
   `wrapperStyle`. A série C media 3,13:1 como texto. Quem identifica a série é o
   quadradinho ao lado, então o rótulo passou a usar a cor de texto do tema.

Medido na tela, tema claro e escuro, 119 elementos cada (HTML + texto dentro do SVG):
**zero abaixo de 4,5:1**. E a troca de tema atualiza os gráficos sem recarregar.

### Contorno de controle e foco de teclado

Seguindo a fila do Sol. A borda a 1,56:1 contra os 3,0 da WCAG 1.4.11 era o ponto
dele, e a medição confirmou — mas mostrou que escurecer o token seria errado:

| | controle | moldura |
|---|---|---|
| `border-roman-border` renderizado | **106** | 113 |
| ocorrências no código | 253 | 356 |

Moldura (painel, tabela, agrupamento) **não** é coberta pela 1.4.11, e engrossar 113
delas desfaria a poda visual. Token separado, `border-control`, e **uma regra** em
vez de 253 edições — porque o critério não é "esta borda aqui", é "isto é um
controle":

```css
button.border-roman-border, input…, select…, textarea… { border-color: … }
```

A especificidade é o mecanismo: `button.border-roman-border` (0,1,1) ganha do
utilitário (0,1,0) e **perde** para `hover:`/`focus:` (0,2,0). Por isso a regra mora
na camada de utilitários — fora de camada, venceria até o hover.

Medido nas seis telas: de 41/41 reprovando na Gestão e 21/21 na Inbox para **zero**,
pior caso 3,10.

**Foco de teclado.** As linhas da tabela da Gestão traziam `focus:outline-none` e
deixavam como único sinal uma tinta do acento a 10% — **1,13:1**. Quem navegava por
teclado não via onde estava. E na barra lateral o anel dourado dava 2,95:1 (o laranja
do blue-orange, 2,30). Procurei um tom que passasse em todo fundo e **não existe** —
mesma álgebra do rótulo do athletico: nada contrasta ao mesmo tempo com branco e com
cinza-médio. Mas a barra é escura nos quatro temas, então lá o anel é branco, com
folga (pior caso 8,15:1).

Duas armadilhas no caminho, ambas registradas em comentário para não custarem duas
vezes: `transition-colors` **anima `outline-color`**, então medir logo depois do Tab
pega a transição no ponto de partida (`currentColor`) — um botão dourado de texto
branco reportava contorno branco a 1,04:1, defeito que não existia. E `element.focus()`
por script não ativa `:focus-visible`, nem `:focus` numa aba sem foco de janela:
medição de foco **só vale com Tab de verdade**, por isso a guarda nova é E2E.

Trava em `tests/foco-visivel.e2e.spec.ts`, agora no `test:e2e`.

### O conserto de verdade: o acento tem dois empregos, não um

Ao estender para os outros temas, ficou claro que o problema era mais fundo — e que
o tema escuro **prova** que um token só não resolve. Lá o azul *precisa* ser claro
para servir de texto sobre o fundo escuro (6,67:1), e é justamente por ser claro que
o rótulo branco em cima dele reprovava (2,63:1). São pares opostos: não existe valor
de azul que satisfaça os dois.

O acento responde a duas perguntas diferentes, e agora tem dois tokens:

- **`primary`** — o acento como **texto** sobre a página. Passa contra `surface` e `bg`.
- **`on-primary`** (novo) — o **rótulo sobre o preenchimento**. Passa contra `primary` e `primary-hover`.

| tema | primary | on-primary | texto/sup | texto/fundo | rótulo | rótulo no hover |
|---|---|---|---|---|---|---|
| official | `#b08d57` → `#896e44` | branco | 4,80 | 4,60 | 4,80 | 6,17 |
| blue-orange | `#ff7a00` → `#b35500` | branco | 4,98 | 4,63 | 4,98 | 6,44 |
| dark | `#4da3ff` *(intacto)* | `#0b0f14` | 6,67 | 7,32 | 7,32 | 5,18 |
| athletico | `#e10600` → `#e83d38` | `#0b0808` | 4,64 | 4,90 | 4,90 | 6,17 |

Dois achados no caminho: o **athletico é matematicamente impossível com rótulo
branco** (para o vermelho servir de texto no fundo escuro ele precisa ser claro, e
aí o branco em cima não fecha em nenhuma tonalidade) — lá o rótulo virou preto. E o
**hover dele agora clareia em vez de escurecer**: escurecendo, o rótulo preto cairia
para 3,5:1.

No tema escuro **nenhuma cor mudou** — bastou o token novo.

Nos componentes, 24 preenchimentos sólidos trocaram `text-white` por
`text-roman-on-primary`, e 31 botões escuros que viram acento no hover ganharam
`hover:text-roman-on-primary` (só no hover: em repouso eles estão sobre a barra
lateral, onde no tema escuro o `on-primary` quase preto sumiria).

Medido na tela, nos quatro temas: **zero textos abaixo de 4,5:1**, pior caso 4,64.
Trava nova em `tests/unit/contrasteDoAcento.test.ts` — relê o CSS, refaz a conta nos
quatro temas e verifica que o hover continua um passo visível do repouso. Confirmei
que ela falha: com o `#b08d57` de volta, acusa os 3,09 nos dois sentidos.

Consulta guardada em `Segundo Cerebro/.../Serv3 — Consulta 11 melhorias visuais.md`,
com a fila que saiu dela: contraste de componentes e foco, tokens semânticos,
`tabular-nums` em datas e IDs, piloto de peso tipográfico em Hoje e Caixa de Entrada.

## 2026-08-14 (o tempo fala baixo no dia seco e alto quando importa)

Pedido do dono: *"podia ser um pouco mais chamativo a questão do tempo"*. O destaque
não podia ser permanente — bloco de clima gritando num dia de sol é o enfeite que
saiu do Início. Então o que cresceu foi o **contraste entre os dois estados**, que
antes era quase nada (só a cor do texto mudava).

| | Dia seco | Chuva a caminho |
|---|---|---|
| Tamanho | 140×29px | **310×73px** |
| Fundo e borda | nenhum | dourados |
| Conteúdo | `31° · 0% de chuva` | `88% de chuva · 24° · pico em 2h` + botão **1 DE ÁGUA →** |

São **5,6× mais área** no estado que decide se a visita ao telhado é hoje ou não. O
botão de água deixou de ser um chip e virou alvo de verdade: número, rótulo e seta.

**O custo, medido:** o primeiro cartão da agenda desce de 137px para **161px** (18% →
22% da tela) — mas só nos dias de chuva. No dia seco a tela volta ao que era.
Verificado a 1366, 1280 e 390: cabe nos três, sem rolagem horizontal.

## 2026-08-13 (a landing era o login com um clique a mais)

Pedido do dono: rework da tela de entrada pública. Medindo antes de desenhar, o
problema não era estilo — era **duplicação**.

A landing mostrava logo + "Gestão de **Manutenção**" em serifa com o dourado no
itálico. O painel esquerdo do login mostra **exatamente isso**: mesmo logo, mesmo
título, mesmo tratamento. O único conteúdo próprio dela eram dois cartões — entrar e
abrir chamado. Resultado: as **28 pessoas com acesso** atravessavam todo dia uma tela
que repetia a seguinte.

Agora `/` **já é o formulário de login** — zero cliques. O "Voltar" sumiu de lá, porque
voltar sem destino é laço. `LandingView.tsx` foi deletada.

**O caminho do chamado não foi enterrado, e isso é decisão de produto.** Medido: 98%
das OS nascem por e-mail (177 de 181) e só 2% pelo formulário (4 na história inteira).
O reflexo seria encolher o formulário — mas a Consulta 6 do vault registra que o
Diretor quer **obrigar** a abertura por ele, e o Sol ficou do lado dele no princípio.
O caminho é estratégico e subutilizado; reduzi-lo brigaria com a direção. Ele ganhou
bloco próprio abaixo do login, com sobrancelha "Não é da equipe?" e a informação que
faltava: *"Sem login. O acompanhamento vai por e-mail."*

**O bloco escuro atrás do logo saiu.** Retorno do dono: *"esse Serv3 com fundo escuro
no meio do claro fica muito ruim"*. A caixa `bg-roman-sidebar` não protegia nada — o
SVG é predominantemente **dourado** (`#c9903b`, `#dba346`, `#e1b15f`) com contornos
escuros, então tem contraste próprio no claro. No escuro é que os detalhes se perdiam.

### O defeito que a investigação revelou, e ele iria para produção

Fundir landing e login quebrou **6 E2E**, e a causa era grave: o redirecionamento
pós-login só olhava para `VIEWS.LOGIN`. Quem entrava por `/` — o caso normal, e o
valor guardado no localStorage — **logava com sucesso e ficava preso no próprio
formulário**, com o botão girando.

Teria chegado à operação como "não consigo entrar no sistema". Agora `LANDING` e
`LOGIN` são tratadas juntas em todo lugar, com o motivo escrito no código.

## 2026-08-13 (o Início deixa de ser a porta; quem opera entra na agenda)

Pedido do dono: *"a tela de Início parece meio deslocada"* — e depois da poda de hoje
dava para provar por quê. Para quem opera, **100% do que restava nela era link para
outra tela**: quatro cartões de gargalo e três atalhos, todos abrindo a Gestão. Um
saguão que só aponta para as duas telas onde o trabalho acontece não é tela, é uma
parada a mais no caminho.

**Quem opera entra direto no Hoje.** A tela de entrada passou a ser derivada do papel,
não uma constante — mandar todo mundo para a mesma porta foi o que criou o saguão.

**E o Hoje deixou de ser prévia de Admin.** Ficou fechado enquanto era experimento, e
a medição de hoje mostrou o preço: a agenda existe COMPLETA (campo, gravação,
precedência, tela) e tinha **1 OS com data futura em 181**. Não era desenho ruim nem
falta de adesão — os **7 gestores**, incluindo quem responde por 406 das 1.207 ações
dos últimos 90 dias, não enxergavam a tela onde a próxima ação se define.

**O solicitante não perdeu a tela dele.** `Usuario` são **18 dos 28** cadastrados, e o
Início era o portal de acompanhamento deles. Ele continua, agora chamado *"Minhas
solicitações"* — e sem os cartões de gargalo, que chegavam lá **sem clique** porque
`abrirGestao` só existe para quem opera. Eram números mortos na única tela deles,
exatamente o que passamos o dia tirando.

### O tempo, e por que ele não é enfeite

O cabeçalho do Hoje passou a mostrar **temperatura e chance de chuva** em Fortaleza.

Termômetro sozinho seria decoração — e decoração é o que acabou de sair do Início.
O que justifica é a ponte medida: **26 das 178 OS (15%) são problema de água**, e o
aviso de chuva por e-mail já existe no Serv3 justamente porque chuva vira goteira.
Então, quando a chuva pesa (≥40% ou chovendo), o bloco deixa de ser leitura e vira
porta: mostra quantas OS de água estão abertas e abre a lista.

- **Fonte: Open-Meteo, no NAVEGADOR.** Gratuita, sem chave e com CORS — não gasta
  nenhuma das **12 funções serverless** do plano Hobby, que já estão todas em uso.
- **Previsão, não observação.** O METAR que já existe entrega chuva OBSERVADA, que é
  o gatilho certo para o e-mail ("acabou de chover, confira as goteiras"). Aqui a
  pergunta é outra: *vai* chover, para decidir se agenda a visita no telhado hoje.
- **Falhar não é evento: o bloco some.** Clima é contexto, não fila de trabalho — uma
  tarja de erro sobre a agenda custaria mais do que a informação vale.
- **Filtro "Água" de primeira classe na Gestão**, visível e desligável. Chegar numa
  lista recortada sem enxergar o recorte é como a pessoa conclui que o sistema perdeu
  OS — foi o defeito do botão "Abrir em Financeiro", removido em 12/08.

Verificado no navegador ponta a ponta: Admin cai no Hoje (barra sem Início, sem
rótulo de prévia); `Usuario` cai em "Minhas solicitações" com **zero números mortos**;
e, simulando 88% de chuva, o botão "1 de água" aparece e leva à Gestão com **1 linha —
"Goteira no refeitório"** — e o chip "Água (1)" aceso.

⚠️ O seed ganhou `waterIssue` na OS de goteira pela mesma lição dos grupos vazios:
recurso sem dado no seed é recurso que nenhuma verificação exercita.

### Cinco E2E quebrados pela mudança de porta — e a lição do helper

Trocar a tela de entrada derrubou **5 specs de uma vez**, todos pela MESMA linha: o
helper de login esperava o cabeçalho `/olá,/i`, que é do Início. Quem opera passou a
cair no Hoje e o heading deixou de existir.

Agora o sinal de "entrou" é a **barra lateral** (o botão Sair), que existe para
qualquer papel. Amarrar o login à tela de destino fazia o helper reprovar sempre que
a porta de entrada mudasse — decisão de produto, não regressão.

### A fileira de contadores do Hoje sai: 33% → 18% da tela antes do primeiro dado

Retorno do dono: *"a tela Hoje é ruim visualmente, a questão de descer a tela para
ver os dados"*. Medido a 1366×768: a fileira ocupava **117px (15% da altura)** e
empurrava o primeiro cartão para **254px** — um terço da tela gasto antes de aparecer
qualquer OS.

E o que ela mostrava já estava 30px abaixo: cada seção traz o próprio total ao lado
do título. Eram **quatro números repetidos, nenhum clicável e dois deles zero** — as
duas regras aplicadas ao Início hoje (zero não aparece; número é porta) nunca tinham
passado pelo Hoje.

Removida: primeiro dado em **137px (18%)**.

### E aí o dono perguntou "e se forem colunas em vez de linhas?" — e o desperdício real era esse

Eu estava brigando pela vertical. Medido: cada cartão ocupava **1247px de largura**
para caber no máximo **272px de texto** (mediana 161px). **80% da largura vazia**,
numa coluna só, enquanto a pessoa rolava para ver o resto.

Os cartões passam a fluir em **3 colunas** (2 em telas médias, 1 no celular):

| A 1366×768 | Antes | Depois |
|---|---|---|
| Colunas | 1 | **3** (410px) |
| Cartões inteiros na tela | 6 | **14 de 14** |
| Precisa rolar | sim | **não** |

Verificado também a 1280 (3 colunas de 382px, e o maior texto de 272px cabe), a 375
(1 coluna, sem rolagem horizontal) e com o **editor aberto** dentro de uma coluna
estreita: 12 campos, zero vazamentos.

**Colunas por cartão, não kanban por grupo.** Kanban seria uma coluna por etapa, e os
dados são desbalanceados demais: em produção são 5 vencidas, 2 hoje, **110 sem
próxima ação** e três grupos vazios. Uma coluna quilométrica ao lado de três vazias
fica pior que a pilha. Os grupos seguem empilhados — a divisão significa algo — e só
os cartões fluem.

## 2026-08-13 (a paleta legada sai, e ela escondia um defeito no tema escuro)

Quarta fatia do rework visual: converter as **402 classes de cor cruas**
(`bg-white`, `bg-stone-50`, `border-stone-200`…) para os tokens do tema. Elas
funcionavam por causa do `.theme-bridge`, que as remapeia em runtime — mas o bridge
só cobre o que alguém enumerou à mão, e é por ali que a inconsistência volta.

O mapeamento saiu **do próprio bridge**, para o resultado ser idêntico. E foi
verificado como tal: comparei a assinatura de cor computada de **132 elementos** do
Configurações antes e depois — **131 idênticos**, e a única diferença é notação
(`color(srgb 1 1 1 / 0.9)` virou `oklab(0.999994… / 0.9)`, o mesmo branco a 90%
escrito noutro espaço de cor).

**402 → 118**, e as 118 que ficaram são legítimas: 108 `text-white` (texto branco
sobre botão colorido, que o bridge também não toca), 5 `border-white` e 4 `bg-black`
de overlay.

### O defeito que a limpeza revelou

O `TodayView` tem um mapa de cor por grupo, com o comentário "semântica, separada do
dourado da marca" — é sistema, não dívida, e por isso **não** foi convertido. Mas ao
verificar descobri que `bg-red-50/60` (Vencidas) e `bg-slate-50/60` (Suspensas)
**não estão na lista do bridge** — que cobre amber, sky, blue, emerald, green e
companhia, mas não vermelho nem slate.

Testado injetando os elementos e trocando o tema: as duas classes rendem **exatamente
a mesma cor** nos temas claro e escuro. Compondo o alfa sobre o fundo do tema escuro
(luminância 15):

| No tema escuro | Antes | Depois |
|---|---|---|
| Vencidas | rgb(157,151,153) — luminância **152** | rgb(34,20,25) — **23** |
| Suspensas | rgb(153,156,159) — luminância **156** | rgb(20,25,32) — **24** |

Eram dois blocos cinza-claros num fundo quase preto. O conserto troca pastel fixo por
**tinta sobre a superfície do tema** (`bg-red-500/10`, `bg-slate-500/10`): sutil nos
dois temas, e a semântica preservada.

⚠️ Não tinha aparecido em nenhuma verificação porque no emulador **os grupos
"Vencidas" e "Suspensas" estavam vazios** — e "Vencidas" é o motivo de a tela existir.

## 2026-08-13 (17 tamanhos de texto viram 9, e a mesma escala em todas as telas)

Terceira fatia do rework visual. O ruído que restava era a zona entre 9 e 15px, onde
**sete** tamanhos faziam o mesmo trabalho — `text-[9px]`, `[10px]` (170 usos), `[11px]`
(108), `[12px]`, `[13px]` (78), `[14px]`, `[15px]`. Nada era exatamente igual a nada,
então nada lia como grupo.

A convergência foi em três passos, do mais barato ao mais arriscado:

1. **Tamanhos idênticos escritos de dois jeitos**: `text-[12px]` → `text-xs`,
   `text-[14px]` → `text-sm`. Mesmo pixel — mas com uma diferença que importava: o
   bloco de ampliação para monitores ≥1536px cobre `.text-xs`/`.text-sm` e **não**
   cobria as versões entre colchetes. O mesmo tamanho crescia numa tela e não na
   outra.
2. **A sobrancelha**, que existia em 10px (170) e 11px (108) para o mesmo papel:
   tudo para **11px**. As regras de 10px saíram do CSS junto — CSS morto de escala é
   convite para alguém reintroduzir a classe achando que há quatro degraus.
3. **Os últimos avulsos**: `[13px]` → `text-sm` (são campos de formulário, e 13px
   também ficava de fora da ampliação), `[15px]` → `text-sm`, `[17px]`/`[18px]` →
   `text-lg`.

**17 tamanhos → 9.** Ficaram `text-[11px]` (sobrancelha) · `xs` · `sm` · `base` · `lg`
· `xl` · `2xl` · `3xl`, mais dois usos de `text-[9px]` **mantidos de propósito**: o
selo de notificação e o rótulo do ícone da barra lateral, onde 11px não cabe.

Verificado nas oito telas, com a janela em 1280px: nenhuma quebrada, **nenhuma com
rolagem horizontal**, e a zona micro em **11 / 12 / 14** em todas. A tabela da Gestão
— que cabia em 1209px exatos e é o teste mais sensível a texto maior — continua em
**1209 = 1209**. A Caixa de Entrada saiu de 9 tamanhos na tela para 7.

## 2026-08-13 (13 raios viram 3, e duas suspeitas minhas caem)

Segunda fatia do rework visual — e a medição derrubou duas coisas que eu tinha
afirmado como prováveis.

**As telas públicas seguem o tema.** Eu tinha escrito que login, formulário público e
tracking "provavelmente não seguem tema nenhum" por ficarem fora do `.theme-bridge`.
Medido: 1–2 supostas superfícies claras no tema escuro, e ao investigar eram **falso
positivo do método** — os elementos têm `transition-all duration-200`, então
`getComputedStyle` logo após trocar o tema devolve a cor no MEIO da transição. Medindo
com transição desligada, estão corretos. Elas usam token, e token funciona fora do
bridge.

**O bridge cobre o `SettingsView`.** Com transições desligadas, **zero** superfícies
claras no tema escuro em 282 elementos: as 186 classes cruas estão todas sendo
remapeadas. As "duas linguagens" não são risco de tema — são dívida de manutenção (o
bridge só cobre o que alguém enumerou, então classe crua nova escapa em silêncio) e,
sobretudo, **geometria**.

Geometria era o que se via de fato. Raios renderizados, antes:

| Tela | Raios |
|---|---|
| Gestão de OS | 4px · 12px · pill |
| **Configurações** | 12px · **16px** · **24px** · **28px** · pill |

Cantos de 24 e 28px não existiam em nenhuma outra tela — o dobro dos 12px do resto. É
o que fazia Configurações parecer outro produto.

- **13 raios → 3** no app inteiro: `rounded-sm` (controles, 434), `rounded-xl`
  (painéis, 193), `rounded-full` (selos, 66). Zero valores avulsos.
- **7 sombras improvisadas → 0** (`shadow-[0_16px_36px_rgba(15,23,42,0.05)]` e
  parentes viraram `shadow-sm`).
- Configurações saiu de 5 raios para 2; Financeiro, Indicadores e Inbox passaram a
  usar o mesmo vocabulário.

Não inventei linguagem nova: **a Gestão de OS já era o padrão** (0 cor crua, 1 raio) e
o resto convergiu para ela.

⚠️ Continua aberto: os 402 usos de paleta legada (186 no Configurações, 47 no Users)
— hoje funcionam pelo bridge, mas são a porta por onde a inconsistência volta. E a
escala de TEXTO (17 tamanhos, sete entre 9 e 15px) só convergiu no Início.

## 2026-08-13 (borda passa a significar "isto se clica")

Primeira fatia do rework visual. Antes de escolher cor ou fonte, contei o que estava
na tela — e o problema não era estilo:

- **13 raios de borda diferentes** (411 `rounded-sm`, 112 `xl`, 60 `2xl`, 21 `lg`, mais
  oito avulsos como `rounded-[1.25rem]` e `rounded-[22px]`).
- **17 tamanhos de texto**, sendo **sete** entre 9px e 15px fazendo o mesmo trabalho.
- **402 classes de cor cruas** (`bg-white`, `border-stone-200`, `bg-stone-50`…) contra
  2.772 de token — remendadas em runtime por um `.theme-bridge` aplicado na raiz do
  app. `SettingsView` é praticamente outra linguagem visual, com sombras e caixas
  pastel próprias.
- No Início: **18 elementos com borda ou sombra, 9 deles dentro de outros**. Painel com
  borda → botão com borda → pílula com borda.

A paleta e as fontes estão bem (Source Serif 4 + Manrope, quatro temas coerentes). O
que faltava era **escala e significado** — quando tudo tem moldura, nada se destaca.

**A regra adotada: borda significa "isto se clica".** Cabeçalho, barra de recorte e
títulos de seção perderam a caixa; o que agrupa agora é espaço e tipografia. A pílula
com borda dentro do botão virou número em serifa dourada.

Resultado no Início, medido no navegador: **18 → 12 caixas, 9 → 0 aninhadas, e
nenhuma caixa com borda que não seja clicável.** A escala de texto da tela ficou em
11 / 12 / 14 / 18–20 / 28–32, sem a lama do 9–15px — a sobrancelha do `StatCard` era
10px enquanto as outras da mesma tela eram 11px.

Conferido nos quatro temas: o texto inverte junto com o fundo, porque a poda usou
token e não cor crua.

⚠️ Isto cobre **uma** tela e um componente. Os outros 12 raios, os 402 usos de paleta
legada e o `SettingsView` continuam como estão.

## 2026-08-13 (o Início tinha 19 números e 4 portas)

Pedido do dono: *"acho tudo muito poluído"*. Antes de mexer em cor ou espaçamento,
contei — em cada tela, quantos números aparecem e quantos abrem alguma coisa:

| Tela | Números | Abrem algo | Zeros |
|---|---|---|---|
| Início | **19** | **4** | 8 |
| Indicadores | 11 | 0 | 4 |
| Hoje (prévia) | 5 | 0 | 3 |
| Financeiro | 2 | 0 | 1 |
| Caixa de Entrada | 1 | 0 | 0 |
| Gestão de OS | 0 | — | 0 |

**De 38 números no sistema, 4 abrem alguma coisa.** Não é estilo: é densidade sem
consequência. Uma tela onde o número não responde ao clique ensina a pessoa a não
clicar, e a partir daí ela lê tudo como parede. O princípio já estava escrito na
Consulta 7 do gpt-5.6-sol — *"todo número da página inicial deveria abrir uma lista
sobre a qual alguém consegue agir"* — e tinha sido aplicado só na primeira fileira.

- **O "Painel por Região" saiu.** Sozinho, respondia por 12 dos 34 números mortos (3
  regiões × 4 contadores, nenhum clicável). O recorte territorial continua onde dá
  para agir sobre ele: os filtros do topo e a Gestão.
- **Cartão zerado não aparece.** Mesma regra que a faixa de próxima ação já usava:
  aviso que aparece sempre vira moldura; sumindo, o silêncio passa a significar "nada
  pendente" — e isso é informação. Quando todos os gargalos estão zerados, a fileira
  inteira dá lugar a uma linha ("Nenhum gargalo agora").
- Resultado no Início: **19 → 6 números, 8 → 0 zeros, e os 4 que abrem lista
  intactos.** Verificado no navegador, inclusive o estado vazio (forçado no emulador,
  já que nenhuma sede real zera tudo).

**Os últimos números mortos viraram porta.** O trio de entrega (aguardando aceite ·
obras em campo · entregas finalizadas) passou a abrir a Gestão filtrada, e com isso o
Início ficou em **7 números, 7 deles abrindo uma lista — zero mortos, zero zeros**.

Duas armadilhas evitadas, ambas com precedente no projeto:

- A guarda é `canOperate` (Admin/Gestor) e **não** `isExecutive`: o bloco aparece para
  o **Diretor**, que não acessa a Gestão (`canAccessOsBoard`). Sem isso o clique dele
  navegaria para uma tela que não renderiza — o mesmo defeito do botão "Abrir em
  Financeiro", removido em 12/08 por levar sempre ao vazio. Para o Diretor os cartões
  seguem como leitura.
- "Entregas finalizadas" leva `showClosed: true` junto. O filtro só esconde encerradas
  quando o status é "todos" (`OsBoardView:136`), então o clique já funcionaria — mas
  sem a flag, limpar o status na tabela faria a lista sumir na cara de quem acabou de
  chegar por ali.

Verificado clicando os três no navegador: **7 → 7 linhas** (Encerrada), **1 → 1**
(Em andamento), **1 → 1** (Aguardando aprovação da manutenção). Nenhuma tela vazia.

## 2026-08-13 (a Gestão mostra o que já aconteceu na OS)

A coluna **Marcos** entra na tabela de Gestão: uma barra de seis segmentos com a régua
que a coordenação usa na planilha — visita técnica, aprovação da solução, orçamento,
ações preliminares, início da execução, conclusão — mais o contador `n/6`. As datas
saem no title e no `aria-label` da linha, com `—` no que falta.

**Uma coluna, não seis.** A régua da planilha tem seis datas, mas a tabela já perdeu
essa briga uma vez (11 colunas → 9, medido em 1366/1280px). Medido de novo agora, no
navegador: a primeira versão custava **49px** e devolvia a rolagem horizontal — a
tabela cabia exata em 1209px. Apertar a faixa levou o custo a 16px, e a descoberta
seguinte foi que o gargalo **não era a faixa**: era o TEXTO do cabeçalho ("Linha do
tempo", 95px de largura). Com "Marcos", a coluna passou a custar **0px** — a tabela
absorveu na folga das outras.

- **Marco vazio é `null`, nunca "hoje".** `coerceDate` cai num fallback quando o valor
  falta, o que desenharia a linha do tempo cheia e mentiria. É o mesmo defeito do
  gráfico que lia `closureChecklist.closedAt` (vazio em 92 de 92) e mostrou zero por
  meses — zero parece um mês fraco, não um campo vazio.
- **Percurso esparso é normal, não erro.** 45% das linhas da planilha pulam etapa; das
  235 concluídas, 45% nunca registraram início de execução. A barra mostra buraco no
  meio sem tratar como pendência.
- **Os rótulos são os DELES**: "visita técnica", não "parecer técnico". Quem lê a tela
  precisa reconhecer a própria planilha nela.
- O serializer da API passou a converter as datas do mapa — sem isso chegariam como
  Timestamp do Firestore e a tela compararia objeto com data, a mesma armadilha já
  documentada ali para `nextAction.dueAt`.

## 2026-08-13 (a linha do tempo que o sistema jogava fora)

Primeiro passo do rework da agenda operacional, e ele começou por uma medição que
mudou o alvo: **quanto da agenda o Serv3 consegue preencher sozinho, sem pedir
digitação a ninguém?**

**Quase nada — e a razão é estrutural.** `stageEnteredAt` é **um** carimbo,
sobrescrito a cada transição: o sistema sabe há quanto tempo a OS está na etapa
ATUAL e **descarta a data de todas as anteriores**. O valor inteiro da planilha que a
coordenação mantém é ver as seis datas lado a lado. Não era falta de digitação; era
descarte.

O retrato antes da mudança, na produção: a linha do tempo derivável do histórico
cobria visita técnica em 97% das OS e conclusão em 36%, mas **as quatro etapas do
meio em 1-3%** — contra 226 aprovações de solução, 177 orçamentos e 141 ações
preliminares datadas na planilha. **60% das OS tinham exatamente 1 marco.** E o
planejado era pior: de 181 OS, **1 tinha data futura**; das 58 com atenção
operacional, **57 estavam vencidas** (atraso mediano de 24 dias, máximo 78), todas do
mesmo tipo — `revisar-mensagem`. Metade das OS abertas não tinha nenhuma próxima ação.

- **Cada transição passa a gravar um marco permanente**, na MESMA transação que valida
  a mudança de etapa — numa segunda escrita ele poderia falhar sozinho e deixar buraco
  justamente na OS que se moveu.
- **Mapa no documento, não subcoleção.** No máximo uma chave por etapa (12), longe do
  risco do `history[]` que quase estourou 1 MiB, e sai na mesma leitura da listagem —
  que é o que uma tela de carteira precisa, uma linha por OS.
- **A primeira entrada vence.** Encerrar e reabrir é comum aqui; sobrescrever faria a
  OS reaberta perder a própria história e o "início da execução" viraria o do
  retrabalho. O `closedAt` continua sendo limpo na reabertura, porque ele responde
  outra pergunta: "está fechada agora".
- **`marcos` é campo só-servidor por construção** — fica fora da allow-list do PATCH,
  e há teste provando que o cliente não forja a data.
- **Backfill (`npm run infra:marcos:backfill`, ensaio por padrão) não inventa data.**
  Recupera só o que o próprio Serv3 já sabe: triagem, transições registradas,
  `createdAt` e `closedAt`. Etapa sem rastro fica sem marco — coluna vazia é honesta, e
  preencher por aproximação produziria a carteira que parece completa e mente, que foi
  exatamente o defeito do gráfico que lia `closureChecklist.closedAt`.

**BACKFILL APLICADO EM PRODUÇÃO** (13/08): **438 marcos em 181 OS**, 100% da base com o
mapa, zero datas inválidas ou no futuro. Conferido por leitura independente do banco:
`97/97` das OS em Parecer Técnico têm o marco da própria etapa, `62/62` das encerradas,
`2/2` das preliminares — mas só **`3/10`** das que estão em Orçamento e `4/5` das em
andamento. Essas sete chegaram à etapa por um caminho que não deixou transição
registrada, e o script **deixou vazio em vez de inventar**.

O retrato que a coluna mostra hoje: **1 OS com 0/6, 109 com 1/6, 69 com 2/6, 2 com
3/6**. Nenhuma com 4, 5 ou 6 — contra 226 aprovações de solução datadas na planilha.
É pobre e é honesto; é essa distância que deve encolher a cada OS que se mover agora
que o fluxo aceita as etapas.

⚠️ Sem importar a planilha (decisão do dono), a linha do tempo só engorda com o que se
mover **daqui para frente**. Nas primeiras semanas a carteira do Serv3 será mais pobre
que a planilha, e as duas vão conviver.

## 2026-08-13 (o sistema recusava a etapa que a operação usa — e uma planilha provou)

**Em 07/08 eu aposentei três etapas de aprovação de uma vez.** A medição que usei
estava certa: zero diretores cadastrados, `directorEmails` preenchido em 1 de 270 OS,
com endereço de teste. A conclusão é que estava larga demais — aquilo provava que o
**mecanismo** (diretor cadastrado clicando "aprovar") não era usado. Não provava que
o **passo** não existisse.

**A planilha que a coordenação mantém em paralelo prova que existe.** 708 linhas, de
mai/2024 até hoje, com data por marco: 308 visitas técnicas, **226 aprovações de
solução**, 177 orçamentos, 141 ações preliminares, 144 inícios de execução, 235
conclusões. Hoje há **49 solicitações paradas em "aguardando aprovação de solução"**
e 20 em "aguardando aprovação do orçamento" — as duas etapas que o servidor recusava
com 409.

**O preço disso era mensurável.** De 248 OS que já entraram em "Aguardando Parecer
Técnico", só 34% saíram; das 85 saídas, **64 foram direto para Encerrada e apenas 4
para Orçamento**. 52% não tiveram nenhuma atividade humana durante a espera, com
mediana de 31 dias parada. A OS não ficava parada por desleixo: a casa seguinte tinha
sido removida do tabuleiro.

- **As duas etapas voltam a aceitar entrada.** Aprovação de **contrato** continua
  aposentada — é o único dos três marcos que a planilha não acompanha, então não há
  evidência de que o passo exista fora do sistema.
- **Entrar na etapa não afirma que alguém aprovou no sistema.** Afirma que a OS
  espera uma aprovação que acontece por e-mail. Quem aprova continua fora daqui, e o
  histórico registra apenas quem moveu e quando.
- **A esteira segue permissiva de propósito.** 45% das linhas da planilha pulam
  etapa e 45% das concluídas nunca registraram início de execução — exigir sequência
  completa modelaria um processo que a operação não executa.
- O botão "Liberar para orçamento" **continua indo para orçamento**: é o que o rótulo
  promete. Quem precisa registrar a espera por aprovação escolhe no seletor.

**Dois testes de regressão, e os dois reprovam o comportamento antigo** — verificado
reintroduzindo a aposentadoria: o unitário quebra em 2 asserções (incluindo a guarda
de drift front/back) e o E2E novo falha, porque a recusa era do **servidor** e o mapa
do front podia estar coerente consigo mesmo enquanto a gravação falhava.

## 2026-08-13 (o ferramental da exclusão entra no repo, e a bateria roda inteira)

Os quatro scripts que executaram a exclusão de 12/08 e o teste que protege a
cascata estavam **só no disco**, fora do versionamento. Um teste não commitado não
protege ninguém: o `ticketStorageCascade` cobre exatamente o defeito que vazou 761 MB
em anexos de `inbound/`, e até agora qualquer regressão passaria sem ninguém ouvir.
O critério de quem entrou na exclusão (`escopo-os-a-apagar.mjs`, com a lista
`PRESERVAR`) também vira registro auditável em vez de lembrança.

**Bateria de ponta a ponta, no emulador**: `tsc` limpo, **708 testes unitários**,
**124 verificações de integração** (11 arquivos) e **10 E2E**. Tudo verde.

**Um flaky que o CI não contaria.** O E2E "OS encerrada por engano pode ser
reaberta" falhou na primeira tentativa e passou no retry — e o `npm run test:e2e:ci`
saiu com **código 0**, então no Actions isso aparece como verde puro. Não é a corrida
do `updateTicket` sem `await`: esse caminho é aguardado (`InboxView.tsx:1061`). É
tempo — o teste estourou os 30s antes do `poll` ter chance, comidos pela primeira
compilação do InboxView pelo Vite. Repetido 3× com o servidor quente: **12/12**, com
o primeiro teste de cada rodada em ~17s e os seguintes em ~4s. A margem para o
timeout é estreita, e o CI é mais lento que a máquina local.

**O backup cobria menos do que a exclusão apaga — e agora os dois leem o mesmo
critério.** Quando a cascata foi corrigida para varrer o bucket pelo prefixo da OS, o
`backup-os.mjs` ficou para trás: continuava baixando só os paths de `attachments[]` e
`closureChecklist.documents[]`, a lista antiga. Ou seja, anexo chegado por e-mail era
apagado e **não** era salvo — o oposto do motivo de o backup existir. A trava que
exige backup antes do `--apply` seguia de pé, garantindo menos do que prometia.

A varredura virou `listTicketStorageFiles` (exportada de `api/tickets.js`), e a
exclusão passou a ser o laço de `delete` em cima dela. O backup **chama a mesma
função** em vez de reimplementar o prefixo — que é exatamente o motivo de
`escopo-os-a-apagar.mjs` existir: dois lados com cópias do critério divergem em
silêncio, e o erro só aparece na hora de restaurar. O destino do arquivo salvo agora
inclui a pasta de tipo (`anexos/<OS>/inbound/foto.jpeg`), senão nomes repetidos entre
pastas se sobrescreveriam e o backup teria menos arquivos do que diz ter.

## 2026-08-12 (as universidades saem da base — e um vazamento de 761 MB aparece)

Pedido: apagar as OS das universidades e do Benfica. **107 OS excluídas** (38% da
base), a base foi de 284 para 178 e nenhuma sede de universidade ou Benfica restou.

**O critério pedido incluía "tudo que tiver Thais escrito", e medir isso antes
mudou o escopo.** Das 80 OS com o nome dela, **78 já estavam em universidade ou
Benfica** — ela coordena a Faculdade, então o nome é sintoma do território, não
critério. As 2 restantes eram de OUTRAS sedes, onde ela aparece só por estar em
cópia na thread: uma delas, a OS-0192, é o laudo de uma **trinca em viga estrutural
do BS**. No sentido inverso, "Thais" cobria só 21 dos 25 do Benfica — usá-la como
atalho deixaria 4 OS legítimas de pé. O corte final foi por **território**, com
OS-0192 e OS-0301 preservadas por decisão explícita e gravadas numa lista
`PRESERVAR`, para que um ajuste futuro no filtro não as ressuscite no alvo.

**A auditoria não serve de backup, e isso precisa estar escrito.** `writeAuditLog`
trunca `history` nas últimas 8 entradas e, acima de 400 KB, descarta o snapshot
inteiro gravando `{__audit:'omitido'}` — some justamente nas OS movimentadas. E
nunca guarda binário. Antes de apagar, backup completo em `_os_backups/`: 107
pacotes JSON com doc, cinco subcoleções, thread, inbound e eventos, mais 268
anexos (346 MB). O apagador **se recusa a rodar** sem um backup do mesmo escopo que
cubra todas as OS-alvo.

**O achado que não estava no pedido.** Durante a exclusão, a trava de escopo
recusou um path da OS-0126 que apontava para a pasta da OS-0125 — e puxar esse fio
revelou que a cascata **só apagava do Storage os paths de `attachments[]` e
`closureChecklist.documents[]`**. Anexo que chega por e-mail vai para
`attachments/tickets/inbound/<id>/` e é referenciado pelo **histórico**, nunca por
esses arrays: nenhuma exclusão jamais o apagou. Passivo medido: **459 arquivos,
761 MB, de 66 OS que já não existiam**, com PII de e-mail de gente real dentro.
Não era deste lote — toda exclusão pelo botão de Admin vinha deixando esse rastro.

- **A cascata agora varre o bucket pelo prefixo da OS** em vez de confiar na lista
  do documento, e **descobre** as pastas por tipo em vez de fixá-las numa lista —
  uma pasta criada amanhã voltaria a vazar. A trava `isPathInTicketScope` continua
  como rede por arquivo. Coberto por teste, inclusive o caso do `inbound`.
- **Passivo limpo**: bucket de 1256 para 797 arquivos, zero órfãos.

## 2026-08-12 (a caçada: dez defeitos, e seis deles eram "verde que não faz nada")

Pedido do dono: *"vc consegue se unir ao Sol para caçar bugs, falhas possíveis,
botões que não fazem nada mas que deveriam fazer?"*. Duas frentes: o gpt-5.6-sol
lendo o código e eu medindo uso real na produção — botão morto se prova com dado,
não com leitura. Verifiquei no código tudo o que ele trouxe antes de repassar; um
dos achados dele não era defeito, e está registrado abaixo.

**O padrão que uniu quase tudo: nenhum desses defeitos gerava erro.** Job
bem-sucedido sem entregar nada, botão que descarta o resultado, gráfico lendo campo
vazio, número plausível medindo outra coisa. Foi o que permitiu que durassem semanas.

### A fila de e-mail: eu errei o diagnóstico primeiro

Culpei o `OUTBOX_URL` ausente e commitei com essa hipótese. **Estava errado**: a API
pública do GitHub mostra o workflow *Email Outbox* com **277 execuções, todas com
sucesso**. O agendamento e o segredo sempre estiveram certos.

O defeito real é pior. Quando o despacho falhava, `processEmailOutboxBatch` devolvia
`failed: N` **no corpo da resposta HTTP e não tocava no documento**: `attempts` ficava
em 0, `status` em `pending`, o item voltava idêntico à fila, e a rota respondia 200 —
então o Actions ficava verde. Retry, backoff e dead-letter existiam e eram testados,
mas **nunca engatavam**: tudo neles depende de campos que só a outra ponta escrevia.
`markEmailOutboxFailed` exige `leaseToken`, que só nasce depois da reivindicação;
falha antes disso não tinha quem registrasse.

Resultado: **85 avisos de OS nova parados desde 28/07** — 47 OS, 8 gestores —
crescendo na frente (66 na semana passada, 81 pela manhã, 85 à tarde). Nenhum gestor
soube de OS nova por e-mail em 15 dias.

Agora a tentativa fica gravada, com backoff e dead-letter alertado. **Isto não conserta
a causa; torna a causa visível** — que era exatamente o que faltava para 15 dias
passarem sem ninguém saber. O teste de integração reprova o comportamento antigo: com
a gravação desligada, 5 das 8 verificações falham.

### Volume de e-mail: um aviso por pessoa virava sete

*"Se tiver 30 em cópia serão 30 e-mails e não 1?"*. Para a conversa com o solicitante,
não: 30 em cópia = 1 e-mail. Para o **aviso ao gestor**, era um documento por (OS,
gestor) e a entrega lia `recipients[0]` — 4 e-mails idênticos sobre a mesma OS no pior
caso medido, e a região Benfica tem **7 gestores** no escopo. A chave por destinatário
existia para idempotência, não porque envios separados fossem desejáveis. Agora é um
item por OS com todos juntos; a chave continua determinística, por OS.

### As correções da tela

- **Quatro botões da Hoje descartavam o resultado** (`void onCorrigir(...)`). Como o
  `updateTicket` é otimista e reverte ao falhar, a sugestão sumia e **reaparecia** sem
  nenhuma mensagem — só o console sabia.
- **O checkbox "avisar quem abriu" era aceito e ignorado** em seis etapas internas. A
  regra de não notificar é deliberada; o defeito era oferecer a escolha e sobrepô-la em
  silêncio. Agora o checkbox só aparece quando o e-mail sai de fato.
- **A regra de quem avisa existia em dois lugares** (`CUSTOMER_FACING_STATUSES` na Inbox
  e `shouldNotifyRequesterForStatus` no serviço). Não se contradiziam ainda, mas listas
  irmãs não envelhecem juntas. Uma função só. A triagem não mudou — ela tem caminho
  próprio, e acrescentar um clique na ação mais frequente seria preço alto por
  consistência.
- **O remetente ganhou nome**: `Serv3 <napa01@christus.com.br>` em vez do endereço cru.
  O endereço não muda — é ele que precisa bater com o alias "Enviar como".

### A tela Hoje enxergava 4 de 116

As regras de atenção são de **tempo** ("parada há 7 dias"); o recálculo nascia de
**evento**. OS que fica parada não gera evento — a população que as regras existem para
pegar era a única que nunca era recalculada. Medido: as regras apontavam **116 OS** e
havia **4 gravadas**, todas de e-mail recebido nas 48 h anteriores.

Entrou varredura diária às 06h de Fortaleza, que **pagina até o fim** — sem o laço,
cobriria só as 50 primeiras por id. Duas guardas contra o modo de falha da casa: a
resposta é lida com `node` e não `jq` (com `jq` ausente o cursor sairia vazio, o laço
encerraria na página 1 e o job ficaria **verde** dizendo "0 OS"), e ler zero OS **falha**
o job.

### Dois números do painel mediam outra coisa

- **"Tempo médio por etapa" media a idade da OS.** Usava `daysBetween(ticket.time,
  hoje)` — desde a abertura. Uma OS aberta há 40 dias e movida para execução hoje
  aparecia com 40 dias de execução, e o campo certo (`stageEnteredAt`) já era carimbado
  pelo servidor desde 11/08. A diferença não é pequena: Orçamento **19 → 10 dias**,
  Execução **26 → 13**. O meio do fluxo era mostrado com quase o dobro.

  Trocar o campo não bastava: só 6 das 117 OS vivas tinham o carimbo, porque ele nasce
  quando a OS **se move** e a fila é feita de OS que não se movem. O backfill recuperou
  101 de 110, de três fontes: transição registrada, **triagem** (para as 89 paradas em
  Parecer Técnico que nunca saíram) e criação — esta só quando não houve transição
  nenhuma e a etapa é uma em que a OS pode nascer. Antes de aplicar, conferi que as
  datas de triagem são reais e não artefato: 107 são do mesmo gestor, espalhadas por 15
  dias, com intervalos de 1–2 min. Migração teria ator de sistema e carimbo único.
- **Cancelada contava como "em aberto"** no gráfico por sede: era `status === Encerrada
  ? fechadas : abertas`. O total somava certo e só a cor mentia.
- **Encerrada com parcela pendente ia para "Histórico"** (aba chamada "Quitadas"), sem
  olhar saldo. Zero OS afetadas hoje — o defeito esperava o primeiro caso real.

### O botão que levava sempre a uma tela vazia

A Inbox dizia que cotação, contrato, medição e pagamento "seguem no Financeiro" e
oferecia **"Abrir em Financeiro"**. Medido: 12 OS em "Aguardando Orçamento", 3 com
contexto financeiro, **zero visíveis** no Financeiro — a tela exige contexto financeiro
prévio *e* uma etapa que não inclui orçamento. E não há onde lançar cotação desde 07/08.

Caminho que existe e não chega a lugar nenhum é pior que caminho nenhum: os dois
cliques "funcionam", então a pessoa conclui que a OS sumiu, não que o botão está
errado. Decisão do dono: **o botão sai da tela**.

### O que descartei do que o Sol trouxe

- **O editor de cotações órfão** (11 componentes, `saveQuotes` sem chamador) ele
  classificou como defeito. Não é: o commit `f7493ce` removeu o fluxo financeiro da
  Inbox **de propósito**, com o motivo medido, e diz textualmente que os componentes
  ficam como única cópia caso o financeiro volte. Dívida assumida.
- **Etapas aposentadas na tela pública** — parecia repetição do bug de ontem, mas é
  reconstrução do histórico: OS antigas passaram por elas.
- **Visita de fornecedor não dispara pergunta à sede** — não verifiquei o mecanismo, mas
  medi o alcance: **0 compromissos** existem. A funcionalidade nunca foi usada.

### E uma limpeza que quase virou 22 incidentes

A coordenadora pediu a exclusão das OS da universidade (solicitantes abrindo
duplicadas) e **105 OS saíram do banco** — de 282 para 177. Depois disso, 22 dos 85
avisos enfileirados apontavam para OS que não existem mais. Com a correção acima, cada
um seria retentado seis vezes e viraria um alerta de "falha definitiva" para Admin e
Gestor. Agora OS ausente (404) encerra o item com `obsolete: true` e o motivo escrito:
some da fila, continua auditável, não acorda ninguém.

**708 unitários, 12 verificações de integração (novas), 11 E2E, build.**

## 2026-08-12 (a fila ganha linha do tempo — e um gráfico para de mentir)

Pedido do diretor, na formulação dele: *"na semana passada foram abertas 20 e
fechadas 21; tínhamos 200 e agora 199"*.

**O gráfico que já existia respondia metade disso, e respondia errado.** Ele lia a
data de fechamento de `closureChecklist.closedAt` — campo vazio em **92 de 92** OS
fechadas na produção, porque o checklist de encerramento tem **0 usos em 61
encerramentos**. A barra "Encerradas" mostrava **zero desde sempre** e ninguém
notou: zero parece um mês fraco, não um campo vazio.

Medi antes de desenhar. O histórico tem a data em **92 de 92** (`"Transição manual
via chat: … -> Encerrada"`), nenhuma sem, nenhuma impossível, mediana de **21 dias**
entre abrir e fechar.

- **`closedAt` carimbado pelo servidor** na transição, junto do `stageEnteredAt` e
  pela mesma razão: sair da fila é um evento, e evento que depende de a tela lembrar
  de mandar não acontece. **Reabrir limpa o campo** — desde ontem dá para tirar uma
  OS de "Encerrada", e sem isso ela ficaria viva na tela e morta no gráfico.
- **Backfill** das 92 a partir do histórico. Lê texto, o que as regras não fazem de
  propósito; aqui é aceitável porque é script de uma vez só sobre frases que o
  próprio sistema escreveu. Se não achar, **não inventa**: deixa sem data e reporta.
  Uma OS fechada sem data aparece como pendência, o que é honesto; data inventada
  vira linha bonita e mentirosa.

**O formato é acumulado**, por decisão do diretor depois de ver a primeira versão em
barras: duas faixas empilhadas — embaixo tudo que já foi resolvido, em cima o que
continua na fila. A altura total é tudo que já entrou, e a **faixa dourada é a
fila**: quando ela afina, a equipe está fechando mais do que entra. É a leitura de
tendência, que barra semanal não dá.

A identidade `abertas − saídas = pendências` vale em todo balde e está travada por
teste, porque é ela que dá sentido ao desenho — sem ela a distância entre as curvas
vira um número sem nome, e o gráfico continuaria bonito, que é o perigo. O movimento
da semana (*"20 e 21"*) não se perdeu: está na frase acima do gráfico e no tooltip.

Duas decisões que parecem detalhe e não são:

- **O estoque é calculado sobre a base inteira** e só depois recortado para a janela.
  Calcular sobre as OS da janela faria a linha começar em zero toda vez que alguém
  filtrasse "último mês" — e uma linha de pendências que começa em zero não mostra
  pendência, mostra o filtro. Tem teste.
- **O gráfico ignora o filtro de etapa.** Etapa é o estado de hoje; a OS que hoje
  está "Encerrada" estava "Em andamento" na semana passada. Filtrar série temporal
  por estado atual responde pergunta que ninguém fez.

Acima do gráfico ficou a frase que se lê em cinco segundos: *"No período: 29 abertas
e 33 encerradas — a fila foi de 20 para 16 (4 a menos)."*

**13 OS de teste saíram da conta.** Eram canceladas pelo Admin em 21/07 com "Motivo:
Teste!" e respondiam por **13 das 14 saídas** daquela semana — quem lesse o gráfico
veria uma semana produtiva que não houve. A marca (`excludedFromMetrics`) vive no
dado, aplicada por script sob revisão, porque reconhecê-las exige ler o texto do
cancelamento e regra de produto que lê texto escrito por gente é defeito esperando
data. Elas somem do **painel inteiro**, não só do gráfico: dois critérios na mesma
tela é como a tendência ficou meses mostrando zero — cada número parece plausível
sozinho. Continuam visíveis na Inbox e na Gestão, onde são registro do que houve.
Nada foi apagado; o script tem `--desfazer`.

**Verificado no emulador** com 8 semanas de histórico semeado: a conta da tela e uma
contagem independente feita direto no banco deram o mesmo número (29 abertas, 33
saídas, fila 20 → 16). O PDF gerencial passou a sair da **mesma** conta — duas contas
para a mesma pergunta acabariam discordando, e o PDF é o que sai da empresa.

**693 unitários (8 novos), 9 de integração, 11 E2E, build.**

## 2026-08-11/12 (o primeiro deploy voltou como captura de tela)

A reforma foi para produção e a produção respondeu. Quase tudo desta rodada é
conserto do que eu mesmo tinha acabado de subir — e o que não é conserto existe
para que o próximo relato não vire caça ao fantasma.

### Aviso de chuva — pedido da Thaís, para conferir os pontos de goteira

Chuva **observada**, não previsão. Duas fontes porque nenhuma sozinha resolve:
**METAR/SPECI do SBFZ** (NOAA, sem chave) responde *quando* — o SPECI sai no
instante em que a condição muda; **CEMADEN** (12 pluviômetros por bairro)
responde *onde e quanto*, mas leva 15–60 min. Vale a que chegar primeiro: chuva
aqui é de bairro, e exigir concordância perderia a pancada isolada — que é
justamente quando a goteira pinga.

Descartados com motivo medido: **INMET** não tem estação em Fortaleza (a operante
mais próxima é Guaramiranga, ~100 km — era isso que o HTTP 204 significava);
**FUNCEME** exige token e a documentação está fora do ar; **Open-Meteo** tem free
tier **não comercial**.

Três armadilhas dos dados, todas com teste: o painel do CEMADEN **congela** o
último valor quando a estação cai (um posto marcava 0,39 mm com carimbo de dois
dias antes — sem corte por idade, reportaria chuva para sempre); os carimbos são
UTC; e `-` no acumulado é **zero**, não "sem dado". O limiar é 0,4 mm (duas
básculas) aplicado como *leitura ≥ 0,4 **ou** acumulado da hora ≥ 0,4* — garoa de
0,2 mm acumula e dispara; báscula solta em hora seca, não.

Dois consertos depois do primeiro corte:

- **Queda de fonte apagava o que se sabia.** `desconhecido` era gravado por cima
  do último estado bom, e como as fontes caem (o METAR devolveu 502 naquele dia),
  a sequência virava `não-chovendo → desconhecido → chovendo` — e sair de
  `desconhecido` **não** conta como "começou". Ou seja: **a primeira chuva depois
  de qualquer queda passava em silêncio.** Agora leitura boa manda e
  `desconhecido` preserva; de quebra, queda no MEIO da chuva não produz um
  segundo "começou" quando a fonte volta.
- **Quem envia é o servidor**, em `?route=rain-alert`, como os outros três
  agendados. A primeira versão enviava do script do workflow — seriam dois
  lugares com credencial do Gmail e duas cópias da mesma regra discordando com o
  tempo. O script local virou **ensaio**: lê as fontes e mostra o e-mail que
  sairia, sem enviar nada.

### A recusa também vira registro

Chegou "às vezes ocorrem alguns erros quando atualizamos" e não havia como
responder: `writeAuditLog` só rodava no caminho de **sucesso**. Toda recusa do
PATCH morria na tela de quem tentou. Dá para medir 280 OS e provar que só 2 têm
status divergente do histórico — e não dá para dizer o que falhou para uma pessoa
numa terça-feira. Agora grava `tickets.update.rejected` com motivo, de → para e
os campos do patch (404 e 403 ficam fora de propósito). Não conserta o erro do
relato; torna o próximo diagnosticável.

### O último 500 fixo

`/api/email/health` sem credencial devolvia o texto **certo** ("Token de
autenticação ausente") com status **500** — quem olhava o código via falha do
servidor onde havia sessão vencida. Terceira encarnação do mesmo defeito; era o
último `sendJson(res, 500` do arquivo, agora são zero. Achado por sonda na
produção depois do deploy, não por teste.

### A tabela da Gestão voltou a caber na tela

Estrago meu: acrescentei duas colunas (Responsável e Ações) numa tabela que já
tinha nove e não conferi a largura — 11 colunas, rolagem horizontal, e "Ações"
cortada na borda, justamente a coluna que existe para poupar clique.
Macrosserviço + Serviço viraram **uma** coluna (são hierárquicos: "Móveis" →
"Reposição"); Prioridade foi para a linha do solicitante (118 "Trivial" em 278 OS
não pagam coluna inteira); e o `whitespace-nowrap` do status — também meu, da
véspera — punha o selo de bloqueio LADO A LADO com o badge da etapa, inflando a
coluna sozinho. 11 colunas viraram 9 sem perder informação. Medido: 1366px →
tabela 1310px; 1280px → 1209px. Ações ficou fixa à direita.

### "Não está atualizando o status" — eram três defeitos, todos meus

Dois relatos no mesmo dia (Thiers e o dono), uma captura de tela, e por trás
**três** causas diferentes — todas herdadas da retirada da aprovação da diretoria,
por não ter procurado quem mais apontava para as etapas aposentadas.

1. **O parecer técnico apontava para etapa aposentada.** Com diretor selecionado,
   o envio ia para `WAITING_SOLUTION_APPROVAL`, que saiu do fluxo e o servidor
   **recusa com 409**. Para essas OS, "Enviar para Aprovação" não movia nada — e
   os rótulos ainda anunciavam o destino morto. Texto que promete o que o servidor
   recusa é como se descobre um bug tarde demais.
2. **OS encerrada ficava congelada.** O seletor vinha `disabled={isClosed}` e o
   código LOGO ABAIXO montava as opções de reabertura. Duas partes do mesmo
   arquivo discordando, e a que travava ganhava. Encerrar por engano é comum;
   ficar preso no engano não pode ser o preço.
3. **"Cancelar" cancelava a troca inteira, em silêncio.** O diálogo se chama
   "Avisar o solicitante?" — ali, "Cancelar" se lê como *cancelar o e-mail*, e ele
   cancelava a **etapa**, sem toast nenhum. A pessoa clica, nada acontece, e
   conclui que o sistema não deixa alterar. Duas pessoas caíram nisso no mesmo
   dia. O botão passou a dizer o que faz — **"Não alterar a etapa"** — e desistir
   deixou de ser mudo: *A etapa continua em "X" — nada foi alterado.*

### O E2E que faltava — e o quarto defeito, achado ao escrevê-lo

Os três tinham em comum não ter teste: o spec de ciclo crítico encerra a OS pelo
**Financeiro**, e o seletor da Inbox — por onde a operação realmente mexe — nunca
foi exercitado. Entraram quatro testes, um por defeito mais o caminho normal.

Escrever o teste achou o quarto: o **campo de motivo** continuava preso em
`isClosed`. Na OS encerrada dava para escolher a nova etapa e não para digitar a
justificativa obrigatória — o cadeado tinha mudado de lugar, não saído. Sem o
E2E, isso iria para produção como "consertado". O seletor também ganhou nome
(`Nova etapa da OS`): sem ele era indistinguível dos filtros da lista, para
leitor de tela e para teste — o Playwright pegou o filtro em vez dele.

**Suíte: 685 unitários, 9 de integração, 11 E2E (58s), build.**

## 2026-08-10/11 (o que o uso ensinou: a Inbox assustava, e o rótulo virava álibi)

Duas rodadas guiadas por gente usando o sistema — a primeira por reclamação, a
segunda por uma revisão adversarial que pegou um buraco no que eu tinha acabado
de entregar.

### Os quatro achados de quem usa

Reportados pelo dono depois de usar. Os três primeiros eram bugs; medi todos.

- **Busca não achava pelo título do e-mail.** Ao criar a OS, o parser remove o
  `Re:` e o `[SEDE]`: no Gmail está `Re: [SUL 3]-Solicitação de bancos`, na OS
  ficou `Solicitação de bancos`. A busca comparava a frase inteira com
  `includes()`, então o texto colado nunca casava. Agora o termo vira palavras,
  todas precisam aparecer, sem acento — e a sede entra no que é vasculhado.
- **Respostas em inglês.** Duas fontes: o padrão `error instanceof Error ?
  error.message : '...'` repetido em **51 lugares** mostrava qualquer erro cru
  (`Failed to fetch`, `Firebase: Error (auth/…)`) no meio de uma tela em
  português; e a tela de Saúde de E-mail imprimia o log do backend literalmente —
  **44 ocorrências** desde 01/08 de `Firebase ID token has expired…`. Agora só
  chega à tela o que alguém escreveu para uma pessoa ler (`UserFacingError`), e o
  log técnico ganha explicação em português com o original embaixo.
- **E-mail com a sede fora do início era descartado.** `Re: SOLICITAÇÃO DE COMPRA
  [BS]` morreu com "assunto sem [SEDE] reconhecida". O parser passou a devolver
  candidatos (início, meio, fim) e quem tem o catálogo escolhe.
- **Relatório com filtro de status** (era pedido, não bug): entraram etapa,
  urgência e equipe, e o PDF passou a **imprimir o recorte inteiro** — relatório
  filtrado que não diz que está filtrado passa por retrato da empresa toda.

### A Inbox intimidava — e o log confirmou

Medida que decidiu: **trocar etapa é 85% de tudo que um Gestor faz** (340 de 402
ações desde 01/05). Para isso ele atravessava uma tela de 3.000 linhas.

Ver conversa, responder, trocar etapa e definir responsável passaram para a
própria tela de **Gestão**. Nada foi reimplementado: a conversa usa o mesmo
serviço de envio da Inbox, a etapa usa as mesmas permissões e a mesma escrita.
Segundo botão não pode virar segunda regra — e por isso a trava de classificação
saiu de dentro do `handleSend` para `motivoQueImpedeEtapa`, consultada pelos dois.

### Responsável — e a regra que impede o rótulo de virar teatro

180 das 195 OS vivas já tinham **equipe**, e isso não moveu nenhuma das 155
paradas há 39 dias: 154 delas TÊM equipe. Equipe responde pelo trabalho; pessoa
responde pelo prazo. Entrou `responsible`, com filtro (inclusive "sem
responsável") e coluna clicável.

O gpt-5.6-sol revisou e achou o buraco: **preencher os 154 em lote apagaria o
alerta sem mover nenhuma OS**. Entrou a regra espelho — *tem responsável e mesmo
assim não andou*. Assumir **reinicia o relógio** (`responsible.setAt`), senão a
cobrança cairia sobre quem acabou de fazer a coisa certa. Simulado contra
produção: 138 hoje → 0 ao atribuir → **138 de volta 8 dias depois, com nome**.

### Cada regra com o seu relógio

Também da revisão: *"backfill de um `lastInboundAt` genérico usado para tudo cria
precisão aparente com semântica errada"*.

- **Escrituração deixou de contar como movimento.** Entradas `system` e
  `field_change` são o que o sistema anota *sobre* a OS — e definir responsável
  escreve uma delas, que sozinha zeraria o relógio de "sem andamento". O rótulo
  não pode ser o próprio álibi. Medido: **124 das 195 (64%)** tiveram o relógio
  corrigido; a escrituração escondia **10 dias na mediana**, 74 no máximo.
- **`stageEnteredAt`**, carimbado pelo servidor na transição que ele validou.
  "Parada" e "parada nesta etapa" são perguntas diferentes: as 158 em Parecer
  Técnico têm 280 mensagens internas entre elas.

### O bloqueio invisível

**88 das 158** OS em Parecer Técnico não avançam por falta de classificação — e o
aviso só aparecia para quem tentasse avançar. Agora o bloqueio aparece na lista, e
o modal **classifica e avança na mesma escrita** (duas escritas deixariam a OS
classificada e parada se a segunda falhasse).

### O que o sistema é

Decisão do dono, e ela corrigiu o que eu tinha acabado de subir: *"o Serv3 não vai
ser responsável por cobrar, e sim por registrar"*.

Os rótulos viraram constatação — "Cobrar andamento" → **"Sem andamento"**, "Cobrar
retorno" → **"Retorno pendente"**. Rótulo que dá ordem promete uma autoridade que o
sistema não tem. E a regra morta `cobrar-retorno` (0 de 278 OS, sem nenhum gatilho
no código) voltou como **registro**: a pessoa marca que espera resposta, o sistema
guarda a data e devolve a OS em 3 dias úteis. Não manda e-mail, não verifica se o
pedido existiu.

### Backfill aplicado

`responsible.setAt` em **38 OS**. Descoberto no meio do caminho: o campo subiu e a
operação começou a usar no mesmo dia — 37 OS já tinham responsável, todas
atribuídas naquele dia, nenhuma com data. Sem o backfill, 23 seriam cobradas por
"sem andamento" no dia em que alguém as assumiu.

### Avisos

Aviso por tela foi **descartado** — as ações subiram sem aviso nenhum e 37 OS
ganharam responsável no mesmo dia; descoberta não era o problema, e banner vira
móvel que ninguém remove. No lugar: o subtítulo da Gestão, que dizia *"clique para
abrir"* quando o ponto passou a ser não precisar abrir, e o aviso `2026.08.2`
atualizado com o que existe de verdade.

**Suíte ao fim:** 680 unitários, 9 de integração, 7 E2E (verdes em 46s).

## 2026-08-01..07 (a reforma: de sistema de ETAPAS para sistema de ACOMPANHAMENTO)

A pergunta que o Serv3 responde deixou de ser *"em que fase está esta OS"* e
passou a ser *"o que precisa acontecer, e o que ficou sem resposta"*. A medida
que motivou tudo: **163 das 270 OS paradas na etapa 2**, e **234 das 270**
nascidas de e-mail — a esteira de etapas descrevia um processo que ninguém
seguia.

### A tela `Hoje` (`src/views/TodayView.tsx`)

Agrupa por AÇÃO, não por fase: Vencidas / Hoje / Aguardando a sede / Próximos 7
dias / Suspensas / **Sem próxima ação** — este último é o grupo que o sistema
antigo não conseguia mostrar, e é onde mora o esquecimento. Entrou atrás de
porta Admin; abre para o Gestor no passo seguinte.

Junto vieram **suspensão com prazo** (7 motivos, volta sozinha ao vencer) e
**compromisso de fornecedor** (data prometida, confirmação de comparecimento).
`sem-confirmacao` é derivado do relógio, nunca gravado.

- Bug de nascença, achado na revisão: o relógio da tela estava **congelado**
  (`useMemo(() => new Date(), [])`). Visita nenhuma virava "Aguardando a sede",
  suspensão nenhuma vencia, e depois da meia-noite o cabeçalho dizia ontem.

### A atenção operacional (`api/_lib/operationalAttention.js`)

O sistema **propõe** a próxima ação a partir do que já aconteceu — chegou
mensagem, alguém prometeu vir, a suspensão venceu — e diz **por que** propôs. A
pessoa corrige com um clique (`feito` / `adiado` / `não se aplica`), e a correção
vence a regra. Projeção, não estado: recalculada em transação, com
`ruleVersion` e `attentionStaleAt` para não mentir em silêncio quando falha.

- `LEGACY_ATTENTION_DAYS = 7` saiu de um dry-run contra produção: sem o corte,
  **78% das OS nasceriam atrasadas** e o primeiro dia seria uma pauta de 200
  itens — que ninguém lê. Com ele, ~20.

### A aprovação da diretoria saiu da esteira

Não havia **nenhum** Diretor cadastrado; `directorEmails` estava preenchido em 1
das 270 OS, com endereço de teste. A autorização real sempre aconteceu por
e-mail — agora é lida de lá (`api/_lib/authorization.js`): quando alguém de uma
lista que o gestor cadastra responde "autorizado" / "pode seguir", o sistema
registra na OS **com a frase exata**. Ele registra; quem decide continua sendo
a pessoa.

As três etapas viraram estados aposentados (servidor recusa entrada), as 2 OS
presas foram movidas por script com explicação no histórico, e os 4 testes E2E
saíram junto com a tela — teste verde para tela que não existe é pior que
teste nenhum.

### Nenhum e-mail se perde mais

23 mensagens sobre goteira e portão chegaram, não casaram com nenhuma OS e
sumiram **em silêncio**, com quem escreveu achando que tinha avisado. Agora vão
para uma fila na Inbox: vincular a uma OS, abrir uma nova, ou dispensar.

Outros dois buracos da mesma família: **261 devoluções (bounce) cegas** — o
Gmail manda a NDR em HTML e as regexes liam só texto puro — e os carimbos
`lastInboundAt` / `lastOutboundAt`, que agora alimentam a atenção.

### Água e lugar saem do texto

`waterIssue` e 26 tags de local (telhado, pátio, biblioteca…) reconhecidos no
próprio pedido, sem caixinha para marcar. É o que permite dizer "a terceira
goteira no mesmo telhado". Backfill aplicado em 13 OS.

### Código

- Inbox: **4.522 → 3.091 linhas**; cotação, contrato, medição e pagamento
  voltaram para as telas de Financeiro. A Inbox ficou com o que ela é no dia a
  dia: conversa e triagem.
- Uma fonte por conceito: `api/_lib/dates.js` (6 cópias de `toDateOrNull`),
  `src/constants/ticketLifecycle.ts`, destinatários.
- SendGrid removido — Gmail é o único provedor; havia dois caminhos e um deles
  não era exercitado.
- Aviso automático de chuva em Fortaleza (`RAIN_ALERT_TO`).
- Furo de território que eu mesmo abri em `?route=commitments` (GET/POST/PATCH
  sem `canUserAccessTicket`), fechado nos três verbos antes de qualquer deploy.

### Pendências desta reforma

Backfill da atenção (`?route=rebuild-attention`, dry-run primeiro) **depois** do
deploy; os e-mails dos autorizadores, que só o gestor tem; e avisar a sede antes
de subir — **60 e-mails represados desde 28/07 saem de uma vez**.

## 2026-07-31 (conversa encaminhada era descartada — conserto + reparo do passado)

Reportado a partir da **OS-0289** ("Tapumes salas de aula"): a OS nasceu com
quatro linhas de protocolo — *"Bom dia, Serv3 em cópia"* — e perdeu o pedido
original, as fotos e seis meses de decisões. Os anexos vieram; a conversa não.

### A causa: dois defeitos empilhados

1. O Gmail escreve **`Forwarded Conversation`** ao encaminhar uma *thread*
   inteira. O parser só reconhecia `forwarded message` / `mensagem encaminhada`.
2. O bloco vem **dentro da citação** (prefixo `>`), então nem o marcador era
   visível para a regex.

Falhando o reconhecimento, o texto caía no filtro de citação — que descarta toda
linha iniciada por `>`, ou seja, a conversa inteira.

**Não era caso isolado**: 119 de 801 e-mails de entrada (15%), afetando 44 OS.

### O conserto (`api/_lib/inboundBody.js`)

- `stripQuoteMarkers` desmarca a citação **antes** de procurar o encaminhamento;
  marcador passou a aceitar `Forwarded Conversation` e `Conversa encaminhada`.
- O **prefácio é limpo dentro do extrator**, não depois: o `Atenciosamente,` de
  quem encaminha derrubava junto toda a conversa encaminhada.
- `dropContactNoiseLines` saiu de dentro de `stripSignature`. O corpo encaminhado
  precisa do filtro de contato, mas **não** pode sofrer o corte na despedida —
  ali "Atenciosamente" é de um participante do meio da conversa.
- `sanitizeInboundLines` redige endereço em **todos** os caminhos. A lista de
  destinatários que o Gmail quebra em várias linhas não tem rótulo `Para:` e
  escapava; os cabeçalhos `De:`/`Date:` ficam, sem os endereços, porque a
  atribuição é o que dá sentido a uma conversa de decisão.
- `tidyInboundText` roda **por último** (o corte de assinatura depende de o
  marcador `[image: ...]` ainda existir): tira o asterisco do negrito achatado,
  o marcador de imagem inline e junta o cabeçalho de citação quebrado.

Suíte: **335 → 357 unitários**.

### O reparo do passado

O e-mail cru está guardado em `ticketInbound`, então deu para reprocessar sem
voltar ao Gmail. O endpoint `reprocess-inbound` **não** servia: `appendTicketHistory`
deduplica por id, então as entradas truncadas seriam puladas.

- `npm run infra:inbound:measure` — medição somente leitura.
- `npm run infra:inbound:repair` — **dry-run por padrão**, `--apply` para escrever,
  `--os=OS-XXXX` para limitar.

Reescrever histórico contraria a regra do sistema, e a justificativa é que o texto
gravado é **artefato de parsing**, não o que a pessoa escreveu — o original segue
intacto. Trava: só reescreve quando o **núcleo** do texto atual está contido no
novo, comparando os dois lados com a mesma normalização. O que não passa é listado
e não é tocado. Cada entrada leva `repairedAt`/`repairedBy`/`repairedFromLength`.

**Resultado em produção: 137 entradas reparadas em 52 OS, zero endereço vazado,
4 bloqueadas** (OS-0056, OS-0057, OS-0059, OS-0063) para revisão manual.

⚠️ Dois erros pegos pela verificação, não pelo planejamento: o primeiro `--apply`
gravou endereços em 60 entradas (o prefácio não era redigido), e o pareamento caía
no `-c1` para respostas cujo `mail-<messageId>` não existia — a trava rejeitou
todas, então nada foi corrompido. Rodar **uma OS antes do lote** foi o que expôs
os dois.

## 2026-07-29/30 (rework: desenho, nenhuma linha de código)

Nada aqui foi implementado. Este bloco existe para que a próxima pessoa que abrir
o repositório saiba **por que** a próxima leva de mudanças não é uma correção, e
para que as decisões não vivam só na cabeça de quem participou das conversas.
Desenho completo em `Serv3 — Rework Agenda Operacional` (vault).

### O diagnóstico

O sistema organiza as OS **por etapa** e responde bem *"em que etapa está a OS
X"*. Com ~210 OS abertas (~130 Colégio, ~80 Faculdade), a pergunta que a operação
faz de manhã é outra: *"o que precisa acontecer hoje, onde e por quem"*. Para
respondê-la hoje é preciso abrir ticket por ticket — ninguém faz isso, e a agenda
real vive em telefonema e memória.

É descompasso de **escopo, não de qualidade**. Abertura por e-mail sem treinar
ninguém, a conversa como histórico, token público, comandos transacionais, escopo
territorial no servidor, fila de e-mail e a suíte de testes — tudo isso
permanece. Muda a tela central, não o motor.

### A regra única

> Toda OS ativa tem uma **próxima ação com data**. Não ter é a exceção que
> aparece na tela.

É a única regra nova que a equipe precisa entender; o resto do desenho é
consequência dela. "Sem próxima ação" vira a métrica principal — e é também a
**mais fácil de maquiar** (basta marcar qualquer data), por isso anda sempre
junto do tempo parado de cada OS.

### Decisões de produto (tomadas pelo dono)

- **Larissa → Colégio · Thaís → Faculdade** definem a próxima ação das OS paradas.
- Escala por e-mail para Larissa, Thaís e Murilo quando a sede não responde.
- **Faltas de fornecedor são informativas, não punitivas** — servem para escolher
  fornecedor, não para cobrar gestor.
- **Não** troca fornecedor depois do contrato aprovado.
- **Sem IA no sistema**, por custo.
- Motivo obrigatório por transição segue **descartado** (geraria preenchimento de
  fachada) — decidido na 4ª auditoria e reconfirmado aqui.

### Achados das consultas adversariais que mudam requisito

- **"Apareceu" não é sucesso.** O fornecedor chega, olha o serviço, diz que
  faltou material e vai embora; alguém marca "apareceu" e o sistema fica verde
  sem nada instalado. Exige um segundo desfecho depois da chegada (concluiu ·
  parcial · não executou · faltou material/acesso · resolvido pela sede).
- **Não alterar estado por GET.** Filtros de segurança de e-mail corporativo
  abrem links automaticamente; um botão "não apareceu" que grava direto do e-mail
  registraria faltas que ninguém informou. O link abre página e confirma por POST.
- **Volume de e-mail é o risco nº 1**: 80 a 114/dia no desenho ingênuo. Cortes:
  alerta no horário só ao coordenador · e-mail individual só com falta
  **confirmada** · atrasos internos em digest (11h30/16h30) · **nenhum e-mail
  quando corre bem** · uma visita que atende 3 OS é **um** compromisso, não três.
- **Sem confirmação ≠ falta.** Misturar os dois corrompe o histórico do
  fornecedor, que é justamente o dado usado depois para decidir quem continua
  atendendo.

### Impactos previstos no código

- **Split Colégio/Faculdade já existe**: campo `group` do catálogo (`operacao` vs
  `universidade`) — verificado em `api/_lib/catalogDefaults.js`. Sem campo novo,
  sem migração.
- **Cobrança por WhatsApp**: `wa.me/<numero>?text=` com a mensagem redigida pelo
  sistema (OS, sede, o que era, quando era, que não veio). O campo *Contato* do
  cadastro de terceiros (`src/views/inbox/ThirdPartyModal.tsx`) **continua livre**
  — extrai-se os dígitos; quando não parseia (sem DDD, ramal grudado), o botão
  fica apagado com tooltip, nunca link quebrado. `[Registrar cobrança]` é o botão
  primário: o WhatsApp acontece fora do sistema, e o que alimenta o Serv3 é o
  registro.
- **Aviso de chuva para pontos de goteira** (pedido da Thaís): lista mantida por
  ela, **não presa à OS** — goteira é propriedade do telhado; presa à OS, o ponto
  some quando a OS fecha e o conserto volta. Fonte **INMET**
  (`apiprevmet3.inmet.gov.br/previsao/2304400`, dado aberto, sem chave, testado).
  **Open-Meteo descartado**: free tier é não-comercial, e o sistema roda na
  operação de uma empresa. Cabe no worker do GitHub Actions — não gasta função
  nova na Vercel (12/12 no Hobby).

### Revisões após a auditoria final do desenho

O desenho consolidado passou por uma auditoria adversarial antes de virar código.
Três achados mudam **schema** e por isso foram incorporados agora — os demais
viraram backlog registrado no vault.

**1. `attentionState` (`ativa` · `esperando` · `impedida`).** A regra única tirou
a priorização mas não tirou a fila: se toda OS precisa de próxima ação, as menos
importantes ganham data fabricada (*"revisar em 30 dias"*) e a decisão de
prioridade deixa de ser declarada **e auditável**. Três valores resolvem sem
eleição manual, sem carteira e sem limite de WIP. De quebra, `esperando` faz a
espera legítima (material, aprovação, prazo externo) parar de exigir data
inventada — que era a origem da maquiagem.

**2. Compromisso ↔ OS é muitos-para-muitos.** Contradição interna do desenho:
*"toda OS tem uma única próxima ação"* não convive com *"uma visita que atende 3
OS é um compromisso"* — e essa segunda é o corte que segura o volume de e-mail.
No schema, `commitment` liga a N OS; na interface, cada OS exibe **uma ação
primária** apenas para ordenar a agenda. **Precisa nascer assim**: 1:1 virando
N:N depois é migração de dados, não refactor.

**3. Cobrança em dois tempos.** Com `[Registrar cobrança]` como ação primária era
possível gravar a cobrança **antes** de cobrar — registra, abre o WhatsApp, é
interrompido, e o sistema contabiliza atuação que não houve, contaminando
justamente a métrica que existe para proteger quem cobrou. Agora **Cobrar** grava
`tentativa iniciada` (autor, hora, canal) e abre o WhatsApp; o desfecho fica
pendente no card (respondeu · não respondeu · nova data prometida). Um clique em
`wa.me` **não** conta como cobrança concluída — sem API não há prova de envio.

**Pressuposto ainda não validado, e que derruba o projeto se for falso**: que os
coordenadores das sedes respondem com regularidade. Sem isso, "sem confirmação"
não distingue fornecedor faltoso de coordenador ausente, e a cobrança volta a
depender de ligação de verificação — que é a economia inteira do rework. É o que
o piloto precisa medir.

### Pré-requisitos que não são código

1. **Uma semana de baseline no papel** antes de qualquer implementação: quantas
   ligações de cobrança por dia e em quantas o fornecedor não atende. Sem número
   de partida, em 30 dias teremos sensação de melhora, não prova.
   Junto dela, um **piloto pequeno** — uma gestora, duas ou três sedes — para
   medir a taxa de resposta das sedes antes de o desenho depender dela.
2. **Política de responsabilidade explícita**: falta de fornecedor não pode pesar
   contra quem cobrou no prazo. Sem isso dito em voz alta, a equipe evita criar
   compromissos para não gerar cobrança — e o sistema fica limpo e vazio.

## 2026-07-28 (4ª auditoria — 8 correções, todas com teste de regressão)

Review externo trouxe 9 achados + 1 decisão de produto. **Verifiquei os nove no
código antes de mexer: zero falso positivo.** Regra combinada para a rodada:
*cada correção entra com o teste que reproduz o problema original* — e, quando
possível, verifiquei que o teste **reprova** o comportamento antigo.

### 🔐 P1 — Partição do PATCH de tickets por papel (`178be93`)
Havia UMA allow-list de campos para todos os papéis; o único recorte era
territorial. Na prática o **Diretor** — que só deveria aprovar, pelos comandos
transacionais — gravava prioridade, equipe, anexos, checklist de encerramento e
progresso de execução de qualquer OS do seu território. Quem aprova reescrevia o
que aprova.

Matriz agora explícita em `_lib/ticketPatchScope.js`: Admin tudo · Gestor
operacionais · **Diretor só `viewingBy` e entradas novas de `history`** · Usuario
nada. Antes de cortar, verifiquei que `canTransitionStatus` já bloqueava o
Diretor no status e que a tela de Aprovações só envia `viewingBy` — o corte não
tira nada que ele use. Revertendo a matriz, **20 dos 65 casos falham**.

### 💰 P1 — Andamento na Inbox vira comando transacional (`309b348`)
Eram três chamadas soltas (`savePayment` → `saveMeasurement` → `updateTicket`,
esta sem `await` e o bloco sem `catch`): falhar no meio deixava pagamento sem
medição, ou tudo gravado com a OS parada — e sem erro visível.

**O comando já existia e estava completo** (`recordMeasurement`); a FinanceView
já o usava e o InboxView tinha um **fork artesanal** do mesmo fluxo. Este commit
deleta o fork. +17 casos de integração: tudo junto, nada pela metade, replay que
não duplica e concorrência sem lost update.

### 🖥️ P2 — A interface parou de mentir (`3a06383`)
Onze ações fechavam modal e cantavam sucesso sem esperar a gravação. **O `await`
sozinho não resolvia** — e foi o E2E que pegou: `updateTicket` não lança, ele
captura o erro, reverte o update otimista e devolve `false`. Os `try/catch` que
escrevi primeiro eram código morto. A correção real é checar o retorno.
Best-effort declarado (heartbeat de `viewingBy`) ficou intacto, conforme
critério acordado.

### 📎 P1 — Exclusão de anexo atômica e com evidência protegida (`2c85048`)
O objeto era apagado primeiro e a referência saía pela TELA, numa segunda
chamada — falhar no meio deixava referência apontando para arquivo inexistente.
Invertido: **referência primeiro, transacional; objeto depois**. Se o Storage
falhar agora, não se desfaz nada — sobra binário órfão (lixo coletável) em vez de
reviver o que o usuário mandou remover; a auditoria grava `storageDeleted`.
Evidência aprovada passa a ser recusada com 409 e motivo (lançamento pago,
medição aprovada, cotação decidida, contrato aprovado).
⚠️ Erro que os testes pegaram: eu varria a subcoleção `history`, que na verdade
se chama `historyEntries` — as entradas ficariam órfãs.

### 🔔 P2 — Notificações: página cheia e estado que expira (`35f49dc`)
O `limit` era aplicado na query e o filtro de audiência/território só depois:
escopo estreito recebia **página vazia** e parava de paginar. Agora o scan
continua até juntar `limit` itens visíveis (teto de 5 rodadas). Os docs de
`notificationStates` ganharam `ttlAt` nos três pontos de escrita — eram lixo
perpétuo por usuário (débito da rodada anterior, que pôs TTL só na notificação).

### ✉️ P2 — Reprocessamento inbound é administrativo (`f45eccb`)
Aceitava Admin, Gestor e Diretor para uma operação que reescreve sede, thread e
histórico de várias OS numa janela de até 60 dias. Agora só Admin, com auditoria
permanente (quem, janela, resultado) — o `logEmailEvent` que já existia tem TTL
de 90 dias. **De brinde**: o `catch` do handler devolvia 400 para qualquer erro,
então 403 e 401 chegavam como "requisição inválida".

### 🧾 Decisão — `Usuario` não vê financeiro (`7b1bd16`)
`Usuario` é solicitante/representante de unidade: OS, timeline e indicadores
operacionais, sem contrato, pagamento, fornecedor ou valor. **O gate era só de
cliente** — o `GET /api/procurement` entregava tudo para qualquer autenticado no
território. `canUserReadFinancials` vira o ponto único e consulta uma permissão
explícita `canViewFinancials` ANTES do papel: liberar alguém no futuro é ligar a
flag, não ampliar a lista de papéis em silêncio.

### 📮 P2 — Starvation da outbox (`ae52879`)
Pior que o relatado: `.limit(100)` **sem `orderBy`** faz o Firestore devolver por
documentId — sempre os MESMOS cem. Com eles em backoff, os elegíveis atrás nunca
rodavam. Scan paginado por documentId resolve sem campo novo nem índice, e
portanto sem a armadilha do `availableAt` (documento sem o campo some de query
por desigualdade **e de `orderBy`** — introduzi-lo antes do backfill sumiria com
e-mail em silêncio).

### 🗺️ Medição do territorial legado (`cce3ce0`)
`sede` é gravado do `site.code` (`"ALD"`) mas o matcher normaliza para `"ald"`, e
o Firestore compara por igualdade exata. Só afeta OS **sem** `siteId`/`regionId`.
Script de **leitura pura** (`npm run infra:territory:measure`) classifica em cinco
baldes e sugere os ids que o backfill gravaria — medir antes de decidir se o
backfill se justifica.

### ❌ Descartado por decisão de produto
**Motivo obrigatório por transição**: exigir motivo geraria preenchimento de
fachada ("teste", ".") em quem já tem dificuldade com o básico — fricção sem
trilha real. O que existe continua: cancelamento pede motivo na tela e o
histórico automático registra autor e transição. **Não reabrir em auditorias.**

### 🧪 Cobertura
A suíte saiu de **230/53/9** para **323 unitários / 106 integração / 11 E2E**. As
quatro categorias que a auditoria apontou como ausentes passam a existir: falha
intermediária, autorização negativa por campo, fila saturada e consistência
Storage×Firestore.

## 2026-07-28 (fatiamento dos god-files + QA)

Quebra dos arquivos-elefante em módulos testáveis, uma mordida por vez, com a
suíte inteira entre elas. O critério de corte é sempre o mesmo: **sair primeiro o
que é puro** — vira teste sem emulador e sem React, e é justamente onde os bugs
de cálculo/parsing se escondiam sem cobertura.

### ✂️ `api/mail.js` — 3.032 → 2.786 linhas
- `_lib/emailThreading.js` (commit `9f48935`): assunto, threading e identidade de
  mensagem. Sustenta duas garantias — a resposta cair na mesma conversa
  (Message-Id/In-Reply-To/References) e o prefixo `OS-XXXX - SEDE` não duplicar a
  cada resposta. **+14 testes**.
- `_lib/inboundBody.js` (commit `93f504f`): limpeza do e-mail recebido — assinatura,
  histórico citado e cabeçalhos de encaminhamento. **+22 testes** nos casos que
  quebram de verdade: resposta curta que some junto com a citação, citação vazando
  para dentro da OS, chamado encaminhado perdendo o corpo. Dois testes fixam o guard
  `match.index > 0`: se o marcador abre a mensagem, **não** se corta — melhor
  devolver sujo que devolver vazio.

### ✂️ `src/views/FinanceView.tsx` — 2.641 → 2.258 linhas
- `src/utils/finance.ts` (commit `d45ba09`): o núcleo onde mora o dinheiro da obra —
  baseline, progresso, bruto acumulado, somas de lançamento, montagem dos lançamentos
  a partir das medições e apuração de garantia. Era código puro preso numa view de
  2 mil linhas, **sem um único teste**, apesar de já ter causado bug em produção.
  **+25 testes**, começando pela regressão do **drift de 99,99%** (a obra 100% paga
  travava em 99,99% porque reconstruir de `baseline × percent` com o percent a 2
  casas compunha o erro). O teste fixa as duas pontas: a soma real vence, e o
  `Math.max` continua sendo a rede para medição legada sem `grossValue`.
- `src/utils/financeClosure.ts` (commit `6a2ed66`): encerramento da OS — estado do
  checklist, as regras que **bloqueiam o lançamento final** e o relatório HTML.
  Extraído por script (não à mão) para eliminar erro de transcrição nas ~160 linhas
  do gerador de HTML. **+13 testes**: os bloqueios acumulam todos os pendentes de
  uma vez, OS encerrada continua avaliando o checklist, e o relatório **escapa** dado
  vindo do usuário (assunto com `<script>` sai como texto).
  ⚠️ Um teste documenta, sem endossar, que em `IN_PROGRESS` **nada bloqueia** o
  lançamento final mesmo com o checklist vazio — é o **P2 do backlog**, agora travado
  por teste para que mudá-lo seja decisão consciente e não regressão silenciosa.

### 🧪 QA — dois falsos-vermelhos eliminados (commit `d4f8137`)
- **Flaky do login**: o assert do primeiro render pós-login usava o timeout global de
  5s e pagava o cold start (bundle + Auth do emulador). O spec de escopo de acesso,
  por rodar primeiro, era o que quebrava. Agora 20s só nesse assert — E2E 9/9 sem flaky.
- **Lint quebrado por artefato do E2E**: `playwright-report/` e `test-results/` não
  estavam no `ignores` do ESLint, então rodar o E2E antes do lint jogava bundles
  minificados no lint (5.277 problemas). Já estavam no `.gitignore`; faltava alinhar
  o ESLint. **Isso quebraria o CI**, onde a ordem é sempre essa.

Suíte ao fim: **208 unitários, 53 integração, 9 E2E**, tsc, ESLint e build.

**Em aberto**: o E2E de concorrência (duas decisões simultâneas na mesma rodada)
oscilou uma vez — a garantia central nunca falhou (exatamente uma decisão vence, e o
contrato reflete a cotação vencedora), mas a **perdedora** nem sempre devolveu 409.
Não reproduziu isolado (6× o teste, 3× o arquivo inteiro); só apareceu com a suíte
completa, sob mais carga do emulador. O assert agora reporta os statuses recebidos,
para que a próxima ocorrência diga qual foi. Nada foi afrouxado.

## 2026-07-23 (2ª auditoria — segurança + integridade)

Segunda passada adversarial: **5 auditores em paralelo** (segurança/authz, pipeline
de e-mail, núcleo de tickets, estado do frontend, telas de negócio) + **Fable como
auditor de regressões** de cada lote antes do commit (pegou 6 regressões reais e
corrigiu). Foco em fragilidades exploráveis e bugs de dados.

### 🔒 Backend — segurança externa e integridade (commit `4885942`)
- **Relay de phishing público fechado**: o e-mail de "Nova OS" (fluxo público, sem
  auth) não confia mais em html/assunto/CC/destinatário do cliente — a caixa
  corporativa assina DKIM, então isso era relay de phishing. Renderiza do doc do
  servidor e envia só ao solicitante (corpo/anexos/variáveis reconstruídos do lado
  do servidor, mantendo o e-mail correto).
- **SSRF/exfiltração de anexos**: `resolveOutboundAttachments` movido para DEPOIS do
  authz e restrito ao Storage da própria OS; removido o fallback `fetch(url)`
  arbitrária (era SSRF disparável até sem autenticação).
- **Injeção de header (Bcc oculto)**: Subject e Content-Type de anexo passam por
  `sanitizeHeaderValue` antes do raw MIME.
- **Mensagem-veneno (P0)**: corpo >1 MiB (thread reencaminhada N vezes) travava TODO
  o inbound em loop de reentrega. `truncateInboundBody` (Gmail + SendGrid) + try/catch
  por-mensagem (uma msg ruim não aborta o lote); sync não marca 'seen' em falha
  transitória (retenta no próximo ciclo).
- **Forja na duplicação**: a duplicação de OS copiava campos do payload do cliente —
  um gestor forjava sede/região/solicitante. Agora copia da OS de ORIGEM (servidor).
- **create() anti-sobrescrita**: criação de OS usa `create()` (não `set()`) — id de
  sequência regredida não sobrescreve mais uma OS real em silêncio.
- **Delete-cascade seguro**: só apaga paths de Storage da própria OS (path plantado
  em attachments/closureChecklist não destrói arquivo alheio).
- **Tracking público**: aprovar/reprovar só transita de "Aguardando aprovação da
  manutenção" (reprovar de "Aguardando pagamento" não devolve mais pra execução);
  aprovar tardio em "Aguardando pagamento" preservado.
- **XSS via anexo**: `sanitizeClientHistoryEntry` escova `attachments[].url`
  (bloqueia `javascript:`/`data:`).

### 🖥️ Frontend — moeda, vazamento público e perda de dados (commits `5fd7ed8`, `6aa7138`)
- **parseCurrency 100×**: `"1234.56"` (colado de planilha) virava R$ 123.456,00. O
  ponto agora só some quando é separador de milhar. +7 testes. (bug confirmado por 2
  auditores independentes.)
- **Vazamento na página PÚBLICA de tracking**: (a) só entradas system/field_change
  viram marco de status — mensagem do solicitante não cria mais marco falso nem some
  da timeline; (b) system/tech só aparecem com `visibility==='public'` explícito
  (opt-in) — histórico legado não vaza mais fornecedor/valor.
- **Composer não perde mais mensagem**: `updateTicket` retorna Promise<boolean>; o
  composer aguarda o PATCH antes de disparar e-mail e limpar o texto (falha de rede
  não perde a mensagem nem notifica solicitante/diretoria de algo não gravado).
- **Aditivo 2×**: aprovação de aditivo somava o valor duas vezes no contrato (corrida
  com o poll). `realizedValue` agora é derivado do conjunto de cotações aprovadas
  (idempotente). Follow-up: aprovação transacional server-side (Achado A do Fable).

### 🧭 Backlog remanescente (das 5 auditorias, ainda não corrigido)
P1: colisão de ids de cotação (nova rodada/aditivo sobrescreve docs da anterior no
Firestore). P2: obra 100% paga trava em 99,99% (drift de arredondamento); último
lançamento quitável em IN_PROGRESS sem validação; escopo territorial nas
storage.rules; audit log + history[] rumo ao teto de 1 MiB; aprovações sem guarda de
status (diretor age em OS já resolvida por corrida). P3: dismiss global de
notificação por qualquer usuário; GET de tracking sem rate-limit; iframe de preview
de template sem sandbox; deslocamentos de data UTC×Fortaleza em inputs.

## 2026-07-23 (P1 — testes)

### 🧹 ESLint (foco em bugs) + statusFlow travado + mais fatia do `mail.js`
Três melhorias estruturais:
- **ESLint** (o projeto não tinha): flat config enxuto, **foco em bug real** (variável/undefined, chaves duplicadas, código inalcançável, optional-chaining inseguro) com estilo relaxado — o `tsc` segue como gate de tipos, este é o de lógica. Rodou → 1 bug real corrigido (`no-unsafe-optional-chaining` no `ApprovalsView`, um `(Array.isArray(x?.a)?x?.a:[]).filter` que virou `(x?.a ?? []).filter`), 0 erros. `npm run lint:eslint` + passo no CI (falha só em erro).
- **Backlog de warnings zerado**: os ~69 warnings iniciais (quase tudo import/variável não-usada) foram limpos → **0 warnings**. Plugin `eslint-plugin-unused-imports` remove imports mortos no `--fix`; o restante saiu à mão (imports órfãos, destructures do editor de cotações que migraram pro `QuoteItemsSection`/contexto, funções internas mortas no `useQuoteEditor`, regex com escape inútil, `catch{}` já tratados). tsc + 61 testes + build seguem verdes.
- **statusFlow — fonte única na prática**: o enum de status vive em 2 lugares (front `as const` para o tipo-união, back JS puro; deploys separados impedem um arquivo único sem acoplar builds). Novo teste **trava os dois em sincronia** — mudar um status de um lado só = CI vermelho antes do merge.
- **`mail.js` −103 linhas**: parsing de assunto (`parseNewTicketSubject`/`parseTicketId`/`stripReplyForwardPrefixes`/`isLikelyThreadReply`) extraído para `api/_lib/inboundSubject.js` (puro + testado), mesmo padrão do matcher. God-file de 2.660 → 2.557 linhas.

### 🧩 Matcher de sede extraído para módulo puro e testado (`_lib/siteMatch.js`)
A lógica que casa o `[SEDE]` do assunto com o catálogo — origem de vários bugs de inbound (CESIU, PRÉ SUL, DT1, PQL 2/3…) — saiu do god-file `mail.js` (2.6k linhas) para `api/_lib/siteMatch.js`, pura e isolada: `matchSiteCode(siteCode, sites)`, `tightKey`, `SITE_ALIASES`. `resolveSiteContext` no `mail.js` agora só carrega o catálogo (cache) e delega. +19 testes cobrindo exato/apertado/apelido/substring/ruído. Comportamento idêntico (suíte confirma) — passo mecânico, mesmo padrão que dá pra repetir para fatiar o resto do `mail.js`.
- **Apelido por-sede no catálogo** (`site.aliases[]`): o matcher passa a casar por apelidos gravados no próprio doc da sede, com precedência sobre o mapa hardcoded — ou seja, **apelido novo sem precisar de deploy** (a dor recorrente: CESIU, PRÉ SUL, JV, PQL 2/3 exigiram deploy). Aditivo e seguro (nenhuma sede tem o campo hoje).
- **UI em Configurações → Regiões e Sedes**: cada sede ganhou um campo **"Apelidos no assunto do e-mail"** (texto separado por vírgula), os apelidos aparecem como chips na lista, e o "Editar" carrega os existentes. O admin adiciona um apelido pela tela; o inbound casa em até ~60s (TTL do cache do catálogo). Fecha o ciclo: **nunca mais precisar de código/deploy para um apelido novo.** (`api/catalog.js` persiste `aliases[]`; `SettingsView.tsx` + `CatalogSite`.)

### 🚫 Fim do erro engolido em silêncio — 8 `catch {}` agora deixam rastro
O padrão-raiz de quase todos os bugs da maratona: falha de operação engolida sem log. Varredura dos 17 `catch {}` do backend — **8 que engoliam falha real** (gravação de auditoria, log de evento de e-mail, notificação ao gestor, download/upload de anexo, exclusão no Storage, limpeza de lock) agora fazem `console.error` com contexto (vai pros logs da Vercel), mantendo o comportamento não-bloqueante. Os outros 9 são fallbacks legítimos (re-throw de `HttpError`, parse seguro de JSON/URL/MIME que retorna valor padrão) — deixados de propósito. Destaque: `auditLogs.js` (a própria auditoria falhava muda — apontado pelo Fable).

### 🤖 CI: `npm test` + typecheck + build a cada push (GitHub Actions)
Novo workflow `.github/workflows/tests.yml`: em push/PR na `main`, roda `npm ci` → `tsc --noEmit` → `vitest run` → `vite build` no Node 20. A regressão trava **antes do merge**, não em produção.

### 🧪 Suíte de testes unitários (vitest) dos módulos puros
Primeiro conjunto de testes unitários do repo — trava como regressão permanente (no CI, não em produção) a lógica que gerou os bugs desta maratona. **40 testes, 4 arquivos**, ambiente node, sem emulador. `npm test` (`vitest run`) + `npm run test:watch`.
- **Parsing do inbound** (`api/mail.js`): `parseNewTicketSubject` (incl. prefixos `Re:/Fwd:` e `Título:/Assunto:`), `parseTicketId`, `isLikelyThreadReply`, e o mapa `SITE_ALIASES` (CESIU→ALD, PRÉ SUL→PSUL, JV→PJF, PQL 2/3→PQL3…).
- **Fluxo de status** (`api/_lib/statusFlow.js`): `isValidStatus`, `canTransitionStatus` (Admin/Gestor livres, Diretor restrito ao fluxo dele).
- **Histórico/allow-list** (`api/tickets.js`): `sanitizeClientHistoryEntry` (força sender, coage type, preserva visibility ausente), `actorHistoryLabel`, `ALLOWED_TICKET_PATCH_FIELDS` (barra requesterEmail/subject/id…), `mergeTicketHistory` (dedup por id).
- **Utils** (`api/_lib/text.js`, `email.js`): `normalizeKey`, `slugFilename`, `firstEmail`, `parseEmailList`, `isValidEmail`.
- As funções puras testadas ganharam `export` (mudança sem efeito de runtime; o Vercel usa só o `export default`).

## 2026-07-10 (P0 — robustez)

### ⏱️ Editar horário de mensagem volta a persistir (#3)
Editar o horário de uma mensagem do histórico não gravava: o front reenviava o array inteiro e o merge dedup-por-id do servidor ignorava a alteração. Agora o front manda um campo dedicado `historyTimeEdit: {id, time}` (o array segue só para o update otimista local) e o servidor aplica **só o `time` daquela entrada** na transação — texto/sender/type/visibility imutáveis, e as demais entradas **não** são reescritas (sem o clobber de last-writer-wins que ocorreria ao reconciliar todos os horários da visão do cliente). `patchTicketInApi`/`updateTicket` ganham o extra; `handleUpdateHistoryItemTime` usa o novo caminho.

### 🧬 Duplicação server-side (fecha a forja de histórico no POST)
Fecha o último buraco que o Fable apontou: o POST autenticado aceitava `history` do cliente, então dava pra criar uma OS nova com histórico "oficial" inteiramente forjado. Agora:
- **Duplicação** manda só `duplicateFromTicketId`; o servidor lê a OS de origem (com **checagem de acesso territorial**, igual ao GET), copia a conversa **real** e adiciona a entrada de sistema. A duplicata começa **limpa**: reseta `status`, `closureChecklist`, `executionProgress`, `guarantee`, `preliminaryActions`, `viewingBy`.
- **Criação avulsa autenticada** (o "Nova OS" do painel, que usa o mesmo `PublicFormView`) agora passa pelo **rebuild completo** de `preparePublicTicketCreate` — antes ia por `normalizeTicketForStorage` cru (sem allow-list). Isso corrigiu de quebra uma **regressão de perda de dados** que o Fable pegou (o ramo inicial descartava a descrição do solicitante → página de acompanhamento vazia).
- `trackingToken` do cliente nunca é persistido; `duplicateFromTicketId` não vira campo do doc.
- Residual registrado (baixa, pré-existente): na duplicação os metadados (assunto/sede/solicitante) ainda vêm do payload do cliente — fechar isso exige copiar tudo da origem server-side.

### 🛡️ Blindagem do POST /api/tickets + sanitização de histórico (achados do Fable)
Auditoria adversarial (Fable, 3 rodadas) do fluxo de criação/edição de OS:
- **POST autenticado sem gate de papel** → qualquer 'Usuario' logado criava OS pelo caminho autenticado (sem rebuild, sem validação). Agora só **Admin/Gestor/Diretor** usam o caminho autenticado; papel não-gestor (ou sessão persistida no navegador que cai no formulário público) segue pelo caminho **público** (rebuild server-side + rate limit), não 403.
- **`trackingToken` aceito do cliente** no POST → dava pra criar uma OS com o token de **outra** (GET/PATCH público usam `limit(1)` → link do solicitante ficava não determinístico = sequestro). Agora é **sempre gerado no servidor**.
- **Histórico forjável no PATCH** → um Gestor/Diretor podia forjar entrada `type:'system'`, `sender:'Diretoria'`, `visibility:'public'` aparecendo na página pública como comunicação oficial. `sanitizeClientHistoryEntry`: nas entradas **novas**, coage `type` inválido e **força o `sender`** ao ator autenticado, no mesmo formato do front (`Nome (Papel)`) — mensagens legítimas não mudam, forja é bloqueada. **Não** toca em `visibility` ausente (senão esconderia marcos públicos que a página exibe por marcador de texto). `directorActorName` no ApprovalsView alinhado ao mesmo formato (sem flicker).
- **Residuais registrados** (baixa severidade, staff confiável): `time` de entrada nova é backdatável; `type:'customer'` renderiza como balão do solicitante (mitigado pelo sender real); e o POST autenticado ainda aceita histórico do cliente (necessário para a duplicação copiar a conversa real) — fechar de vez exige duplicação server-side. **#3 (editar horário de mensagem) fica pendente**: o front reenvia o array inteiro, então o certo é mandar só `{id, time}`.

### 🔒 Allow-list de campos no PATCH de tickets (+ para de reescrever a data de abertura)
- O `PATCH /api/tickets` usava **deny-list** (bloqueava só id/trackingToken/createdAt e territoriais). Campos sensíveis — `requesterEmail`, `requester`, `subject` — passavam: qualquer Gestor/Diretor com acesso à OS podia sobrescrevê-los. Trocado por **allow-list** (`ALLOWED_TICKET_PATCH_FIELDS`) montada a partir da enumeração exaustiva das 29 chamadas `updateTicket()` do front (23 campos legítimos + 4 territoriais restritos a Admin). Tudo fora da lista é descartado.
- **Bug de dados HIGH corrigido junto** (achado na auditoria com o Fable): o `normalizeTicketForStorage` injeta `time: agora` quando o campo não vem, e como `time` é editável, **todo PATCH parcial reescrevia a data de abertura da OS** — inclusive o heartbeat de `viewingBy` (45s). Medido em produção: **153 de 218 OS (70%) com a data de abertura corrompida** (desvios de +50 dias). O filtro agora só passa campo que o cliente **realmente enviou** (`hasOwnProperty(rawUpdates, field)`), estancando a corrupção. `createdAt` ficou intacto (fonte para eventual backfill).
- **Byte NUL cru** em `InboxView.tsx` (sentinela `att.url || '<NUL>'`) trocado por `''` — runtime idêntico, mas o arquivo volta a ser tratado como texto pelo tooling (grep/rg paravam em modo binário).
- Auditoria adversarial (Fable) confirmou: nenhum dos 23 campos legítimos foi esquecido, sensíveis barrados, filtro e gate de Admin corretos.

## 2026-07-10

### 📥 Mais apelidos de sede (revisão dos inbounds sem OS)
Revisão dos 620 inbounds registrados (125 sem OS): o ruído (NotaQuest/GitHub/alertas) segue descartado certo, mas 3 sedes reais ainda escapavam. Adicionados ao `SITE_ALIASES`: **`JV` → PJF**, **`PRÉ-JOVITA` → PJF**, **`PQL 2/3` → PQL3** (área compartilhada, decisão do time). Ainda pendente: pedidos reais que chegam **sem `[SEDE]`** no assunto (ex.: "Reforma do parquinho") — não há como rotear sem a marcação.

### 🔤 Parser aceita "Título:/Assunto:" antes do [SEDE]
Assuntos como "Título: [BS] …" (o `[SEDE]` não no início) não casavam, porque o parser exigia o colchete no começo. Agora o `parseNewTicketSubject` remove um rótulo `Título:/Titulo:/Assunto:/Subject:` além do `Re:/Fwd:`, em qualquer ordem, até estabilizar. Casos normais e sem colchete não são afetados (testado 9/9).

## 2026-07-09

### 📨 Chat sempre notifica; e-mail de status vira modal de confirmação
- **Sintoma**: escrever uma mensagem no modo público (aos interessados) não disparava e-mail — só salvava no histórico.
- **Causa**: o checkbox "Enviar e-mail de atualização" (rodapé do composer) gateava **o chat**, quando na verdade era pra controlar o e-mail de **mudança de status** (para não spammar). Começava desmarcado → a pessoa achava que tinha notificado, mas nada saía.
- **Correção** (desenho final, substitui a tentativa do checkbox-default):
  - **Chat sempre envia**: Responder (público, aos interessados) e Diretoria disparam o e-mail sempre — o propósito do modo é notificar. Removido o gate e o checkbox.
  - **Mudança manual de status** voltada pra fora (`Em andamento`/`Encerrada`/`Cancelada`, via `CUSTOMER_FACING_STATUSES`) abre um **modal de confirmação** com dois botões — **"Alterar e avisar solicitante"** / **"Alterar sem avisar"** — e **preview dos destinatários**. Transições internas de back-office não perguntam nem enviam. Implementado via promise-based modal (`requestStatusEmailDecision` + `ModalShell`) no `handleSend`. (`InboxView.tsx`)

### ✉️ Remetente com domínio próprio sem perder as respostas (Reply-To + CC fixo)
Permite trocar o "De:" dos e-mails (ex.: para um endereço `@dominio` profissional) **mantendo o recebimento na caixa atual** — sem retreinar ninguém a mandar OS para um endereço novo.
- **`GMAIL_REPLY_TO_EMAIL`** (novo, `gmailSend`): injeta `Reply-To` em todo envio. Quando o `GMAIL_FROM_EMAIL` é diferente da caixa que o sistema vigia, isto faz a resposta do cliente voltar para a caixa vigiada — cobre "Responder" **e** "Responder a todos". Sem ele, mudar o "De:" faria as respostas irem para o endereço novo e a OS não as receberia.
- **`TICKET_ALWAYS_CC_EMAIL`** (novo, `handleSend`): CC fixo da caixa de recebimento em toda conversa com o solicitante — redundância do Reply-To para o caso de "responder a todos". Adicionado **depois** do filtro de mailbox do sistema (senão seria removido) e sem duplicar quem já está no To/CC.
- Ambos **inertes com a variável vazia** (comportamento atual preservado). Loop de auto-envio segue coberto pelo filtro de rótulo `SENT`. Documentados no `.env.example`.

### 💸 Leituras do Firestore: ~200 mil/dia → poucos milhares (leitura incremental)
- **Sintoma**: ~200.000 leituras num único dia, com só 164 OS e 28 usuários.
- **Causa**: o painel faz polling a cada **10s** e, a cada ciclo, o servidor **relia a coleção inteira** de tickets (`readAccessibleTickets` → `collection('tickets').get()`, 164–165 docs no caminho Admin). Firestore cobra por documento: 165 × 6/min ≈ 59 mil leituras/hora por Admin com a aba aberta → ~3,5 h reproduzem os 200 mil.
- **Correções**: (1) intervalo do poll **10s → 30s** (`OPERATIONAL_POLL_INTERVAL_MS`). (2) **Leitura incremental**: o poll manda `?since=<último serverTime>` e o backend (`readTicketsChangedSince`) devolve só as OS com `updatedAt > since`; o front funde o delta na lista (`applyTicketDelta`). Carga completa só na 1ª vez, ao abrir uma tela, e a cada 5 min para reconciliar exclusões. Para não-Admin, filtra o escopo em memória (delta é minúsculo — dispensa índices compostos). Validado em produção: 165/165 OS têm `updatedAt`; delta de janela de 30s = **0 leituras**, 5 min = 1, 1 h = 4. Estimativa: **~200 mil → uns poucos milhares/dia** (bem abaixo do limite grátis de 50 mil).

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
