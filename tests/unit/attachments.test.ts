import { describe, expect, it } from 'vitest';
import {
  assertAllowedAttachmentContent,
  detectAttachmentContent,
  isAttachmentContentCompatible,
} from '../../api/_lib/attachments.js';

describe('attachment content validation', () => {
  it('recognizes allowed binary signatures', () => {
    expect(detectAttachmentContent(Buffer.from('%PDF-1.7\\n'))).toBe('pdf');
    expect(detectAttachmentContent(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]))).toBe('jpeg');
    expect(detectAttachmentContent(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))).toBe('png');
  });

  it('rejects an executable disguised as a PDF or image', () => {
    const executable = Buffer.from('MZ fake executable payload');
    expect(isAttachmentContentCompatible(executable, 'application/pdf')).toBe(false);
    expect(() => assertAllowedAttachmentContent(executable, 'image/png', 'foto.png')).toThrow(
      'não corresponde ao tipo informado'
    );
  });

  it('requires Office Open XML packages to contain the expected document family', () => {
    const fakeDocx = Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x03, 0x04]),
      Buffer.from('[Content_Types].xml xl/workbook.xml'),
    ]);
    expect(isAttachmentContentCompatible(fakeDocx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false);
    expect(isAttachmentContentCompatible(fakeDocx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
  });

  it('accepts UTF-8 text and rejects binary content declared as CSV', () => {
    expect(isAttachmentContentCompatible(Buffer.from('coluna,valor\\na,1\\n'), 'text/csv')).toBe(true);
    expect(isAttachmentContentCompatible(Buffer.from([0x00, 0x01, 0x02]), 'text/csv')).toBe(false);
  });
});
