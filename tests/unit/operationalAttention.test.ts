import { describe, expect, it } from 'vitest';
import {
  ATTENTION_KIND,
  LEGACY_ATTENTION_DAYS,
  isLegacyAttention,
  applyAttentionOverride,
  attentionChanged,
  computeOperationalAttention,
  nextBusinessDay,
  ultimaMovimentacao,
  diasNaEtapa,
  IDLE_WITHOUT_OWNER_DAYS,
  IDLE_WITH_OWNER_DAYS,
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

describe('parada sem responsável — a regra que faltava', () => {
  const parada = (diasAtras: number, over: Record<string, unknown> = {}) =>
    os({ history: [{ id: 'h1', type: 'customer', time: emDias(-diasAtras) }], ...over });

  it('OS parada além do limiar e sem responsável cobra um responsável', () => {
    const r = computeOperationalAttention(parada(IDLE_WITHOUT_OWNER_DAYS + 1), AGORA);
    expect(r?.kind).toBe(ATTENTION_KIND.SET_OWNER);
  });

  it('parada há menos que o limiar não cobra nada — trabalho normal em andamento', () => {
    expect(computeOperationalAttention(parada(IDLE_WITHOUT_OWNER_DAYS - 1), AGORA)).toBeNull();
  });

  // A distinção que motiva a regra: 154 das 155 OS paradas TÊM equipe atribuída.
  it('ter EQUIPE não substitui ter responsável', () => {
    const r = computeOperationalAttention(parada(30, { assignedTeam: 'Construtora' }), AGORA);
    expect(r?.kind).toBe(ATTENTION_KIND.SET_OWNER);
  });

  // Este teste dizia `toBeNull()` e estava errado — era a brecha do rótulo virar
  // teatro. Ter responsável cala ESTA regra e acende a outra; ver o bloco de
  // "com responsável e sem progresso".
  it('com responsável, para de cobrar responsável — mas não vira silêncio', () => {
    const r = computeOperationalAttention(
      parada(30, { responsible: { email: 'gestor@px.com.br', name: 'Gestor' } }),
      AGORA
    );
    expect(r?.kind).not.toBe(ATTENTION_KIND.SET_OWNER);
    expect(r?.kind).toBe(ATTENTION_KIND.NO_PROGRESS);
  });

  it('responsável em branco não conta como responsável', () => {
    const r = computeOperationalAttention(parada(30, { responsible: { email: '   ', name: '' } }), AGORA);
    expect(r?.kind).toBe(ATTENTION_KIND.SET_OWNER);
  });

  it('vem por ÚLTIMO: mensagem sem resposta é mais específica e ganha', () => {
    const r = computeOperationalAttention(
      os({ history: [{ id: 'h1', type: 'customer', time: emDias(-30) }], lastInboundAt: emDias(-30) }),
      AGORA
    );
    expect(r?.kind).toBe(ATTENTION_KIND.REVIEW_MESSAGE);
  });

  // Com os dias no id, dispensar hoje traria a mesma proposta de volta amanhã.
  it('o sourceId não muda enquanto nada acontece', () => {
    const t = parada(30);
    const hoje = computeOperationalAttention(t, AGORA);
    const amanha = computeOperationalAttention(t, new Date(AGORA.getTime() + 86400000));
    expect(hoje?.sourceId).toBe(amanha?.sourceId);
  });

  it('NUNCA é escondida como passivo antigo — velha é mais urgente, não menos', () => {
    const r = computeOperationalAttention(parada(75), AGORA);
    expect(isLegacyAttention(r, AGORA)).toBe(false);
    // Uma atenção comum com o mesmo atraso seria escondida:
    expect(isLegacyAttention({ ...r, kind: ATTENTION_KIND.REVIEW_MESSAGE }, AGORA)).toBe(true);
  });
});

describe('com responsável e sem progresso — a regra que impede o rótulo de virar teatro', () => {
  const DONO = { email: 'gestor@px.com.br', name: 'Gestor' };
  const parada = (diasAtras: number, over: Record<string, unknown> = {}) =>
    os({ history: [{ id: 'h1', type: 'customer', time: emDias(-diasAtras) }], ...over });

  // O cenário exato que o Sol apontou: preencher os 154 em lote apagaria o alerta
  // sem mover nenhuma OS, e o sistema trataria o rótulo como solução.
  it('assumir e não fazer nada volta a cobrar', () => {
    const r = computeOperationalAttention(
      parada(40, { responsible: { ...DONO, setAt: emDias(-(IDLE_WITH_OWNER_DAYS + 1)) } }),
      AGORA
    );
    expect(r?.kind).toBe(ATTENTION_KIND.NO_PROGRESS);
  });

  it('🎯 assumir REINICIA o relógio — quem acabou de pegar não é cobrado', () => {
    // OS parada há 40 dias, mas alguém assumiu ontem: silêncio.
    const r = computeOperationalAttention(
      parada(40, { responsible: { ...DONO, setAt: emDias(-1) } }),
      AGORA
    );
    expect(r).toBeNull();
  });

  it('trocar de responsável dá janela nova ao novo responsável', () => {
    const antigo = computeOperationalAttention(
      parada(40, { responsible: { ...DONO, setAt: emDias(-30) } }),
      AGORA
    );
    const novo = computeOperationalAttention(
      parada(40, { responsible: { email: 'outro@px.com.br', name: 'Outro', setAt: emDias(-30) } }),
      AGORA
    );
    expect(antigo?.sourceId).not.toBe(novo?.sourceId);
  });

  it('sem responsável é a OUTRA regra — as duas nunca disputam a mesma OS', () => {
    expect(computeOperationalAttention(parada(40), AGORA)?.kind).toBe(ATTENTION_KIND.SET_OWNER);
    expect(
      computeOperationalAttention(parada(40, { responsible: { ...DONO, setAt: emDias(-40) } }), AGORA)?.kind
    ).toBe(ATTENTION_KIND.NO_PROGRESS);
  });

  it('progresso depois de assumir zera a cobrança', () => {
    const r = computeOperationalAttention(
      os({
        history: [{ id: 'h1', type: 'internal', time: emDias(-1) }],
        responsible: { ...DONO, setAt: emDias(-30) },
      }),
      AGORA
    );
    expect(r).toBeNull();
  });

  it('também não é escondida como passivo antigo', () => {
    const r = computeOperationalAttention(
      parada(80, { responsible: { ...DONO, setAt: emDias(-80) } }),
      AGORA
    );
    expect(isLegacyAttention(r, AGORA)).toBe(false);
  });
});

describe('progresso × escrituração — o rótulo não pode ser o próprio álibi', () => {
  const DONO = { email: 'gestor@px.com.br', name: 'Gestor', setAt: emDias(-30) };

  // Definir responsável escreve uma entrada `system`. Se ela contasse como
  // movimento, atribuir zeraria o relógio de "sem progresso" — e o campo de
  // responsável viraria exatamente o teatro que ele deveria impedir.
  it('entrada do sistema NÃO conta como movimento', () => {
    const t = {
      history: [
        { id: 'h1', type: 'customer', time: emDias(-30) },
        { id: 'h2', type: 'system', time: emDias(-1), text: 'Responsável pela OS: Gestor.' },
      ],
    };
    expect(ultimaMovimentacao(t)?.getTime()).toBe(emDias(-30).getTime());
  });

  it('nem `field_change`', () => {
    const t = {
      history: [
        { id: 'h1', type: 'internal', time: emDias(-20) },
        { id: 'h2', type: 'field_change', time: emDias(-2), field: 'priority' },
      ],
    };
    expect(ultimaMovimentacao(t)?.getTime()).toBe(emDias(-20).getTime());
  });

  it('nota interna CONTA — escrever um parecer é o trabalho', () => {
    const t = { history: [{ id: 'h1', type: 'internal', time: emDias(-2) }] };
    expect(ultimaMovimentacao(t)?.getTime()).toBe(emDias(-2).getTime());
  });

  it('mudar de etapa conta, pelo carimbo — não lendo o texto da entrada', () => {
    const t = {
      history: [{ id: 'h1', type: 'customer', time: emDias(-30) }],
      stageEnteredAt: emDias(-2),
    };
    expect(ultimaMovimentacao(t)?.getTime()).toBe(emDias(-2).getTime());
  });

  it('🎯 atribuir responsável não silencia a cobrança de progresso', () => {
    const r = computeOperationalAttention(
      {
        ticket: {
          status: 'Em andamento',
          responsible: DONO,
          history: [
            { id: 'h1', type: 'customer', time: emDias(-30) },
            { id: 'h2', type: 'system', time: emDias(0), text: 'Responsável pela OS: Gestor.' },
          ],
        },
        commitments: [],
      },
      AGORA
    );
    expect(r?.kind).toBe(ATTENTION_KIND.NO_PROGRESS);
  });
});

describe('diasNaEtapa — parada é diferente de parada NESTA etapa', () => {
  it('conta a partir do carimbo do servidor', () => {
    expect(diasNaEtapa({ stageEnteredAt: emDias(-9) }, AGORA)).toBe(9);
  });

  it('sem carimbo devolve null, não zero — não saber não é "entrou hoje"', () => {
    expect(diasNaEtapa({}, AGORA)).toBeNull();
  });
});

describe('ultimaMovimentacao', () => {
  it('usa o histórico quando os carimbos de e-mail não existem (190 das 195 OS)', () => {
    const t = { history: [{ time: emDias(-10) }, { time: emDias(-3) }] };
    expect(ultimaMovimentacao(t)?.getTime()).toBe(emDias(-3).getTime());
  });

  it('o carimbo mais recente ganha, venha de onde vier', () => {
    const t = { history: [{ time: emDias(-10) }], lastOutboundAt: emDias(-1) };
    expect(ultimaMovimentacao(t)?.getTime()).toBe(emDias(-1).getTime());
  });

  // updatedAt é carimbado pelo servidor a cada recálculo: usá-lo diria que a OS se
  // mexeu quando quem mexeu foi o próprio sistema.
  it('IGNORA updatedAt', () => {
    const t = { time: emDias(-40), updatedAt: emDias(0) };
    expect(ultimaMovimentacao(t)?.getTime()).toBe(emDias(-40).getTime());
  });

  it('sem nada, cai na data de abertura', () => {
    expect(ultimaMovimentacao({ time: emDias(-5) })?.getTime()).toBe(emDias(-5).getTime());
    expect(ultimaMovimentacao({})).toBeNull();
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
