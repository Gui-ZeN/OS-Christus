import { describe, expect, it } from 'vitest';
import {
  momentoDaChecagem,
  precisaDeAlertaDeFalta,
  precisaDeChecagem,
  responsaveisPelaCobranca,
  toleranciaEmMinutos,
} from '../../api/_lib/checagemDaVisita.js';

const oito = new Date('2026-08-17T11:00:00Z'); // 08h em Fortaleza
const minutos = (n: number) => new Date(oito.getTime() + n * 60_000);

const visita = (extra: Record<string, unknown> = {}) => ({
  state: 'agendado',
  startAt: oito,
  siteId: 'SUL3',
  ...extra,
});

describe('a pergunta só vem depois da tolerância', () => {
  it('no horário marcado ainda não pergunta', () => {
    expect(precisaDeChecagem(visita(), oito)).toBe(false);
  });

  it('20 minutos depois ainda não — a tolerância padrão é maior', () => {
    expect(toleranciaEmMinutos(visita())).toBeGreaterThan(20);
    expect(precisaDeChecagem(visita(), minutos(20))).toBe(false);
  });

  it('passada a tolerância, pergunta', () => {
    const depois = new Date(momentoDaChecagem(visita())!.getTime() + 60_000);
    expect(precisaDeChecagem(visita(), depois)).toBe(true);
  });

  it('tolerância curta encurta a espera', () => {
    // "30 min no padrão, 15 no crítico. Uma hora é tarde."
    const critica = visita({ toleranceMinutes: 15 });
    expect(precisaDeChecagem(critica, minutos(16))).toBe(true);
    expect(precisaDeChecagem(critica, minutos(14))).toBe(false);
  });
});

describe('a sede não é perguntada duas vezes pela mesma visita', () => {
  it('com a marca de já enviada, não pergunta de novo', () => {
    // A varredura roda de poucos em poucos minutos: sem a marca, a sede receberia
    // a mesma pergunta a cada volta e arquivaria o aviso sem ler.
    const jaPerguntada = visita({ checagemEnviadaEm: minutos(31) });
    expect(precisaDeChecagem(jaPerguntada, minutos(90))).toBe(false);
  });

  it('visita já respondida não é perguntada', () => {
    for (const state of ['compareceu', 'faltou', 'cancelado', 'remarcado']) {
      expect(precisaDeChecagem(visita({ state }), minutos(90)), state).toBe(false);
    }
  });

  it('"sem-confirmacao" ainda é perguntada: ninguém respondeu', () => {
    expect(precisaDeChecagem(visita({ state: 'sem-confirmacao' }), minutos(90))).toBe(true);
  });

  it('visita sem data não gera pergunta', () => {
    expect(precisaDeChecagem(visita({ startAt: null }), minutos(90))).toBe(false);
  });
});

describe('o alerta de falta só sai quando a sede DISSE que faltou', () => {
  it('silêncio não é falta', () => {
    // A diferença que mais importa: falta entra no histórico do fornecedor, que é o
    // dado usado para decidir quem continua atendendo. Acusar pelo silêncio da sede
    // puniria fornecedor que talvez tenha ido.
    expect(precisaDeAlertaDeFalta(visita({ state: 'sem-confirmacao' }))).toBe(false);
  });

  it('falta confirmada dispara', () => {
    expect(precisaDeAlertaDeFalta(visita({ state: 'faltou' }))).toBe(true);
  });

  it('não avisa duas vezes', () => {
    expect(precisaDeAlertaDeFalta(visita({ state: 'faltou', faltaAvisadaEm: minutos(35) }))).toBe(false);
  });

  it('quem compareceu não vira alerta', () => {
    expect(precisaDeAlertaDeFalta(visita({ state: 'compareceu' }))).toBe(false);
  });
});

describe('quem recebe o alerta de falta é quem cobra', () => {
  const larissa = { email: 'larissa@px.com.br', status: 'Ativo', role: 'Gestor', regionIds: ['Fortaleza'], siteIds: [] };
  const thais = { email: 'thais@px.com.br', status: 'Ativo', role: 'Gestor', regionIds: [], siteIds: ['SUL3'] };
  const pablo = { email: 'pablo.sul@px.com.br', status: 'Ativo', role: 'Usuario', siteIds: ['SUL3'] };
  const admin = { email: 'admin@px.com.br', status: 'Ativo', role: 'Admin', siteIds: [], regionIds: [] };

  it('gestora por região e gestora por sede, as duas', () => {
    const r = responsaveisPelaCobranca([larissa, thais], { siteId: 'SUL3', regiao: 'Fortaleza' });
    expect(r.map(u => u.email).sort()).toEqual(['larissa@px.com.br', 'thais@px.com.br']);
  });

  it('o coordenador da sede NÃO recebe — ele acabou de responder', () => {
    const r = responsaveisPelaCobranca([pablo], { siteId: 'SUL3', regiao: 'Fortaleza' });
    expect(r).toEqual([]);
  });

  it('gestora de outra região fica de fora', () => {
    const outra = { ...larissa, email: 'outra@px.com.br', regionIds: ['Sobral'] };
    const r = responsaveisPelaCobranca([outra], { siteId: 'SUL3', regiao: 'Fortaleza' });
    expect(r).toEqual([]);
  });

  it('admin sem escopo responde por tudo', () => {
    const r = responsaveisPelaCobranca([admin], { siteId: 'QUALQUER', regiao: 'QUALQUER' });
    expect(r.map(u => u.email)).toEqual(['admin@px.com.br']);
  });

  it('inativo não recebe', () => {
    const r = responsaveisPelaCobranca([{ ...larissa, status: 'Inativo' }], { siteId: 'SUL3', regiao: 'Fortaleza' });
    expect(r).toEqual([]);
  });
});
