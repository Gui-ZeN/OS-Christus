import { describe, expect, it } from 'vitest';
import { isPendingUpdateStillProtecting, type PendingUpdate } from '../../src/utils/pendingTicketUpdates';

const T = 1_000_000;
const entrada = (over: Partial<PendingUpdate<string>> = {}): PendingUpdate<string> => ({
  ticket: 'OS-0184 · Em andamento',
  expiresAt: T + 30_000,
  confirmedAt: null,
  ...over,
});

describe('isPendingUpdateStillProtecting', () => {
  it('🐛 poll que COMEÇOU antes da gravação não pode derrubar a versão nova', () => {
    // O bug relatado: "mudei a etapa, ela voltou, tive que atualizar a página".
    // Sequência: poll sai (lê etapa antiga) → PATCH grava → PATCH volta → a
    // resposta atrasada do poll chega. Ela é mais VELHA que a escrita.
    const pollStartedAt = T;
    const confirmedAt = T + 500; // gravou depois que o poll saiu
    expect(isPendingUpdateStillProtecting(entrada({ confirmedAt }), pollStartedAt, T + 800)).toBe(true);
  });

  it('poll que começou DEPOIS da gravação já traz o dado novo — solta', () => {
    const confirmedAt = T + 500;
    const pollStartedAt = T + 2_000;
    expect(isPendingUpdateStillProtecting(entrada({ confirmedAt }), pollStartedAt, T + 2_100)).toBe(false);
  });

  it('PATCH ainda em voo mantém a proteção — o servidor nem sabe da mudança', () => {
    expect(isPendingUpdateStillProtecting(entrada({ confirmedAt: null }), T + 5_000, T + 5_000)).toBe(true);
  });

  it('a expiração vence tudo: nenhuma proteção vive para sempre', () => {
    // Rede de segurança contra PATCH que nunca resolve — sem ela, um item ficaria
    // congelado na versão otimista e mudanças de OUTRA pessoa não apareceriam.
    const vencida = entrada({ confirmedAt: null, expiresAt: T + 30_000 });
    expect(isPendingUpdateStillProtecting(vencida, T, T + 30_001)).toBe(false);
  });

  it('sem entrada não há o que proteger', () => {
    expect(isPendingUpdateStillProtecting(undefined, T, T)).toBe(false);
  });

  it('borda: confirmada no MESMO instante em que o poll saiu — mantém', () => {
    // Empate favorece a versão local: com o mesmo carimbo não dá para saber se a
    // leitura pegou a escrita, e mostrar dado velho é pior que segurar por um ciclo.
    expect(isPendingUpdateStillProtecting(entrada({ confirmedAt: T }), T, T + 10)).toBe(true);
  });
});
