import { describe, expect, it } from 'vitest';
import {
  cobreASede,
  momentoDaChecagem,
  precisaDeAlertaDeFalta,
  precisaDeChecagem,
  donoDoAlertaDeFalta,
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

describe('a tolerância conta de quando o aviso foi PROCESSADO', () => {
  // Correção da auditoria (consulta 12): o agendador do GitHub atrasa. Um job das
  // 07h que roda às 08h40 mandava a agenda e a cobrança de resposta quase juntas —
  // o coordenador era acusado de não responder um e-mail recém-chegado. Silêncio de
  // quem não teve tempo não é silêncio.
  it('agenda atrasada empurra a pergunta para frente', () => {
    const avisadaTarde = visita({ agendaEnviadaEm: minutos(40) });
    // 40 min depois do horário + 30 de tolerância = só a partir dos 70.
    expect(precisaDeChecagem(avisadaTarde, minutos(65))).toBe(false);
    expect(precisaDeChecagem(avisadaTarde, minutos(75))).toBe(true);
  });

  it('agenda enviada ANTES do horário não encurta nem alonga nada', () => {
    const avisadaCedo = visita({ agendaEnviadaEm: minutos(-60) });
    expect(precisaDeChecagem(avisadaCedo, minutos(31))).toBe(true);
  });

  it('sem marca de envio, vale o horário marcado — comportamento de sempre', () => {
    expect(precisaDeChecagem(visita(), minutos(31))).toBe(true);
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

describe('o alerta de falta tem UM dono, não uma lista', () => {
  // Reescrito pela auditoria (consulta 12): a versão anterior mandava para todos os
  // gestores com escopo, e caía em "todo Admin sem escopo" — o que faz o Admin
  // receber TODA falta de TODA sede. Admin é permissão de sistema, não papel
  // operacional: mandar para todos dilui responsabilidade, cria destinatário que
  // não pode agir e transforma o alerta mais urgente do desenho em ruído.
  const larissa = { email: 'larissa@px.com.br', status: 'Ativo', role: 'Gestor', regionIds: ['r-for'], siteIds: [] };
  const thais = { email: 'thais@px.com.br', status: 'Ativo', role: 'Gestor', regionIds: [], siteIds: ['SUL3'] };
  const pablo = { email: 'pablo.sul@px.com.br', status: 'Ativo', role: 'Usuario', siteIds: ['SUL3'] };
  const admin = { email: 'admin@px.com.br', status: 'Ativo', role: 'Admin', siteIds: [], regionIds: [] };
  const plantonista = { email: 'plantao@px.com.br', status: 'Ativo', role: 'Gestor', siteIds: [], regionIds: [] };
  const todos = [larissa, thais, pablo, admin, plantonista];

  it('a sede ganha da região — quem está mais perto responde', () => {
    const r = donoDoAlertaDeFalta(todos, { siteId: 'SUL3', regiao: 'r-for' });
    expect(r.dono?.email).toBe('thais@px.com.br');
    expect(r.origem).toBe('escopo-de-sede');
    expect(r.semDono).toBe(false);
  });

  it('sem gestora de sede, cai para a região', () => {
    const r = donoDoAlertaDeFalta(todos, { siteId: 'PQL1', regiao: 'r-for' });
    expect(r.dono?.email).toBe('larissa@px.com.br');
    expect(r.origem).toBe('escopo-de-regiao');
  });

  it('responsável da OS ganha de tudo', () => {
    const r = donoDoAlertaDeFalta(todos, {
      siteId: 'SUL3',
      regiao: 'r-for',
      responsavelDireto: 'larissa@px.com.br',
    });
    expect(r.dono?.email).toBe('larissa@px.com.br');
    expect(r.origem).toBe('responsavel-da-os');
  });

  it('ADMIN NÃO É MAIS FALLBACK — sede órfã não vira e-mail para todo Admin', () => {
    const r = donoDoAlertaDeFalta([admin, pablo], { siteId: 'ORFA', regiao: 'r-nenhuma' });
    expect(r.dono).toBeNull();
    expect(r.semDono).toBe(true);
  });

  it('o plantão declarado atende, mas fica marcado como falha de cadastro', () => {
    // Falta órfã é pior que falta no lugar errado — mas isto é sintoma, não
    // solução, e por isso `semDono` continua verdadeiro mesmo com dono.
    const r = donoDoAlertaDeFalta(todos, {
      siteId: 'ORFA',
      regiao: 'r-nenhuma',
      plantao: 'plantao@px.com.br',
    });
    expect(r.dono?.email).toBe('plantao@px.com.br');
    expect(r.origem).toBe('plantao');
    expect(r.semDono).toBe(true);
  });

  it('o coordenador da sede nunca é o dono — ele acabou de relatar', () => {
    const r = donoDoAlertaDeFalta([pablo], { siteId: 'SUL3', regiao: 'r-for' });
    expect(r.dono).toBeNull();
  });

  it('inativo não vira dono', () => {
    const r = donoDoAlertaDeFalta([{ ...thais, status: 'Inativo' }], { siteId: 'SUL3', regiao: 'r-for' });
    expect(r.dono).toBeNull();
  });
});

describe('o escopo grosso, para quando só existe a sede', () => {
  // Este bloco nasceu de um defeito real: o resumo de "sem confirmação" não lê as
  // OS (de propósito, para não gastar cota), e o filtro caía só em `siteIds` — a
  // gestora com escopo por REGIÃO, que é quem toca a operação inteira, não recebia
  // o resumo dela.
  const porRegiao = { email: 'larissa@px.com.br', status: 'Ativo', role: 'Gestor', regionIds: ['r-for'], siteIds: [] };
  const porSede = { email: 'thais@px.com.br', status: 'Ativo', role: 'Gestor', regionIds: [], siteIds: ['SUL3'] };

  it('escopo por região alcança a sede da região', () => {
    expect(cobreASede(porRegiao, { siteId: 'SUL3', regiao: 'r-for' })).toBe(true);
  });

  it('escopo por sede alcança a própria sede', () => {
    expect(cobreASede(porSede, { siteId: 'SUL3', regiao: 'r-for' })).toBe(true);
  });

  it('não alcança sede de outra região', () => {
    expect(cobreASede(porRegiao, { siteId: 'PQL1', regiao: 'r-sobral' })).toBe(false);
    expect(cobreASede(porSede, { siteId: 'PQL1', regiao: 'r-for' })).toBe(false);
  });

  it('sem região resolvida, ainda decide pela sede', () => {
    expect(cobreASede(porSede, { siteId: 'SUL3', regiao: null })).toBe(true);
    expect(cobreASede(porRegiao, { siteId: 'SUL3', regiao: null })).toBe(false);
  });
});
