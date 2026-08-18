import { getAuthenticatedActorHeaders } from './actorHeaders';
import type { Commitment, CommitmentOutcome, CommitmentState } from '../types';

/**
 * Compromissos — a promessa do terceiro de comparecer.
 *
 * A rota mora em `tickets.js?route=commitments`: o plano da Vercel está no teto de
 * funções, então rota nova não vira arquivo novo.
 */

/** O que chega da API: datas em ISO, mais o estado já resolvido pelo servidor. */
type ApiCommitment = Omit<Commitment, 'startAt' | 'endAt' | 'confirmedAt' | 'createdAt' | 'updatedAt'> & {
  startAt: string;
  endAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  effectiveState: CommitmentState;
};

export interface HydratedCommitment extends Commitment {
  /**
   * O estado que vale agora, calculado pelo SERVIDOR. Se cada tela derivasse por
   * conta própria, duas telas discordariam sobre a mesma visita.
   */
  effectiveState: CommitmentState;
}

const data = (value: string | null | undefined) => (value ? new Date(value) : null);

function hydrate(commitment: ApiCommitment): HydratedCommitment {
  return {
    ...commitment,
    startAt: new Date(commitment.startAt),
    endAt: data(commitment.endAt),
    confirmedAt: data(commitment.confirmedAt),
    createdAt: new Date(commitment.createdAt),
    updatedAt: data(commitment.updatedAt),
  };
}

async function pedir<T>(init: RequestInit): Promise<T> {
  const res = await fetch('/api/tickets?route=commitments', {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(await getAuthenticatedActorHeaders()) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || 'Falha ao falar com os compromissos.');
  }
  return json as T;
}

export async function fetchCommitments(): Promise<HydratedCommitment[]> {
  const json = await pedir<{ commitments: ApiCommitment[] }>({ method: 'GET' });
  return (json.commitments || []).map(hydrate);
}

export async function createCommitment(input: {
  ticketIds: string[];
  startAt: Date;
  vendorName?: string;
  sede?: string | null;
  siteId?: string | null;
}): Promise<HydratedCommitment> {
  const json = await pedir<{ commitment: ApiCommitment }>({
    method: 'POST',
    body: JSON.stringify({ ...input, startAt: input.startAt.toISOString() }),
  });
  return hydrate(json.commitment);
}

/**
 * Registra o que a sede respondeu.
 *
 * `outcome` é obrigatório quando o fornecedor compareceu — o servidor recusa sem ele,
 * de propósito: chegar não é resolver.
 */
export async function confirmCommitment(input: {
  id: string;
  state: CommitmentState;
  outcome?: CommitmentOutcome | null;
}): Promise<void> {
  await pedir({ method: 'PATCH', body: JSON.stringify(input) });
}

export async function cancelCommitment(id: string): Promise<void> {
  await pedir({ method: 'PATCH', body: JSON.stringify({ id, cancel: true }) });
}

/**
 * A TENTATIVA de cobrança — grava que alguém foi cobrar, e só isso.
 *
 * Ela NÃO conta como cobrança concluída. Quem conta é `registrarDesfechoDaCobranca`
 * abaixo: a auditoria mostrou que gravar a cobrança antes de cobrar inflava
 * justamente a métrica que existe para proteger quem cobrou.
 */
export async function registrarTentativaDeCobranca(id: string): Promise<void> {
  await pedir({ method: 'PATCH', body: JSON.stringify({ id, cobranca: { acao: 'tentativa' } }) });
}

/** O desfecho — respondeu · não respondeu · marcou nova data. É o que conta. */
export async function registrarDesfechoDaCobranca(id: string, desfecho: string): Promise<void> {
  await pedir({ method: 'PATCH', body: JSON.stringify({ id, cobranca: { acao: 'desfecho', desfecho } }) });
}
