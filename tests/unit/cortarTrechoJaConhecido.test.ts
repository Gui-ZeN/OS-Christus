import { describe, expect, it } from 'vitest';
import { cortarTrechoJaConhecido, extractInboundMessageBody } from '../../api/_lib/inboundBody.js';

const original = [
  'Prezada Thaís',
  'Este serviço já foi colocado no serv3, mas conforme conversamos estou repetindo aqui novamente, conforme sua orientação, a fim de que seja resolvido.',
  'Trata-se do portão da recepção principal que se encontra com defeito.',
].join('\n');

describe('a citação sem marcador é reconhecida pelo que a OS já tem', () => {
  it('corta o trecho repetido e devolve só o que é novo', () => {
    // Caso real, OS-0332: o Outlook não deixou "De:" nem "escreveu:", então o texto
    // citado começa colado no novo e nenhum marcador existe para achar o limite.
    const resposta = [
      'Josy, bom dia.',
      'Ciente.',
      '@Catarina Alencar por favor verificar se é apenas reaperto e se o tme consegue realizar.',
      ...original.split('\n'),
    ].join('\n');

    expect(cortarTrechoJaConhecido(resposta, [original])).toBe(
      ['Josy, bom dia.', 'Ciente.', '@Catarina Alencar por favor verificar se é apenas reaperto e se o tme consegue realizar.'].join('\n')
    );
  });

  it('funciona no fim do caminho real de extração', () => {
    const cru = [
      'Josy, bom dia.',
      'Ciente.',
      '@Catarina Alencar por favor verificar se é apenas reaperto e se o tme consegue realizar.',
      ...original.split('\n'),
      'Atenciosamente',
      'Josy',
    ].join('\n');
    const limpo = cortarTrechoJaConhecido(extractInboundMessageBody(cru, ''), [original]);
    expect(limpo).not.toContain('portão da recepção');
    expect(limpo).toContain('reaperto');
  });

  it('acha a citação mesmo com espaçamento diferente', () => {
    const resposta = ['Segue.', '', '  Prezada   Thaís  ', ...original.split('\n').slice(1)].join('\n');
    expect(cortarTrechoJaConhecido(resposta, [original])).toBe('Segue.');
  });

  it('reconhece contra QUALQUER mensagem anterior, não só a última', () => {
    const outra = 'Bom dia a todos.\nSegue a lista de pendências da semana para conferência.';
    const resposta = ['Ok, obrigada.', ...outra.split('\n')].join('\n');
    expect(cortarTrechoJaConhecido(resposta, [outra, original])).toBe('Ok, obrigada.');
  });
});

describe('o que ele NÃO pode fazer — cortar conteúdo de verdade', () => {
  it('texto novo passa inteiro', () => {
    const novo = 'O portão voltou a travar hoje de manhã.\nPreciso de uma visita ainda esta semana.';
    expect(cortarTrechoJaConhecido(novo, [original])).toBe(novo);
  });

  it('uma linha curta repetida não é citação — é educação', () => {
    // "Ciente." aparecendo em duas mensagens seguidas não pode apagar o resto.
    const anterior = 'Ciente.\nObrigada.';
    const resposta = 'Vou verificar com a equipe amanhã de manhã.\nCiente.\nObrigada.';
    expect(cortarTrechoJaConhecido(resposta, [anterior])).toBe(resposta);
  });

  it('nunca devolve mensagem vazia, mesmo se for só a citação', () => {
    // Vazio some da tela; repetir é feio, perder é pior.
    const resultado = cortarTrechoJaConhecido(original, [original]);
    expect(resultado.trim().length).toBeGreaterThan(0);
  });

  it('sem mensagens anteriores, não mexe em nada', () => {
    const texto = 'Qualquer coisa escrita aqui.\nEm duas linhas.';
    expect(cortarTrechoJaConhecido(texto, [])).toBe(texto);
    expect(cortarTrechoJaConhecido(texto)).toBe(texto);
  });

  it('anterior de uma linha só não serve de gabarito', () => {
    const resposta = 'Vou ver isso hoje.\nObrigada.';
    expect(cortarTrechoJaConhecido(resposta, ['Obrigada.'])).toBe(resposta);
  });

  it('entrada vazia não quebra', () => {
    expect(cortarTrechoJaConhecido('', [original])).toBe('');
    expect(cortarTrechoJaConhecido(null as unknown as string, [original])).toBe('');
  });
});
