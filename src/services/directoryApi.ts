import { getActorHeaders, getAuthenticatedActorHeaders } from './actorHeaders';
import { expectApiJson } from './apiClient';

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
  tags?: string[];
  active?: boolean;
}

interface UserMutationResponse {
  ok: boolean;
  authUid?: string | null;
}

export async function fetchDirectory() {
  const response = await fetch('/api/directory', {
    headers: await getAuthenticatedActorHeaders(),
  });
  const json = await expectApiJson<{
    ok: boolean;
    users?: DirectoryUser[];
    teams?: DirectoryTeam[];
    vendors?: DirectoryVendor[];
  }>(response, 'Falha ao buscar diretório.');
  if (!json.ok) {
    throw new Error('Resposta inválida do diretório.');
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
  const json = await expectApiJson<{ ok: boolean; users?: DirectoryUser[] }>(
    response,
    'Falha ao buscar usuários.'
  );
  if (!json.ok || !Array.isArray(json.users)) {
    throw new Error('Resposta inválida de usuários.');
  }
  return json.users as DirectoryUser[];
}

export async function createUser(
  user: DirectoryUser,
  password?: string
): Promise<UserMutationResponse> {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({ user, password }),
  });
  return expectApiJson<UserMutationResponse>(response, 'Falha ao criar usuário.');
}

export async function updateUser(
  id: string,
  updates: Partial<DirectoryUser>,
  password?: string
): Promise<UserMutationResponse> {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/users', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({ id, updates, password }),
  });
  return expectApiJson<UserMutationResponse>(response, 'Falha ao atualizar usuário.');
}

export async function deleteUser(id: string): Promise<{ ok: boolean }> {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/users', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({ id }),
  });
  return expectApiJson<{ ok: boolean }>(response, 'Falha ao excluir usuário.');
}

export async function upsertVendor(vendor: Partial<DirectoryVendor> & { name: string }) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/directory', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({ vendor }),
  });
  return expectApiJson<{ ok: boolean; vendor?: DirectoryVendor }>(response, 'Falha ao salvar terceiro.');
}
