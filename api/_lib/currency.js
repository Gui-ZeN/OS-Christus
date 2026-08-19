/**
 * DINHEIRO EM TEXTO → NÚMERO. Uma implementação, para os dois lados.
 *
 * Ela existia QUATRO vezes, com TRÊS comportamentos:
 *
 *   api/_lib/financeCommands.js    parseFloat → 0
 *   api/_lib/vendorPreferences.js  parseFloat → null
 *   src/utils/currency.ts          Number     → 0
 *   src/utils/budgetHistory.ts     parseFloat → null
 *
 * ⚠️ `Number` E NÃO `parseFloat`, e a diferença é dinheiro de verdade. Medido com
 * entradas plausíveis:
 *
 *   "R$ 1.500,00 a R$ 2.000,00"   parseFloat → 1500.002    Number → sem valor
 *   "1.500,00-2.000,00"           parseFloat → 1500        Number → sem valor
 *   "12,5,7"                      parseFloat → 12.5        Number → sem valor
 *
 * `parseFloat` engole o prefixo e devolve um número PLAUSÍVEL. Alguém digita uma
 * faixa de preço no orçamento — coisa que se faz —, a tela mostrava R$ 0,00 e o
 * servidor seguia para pagamento com 1500,002: um valor que não é nenhum dos dois
 * que a pessoa escreveu. Errar visível é melhor que errar convincente, e em dinheiro
 * essa não é uma preferência de estilo.
 *
 * ⚠️ DEVOLVE `null`, NÃO `0`. Vazio e zero são coisas diferentes: "orçamento não
 * informado" e "orçamento de R$ 0,00" levam a decisões opostas. Quem precisa de zero
 * escreve `?? 0` na chamada — a escolha fica em quem sabe o que o campo significa,
 * e não escondida aqui.
 *
 * Sem I/O.
 */

/**
 * O ponto sai SÓ quando é separador de milhar (seguido de exatamente três dígitos e
 * então fim ou não-dígito). Assim "1.234,56" → 1234.56 e "1234.56" → 1234.56.
 *
 * O `.replace(/\./g,'')` de antes transformava "1234.56" — colado de planilha em
 * formato americano — em 123456. Cem vezes maior, indo para aprovação da diretoria
 * inflado. Está aqui porque é o tipo de regra que alguém "simplifica" sem saber.
 */
function normalizar(valor) {
  return String(valor ?? '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
}

/**
 * @param {unknown} valor texto como a pessoa digitou ("R$ 1.234,56")
 * @returns {number | null} `null` quando não dá para ler um número
 */
export function parseCurrencyOrNull(valor) {
  const normalizado = normalizar(valor);
  if (!normalizado) return null;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

/** Para quem trata ausência como zero. A escolha fica visível na chamada. */
export function parseCurrency(valor) {
  return parseCurrencyOrNull(valor) ?? 0;
}

/**
 * O preço unitário do item — explícito, ou deduzido do total pela quantidade.
 *
 * Também estava duplicado (`vendorPreferences.js` e `budgetHistory.ts`), com a mesma
 * regra escrita duas vezes. A divisão só acontece com quantidade positiva: dividir
 * por zero devolveria `Infinity`, que atravessa `Number.isFinite` como número e
 * chegaria à tela como preço.
 */
export function getItemUnitPrice(item) {
  const explicito = parseCurrencyOrNull(item?.unitPrice);
  if (explicito !== null) return explicito;

  const quantidade = item?.quantity != null ? Number(item.quantity) : null;
  const total = parseCurrencyOrNull(item?.totalPrice);
  if (quantidade && quantidade > 0 && total !== null) return total / quantidade;
  return null;
}
