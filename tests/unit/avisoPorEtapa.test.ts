import { describe, expect, it } from 'vitest';
import { ORDEM_DAS_ETAPAS, etapaDe, statusCanonicoDaEtapa } from '../../api/_lib/etapas.js';
import { shouldNotifyRequesterForStatus } from '../../src/services/ticketEmail';
import { TICKET_STATUS } from '../../src/constants/ticketStatus';
import type { Ticket } from '../../src/types';

const os = { id: 'OS-1' } as Ticket;

/**
 * O que o SOLICITANTE recebe, etapa por etapa.
 *
 * Existe porque eu errei duas vezes lendo isso: `resolveStatusTrigger` só escolhe
 * o TEXTO, e quem decide se o e-mail sai é `shouldNotifyRequesterForStatus`. Ler
 * só o primeiro faz parecer que "Em orçamento" avisa — e ela não avisa.
 *
 * Com as seis etapas, este é o contrato inteiro numa tabela só.
 */
describe('o solicitante acompanha o CICLO, não os degraus internos', () => {
  const avisa = (etapa: string, anterior: string = TICKET_STATUS.NEW) =>
    shouldNotifyRequesterForStatus(os, statusCanonicoDaEtapa(etapa)!, anterior);

  it('avisa quando a análise começa, vindo de Nova OS', () => {
    expect(avisa('Em análise', TICKET_STATUS.NEW)).toBe(true);
  });

  it('NÃO avisa nas fases administrativas — é decisão, não esquecimento', () => {
    // Orçamento e contrato são degraus internos. O risco maior deste desenho é
    // sobrar aviso, não faltar: quem recebe e-mail de cada degrau para de ler.
    expect(avisa('Em orçamento')).toBe(false);
    expect(avisa('Contratação')).toBe(false);
  });

  it('avisa quando a execução começa, quando conclui e quando cancela', () => {
    expect(avisa('Em execução')).toBe(true);
    expect(avisa('Concluída')).toBe(true);
    expect(avisa('Cancelada')).toBe(true);
  });

  it('a análise NÃO reavisa se a OS já tinha passado dela', () => {
    // Vai e volta entre degraus internos não vira e-mail repetido.
    expect(avisa('Em análise', TICKET_STATUS.WAITING_BUDGET)).toBe(false);
  });

  it('toda etapa tem comportamento DECIDIDO — nenhuma cai no acaso', () => {
    // Se alguém acrescentar uma etapa e esquecer de decidir se ela avisa, este
    // teste não a cobre — mas a lista abaixo obriga a revisitá-lo.
    const esperado: Record<string, boolean> = {
      // Mover PARA "Nova OS" é reabrir (o fluxo faz isso a partir de Cancelada), e
      // quem pediu precisa saber que a OS voltou. A abertura em si tem e-mail próprio.
      'Nova OS': true,
      'Em análise': true,
      'Em orçamento': false,
      Contratação: false,
      'Em execução': true,
      Concluída: true,
      Cancelada: true,
    };
    expect(Object.keys(esperado).sort()).toEqual([...ORDEM_DAS_ETAPAS].sort());
    for (const [etapa, deveAvisar] of Object.entries(esperado)) {
      expect(avisa(etapa), etapa).toBe(deveAvisar);
    }
  });

  it('o canônico de cada etapa volta para ela — a tabela acima não mente', () => {
    for (const etapa of ORDEM_DAS_ETAPAS) {
      expect(etapaDe(statusCanonicoDaEtapa(etapa)!), etapa).toBe(etapa);
    }
  });
});
