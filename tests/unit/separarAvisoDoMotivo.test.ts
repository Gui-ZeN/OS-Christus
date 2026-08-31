import { describe, it, expect } from 'vitest';
import { separarAvisoDoMotivo, precisaSeparar, repararHistorico } from '../../scripts/infra/separarAvisoDoMotivo.mjs';
import { isPublicTrackingHistoryEntry } from '../../api/_lib/historicoPublico.js';

/**
 * O CORTE DE UM REPARO QUE RODA UMA VEZ SOBRE MESES DE HISTÓRICO.
 *
 * Se ele cortar no lugar errado, o erro fica gravado e ninguém confere depois. Por
 * isso a decisão mora num módulo puro e é afirmada aqui, sem banco.
 *
 * ⚠️ METADE DESTE ARQUIVO É SOBRE O QUE NÃO PODE CASAR. Um separador guloso é pior
 * que o vazamento que ele conserta: vazamento se fecha, texto mutilado não volta.
 */

describe('separa as duas formas que o cliente escrevia', () => {
  it('o aceite: o aviso fica, o motivo digitado sai inteiro', () => {
    const r = separarAvisoDoMotivo(
      'Triagem concluída. OS aceita com prioridade Alta, local Refeitório e encaminhada para Fornecedor X. Motivo da transição: aprovado o orçamento de R$ 12.480,00 com o João.',
    );
    expect(r?.aviso).toBe('Triagem concluída. OS aceita com prioridade Alta, local Refeitório e encaminhada para Fornecedor X.');
    expect(r?.motivo).toBe('Motivo da transição: aprovado o orçamento de R$ 12.480,00 com o João.');
  });

  it('o cancelamento: o ponto pertence ao aviso', () => {
    const r = separarAvisoDoMotivo('OS cancelada por Guilherme. Motivo: obra suspensa por falta de verba.');
    expect(r?.aviso).toBe('OS cancelada por Guilherme.');
    expect(r?.motivo).toBe('Motivo do cancelamento: obra suspensa por falta de verba.');
  });

  it('o aceite com detalhe do local — a forma mais longa', () => {
    const r = separarAvisoDoMotivo(
      'Triagem concluída. OS aceita com prioridade Média, local Bloco B, detalhe do local terceiro andar e encaminhada para Equipe Interna. Motivo da transição: chamado repetido.',
    );
    expect(r?.aviso).toContain('detalhe do local terceiro andar');
    expect(r?.aviso).not.toContain('Motivo');
    expect(r?.motivo).toBe('Motivo da transição: chamado repetido.');
  });

  it('o par separado passa a se comportar certo no filtro', () => {
    const r = separarAvisoDoMotivo(
      'Triagem concluída. OS aceita e encaminhada para Fornecedor X. Motivo da transição: fechado em R$ 9.000.',
    );
    expect(isPublicTrackingHistoryEntry({ type: 'system', text: r!.aviso })).toBe(true);
    expect(isPublicTrackingHistoryEntry({ type: 'system', text: r!.motivo, visibility: 'internal' })).toBe(false);
  });
});

describe('o que NÃO pode ser tocado', () => {
  it('deixa em paz o aceite que já nasceu sem motivo', () => {
    expect(separarAvisoDoMotivo('Triagem concluída. OS aceita com prioridade Alta e encaminhada para Equipe Interna.')).toBeNull();
  });

  it('deixa em paz o motivo vazio', () => {
    expect(separarAvisoDoMotivo('Triagem concluída. OS aceita. Motivo da transição:  ')).toBeNull();
    expect(separarAvisoDoMotivo('OS cancelada por Ana. Motivo:   ')).toBeNull();
  });

  it('deixa em paz o que só PARECE com as duas formas', () => {
    for (const texto of [
      'OS reaberta pelo gestor para Em execução. Motivo da transição: erro de triagem.',
      'Transição manual via chat: A -> B. Motivo: cliente pediu.',
      'Transição manual via Gestão: A -> B. Motivo: cliente pediu.',
      'Status atualizado de "A" para "B".',
      'Triagem concluída pelo gestor às 14h.',
      'Motivo da transição: solto, sem aviso nenhum na frente.',
      '',
    ]) {
      expect(separarAvisoDoMotivo(texto), texto).toBeNull();
    }
  });

  it('não mexe em quem já tem visibility — rodar duas vezes é igual a rodar uma', () => {
    const misturada = {
      type: 'system',
      text: 'Triagem concluída. OS aceita. Motivo da transição: sigiloso.',
    };
    expect(precisaSeparar(misturada)).toBe(true);
    expect(precisaSeparar({ ...misturada, visibility: 'internal' })).toBe(false);
    expect(precisaSeparar({ ...misturada, visibility: 'public' })).toBe(false);
  });

  it('não mexe em entrada que não é do sistema', () => {
    const texto = 'Triagem concluída. OS aceita. Motivo da transição: sigiloso.';
    expect(precisaSeparar({ type: 'tech', text: texto })).toBe(false);
    expect(precisaSeparar({ type: 'customer', text: texto })).toBe(false);
    expect(precisaSeparar(null)).toBe(false);
  });
});

describe('remonta o histórico da OS', () => {
  const quando = new Date('2026-03-04T10:00:00Z');
  const historico = () => [
    { id: 'a', type: 'system', sender: 'Sistema', time: quando, text: 'Solicitação registrada via formulário público.' },
    { id: 'b', type: 'system', sender: 'Guilherme', time: quando, text: 'Triagem concluída. OS aceita e encaminhada para Fornecedor X. Motivo da transição: fechado em R$ 9.000.' },
    { id: 'c', type: 'tech', sender: 'Ana', time: quando, text: 'Equipe a caminho.' },
  ];

  let n = 0;
  const idFalso = () => `novo-${++n}`;

  it('põe o motivo logo depois do aviso, não no fim', () => {
    n = 0;
    const r = repararHistorico(historico(), idFalso);
    expect(r?.novo.map(i => i.id)).toEqual(['a', 'b', 'novo-1', 'c']);
    expect(r?.novo[1].text).toBe('Triagem concluída. OS aceita e encaminhada para Fornecedor X.');
    expect(r?.novo[2].text).toBe('Motivo da transição: fechado em R$ 9.000.');
    expect(r?.novo[2].visibility).toBe('internal');
  });

  it('o aviso herda id, autor e instante — reparo não reescreve autoria', () => {
    n = 0;
    const r = repararHistorico(historico(), idFalso);
    expect(r?.novo[1]).toMatchObject({ id: 'b', sender: 'Guilherme', time: quando });
    expect(r?.novo[2]).toMatchObject({ sender: 'Guilherme', time: quando });
  });

  it('não toca em quem não precisa', () => {
    expect(repararHistorico([{ id: 'a', type: 'system', text: 'Execução concluída.' }], idFalso)).toBeNull();
    expect(repararHistorico([], idFalso)).toBeNull();
    expect(repararHistorico(undefined, idFalso)).toBeNull();
  });

  it('rodar duas vezes é igual a rodar uma', () => {
    n = 0;
    const primeira = repararHistorico(historico(), idFalso);
    expect(repararHistorico(primeira!.novo, idFalso)).toBeNull();
  });
});
