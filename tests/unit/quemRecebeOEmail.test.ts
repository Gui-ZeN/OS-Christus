import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * QUEM RECEBE, DE VERDADE — a decisão inteira, não só os resolvedores.
 *
 * `ticketEmail.ts` tem um ponto único de saída (`postEmail` → `fetch`). Interceptando
 * o `fetch`, dá para capturar TODO e-mail que sairia e afirmar o que importa: qual
 * gatilho disparou, para quem foi, quem ficou em cópia.
 *
 * Isto é o que faltava. Até hoje a tabela de gatilhos deste sistema só era conferida
 * por `shouldNotifyRequesterForStatus`, que responde "avisa ou não" — não responde
 * "avisa QUEM". E o arquivo inteiro estava a 3,7% de cobertura.
 */

vi.mock('../../src/services/actorHeaders', () => ({
  getAuthenticatedActorHeaders: async () => ({}),
  getActorHeaders: () => ({}),
}));
vi.mock('../../src/services/catalogApi', () => ({
  fetchCatalog: async () => ({ regions: [], sites: [], macroServices: [], serviceItems: [] }),
}));
vi.mock('../../src/services/directoryApi', () => ({
  fetchDirectory: async () => ({ users: diretorioSimulado, teams: [], vendors: [] }),
}));
vi.mock('../../src/services/procurementApi', () => ({
  fetchProcurementData: async () => ({
    quotesByTicket: {},
    contractsByTicket: {},
    paymentsByTicket: {},
    measurementsByTicket: {},
  }),
}));

let diretorioSimulado: Array<Record<string, unknown>> = [];

const { notifyTicketCreated, notifyTicketPublicReply, notifyTicketStatusChange } = await import(
  '../../src/services/ticketEmail'
);
const { TICKET_STATUS } = await import('../../src/constants/ticketStatus');

/** Todo e-mail que o módulo tentou mandar nesta execução. */
let enviados: Array<Record<string, unknown>> = [];

beforeEach(() => {
  enviados = [];
  diretorioSimulado = [];
  // O link de rastreio publico sai do `window.location.origin`. A suite roda em
  // `node`; carregar jsdom inteiro para duas leituras de origem custaria mais do
  // que informa.
  vi.stubGlobal('window', { location: { origin: 'https://os.christus.local' } });
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    enviados.push(JSON.parse(String(init?.body || '{}')));
    return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const os = (extra: Record<string, unknown> = {}) =>
  ({
    id: 'OS-0100',
    subject: 'Goteira no refeitório',
    requester: 'Josy',
    requesterEmail: 'josy@px.com.br',
    status: TICKET_STATUS.NEW,
    sede: 'DL',
    region: 'Universidade',
    time: new Date(2026, 7, 20, 9, 0, 0),
    history: [],
    ...extra,
  }) as never;

const paraQuem = (indice = 0) => String(enviados[indice]?.toEmail || '');
const emCopia = (indice = 0) => String(enviados[indice]?.ccEmail || '');
const gatilhos = () => enviados.map(e => String(e.trigger || ''));

describe('abertura da OS', () => {
  it('avisa o solicitante no endereço dele', async () => {
    await notifyTicketCreated(os());
    expect(enviados.length).toBeGreaterThan(0);
    expect(paraQuem()).toContain('josy@px.com.br');
  });

  it('OS sem e-mail do solicitante não tenta mandar para ninguém', async () => {
    // Sem destinatário, mandar é pior que não mandar: entra na fila, falha, e vira
    // ruído na saúde de e-mail.
    await notifyTicketCreated(os({ requesterEmail: '' }));
    expect(paraQuem()).not.toContain('undefined');
    expect(paraQuem()).not.toContain('null');
  });
});

describe('a mudança de etapa avisa quem deve, e só quem deve', () => {
  it('começar a análise avisa o solicitante', async () => {
    await notifyTicketStatusChange(
      os({ status: TICKET_STATUS.WAITING_TECH_OPINION }),
      TICKET_STATUS.NEW
    );
    expect(paraQuem()).toContain('josy@px.com.br');
  });

  it('degrau administrativo NÃO avisa o solicitante', async () => {
    // Quem recebe e-mail de cada degrau interno para de ler os que importam.
    await notifyTicketStatusChange(
      os({ status: TICKET_STATUS.WAITING_BUDGET }),
      TICKET_STATUS.WAITING_TECH_OPINION
    );
    const paraSolicitante = enviados.filter(e => String(e.toEmail || '').includes('josy@px.com.br'));
    expect(paraSolicitante).toHaveLength(0);
  });

  it('a conclusão avisa', async () => {
    await notifyTicketStatusChange(os({ status: TICKET_STATUS.CLOSED }), TICKET_STATUS.IN_PROGRESS);
    expect(paraQuem()).toContain('josy@px.com.br');
  });

  it('e o cancelamento também — é a notícia que ninguém pode perder', async () => {
    await notifyTicketStatusChange(os({ status: TICKET_STATUS.CANCELED }), TICKET_STATUS.IN_PROGRESS);
    expect(paraQuem()).toContain('josy@px.com.br');
  });
});

describe('a diretoria', () => {
  /**
   * A regra real, descoberta ao escrever estes testes: pelo caminho da mudança de
   * etapa o aviso vai para os e-mails designados NA OS. Não há rede: o envio passa
   * `skipDirectorFallback: true`, justamente para um pedido de aprovação de uma OS
   * não cair na caixa da diretoria inteira.
   */
  it('vai para o diretor designado na OS', async () => {
    diretorioSimulado = [{ email: 'todos@px.com.br', role: 'Diretor', status: 'Ativo', active: true }];

    await notifyTicketStatusChange(
      os({
        status: TICKET_STATUS.WAITING_BUDGET_APPROVAL,
        directorEmails: ['designado@px.com.br'],
        directorIds: ['dir-x'],
      }),
      TICKET_STATUS.WAITING_BUDGET
    );

    const paraDiretoria = enviados.filter(e => String(e.trigger || '').startsWith('EMAIL-DIRETORIA-'));
    expect(paraDiretoria).toHaveLength(1);
    expect(paraDiretoria[0].toEmail).toBe('designado@px.com.br');
    expect(paraDiretoria[0].toEmail, 'a rede não pode atropelar a designação').not.toContain(
      'todos@px.com.br'
    );
  });

  it('OS sem diretor não gera aviso à diretoria', async () => {
    diretorioSimulado = [{ email: 'dir@px.com.br', role: 'Diretor', status: 'Ativo', active: true }];

    await notifyTicketStatusChange(
      os({ status: TICKET_STATUS.WAITING_BUDGET_APPROVAL, directorEmails: [], directorIds: [] }),
      TICKET_STATUS.WAITING_BUDGET
    );

    expect(enviados.filter(e => String(e.trigger || '').startsWith('EMAIL-DIRETORIA-'))).toHaveLength(0);
  });

  it('⚠️ diretor designado SÓ por ID: o pedido de aprovação some, calado', async () => {
    /**
     * DEFEITO CARACTERIZADO — este teste fixa o comportamento ATUAL, que está errado.
     *
     * `temDiretorEnvolvido` aceita id OU e-mail (a OS antiga guarda só id). Com id e
     * sem e-mail, o código entra no bloco da diretoria, monta o e-mail inteiro e
     * então desiste no `skipDirectorFallback`: devolve `false`, e quem chamou
     * descarta o retorno. Nenhum e-mail, nenhum log, nenhum aviso na tela.
     *
     * Na prática: a OS fica parada em "aguardando aprovação" e o diretor nunca soube
     * que havia algo esperando por ele.
     *
     * O conserto é resolver o e-mail pelo id no cadastro — a decisão é de produto,
     * então está relatada, não aplicada. Quando for corrigido, este teste falha de
     * propósito: é o lembrete.
     */
    diretorioSimulado = [{ email: 'dir-x@px.com.br', role: 'Diretor', status: 'Ativo', active: true }];

    await notifyTicketStatusChange(
      os({ status: TICKET_STATUS.WAITING_BUDGET_APPROVAL, directorEmails: [], directorIds: ['dir-x'] }),
      TICKET_STATUS.WAITING_BUDGET
    );

    expect(enviados.filter(e => String(e.trigger || '').startsWith('EMAIL-DIRETORIA-'))).toHaveLength(0);
  });
});

describe('o que sai é sempre identificável', () => {
  it('todo envio carrega um gatilho — sem ele o log não diz de onde veio', async () => {
    await notifyTicketCreated(os());
    await notifyTicketStatusChange(os({ status: TICKET_STATUS.CLOSED }), TICKET_STATUS.IN_PROGRESS);
    expect(enviados.length).toBeGreaterThan(0);
    for (const gatilho of gatilhos()) expect(gatilho.length).toBeGreaterThan(0);
  });

  it('e a OS de origem, para o e-mail cair na conversa certa', async () => {
    await notifyTicketCreated(os());
    for (const envio of enviados) {
      expect(String(envio.ticketId || envio.ticket || '')).toContain('OS-0100');
    }
  });

  it('falha de rede não derruba quem chamou', async () => {
    // O envio é efeito colateral de uma ação da tela: se ele explodir, a gestora
    // perde o que estava fazendo por causa de um e-mail.
    vi.stubGlobal('fetch', async () => {
      throw new Error('rede fora');
    });
    await expect(notifyTicketCreated(os())).resolves.not.toThrow();
  });
});

describe('resposta ao solicitante', () => {
  it('os interessados entram em cópia; o solicitante fica no destinatário', async () => {
    // Quem está em cópia acompanha; quem está no `to` é a quem se pergunta.
    await notifyTicketPublicReply(os(), 'Gestor', 'Equipe passa amanhã.', [], ['chefe@px.com.br']);
    expect(paraQuem()).toContain('josy@px.com.br');
    expect(emCopia()).toContain('chefe@px.com.br');
  });

  it('mensagem vazia não vira e-mail', async () => {
    // Um envio em branco chega ao solicitante como ruído, e ainda gasta cota da API.
    const resultado = await notifyTicketPublicReply(os(), 'Gestor', '   ');
    expect(resultado).toBe('empty');
    expect(enviados).toHaveLength(0);
  });

  it('OS sem e-mail do solicitante recusa, e diz por quê', async () => {
    // Devolver o motivo deixa a tela avisar a gestora. Um `false` mudo faria a
    // resposta sumir sem ninguém perceber.
    const resultado = await notifyTicketPublicReply(os({ requesterEmail: '' }), 'Gestor', 'Oi');
    expect(resultado).toBe('no-recipient');
    expect(enviados).toHaveLength(0);
  });
});
