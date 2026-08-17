import { describe, expect, it } from 'vitest';
import { HttpError } from '../../api/_lib/http.js';
import {
  describeEmailOutboxType,
  describeOutboxError,
  EMAIL_OUTBOX_TYPES,
  getEmailOutboxRetryDelayMs,
  isEmailOutboxEligible,
  resolveOutboxRecipients,
  isEmailOutboxLeaseActive,
  isKnownEmailOutboxType,
  MAX_EMAIL_OUTBOX_ATTEMPTS,
  normalizeOutboxKey,
} from '../../api/_lib/emailOutbox.js';

describe('tipos da outbox (fila generalizada)', () => {
  it('reconhece os tipos suportados e rejeita desconhecido (falha fechada)', () => {
    expect(isKnownEmailOutboxType(EMAIL_OUTBOX_TYPES.FINANCE_PAYMENT)).toBe(true);
    expect(isKnownEmailOutboxType(EMAIL_OUTBOX_TYPES.MANAGER_NEW_TICKET)).toBe(true);
    expect(isKnownEmailOutboxType('qualquer.coisa')).toBe(false);
    expect(isKnownEmailOutboxType(undefined)).toBe(false);
  });

  it('descreve o tipo no alerta de dead-letter (não diz mais "financeiro" para tudo)', () => {
    expect(describeEmailOutboxType(EMAIL_OUTBOX_TYPES.FINANCE_PAYMENT)).toMatch(/financeiro/i);
    expect(describeEmailOutboxType(EMAIL_OUTBOX_TYPES.MANAGER_NEW_TICKET)).toMatch(/gestor/i);
    expect(describeEmailOutboxType('desconhecido')).toMatch(/fila/i);
  });
});

describe('email outbox', () => {
  it('aceita a mesma forma segura das chaves de comando', () => {
    expect(normalizeOutboxKey('550e8400-e29b-41d4-a716-446655440000'))
      .toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejeita caminhos e chaves curtas', () => {
    for (const value of ['', 'curta', '../outro-doc', 'com espaço']) {
      expect(() => normalizeOutboxKey(value)).toThrow(HttpError);
    }
  });

  it('libera novamente uma entrega quando a lease vence', () => {
    const now = new Date('2026-07-23T12:05:00.000Z');
    expect(isEmailOutboxLeaseActive({
      status: 'processing',
      leaseAt: new Date('2026-07-23T12:04:00.000Z'),
    }, now)).toBe(true);
    expect(isEmailOutboxLeaseActive({
      status: 'processing',
      leaseAt: new Date('2026-07-23T12:00:00.000Z'),
    }, now)).toBe(false);
  });

  it('respeita o backoff e recupera falha elegível', () => {
    const now = new Date('2026-07-23T12:05:00.000Z');
    expect(isEmailOutboxEligible({
      status: 'failed',
      attempts: 2,
      nextAttemptAt: new Date('2026-07-23T12:06:00.000Z'),
    }, now)).toBe(false);
    expect(isEmailOutboxEligible({
      status: 'failed',
      attempts: 2,
      nextAttemptAt: new Date('2026-07-23T12:04:00.000Z'),
    }, now)).toBe(true);
  });

  it('interrompe novas tentativas no limite e limita o crescimento do backoff', () => {
    expect(isEmailOutboxEligible({
      status: 'failed',
      attempts: MAX_EMAIL_OUTBOX_ATTEMPTS,
    })).toBe(false);
    expect(getEmailOutboxRetryDelayMs(1)).toBe(60_000);
    expect(getEmailOutboxRetryDelayMs(99)).toBe(4 * 60 * 60 * 1000);
  });
});

describe('destinatários do aviso ao gestor', () => {
  it('devolve TODOS, não só o primeiro', () => {
    // O defeito real: a entrega lia `recipients[0]`. Com um documento por pessoa
    // isso funcionava e produzia 4 e-mails idênticos sobre a mesma OS (7 no escopo
    // com mais gestores). Agora o item traz a lista inteira, e ler só o primeiro
    // seria perder destinatário em silêncio.
    expect(resolveOutboxRecipients(['a@x.com', 'b@x.com', 'c@x.com'])).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
    ]);
  });

  it('remove repetido: a mesma pessoa em dois escopos é um endereço só', () => {
    // Gestor com acesso por SEDE e por REGIÃO aparecia duas vezes na consulta.
    expect(resolveOutboxRecipients(['Ana@x.com', 'ana@x.com', ' ana@x.com '])).toEqual(['ana@x.com']);
  });

  it('aceita string com vírgula e ignora vazio', () => {
    expect(resolveOutboxRecipients('a@x.com, b@x.com')).toEqual(['a@x.com', 'b@x.com']);
    expect(resolveOutboxRecipients(null)).toEqual([]);
    expect(resolveOutboxRecipients([''])).toEqual([]);
  });
});

describe('o motivo da falha precisa servir para alguém decidir algo', () => {
  // Em produção, 213 documentos da emailOutbox morreram como dead-letter, e o campo
  // que devia dizer o motivo trazia a string "[object Object]". O aviso de OS nova da
  // OS-0274 tentou 6 vezes entre 29/07 e 13/08 e ninguém tinha como descobrir por
  // quê — que é exatamente o que aquele campo existe para responder.
  //
  // A causa era String(error?.message || error): erro SEM a propriedade `message`
  // cai no String(objeto). É o formato das respostas de erro da API do Gmail, que
  // trazem o motivo em response.data.error.message.
  const PADRAO = 'Falha ao enviar e-mail.';

  it('erro do Gmail, que não tem .message, deixa de virar [object Object]', () => {
    const erroDoGmail = { response: { data: { error: { message: 'Invalid grant' } } } };
    expect(describeOutboxError(erroDoGmail, PADRAO)).toBe('Invalid grant');
  });

  it('Error comum continua saindo pela mensagem', () => {
    expect(describeOutboxError(new Error('Falha HTTP 500'), PADRAO)).toBe('Falha HTTP 500');
  });

  it('objeto sem nenhum campo conhecido vira JSON — feio, mas diz o que houve', () => {
    const saida = describeOutboxError({ code: 429, motivo: 'rate limit' }, PADRAO);
    expect(saida).toContain('429');
    expect(saida).toContain('rate limit');
  });

  it('NADA devolve [object Object] — é a regressão que este bloco existe para impedir', () => {
    const entradas: unknown[] = [
      { response: { data: { error: { message: 'x' } } } },
      { code: 500 },
      new Error('y'),
      'texto solto',
      { errors: [{ message: 'quota' }] },
    ];
    for (const entrada of entradas) {
      expect(describeOutboxError(entrada, PADRAO), String(JSON.stringify(entrada))).not.toContain('[object Object]');
    }
  });

  it('vazio e circular caem no texto padrão, nunca em lixo', () => {
    expect(describeOutboxError(null, PADRAO)).toBe(PADRAO);
    expect(describeOutboxError({}, PADRAO)).toBe(PADRAO);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeOutboxError(circular, PADRAO)).toBe(PADRAO);
  });
});
