import { defineConfig } from 'vitest/config';

/**
 * Config de vitest usado SÓ pelo Stryker (teste de mutação).
 *
 * Roda apenas os testes que cobrem os módulos mutados. Dois motivos:
 *
 * 1. VELOCIDADE. São 648 mutantes; cada um roda a suíte. Rodar 1143 testes por
 *    mutante é inviável, e nenhum teste de sede ou de chuva vai matar um mutante
 *    do `parseCurrency`.
 *
 * 2. Um teste da suíte (`ticketStorageCascade`) mocka `firebase-admin/storage` mas
 *    não `firebase-admin/app`, e quebra sob a instrumentação do Stryker — passa
 *    sozinho e passa na suíte inteira. Ele não cobre nenhum módulo mutado, então
 *    fica de fora daqui em vez de virar uma investigação sem retorno.
 *
 * ⚠️ Este recorte só pode PIORAR o placar, nunca melhorar: se um mutante fosse
 * morto por um teste que ficou de fora, ele aparece como sobrevivente. A medida é
 * conservadora de propósito.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: [
      // dinheiro
      'tests/unit/currencyUnificada.test.ts',
      'tests/unit/currency.test.ts',
      'tests/unit/inboxForms.test.ts',
      // autorização
      'tests/unit/procurementAccess.test.ts',
      'tests/unit/procurementReadAccess.test.ts',
      'tests/unit/ticketAccess.test.ts',
      'tests/unit/quemVeQualOs.test.ts',
      'tests/unit/commitmentScope.test.ts',
      'tests/unit/ticketPatchScope.test.ts',
      'tests/unit/ticketsHistory.test.ts',
      // quem recebe o quê — autorização sobre informação
      'tests/unit/destinatarios.test.ts',
      'tests/unit/quemRecebeOEmail.test.ts',
    ],
  },
});
