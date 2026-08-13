import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regressão do anexo de e-mail que sobrevivia à exclusão da OS.
 *
 * A cascata antiga apagava do Storage só os paths listados em `attachments[]` e
 * `closureChecklist.documents[]`. Anexo recebido por e-mail vai para
 * `attachments/tickets/inbound/<id>/` e é referenciado pelo HISTÓRICO — nunca por
 * esses arrays. Resultado medido em produção: 459 arquivos e 761 MB de OS que já não
 * existiam, com PII de e-mail dentro. Por isso a exclusão agora VARRE o prefixo.
 */

const apagados: string[] = [];
let pastas: string[] = [];
let arquivosPorPrefixo: Record<string, string[]> = {};

const arquivoFalso = (name: string) => ({
  name,
  delete: vi.fn(async () => {
    apagados.push(name);
  }),
});

const getFiles = vi.fn(async (opts: { prefix: string; delimiter?: string }) => {
  if (opts.delimiter) return [[], null, { prefixes: pastas }];
  return [(arquivosPorPrefixo[opts.prefix] || []).map(arquivoFalso)];
});

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ getFiles }) }),
}));

const { deleteTicketStorageFolder, listTicketStorageFiles } = await import('../../api/tickets.js');

/**
 * O backup (`scripts/infra/backup-os.mjs`) salva exatamente o que esta função lista.
 * Enquanto ele lia `attachments[]` e `closureChecklist.documents[]` e a cascata varria
 * o prefixo, ele salvava MENOS do que a exclusão apagava — anexo de e-mail ia embora
 * sem cópia. Estes casos travam o contrato dos dois lados.
 */
describe('listTicketStorageFiles', () => {
  beforeEach(() => {
    getFiles.mockClear();
    pastas = ['attachments/tickets/inbound/', 'attachments/tickets/quotes/'];
    arquivosPorPrefixo = {};
  });

  it('lista o anexo de e-mail, que nenhum array do documento referencia', async () => {
    arquivosPorPrefixo['attachments/tickets/inbound/OS-0200/'] = [
      'attachments/tickets/inbound/OS-0200/foto.jpeg',
    ];
    arquivosPorPrefixo['attachments/tickets/quotes/OS-0200/'] = [
      'attachments/tickets/quotes/OS-0200/cotacao.pdf',
    ];

    const nomes = (await listTicketStorageFiles('OS-0200')).map(f => f.name);

    expect(nomes).toEqual([
      'attachments/tickets/inbound/OS-0200/foto.jpeg',
      'attachments/tickets/quotes/OS-0200/cotacao.pdf',
    ]);
  });

  it('aplica a mesma trava de escopo da exclusão', async () => {
    arquivosPorPrefixo['attachments/tickets/inbound/OS-0201/'] = [
      'attachments/tickets/inbound/OS-0201/meu.pdf',
      'attachments/tickets/inbound/OS-0999/alheio.pdf',
    ];
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const nomes = (await listTicketStorageFiles('OS-0201')).map(f => f.name);

    expect(nomes).toEqual(['attachments/tickets/inbound/OS-0201/meu.pdf']);
  });

  it('não chama o bucket quando não há ticketId', async () => {
    expect(await listTicketStorageFiles('')).toEqual([]);
    expect(getFiles).not.toHaveBeenCalled();
  });
});

describe('deleteTicketStorageFolder', () => {
  beforeEach(() => {
    apagados.length = 0;
    getFiles.mockClear();
    pastas = ['attachments/tickets/inbound/', 'attachments/tickets/messages/', 'attachments/tickets/quotes/'];
    arquivosPorPrefixo = {};
  });

  it('apaga o anexo que chegou por e-mail, invisível para attachments[]', async () => {
    arquivosPorPrefixo['attachments/tickets/inbound/OS-0100/'] = [
      'attachments/tickets/inbound/OS-0100/1782308041330-foto.jpeg',
      'attachments/tickets/inbound/OS-0100/1782309157859-laudo.pdf',
    ];

    const total = await deleteTicketStorageFolder('OS-0100');

    expect(total).toBe(2);
    expect(apagados).toEqual([
      'attachments/tickets/inbound/OS-0100/1782308041330-foto.jpeg',
      'attachments/tickets/inbound/OS-0100/1782309157859-laudo.pdf',
    ]);
  });

  it('varre TODAS as pastas de tipo, não só as conhecidas de antemão', async () => {
    pastas = ['attachments/tickets/inbound/', 'attachments/tickets/pasta-nova-do-futuro/'];
    arquivosPorPrefixo['attachments/tickets/inbound/OS-0101/'] = ['attachments/tickets/inbound/OS-0101/a.png'];
    arquivosPorPrefixo['attachments/tickets/pasta-nova-do-futuro/OS-0101/'] = [
      'attachments/tickets/pasta-nova-do-futuro/OS-0101/b.png',
    ];

    expect(await deleteTicketStorageFolder('OS-0101')).toBe(2);
    expect(apagados).toContain('attachments/tickets/pasta-nova-do-futuro/OS-0101/b.png');
  });

  it('recusa arquivo de OUTRA OS mesmo se o bucket devolver no prefixo', async () => {
    // A trava de escopo é a rede embaixo do prefixo: sem ela, um path forjado
    // levaria a exclusão a destruir anexo alheio.
    arquivosPorPrefixo['attachments/tickets/inbound/OS-0102/'] = [
      'attachments/tickets/inbound/OS-0102/legitimo.pdf',
      'attachments/tickets/inbound/OS-0999/alheio.pdf',
    ];

    expect(await deleteTicketStorageFolder('OS-0102')).toBe(1);
    expect(apagados).toEqual(['attachments/tickets/inbound/OS-0102/legitimo.pdf']);
  });

  it('não derruba a exclusão da OS quando um arquivo falha', async () => {
    arquivosPorPrefixo['attachments/tickets/inbound/OS-0103/'] = [
      'attachments/tickets/inbound/OS-0103/ok.pdf',
      'attachments/tickets/inbound/OS-0103/quebra.pdf',
    ];
    getFiles.mockImplementationOnce(async () => [[], null, { prefixes: pastas }]);
    getFiles.mockImplementationOnce(async () => [
      [
        arquivoFalso('attachments/tickets/inbound/OS-0103/ok.pdf'),
        {
          name: 'attachments/tickets/inbound/OS-0103/quebra.pdf',
          delete: vi.fn(async () => {
            throw new Error('storage fora do ar');
          }),
        },
      ],
    ]);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await deleteTicketStorageFolder('OS-0103')).toBe(1);
  });

  it('não chama o bucket quando não há ticketId', async () => {
    expect(await deleteTicketStorageFolder('')).toBe(0);
    expect(getFiles).not.toHaveBeenCalled();
  });
});
