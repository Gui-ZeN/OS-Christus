/**
 * AGENDA OPERACIONAL — o vocabulário da versão nova do Serv3.
 *
 * A regra única do rework: **toda OS ativa tem uma próxima ação com data**. Não ter
 * é a exceção que aparece na tela. Tudo aqui existe para sustentar isso.
 *
 * Este arquivo é só vocabulário (constantes + tipos). A lógica pura mora em
 * `src/utils/agenda.ts`, testável sem React e sem Firestore.
 */

/**
 * ESTADO DE ATENÇÃO — a OS está sendo tocada, ou está parada com motivo?
 *
 * São só dois. Tinha três (`ativa`, `esperando`, `impedida`) e eu colapsei: com o
 * MOTIVO virando campo próprio, "impedida" não era um estado — era um motivo
 * (`aguardando-terceiro`). Dois eixos dizendo a mesma coisa é convite para
 * discordarem.
 *
 * `ativa` é a AUSÊNCIA de suspensão, não um valor gravado: OS antiga sem o campo
 * continua ativa, sem backfill de 268 documentos.
 */
export const ATTENTION_STATE = {
  /** Alguém está tocando. É o normal. */
  ACTIVE: 'ativa',
  /** Parada de propósito, com motivo e data de revisão. */
  SUSPENDED: 'suspensa',
} as const;

export type AttentionState = (typeof ATTENTION_STATE)[keyof typeof ATTENTION_STATE];

/**
 * Por que a OS está suspensa — **opções de um toque**, nunca campo de texto puro.
 *
 * Sem motivo listado, "suspensa" vira a gaveta nova: é exatamente o que aconteceu com
 * "Aguardando Parecer Técnico", onde 163 das 270 OS estão paradas hoje parecendo que
 * alguém está trabalhando nelas. Motivo em lista pode ser contado; texto livre, não.
 */
export const SUSPENSION_REASON = {
  WAITING_MATERIAL: 'aguardando-material',
  WAITING_APPROVAL: 'aguardando-aprovacao',
  WAITING_VENDOR: 'aguardando-terceiro',
  WAITING_BUDGET: 'aguardando-orcamento',
  NO_FUNDS: 'sem-verba',
  SEASONAL: 'depende-de-periodo',
  OTHER: 'outro',
} as const;

export type SuspensionReason = (typeof SUSPENSION_REASON)[keyof typeof SUSPENSION_REASON];

export const SUSPENSION_REASON_LABEL: Record<SuspensionReason, string> = {
  'aguardando-material': 'Aguardando material',
  'aguardando-aprovacao': 'Aguardando aprovação',
  'aguardando-terceiro': 'Aguardando terceiro',
  'aguardando-orcamento': 'Aguardando orçamento',
  'sem-verba': 'Sem verba no momento',
  'depende-de-periodo': 'Depende de período (férias, chuva…)',
  outro: 'Outro',
};

/**
 * Prazo padrão de uma suspensão. Sete dias, não trinta: a suspensão é uma folga
 * temporária da regra única, e quanto mais longa, mais ela vira esquecimento com
 * carimbo. Sempre dá para suspender de novo — o que não pode é sumir.
 */
export const DEFAULT_SUSPENSION_DAYS = 7;

/**
 * A partir de quantas OS "paradas sem responsável" a pauta vira UM contador.
 *
 * A regra que as detecta acorda 154 das 195 OS vivas hoje — o passivo inteiro de
 * uma vez. Isso é verdade, e é inútil como pauta: 154 linhas numa tela diária é o
 * painel de culpa que ninguém lê, e ele afogaria as outras atenções (hoje seriam 2)
 * que são trabalho de verdade.
 *
 * Então: **acima deste número é passivo, e passivo se mostra como número** — uma
 * linha que leva para a Gestão já filtrada, onde ele se resolve em lote. **Abaixo,
 * é trabalho, e trabalho se mostra item a item**, com nome e tempo parado.
 *
 * Dez porque é o que sobra de espaço numa pauta diária depois das atenções que já
 * têm data. Quando o mutirão derrubar o passivo, a régua vira sozinha e a regra
 * passa a ser o alarme que impede a pilha de se formar de novo — que é para o que
 * ela serve.
 */
export const MAX_SEM_RESPONSAVEL_NA_PAUTA = 10;

/**
 * Tipo de compromisso. **A V1 tem UM só**, por decisão de escopo: é exatamente a dor
 * que o Diretor descreveu ("era pro terceiro ir em tal dia e não apareceu"), e um tipo
 * já obriga a acertar a estrutura inteira — política, responsabilidade, confirmação,
 * atraso derivado — sem os meses que o modelo completo custaria.
 *
 * Os demais entram no MESMO motor depois, sem remodelagem.
 */
export const COMMITMENT_KIND = {
  /** Fornecedor prometeu comparecer em data/hora. */
  VENDOR_VISIT: 'visita-fornecedor',
} as const;

export type CommitmentKind = (typeof COMMITMENT_KIND)[keyof typeof COMMITMENT_KIND];

/**
 * Ciclo de vida do compromisso.
 *
 * ⚠️ `compareceu` NÃO é desfecho — foi o furo fatal que a 4ª consulta pegou: o
 * fornecedor chega, olha a pia, diz que faltou material e vai embora; alguém marca
 * "apareceu", o painel fica verde e nada foi instalado. Por isso a chegada e o
 * RESULTADO são campos separados (ver `CommitmentOutcome`).
 */
export const COMMITMENT_STATE = {
  /** Marcado, ainda não chegou a hora. */
  SCHEDULED: 'agendado',
  /** Passou do horário e a sede ainda não disse nada. NÃO é falta. */
  UNCONFIRMED: 'sem-confirmacao',
  /** A sede confirmou que o fornecedor chegou. */
  ARRIVED: 'compareceu',
  /** A sede confirmou que o fornecedor NÃO veio. */
  MISSED: 'faltou',
  /** Remarcado — o compromisso novo aponta para este em `supersededBy`. */
  RESCHEDULED: 'remarcado',
  /** Não é mais necessário (a sede resolveu, a OS caiu). */
  CANCELED: 'cancelado',
} as const;

export type CommitmentState = (typeof COMMITMENT_STATE)[keyof typeof COMMITMENT_STATE];

/**
 * O que de fato aconteceu depois que a equipe chegou — separado da chegada de
 * propósito. Sem isto, "compareceu" viraria sinônimo de "resolvido" e a métrica
 * central mediria presença em vez de manutenção feita.
 */
export const COMMITMENT_OUTCOME = {
  DONE: 'concluiu',
  PARTIAL: 'parcial',
  NOT_EXECUTED: 'nao-executou',
  MISSING_MATERIAL: 'faltou-material',
  NO_ACCESS: 'sem-acesso',
  SOLVED_BY_SITE: 'resolvido-pela-sede',
} as const;

export type CommitmentOutcome = (typeof COMMITMENT_OUTCOME)[keyof typeof COMMITMENT_OUTCOME];

export const COMMITMENT_OUTCOME_LABEL: Record<CommitmentOutcome, string> = {
  concluiu: 'Concluiu o serviço',
  parcial: 'Fez parcialmente',
  'nao-executou': 'Não executou',
  'faltou-material': 'Faltou material',
  'sem-acesso': 'Não conseguiu acesso',
  'resolvido-pela-sede': 'A sede já tinha resolvido',
};

/**
 * Motivo do reagendamento — **opções de um toque, nunca campo de texto**.
 *
 * "Motivo obrigatório por transição" foi descartado pelo dono (gera preenchimento de
 * fachada). Aqui é diferente e necessário: visita que a SEDE cancelou não pode contar
 * como falta do prestador, senão o histórico do fornecedor — que decide quem continua
 * atendendo — fica errado.
 */
export const RESCHEDULE_REASON = {
  VENDOR_ASKED: 'fornecedor-pediu',
  NO_MATERIAL: 'faltou-material',
  SITE_UNAVAILABLE: 'sede-nao-pode-receber',
  OTHER: 'outro',
} as const;

export type RescheduleReason = (typeof RESCHEDULE_REASON)[keyof typeof RESCHEDULE_REASON];

/**
 * Tolerância padrão até o horário marcado virar `sem-confirmacao`.
 *
 * 30 min, não 1 h: a consulta apontou que uma hora deixa a falta invisível metade da
 * manhã e ainda aparece no relatório como "cobrada rápido". O relógio da cobrança
 * começa no FIM da tolerância, não no clique de "não veio".
 */
export const DEFAULT_TOLERANCE_MINUTES = 30;
