# Agendador externo para o ciclo operacional

> **Estado: ativo desde 24/08/2026.** O pinger roda o ciclo a cada 5 minutos e o
> `schedule:` do `ciclo-operacional.yml` foi removido — só o `workflow_dispatch:`
> ficou, para teste manual e como plano B. Os demais workflows agendados
> (`agenda-sedes`, `attention-sweep`, `gmail-watch-renew`, `resumos-operacao`,
> `revisao-semanal`) continuam no GitHub: são diários ou semanais, e o atraso de
> ~40 min não pesa neles.

## Por quê

O agendador do GitHub é *best-effort*. Medido em 24/08, pedindo uma execução a cada
5 minutos, ele entregou uma a cada **~40 minutos**:

| execução | horário | intervalo |
| --- | --- | --- |
| #232 | 11:40 | — |
| #233 | 12:21 | 41 min |
| #234 | 12:59 | 38 min |
| #235 | ~13:40 | 41 min |

E isso **refuta** a hipótese que motivou unificar os quatro workflows num só. A
medição anterior, com quatro agendamentos separados, está no comentário do
`ciclo-operacional.yml`:

| rota | antes (4 workflows) | depois (unificado) |
| --- | --- | --- |
| Gmail Sync | ~24 min | ~40 min — **pior** |
| Email Outbox | ~29 min | ~40 min — **pior** |
| Aviso de chuva | ~32 min | ~40 min — **pior** |
| Checagem de visitas | não apareceu em 1h40 | ~40 min — melhor |

Um agendamento sozinho **não** disputa melhor a cota: o GitHub simplesmente entrega
~40 min para agendamentos de alta frequência. O que a unificação de fato ganhou —
e continua valendo — é a **ordem**: a checagem cria o e-mail e a fila o envia
segundos depois, não meia hora depois.

O atraso não dói igual em todas:

| rota | quanto 40 min custa |
| --- | --- |
| Aviso de chuva | **muito** — é a única em que o minuto conta |
| Gmail Sync | **muito** — e-mail que chega vira OS só 40 min depois |
| Email Outbox | médio — mensagem já criada espera para sair |
| Checagem | pouco — a tolerância dela já é de 30 min |

## A rota

`POST /api/mail?route=ciclo` roda as quatro em ordem, numa execução só:

1. **chuva** — a única em que o minuto conta, e a mais barata;
2. **gmail-sync** — a entrada: e-mail que chegou vira OS;
3. **checagem-visitas** — o que gera mensagem (pergunta à sede, alerta de falta);
4. **outbox-worker** — a fila, que leva junto o que a checagem acabou de criar.

Ela existe para o pinger precisar de **uma URL só**. Quatro jobs separados
resolveriam a frequência mas perderiam a ordem — que é o ganho que sobrou.

**Cada etapa é isolada**: uma falha não derruba as seguintes. Sem isso, o Gmail fora
do ar levaria o aviso de chuva e a fila junto.

**Responde 500 se qualquer etapa falhou**, mesmo tendo feito o resto. É o pinger que
lê isso: 2xx para ele significa "está tudo bem", e um alerta que não dispara é pior
que não ter alerta. O corpo diz o que passou e o que não:

```json
{
  "ok": false,
  "falharam": ["gmail-sync"],
  "ms": 11143,
  "etapas": [
    { "etapa": "chuva", "status": 200, "ms": 11037, "resposta": { "enviado": false } },
    { "etapa": "gmail-sync", "status": 400, "ms": 28, "resposta": { "error": "..." } },
    { "etapa": "checagem-visitas", "status": 200, "ms": 66, "resposta": { "nadaAFazer": true } },
    { "etapa": "outbox-worker", "status": 200, "ms": 12, "resposta": { "sent": 0 } }
  ]
}
```

**Orçamento de 25s, e quem manda nele é o pinger.** A Vercel corta a função em 60s
(`maxDuration` no `vercel.json`), mas o agendador externo desiste antes — no
cron-job.org o teto do plano gratuito é **30s**. Se o ciclo passar disso, ele marca
falha *mesmo com o trabalho tendo sido feito*, e com "desabilitar após muitas
falhas" ligado o job se desliga sozinho. Alerta falso que derruba o agendador é pior
que a lentidão que ele denunciaria.

O orçamento é conferido *antes* de começar cada etapa: o que não couber fica para a
volta seguinte, declarado na resposta (`"pulada": true`) em vez de morrer no meio.
Com o ciclo a cada 5 minutos, adiar uma etapa custa pouco.

Medição local: ciclo completo em 2,9s, e a etapa mais lenta (chuva) em 11s no pior
caso observado.

`?simular=1` propaga para as quatro — útil para testar sem mandar e-mail.

## Configuração

### 1. Rotacione o `CRON_SECRET` primeiro

Não reaproveite o atual. Ele já foi exposto em texto puro e vai passar a morar num
terceiro.

Gere um segredo novo e troque nos dois lugares:

- **Vercel** → Settings › Environment Variables › `CRON_SECRET` (e redeploy);
- **GitHub** → Settings › Secrets and variables › Actions › `CRON_SECRET`.

Os dois precisam do mesmo valor enquanto os dois agendadores coexistirem.

### 2. Crie o job no pinger

Serve qualquer serviço que faça uma requisição agendada (cron-job.org, UptimeRobot,
EasyCron). O que ele precisa:

| campo | valor |
| --- | --- |
| URL | `https://serv3.vercel.app/api/mail?route=ciclo` |
| Método | `POST` |
| Cabeçalho | `Authorization: Bearer <o CRON_SECRET novo>` |
| Cabeçalho | `Content-Type: application/json` |
| Intervalo | 5 minutos |
| Tempo limite | 30s (o teto do plano gratuito — a rota cabe nele) |
| Salvar respostas no histórico | **ligado** |
| Alerta ao falhar | **ligado**, após 2 ou 3 falhas |

⚠️ **Salvar as respostas no histórico não é opcional na prática.** É no corpo que
mora o `falharam` e o `ms` de cada etapa. Sem isso, um ciclo vermelho diz apenas
"falhou", e descobrir QUAL das quatro etapas caiu vira advinhação.

⚠️ **Alertar após 2–3 falhas, não após 1.** Com o ciclo a cada 5 minutos, alertar na
primeira manda um e-mail a cada 5 minutos durante qualquer indisponibilidade — e
alerta que vira ruído é alerta que se aprende a ignorar.

⚠️ **"Tratar 3xx como sucesso" deve ficar DESLIGADO.** Um 308 significa que o POST
não rodou; contar como sucesso esconderia justamente o defeito.

⚠️ O segredo vai no **cabeçalho**, nunca na URL. URL aparece em log de servidor, em
histórico e no painel do próprio pinger.

⚠️ Se o serviço tiver opção de "seguir redirecionamento", **ligue**: a Vercel
redireciona domínio nu para www, e sem seguir todo POST vira 308 e nada roda.

### 3. Confira que rodou

O painel do pinger mostra o corpo da resposta. Procure `"ok": true` e olhe os `ms`
de cada etapa — é assim que se vê uma ficando lenta antes de começar a estourar.

### 4. Só então desligue o agendamento do GitHub — FEITO em 24/08

**Nesta ordem.** Desligar antes de confirmar que o pinger funciona deixa a operação
sem nenhum agendador.

Em `.github/workflows/ciclo-operacional.yml`, remova o bloco `schedule:` e **mantenha
o `workflow_dispatch:`** — o disparo manual continua sendo o caminho para testar.

Os workflows individuais (`rain-alert.yml`, `gmail-sync.yml`, etc.) já são só
`workflow_dispatch` e não precisam de nada.

## Se preferir não mover o segredo

**Cloud Scheduler do Google** manteria tudo dentro da conta de vocês, mas exige o
plano **Blaze** — o projeto está no Spark. Se migrarem, é a melhor opção: três jobs
no nível gratuito, e o segredo não sai do Google.

**Vercel Cron** não serve: no plano Hobby permite uma execução por dia.

**Aceitar os ~40 min** é decisão legítima. A ordem — que era o ganho principal —
continua garantida pela rota `?route=ciclo` de qualquer forma.
