/**
 * A CLASSIFICAÇÃO DA OS AO SALVAR O PAINEL — macroserviço e serviço.
 *
 * Vivia inline na InboxView, sem teste, e resolvia assim:
 *
 *   macroServiceId: catalogo.find(...)?.id || ''
 *
 * ⚠️ ISSO APAGA A CLASSIFICAÇÃO quando o catálogo não conhece mais o item. Hoje a
 * armadilha está adormecida só porque NENHUM item do catálogo de produção está
 * inativo — `readCatalog` filtra por `active === true`, e o dia em que alguém
 * desativar um macroserviço para limpar a lista, toda OS classificada nele perde a
 * classificação no próximo salvamento do painel. Em silêncio: o campo vira vazio, o
 * histórico registra "macroserviço" como se fosse edição de gente.
 *
 * Medido em produção em 11/09/2026: 16 dos 20 macroserviços e 23 dos 27 serviços não
 * podem ser EXCLUÍDOS (estão vinculados a OS ou têm filhos), então desativar é o
 * único caminho de limpeza que sobra — e é exatamente o que dispara isto.
 *
 * A regra abaixo: o catálogo manda enquanto ele conhece o item; quando não conhece
 * mais, o que a OS já registrou fica. Vazio continua sendo vazio — quem escolhe
 * "Definir na triagem" está apagando de propósito, e isso tem que continuar valendo.
 */

export interface ItemDeCatalogo {
  id: string;
  name: string;
  macroServiceId?: string;
}

export interface EscolhaDaTela {
  macroServiceId: string;
  serviceCatalogId: string;
}

/** O que a OS já tem gravado — a memória que sustenta o item fora do catálogo. */
export interface ClassificacaoAtual {
  macroServiceId?: string | null;
  macroServiceName?: string | null;
  serviceCatalogId?: string | null;
  serviceCatalogName?: string | null;
}

export interface ClassificacaoResolvida {
  macroServiceId: string;
  macroServiceName: string;
  serviceCatalogId: string;
  serviceCatalogName: string;
}

export function resolverClassificacao(
  escolha: EscolhaDaTela,
  catalogo: { macroServices: ItemDeCatalogo[]; servicos: ItemDeCatalogo[] },
  atual: ClassificacaoAtual
): ClassificacaoResolvida {
  const macroDoCatalogo = catalogo.macroServices.find(item => item.id === escolha.macroServiceId) || null;

  /**
   * ⚠️ O NOME SÓ SOBREVIVE JUNTO COM O ID. Guardar o nome antigo sob um id novo daria
   * uma OS dizendo "Elétrica" e apontando para outro macroserviço — pior que perder
   * a classificação, porque parece certo.
   */
  const macroForaDoCatalogo =
    !macroDoCatalogo && escolha.macroServiceId && escolha.macroServiceId === (atual.macroServiceId || '');

  const macroServiceId = macroDoCatalogo?.id || (macroForaDoCatalogo ? escolha.macroServiceId : '');
  const macroServiceName = macroDoCatalogo?.name || (macroForaDoCatalogo ? String(atual.macroServiceName || '') : '');

  const servicoDoCatalogo =
    catalogo.servicos.find(
      item => item.id === escolha.serviceCatalogId && item.macroServiceId === (macroDoCatalogo?.id || '')
    ) || null;

  // O serviço segue a mesma regra, mas com uma condição a mais: ele só se sustenta
  // fora do catálogo se o macroserviço dele também se sustentou. Serviço órfão de
  // macroserviço é classificação pela metade.
  const servicoForaDoCatalogo =
    !servicoDoCatalogo &&
    Boolean(macroServiceId) &&
    Boolean(escolha.serviceCatalogId) &&
    escolha.serviceCatalogId === (atual.serviceCatalogId || '');

  return {
    macroServiceId,
    macroServiceName,
    serviceCatalogId: servicoDoCatalogo?.id || (servicoForaDoCatalogo ? escolha.serviceCatalogId : ''),
    serviceCatalogName: servicoDoCatalogo?.name || (servicoForaDoCatalogo ? String(atual.serviceCatalogName || '') : ''),
  };
}

/**
 * As opções do seletor, com o que a OS já tem mesmo que o catálogo não ofereça mais.
 *
 * ⚠️ SEM ISTO O CAMPO APARECE EM BRANCO numa OS classificada, e quem olha conclui que
 * ela nunca foi classificada. O item some da lista para OS NOVAS — que é o ponto de
 * desativar — e continua visível onde já foi usado.
 */
export function opcoesComOAtual(
  catalogo: ItemDeCatalogo[],
  atual: { id?: string | null; name?: string | null }
): ItemDeCatalogo[] {
  const id = String(atual.id || '').trim();
  if (!id || catalogo.some(item => item.id === id)) return catalogo;
  return [...catalogo, { id, name: `${String(atual.name || id)} (fora do catálogo)` }];
}
