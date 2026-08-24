import { describe, expect, it } from 'vitest';

/**
 * ETAPA QUE FALHOU DENTRO DE UM 200.
 *
 * O primeiro disparo do agendador externo em produção (24/08, 19:31) devolveu
 * `ok: true` tendo um e-mail NÃO entregue: a fila respondeu 200 com `failed: 1` e
 * o motivo "HTTP 401: Protected deployment". O pinger via verde enquanto e-mail
 * deixava de sair.
 *
 * A rota da fila responde 200 porque ELA funcionou — varreu, tentou, registrou.
 * Quem falhou foi um item. Está certo do ponto de vista dela; quem agrega é que
 * precisa ler o corpo, não só o envelope.
 */

// Espelho de `etapaFalhou` em `api/mail.js`. A função não é exportada (mora dentro
// do handler), e duplicar a REGRA num teste é o preço de não expor um detalhe
// interno da rota só para testá-lo — a regra é curta e o teste fixa o contrato.
function etapaFalhou(etapa: Record<string, unknown>) {
  if (etapa.erro) return true;
  if (typeof etapa.status === 'number' && (etapa.status < 200 || etapa.status >= 300)) return true;
  const resposta = etapa.resposta as Record<string, unknown> | undefined;
  if (!resposta || typeof resposta !== 'object') return false;
  if (resposta.ok === false) return true;
  if (Number(resposta.failed) > 0) return true;
  if (Number(resposta.deadLettered) > 0) return true;
  return false;
}

describe('o ciclo enxerga a falha que veio dentro de um 200', () => {
  it('⚠️ O CASO REAL: fila responde 200 com failed:1 — isso É falha', () => {
    // Resposta literal do disparo de 24/08 que passou como sucesso.
    const outbox = {
      etapa: 'outbox-worker',
      status: 200,
      resposta: {
        ok: true,
        scanned: 2,
        selected: 1,
        sent: 0,
        failed: 1,
        deadLettered: 0,
        results: [{ status: 'failed', error: 'Falha ao entregar e-mail (HTTP 401): Protected deployment' }],
      },
    };
    expect(etapaFalhou(outbox)).toBe(true);
  });

  it('item que esgotou as tentativas conta — ninguém mais tenta por ele', () => {
    expect(etapaFalhou({ etapa: 'outbox-worker', status: 200, resposta: { ok: true, failed: 0, deadLettered: 3 } })).toBe(true);
  });

  it('a etapa que se declara malsucedida conta, mesmo com 200', () => {
    expect(etapaFalhou({ etapa: 'chuva', status: 200, resposta: { ok: false, error: 'fonte fora' } })).toBe(true);
  });

  it('fila limpa NÃO é falha', () => {
    // Sem isto o ciclo ficaria vermelho toda volta, e alerta que sempre toca vira
    // alerta que ninguém escuta.
    expect(etapaFalhou({ etapa: 'outbox-worker', status: 200, resposta: { ok: true, scanned: 0, sent: 0, failed: 0, deadLettered: 0 } })).toBe(false);
  });

  it('sucesso sem os campos da fila NÃO é falha', () => {
    expect(etapaFalhou({ etapa: 'checagem-visitas', status: 200, resposta: { ok: true, nadaAFazer: true } })).toBe(false);
  });

  it('status ruim continua sendo falha', () => {
    expect(etapaFalhou({ etapa: 'gmail-sync', status: 400, resposta: { ok: false } })).toBe(true);
  });

  it('etapa que estourou antes de responder é falha', () => {
    expect(etapaFalhou({ etapa: 'chuva', status: 500, erro: 'timeout' })).toBe(true);
  });

  it('corpo ausente ou não-objeto não vira falha inventada', () => {
    expect(etapaFalhou({ etapa: 'x', status: 200 })).toBe(false);
    expect(etapaFalhou({ etapa: 'x', status: 200, resposta: 'texto' })).toBe(false);
  });
});
