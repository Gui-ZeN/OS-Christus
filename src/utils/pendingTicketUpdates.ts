/**
 * Regra de vida da atualização OTIMISTA — extraída do AppContext para poder ser
 * testada sem React.
 *
 * O problema que ela resolve: entre o PATCH gravar e a tela estabilizar existe uma
 * janela em que um poll disparado ANTES da gravação ainda está no ar. Se a versão
 * otimista sair de cena assim que o PATCH volta, essa resposta atrasada sobrescreve
 * a tela com o estado velho — e como o poll é de 30 s, a pessoa vê a etapa "voltar"
 * e atualiza a página achando que não salvou.
 */

export interface PendingUpdate<T> {
  ticket: T;
  /** Descarte de segurança: nenhuma proteção vive para sempre. */
  expiresAt: number;
  /** Quando o PATCH confirmou a gravação. `null` = ainda em voo. */
  confirmedAt: number | null;
}

/**
 * Decide se a proteção otimista de um item ainda vale, para um poll que começou em
 * `pollStartedAt`.
 *
 *  · em voo (`confirmedAt === null`) → mantém: o servidor nem sabe da mudança;
 *  · confirmada ANTES do poll começar → solta: o poll já enxerga a gravação;
 *  · confirmada DEPOIS do poll começar → mantém: esta resposta é anterior à escrita;
 *  · vencida → solta, aconteça o que acontecer.
 */
export function isPendingUpdateStillProtecting<T>(
  entry: PendingUpdate<T> | undefined,
  pollStartedAt: number,
  now: number
): boolean {
  if (!entry) return false;
  if (entry.expiresAt <= now) return false;
  if (entry.confirmedAt === null) return true;
  return entry.confirmedAt >= pollStartedAt;
}
