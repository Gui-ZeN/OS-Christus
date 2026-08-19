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
CODIGO=$(curl -L -sS -o "$RESPOSTA" -w "%{http_code}" -X POST "$URL" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json") || CODIGO=000

cat "$RESPOSTA"
echo ""
echo "HTTP $CODIGO"
rm -f "$RESPOSTA"

if [ "$CODIGO" -lt 200 ] || [ "$CODIGO" -ge 300 ]; then
  echo "A rota ${NOME} respondeu ${CODIGO}."
  exit 1
fi
