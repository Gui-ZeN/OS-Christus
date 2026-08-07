import { Timestamp } from 'firebase-admin/firestore';

/**
 * Conversão de data vinda do Firestore, do HTTP ou de um JSON já serializado.
 *
 * Existia CINCO vezes no backend (notifications, emailOutbox, financeCommands,
 * firestoreBackfill, tickets) e as cinco cópias divergiram — cada uma cobrindo um
 * subconjunto diferente das formas que uma data assume no caminho:
 *
 *  - `Timestamp` do Admin SDK (leitura direta do Firestore);
 *  - objeto com `toDate()` (o mesmo Timestamp vindo de outra instância do SDK);
 *  - `{ _seconds }` ou `{ seconds }` — o Timestamp depois de passar por JSON;
 *  - string ISO;
 *  - `YYYY-MM-DD` puro, que é o que um `<input type="date">` manda.
 *
 * A cópia do emailOutbox, por exemplo, não conhecia `{ _seconds }`: um documento que
 * voltasse serializado viraria `null` silenciosamente — numa fila de e-mail, isso é
 * mensagem que não sai e ninguém vê.
 */
export function toDateOrNull(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value?.toDate === 'function') return value.toDate();

  if (typeof value === 'object') {
    const seconds = typeof value._seconds === 'number' ? value._seconds : value.seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1000);
    return null;
  }

  // Data sem hora vira MEIO-DIA UTC, não meia-noite: em Fortaleza (UTC-3), meia-noite
  // UTC é 21h do dia ANTERIOR, e o dia inteiro aparece deslocado na tela.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return new Date(`${value}T12:00:00.000Z`);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
