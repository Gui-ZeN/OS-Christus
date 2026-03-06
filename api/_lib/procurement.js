import { DEFAULT_CONTRACTS, DEFAULT_MEASUREMENTS, DEFAULT_PAYMENTS, DEFAULT_QUOTES } from './procurementDefaults.js';

function toList(group) {
  return Object.entries(group).map(([ticketId, payload]) => ({ ticketId, payload }));
}

function toArray(payload) {
  return Array.isArray(payload) ? payload : payload ? [payload] : [];
}

export async function seedProcurementDefaults(db) {
  const batch = db.batch();
  const now = new Date();

  for (const { ticketId, payload } of toList(DEFAULT_QUOTES)) {
    for (const quote of payload) {
      batch.set(
        db.collection('tickets').doc(ticketId).collection('quotes').doc(quote.id),
        { ...quote, ticketId, createdAt: now, updatedAt: now },
        { merge: true }
      );
    }
  }

  for (const { ticketId, payload } of toList(DEFAULT_CONTRACTS)) {
    batch.set(
      db.collection('tickets').doc(ticketId).collection('contracts').doc(payload.id),
      { ...payload, ticketId, createdAt: now, updatedAt: now },
      { merge: true }
    );
  }

  for (const { ticketId, payload } of toList(DEFAULT_PAYMENTS)) {
    for (const payment of toArray(payload)) {
      batch.set(
        db.collection('tickets').doc(ticketId).collection('payments').doc(payment.id),
        { ...payment, ticketId, createdAt: now, updatedAt: now },
        { merge: true }
      );
    }
  }

  for (const { ticketId, payload } of toList(DEFAULT_MEASUREMENTS)) {
    for (const measurement of toArray(payload)) {
      batch.set(
        db.collection('tickets').doc(ticketId).collection('measurements').doc(measurement.id),
        { ...measurement, ticketId, createdAt: now, updatedAt: now },
        { merge: true }
      );
    }
  }

  await batch.commit();
}

export async function readProcurement(db) {
  const [quotesSnap, contractsSnap, paymentsSnap, measurementsSnap] = await Promise.all([
    db.collectionGroup('quotes').get(),
    db.collectionGroup('contracts').get(),
    db.collectionGroup('payments').get(),
    db.collectionGroup('measurements').get(),
  ]);

  const quotesByTicket = {};
  for (const doc of quotesSnap.docs) {
    const data = { id: doc.id, ...doc.data() };
    const ticketId = data.ticketId;
    if (!ticketId) continue;
    if (!quotesByTicket[ticketId]) quotesByTicket[ticketId] = [];
    quotesByTicket[ticketId].push(data);
  }

  const contractsByTicket = {};
  for (const doc of contractsSnap.docs) {
    const data = { id: doc.id, ...doc.data() };
    const ticketId = data.ticketId;
    if (!ticketId) continue;
    contractsByTicket[ticketId] = data;
  }

  const paymentsByTicket = {};
  for (const doc of paymentsSnap.docs) {
    const data = { id: doc.id, ...doc.data() };
    const ticketId = data.ticketId;
    if (!ticketId) continue;
    if (!paymentsByTicket[ticketId]) paymentsByTicket[ticketId] = [];
    paymentsByTicket[ticketId].push(data);
  }

  for (const ticketId of Object.keys(paymentsByTicket)) {
    paymentsByTicket[ticketId].sort((a, b) => {
      const aOrder = Number(a.installmentNumber || 0);
      const bOrder = Number(b.installmentNumber || 0);
      return aOrder - bOrder;
    });
  }

  const measurementsByTicket = {};
  for (const doc of measurementsSnap.docs) {
    const data = { id: doc.id, ...doc.data() };
    const ticketId = data.ticketId;
    if (!ticketId) continue;
    if (!measurementsByTicket[ticketId]) measurementsByTicket[ticketId] = [];
    measurementsByTicket[ticketId].push(data);
  }

  for (const ticketId of Object.keys(measurementsByTicket)) {
    measurementsByTicket[ticketId].sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }

  return { quotesByTicket, contractsByTicket, paymentsByTicket, measurementsByTicket };
}
