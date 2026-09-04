import { describe, expect, it } from 'vitest';
import {
  AGENDA_GROUP,
  activeSuspension,
  resolvedAttentionOf,
  agendaGroupOf,
  attentionStateOf,
  buildAgenda,
  dayKey,
  idleDays,
  isPastTolerance,
} from '../../src/utils/agenda';
import {
  ATTENTION_STATE,
  MAX_SEM_ACAO_NA_PAUTA,
  MAX_SEM_RESPONSAVEL_NA_PAUTA,
  SUSPENSION_REASON,
} from '../../src/constants/agenda';
import { ATTENTION_KIND } from '../../src/constants/attentionKind';
import { TICKET_STATUS } from '../../src/constants/ticketStatus';
import type { Ticket } from '../../src/types';

/** Quarta, 5 de agosto de 2026, 09h00 em Fortaleza (12h UTC). */
const AGORA = new Date('2026-08-05T12:00:00Z');
const hoje = (h: number, m = 0) => new Date(Date.UTC(2026, 7, 5, h + 3, m));

const os = (over: Partial<Ticket> = {}): Ticket =>
  ({
    id: 'OS-0184',
    trackingToken: 't',
    subject: 'Troca de disjuntor',
    requester: 'Fulano',
    time: new Date('2026-07-01T12:00:00Z'),
    status: TICKET_STATUS.IN_PROGRESS,
    type: 'Corretiva',
    region: 'Benfica',
    sede: 'BN',
    sector: 'E-mail',
    priority: 'Trivial',
    history: [],
    ...over,
  }) as Ticket;

const comAcao = (dueAt: Date, over: Partial<Ticket> = {}) =>
  os({ nextAction: { what: 'Confirmar visita', dueAt }, ...over });

const suspensa = (reviewAt: Date, over: Partial<Ticket> = {}) =>
  os({
    attention: {
      state: ATTENTION_STATE.SUSPENDED,
      reason: SUSPENSION_REASON.WAITING_MATERIAL,
      reviewAt,
    },
    ...over,
  });

describe('attentionStateOf', () => {
  it('OS sem o campo conta como ATIVA — não exige backfill de 268 OS', () => {
    expect(attentionStateOf(os(), AGORA)).toBe(ATTENTION_STATE.ACTIVE);
    expect(attentionStateOf(os({ attention: null }), AGORA)).toBe(ATTENTION_STATE.ACTIVE);
  });

  it('suspensão com revisão no futuro é SUSPENSA', () => {
    expect(attentionStateOf(suspensa(hoje(18)), AGORA)).toBe(ATTENTION_STATE.SUSPENDED);
  });

  it('⏰ suspensão com a revisão VENCIDA deixa de valer sozinha', () => {
    // É a peça que impede "suspensa" de virar a gaveta nova: ninguém precisa lembrar
    // de dessuspender — a data vence e a OS volta a cobrar decisão.
    expect(attentionStateOf(suspensa(new Date('2026-08-04T12:00:00Z')), AGORA)).toBe(
      ATTENTION_STATE.ACTIVE
    );
    expect(activeSuspension(suspensa(new Date('2026-08-04T12:00:00Z')), AGORA)).toBeNull();
  });
});

describe('dayKey', () => {
  it('usa o fuso da operação, não UTC', () => {
    // 06/08 às 01h UTC ainda é 05/08 às 22h em Fortaleza. Sem isto, a agenda da
    // noite mostraria o dia seguinte.
    expect(dayKey(new Date('2026-08-06T01:00:00Z'))).toBe('2026-08-05');
  });
});

describe('isPastTolerance', () => {
  it('o relógio começa no FIM da tolerância, não no horário marcado', () => {
    const marcado = hoje(10);
    expect(isPastTolerance(marcado, hoje(10, 20))).toBe(false); // 20 min: dentro
    expect(isPastTolerance(marcado, hoje(10, 40))).toBe(true); // 40 min: estourou
  });

  it('aceita tolerância menor para o crítico', () => {
    expect(isPastTolerance(hoje(10), hoje(10, 20), 15)).toBe(true);
  });
});

describe('agendaGroupOf', () => {
  it('OS encerrada ou cancelada não entra na agenda', () => {
    expect(agendaGroupOf(comAcao(hoje(10), { status: TICKET_STATUS.CLOSED }), AGORA)).toBeNull();
    expect(agendaGroupOf(comAcao(hoje(10), { status: TICKET_STATUS.CANCELED }), AGORA)).toBeNull();
  });

  it('sem próxima ação é a EXCEÇÃO da regra única', () => {
    expect(agendaGroupOf(os(), AGORA)).toBe(AGENDA_GROUP.NO_ACTION);
  });

  it('🎯 parada VENCIDA não vira gaveta — mas a acusação certa é "impedida"', () => {
    // A intenção antiga continua: prazo vencido não pode sumir da tela. O rótulo é
    // que mudou (auditoria, consulta 12). "Sem próxima ação" diz que a gestora não
    // definiu nada; "impedida" diz que um terceiro furou o prazo — e Impedidas fica
    // no topo, exige ação e continua contando o tempo parado.
    expect(agendaGroupOf(suspensa(new Date('2026-08-01T12:00:00Z')), AGORA)).toBe(
      AGENDA_GROUP.BLOCKED
    );
  });

  it('parada com prazo FUTURO sai do fluxo de urgência: Esperando', () => {
    // É a única ausência de próxima ação que é legítima — porque tem motivo e data.
    expect(agendaGroupOf(suspensa(new Date('2026-08-30T12:00:00Z')), AGORA)).toBe(
      AGENDA_GROUP.WAITING
    );
  });

  it('o que separa Esperando de Impedidas é o PRAZO, não o motivo', () => {
    // Correção da auditoria (consulta 12). Antes, o motivo decidia, e as duas
    // metades do plano se contradiziam sobre onde "material" caía.
    const futuro = new Date('2026-08-30T12:00:00Z');
    const vencido = new Date('2026-08-01T12:00:00Z');
    for (const motivo of [SUSPENSION_REASON.WAITING_MATERIAL, SUSPENSION_REASON.WAITING_APPROVAL]) {
      const esperando = os({ attention: { state: ATTENTION_STATE.SUSPENDED, reason: motivo, reviewAt: futuro } });
      const impedida = os({ attention: { state: ATTENTION_STATE.SUSPENDED, reason: motivo, reviewAt: vencido } });
      expect(agendaGroupOf(esperando, AGORA), motivo).toBe(AGENDA_GROUP.WAITING);
      expect(agendaGroupOf(impedida, AGORA), motivo).toBe(AGENDA_GROUP.BLOCKED);
    }
  });

  it('prazo vencido vira Impedidas, não "sem próxima ação"', () => {
    // Antes a revisão vencida sumia e a OS reaparecia acusando a gestora de não
    // ter definido nada — quando o que houve foi um terceiro furando o prazo.
    expect(agendaGroupOf(suspensa(new Date('2026-08-01T12:00:00Z')), AGORA)).toBe(
      AGENDA_GROUP.BLOCKED
    );
  });

  it('a parada vence a data da próxima ação enquanto estiver vigente', () => {
    const t = suspensa(new Date('2026-08-30T12:00:00Z'), {
      nextAction: { what: 'Cobrar', dueAt: hoje(10) },
    });
    expect(agendaGroupOf(t, AGORA)).toBe(AGENDA_GROUP.WAITING);
  });

  it('visita de fornecedor marcada para hoje → Hoje', () => {
    const visita = comAcao(hoje(16), { nextAction: { what: 'Visita', dueAt: hoje(16), commitmentId: 'c1' } });
    expect(agendaGroupOf(visita, AGORA)).toBe(AGENDA_GROUP.TODAY);
  });

  /*
   * ⚠️ A REGRA MUDOU EM 03/09/2026, a pedido do dono: *"o trabalho interno também
   * deveria aparecer no marcado para hoje caso tenha alguma data"*.
   *
   * Antes, TODO trabalho interno que não estivesse no futuro caía em "Trabalho
   * interno" — inclusive o marcado para hoje às 9h. O efeito na tela era abrir com
   * "Nada marcado para hoje — ninguém prometeu vir" tendo trabalho com hora marcada
   * logo abaixo: o bloco do dia só sabia falar de visita de fornecedor.
   *
   * A separação que o PDF pedia continua de pé para o ATRASADO, que é onde ela
   * importa: ali o trabalho da equipe não pode sumir atrás do que depende de
   * terceiro. O de hoje sobe para a pauta do dia.
   */
  it('trabalho SEM fornecedor marcado para HOJE vai para a pauta do dia', () => {
    expect(agendaGroupOf(comAcao(hoje(16)), AGORA)).toBe(AGENDA_GROUP.TODAY);
  });

  it('mas o trabalho interno ATRASADO fica em Trabalho interno', () => {
    // Empurrar item de outro dia para "Marcado para hoje" transformaria a pauta em
    // backlog — que é o que esta tela existe para não ser.
    const ontem = new Date('2026-08-04T12:00:00Z');
    expect(agendaGroupOf(comAcao(ontem), AGORA)).toBe(AGENDA_GROUP.INTERNAL);
  });

  it('trabalho interno de hoje cuja hora já passou continua sendo de hoje', () => {
    // `hoje(8)` é 08h e AGORA é 09h. O dia é o mesmo, então a pauta do dia é o lugar
    // — quem tinha 8h para analisar um orçamento e são 9h ainda tem o dia inteiro.
    expect(agendaGroupOf(comAcao(hoje(8)), AGORA)).toBe(AGENDA_GROUP.TODAY);
  });

  it('compromisso de fornecedor que estourou a tolerância → Aguardando a sede', () => {
    // A pergunta já foi enviada; quem responde agora é a sede, não a gestora. É esta
    // separação que elimina a ligação de verificação.
    const t = comAcao(hoje(8), { nextAction: { what: 'Visita', dueAt: hoje(8), commitmentId: 'c1' } });
    expect(agendaGroupOf(t, AGORA)).toBe(AGENDA_GROUP.WAITING_SITE);
  });

  it('ação INTERNA com a hora passada não vira "aguardando sede" — não há sede para esperar', () => {
    // O que este teste protege é a ausência de `commitmentId`, não o grupo de
    // destino: sem fornecedor, não existe sede a quem perguntar se ele veio.
    expect(agendaGroupOf(comAcao(hoje(8)), AGORA)).not.toBe(AGENDA_GROUP.WAITING_SITE);
    expect(agendaGroupOf(comAcao(new Date('2026-08-04T12:00:00Z')), AGORA)).not.toBe(
      AGENDA_GROUP.WAITING_SITE
    );
  });

  it('falta CONFIRMADA pela sede vai para o topo: Cobrar agora', () => {
    // É o primeiro grupo do desenho do PDF. Antes a falta confirmada ficava diluída
    // em "Vencidas", junto de coisa que não tem nada a ver.
    const t = comAcao(hoje(8), { nextAction: { what: 'Visita', dueAt: hoje(8), commitmentId: 'c9' } });
    expect(agendaGroupOf(t, AGORA, () => ({ state: 'faltou' }))).toBe(AGENDA_GROUP.COBRAR);
    // Sem a consulta do compromisso, cai no grupo antigo — nada quebra.
    expect(agendaGroupOf(t, AGORA)).toBe(AGENDA_GROUP.WAITING_SITE);
  });

  it('visita de fornecedor com data passada → Vencidas', () => {
    const visita = comAcao(new Date('2026-08-01T12:00:00Z'), {
      nextAction: { what: 'Visita', dueAt: new Date('2026-08-01T12:00:00Z'), commitmentId: 'c2' },
    });
    expect(agendaGroupOf(visita, AGORA)).toBe(AGENDA_GROUP.OVERDUE);
  });

  it('dentro de 7 dias → Próximos; depois disso, fora da tela', () => {
    expect(agendaGroupOf(comAcao(new Date('2026-08-09T12:00:00Z')), AGORA)).toBe(AGENDA_GROUP.UPCOMING);
    expect(agendaGroupOf(comAcao(new Date('2026-09-30T12:00:00Z')), AGORA)).toBeNull();
  });
});

describe('buildAgenda — passivo sem responsável: número ou lista', () => {
  const semDono = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      os({
        id: `OS-${900 + i}`,
        operationalAttention: {
          kind: ATTENTION_KIND.SET_OWNER,
          dueAt: new Date('2026-07-01T12:00:00Z'),
          sourceId: `sem-responsavel-${i}`,
          ruleVersion: 2,
        },
      } as Partial<Ticket>)
    );

  it('acima da régua vira UM número e sai da pauta', () => {
    const agenda = buildAgenda(semDono(MAX_SEM_RESPONSAVEL_NA_PAUTA + 1), AGORA);
    expect(agenda.semResponsavel).toEqual({
      total: MAX_SEM_RESPONSAVEL_NA_PAUTA + 1,
      agrupado: true,
    });
    // Nenhuma delas polui os grupos — item a item cairiam todas em "Vencidas".
    const total = Object.values(agenda.groups).reduce((s, g) => s + g.length, 0);
    expect(total).toBe(0);
  });

  it('dentro da régua, cada uma aparece na pauta', () => {
    const agenda = buildAgenda(semDono(MAX_SEM_RESPONSAVEL_NA_PAUTA), AGORA);
    expect(agenda.semResponsavel.agrupado).toBe(false);
    expect(agenda.groups['trabalho-interno']).toHaveLength(MAX_SEM_RESPONSAVEL_NA_PAUTA);
  });

  it('agrupar o passivo NÃO esconde as outras atenções — é o ponto da régua', () => {
    const lista = [...semDono(50), comAcao(hoje(9))];
    const agenda = buildAgenda(lista, AGORA);
    expect(agenda.semResponsavel.total).toBe(50);
    // A ação é de hoje, então ela mora na pauta do dia — o que este teste protege é
    // que ela NÃO some junto com o passivo agrupado.
    expect(agenda.groups[AGENDA_GROUP.TODAY]).toHaveLength(1);
  });

  it('sem nenhuma parada, o contador some', () => {
    const agenda = buildAgenda([comAcao(hoje(9))], AGORA);
    expect(agenda.semResponsavel).toEqual({ total: 0, agrupado: false });
  });
});

describe('buildAgenda', () => {
  const lista = [
    comAcao(hoje(16), { id: 'OS-1' }),
    comAcao(hoje(11), { id: 'OS-2' }),
    comAcao(new Date('2026-08-01T12:00:00Z'), { id: 'OS-3' }),
    os({ id: 'OS-4', updatedAt: new Date('2026-07-01T12:00:00Z') }),
    os({ id: 'OS-5', updatedAt: new Date('2026-07-20T12:00:00Z') }),
    comAcao(hoje(10), { id: 'OS-6', status: TICKET_STATUS.CLOSED }),
  ];
  const agenda = buildAgenda(lista, AGORA);

  it('separa nos grupos e ignora encerrada', () => {
    // Estas ações não têm `commitmentId`: são trabalho da própria equipe. O de HOJE
    // vai para a pauta do dia; o atrasado fica em Trabalho interno, onde o PDF o
    // separa das visitas para não sumir atrás do que depende de terceiro.
    expect(agenda.groups[AGENDA_GROUP.INTERNAL].map(t => t.id)).toEqual(['OS-3']);
    expect(agenda.groups[AGENDA_GROUP.TODAY].map(t => t.id)).toEqual(['OS-2', 'OS-1']);
    expect(agenda.groups[AGENDA_GROUP.NO_ACTION]).toHaveLength(2);
  });

  it('ordena a pauta do dia pela hora', () => {
    // OS-2 às 11h antes de OS-1 às 16h: a lista do dia se lê de cima para baixo
    // como o relógio anda.
    expect(agenda.groups[AGENDA_GROUP.TODAY].map(t => t.id)).toEqual(['OS-2', 'OS-1']);
  });

  it('o contador "exigem ação agora" NÃO encolheu com a mudança de grupo', () => {
    // O interno de hoje mudou de lugar na tela, não de natureza: continua sendo
    // trabalho que alguém precisa fazer hoje. Sem esta soma, a nota do card "Hoje"
    // cairia de 3 para 1 sem nada ter melhorado.
    expect(agenda.contadores.exigemAcaoAgora).toBe(3);
  });

  it('🔍 "sem próxima ação" ordena pelo TEMPO PARADO — a mais esquecida primeiro', () => {
    // O oposto de esconder o passivo: quem está parado há mais tempo aparece no topo.
    expect(agenda.groups[AGENDA_GROUP.NO_ACTION].map(t => t.id)).toEqual(['OS-4', 'OS-5']);
  });

  it('conta o que importa', () => {
    expect(agenda.withoutNextAction).toBe(2);
    expect(agenda.needingActionToday).toBe(3); // 2 hoje + 1 vencida
  });
});

describe('idleDays', () => {
  it('mede o tempo parado a partir da última mexida', () => {
    expect(idleDays(os({ updatedAt: new Date('2026-07-26T12:00:00Z') }), AGORA)).toBe(10);
  });

  it('sem updatedAt, cai na abertura da OS', () => {
    expect(idleDays(os({ time: new Date('2026-08-01T12:00:00Z') }), AGORA)).toBe(4);
  });
});

describe('resolvedAttentionOf — as duas fontes', () => {
  it('o texto escrito à mão GANHA da proposta do sistema', () => {
    // Quem escreveu está sendo explícito sobre algo que não coube nos tipos.
    const t = os({
      nextAction: { what: 'Ligar para o síndico', dueAt: hoje(15) },
      operationalAttention: { kind: 'revisar-mensagem', dueAt: hoje(9), sourceId: 'm1' },
    });
    const r = resolvedAttentionOf(t);
    expect(r?.what).toBe('Ligar para o síndico');
    expect(r?.proposta).toBe(false);
  });

  it('sem texto, vale a proposta do sistema', () => {
    const t = os({ operationalAttention: { kind: 'revisar-mensagem', dueAt: hoje(9), sourceId: 'm1' } });
    const r = resolvedAttentionOf(t);
    expect(r?.kind).toBe('revisar-mensagem');
    expect(r?.proposta).toBe(true);
    expect(r?.sourceId).toBe('m1');
  });

  it('📉 proposta marcada como LEGADO não entra na tela', () => {
    // São 82 das 102 OS calculadas hoje, com semanas de atraso. Elas vão para a
    // revisão administrativa, não para a pauta do dia.
    const t = os({
      operationalAttention: { kind: 'revisar-mensagem', dueAt: hoje(9), sourceId: 'm1', legacy: true },
    });
    expect(resolvedAttentionOf(t)).toBeNull();
    expect(agendaGroupOf(t, AGORA)).toBe(AGENDA_GROUP.NO_ACTION);
  });

  it('sem nada, não há atenção', () => {
    expect(resolvedAttentionOf(os())).toBeNull();
  });
});

describe('o passivo não afoga a agenda do dia', () => {
  // No primeiro print da tela reestruturada eram DEZ cards de "definir a próxima
  // ação" contra UM de trabalho do dia: a tela chamada "Hoje" abria como lista de
  // backlog. Acima da régua, o passivo vira número.
  const semAcao = (n: number) =>
    Array.from({ length: n }, (_, i) => os({ id: `OS-P${i}`, updatedAt: new Date('2026-07-01T12:00:00Z') }));

  it('acima da régua, sai da pauta e vira número', () => {
    const agenda = buildAgenda(semAcao(MAX_SEM_ACAO_NA_PAUTA + 1), AGORA);
    expect(agenda.semAcaoAgrupada.agrupado).toBe(true);
    expect(agenda.semAcaoAgrupada.total).toBe(MAX_SEM_ACAO_NA_PAUTA + 1);
    expect(agenda.groups[AGENDA_GROUP.NO_ACTION]).toHaveLength(0);
  });

  it('dentro da régua, continua item a item — é quando cabe agir uma a uma', () => {
    const agenda = buildAgenda(semAcao(MAX_SEM_ACAO_NA_PAUTA), AGORA);
    expect(agenda.semAcaoAgrupada.agrupado).toBe(false);
    expect(agenda.groups[AGENDA_GROUP.NO_ACTION]).toHaveLength(MAX_SEM_ACAO_NA_PAUTA);
  });

  it('o número leva o tempo parado junto — sem ele, é fácil de maquiar', () => {
    const agenda = buildAgenda(semAcao(MAX_SEM_ACAO_NA_PAUTA + 1), AGORA);
    expect(agenda.semAcaoAgrupada.diasDaMaisAntiga).toBeGreaterThan(30);
  });

  it('sem passivo nenhum, o número não aparece', () => {
    const agenda = buildAgenda([], AGORA);
    expect(agenda.semAcaoAgrupada).toEqual({ total: 0, agrupado: false, diasDaMaisAntiga: 0 });
  });
});
