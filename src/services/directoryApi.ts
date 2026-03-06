import { getActorHeaders, getAuthenticatedActorHeaders } from './actorHeaders';

export interface DirectoryUser {
  id: string;
  name: string;
  role: string;
  email: string;
  status: 'Ativo' | 'Inativo';
  regionIds?: string[];
  siteIds?: string[];
  authUid?: string | null;
  active?: boolean;
}

export interface DirectoryTeam {
  id: string;
  name: string;
  type: 'internal' | 'external';
  active?: boolean;
}

export interface DirectoryVendor {
  id: string;
  name: string;
  email?: string;
  active?: boolean;
}

export async function fetchDirectory() {
  const response = await fetch('/api/directory', {
    headers: await getAuthenticatedActorHeaders(),
  });
  if (!response.ok) {
    throw new Error('Falha ao buscar diretorio.');
  }
  const json = await response.json();
  if (!json.ok) {
    throw new Error('Resposta invalida do diretorio.');
  }
  return {
    users: (json.users || []) as DirectoryUser[],
    teams: (json.teams || []) as DirectoryTeam[],
    vendors: (json.vendors || []) as DirectoryVendor[],
  };
}

export async function fetchUsers() {
  const response = await fetch('/api/users', {
    headers: await getAuthenticatedActorHeaders(),
  });
  if (!response.ok) {
    throw new Error('Falha ao buscar usuarios.');
  }
  const json = await response.json();
  if (!json.ok || !Array.isArray(json.users)) {
    throw new Error('Resposta invalida de usuarios.');
  }
  return json.users as DirectoryUser[];
}

export async function createUser(user: DirectoryUser, password?: string) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({ user, password }),
  });
  if (!response.ok) {
    throw new Error('Falha ao criar usuario.');
  }
  return response.json();
}

export async function updateUser(id: string, updates: Partial<DirectoryUser>, password?: string) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/users', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({ id, updates, password }),
  });
  if (!response.ok) {
    throw new Error('Falha ao atualizar usuario.');
  }
  return response.json();
}
