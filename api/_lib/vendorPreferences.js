import { slugify } from './text.js';

function parseCurrency(value) {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getItemUnitPrice(item) {
  const explicit = parseCurrency(item?.unitPrice);
  if (explicit !== null) return explicit;

  const quantity = item?.quantity != null ? Number(item.quantity) : null;
  const total = parseCurrency(item?.totalPrice);
  if (quantity && quantity > 0 && total !== null) return total / quantity;
  return null;
}

function buildPreferenceEvents(ticketId, approvedQuote, classification) {
  const vendor = String(approvedQuote?.vendor || '').trim();
  if (!vendor) return [];

  const approvedValue = parseCurrency(approvedQuote?.totalValue || approvedQuote?.value);
  const serviceCatalogId = classification?.serviceCatalogId ? String(classification.serviceCatalogId).trim() : '';
  const serviceCatalogName = classification?.serviceCatalogName ? String(classification.serviceCatalogName).trim() : '';
  const macroServiceId = classification?.macroServiceId ? String(classification.macroServiceId).trim() : '';
  const macroServiceName = classification?.macroServiceName ? String(classification.macroServiceName).trim() : '';
  const vendorSlug = slugify(vendor) || 'fornecedor';
  const events = [];

  if (serviceCatalogId || macroServiceId) {
    const scopeType = serviceCatalogId ? 'service' : 'macroService';
    const scopeId = serviceCatalogId || macroServiceId;
    events.push({
      id: `${scopeType}__${scopeId}__${ticketId}`,
      ticketId,
      scopeType,
      scopeId,
      scopeName: serviceCatalogName || macroServiceName || scopeId,
      vendor,
      vendorSlug,
      serviceCatalogId: serviceCatalogId || null,
      serviceCatalogName: serviceCatalogName || null,
      macroServiceId: macroServiceId || null,
      macroServiceName: macroServiceName || null,
      materialId: null,
      materialName: null,
      unit: null,
      approvedValue,
      unitPrice: null,
      regionId: classification?.regionId || null,
      regionName: classification?.regionName || null,
      siteId: classification?.siteId || null,
      siteName: classification?.siteName || null,
      sector: classification?.sector || null,
    });
  }

  for (const item of Array.isArray(approvedQuote?.items) ? approvedQuote.items : []) {
    const materialKey = String(item?.materialId || item?.materialName || item?.description || '').trim();
    const normalizedMaterialKey = slugify(materialKey);
    if (!normalizedMaterialKey) continue;

    events.push({
      id: `material__${normalizedMaterialKey}__${ticketId}`,
      ticketId,
      scopeType: 'material',
      scopeId: normalizedMaterialKey,
      scopeName: String(item?.materialName || item?.description || materialKey).trim(),
      vendor,
      vendorSlug,
      serviceCatalogId: serviceCatalogId || null,
      serviceCatalogName: serviceCatalogName || null,
      macroServiceId: macroServiceId || null,
      macroServiceName: macroServiceName || null,
      materialId: item?.materialId ? String(item.materialId).trim() : null,
      materialName: item?.materialName ? String(item.materialName).trim() : String(item?.description || '').trim() || null,
      unit: item?.unit ? String(item.unit).trim() : null,
      approvedValue,
      unitPrice: getItemUnitPrice(item),
      regionId: classification?.regionId || null,
      regionName: classification?.regionName || null,
      siteId: classification?.siteId || null,
      siteName: classification?.siteName || null,
      sector: classification?.sector || null,
    });
  }

  return events;
}

export async function syncVendorPreferenceEvents(db, ticketId, approvedQuote, classification) {
  const events = buildPreferenceEvents(ticketId, approvedQuote, classification);
  const existingSnap = await db.collection('vendorPreferenceEvents').where('ticketId', '==', ticketId).get();
  const desiredIds = new Set(events.map(event => event.id));
  const now = new Date();
  const batch = db.batch();

  existingSnap.docs.forEach(doc => {
    if (!desiredIds.has(doc.id)) batch.delete(doc.ref);
  });
  events.forEach(event => {
    batch.set(db.collection('vendorPreferenceEvents').doc(event.id), {
      ...event,
      approvedAt: now,
      updatedAt: now,
    }, { merge: true });
  });
  await batch.commit();
}

