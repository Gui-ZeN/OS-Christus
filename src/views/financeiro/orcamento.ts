import { parseCurrencyOrNull } from '../../../api/_lib/currency.js';
import type { ItemDoOrcamento, OrcamentoDaOs, Ticket } from '../../types';

/**
 * A CONTA DO ORÇAMENTO — orçado, realizado, e a diferença entre os dois.
 *
 * Puro, sem tela e sem Firestore, porque é dinheiro: a regra tem que ser afirmável
 * com objetos soltos. O painel anterior tinha 2.293 linhas e nenhum teste sobre o
 * número que ele mostrava.
 *
 * ⚠️ `parseCurrencyOrNull` E NÃO `parseCurrency`. O segundo devolve 0 para entrada
 * inválida, e aqui zero é uma resposta legítima ("custou nada") que não pode se
 * confundir com "não deu para ler". A distinção é o assunto deste arquivo inteiro.
 */

/** O que a pessoa digitou, lido como número. `null` = vazio ou ilegível. */
export const valorDe = (texto?: string | null): number | null => parseCurrencyOrNull(texto);

/**
 * A soma das linhas digitadas à mão. `null` quando não há linha alguma com valor.
 *
 * ⚠️ LINHA SEM VALOR LEGÍVEL NÃO ZERA A SOMA — ela fica de fora. Quem digitou o
 * material e ainda não pôs o preço não pode fazer o total despencar; o total some
 * só quando NENHUMA linha tem valor.
 */
export function totalDosItens(itens?: ItemDoOrcamento[] | null): number | null {
  const valores = (Array.isArray(itens) ? itens : [])
    .map(item => valorDe(item?.valor))
    .filter((v): v is number => v !== null);
  if (valores.length === 0) return null;
  return valores.reduce((soma, v) => soma + v, 0);
}

/**
 * O ORÇADO QUE VALE — a soma das linhas quando elas existem, senão o total digitado.
 *
 * ⚠️ A SOMA GANHA DO TOTAL DIGITADO, sempre. Alguém digita R$ 2.000 no total, depois
 * lança as linhas e elas somam R$ 2.350: se o total escrito vencesse, a tabela
 * mostraria um número que o próprio detalhamento dela contradiz — e a variação
 * sairia errada em cima disso. O campo `previsto` continua guardado como foi
 * escrito; o que muda é qual dos dois a conta usa.
 */
export function previstoEfetivo(orcamento?: OrcamentoDaOs | null): number | null {
  const daSoma = totalDosItens(orcamento?.itens);
  return daSoma !== null ? daSoma : valorDe(orcamento?.previsto);
}

export interface Variacao {
  /** Realizado menos orçado. Negativo = gastou menos que o previsto. */
  diferenca: number;
  /** Fração, não porcentagem: 0.1 é 10% acima. `null` quando o orçado é zero. */
  fracao: number | null;
}

/**
 * ⚠️ SÓ EXISTE COM OS DOIS LADOS PREENCHIDOS.
 *
 * Faltando um, a resposta é `null` — e não zero, e não "-100%". Uma OS orçada em
 * R$ 2.000 e ainda não paga mostraria "-100% (economizou tudo)" se o vazio virasse
 * zero, e essa linha entraria na soma de economia do período. É o erro que faz um
 * painel financeiro mentir para cima.
 *
 * ⚠️ E A FRAÇÃO É `null` QUANDO O ORÇADO É ZERO. Dividir por zero dá `Infinity`, que
 * o `Intl` formata como "∞%" sem reclamar. A diferença em reais continua valendo:
 * orçado 0 e realizado 500 é um gasto de R$ 500 que ninguém previu, e o número que
 * conta ali é o 500.
 */
export function variacaoDe(orcamento?: OrcamentoDaOs | null): Variacao | null {
  const previsto = previstoEfetivo(orcamento);
  const realizado = valorDe(orcamento?.realizado);
  if (previsto === null || realizado === null) return null;
  return {
    diferenca: realizado - previsto,
    fracao: previsto === 0 ? null : (realizado - previsto) / previsto,
  };
}

/** Estado de preenchimento — é o que a tela usa para dizer o que falta. */
export type EstadoDoOrcamento = 'vazio' | 'so-previsto' | 'so-realizado' | 'completo';

export function estadoDoOrcamento(orcamento?: OrcamentoDaOs | null): EstadoDoOrcamento {
  const temPrevisto = previstoEfetivo(orcamento) !== null;
  const temRealizado = valorDe(orcamento?.realizado) !== null;
  if (temPrevisto && temRealizado) return 'completo';
  if (temPrevisto) return 'so-previsto';
  if (temRealizado) return 'so-realizado';
  return 'vazio';
}

export interface ResumoDoOrcamento {
  /** Quantas OS do recorte têm algum valor registrado. */
  comRegistro: number;
  /** Quantas não têm nada — o número que diz se o painel está sendo usado. */
  semRegistro: number;
  previsto: number;
  realizado: number;
  /** Só das OS com os DOIS lados. Somar variação de OS meia-preenchida seria somar ruído. */
  diferencaComparavel: number;
  /** Quantas entraram na conta acima. Sem isto, "diferença: R$ 0" não distingue
   *  "bateu certinho" de "não havia nada para comparar". */
  comparaveis: number;
}

/**
 * ⚠️ AS SOMAS SÃO PARCIAIS DE PROPÓSITO, e a tela precisa dizer isso.
 *
 * `previsto` soma o que tem previsto; `realizado`, o que tem realizado. Os dois
 * conjuntos podem ser diferentes, então subtrair um do outro NÃO dá a economia do
 * período — dá a diferença entre duas amostras distintas. Quem quer a comparação usa
 * `diferencaComparavel`, que só olha OS com os dois lados.
 */
export function resumoDoOrcamento(tickets: Array<Pick<Ticket, 'orcamento'>>): ResumoDoOrcamento {
  const resumo: ResumoDoOrcamento = {
    comRegistro: 0,
    semRegistro: 0,
    previsto: 0,
    realizado: 0,
    diferencaComparavel: 0,
    comparaveis: 0,
  };

  for (const ticket of tickets) {
    // O mesmo orçado que a linha mostra: a soma das linhas quando elas existem.
    const previsto = previstoEfetivo(ticket.orcamento);
    const realizado = valorDe(ticket.orcamento?.realizado);
    if (previsto === null && realizado === null) {
      resumo.semRegistro += 1;
      continue;
    }
    resumo.comRegistro += 1;
    if (previsto !== null) resumo.previsto += previsto;
    if (realizado !== null) resumo.realizado += realizado;
    if (previsto !== null && realizado !== null) {
      resumo.comparaveis += 1;
      resumo.diferencaComparavel += realizado - previsto;
    }
  }
  return resumo;
}

/**
 * O que vai gravado quando alguém salva.
 *
 * ⚠️ CAMPO APAGADO VIRA `null`, e não some do objeto. `{...antigo, ...novo}` no
 * Firestore com a chave ausente MANTÉM o valor velho — quem limpasse o realizado
 * veria o número voltar no reload, sem erro nenhum.
 */
export function orcamentoParaGravar(
  atual: OrcamentoDaOs | undefined,
  entrada: {
    previsto?: string | null;
    realizado?: string | null;
    itens?: ItemDoOrcamento[] | null;
    anexo?: OrcamentoDaOs['anexo'];
  },
  quem: string,
  agora: Date = new Date()
): OrcamentoDaOs {
  const limpo = (v?: string | null) => {
    const texto = String(v ?? '').trim();
    return texto ? texto : null;
  };
  /**
   * ⚠️ LINHA SEM DESCRIÇÃO E SEM VALOR NÃO É GRAVADA. O modal começa com uma linha
   * em branco para haver onde digitar; sem esta limpeza, abrir e fechar sem escrever
   * nada gravaria uma linha fantasma que aparece vazia toda vez que alguém reabre.
   */
  const itens = 'itens' in entrada
    ? (entrada.itens || []).filter(i => String(i?.descricao ?? '').trim() || String(i?.valor ?? '').trim())
    : (atual?.itens ?? []);

  return {
    previsto: 'previsto' in entrada ? limpo(entrada.previsto) : (atual?.previsto ?? null),
    realizado: 'realizado' in entrada ? limpo(entrada.realizado) : (atual?.realizado ?? null),
    itens,
    anexo: 'anexo' in entrada ? (entrada.anexo ?? null) : (atual?.anexo ?? null),
    atualizadoEm: agora.toISOString(),
    atualizadoPor: quem || null,
  };
}
