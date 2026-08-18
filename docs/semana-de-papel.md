# A semana de papel

Cinco dias úteis medindo, à mão, quanto custa hoje o trabalho que o rework promete
eliminar. É o que o plano pede **antes** de qualquer código:

> *"A Larissa anota quantas ligações de cobrança faz por dia e em quantas o
> fornecedor não atende. Sem esse número de partida, daqui a 30 dias teremos
> sensação de melhora, não prova — e ninguém vai saber dizer se valeu a pena."*

## Por que ela não pode ser pulada

O circuito inteiro — e-mail das 07h, confirmação da sede, checagem dos 30 min,
botão Cobrar — existe para acabar com **uma** coisa: a ligação de verificação
("o fornecedor apareceu?") e a corrida atrás de quem não veio.

Sem contar quantas dessas ligações acontecem hoje, daqui a 30 dias não há como
responder "diminuiu?". Só dá para dizer que *parece* melhor — e impressão não
sustenta a conversa com a diretoria, que é exatamente quem vai perguntar se valeu.

⚠️ **Ela mede o ANTES.** Depois que o sistema novo entrar, o antes deixou de
existir e não volta.

## Quando fazer

Agora, e em paralelo com o ensaio do e-mail. Os dois primeiros passos —
`?simular=1` nos workflows e `EMAIL_MODO=sombra` — **não produzem efeito nenhum na
operação**: o sistema calcula de verdade, ninguém recebe nada. A semana corre no
papel enquanto o canal é validado, sem uma coisa contaminar a outra.

## O que anotar

Uma linha por cobrança. Não por OS, não por dia — **por tentativa de contato**.

| Campo | Exemplo | Por que |
|---|---|---|
| Data e hora | 19/08 09h40 | mostra a hora do dia em que a cobrança se concentra |
| OS | OS-0184 | liga ao dado que o sistema já tem |
| Fornecedor | Elétrica Ceará | o histórico por fornecedor é o que decide quem continua atendendo |
| Canal | ligação / WhatsApp | o plano aposta que WhatsApp responde mais — isto testa a aposta |
| Duração | ~4 min | o custo real não é a ligação, é a soma delas |
| Respondeu? | sim / não | a taxa de não-resposta é o número mais importante da folha |
| Nova data? | 22/08 / não | cobrança sem nova data não resolveu nada |
| 2ª tentativa? | sim / não | mede o retrabalho, que é o que mais cansa |

**Anote também a ligação que não é cobrança de falta**: "só confirmando se vem
amanhã". É justamente essa que o e-mail das 07h deveria eliminar, e ela é a mais
fácil de esquecer de contar porque parece trivial.

## Como comparar depois

Por **taxa**, nunca por total — o volume de OS muda de mês para mês e o total
mente sozinho.

- cobranças por 100 visitas marcadas
- minutos de telefone por OS ativa
- % de tentativas sem resposta em 24h
- tempo médio até conseguir nova data
- % de cobranças que precisaram de 2ª tentativa

## O que NÃO fazer

**Não reconstruir a semana pelo histórico do WhatsApp depois.** Dá uma linha
retrospectiva, mas incompleta — ligação não deixa rastro, e "só confirmando" some.
Serve como referência auxiliar; não vale misturar com a medição prospectiva como
se fossem a mesma coisa.

**Não avisar a equipe que o número vai virar meta.** Medição que alguém sabe que
será cobrada deixa de medir a realidade e passa a medir o que a pessoa acha que
você quer ver.

---

## Folha para imprimir

Uma linha por tentativa de contato. Cinco dias úteis.

```
DATA/HORA  | OS       | FORNECEDOR        | CANAL | MIN | RESP? | NOVA DATA | 2ª TENT?
-----------|----------|-------------------|-------|-----|-------|-----------|---------
           |          |                   |       |     |       |           |
           |          |                   |       |     |       |           |
           |          |                   |       |     |       |           |
           |          |                   |       |     |       |           |
           |          |                   |       |     |       |           |
           |          |                   |       |     |       |           |
           |          |                   |       |     |       |           |
           |          |                   |       |     |       |           |
           |          |                   |       |     |       |           |
           |          |                   |       |     |       |           |
           |          |                   |       |     |       |           |
           |          |                   |       |     |       |           |
```

**No fim do dia, uma linha só:**

```
Dia ___/___    Total de tentativas: ___    Sem resposta: ___    Novas datas obtidas: ___
Alguma cobrança que você deixou de fazer por falta de tempo? Quantas? ___
```

A última pergunta é a que ninguém pensa em fazer, e é a que explica um número
baixo: cobrança que não aconteceu não aparece na contagem, e some do raciocínio
junto.
