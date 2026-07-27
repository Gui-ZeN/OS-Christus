import { describe, expect, it } from 'vitest';

import {
  canRoleReadAttachmentPath,
  findAttachmentReference,
  isAttachmentPathInTicketScope,
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

