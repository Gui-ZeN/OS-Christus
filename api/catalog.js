import { requireAuthenticatedUser, requireOperationalManager, requireUserWithRoles , resolveActor } from './_lib/authz.js';
import { slugify, repairMojibake } from './_lib/text.js';
import { writeAuditLog } from './_lib/auditLogs.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { HttpError, readJsonBody, sendJson } from './_lib/http.js';
// A rota /api/settings vive AQUI (mesmo domínio: configuração do sistema). Limite
// de 12 Serverless Functions no plano Hobby; o vercel.json reescreve /api/settings
// -> /api/catalog?route=settings, então o front continua chamando /api/settings.
import { DEFAULT_SETTINGS } from './_lib/settingsDefaults.js';
import { firstEmail } from './_lib/email.js';
import {
  DEFAULT_MACRO_SERVICES,
  DEFAULT_MATERIALS,
  DEFAULT_REGIONS,
  DEFAULT_SERVICE_CATALOG,
  DEFAULT_SITES,
} from './_lib/catalogDefaults.js';

const ENTITY_COLLECTION_MAP = {
  regions: 'regions',
  sites: 'sites',
  macroServices: 'macroServices',
  serviceCatalog: 'serviceCatalog',
  materials: 'materials',
};
const GESTOR_MUTABLE_ENTITIES = new Set(['macroServices', 'serviceCatalog', 'materials']);

function assertCatalogMutationAllowed(user, entity) {
  if (user?.role !== 'Gestor') return;
  if (GESTOR_MUTABLE_ENTITIES.has(entity)) return;
  const error = new Error('Gestor pode alterar apenas macroservicos, servicos e materiais.');
  error.statusCode = 403;
  throw error;
}

/**
 * ⚠️ `incluirInativos` EXISTE PARA UMA TELA SÓ — a de Configurações.
 *
 * O catálogo esconde inativo de todo mundo, e é isso que faz desativar valer como
 * limpeza: o item some dos seletores e as OS antigas continuam legíveis pelo nome
 * que elas já guardam. Mas, escondido de TODOS, ele sumiria também da tela que
 * deveria reativá-lo — desativar viraria caminho de mão única.
 *
 * Quem pede os inativos é só quem administra o catálogo. O formulário público, a
 * triagem e os relatórios continuam vendo apenas o que está ativo.
 */
async function readCatalog(db, { incluirInativos = false } = {}) {
  const somenteAtivos = col => (incluirInativos ? db.collection(col).get() : db.collection(col).where('active', '==', true).get());
  const [regionsSnap, sitesSnap, macroServicesSnap, serviceCatalogSnap, materialsSnap, vendorPreferenceEventsSnap] = await Promise.all([
    somenteAtivos('regions'),
    somenteAtivos('sites'),
    somenteAtivos('macroServices'),
    somenteAtivos('serviceCatalog'),
    somenteAtivos('materials'),
    db.collection('vendorPreferenceEvents').get(),
  ]);

  const regions = regionsSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

  const sites = sitesSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

  const macroServices = macroServicesSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

  const serviceCatalog = serviceCatalogSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

  const materials = materialsSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 24);
  const vendorPreferenceMap = new Map();

  vendorPreferenceEventsSnap.docs.forEach(doc => {
    const data = { id: doc.id, ...doc.data() };
    const approvedAtRaw = data.approvedAt?.toDate ? data.approvedAt.toDate() : data.approvedAt ? new Date(data.approvedAt) : null;
    if (approvedAtRaw && !Number.isNaN(approvedAtRaw.getTime()) && approvedAtRaw < cutoff) {
      return;
    }

    const scopeType = String(data.scopeType || '').trim();
    const scopeId = String(data.scopeId || '').trim();
    const vendor = String(data.vendor || '').trim();
    if (!scopeType || !scopeId || !vendor) return;

    const key = `${scopeType}:${scopeId}:${vendor.toLowerCase()}`;
    const current = vendorPreferenceMap.get(key) || {
      id: key.replace(/[^a-z0-9:-]+/gi, '-'),
      scopeType,
      scopeId,
      scopeName: data.scopeName || scopeId,
      vendor,
      approvalCount: 0,
      totalApprovedValue: 0,
      approvedValueSamples: 0,
      totalUnitPrice: 0,
      unitPriceSamples: 0,
      lastApprovedAt: null,
      lastApprovedValue: null,
      lastTicketId: null,
      unit: data.unit || null,
      materialId: data.materialId || null,
      materialName: data.materialName || null,
      serviceCatalogId: data.serviceCatalogId || null,
      serviceCatalogName: data.serviceCatalogName || null,
      macroServiceId: data.macroServiceId || null,
      macroServiceName: data.macroServiceName || null,
    };

    current.approvalCount += 1;
    if (typeof data.approvedValue === 'number' && Number.isFinite(data.approvedValue)) {
      current.totalApprovedValue += data.approvedValue;
      current.approvedValueSamples += 1;
    }
    if (typeof data.unitPrice === 'number' && Number.isFinite(data.unitPrice)) {
      current.totalUnitPrice += data.unitPrice;
      current.unitPriceSamples += 1;
    }
    if (!current.lastApprovedAt || (approvedAtRaw && approvedAtRaw > current.lastApprovedAt)) {
      current.lastApprovedAt = approvedAtRaw;
      current.lastApprovedValue = typeof data.approvedValue === 'number' ? data.approvedValue : null;
      current.lastTicketId = data.ticketId || null;
    }

    vendorPreferenceMap.set(key, current);
  });

  const vendorPreferences = [...vendorPreferenceMap.values()]
    .map(item => ({
      id: item.id,
      scopeType: item.scopeType,
      scopeId: item.scopeId,
      scopeName: item.scopeName,
      vendor: item.vendor,
      approvalCount: item.approvalCount,
      averageApprovedValue:
        item.approvedValueSamples > 0 ? item.totalApprovedValue / item.approvedValueSamples : null,
      averageUnitPrice: item.unitPriceSamples > 0 ? item.totalUnitPrice / item.unitPriceSamples : null,
      lastApprovedAt: item.lastApprovedAt,
      lastApprovedValue: item.lastApprovedValue,
      lastTicketId: item.lastTicketId,
      unit: item.unit,
      materialId: item.materialId,
      materialName: item.materialName,
      serviceCatalogId: item.serviceCatalogId,
      serviceCatalogName: item.serviceCatalogName,
      macroServiceId: item.macroServiceId,
      macroServiceName: item.macroServiceName,
    }))
    .sort((a, b) => {
      if (b.approvalCount !== a.approvalCount) return b.approvalCount - a.approvalCount;
      return String(a.vendor).localeCompare(String(b.vendor), 'pt-BR');
    });

  return { regions, sites, macroServices, serviceCatalog, materials, vendorPreferences };
}

async function seedDefaults(db) {
  const batch = db.batch();
  const now = new Date();

  for (const region of DEFAULT_REGIONS) {
    const ref = db.collection('regions').doc(region.id);
    batch.set(ref, { ...region, updatedAt: now, createdAt: now }, { merge: true });
  }

  for (const site of DEFAULT_SITES) {
    const ref = db.collection('sites').doc(site.id);
    batch.set(ref, { ...site, updatedAt: now, createdAt: now }, { merge: true });
  }

  for (const macroService of DEFAULT_MACRO_SERVICES) {
    const ref = db.collection('macroServices').doc(macroService.id);
    batch.set(ref, { ...macroService, updatedAt: now, createdAt: now }, { merge: true });
  }

  for (const service of DEFAULT_SERVICE_CATALOG) {
    const ref = db.collection('serviceCatalog').doc(service.id);
    batch.set(ref, { ...service, updatedAt: now, createdAt: now }, { merge: true });
  }

  for (const material of DEFAULT_MATERIALS) {
    const ref = db.collection('materials').doc(material.id);
    batch.set(ref, { ...material, updatedAt: now, createdAt: now }, { merge: true });
  }

  await batch.commit();
}

function normalizeCatalogRecord(entity, record) {
  const name = String(record?.name || '').trim();
  const code = String(record?.code || '').trim();
  const id = String(record?.id || '').trim() || slugify(code || name);

  if (!name) {
    throw new Error('name e obrigatorio.');
  }
  if (!id) {
    throw new Error('Nao foi possivel gerar id para o registro.');
  }

  const base = {
    id,
    code,
    name,
    active: record?.active !== false,
  };

  if (entity === 'macroServices') {
    return base;
  }

  if (entity === 'materials') {
    return {
      ...base,
      unit: String(record?.unit || '').trim() || null,
    };
  }

  if (entity === 'serviceCatalog') {
    const macroServiceId = String(record?.macroServiceId || '').trim();
    if (!macroServiceId) {
      throw new Error('macroServiceId e obrigatorio para serviceCatalog.');
    }
    return {
      ...base,
      macroServiceId,
      suggestedMaterialIds: Array.isArray(record?.suggestedMaterialIds)
        ? record.suggestedMaterialIds.map(value => String(value || '').trim()).filter(Boolean)
        : [],
    };
  }

  if (entity === 'regions') {
    return {
      ...base,
      group: String(record?.group || '').trim() || 'operacao',
    };
  }

  if (entity === 'sites') {
    const regionId = String(record?.regionId || '').trim();
    if (!regionId) {
      throw new Error('regionId e obrigatorio para sites.');
    }
    return {
      ...base,
      regionId,
      // Apelidos que o pessoal escreve no [SEDE] do e-mail e que não são o código
      // (ex.: CESIU/CVU numa sede de código ALD). O matcher do inbound (siteMatch)
      // casa por eles — assim apelido novo não exige deploy.
      aliases: Array.isArray(record?.aliases)
        ? [...new Set(record.aliases.map(value => String(value || '').trim()).filter(Boolean))]
        : [],
    };
  }

  throw new HttpError(400, 'Tipo de item do catálogo inválido.');
}

/**
 * O ID DE UM ITEM NOVO — e por que ele pode sair com sufixo.
 *
 * ⚠️ O DEFEITO QUE ISTO CONSERTA: criar item NUNCA criava se o id já existisse.
 *
 * O id vem de `slugify(code || name)`, que tira acento, caixa e pontuação — então
 * "Alvenaria", "alvenaria" e "ALVENARIA!" são o MESMO documento. E a gravação era um
 * `set(merge: true)` direto nesse id, sem olhar se já havia alguém lá. Resultado: a
 * pessoa criava um serviço e, em vez de nascer um item novo, o item antigo era
 * RENOMEADO calado. A lista não crescia — "não salvou" — e a auditoria registrava a
 * escrita normalmente, porque do ponto de vista do servidor ela aconteceu.
 *
 * Decisão do dono (14/09): **criar assim mesmo, com id novo**, em vez de recusar por
 * conflito. Quem está classificando uma OS não pode ser barrado no meio do caminho; o
 * catálogo é dele para arrumar depois. O nome sai exatamente como foi digitado — o
 * sufixo é só do id, que ninguém lê.
 *
 * ⚠️ O ID EXPLÍCITO CONTINUA SOBRESCREVENDO, e é isso que mantém "Editar"
 * funcionando: a tela de Configurações carrega o item no formulário COM o `id`
 * (`SettingsView`, botão Editar), e o botão de desativar manda `{ ...item, active }`.
 * Nesses dois casos a pessoa está apontando para um documento existente de propósito.
 * Sem essa distinção, editar um serviço viraria duplicá-lo.
 */
const MAX_TENTATIVAS_DE_ID = 50;

export async function idLivre(db, collection, idBase) {
  let candidato = idBase;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_DE_ID; tentativa += 1) {
    const existente = await db.collection(collection).doc(candidato).get();
    if (!existente.exists) return candidato;
    candidato = `${idBase}-${tentativa + 1}`;
  }
  // Teto para não varrer a coleção inteira num nome repetido por engano em massa.
  throw new HttpError(409, `Já existem ${MAX_TENTATIVAS_DE_ID} itens com esse nome. Use um nome diferente.`);
}

export async function upsertCatalogEntry(db, entity, record) {
  const collection = ENTITY_COLLECTION_MAP[entity];
  if (!collection) {
    throw new HttpError(400, 'Tipo de item do catálogo inválido.');
  }

  const normalized = normalizeCatalogRecord(entity, record);
  const apontaParaDocumento = Boolean(String(record?.id || '').trim());
  const id = apontaParaDocumento ? normalized.id : await idLivre(db, collection, normalized.id);
  const gravado = { ...normalized, id };

  const ref = db.collection(collection).doc(id);
  const snapshot = await ref.get();
  const now = new Date();

  await ref.set(
    {
      ...gravado,
      updatedAt: now,
      createdAt: snapshot.exists ? snapshot.data()?.createdAt || now : now,
    },
    { merge: true }
  );

  return {
    before: snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null,
    after: gravado,
  };
}

async function assertCatalogEntryCanDelete(db, entity, id) {
  if (entity === 'regions') {
    const [sitesSnap, usersSnap, ticketsSnap] = await Promise.all([
      db.collection('sites').where('regionId', '==', id).limit(1).get(),
      db.collection('users').where('regionIds', 'array-contains', id).limit(1).get(),
      db.collection('tickets').where('regionId', '==', id).limit(1).get(),
    ]);

    if (!sitesSnap.empty) throw new HttpError(409, 'Não dá para excluir a região enquanto existirem sedes vinculadas a ela.');
    if (!usersSnap.empty) throw new HttpError(409, 'Não dá para excluir a região enquanto houver usuários vinculados a ela.');
    if (!ticketsSnap.empty) throw new HttpError(409, 'Não dá para excluir a região: já existem OS vinculadas a ela.');
    return;
  }

  if (entity === 'sites') {
    const [usersSnap, ticketsSnap] = await Promise.all([
      db.collection('users').where('siteIds', 'array-contains', id).limit(1).get(),
      db.collection('tickets').where('siteId', '==', id).limit(1).get(),
    ]);

    if (!usersSnap.empty) throw new HttpError(409, 'Não dá para excluir a sede enquanto houver usuários vinculados a ela.');
    if (!ticketsSnap.empty) throw new HttpError(409, 'Não dá para excluir a sede: já existem OS vinculadas a ela.');
    return;
  }

  if (entity === 'macroServices') {
    const [servicesSnap, ticketsSnap, vendorScopeSnap] = await Promise.all([
      db.collection('serviceCatalog').where('macroServiceId', '==', id).limit(1).get(),
      db.collection('tickets').where('macroServiceId', '==', id).limit(1).get(),
      db.collection('vendorPreferenceEvents').where('scopeId', '==', id).limit(25).get(),
    ]);

    if (!servicesSnap.empty) throw new HttpError(409, 'Não dá para excluir o macroserviço enquanto houver serviços vinculados a ele. Exclua ou mova os serviços primeiro.');
    if (!ticketsSnap.empty) throw new HttpError(409, 'Não dá para excluir o macroserviço: já existem OS classificadas nele.');
    if (
      vendorScopeSnap.docs.some(doc => {
        const scopeType = String(doc.data()?.scopeType || '').trim();
        return scopeType === 'macroService';
      })
    ) {
      throw new HttpError(409, 'Não dá para excluir o macroserviço: ele já tem histórico de fornecedores.');
    }
    return;
  }

  if (entity === 'serviceCatalog') {
    const [ticketsSnap, vendorServiceSnap, vendorScopeSnap] = await Promise.all([
      db.collection('tickets').where('serviceCatalogId', '==', id).limit(1).get(),
      db.collection('vendorPreferenceEvents').where('serviceCatalogId', '==', id).limit(1).get(),
      db.collection('vendorPreferenceEvents').where('scopeId', '==', id).limit(25).get(),
    ]);

    if (!ticketsSnap.empty) throw new HttpError(409, 'Não dá para excluir o serviço: já existem OS classificadas nele.');
    if (!vendorServiceSnap.empty) throw new HttpError(409, 'Não dá para excluir o serviço: ele já tem histórico de fornecedores.');
    if (
      vendorScopeSnap.docs.some(doc => {
        const scopeType = String(doc.data()?.scopeType || '').trim();
        return scopeType === 'service';
      })
    ) {
      throw new HttpError(409, 'Não dá para excluir o serviço: ele já tem histórico de fornecedores.');
    }
    return;
  }

  if (entity === 'materials') {
    const [serviceSnap, vendorMaterialSnap, vendorScopeSnap] = await Promise.all([
      db.collection('serviceCatalog').where('suggestedMaterialIds', 'array-contains', id).limit(1).get(),
      db.collection('vendorPreferenceEvents').where('materialId', '==', id).limit(1).get(),
      db.collection('vendorPreferenceEvents').where('scopeId', '==', id).limit(25).get(),
    ]);

    if (!serviceSnap.empty) throw new HttpError(409, 'Não dá para excluir o material enquanto ele estiver sugerido em algum serviço.');
    if (!vendorMaterialSnap.empty) throw new HttpError(409, 'Não dá para excluir o material: ele já tem histórico de fornecedores.');
    if (
      vendorScopeSnap.docs.some(doc => {
        const scopeType = String(doc.data()?.scopeType || '').trim();
        return scopeType === 'material';
      })
    ) {
      throw new HttpError(409, 'Não dá para excluir o material: ele já tem histórico de fornecedores.');
    }
  }
}
async function deleteCatalogEntry(db, entity, id) {
  const collection = ENTITY_COLLECTION_MAP[entity];
  if (!collection) {
    throw new HttpError(400, 'Tipo de item do catálogo inválido.');
  }

  const ref = db.collection(collection).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new HttpError(404, 'Este item do catálogo não existe mais. Atualize a tela.');
  }

  await assertCatalogEntryCanDelete(db, entity, id);
  const before = { id: snapshot.id, ...snapshot.data() };
  await ref.delete();
  return before;
}

const FIXED_TICKET_EMAIL_SUBJECT = '{{ticket.id}} - {{ticket.subject}}';
function normalizeEmailTemplate(data, fallback = null) {
  const source = data && typeof data === 'object' ? data : {};
  const fallbackTemplate = fallback && typeof fallback === 'object' ? fallback : {};
  const trigger = String(source.trigger || fallbackTemplate.trigger || '').trim();

  return {
    trigger,
    subject: trigger.startsWith('EMAIL-')
      ? FIXED_TICKET_EMAIL_SUBJECT
      : repairMojibake(String(source.subject || fallbackTemplate.subject || '').trim()),
    body: repairMojibake(String(source.body || fallbackTemplate.body || '').trim()),
    recipients: repairMojibake(String(source.recipients || fallbackTemplate.recipients || '').trim()),
  };
}

function normalizeEmailTemplates(values) {
  const defaults = Object.values(DEFAULT_SETTINGS.emailTemplates.items).map(template => normalizeEmailTemplate(template));
  const byTrigger = new Map(defaults.map(template => [template.trigger, template]));

  for (const value of Array.isArray(values) ? values : []) {
    const trigger = String(value?.trigger || '').trim();
    if (!trigger) continue;
    byTrigger.set(trigger, normalizeEmailTemplate(value, byTrigger.get(trigger)));
  }

  return [...byTrigger.values()].sort((a, b) => a.trigger.localeCompare(b.trigger, 'pt-BR'));
}

function normalizeSla(data) {
  const allowedPriorities = ['Urgente', 'Alta', 'Trivial'];

  if (Array.isArray(data?.rules)) {
    const normalizedRules = data.rules
      .map(rule => ({
        priority: String(rule?.priority || '').trim(),
        prazo: String(rule?.prazo || '').trim(),
      }))
      .filter(rule => allowedPriorities.includes(rule.priority));

    if (normalizedRules.length > 0) {
      const byPriority = new Map(normalizedRules.map(rule => [rule.priority, rule]));
      return {
        ...data,
        rules: allowedPriorities.map(priority => byPriority.get(priority) || { priority, prazo: 'Sem medição de tempo' }),
      };
    }

    return {
      ...data,
      rules: allowedPriorities.map(priority => ({ priority, prazo: 'Sem medição de tempo' })),
    };
  }

  if (data && typeof data === 'object') {
    return {
      rules: [
        { priority: 'Urgente', prazo: 'Sem medição de tempo' },
        { priority: 'Alta', prazo: 'Sem medição de tempo' },
        { priority: 'Trivial', prazo: 'Sem medição de tempo' },
      ],
    };
  }

  return DEFAULT_SETTINGS.sla.default;
}

async function ensureDefaults(db) {
  const batch = db.batch();
  const now = new Date();

  for (const value of Object.values(DEFAULT_SETTINGS.emailTemplates.items)) {
    batch.set(
      db.collection('settings').doc('emailTemplates').collection('items').doc(value.trigger),
      { ...value, updatedAt: now, createdAt: now },
      { merge: true }
    );
  }

  batch.set(
    db.collection('settings').doc('dailyDigest').collection('items').doc('default'),
    { ...DEFAULT_SETTINGS.dailyDigest.default, updatedAt: now, createdAt: now },
    { merge: true }
  );
  batch.set(
    db.collection('settings').doc('sla').collection('items').doc('default'),
    { ...DEFAULT_SETTINGS.sla.default, updatedAt: now, createdAt: now },
    { merge: true }
  );
  batch.set(
    db.collection('settings').doc('thirdPartyTags').collection('items').doc('default'),
    { ...DEFAULT_SETTINGS.thirdPartyTags.default, updatedAt: now, createdAt: now },
    { merge: true }
  );
  batch.set(
    db.collection('settings').doc('authorizers').collection('items').doc('default'),
    { ...DEFAULT_SETTINGS.authorizers.default, updatedAt: now, createdAt: now },
    { merge: true }
  );

  await batch.commit();
}

async function readSettings(db) {
  const [templatesSnap, digestSnap, slaSnap, thirdPartyTagsSnap, authorizersSnap] = await Promise.all([
    db.collection('settings').doc('emailTemplates').collection('items').get(),
    db.collection('settings').doc('dailyDigest').collection('items').doc('default').get(),
    db.collection('settings').doc('sla').collection('items').doc('default').get(),
    db.collection('settings').doc('thirdPartyTags').collection('items').doc('default').get(),
    db.collection('settings').doc('authorizers').collection('items').doc('default').get(),
  ]);

  const emailTemplates = normalizeEmailTemplates(
    templatesSnap.docs
      .map(doc => doc.data())
      .filter(Boolean)
  );

  return {
    emailTemplate: emailTemplates[0] || null,
    emailTemplates,
    dailyDigest: digestSnap.exists ? digestSnap.data() : null,
    sla: slaSnap.exists ? normalizeSla(slaSnap.data()) : null,
    thirdPartyTags: thirdPartyTagsSnap.exists ? thirdPartyTagsSnap.data() : null,
    authorizers: authorizersSnap.exists ? authorizersSnap.data() : null,
  };
}

async function handleSettings(req, res) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      const user = await requireUserWithRoles(req, ['Admin', 'Gestor']);
      let settings = await readSettings(db);
      if (!settings.emailTemplates?.length || !settings.sla) {
        await ensureDefaults(db);
        settings = await readSettings(db);
      }
      if (user.role === 'Gestor') {
        return sendJson(res, 200, {
          ok: true,
          emailTemplates: [],
          dailyDigest: null,
          sla: null,
          thirdPartyTags: settings.thirdPartyTags,
          authorizers: settings.authorizers,
        });
      }
      return sendJson(res, 200, { ok: true, ...settings });
    }

    if (req.method === 'POST') {
      const admin = await requireUserWithRoles(req, ['Admin', 'Gestor']);
      const actor = resolveActor(admin);
      const body = await readJsonBody(req);
      const section = String(body?.section || '').trim();
      const data = body?.data;

      if (!section || !data) {
        return sendJson(res, 400, { ok: false, error: 'section e data são obrigatórios.' });
      }

      if (!['emailTemplates', 'dailyDigest', 'sla', 'thirdPartyTags', 'authorizers'].includes(section)) {
        return sendJson(res, 400, { ok: false, error: 'section inválida.' });
      }
      // O Gestor cadastra tags de terceiros E quem pode autorizar por e-mail: e ele
      // quem conversa com a diretoria e sabe de quem e a palavra que vale.
      if (admin.role === 'Gestor' && section !== 'thirdPartyTags' && section !== 'authorizers') {
        return sendJson(res, 403, { ok: false, error: 'Gestor pode alterar apenas tags de terceiros e autorizadores.' });
      }

      const normalizedData =
        section === 'sla'
          ? normalizeSla(data)
          : section === 'emailTemplates'
            ? normalizeEmailTemplate(data)
            : section === 'thirdPartyTags'
              ? {
                  tags: Array.from(
                    new Set(
                      (Array.isArray(data?.tags) ? data.tags : [])
                        .map(item => String(item || '').trim())
                        .filter(Boolean)
                    )
                  ),
                }
              : section === 'authorizers'
                ? {
                    // Só endereço válido entra, em minúsculas e sem repetir: a lista é
                    // comparada com o remetente do e-mail, então "Fulano <a@b.com>" ou
                    // caixa diferente viraria autorizador que nunca casa.
                    emails: Array.from(
                      new Set(
                        (Array.isArray(data?.emails) ? data.emails : [])
                          .map(item => firstEmail(item))
                          .filter(Boolean)
                      )
                    ),
                  }
            : data;
      const docId = section === 'emailTemplates' ? String(normalizedData?.trigger || '').trim() : 'default';

      if (section === 'emailTemplates' && !docId) {
        return sendJson(res, 400, { ok: false, error: 'trigger é obrigatório para templates.' });
      }

      const docRef = db.collection('settings').doc(section).collection('items').doc(docId);
      const beforeSnap = await docRef.get();
      const before = beforeSnap.exists ? beforeSnap.data() : null;

      await docRef.set({ ...normalizedData, updatedAt: new Date() }, { merge: true });

      await writeAuditLog({
        actor,
        action: 'settings.update',
        entity: 'settings',
        entityId: section === 'emailTemplates' ? docId : section,
        before,
        after: normalizedData,
      });

      return sendJson(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    return sendJson(res, statusCode, { ok: false, error: error.message || 'Falha em settings.' });
  }
}

export default async function handler(req, res) {
  const route = String(req.query?.route || '').trim().toLowerCase();
  if (route === 'settings') return handleSettings(req, res);

  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      // Auth opcional: o formulário público consome o catálogo sem login.
      let user = null;
      if (String(req.headers.authorization || '').trim()) {
        try {
          user = await requireAuthenticatedUser(req);
        } catch {
          user = null;
        }
      }

      // Só quem administra o catálogo enxerga o que está desativado — e só se pedir.
      const incluirInativos = String(req.query?.incluirInativos || '') === '1'
        && Boolean(user) && ['Admin', 'Gestor'].includes(String(user.role || ''));
      let catalog = await readCatalog(db, { incluirInativos });
      const isEmpty =
        catalog.regions.length === 0 ||
        catalog.sites.length === 0 ||
        catalog.macroServices.length === 0 ||
        catalog.serviceCatalog.length === 0 ||
        catalog.materials.length === 0;
      // Seed só por usuário autenticado: anônimo não dispara escrita no catálogo.
      if (isEmpty && user) {
        await seedDefaults(db);
        catalog = await readCatalog(db, { incluirInativos });
      }

      if (!user) {
        // Anônimo: apenas o necessário para os dropdowns do formulário público.
        return sendJson(res, 200, {
          ok: true,
          regions: catalog.regions,
          sites: catalog.sites,
          macroServices: catalog.macroServices,
          serviceCatalog: catalog.serviceCatalog,
          materials: [],
          vendorPreferences: [],
        });
      }

      return sendJson(res, 200, { ok: true, ...catalog });
    }

    if (req.method === 'POST') {
      const adminUser = await requireOperationalManager(req);
      const actor = resolveActor(adminUser, 'admin');
      const body = await readJsonBody(req);

      if (body?.seedDefaults === true) {
        if (adminUser.role === 'Gestor') {
          return sendJson(res, 403, { ok: false, error: 'Gestor nao pode recriar o catalogo padrao.' });
        }
        await seedDefaults(db);
        await writeAuditLog({
          actor,
          action: 'catalog.seedDefaults',
          entity: 'catalog',
          entityId: 'defaults',
          after: { seeded: true },
        });
        const catalog = await readCatalog(db);
        return sendJson(res, 200, { ok: true, seeded: true, ...catalog });
      }

      const entity = String(body?.entity || '').trim();
      assertCatalogMutationAllowed(adminUser, entity);
      const { before, after } = await upsertCatalogEntry(db, entity, body?.record || {});
      await writeAuditLog({
        actor,
        action: 'catalog.upsert',
        entity: entity || 'catalog',
        entityId: after.id,
        before,
        after,
      });
      const catalog = await readCatalog(db);
      return sendJson(res, 200, { ok: true, entity, record: after, ...catalog });
    }

    if (req.method === 'DELETE') {
      const adminUser = await requireOperationalManager(req);
      const actor = resolveActor(adminUser, 'admin');
      const body = await readJsonBody(req);
      const entity = String(body?.entity || '').trim();
      const id = String(body?.id || '').trim();
      if (!entity || !id) {
        return sendJson(res, 400, { ok: false, error: 'entity e id sao obrigatorios.' });
      }
      assertCatalogMutationAllowed(adminUser, entity);

      const before = await deleteCatalogEntry(db, entity, id);
      await writeAuditLog({
        actor,
        action: 'catalog.delete',
        entity,
        entityId: id,
        before,
        after: null,
      });
      const catalog = await readCatalog(db);
      return sendJson(res, 200, { ok: true, entity, id, ...catalog });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Falha no catalogo.' });
  }
}

