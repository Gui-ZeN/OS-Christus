import { describe, expect, it } from 'vitest';
import {
  ATTENTION_KIND,
  LEGACY_ATTENTION_DAYS,
  isLegacyAttention,
  applyAttentionOverride,
  attentionChanged,
  computeOperationalAttention,
  nextBusinessDay,
} from '../../api/_lib/operationalAttention.js';

/** Quarta, 5 de agosto de 2026, 09h em Fortaleza (12h UTC). */
const AGORA = new Date('2026-08-05T12:00:00Z');
const emDias = (d: number, h = 12) => new Date(Date.UTC(2026, 7, 5 + d, h));

const os = (over: Record<string, unknown> = {}) => ({
  ticket: { id: 'OS-0271', status: 'Em andamento', ...over },
  commitments: [],
});

describe('nextBusinessDay', () => {
  it('pula o fim de semana', () => {
    // Sexta 07/08 → segunda 10/08, não sábado.
    const sexta = new Date('2026-08-07T18:00:00Z');
    const proximo = nextBusinessDay(sexta);
    expect(proximo.toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  it('conta N dias ÚTEIS, não N dias', () => {
    // Quarta + 3 dias úteis = segunda (pula sábado e domingo).
    const proximo = nextBusinessDay(new Date('2026-08-05T12:00:00Z'), 3);
    expect(proximo.toISOString().slice(0, 10)).toBe('2026-08-10');
  });
});

describe('computeOperationalAttention — precedência', () => {
  it('OS encerrada ou cancelada não cobra nada', () => {
    expect(computeOperationalAttention(os({ status: 'Encerrada' }), AGORA)).toBeNull();
    expect(computeOperationalAttention(os({ status: 'Cancelada' }), AGORA)).toBeNull();
  });

  it('mensagem de gente sem resposta vira "revisar mensagem"', () => {
    const r = computeOperationalAttention(
      os({ lastInboundAt: emDias(0, 14), lastInboundMessageId: 'msg-9' }),
      AGORA
    );
    expect(r?.kind).toBe(ATTENTION_KIND.REVIEW_MESSAGE);
    expect(r?.sourceId).toBe('msg-9');
  });

  it('🎯 é "revisar", não "responder"', () => {
    // Responder pressupõe uma necessidade que o sistema não conhece — a mensagem
    // pode ser um "obrigado".
    const r = computeOperationalAttention(os({ lastInboundAt: emDias(0, 14) }), AGORA);
    expect(r?.kind).toBe('revisar-mensagem');
  });

  it('mensagem já respondida não cobra nada', () => {
    expect(
      computeOperationalAttention(
        os({ lastInboundAt: emDias(0, 10), lastOutboundAt: emDias(0, 11) }),
        AGORA
      )
    ).toBeNull();
  });

  it('🚨 mensagem nova FURA a suspensão', () => {
    // Quem escreveu não sabe que a OS foi suspensa. Deixar a suspensão engolir a
    // mensagem é exatamente como o sistema se comportava antes — o e-mail sumia.
    const r = computeOperationalAttention(
      os({
        lastInboundAt: emDias(0, 14),
        attention: { state: 'suspensa', reason: 'sem-verba', reviewAt: emDias(20) },
      }),
      AGORA
    );
    expect(r?.kind).toBe(ATTENTION_KIND.REVIEW_MESSAGE);
  });

  it('suspensão vigente, sem mensagem nova, esconde o resto', () => {
    const r = computeOperationalAttention(
      os({ attention: { state: 'suspensa', reason: 'sem-verba', reviewAt: emDias(20) } }),
      AGORA
    );
    expect(r?.kind).toBe(ATTENTION_KIND.REVIEW_SUSPENSION);
    expect(r?.dueAt).toEqual(emDias(20));
  });

  it('suspensão VENCIDA deixa de esconder', () => {
    const r = computeOperationalAttention(
      os({ attention: { state: 'suspensa', reason: 'sem-verba', reviewAt: emDias(-3) } }),
      AGORA
    );
    expect(r).toBeNull(); // sem outro sinal, não inventa nada
  });

  it('visita em aberto vira "verificar comparecimento"', () => {
    const entrada = os();
    entrada.commitments = [
      { id: 'c1', state: 'agendado', startAt: emDias(1, 11) },
    ] as never;
    const r = computeOperationalAttention(entrada, AGORA);
    expect(r?.kind).toBe(ATTENTION_KIND.CHECK_VISIT);
    expect(r?.sourceId).toBe('visita-c1');
  });

  it('visita já confirmada não cobra mais', () => {
    const entrada = os();
    entrada.commitments = [{ id: 'c1', state: 'compareceu', startAt: emDias(-1) }] as never;
    expect(computeOperationalAttention(entrada, AGORA)).toBeNull();
  });

  it('cobrança de retorno só nasce de sinal ESTRUTURADO, com 3 dias úteis', () => {
    const r = computeOperationalAttention(os({ followUpRequestedAt: emDias(0, 10) }), AGORA);
    expect(r?.kind).toBe(ATTENTION_KIND.FOLLOW_UP);
    expect(r?.dueAt.toISOString().slice(0, 10)).toBe('2026-08-10'); // pula o fim de semana
  });

  it('se a resposta chegou, a cobrança morre', () => {
    const r = computeOperationalAttention(
      os({ followUpRequestedAt: emDias(0, 10), lastInboundAt: emDias(1, 9), lastOutboundAt: emDias(1, 10) }),
      AGORA
    );
    expect(r).toBeNull();
  });

  it('🕳️ OS sem sinal nenhum devolve null — NÃO inventa "revisar"', () => {
    // 163 das 270 OS estão paradas há meses. Inventar atenção para todas de uma vez
    // encheria a tela de ruído e ensinaria a ignorá-la.
    expect(computeOperationalAttention(os(), AGORA)).toBeNull();
  });
});

describe('applyAttentionOverride — a correção humana', () => {
  const base = {
    kind: ATTENTION_KIND.REVIEW_MESSAGE,
    dueAt: emDias(1),
    sourceId: 'msg-9',
    ruleVersion: 1,
  };

  it('adiar muda só a data', () => {
    const r = applyAttentionOverride(base, { sourceId: 'msg-9', dueAt: emDias(5) });
    expect(r?.dueAt).toEqual(emDias(5));
    expect(r?.kind).toBe(base.kind);
  });

  it('"não se aplica" some com a atenção', () => {
    expect(applyAttentionOverride(base, { sourceId: 'msg-9', dismissed: true })).toBeNull();
  });

  it('🔑 o override MORRE quando chega evento novo', () => {
    // Um "não se aplica" dado hoje não pode esconder o próximo e-mail da mesma OS —
    // senão a dispensa vira silêncio permanente.
    const nova = { ...base, sourceId: 'msg-10' };
    const r = applyAttentionOverride(nova, { sourceId: 'msg-9', dismissed: true });
    expect(r).not.toBeNull();
    expect(r?.sourceId).toBe('msg-10');
  });

  it('sem atenção não há o que sobrescrever', () => {
    expect(applyAttentionOverride(null, { sourceId: 'msg-9', dismissed: true })).toBeNull();
  });
});

describe('attentionChanged', () => {
  const a = { kind: 'revisar-mensagem', dueAt: emDias(1), sourceId: 'm1' };

  it('não grava quando nada mudou', () => {
    expect(attentionChanged(a, { ...a })).toBe(false);
  });

  it('grava quando muda motivo, origem ou data', () => {
    expect(attentionChanged(a, { ...a, kind: 'cobrar-retorno' })).toBe(true);
    expect(attentionChanged(a, { ...a, sourceId: 'm2' })).toBe(true);
    expect(attentionChanged(a, { ...a, dueAt: emDias(3) })).toBe(true);
  });

  it('aparecer ou sumir também é mudança', () => {
    expect(attentionChanged(null, a)).toBe(true);
    expect(attentionChanged(a, null)).toBe(true);
    expect(attentionChanged(null, null)).toBe(false);
  });
});

describe('isLegacyAttention — o que NÃO vai para a tela no primeiro dia', () => {
  it('atenção recente é trabalho de hoje', () => {
    expect(isLegacyAttention({ dueAt: emDias(-2) }, AGORA)).toBe(false);
    expect(isLegacyAttention({ dueAt: emDias(3) }, AGORA)).toBe(false);
  });

  it('📊 atenção velha é passivo, não pauta', () => {
    // Medido antes de existir: das 103 OS que as regras marcariam, 80 (78%) têm mais
    // de uma semana de atraso e 24 passam de 60 dias. Despejar isso de uma vez é o
    // painel de culpa — ninguém "resolve" 103 pendências de meses.
    expect(isLegacyAttention({ dueAt: emDias(-30) }, AGORA)).toBe(true);
    expect(isLegacyAttention({ dueAt: emDias(-90) }, AGORA)).toBe(true);
  });

  it('a janela é de uma semana', () => {
    expect(LEGACY_ATTENTION_DAYS).toBe(7);
    expect(isLegacyAttention({ dueAt: emDias(-6) }, AGORA)).toBe(false);
    expect(isLegacyAttention({ dueAt: emDias(-8) }, AGORA)).toBe(true);
  });

  it('sem data não classifica como legado', () => {
    expect(isLegacyAttention(null, AGORA)).toBe(false);
    expect(isLegacyAttention({}, AGORA)).toBe(false);
  });
});
