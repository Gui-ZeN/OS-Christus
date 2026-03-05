import { DEFAULT_TEAMS, DEFAULT_USERS, DEFAULT_VENDORS } from './directoryDefaults.js';

function byName(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
}

export async function seedDirectoryDefaults(db) {
  const batch = db.batch();
  const now = new Date();

  for (const user of DEFAULT_USERS) {
    batch.set(
      db.collection('users').doc(user.id),
      { ...user, createdAt: now, updatedAt: now },
      { merge: true }
    );
  }

  for (const team of DEFAULT_TEAMS) {
    batch.set(
      db.collection('teams').doc(team.id),
      { ...team, createdAt: now, updatedAt: now },
      { merge: true }
    );
  }

  for (const vendor of DEFAULT_VENDORS) {
    batch.set(
      db.collection('vendors').doc(vendor.id),
      { ...vendor, createdAt: now, updatedAt: now },
      { merge: true }
    );
  }

  await batch.commit();
}

export async function readDirectory(db) {
  const [usersSnap, teamsSnap, vendorsSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('teams').get(),
    db.collection('vendors').get(),
  ]);

  const users = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(byName);
  const teams = teamsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(byName);
  const vendors = vendorsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(byName);

  return { users, teams, vendors };
}
