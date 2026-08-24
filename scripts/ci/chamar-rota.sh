#!/usr/bin/env bash
# Chama UMA rota agendada e imprime a resposta inteira.
#
# Existe para os quatro jobs de alta frequência caberem num workflow só sem
# repetir quinze linhas de `curl` quatro vezes. O corpo da resposta vai para o log
# na íntegra de propósito: é por ele que se descobre, sem acesso ao banco, o que
# cada rota viu — `enviado: false, motivo: ...` na chuva, quantos e-mails saíram da
# fila, quantas visitas foram perguntadas.
#
# Uso: chamar-rota.sh <nome legível> <url>
# Espera `CRON_SECRET` no ambiente. Devolve 1 se a rota não responder 2xx.
set -u

NOME="${1:?informe o nome da rota}"
URL="${2:?informe a URL}"

echo "── ${NOME} ──"
echo "POST ${URL}"

if [ -z "${CRON_SECRET:-}" ]; then
  echo "Falta o secret CRON_SECRET."
  exit 1
fi

RESPOSTA="$(mktemp)"
# `-L` porque a Vercel redireciona domínio nu para www; sem seguir, todo POST
# viraria 308 e nenhuma rota rodaria. E `|| CODIGO=000` porque falha de rede faz o
# curl sair diferente de zero sem imprimir código — sem isto, `set -u` não protege
# e a comparação abaixo receberia string vazia.
#
# ⚠️ `--max-time`, e por quê. Uma execução do ciclo levou 5m27s contra 12–26s das
# vizinhas, e NÃO DEU PARA SABER QUAL ROTA demorou: o log trazia o corpo e o código,
# nunca o tempo. Sem prazo no cliente, uma rota pendurada segura até o
# `timeout-minutes` do job, e as três rotas atrás dela esperam junto.
#
# 75s fica logo acima do teto de 60s da Vercel (`maxDuration` no `vercel.json`):
# rota que estoura o teto continua devolvendo o 504 dela, que é informação útil, em
# vez de ser cortada pelo curl. Quatro rotas no pior caso somam 5 min, dentro dos
# 10 min do job.
#
# O relógio é do SHELL, não do curl: quando o curl falha (prazo estourado, rede
# fora) ele não imprime o `-w` nenhum, e o tempo viria zerado justamente no caso
# em que ele mais importa. Inteiro em segundos basta — o log é para ler, não para
# cronometrar.
INICIO=$(date +%s)
CODIGO=$(curl -L -sS -o "$RESPOSTA" -w "%{http_code}" -X POST "$URL" \
  --connect-timeout 15 --max-time 75 \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json") || CODIGO=000
SEGUNDOS=$(( $(date +%s) - INICIO ))

cat "$RESPOSTA"
echo ""
echo "HTTP $CODIGO em ${SEGUNDOS}s"
rm -f "$RESPOSTA"

if [ "$CODIGO" = "000" ]; then
  # Diferente de um HTTP ruim: aqui não houve resposta. Quase sempre é o prazo
  # estourando, e dizer isso poupa a caçada de quem for ler o log.
  echo "A rota ${NOME} não respondeu em ${SEGUNDOS}s (prazo de 75s ou falha de rede)."
  exit 1
fi

if [ "$CODIGO" -lt 200 ] || [ "$CODIGO" -ge 300 ]; then
  echo "A rota ${NOME} respondeu ${CODIGO} em ${SEGUNDOS}s."
  exit 1
fi
