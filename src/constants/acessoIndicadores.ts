import type { AppActorRole } from './statusFlow';

/**
 * QUEM VÊ O PAINEL DE INDICADORES.
 *
 * A regra morava em DOIS lugares — `App.tsx` (para acender o ícone da barra) e
 * `KpiView.tsx` (para desenhar a tela) — escritas à mão, iguais. Este repositório
 * já pagou o preço de regra duplicada mais de uma vez, e permissão é o pior lugar
 * para isso: as duas cópias divergem em silêncio e o sintoma é alguém ver o ícone
 * e receber "acesso restrito" ao clicar.
 *
 * O `Gestor` estava fora das duas — sem comentário explicando, num arquivo que
 * comenta tudo. Era descuido: ele administra catálogo, acessos e Financeiro, e os
 * três que encerram quase todas as OS são Gestores. Quem mais trabalha a fila era
 * quem não via o painel dela.
 *
 * `Usuario` está dentro DE PROPÓSITO: é solicitante ou representante de unidade e
 * acompanha os indicadores operacionais da estrutura. O que ele não vê é dinheiro,
 * e isso é outra regra (`canViewFinancials`), barrada de verdade no backend.
 */
const PAPEIS_COM_INDICADORES: readonly AppActorRole[] = ['Admin', 'Diretor', 'Gestor', 'Usuario'];

/**
 * Recebe `string`, e não `AppActorRole`, porque é isso que chega: o papel vem do
 * documento do usuário no Firestore. Papel desconhecido — escrito errado, ou de
 * uma versão futura — não vê, que é o lado seguro de errar.
 */
export function podeVerIndicadores(role: string | null | undefined): boolean {
  return PAPEIS_COM_INDICADORES.includes(String(role || '') as AppActorRole);
}

/** Os papéis por extenso, para a tela de acesso negado não mentir sobre a regra. */
export const PAPEIS_COM_INDICADORES_LABEL = PAPEIS_COM_INDICADORES.join(', ');

/**
 * QUEM VÊ DINHEIRO DENTRO DO PAINEL — contrato, pagamento, medição, fornecedor,
 * valor.
 *
 * É outra pergunta que a de cima, e tem outra resposta: `Usuario` é solicitante
 * ou representante de unidade e acompanha a estrutura, não a compra.
 *
 * Esta lista COPIA `FINANCIAL_READER_ROLES` de `api/_lib/procurementAccess.js`,
 * que é quem barra de verdade — aqui é só para não oferecer uma aba que voltaria
 * vazia. O front dizia espelhar e não espelhava: o backend já liberava o
 * Gestor, e o front o escondia. Uma tela mais restrita que o servidor não
 * protege nada; só esconde da pessoa o que a API entrega a ela.
 *
 * ⚠️ O backend tem ainda uma permissão INDIVIDUAL (`canViewFinancials` no
 * documento do usuário), consultada antes do papel, e o front não a
 * recebe — ela não existe em `DirectoryUser` nem vem de `/api/users`. Hoje
 * isso não quebra nada porque nenhum dos 28 usuários a tem marcada.
 * No dia em que alguém marcar, o servidor entrega e a aba continuará
 * escondida — o conserto começa por trazer o campo até aqui.
 */
const PAPEIS_COM_FINANCEIRO: readonly AppActorRole[] = ['Admin', 'Diretor', 'Gestor'];

export function podeVerFinanceiro(role: string | null | undefined): boolean {
  return PAPEIS_COM_FINANCEIRO.includes(String(role || '') as AppActorRole);
}
