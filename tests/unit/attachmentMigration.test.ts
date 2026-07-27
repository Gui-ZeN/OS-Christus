import { describe, expect, it } from 'vitest';
import { buildAttachmentMigrationUpdates } from '../../api/_lib/attachmentMigration.js';

describe('attachment migration', () => {
  it('remove URL permanente somente quando existe path protegido', () => {
    const result = buildAttachmentMigrationUpdates({
      attachments: [{
        id: 'a1',
        name: 'foto.jpg',
        path: 'attachments/tickets/images/OS-0001/foto.jpg',
        url: 'https://firebasestorage.googleapis.com/file?token=abc',
      }],
    }, 'tickets/OS-0001');

    expect(result.changed).toBe(true);
    expect(result.storagePaths).toEqual(['attachments/tickets/images/OS-0001/foto.jpg']);
    expect(result.report).toMatchObject({
      removedUrlFields: 1,
      firebaseTokenUrls: 1,
      unresolvedUrls: 0,
    });
    expect((result.updates.attachments as Array<Record<string, unknown>>)[0]).not.toHaveProperty('url');
  });

  it('preserva e relata URL sem path para não quebrar anexo legado', () => {
    const url = 'https://storage.googleapis.com/bucket/legacy.pdf?X-Goog-Signature=abc';
    const result = buildAttachmentMigrationUpdates({
      signedFileName: 'contrato.pdf',
      signedFileUrl: url,
      signedFilePath: null,
    }, 'contracts/contract-1');

    expect(result.changed).toBe(false);
    expect(result.report).toMatchObject({
      signedUrls: 1,
      unresolvedUrls: 1,
    });
  });

  it('limpa os formatos de cotação, contrato e anexos aninhados', () => {
    const result = buildAttachmentMigrationUpdates({
      attachmentPath: 'attachments/tickets/quotes/OS-0001/quote.pdf',
      attachmentUrl: 'https://example.com/quote.pdf',
      signedFilePath: 'attachments/tickets/contracts/OS-0001/contract.pdf',
      signedFileUrl: 'https://example.com/contract.pdf',
      nested: {
        attachments: [{
          path: 'attachments/tickets/payments/OS-0001/receipt.pdf',
          url: 'https://example.com/receipt.pdf',
          name: 'receipt.pdf',
        }],
      },
    });

    expect(result.changed).toBe(true);
    expect(result.report.removedUrlFields).toBe(3);
    expect(result.storagePaths).toHaveLength(3);
    expect(result.updates).toHaveProperty('attachmentUrl');
    expect(result.updates).toHaveProperty('signedFileUrl');
    expect(result.updates.nested).toEqual({
      attachments: [{
        path: 'attachments/tickets/payments/OS-0001/receipt.pdf',
        name: 'receipt.pdf',
      }],
    });
  });

  it('preserva Timestamp e Date sem convertê-los em mapas', () => {
    const timestamp = { toDate: () => new Date('2026-07-27T12:00:00.000Z') };
    const date = new Date('2026-07-27T12:00:00.000Z');
    const result = buildAttachmentMigrationUpdates({
      updatedAt: timestamp,
      time: date,
      attachments: [],
    });

    expect(result.changed).toBe(false);
    expect(result.updates).toEqual({});
  });

  it('preserva URL quando o path existe mas está fora do escopo da OS', () => {
    const result = buildAttachmentMigrationUpdates(
      {
        attachments: [{
          name: 'recibo.pdf',
          path: 'attachments/tickets/payments/OS-OUTRA/payment-1/recibo.pdf',
          url: 'https://firebasestorage.googleapis.com/v0/b/bucket/o/file?alt=media&token=abc',
        }],
      },
      'tickets/OS-0001',
      {
        isSafeStoragePath: path => path.includes('/OS-0001/'),
      }
    );

    expect(result.changed).toBe(false);
    expect(result.report.removedUrlFields).toBe(0);
    expect(result.report.unresolvedUrls).toBe(1);
  });
});
