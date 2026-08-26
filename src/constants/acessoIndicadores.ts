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
