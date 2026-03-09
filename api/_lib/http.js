import { parse as parseQueryString } from 'node:querystring';
import Busboy from 'busboy';

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function readActorFromHeaders(req) {
  const email = String(req.headers['x-actor-email'] || '').trim().toLowerCase();
  const name = String(req.headers['x-actor-name'] || '').trim();
  if (name && email) return `${name} <${email}>`;
  if (name) return name;
  if (email) return email;
  return 'painel';
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const raw = await readRawBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

export async function parseInboundBody(req) {
  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('application/json')) {
    return readJsonBody(req);
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const raw = await readRawBody(req);
    return parseQueryString(raw);
  }

  if (contentType.includes('multipart/form-data')) {
    return parseMultipartForm(req);
  }

  return {};
}

function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const attachments = [];
    const busboy = Busboy({ headers: req.headers });

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (name, file, info) => {
      const chunks = [];
      let size = 0;

      file.on('data', chunk => {
        chunks.push(chunk);
        size += chunk.length;
      });

      file.on('end', () => {
        if (size === 0) return;
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

    busboy.on('finish', () => resolve({ ...fields, attachments }));
    busboy.on('error', reject);
    req.pipe(busboy);
  });
}
