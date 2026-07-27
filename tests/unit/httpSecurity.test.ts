import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import {
  HttpError,
  parseInboundBody,
  resolveMultipartLimits,
  sendError,
} from '../../api/_lib/http.js';

function buildMultipartRequest(fileContent: string, declaredLength?: number) {
  const boundary = '----serv3-test-boundary';
  const body = Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="ticket"',
      '',
      '{"subject":"Teste"}',
      `--${boundary}`,
      'Content-Disposition: form-data; name="attachment"; filename="teste.txt"',
      'Content-Type: text/plain',
      '',
      fileContent,
      `--${boundary}--`,
      '',
    ].join('\r\n')
  );
  const request = Readable.from([body]) as Readable & {
    headers: Record<string, string>;
  };
  request.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': String(declaredLength ?? body.length),
  };
  return request;
}

function createResponseRecorder() {
  let payload = '';
  return {
    response: {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn((value: string) => {
        payload = value;
      }),
    },
    readPayload: () => JSON.parse(payload),
  };
}

describe('HTTP security helpers', () => {
  it('normaliza limites multipart inválidos para padrões seguros', () => {
    const limits = resolveMultipartLimits({
      maxFiles: 3,
      maxFileSizeBytes: -1,
      maxFields: Number.NaN,
    });

    expect(limits.maxFiles).toBe(3);
    expect(limits.maxFileSizeBytes).toBeGreaterThan(0);
    expect(limits.maxFields).toBeGreaterThan(0);
  });

  it('faz parse de multipart dentro dos limites', async () => {
    const result = await parseInboundBody(buildMultipartRequest('arquivo'), {
      multipartLimits: {
        maxFiles: 1,
        maxFileSizeBytes: 64,
        maxTotalFileBytes: 64,
        maxFields: 2,
        maxFieldSizeBytes: 64,
        maxParts: 3,
        maxRequestSizeBytes: 1024,
      },
    });

    expect(result.ticket).toBe('{"subject":"Teste"}');
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].buffer.toString('utf8')).toBe('arquivo');
  });

  it('rejeita arquivo que excede o limite antes de devolvê-lo à rota', async () => {
    await expect(
      parseInboundBody(buildMultipartRequest('1234567890'), {
        multipartLimits: {
          maxFiles: 1,
          maxFileSizeBytes: 5,
          maxTotalFileBytes: 64,
          maxFields: 2,
          maxFieldSizeBytes: 64,
          maxParts: 3,
          maxRequestSizeBytes: 1024,
        },
      })
    ).rejects.toMatchObject({
      statusCode: 413,
    });
  });

  it('rejeita pelo Content-Length antes de iniciar o parser', async () => {
    await expect(
      parseInboundBody(buildMultipartRequest('arquivo', 2048), {
        multipartLimits: { maxRequestSizeBytes: 1024 },
      })
    ).rejects.toMatchObject({
      statusCode: 413,
    });
  });

  it('não devolve detalhes de uma exceção inesperada em respostas 500', () => {
    const recorder = createResponseRecorder();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    sendError(
      recorder.response,
      new Error('credencial-interna-nao-pode-vazar'),
      'Falha segura no endpoint.'
    );

    expect(recorder.response.statusCode).toBe(500);
    expect(recorder.readPayload()).toEqual({ ok: false, error: 'Falha segura no endpoint.' });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('preserva mensagens operacionais explícitas de HttpError', () => {
    const recorder = createResponseRecorder();

    sendError(recorder.response, new HttpError(429, 'Aguarde antes de tentar novamente.'));

    expect(recorder.response.statusCode).toBe(429);
    expect(recorder.readPayload()).toEqual({
      ok: false,
      error: 'Aguarde antes de tentar novamente.',
    });
  });
});

