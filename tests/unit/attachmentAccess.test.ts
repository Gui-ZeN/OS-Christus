import { describe, expect, it } from 'vitest';

import {
  findAttachmentReference,
  isAttachmentPathInTicketScope,
} from '../../api/_lib/attachmentAccess.js';

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

