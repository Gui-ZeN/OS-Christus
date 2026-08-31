import { describe, it, expect } from 'vitest';
import { isPublicTrackingHistoryEntry } from '../../api/_lib/historicoPublico.js';

/**
 * A REGRA QUE DECIDE O QUE SAI DA ORGANIZAÇÃO — E QUE NÃO TINHA UM TESTE SÓ.
 *
 * Ela filtra o histórico em dois lugares: a página `?tracking=TOKEN`, que o
 * solicitante abre sem login, e o PDF do estado da OS. O PDF é o que aumenta a
 * aposta: página se fecha, arquivo é encaminhado e impresso.
 *
 * ⚠️ ESTE ARQUIVO TEM DOIS LADOS, E O SEGUNDO IMPORTA TANTO QUANTO O PRIMEIRO.
 * Apertar o filtro é fácil; apertar demais cala a página do solicitante, que é a
 * única coisa que ele tem. Então cada caso que PRECISA sair está aqui do lado de
 * cada caso que NÃO pode — é a comparação que segura a régua no lugar.
 */

const entrada = (over: Record<string, unknown>) => ({ type: 'system', ...over });

describe('o que o solicitante PRECISA continuar vendo', () => {
  it('deixa passar o aviso de etapa, mesmo com palavra sensível no NOME da etapa', () => {
    // "Orçamento" aqui é nome de etapa, não valor. Cortar isto deixaria o
    // solicitante sem saber que a OS andou.
    expect(isPublicTrackingHistoryEntry(entrada({
      text: 'Status atualizado de "Aguardando Orçamento" para "Em execução".',
    }))).toBe(true);
  });

  it('deixa passar os marcadores que SÃO a notícia, mesmo contendo palavra sensível', () => {
    for (const text of [
      'Orçamento aprovado.',
      'Contrato anexado pelo gestor.',
      'Contrato aprovado pela diretoria.',
      'Orçamentos consolidados e enviados para aprovação da diretoria.',
    ]) {
      expect(isPublicTrackingHistoryEntry(entrada({ text })), text).toBe(true);
    }
  });

  it('deixa passar o aceite com motivo comum', () => {
    expect(isPublicTrackingHistoryEntry(entrada({
      text: 'Triagem concluída. OS aceita com prioridade Alta, local Refeitório. Motivo da transição: equipe disponível na sexta.',
    }))).toBe(true);
  });

  it('deixa passar o que foi marcado público de propósito', () => {
    expect(isPublicTrackingHistoryEntry({
      type: 'tech',
      visibility: 'public',
      text: 'Qualquer texto que o gestor decidiu publicar.',
    })).toBe(true);
  });
});

describe('o que NÃO pode sair', () => {
  /**
   * O DEFEITO: o marcador público devolvia `true` antes de olhar o sensível.
   *
   * E era alcançável sem malícia — a Caixa de Entrada grava o aceite como
   * "Triagem concluída. … Motivo da transição: <texto digitado>", SEM `visibility`.
   * Um valor escrito no motivo ia junto.
   */
  it('não deixa o valor pegar carona no marcador de etapa', () => {
    expect(isPublicTrackingHistoryEntry(entrada({
      text: 'Triagem concluída. OS aceita e encaminhada para Fornecedor X. Motivo da transição: aprovado o orçamento de R$ 12.480,00 com o João.',
    }))).toBe(false);
  });

  it('não deixa o valor pegar carona numa entrada técnica', () => {
    expect(isPublicTrackingHistoryEntry({
      type: 'tech',
      text: 'Status atualizado de "Nova OS" para "Em execução". Contrato fechado em R$ 12.480,00.',
    })).toBe(false);
  });

  it('não deixa parcela nem aditivo saírem colados no marcador', () => {
    for (const text of [
      'Status atualizado de "A" para "B". Parcela 2 de 3 paga.',
      'Execução iniciada. Aditivo assinado ontem.',
      'OS encerrada. Pagamento liberado.',
    ]) {
      expect(isPublicTrackingHistoryEntry(entrada({ text })), text).toBe(false);
    }
  });

  /**
   * O CONSERTO NA ORIGEM: aviso e motivo viraram DUAS entradas.
   *
   * O filtro acima é a rede; isto é o chão. A Caixa de Entrada agora grava o aviso
   * separado do texto digitado, e só o texto digitado leva `internal`. Assim o
   * solicitante continua sabendo que a OS andou sem depender de o filtro adivinhar
   * o que veio de um teclado.
   */
  it('o par que a Caixa grava: o aviso sai, o motivo digitado não', () => {
    const [aviso, motivo] = [
      { type: 'system', text: 'Triagem concluída. OS aceita com prioridade Alta, local Refeitório e encaminhada para Equipe Interna.' },
      { type: 'system', text: 'Motivo da transição: o fornecedor cobrou caro demais, vamos pressionar.', visibility: 'internal' },
    ];
    expect(isPublicTrackingHistoryEntry(aviso)).toBe(true);
    expect(isPublicTrackingHistoryEntry(motivo)).toBe(false);
  });

  it('o par do cancelamento se comporta igual', () => {
    expect(isPublicTrackingHistoryEntry({ type: 'system', text: 'OS cancelada por Guilherme.' })).toBe(true);
    expect(isPublicTrackingHistoryEntry({
      type: 'system',
      text: 'Motivo do cancelamento: obra suspensa por falta de verba.',
      visibility: 'internal',
    })).toBe(false);
  });

  it('continua respeitando o interno explícito', () => {
    expect(isPublicTrackingHistoryEntry(entrada({
      visibility: 'internal',
      text: 'Triagem concluída.',
    }))).toBe(false);
  });

  it('continua barrando quem não tem marcador nenhum', () => {
    expect(isPublicTrackingHistoryEntry(entrada({ text: 'Painel da OS atualizado.' }))).toBe(false);
    expect(isPublicTrackingHistoryEntry({ type: 'internal', text: 'Triagem concluída.' })).toBe(false);
  });
});
