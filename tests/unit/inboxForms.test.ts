import { describe, expect, it } from 'vitest';
import {
  PRELIMINARY_ITEMS,
  arePreliminaryActionsReady,
  buildPreliminarySummary,
  createPreliminaryFormState,
  type PreliminaryFormState,
} from '../../src/views/inbox/preliminary';
import {
  ADDITIVE_FIXED_QUOTE_SLOTS,
  INITIAL_MAX_QUOTE_SLOTS,
  INITIAL_MIN_QUOTE_SLOTS,
  getRoundMaxQuoteSlots,
  getRoundMinQuoteSlots,
  isQuoteDraftFilledForSubmission,
  resolveQuoteDraftSubmittedTotal,
} from '../../src/views/inbox/quotes';
import {
  createExecutionSetupFormState,
  createProgressUpdateFormState,
  createTicketDetailsFormState,
} from '../../src/views/inbox/ticketForms';
import { formatInputDate, formatInputDateTime } from '../../src/utils/date';
import type { QuoteDraft } from '../../src/views/inbox/types';
import type { Ticket } from '../../src/types';
import { formatCurrency } from '../../src/utils/currency';

function checklistCompleto(): PreliminaryFormState {
  return {
    materialRequested: true,
    materialEta: '',
    teamConfirmed: true,
    sitePrepared: true,
    scheduleDefined: true,
    stakeholderAligned: true,
    accessReleased: true,
    plannedStartAt: '',
    blockerNotes: '',
  };
}

function draft(overrides: Partial<QuoteDraft> = {}): QuoteDraft {
  return { vendor: '', value: '', laborValue: '', materialValue: '', totalValue: '', items: [], ...overrides };
}

describe('arePreliminaryActionsReady', () => {
  it('exige TODOS os itens do checklist', () => {
    expect(arePreliminaryActionsReady(checklistCompleto())).toBe(true);
  });

  it('um único item pendente já barra o início da execução', () => {
    for (const item of PRELIMINARY_ITEMS) {
      const form = { ...checklistCompleto(), [item.id]: false };
      expect(arePreliminaryActionsReady(form)).toBe(false);
    }
  });

  it('data e observações não contam como item do checklist', () => {
    const form = { ...checklistCompleto(), materialEta: '', plannedStartAt: '', blockerNotes: '' };
    expect(arePreliminaryActionsReady(form)).toBe(true);
  });
});

describe('buildPreliminarySummary', () => {
  it('sem registro, diz que não há ação preliminar', () => {
    expect(buildPreliminarySummary()).toBe('Nenhuma ação preliminar registrada.');
  });

  it('conta os itens concluídos', () => {
    expect(buildPreliminarySummary({ materialRequested: true, teamConfirmed: true } as never)).toBe(
      `2/${PRELIMINARY_ITEMS.length} itens concluídos`
    );
  });

  it('sinaliza impedimentos quando há observação preenchida', () => {
    const resumo = buildPreliminarySummary({ blockerNotes: 'falta acesso' } as never);
    expect(resumo).toContain('há impedimentos registrados');
  });

  it('observação só com espaços não conta como impedimento', () => {
    expect(buildPreliminarySummary({ blockerNotes: '   ' } as never)).not.toContain('impedimentos');
  });
});

describe('createPreliminaryFormState', () => {
  it('sem dados, começa tudo pendente', () => {
    const form = createPreliminaryFormState();
    expect(arePreliminaryActionsReady(form)).toBe(false);
    expect(form.blockerNotes).toBe('');
    expect(form.materialEta).toBe('');
  });

  it('hidrata os booleanos e converte as datas para o formato do input', () => {
    const form = createPreliminaryFormState({
      materialRequested: true,
      materialEta: new Date('2026-03-10T12:00:00Z'),
      blockerNotes: 'aguardando chave',
    } as never);
    expect(form.materialRequested).toBe(true);
    expect(form.materialEta).toBe('2026-03-10');
    expect(form.blockerNotes).toBe('aguardando chave');
  });
});

describe('slots de cotação por tipo de rodada', () => {
  it('rodada inicial exige concorrência e permite até o máximo', () => {
    expect(getRoundMinQuoteSlots('initial')).toBe(INITIAL_MIN_QUOTE_SLOTS);
    expect(getRoundMaxQuoteSlots('initial')).toBe(INITIAL_MAX_QUOTE_SLOTS);
    expect(INITIAL_MIN_QUOTE_SLOTS).toBeGreaterThan(1);
  });

  it('aditivo é sempre uma cotação só — mínimo igual ao máximo', () => {
    expect(getRoundMinQuoteSlots('additive')).toBe(ADDITIVE_FIXED_QUOTE_SLOTS);
    expect(getRoundMaxQuoteSlots('additive')).toBe(ADDITIVE_FIXED_QUOTE_SLOTS);
    expect(getRoundMinQuoteSlots('additive')).toBe(getRoundMaxQuoteSlots('additive'));
  });
});

describe('resolveQuoteDraftSubmittedTotal', () => {
  it('o total digitado vence a soma dos itens (o gestor pode fechar outro valor)', () => {
    const comItens = draft({
      totalValue: 'R$ 900,00',
      items: [
        { id: 'i1', section: 'material', description: 'x', quantity: 2, costUnitPrice: 'R$ 100,00' },
      ] as never,
    });
    expect(resolveQuoteDraftSubmittedTotal(comItens)).toBe('R$ 900,00');
  });

  it('sem total digitado, usa a soma dos itens', () => {
    const somenteItens = draft({
      items: [
        { id: 'i1', section: 'material', description: 'x', quantity: 2, costUnitPrice: 'R$ 100,00' },
      ] as never,
    });
    // Comparado com o próprio formatador: o pt-BR usa espaço NÃO-QUEBRÁVEL depois
    // do "R$", então um literal "R$ 200,00" digitado à mão não bate.
    expect(resolveQuoteDraftSubmittedTotal(somenteItens)).toBe(formatCurrency(200));
  });

  it('cai no campo legado quando não há itens nem total', () => {
    expect(resolveQuoteDraftSubmittedTotal(draft({ value: 'R$ 50,00' }))).toBe('R$ 50,00');
    expect(resolveQuoteDraftSubmittedTotal(draft())).toBe('');
  });
});

describe('isQuoteDraftFilledForSubmission', () => {
  it('exige fornecedor E valor positivo', () => {
    expect(isQuoteDraftFilledForSubmission(draft({ vendor: 'ACME', totalValue: 'R$ 10,00' }))).toBe(true);
    expect(isQuoteDraftFilledForSubmission(draft({ vendor: '', totalValue: 'R$ 10,00' }))).toBe(false);
    expect(isQuoteDraftFilledForSubmission(draft({ vendor: 'ACME' }))).toBe(false);
    expect(isQuoteDraftFilledForSubmission(draft({ vendor: 'ACME', totalValue: 'R$ 0,00' }))).toBe(false);
  });

  it('fornecedor só com espaços não vale', () => {
    expect(isQuoteDraftFilledForSubmission(draft({ vendor: '   ', totalValue: 'R$ 10,00' }))).toBe(false);
  });
});

describe('formulários da OS', () => {
  it('execução parte de 5 parcelas quando a OS não define', () => {
    expect(createExecutionSetupFormState().paymentFlowParts).toBe('5');
    expect(
      createExecutionSetupFormState({ executionProgress: { paymentFlowParts: 3 } } as Ticket)
        .paymentFlowParts
    ).toBe('3');
  });

  it('andamento começa sempre em branco (é lançamento novo, não edição)', () => {
    const form = createProgressUpdateFormState({ executionProgress: { currentPercent: 40 } } as Ticket);
    expect(form).toEqual({ grossAmount: '', budgetSource: 'initial', notes: '' });
  });

  it('detalhes hidratam do ticket, com data no formato datetime-local', () => {
    const form = createTicketDetailsFormState({
      subject: 'Vazamento',
      requesterEmail: 'a@b.com',
      time: new Date('2026-03-10T15:30:00Z'),
    } as Ticket);
    expect(form.subject).toBe('Vazamento');
    expect(form.requesterEmail).toBe('a@b.com');
    expect(form.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(createTicketDetailsFormState().subject).toBe('');
  });
});

describe('formatInputDate x formatInputDateTime (P3 do backlog)', () => {
  // As duas vivem lado a lado em utils/date, mas só formatInputDateTime corrige o
  // fuso antes de serializar. Em fuso negativo (Fortaleza é UTC-3), uma data local
  // do fim do dia vira o DIA SEGUINTE em formatInputDate. O teste documenta o
  // desvio — não o endossa. Só roda onde há defasagem, senão não prova nada.
  const fimDoDia = new Date(2026, 2, 10, 23, 0, 0);
  const temDefasagem = fimDoDia.getTimezoneOffset() > 0;

  it.skipIf(!temDefasagem)('formatInputDate adianta a data no fim do dia', () => {
    expect(formatInputDate(fimDoDia)).toBe('2026-03-11');
    expect(formatInputDateTime(fimDoDia)).toBe('2026-03-10T23:00');
  });

  it('meio-dia é seguro nos dois (é o caso comum)', () => {
    const meioDia = new Date(2026, 2, 10, 12, 0, 0);
    expect(formatInputDate(meioDia)).toBe('2026-03-10');
    expect(formatInputDateTime(meioDia)).toBe('2026-03-10T12:00');
  });

  it('data inválida vira string vazia nos dois', () => {
    expect(formatInputDate(null)).toBe('');
    expect(formatInputDate(new Date('x'))).toBe('');
    expect(formatInputDateTime(null)).toBe('');
  });
});
