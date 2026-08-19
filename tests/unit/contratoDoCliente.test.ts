import { describe, expect, it } from 'vitest';
import { hydrateTicket } from '../../src/services/ticketsApi';
import { agendaGroupOf, activeSuspension, idleDays, resolvedAttentionOf } from '../../src/utils/agenda';
import { contarMarcos } from '../../src/utils/marcos';
import { estadoDaOs, ESTADO } from '../../api/_lib/estadoDaOs.js';
import type { Ticket } from '../../src/types';

/**
 * O CONTRATO DO LADO DE CÁ — o hidratador é peça estrutural, não enfeite.
 *
 * Os testes de contrato em `tests/integration/` provam que o servidor entrega o
 * formato combinado. Este prova a outra metade: que o cliente CONVERTE o que
 * recebe, e que as telas dependem disso para não quebrar.
 *
 * ⚠️ A DESCOBERTA QUE ORIGINOU ESTE ARQUIVO. Sondando os consumidores com documento
 * sujo, três deles não devolvem valor errado — eles LEVANTAM EXCEÇÃO:
 *
 *   idleDays          com `time` string ou ausente
 *   agendaGroupOf     com `nextAction.dueAt` string
 *   activeSuspension  com `attention.reviewAt` cru
 *
 * E string é exatamente o que o servidor manda (ele serializa tudo para ISO). Ou
 * seja: entre a resposta da API e a tela Hoje existe UMA função obrigatória, e se
 * ela deixar um campo de fora o resultado não é número errado — é tela branca para
 * as oito pessoas que abrem o sistema de manhã.
 *
 * ⚠️ E É PARA CONTINUAR EXPLODINDO. Fazer cada consumidor tolerar data crua
 * pareceria mais seguro e seria pior: a agenda ordenaria texto como se fosse data,
 * "vence hoje" apareceria depois de "vence em setembro", e ninguém veria erro
 * nenhum. Numa tela de agenda, ordem errada em silêncio é pior que parada visível.
 * A defesa fica na fronteira — aqui —, não espalhada.
 */

const AGORA = new Date(2026, 7, 19, 12, 0, 0);
const iso = (dias: number) => new Date(AGORA.getTime() + dias * 24 * 60 * 60 * 1000).toISOString();

/** Uma OS como a rota entrega: TODA data é string ISO. */
const daApi = () =>
  ({
    id: 'OS-0001',
    subject: 'Goteira no refeitório',
    status: 'Aguardando Orçamento',
    sede: 'DL',
    priority: 'Alta',
    time: iso(-10),
    updatedAt: iso(-1),
    stageEnteredAt: iso(-5),
    // Chaves REAIS da régua de marcos — 'Nova OS' não é uma delas, e supor que
    // fosse foi o meu erro na primeira versão deste teste.
    marcos: { 'Aguardando Parecer Técnico': iso(-9), 'Aguardando Orçamento': iso(-5) },
    history: [{ id: 'h1', type: 'customer', sender: 'Sede', time: iso(-10), text: 'Abertura', visibility: 'public' }],
    nextAction: { what: 'Cobrar o orçamento', dueAt: iso(1), createdAt: iso(-4), ownerName: 'Gestor' },
    attention: { state: 'suspensa', reason: 'sem-verba', note: 'Sem verba', reviewAt: iso(9), setAt: iso(-1) },
  }) as unknown as Parameters<typeof hydrateTicket>[0];

describe('depois de hidratar, as telas funcionam', () => {
  const os = hydrateTicket(daApi());

  it('as datas viram Date de verdade', () => {
    expect(os.time).toBeInstanceOf(Date);
    expect(os.nextAction?.dueAt).toBeInstanceOf(Date);
    expect(os.attention?.reviewAt).toBeInstanceOf(Date);
  });

  it('nenhum consumidor levanta exceção', () => {
    expect(() => agendaGroupOf(os, AGORA)).not.toThrow();
    expect(() => idleDays(os, AGORA)).not.toThrow();
    expect(() => activeSuspension(os, AGORA)).not.toThrow();
    expect(() => resolvedAttentionOf(os)).not.toThrow();
    expect(() => contarMarcos(os)).not.toThrow();
    expect(() => estadoDaOs(os, AGORA)).not.toThrow();
  });

  it('e devolvem o valor certo, não só um valor', () => {
    // Suspensão com revisão 9 dias à frente: espera legítima, não bloqueio.
    expect(estadoDaOs(os, AGORA)).toBe(ESTADO.ESPERANDO);
    expect(agendaGroupOf(os, AGORA)).toBe('esperando');
    expect(idleDays(os, AGORA)).toBeGreaterThanOrEqual(0);
    expect(activeSuspension(os, AGORA)?.reason).toBe('sem-verba');
  });

  it('os marcos são contados (o mapa de datas atravessou inteiro)', () => {
    expect(contarMarcos(os)).toBe(2);
  });

  it('idleDays devolve NÚMERO, não NaN', () => {
    // `Math.floor(NaN)` é NaN e atravessa sem erro: a tela mostraria "parada há NaN
    // dias". Vale afirmar que é número, e não só que não explodiu.
    expect(Number.isFinite(idleDays(os, AGORA))).toBe(true);
  });
});

describe('SEM hidratar, elas quebram — e é por isso que o hidratador não é opcional', () => {
  /**
   * Estas asserções parecem estranhas: elas afirmam que o código FALHA. É de
   * propósito. Elas são o que impede alguém de olhar `hydrateTicket`, achar que é
   * cerimônia de tipagem e simplificar — porque o `...ticket` do spread já traz os
   * campos, e a diferença só aparece três telas adiante.
   *
   * Cada caso é MÍNIMO, e isso não é estilo: com a OS completa, `agendaGroupOf`
   * devolve "esperando" pela suspensão antes de chegar no `dueAt`, e `idleDays` usa
   * `updatedAt` antes de `time`. Foi assim que a primeira versão deste bloco passou
   * sem provar nada.
   */
  const cru = (extra: Record<string, unknown>) => ({ id: 'X', status: 'Nova OS', ...extra }) as unknown as Ticket;

  it('agendaGroupOf explode com dueAt em string', () => {
    expect(() => agendaGroupOf(cru({ time: AGORA, nextAction: { what: 'x', dueAt: iso(1) } }), AGORA)).toThrow();
  });

  it('idleDays explode com time em string e sem updatedAt', () => {
    expect(() => idleDays(cru({ time: iso(-3) }), AGORA)).toThrow();
  });

  it('activeSuspension explode com reviewAt em string', () => {
    expect(() => activeSuspension(cru({ time: AGORA, attention: { state: 'suspensa', reviewAt: iso(9) } }), AGORA)).toThrow();
  });
});

describe('o que NÃO pode explodir — documento incompleto do banco antigo', () => {
  /**
   * A produção tem dois anos de documentos escritos por versões anteriores. Estes
   * casos vieram da sondagem e são os que a tela precisa aguentar: campo que nunca
   * existiu não é motivo para derrubar a agenda de todo mundo.
   */
  const casos: Array<[string, Record<string, unknown>]> = [
    ['OS sem próxima ação', { id: 'A', status: 'Nova OS', time: iso(-3) }],
    ['OS sem marcos', { id: 'B', status: 'Nova OS', time: iso(-3), marcos: null }],
    ['OS sem histórico', { id: 'C', status: 'Nova OS', time: iso(-3), history: null }],
    ['próxima ação sem prazo', { id: 'D', status: 'Nova OS', time: iso(-3), nextAction: { what: 'algo' } }],
    ['suspensão sem revisão', { id: 'E', status: 'Nova OS', time: iso(-3), attention: { state: 'suspensa' } }],
    ['estado de atenção desconhecido', { id: 'F', status: 'Nova OS', time: iso(-3), attention: { state: 'coisa-nova' } }],
    ['etapa que não existe mais', { id: 'G', status: 'Etapa Extinta', time: iso(-3) }],
  ];

  for (const [nome, doc] of casos) {
    it(`${nome} atravessa o hidratador e as telas sem quebrar`, () => {
      const os = hydrateTicket(doc as unknown as Parameters<typeof hydrateTicket>[0]);
      expect(() => agendaGroupOf(os, AGORA)).not.toThrow();
      expect(() => idleDays(os, AGORA)).not.toThrow();
      expect(() => activeSuspension(os, AGORA)).not.toThrow();
      expect(() => contarMarcos(os)).not.toThrow();
      expect(() => estadoDaOs(os, AGORA)).not.toThrow();
    });
  }

  it('suspensão sem revisão é IMPEDIDA, não espera eterna', () => {
    // Sem data para voltar, a OS não pode ficar esperando para sempre: ela vai para
    // o grupo que cobra decisão.
    const os = hydrateTicket({ id: 'E', status: 'Nova OS', time: iso(-3), attention: { state: 'suspensa' } } as never);
    expect(estadoDaOs(os, AGORA)).toBe(ESTADO.IMPEDIDA);
  });
});
