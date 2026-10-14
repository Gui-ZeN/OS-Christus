import type { Ticket } from '../../types';

/**
 * QUEM ACEITA, RESPONDE (14/10/2026).
 *
 * A coluna "Responsável" da Gestão ficava em "definir" porque aceitar a OS não
 * gravava ninguém — só o modal da Gestão gravava, e ninguém volta lá. Quem aceita é
 * Admin ou Gestor, os mesmos papéis que o modal oferece.
 *
 * Não sobrescreve: OS que já tem responsável continua com ele. `setAt` dá à pessoa a
 * janela inteira antes da cobrança por falta de progresso (`operationalAttention`).
 */
export function responsavelAoAceitar(
  ticket: Pick<Ticket, 'responsible'>,
  quemAceita: { email?: string | null; name?: string | null } | null | undefined,
  agora = new Date()
): NonNullable<Ticket['responsible']> | null {
  if (ticket.responsible?.email) return null;
  const email = String(quemAceita?.email || '').trim();
  if (!email) return null;
  return { email, name: String(quemAceita?.name || '').trim() || email, setAt: agora };
}
