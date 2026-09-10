import { describe, expect, it } from 'vitest';
import {
  PRELIMINARY_ITEMS,
  arePreliminaryActionsReady,
  buildPreliminarySummary,
  createPreliminaryFormState,
  type PreliminaryFormState,
} from '../../src/views/inbox/preliminary';
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

describe('formatInputDate x formatInputDateTime', () => {
  // Este bloco documentava um DESVIO e agora cobra o conserto. `formatInputDate`
  // usava `toISOString()` direto: em fuso negativo (Fortaleza é UTC-3), uma data do
  // fim do dia virava o DIA SEGUINTE. Chegava ao usuário no checklist de
  // encerramento financeiro, que pré-preenche início e conclusão do serviço — um
  // registro salvo às 21h30 voltava para a tela com a data de amanhã.
  //
  // A asserção só prova algo onde existe defasagem de fuso; num ambiente em UTC as
  // duas implementações coincidem e o teste passaria sem testar nada.
  const fimDoDia = new Date(2026, 2, 10, 23, 0, 0);
  const temDefasagem = fimDoDia.getTimezoneOffset() !== 0;

  it.skipIf(!temDefasagem)('o fim do dia continua sendo o MESMO dia', () => {
    expect(formatInputDate(fimDoDia)).toBe('2026-03-10');
    expect(formatInputDateTime(fimDoDia)).toBe('2026-03-10T23:00');
  });

  it('a data do input é sempre o prefixo do datetime — são a mesma conta', () => {
    for (const h of [0, 3, 12, 21, 23]) {
      const d = new Date(2026, 2, 10, h, 30, 0);
      expect(formatInputDate(d), `${h}h`).toBe(formatInputDateTime(d).slice(0, 10));
    }
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
