import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { isAttachmentPathInTicketScope } from './attachmentAccess.js';

const SUBCOLLECTIONS = ['quotes', 'contracts', 'payments', 'measurements', 'historyEntries'];
const URL_PATH_PAIRS = [
  ['url', 'path'],
  ['attachmentUrl', 'attachmentPath'],
  ['signedFileUrl', 'signedFilePath'],
];

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 5;
  return Math.min(parsed, 10);
}

function isTraversableObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Date) return false;
  if (typeof value.toDate === 'function') return false;
  const constructorName = String(value.constructor?.name || '');
  return !constructorName || constructorName === 'Object';
}

function classifyLegacyUrl(value) {
  const url = String(value || '').trim();
  if (!url) return null;
  if (/firebasestorage\.googleapis\.com/i.test(url) && /[?&]token=/i.test(url)) {
    return 'firebaseToken';
  }
  if (/[?&]X-Goog-Signature=/i.test(url) || /[?&]GoogleAccessId=/i.test(url)) {
    return 'signed';
  }
  return 'other';
}

function createReport() {
  return {
    removedUrlFields: 0,
    firebaseTokenUrls: 0,
    signedUrls: 0,
    otherLegacyUrls: 0,
    unresolvedUrls: 0,
    unresolvedSamples: [],
  };
}

function recordUrl(report, value, unresolved, location) {
  const kind = classifyLegacyUrl(value);
  if (!kind) return;
  if (kind === 'firebaseToken') report.firebaseTokenUrls += 1;
  else if (kind === 'signed') report.signedUrls += 1;
  else report.otherLegacyUrls += 1;
  if (unresolved) {
    report.unresolvedUrls += 1;
    if (report.unresolvedSamples.length < 20) {
      report.unresolvedSamples.push({ location, kind });
    }
  }
}

function sanitizeValue(value, location, report, storagePaths, options) {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry, index) => {
      const result = sanitizeValue(entry, `${location}[${index}]`, report, storagePaths, options);
      if (result.changed) changed = true;
      return result.value;
    });
    return { value: changed ? next : value, changed };
  }
  if (!isTraversableObject(value)) return { value, changed: false };

  let changed = false;
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const result = sanitizeValue(entry, `${location}.${key}`, report, storagePaths, options);
    next[key] = result.value;
    if (result.changed) changed = true;
  }

  for (const [urlKey, pathKey] of URL_PATH_PAIRS) {
    const url = String(value[urlKey] || '').trim();
    const storagePath = String(value[pathKey] || '').trim();
    if (storagePath) storagePaths.add(storagePath);
    if (!url) continue;

    if (storagePath) {
      const safePath =
        typeof options?.isSafeStoragePath !== 'function' ||
        options.isSafeStoragePath(storagePath);
      if (!safePath) {
        recordUrl(report, url, true, `${location}.${urlKey}`);
        continue;
      }
      delete next[urlKey];
      changed = true;
      report.removedUrlFields += 1;
      recordUrl(report, url, false, `${location}.${urlKey}`);
      continue;
    }

    const isAttachmentUrl =
      urlKey !== 'url' ||
      Boolean(value.name || value.filename || value.contentType || value.category || value.driveFileId);
    if (isAttachmentUrl) {
      recordUrl(report, url, true, `${location}.${urlKey}`);
    }
  }

  return { value: changed ? next : value, changed };
}

export function buildAttachmentMigrationUpdates(data, location = 'document', options = {}) {
  const report = createReport();
  const storagePaths = new Set();
  const result = sanitizeValue(data || {}, location, report, storagePaths, options);
  const updates = {};

  if (result.changed) {
    const original = data || {};
    const next = result.value || {};
    const topLevelKeys = new Set([...Object.keys(original), ...Object.keys(next)]);
    for (const key of topLevelKeys) {
      if (!(key in next)) {
        updates[key] = FieldValue.delete();
      } else if (next[key] !== original[key]) {
        updates[key] = next[key];
      }
    }
  }

  return {
    changed: result.changed,
    updates,
    storagePaths: [...storagePaths],
    report,
  };
}

function mergeReports(target, source) {
  for (const key of [
    'removedUrlFields',
    'firebaseTokenUrls',
    'signedUrls',
    'otherLegacyUrls',
    'unresolvedUrls',
  ]) {
    target[key] += Number(source?.[key] || 0);
  }
  for (const sample of source?.unresolvedSamples || []) {
    if (target.unresolvedSamples.length >= 20) break;
    target.unresolvedSamples.push(sample);
  }
}

async function inspectAndRevokeStorageTokens(bucket, storagePaths, dryRun) {
  const result = {
    inspectedObjects: 0,
    tokenizedObjects: 0,
    revokedTokens: 0,
    missingObjects: 0,
    failedObjects: 0,
    failures: [],
    // Paths cujo objeto NÃO existe (404) ou que não deu para inspecionar. A url
    // legada desses anexos é o único acesso restante: apagá-la seria destruir o
    // arquivo do ponto de vista do usuário. O chamador PULA a escrita desses docs.
    unverifiedPaths: new Set(),
    missingSamples: [],
  };

  for (let start = 0; start < storagePaths.length; start += 5) {
    const chunk = storagePaths.slice(start, start + 5);
    await Promise.all(chunk.map(async path => {
      try {
        const file = bucket.file(path);
        const [metadata] = await file.getMetadata();
        result.inspectedObjects += 1;
        const token = String(metadata?.metadata?.firebaseStorageDownloadTokens || '').trim();
        if (!token) return;
        result.tokenizedObjects += 1;
        if (!dryRun) {
          await file.setMetadata({
            metadata: {
              ...(metadata.metadata || {}),
              firebaseStorageDownloadTokens: null,
            },
          });
          result.revokedTokens += 1;
        }
      } catch (error) {
        if (Number(error?.code) === 404) {
          result.missingObjects += 1;
          result.unverifiedPaths.add(path);
          if (result.missingSamples.length < 20) result.missingSamples.push(path);
          return;
        }
        result.failedObjects += 1;
        // Não deu para confirmar que o objeto existe → trata como não verificado
        // (conservador: melhor deixar a url legada viva do que arriscar apagá-la).
        result.unverifiedPaths.add(path);
        if (result.failures.length < 20) {
          result.failures.push({ path, error: error?.message || 'Falha desconhecida.' });
        }
      }
    }));
  }

  return result;
}

export async function migrateLegacyAttachmentBatch(db, bucket, options = {}) {
  const limit = normalizeLimit(options.limit);
  const cursor = String(options.cursor || '').trim();
  const dryRun = options.dryRun !== false;
  let query = db.collection('tickets').orderBy(FieldPath.documentId()).limit(limit);
  if (cursor) query = query.startAfter(cursor);

  const snap = await query.get();
  const report = createReport();
  const storagePaths = new Set();
  const invalidStoragePathSamples = [];
  let invalidStoragePaths = 0;
  let changedDocuments = 0;
  let scannedDocuments = 0;
  const pendingWrites = [];

  for (const ticketDoc of snap.docs) {
    const pathOptions = {
      isSafeStoragePath: path => isAttachmentPathInTicketScope(path, ticketDoc.id),
    };
    const ticketResult = buildAttachmentMigrationUpdates(
      ticketDoc.data(),
      `tickets/${ticketDoc.id}`,
      pathOptions
    );
    scannedDocuments += 1;
    mergeReports(report, ticketResult.report);
    const ticketDocPaths = [];
    ticketResult.storagePaths.forEach(path => {
      if (isAttachmentPathInTicketScope(path, ticketDoc.id)) {
        storagePaths.add(path);
        ticketDocPaths.push(path);
      } else {
        invalidStoragePaths += 1;
        if (invalidStoragePathSamples.length < 20) {
          invalidStoragePathSamples.push({ ticketId: ticketDoc.id, path });
        }
      }
    });
    if (ticketResult.changed) {
      changedDocuments += 1;
      pendingWrites.push({ ref: ticketDoc.ref, updates: ticketResult.updates, paths: ticketDocPaths });
    }

    const subcollectionSnaps = await Promise.all(
      SUBCOLLECTIONS.map(name => ticketDoc.ref.collection(name).get())
    );
    for (let index = 0; index < subcollectionSnaps.length; index += 1) {
      const collectionName = SUBCOLLECTIONS[index];
      for (const doc of subcollectionSnaps[index].docs) {
        const result = buildAttachmentMigrationUpdates(
          doc.data(),
          `tickets/${ticketDoc.id}/${collectionName}/${doc.id}`,
          pathOptions
        );
        scannedDocuments += 1;
        mergeReports(report, result.report);
        const subDocPaths = [];
        result.storagePaths.forEach(path => {
          if (isAttachmentPathInTicketScope(path, ticketDoc.id)) {
            storagePaths.add(path);
            subDocPaths.push(path);
          } else {
            invalidStoragePaths += 1;
            if (invalidStoragePathSamples.length < 20) {
              invalidStoragePathSamples.push({ ticketId: ticketDoc.id, path });
            }
          }
        });
        if (result.changed) {
          changedDocuments += 1;
          pendingWrites.push({ ref: doc.ref, updates: result.updates, paths: subDocPaths });
        }
      }
    }
  }

  // Inspeciona o Storage ANTES de escrever. A url legada é o ÚNICO acesso restante
  // quando o objeto do `path` não existe (path fantasma, arquivo apagado, migração
  // manual errada): apagá-la ali destruiria o anexo do ponto de vista do usuário,
  // de forma irreversível. Documento com qualquer path não verificado é pulado
  // inteiro — conservador de propósito, e reportado para tratamento manual.
  const storage = await inspectAndRevokeStorageTokens(bucket, [...storagePaths], dryRun);
  const writesToApply = pendingWrites.filter(
    item => !(item.paths || []).some(path => storage.unverifiedPaths.has(path))
  );
  const skippedUnverifiedDocuments = pendingWrites.length - writesToApply.length;

  if (!dryRun) {
    for (let start = 0; start < writesToApply.length; start += 400) {
      const batch = db.batch();
      for (const item of writesToApply.slice(start, start + 400)) {
        batch.update(item.ref, item.updates);
      }
      await batch.commit();
    }
  }

  const last = snap.docs.at(-1);
  const { unverifiedPaths: _unverifiedPaths, ...storageReport } = storage;
  return {
    dryRun,
    scannedTickets: snap.size,
    scannedDocuments,
    changedDocuments,
    // Docs que seriam alterados mas foram pulados porque o objeto no Storage não
    // pôde ser confirmado (ver storage.missingSamples / storage.failures).
    skippedUnverifiedDocuments,
    updatedDocuments: dryRun ? 0 : writesToApply.length,
    storagePaths: storagePaths.size,
    invalidStoragePaths,
    invalidStoragePathSamples,
    ...report,
    storage: storageReport,
    nextCursor: snap.size === limit && last ? last.id : null,
  };
}
