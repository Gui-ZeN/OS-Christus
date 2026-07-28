/**
 * Remocao de anexo: quais evidencias sao INTOCAVEIS e como tirar a referencia de
 * dentro de um documento.
 *
 * O DELETE antigo apagava o objeto do Storage e devolvia ok — quem tirava a
 * referencia era a TELA, depois, numa segunda chamada. Falhar no meio deixava
 * referencia apontando para arquivo inexistente (quebra a UI), e nao havia
 * nenhum bloqueio por status: dava para apagar o comprovante de um pagamento ja
 * quitado ou o contrato ja aprovado pela diretoria.
 *
 * Funcoes puras: da para testar a regra sem emulador.
 */

const ATTACHMENT_PATH_KEYS = new Set(['path', 'attachmentPath', 'signedFilePath']);

/**
 * Evidencia financeira que ja sustentou uma decisao nao pode ser apagada — e o
 * lastro do que foi aprovado/pago. Bloqueia por STATUS do documento que a
 * contem, nao pelo caminho: o mesmo tipo de anexo e removivel enquanto o
 * lancamento esta pendente e vira intocavel quando ele e quitado.
 */
export function findProtectedEvidenceReason(collection, document) {
  const status = String(document?.status || '').trim().toLowerCase();

  if (collection === 'payments') {
    if (status === 'paid') return 'Comprovante de lançamento já pago não pode ser excluído.';
    if (status === 'approved') return 'Lançamento já liberado para pagamento: o anexo não pode ser excluído.';
  }

  if (collection === 'measurements') {
    if (status === 'approved' || status === 'paid') {
      return 'Medição já aprovada: o relatório não pode ser excluído.';
    }
  }

  if (collection === 'quotes') {
    if (status === 'approved') return 'Cotação vencedora não pode ter anexos excluídos.';
    if (status === 'rejected') return 'Cotação já decidida não pode ter anexos excluídos.';
  }

  if (collection === 'contracts') {
    // O contrato assinado e a prova do que a diretoria aprovou. `approvedAt`
    // cobre o legado, que nem sempre gravou `status`.
    if (status === 'approved' || document?.approvedAt) {
      return 'Contrato aprovado pela diretoria não pode ter anexos excluídos.';
    }
  }

  return null;
}

/**
 * Devolve uma copia de `value` sem os anexos que casam com `locator`.
 * Espelha findAttachmentReference: mesma travessia recursiva, mesmas chaves de
 * caminho — se um formato e encontravel pela busca, tem que ser removivel aqui.
 */
export function removeAttachmentReference(value, locator, seen = new Set()) {
  if (!value || typeof value !== 'object') return { value, removed: false };
  if (seen.has(value)) return { value, removed: false };
  seen.add(value);

  if (Array.isArray(value)) {
    let removed = false;
    const next = [];
    for (const item of value) {
      if (matchesLocator(item, locator)) {
        removed = true;
        continue;
      }
      const child = removeAttachmentReference(item, locator, seen);
      if (child.removed) removed = true;
      next.push(child.value);
    }
    return { value: removed ? next : value, removed };
  }

  let removed = false;
  const next = { ...value };
  for (const [key, child] of Object.entries(value)) {
    if (!child || typeof child !== 'object') continue;
    if (matchesLocator(child, locator)) {
      // Anexo pendurado direto num campo (não dentro de lista).
      next[key] = null;
      removed = true;
      continue;
    }
    const result = removeAttachmentReference(child, locator, seen);
    if (result.removed) {
      next[key] = result.value;
      removed = true;
    }
  }
  return { value: removed ? next : value, removed };
}

/**
 * Contrato/anexo gravado como campos SOLTOS no documento (signedFilePath,
 * signedFileName, ...) em vez de item de lista. Limpa o grupo inteiro para não
 * sobrar nome de arquivo apontando para caminho nenhum.
 */
export function clearFlatAttachmentFields(document, locator, fieldGroups) {
  const next = { ...document };
  let removed = false;
  for (const group of fieldGroups) {
    if (String(document?.[group.pathField] || '').trim() !== locator.path) continue;
    for (const field of group.fields) next[field] = null;
    removed = true;
  }
  return { value: removed ? next : document, removed };
}

function matchesLocator(candidate, locator) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
  const matchesPath = [...ATTACHMENT_PATH_KEYS].some(
    key => String(candidate[key] || '').trim() === locator.path
  );
  if (!matchesPath) return false;
  const candidateDriveId = String(candidate.driveFileId || '').trim();
  return !locator.driveFileId || candidateDriveId === locator.driveFileId;
}
