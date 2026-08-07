import { describe, expect, it } from 'vitest';
import { hasWaterIssueSignal } from '../../api/_lib/inboundBody.js';

/**
 * Assuntos REAIS das 270 OS de produção.
 *
 * O detector antigo conhecia duas palavras — goteira e infiltração — e o resto ficava
 * dependendo de alguém marcar uma caixinha na triagem. Não marcavam: 14 OS falavam de
 * água no assunto e estavam sem a marcação, incluindo "Vazamento no teto do Hall do 4º
 * andar". A informação estava escrita, em português, na primeira linha.
 */
describe('hasWaterIssueSignal — o que ele recupera', () => {
  it.each([
    'Vazamento no teto do Hall do 4⁰ andar',
    'Vazamento Secretaria de Cursos',
    'Vazamento no chão do banheiro da cantina',
    'Vazamento em Sala do Idiomas – Pré Sul',
    '[Infiltrações – Clínica Escola de Odontologia (Campus Benfica)]',
    '[Ocorrência de Goteiras – Solicitação de Correção]',
    'Solicito reparo na calha do refeitório dos alunos',
    'Solicitação de Reparo no Telhado – Acesso aos Pátios',
    'Conserto goteira',
    'QUADRA PRAÇA OESTE COM VAZAMENTOS E FERRUGEM',
    'Instalação de complemento tubulação de descida pluvial',
    'Impermeabilização Laje da Entrada do IDIOMAS',
  ])('reconhece %j', assunto => {
    expect(hasWaterIssueSignal(assunto)).toBe(true);
  });
});

describe('hasWaterIssueSignal — o que ele NÃO pode inventar', () => {
  it.each([
    'Pintura da recepção',
    'Troca de disjuntor no quadro geral',
    'Rede de proteção da quadra',
    'Porta do almoxarifado empenada',
    'Ar-condicionado da sala 12 sem gelar',
    'Troca do espelho da sala de dança',
  ])('ignora %j', assunto => {
    expect(hasWaterIssueSignal(assunto)).toBe(false);
  });

  it('🎯 estrutura de água SEM defeito é obra, não goteira', () => {
    // "Instalação de telhado" é obra nova; "troca de telhas" é conserto. A diferença
    // é o verbo, e é ela que impede o detector de marcar meia manutenção predial.
    expect(hasWaterIssueSignal('Instalação de telhado no galpão novo')).toBe(false);
    expect(hasWaterIssueSignal('Troca de telhas do galpão')).toBe(true);
  });

  it('texto vazio ou nulo não vira sinal', () => {
    expect(hasWaterIssueSignal('')).toBe(false);
    expect(hasWaterIssueSignal(null)).toBe(false);
    expect(hasWaterIssueSignal(undefined)).toBe(false);
  });
});
