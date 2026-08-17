import { describe, expect, it } from 'vitest';
import {
  DIAS_PARA_DESFAZER,
  MAXIMO_POR_EMAIL,
  RESPOSTA,
  diasParada,
  efeitoDaResposta,
  entraNaRevisao,
  montarRevisaoSemanal,
  podeDesfazer,
} from '../../api/_lib/fechamentoAssistido.js';

const agora = new Date('2026-08-17T12:00:00Z');
const diasAtras = (n: number) => new Date(agora.getTime() - n * 86_400_000);

const os = (extra: Record<string, unknown> = {}) => ({
  id: 'OS-0219',
  subject: 'Manutenção da calçada',
  sede: 'PNV',
  status: 'Aguardando Parecer Técnico',
  updatedAt: diasAtras(45),
  ...extra,
});

describe('quais OS entram na revisão', () => {
  it('parada há 45 dias entra', () => {
    expect(entraNaRevisao(os(), agora)).toBe(true);
    expect(diasParada(os(), agora)).toBe(45);
  });

  it('tocada há 10 dias não entra', () => {
    expect(entraNaRevisao(os({ updatedAt: diasAtras(10) }), agora)).toBe(false);
  });

  it('OS já encerrada ou cancelada não entra', () => {
    expect(entraNaRevisao(os({ status: 'Encerrada' }), agora)).toBe(false);
    expect(entraNaRevisao(os({ status: 'Cancelada' }), agora)).toBe(false);
  });

  it('sem updatedAt, vale a criação — OS que nasceu e ninguém tocou é o caso central', () => {
    expect(entraNaRevisao(os({ updatedAt: null, createdAt: diasAtras(90) }), agora)).toBe(true);
    expect(entraNaRevisao(os({ updatedAt: null, createdAt: diasAtras(3) }), agora)).toBe(false);
  });
});

describe('nada encerra sozinho, e o silêncio não decide nada', () => {
  it('a revisão só produz lista — nenhum efeito é aplicado ao montar', () => {
    const ticket = os();
    const antes = JSON.stringify(ticket);
    montarRevisaoSemanal({
      tickets: [ticket],
      gestoras: [{ email: 'larissa@px.com.br', status: 'Ativo' }],
      podeVer: () => true,
      now: agora,
    });
    expect(JSON.stringify(ticket)).toBe(antes);
  });

  it('resposta desconhecida não faz nada', () => {
    expect(efeitoDaResposta('apagar-tudo')).toBeNull();
  });
});

describe('as três respostas', () => {
  it('encerrar guarda o status anterior — é o que permite desfazer', () => {
    const e = efeitoDaResposta(RESPOSTA.ENCERRAR, { now: agora, statusAnterior: 'Em Execução' });
    expect(e!.status).toBe('Encerrada');
    expect(e!.fechamentoAssistido.statusAnterior).toBe('Em Execução');
  });

  it('"ainda pendente" conta como atividade — tira a OS da lista da semana que vem', () => {
    // Sem isto a gestora responderia a mesma pergunta para sempre, que é como um
    // e-mail semanal morre.
    const e = efeitoDaResposta(RESPOSTA.PENDENTE, { now: agora });
    expect(e!.updatedAt).toEqual(agora);
    expect(entraNaRevisao(os({ updatedAt: agora }), agora)).toBe(false);
  });

  it('"ver depois" adia sem apagar o tempo parado', () => {
    const e = efeitoDaResposta(RESPOSTA.DEPOIS, { now: agora });
    expect(e!.revisaoAdiadaAte.getTime()).toBeGreaterThan(agora.getTime());
    // Não mexe em updatedAt: adiar a pergunta não é atividade na OS, e fingir que é
    // apagaria o número que se quer enxergar.
    expect(e).not.toHaveProperty('updatedAt');
    expect(diasParada(os({ ...os(), revisaoAdiadaAte: e!.revisaoAdiadaAte }), agora)).toBe(45);
  });

  it('OS adiada não volta enquanto a data não chega', () => {
    const adiada = os({ revisaoAdiadaAte: new Date(agora.getTime() + 10 * 86_400_000) });
    expect(entraNaRevisao(adiada, agora)).toBe(false);
    // Passada a data, volta a incomodar.
    expect(entraNaRevisao(adiada, new Date(agora.getTime() + 11 * 86_400_000))).toBe(true);
  });
});

describe('desfazer, com autoria e com limite', () => {
  it('devolve a OS ao status de antes', () => {
    const encerrada = os({ status: 'Encerrada', fechamentoAssistido: { em: agora, statusAnterior: 'Em Execução' } });
    expect(podeDesfazer(encerrada, agora)).toBe(true);
    expect(efeitoDaResposta(RESPOSTA.DESFAZER, { now: agora, statusAnterior: 'Em Execução' })!.status).toBe('Em Execução');
  });

  it('não reabre OS encerrada por outro caminho', () => {
    // Sem este limite, o link viraria um jeito de reabrir qualquer OS encerrada.
    expect(podeDesfazer(os({ status: 'Encerrada' }), agora)).toBe(false);
  });

  it('não reabre meses depois', () => {
    const antiga = os({ fechamentoAssistido: { em: diasAtras(DIAS_PARA_DESFAZER + 1), statusAnterior: 'Aberta' } });
    expect(podeDesfazer(antiga, agora)).toBe(false);
  });
});

describe('uma gestora só recebe o que é dela', () => {
  const larissa = { email: 'larissa@px.com.br', status: 'Ativo', regionIds: ['colegio'] };
  const thais = { email: 'thais@px.com.br', status: 'Ativo', regionIds: ['faculdade'] };
  const doColegio = os({ id: 'OS-1', sede: 'BN' });
  const daFaculdade = os({ id: 'OS-2', sede: 'PQL1' });
  // A regra de escopo entra por parâmetro para ser a MESMA do resto do sistema.
  const podeVer = (g: { regionIds: string[] }, t: { sede: string }) =>
    g.regionIds[0] === 'colegio' ? t.sede === 'BN' : t.sede === 'PQL1';

  it('cada uma recebe só as suas', () => {
    const r = montarRevisaoSemanal({ tickets: [doColegio, daFaculdade], gestoras: [larissa, thais], podeVer, now: agora });
    expect(r.lotes).toHaveLength(2);
    expect(r.lotes[0].ordens.map((o: { id: string }) => o.id)).toEqual(['OS-1']);
    expect(r.lotes[1].ordens.map((o: { id: string }) => o.id)).toEqual(['OS-2']);
  });

  it('gestora sem OS parada não recebe e-mail', () => {
    const r = montarRevisaoSemanal({ tickets: [doColegio], gestoras: [larissa, thais], podeVer, now: agora });
    expect(r.lotes.map((l: { gestora: { email: string } }) => l.gestora.email)).toEqual(['larissa@px.com.br']);
  });

  it('gestora inativa não recebe', () => {
    const r = montarRevisaoSemanal({ tickets: [doColegio], gestoras: [{ ...larissa, status: 'Inativo' }], podeVer, now: agora });
    expect(r.lotes).toEqual([]);
  });

  it('ordena pela mais parada primeiro', () => {
    const recente = os({ id: 'OS-3', sede: 'BN', updatedAt: diasAtras(31) });
    const antiga = os({ id: 'OS-4', sede: 'BN', updatedAt: diasAtras(200) });
    const r = montarRevisaoSemanal({ tickets: [recente, antiga], gestoras: [larissa], podeVer, now: agora });
    expect(r.lotes[0].ordens.map((o: { id: string }) => o.id)).toEqual(['OS-4', 'OS-3']);
  });

  it('e-mail gigante é cortado, mas o que ficou de fora é declarado', () => {
    // Parede de texto não é lida; sumir com o resto em silêncio seria pior.
    const muitas = Array.from({ length: MAXIMO_POR_EMAIL + 4 }, (_, i) => os({ id: `OS-${i}`, sede: 'BN' }));
    const r = montarRevisaoSemanal({ tickets: muitas, gestoras: [larissa], podeVer, now: agora });
    expect(r.lotes[0].ordens).toHaveLength(MAXIMO_POR_EMAIL);
    expect(r.lotes[0].total).toBe(MAXIMO_POR_EMAIL + 4);
    expect(r.lotes[0].excedente).toBe(4);
  });
});
