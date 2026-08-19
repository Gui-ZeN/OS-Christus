import { getAuthenticatedActorHeaders } from './actorHeaders';

/**
 * Mensagens que entraram por e-mail e não casaram com OS nenhuma.
 *
 * Vinte e três sumiram em silêncio antes desta fila existir — todas `Re:` de
 * conversas reais, a mesma thread voltando semana após semana enquanto quem
 * escreveu achava que tinha avisado.
 */
export interface DroppedInboundItem {
  id: string;
  fromEmail: string | null;
  subject: string;
  text: string;
  attachmentCount: number;
  /** Anexos já guardados (mensagens novas). Vazio = entrou antes da fila guardar. */
  attachments?: Array<{ id: string; name: string; contentType?: string | null }>;
  receivedAt: string | null;
  createdAt: string | null;
}

async function pedir<T>(init: RequestInit): Promise<T> {
  const res = await fetch('/api/mail?route=dropped-inbound', {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(await getAuthenticatedActorHeaders()) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || 'Falha ao falar com a fila de mensagens.');
  }
  return json as T;
}

export async function fetchDroppedInbound(): Promise<DroppedInboundItem[]> {
  const json = await pedir<{ items: DroppedInboundItem[] }>({ method: 'GET' });
  return json.items || [];
}

/**
 * O que o servidor varreu junto com a mensagem escolhida.
 *
 * `irmasVinculadas` é quantas OUTRAS mensagens da mesma conversa foram para a mesma
 * OS. A tela precisa deste número: sem ele, a fila encolhe mais do que o clique
 * explica e parece defeito.
 */
export interface ResultadoDaFila {
  ticketId: string;
  irmasVinculadas: number;
}

/** Anexa a mensagem — e as irmãs da mesma conversa — ao histórico de uma OS. */
export async function linkDroppedInbound(id: string, ticketId: string): Promise<ResultadoDaFila> {
  const json = await pedir<{ ticketId: string; irmasVinculadas?: number }>({
    method: 'POST',
    body: JSON.stringify({ id, action: 'vincular', ticketId }),
  });
  return { ticketId: json.ticketId || ticketId, irmasVinculadas: Number(json.irmasVinculadas || 0) };
}

/**
 * Cria uma OS nova a partir da mensagem.
 *
 * Só a SEDE é pedida: era exatamente o que faltava para a mensagem virar OS sozinha.
 * O resto (número, token, anexos, cópia, detecção de água, e-mail de confirmação)
 * passa pelo mesmo caminho de sempre — segundo botão não é segundo fluxo.
 */
export async function createTicketFromDropped(id: string, sede: string): Promise<ResultadoDaFila> {
  const json = await pedir<{ ticketId: string; irmasVinculadas?: number }>({
    method: 'POST',
    body: JSON.stringify({ id, action: 'criar', sede }),
  });
  return { ticketId: json.ticketId, irmasVinculadas: Number(json.irmasVinculadas || 0) };
}

/**
 * Tira da fila sem anexar a nada.
 *
 * Existe porque nem toda mensagem perdida é trabalho: propaganda, resposta
 * automática, conversa que não era pedido. Sem esta saída, a fila encheria de coisa
 * que ninguém quer resolver e as pessoas parariam de olhar — que é exatamente o
 * problema que ela veio resolver.
 */
export async function dismissDroppedInbound(id: string): Promise<void> {
  await pedir({ method: 'POST', body: JSON.stringify({ id, action: 'descartar' }) });
}
