# O ensaio antes da primeira entrega

Este sistema **nunca entregou um e-mail automático**: 213 documentos na fila, 100%
em dead-letter, zero enviados. Sobre esse canal foram construídos sete disparos e
duas páginas públicas.

## O que já resolve o volume — e não precisa de configuração

Quem segura o ruído é o próprio desenho, e isso já está construído e testado:

| Regra | Efeito |
|---|---|
| Sede sem nada marcado hoje | não recebe nada |
| Resumo vazio (dia sem falta, sem pendência) | não vira e-mail |
| Visita que atende 3 OS | 1 item, não 3 |
| Checagem dos 30 min | um e-mail por sede, não por visita |
| Alerta individual e imediato | existe **um** no sistema inteiro: a falta confirmada |

E toda rota aceita `?simular=1`, que calcula tudo e devolve quem receberia **sem
enviar nada**. Para conferir a lista antes de soltar, é isso que se usa.

## O que o `?simular=1` NÃO responde

Ele nem chega a enviar. Então não diz se a mensagem **chega**:

- cai em spam?
- o remetente aparece como quem?
- o link do botão abre a página certa no celular do coordenador?

Com 213 dead-letters de histórico, essas três não são hipotéticas.

## `EMAIL_MODO=sombra` — o ensaio

| Variável | Efeito |
|---|---|
| `EMAIL_MODO=sombra` + `EMAIL_SOMBRA_PARA=voce@...` | tudo sai pelo caminho **real** (Gmail, remetente, domínio, link), mas para a sua caixa, com o assunto marcado `[SOMBRA -> destinatário-real]` |
| `EMAIL_MODO` ausente ou `aberto` | o normal — **é o padrão** |

`sombra` sem `EMAIL_SOMBRA_PARA` **suprime** em vez de enviar: quem pediu ensaio
não pode receber estreia por causa de uma variável faltando.

## `EMAIL_TIPOS_DESLIGADOS` — o interruptor por disparo

Vale em qualquer modo. Se a checagem das 30 min começar a incomodar as sedes numa
terça de manhã:

```
EMAIL_TIPOS_DESLIGADOS=checagem
```

Cala **só ela**, pela Vercel, sem deploy e sem parar os outros seis. A alternativa
seria reverter commit sob pressão.

Tipos: `agenda-sede` · `checagem` · `falta` · `resumo-agenda` ·
`resumo-sem-confirmacao` · `resumo-fim-do-dia` · `revisao-semanal` · `aviso-chuva` · `os`.

## A sequência sugerida

1. **`push`.** Nada dispara sozinho até um cron rodar.
2. **`?simular=1`** nos workflows, pelo Actions. Confere quem receberia, com dados
   reais, sem enviar nada.
3. **`EMAIL_MODO=sombra`** apontando para a sua caixa. Agora as mensagens saem de
   verdade — para você. É aqui que se descobre spam, remetente e link.
4. **Abrir a página de confirmação a partir do e-mail recebido** e verificar que o
   GET não grava: filtro de segurança abrindo o link sozinho não pode registrar
   falta. É a trava mais importante do desenho.
5. **Remover `EMAIL_MODO`.** A partir daí é o normal.

Piloto de uma sede se faz pelo **cadastro**, não por variável: os destinatários
saem de `siteIds`, então basta uma sede ter coordenador para só ela receber.

## As 213 dead-letters

**Não reprocessar automaticamente.** São de meses atrás: links vencidos, contexto
morto, gente que já mudou de sede. Reenviar em massa é a maneira mais rápida de
queimar a confiança no remetente no primeiro dia. Quarentena, inspeção, e
reconstruir só o que ainda fizer sentido.

## A linha de base, sem papel

O plano pedia uma semana anotando à mão quantas cobranças a gestora faz por dia.
Não é preciso: o botão **Cobrar** já grava tentativa, desfecho e horário — que são
exatamente as colunas daquela folha. Pedir para alguém anotar o que o sistema
registra sozinho é cobrar duas vezes pelo mesmo trabalho, e a segunda é a que
ninguém cumpre até sexta.

O que dá a linha de base é a ORDEM em que as coisas ligam:

```
EMAIL_TIPOS_DESLIGADOS=agenda-sede,checagem
```

Com isso o registro da cobrança funciona e os e-mails da sede ficam calados. A
operação segue como hoje — telefone, corrida atrás de quem não veio —, mas cada
cobrança fica gravada. **Duas semanas assim são o "antes".** Depois é só apagar a
variável: os e-mails da sede entram, e a comparação existe sem ninguém ter escrito
uma linha em papel.

⚠️ O número é PISO, não total: cobrança feita fora do sistema (ligação do celular,
conversa no corredor) não aparece. Enquanto o botão não for o caminho normal, ler
como total faz a operação parecer mais leve do que é.

`api/_lib/metricasDeCobranca.js` calcula o que a folha queria — tentativas,
cobranças concluídas, % sem resposta, % com nova data, mediana até o desfecho,
segundas tentativas — sempre em taxa além do total, porque o volume de OS muda de
mês para mês e o total mente sozinho.

## O que isto não resolve

- **A cota do Firestore.** O consumidor principal continua desconhecido. As
  varreduras novas custam ~288 leituras/dia, então não são elas.
- **Dado de produção nos testes.** Os 918 testes usam fixtures escritos à mão. O
  passo 2 é a primeira vez que o código toca a forma real dos dados.
