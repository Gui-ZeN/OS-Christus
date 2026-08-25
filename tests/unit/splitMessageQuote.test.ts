import { describe, expect, it } from 'vitest';
import { splitMessageQuote } from '../../src/utils/text';

/**
 * O contrato de que a tela depende: `latest` vazio com `quoted` cheio significa
 * "a pessoa não escreveu nada novo". O `MessageBody` usa isso para mostrar
 * "Sem texto novo — só a conversa citada" em vez de jogar o cabeçalho cru na
 * tela — eram 28 das 854 entradas do histórico em 25/08/2026, cada uma virando
 * uma linha solta dizendo "Em qui… Fulano escreveu:".
 */
describe('separação entre o que é novo e o que é citação', () => {
  it('mensagem que é SÓ a atribuição não deixa texto novo', () => {
    const { latest, quoted } = splitMessageQuote('Em qui., 2 de jul. de 2026 às 11:37, Pablo Cunha escreveu:');
    expect(latest).toBe('');
    expect(quoted).not.toBe('');
  });

  it('resposta com texto próprio mantém o texto e separa a citação', () => {
    const texto = [
      'Ciente, vou verificar.',
      '',
      'Em qui., 2 de jul. de 2026 às 11:37, Pablo Cunha escreveu:',
      '> Podemos seguir com o reparo?',
    ].join('\n');
    const { latest, quoted } = splitMessageQuote(texto);
    expect(latest).toBe('Ciente, vou verificar.');
    expect(quoted).toContain('Podemos seguir com o reparo?');
  });

  it('mensagem sem citação nenhuma não vira "sem texto novo"', () => {
    const { latest, quoted } = splitMessageQuote('Solicito o reparo da porta do bloco B.');
    expect(latest).toBe('Solicito o reparo da porta do bloco B.');
    expect(quoted).toBe('');
  });

  it('texto vazio não engana a tela — não há citação para mostrar', () => {
    expect(splitMessageQuote('')).toEqual({ latest: '', quoted: '' });
    expect(splitMessageQuote(null)).toEqual({ latest: '', quoted: '' });
  });
});
