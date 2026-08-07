/**
 * Os motivos que o SISTEMA propõe.
 *
 * Espelho de `api/_lib/operationalAttention.js` — o cálculo mora no servidor, aqui é
 * só o vocabulário para exibir. Se cada tela derivasse por conta própria, duas telas
 * discordariam sobre a mesma OS.
 *
 * A lista é FINITA de propósito. Foi ela que substituiu o campo de texto livre que
 * obrigava alguém a escrever a próxima ação de cada OS — obrigação que produziria
 * "acompanhar" em massa e datas que ninguém atualiza.
 */
export const ATTENTION_KIND = {
  REVIEW_MESSAGE: 'revisar-mensagem',
  FOLLOW_UP: 'cobrar-retorno',
  CHECK_VISIT: 'verificar-comparecimento',
  REVIEW_SUSPENSION: 'reavaliar-suspensao',
} as const;

export type AttentionKind = (typeof ATTENTION_KIND)[keyof typeof ATTENTION_KIND];

export const ATTENTION_KIND_LABEL: Record<string, string> = {
  'revisar-mensagem': 'Revisar mensagem',
  'cobrar-retorno': 'Cobrar retorno',
  'verificar-comparecimento': 'Verificar comparecimento',
  'reavaliar-suspensao': 'Reavaliar suspensão',
};

/**
 * Por que esta OS apareceu, em uma frase.
 *
 * Toda atenção precisa saber se explicar — foi o critério para abrir a tela: "toda
 * atenção consegue dizer 'apareci por causa deste e-mail/compromisso'". Sem isso a
 * pessoa não sabe se a proposta faz sentido, e aprende a ignorar.
 */
export const ATTENTION_KIND_WHY: Record<string, string> = {
  'revisar-mensagem': 'chegou mensagem e ninguém respondeu depois dela',
  'cobrar-retorno': 'pedimos retorno e o prazo passou',
  'verificar-comparecimento': 'um fornecedor prometeu vir',
  'reavaliar-suspensao': 'a suspensão chega ao fim',
};
