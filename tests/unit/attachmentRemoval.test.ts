import { describe, expect, it } from 'vitest';
import {
  clearFlatAttachmentFields,
  findProtectedEvidenceReason,
  removeAttachmentReference,
} from '../../api/_lib/attachmentRemoval.js';
import { findAttachmentReference } from '../../api/_lib/attachmentAccess.js';

const PATH = 'attachments/tickets/payments/OS-0100/pay-1/nota.pdf';
const locator = { path: PATH, driveFileId: null };

describe('findProtectedEvidenceReason', () => {
  it('bloqueia comprovante de lançamento pago', () => {
    expect(findProtectedEvidenceReason('payments', { status: 'paid' })).toMatch(/já pago/i);
  });

  it('bloqueia lançamento já liberado para pagamento', () => {
    expect(findProtectedEvidenceReason('payments', { status: 'approved' })).toMatch(/liberado/i);
  });

  it('libera lançamento ainda pendente', () => {
    expect(findProtectedEvidenceReason('payments', { status: 'pending' })).toBeNull();
  });

  it('bloqueia medição aprovada e libera a pendente', () => {
    expect(findProtectedEvidenceReason('measurements', { status: 'approved' })).toMatch(/medição/i);
    expect(findProtectedEvidenceReason('measurements', { status: 'pending' })).toBeNull();
  });

  it('bloqueia cotação já decidida, nos dois sentidos', () => {
    expect(findProtectedEvidenceReason('quotes', { status: 'approved' })).toMatch(/vencedora/i);
    expect(findProtectedEvidenceReason('quotes', { status: 'rejected' })).toMatch(/decidida/i);
    expect(findProtectedEvidenceReason('quotes', { status: 'pending_approval' })).toBeNull();
  });

  it('bloqueia contrato aprovado — inclusive o legado, que só tem approvedAt', () => {
    expect(findProtectedEvidenceReason('contracts', { status: 'approved' })).toMatch(/contrato/i);
    expect(findProtectedEvidenceReason('contracts', { approvedAt: new Date() })).toMatch(/contrato/i);
    expect(findProtectedEvidenceReason('contracts', { status: 'pending_approval' })).toBeNull();
  });

  it('status ausente ou coleção desconhecida não bloqueia', () => {
    expect(findProtectedEvidenceReason('payments', {})).toBeNull();
    expect(findProtectedEvidenceReason('outra', { status: 'paid' })).toBeNull();
  });
});

describe('removeAttachmentReference', () => {
  it('tira o anexo de uma lista, preservando os demais', () => {
    const doc = {
      id: 'pay-1',
      attachments: [
        { id: 'a', path: PATH, name: 'nota.pdf' },
        { id: 'b', path: 'attachments/tickets/payments/OS-0100/pay-1/outra.pdf' },
      ],
    };
    const result = removeAttachmentReference(doc, locator);
    expect(result.removed).toBe(true);
    expect(result.value.attachments).toHaveLength(1);
    expect(result.value.attachments[0].id).toBe('b');
  });

  it('alcança listas aninhadas (documentos do checklist de encerramento)', () => {
    const ticket = {
      closureChecklist: { documents: [{ id: 'd1', path: PATH, name: 'ata.pdf' }] },
      attachments: [],
    };
    const result = removeAttachmentReference(ticket, locator);
    expect(result.removed).toBe(true);
    expect(result.value.closureChecklist.documents).toHaveLength(0);
  });

  it('alcança anexo dentro de entrada de histórico', () => {
    const entry = { id: 'h1', text: 'nota', attachments: [{ path: PATH }] };
    const result = removeAttachmentReference(entry, locator);
    expect(result.removed).toBe(true);
    expect(result.value.attachments).toHaveLength(0);
    expect(result.value.text).toBe('nota');
  });

  it('não mexe em nada quando o anexo não está no documento', () => {
    const doc = { attachments: [{ path: 'attachments/tickets/payments/OS-0100/pay-1/z.pdf' }] };
    const result = removeAttachmentReference(doc, locator);
    expect(result.removed).toBe(false);
    expect(result.value).toBe(doc);
  });

  it('respeita o driveFileId do localizador (não apaga o anexo errado)', () => {
    const doc = { attachments: [{ path: PATH, driveFileId: 'drive-A' }] };
    const outro = removeAttachmentReference(doc, { path: PATH, driveFileId: 'drive-B' });
    expect(outro.removed).toBe(false);
    const certo = removeAttachmentReference(doc, { path: PATH, driveFileId: 'drive-A' });
    expect(certo.removed).toBe(true);
  });

  it('sobrevive a referência circular', () => {
    const doc: Record<string, unknown> = { attachments: [{ path: PATH }] };
    doc.self = doc;
    expect(() => removeAttachmentReference(doc, locator)).not.toThrow();
  });

  // Invariante entre os dois módulos: se a busca acha, a remoção tem que tirar —
  // senão o DELETE apagaria o objeto e deixaria a referência para trás.
  it('tudo que findAttachmentReference encontra, a remoção elimina', () => {
    const formatos = [
      { attachments: [{ path: PATH }] },
      { closureChecklist: { documents: [{ attachmentPath: PATH }] } },
      { history: [{ attachments: [{ path: PATH }] }] },
      { nested: { deep: { list: [{ path: PATH }] } } },
    ];
    for (const doc of formatos) {
      expect(findAttachmentReference(doc, locator)).not.toBeNull();
      const result = removeAttachmentReference(doc, locator);
      expect(result.removed).toBe(true);
      expect(findAttachmentReference(result.value, locator)).toBeNull();
    }
  });
});

describe('clearFlatAttachmentFields', () => {
  const grupos = [
    {
      pathField: 'signedFilePath',
      fields: ['signedFilePath', 'signedFileName', 'signedFileUrl', 'signedFileContentType'],
    },
  ];

  it('limpa o grupo inteiro do contrato assinado', () => {
    const contrato = {
      id: 'contract-1',
      vendor: 'ACME',
      signedFilePath: PATH,
      signedFileName: 'contrato.pdf',
      signedFileUrl: 'https://x/y',
      signedFileContentType: 'application/pdf',
    };
    const result = clearFlatAttachmentFields(contrato, locator, grupos);
    expect(result.removed).toBe(true);
    expect(result.value.signedFilePath).toBeNull();
    expect(result.value.signedFileName).toBeNull();
    // o resto do contrato continua intacto
    expect(result.value.vendor).toBe('ACME');
  });

  it('ignora quando o caminho é de outro arquivo', () => {
    const contrato = { signedFilePath: 'attachments/tickets/contracts/OS-0100/outro.pdf' };
    const result = clearFlatAttachmentFields(contrato, locator, grupos);
    expect(result.removed).toBe(false);
    expect(result.value).toBe(contrato);
  });
});
