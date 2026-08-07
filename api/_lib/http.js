import { parse as parseQueryString } from 'node:querystring';
import Busboy from 'busboy';

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function sendError(res, error, fallbackMessage = 'Falha interna do servidor.') {
  const statusCode =
    error instanceof HttpError && Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const message =
    error instanceof HttpError && error.message ? error.message : fallbackMessage;

  if (!(error instanceof HttpError)) {
    console.error('[http] erro inesperado na API', error);
  }

  return sendJson(res, statusCode, { ok: false, error: message });
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const raw = await readRawBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Corpo da requisição não é um JSON válido.');
  }
}

const MAX_JSON_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk, 'utf8');
      if (size > MAX_JSON_BODY_SIZE) {
        req.destroy();
        return reject(new HttpError(413, 'Corpo da requisição muito grande.'));
      }
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

export async function parseInboundBody(req, options = {}) {
  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('application/json')) {
    return readJsonBody(req);
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const raw = await readRawBody(req);
    return parseQueryString(raw);
  }

  if (contentType.includes('multipart/form-data')) {
    return parseMultipartForm(req, options.multipartLimits);
  }

  return {};
}

export const DEFAULT_MULTIPART_LIMITS = Object.freeze({
  maxFiles: 25,
  maxFileSizeBytes: 25 * 1024 * 1024,
  maxTotalFileBytes: 50 * 1024 * 1024,
  maxFields: 64,
  maxFieldSizeBytes: 5 * 1024 * 1024,
  maxParts: 100,
  maxRequestSizeBytes: 60 * 1024 * 1024,
});

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveMultipartLimits(overrides = {}) {
  return {
    maxFiles: positiveInteger(overrides.maxFiles, DEFAULT_MULTIPART_LIMITS.maxFiles),
    maxFileSizeBytes: positiveInteger(overrides.maxFileSizeBytes, DEFAULT_MULTIPART_LIMITS.maxFileSizeBytes),
    maxTotalFileBytes: positiveInteger(overrides.maxTotalFileBytes, DEFAULT_MULTIPART_LIMITS.maxTotalFileBytes),
    maxFields: positiveInteger(overrides.maxFields, DEFAULT_MULTIPART_LIMITS.maxFields),
    maxFieldSizeBytes: positiveInteger(overrides.maxFieldSizeBytes, DEFAULT_MULTIPART_LIMITS.maxFieldSizeBytes),
    maxParts: positiveInteger(overrides.maxParts, DEFAULT_MULTIPART_LIMITS.maxParts),
    maxRequestSizeBytes: positiveInteger(overrides.maxRequestSizeBytes, DEFAULT_MULTIPART_LIMITS.maxRequestSizeBytes),
  };
}

function parseMultipartForm(req, overrides = {}) {
  const limits = resolveMultipartLimits(overrides);
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > limits.maxRequestSizeBytes) {
    return Promise.reject(new HttpError(413, 'Formulário e anexos excedem o tamanho máximo permitido.'));
  }

  return new Promise((resolve, reject) => {
    const fields = {};
    const attachments = [];
    let totalFileBytes = 0;
    let limitError = null;
    let settled = false;
    let busboy;

    const finishWithError = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const recordLimitError = message => {
      if (!limitError) limitError = new HttpError(413, message);
    };

    try {
      busboy = Busboy({
        headers: req.headers,
        limits: {
          files: limits.maxFiles,
          fileSize: limits.maxFileSizeBytes,
          fields: limits.maxFields,
          fieldSize: limits.maxFieldSizeBytes,
          parts: limits.maxParts,
        },
      });
    } catch {
      return finishWithError(new HttpError(400, 'Formulário multipart inválido.'));
    }

    busboy.on('field', (name, value, info) => {
      if (info?.valueTruncated) {
        recordLimitError(`O campo "${name}" excede o tamanho máximo permitido.`);
        return;
      }
      fields[name] = value;
    });

    busboy.on('file', (name, file, info) => {
      const chunks = [];
      let size = 0;

      file.on('limit', () => {
        recordLimitError(`O arquivo "${info?.filename || name}" excede o tamanho máximo permitido.`);
      });

      file.on('data', chunk => {
        size += chunk.length;
        totalFileBytes += chunk.length;
        if (totalFileBytes > limits.maxTotalFileBytes) {
          recordLimitError('A soma dos anexos excede o tamanho máximo permitido.');
          return;
        }
        if (!limitError) chunks.push(chunk);
      });

      file.on('end', () => {
        if (size === 0 || limitError || file.truncated) return;
        attachments.push({
          fieldName: name,
          filename: info?.filename || `${name}-${attachments.length + 1}`,
          mimeType: info?.mimeType || 'application/octet-stream',
          encoding: info?.encoding || null,
          size,
          buffer: Buffer.concat(chunks),
        });
      });
    });

    busboy.on('filesLimit', () => {
      recordLimitError(`Máximo de ${limits.maxFiles} anexos por envio.`);
    });
    busboy.on('fieldsLimit', () => {
      recordLimitError(`Máximo de ${limits.maxFields} campos por envio.`);
    });
    busboy.on('partsLimit', () => {
      recordLimitError('O formulário possui partes demais.');
    });
    busboy.on('finish', () => {
      if (settled) return;
      settled = true;
      if (limitError) {
        reject(limitError);
        return;
      }
      resolve({ ...fields, attachments });
    });
    busboy.on('error', () => {
      finishWithError(new HttpError(400, 'Formulário multipart inválido.'));
    });
    req.on('aborted', () => {
      finishWithError(new HttpError(400, 'Envio interrompido antes da conclusão.'));
    });
    req.on('error', () => {
      finishWithError(new HttpError(400, 'Falha ao receber o corpo da requisição.'));
    });
    req.pipe(busboy);
  });
}
