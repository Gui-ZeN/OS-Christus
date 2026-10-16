import { describe, expect, it } from 'vitest';

import {
  canRoleReadAttachmentPath,
  findAttachmentReference,
  isAttachmentPathInTicketScope,
  pinServerOnlyAttachmentFields,
} from '../../api/_lib/attachmentAccess.js';

describe('canRoleReadAttachmentPath (escopo de leitura por papel)', () => {
  const p = (folder: string) => `attachments/tickets/${folder}/OS-0100/arquivo.pdf`;

  it('Diretor LÊ o que precisa para aprovar (cotação, contrato, mensagem)', () => {
    for (const folder of ['quotes', 'contracts', 'messages', 'pdfs', 'images']) {
      expect(canRoleReadAttachmentPath('Diretor', p(folder))).toBe(true);
    }
  });

  it('Diretor NÃO lê anexo financeiro (não opera o FinanceView)', () => {
    expect(canRoleReadAttachmentPath('Diretor', p('payments'))).toBe(false);
    expect(canRoleReadAttachmentPath('Diretor', p('measurements'))).toBe(false);
  });

  it('allow-list: pasta NOVA nasce negada para o Diretor (default é negar)', () => {
    expect(canRoleReadAttachmentPath('Diretor', p('invoices'))).toBe(false);
  });

  it('não depende da grafia da pasta', () => {
    expect(canRoleReadAttachmentPath('Diretor', p('Payments'))).toBe(false);
    expect(canRoleReadAttachmentPath('Diretor', p('QUOTES'))).toBe(true);
  });

  it('Admin e Gestor operam o fluxo inteiro — sem restrição de pasta', () => {
    for (const role of ['Admin', 'Gestor']) {
      for (const folder of ['payments', 'measurements', 'quotes', 'contracts', 'messages']) {
        expect(canRoleReadAttachmentPath(role, p(folder))).toBe(true);
      }
    }
  });

  it('papel desconhecido/ausente não é bloqueado aqui (o gate de papel é anterior)', () => {
    expect(canRoleReadAttachmentPath(undefined, p('payments'))).toBe(true);
  });
});

describe('attachment access', () => {
  it('aceita somente caminhos pertencentes à OS informada', () => {
    expect(
      isAttachmentPathInTicketScope(
        'attachments/tickets/messages/OS-0100/public/arquivo.pdf',
        'OS-0100'
      )
    ).toBe(true);
    expect(
      isAttachmentPathInTicketScope(
        'attachments/tickets/messages/OS-0101/public/arquivo.pdf',
        'OS-0100'
      )
    ).toBe(false);
    expect(
      isAttachmentPathInTicketScope(
        'attachments/tickets/messages/OS-0100/../OS-0101/arquivo.pdf',
        'OS-0100'
      )
    ).toBe(false);
  });

  it('localiza anexos padrão dentro do ticket e do histórico', () => {
    const path = 'attachments/tickets/images/OS-0100/foto.jpg';
    const source = {
      history: [{
        attachments: [{
          path,
          name: 'Foto do local.jpg',
          contentType: 'image/jpeg',
        }],
      }],
    };

    expect(findAttachmentReference(source, { path, driveFileId: null })).toEqual({
      path,
      driveFileId: null,
      name: 'Foto do local.jpg',
      contentType: 'image/jpeg',
    });
  });

  it('reconhece os campos específicos de cotação e contrato', () => {
    const quotePath = 'attachments/tickets/quotes/OS-0100/initial-1/quote-1/proposta.pdf';
    const contractPath = 'attachments/tickets/contracts/OS-0100/contrato.pdf';

    expect(findAttachmentReference({
      attachmentPath: quotePath,
      attachmentName: 'Proposta.pdf',
    }, { path: quotePath, driveFileId: null })?.name).toBe('Proposta.pdf');

    expect(findAttachmentReference({
      signedFilePath: contractPath,
      signedFileName: 'Contrato.pdf',
      signedFileContentType: 'application/pdf',
    }, { path: contractPath, driveFileId: null })).toMatchObject({
      name: 'Contrato.pdf',
      contentType: 'application/pdf',
    });
  });

  it('exige que o driveFileId pertença à mesma referência arquivada', () => {
    const path = 'attachments/tickets/pdfs/OS-0100/laudo.pdf';
    const source = {
      path,
      driveFileId: 'drive-correto',
      name: 'Laudo.pdf',
    };

    expect(findAttachmentReference(source, {
      path,
      driveFileId: 'drive-correto',
    })).not.toBeNull();
    expect(findAttachmentReference(source, {
      path,
      driveFileId: 'drive-de-outro-arquivo',
    })).toBeNull();
  });
});


describe('pinServerOnlyAttachmentFields (driveFileId é só do servidor)', () => {
  const pathA = 'attachments/tickets/pdfs/OS-A/orcamento.pdf';
  const stored = {
    attachments: [{ name: 'orcamento.pdf', path: pathA, archived: true, driveFileId: 'drive-A', archivedAt: 'quando' }],
  };

  it('descarta driveFileId forjado em anexo novo, em qualquer profundidade', () => {
    const forged = { path: 'attachments/tickets/quotes/OS-A/x.pdf', driveFileId: 'drive-B', archived: true, archivedAt: 'x' };
    const pinned = pinServerOnlyAttachmentFields(
      {
        attachments: [forged],
        orcamento: { anexos: [forged], notas: [{ texto: 'n', anexo: forged }] },
        history: [{ id: 'h1', attachments: [forged] }],
      },
      stored
    );
    const json = JSON.stringify(pinned);
    expect(json).not.toContain('drive-B');
    expect(json).not.toContain('archived');
    expect(pinned.orcamento.notas[0].anexo).toEqual({ path: forged.path });
  });

  it('troca o driveFileId forjado de um anexo existente pelo que estava gravado', () => {
    const pinned = pinServerOnlyAttachmentFields(
      { attachments: [{ name: 'orcamento.pdf', path: pathA, driveFileId: 'drive-B', archived: false }] },
      stored
    );
    expect(pinned.attachments[0]).toEqual(stored.attachments[0]);
  });

  it('anexo arquivado reenviado SEM os campos continua arquivado', () => {
    const pinned = pinServerOnlyAttachmentFields({ attachments: [{ name: 'orcamento.pdf', path: pathA }] }, stored);
    expect(pinned.attachments[0].driveFileId).toBe('drive-A');
    expect(pinned.attachments[0].archived).toBe(true);
  });

  it('NÃO repõe quando outra chave de path diverge (Diretor puxando o driveFileId do pagamento)', () => {
    const payments = 'attachments/tickets/payments/OS-A/recibo.pdf';
    const pinned = pinServerOnlyAttachmentFields(
      { history: [{ id: 'h', attachments: [{ path: 'attachments/tickets/messages/OS-A/x.pdf', attachmentPath: payments }] }] },
      { pagamento: { attachmentPath: payments, driveFileId: 'D-PAG', archived: true } }
    );
    expect(JSON.stringify(pinned)).not.toContain('D-PAG');
  });

  it('preserva Date e o resto do payload', () => {
    const time = new Date('2026-10-16T12:00:00Z');
    const pinned = pinServerOnlyAttachmentFields({ status: 'X', history: [{ id: 'h', time }] }, {});
    expect(pinned.status).toBe('X');
    expect(pinned.history[0].time).toBe(time);
  });

  it('com o PATCH fixado, o download não acha o driveFileId forjado (404)', () => {
    const pinned = pinServerOnlyAttachmentFields(
      { attachments: [{ path: 'attachments/tickets/quotes/OS-A/x.pdf', driveFileId: 'drive-B' }] },
      {}
    );
    const ref = findAttachmentReference(pinned, { path: 'attachments/tickets/quotes/OS-A/x.pdf', driveFileId: 'drive-B' });
    expect(ref).toBeNull();
  });
});
