# Deploy escuro — como abrir a torneira do e-mail

Este sistema **nunca entregou um e-mail automático**. Eram 213 documentos na fila,
100% em dead-letter, zero enviados. Sobre esse canal foram construídos sete
disparos e duas páginas públicas.

Subir tudo aberto de uma vez significa descobrir autenticação, domínio, spam e link
quebrado com usuário real na frente — e, pior, **interpretar falha de entrega como
silêncio da sede**, que é exatamente o sinal que o sistema existe para ler.

Por isso o código sobe inteiro com a torneira fechada. Nada aqui exige redeploy:
tudo é variável de ambiente na Vercel, então voltar atrás é um toque.

## Os quatro modos

`EMAIL_MODO` — **o padrão é `sombra`**. Ambiente sem a variável é ambiente que
ninguém preparou, e o custo de errar para o lado seguro é um e-mail que não chegou.

| Modo | O que acontece |
|---|---|
| `desligado` | Nada sai. O sistema calcula tudo e devolve em `naoEntregues` quem teria recebido. |
| `sombra` | Tudo sai de verdade, mas para **uma** caixa, com o assunto marcado `[SOMBRA -> destinatário-real]`. Exige `EMAIL_SOMBRA_PARA`. |
| `piloto` | Só para quem está em `EMAIL_PILOTO_PESSOAS` ou nas sedes de `EMAIL_PILOTO_SEDES`. O resto é suprimido. |
| `aberto` | O normal. |

Modo escrito errado **cai em `sombra`**, não em `aberto`, e volta marcado como
`modoInvalido` no diagnóstico.

Interruptor extra, que vale em qualquer modo:
`EMAIL_TIPOS_DESLIGADOS=checagem,falta` cala um disparo específico sem fechar o
canal — serve para quando um deles se comporta mal às 03h.

Tipos: `agenda-sede` · `checagem` · `falta` · `resumo-agenda` · `resumo-sem-confirmacao` ·
`resumo-fim-do-dia` · `revisao-semanal` · `aviso-chuva` · `os`.

## A sequência

**1. Consertar e observar a fila.** Já feito: o motivo da falha parou de virar
`[object Object]`, e `?route=email-diagnose` responde por que o e-mail não sai —
incluindo o modo atual, sem expor segredo nenhum.

**2. `desligado`.** Sobe tudo. Roda os workflows manualmente com `simular` desmarcado
e lê `naoEntregues` em cada resposta: é a lista de quem receberia, no dia real, com
os dados reais. Nenhuma mensagem sai.

**3. `sombra` + `EMAIL_SOMBRA_PARA` numa caixa sua.** Agora as mensagens saem de
verdade — para você. É aqui que se descobre remetente, domínio, spam e link
quebrado, com o assunto dizendo para quem cada uma iria.

**4. Verificar o link com o olho.** Abrir a página de confirmação a partir do e-mail
recebido e confirmar que **o GET não grava** — que filtro de segurança abrindo o
link sozinho não registra falta. É a trava mais importante do desenho.

**5. `piloto` com UMA sede e UMA gestora.** `EMAIL_PILOTO_SEDES` com a sede escolhida
e `EMAIL_PILOTO_PESSOAS` com a gestora. Aqui o teste passa a ser do desenho, não do
canal: a sede responde? o coordenador entende o botão? o volume incomoda?

**6. `aberto`.** Só depois que o piloto respondeu essas perguntas.

## As 213 dead-letters

**Não reprocessar automaticamente.** Elas são de meses atrás: links vencidos,
contexto morto, gente que já mudou de sede. Reenviar em massa é a maneira mais
rápida de queimar a confiança no remetente logo no primeiro dia. Quarentena,
inspeção, e reconstruir só o que ainda fizer sentido.

## O que este esqueleto NÃO resolve

- **A linha de base.** O plano pedia uma semana de papel medindo quantas ligações de
  cobrança a gestora faz por dia, antes de qualquer código. Não foi feita. Sem ela,
  daqui a 30 dias há sensação de melhora, não prova — e dá para fazer agora, durante
  os passos 2 e 3, que não produzem efeito nenhum na operação.
- **A cota do Firestore.** O consumidor principal continua desconhecido. As
  varreduras novas custam ~288 leituras/dia, então não são elas.
- **Dado de produção nos testes.** Os 921 testes usam fixtures escritos à mão. O
  passo 2 é a primeira vez que o código toca a forma real dos dados.
