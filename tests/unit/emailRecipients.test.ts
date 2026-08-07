import { describe, expect, it } from 'vitest';
import { filterCopyRecipients, mergeEmailLists, parseEmailList } from '../../api/_lib/email.js';

/**
 * Quem entra na cópia de um e-mail da OS. É o filtro que decide o volume que a
 * operação recebe — e vivia dentro das 2.5 mil linhas do mail.js sem um teste.
 */
describe('mergeEmailLists', () => {
  it('junta string e array na mesma lista, sem repetir', () => {
    expect(mergeEmailLists('ana@px.com.br, bruno@px.com.br', ['bruno@px.com.br', 'carla@px.com.br'])).toEqual([
      'ana@px.com.br',
      'bruno@px.com.br',
      'carla@px.com.br',
    ]);
  });

  it('extrai o endereço de dentro de "Nome <email>"', () => {
    expect(mergeEmailLists('Thaís Silva <thais@px.com.br>')).toEqual(['thais@px.com.br']);
  });

  it('lista vazia ou nula não vira sujeira', () => {
    expect(mergeEmailLists('', null as unknown as string, undefined as unknown as string)).toEqual([]);
  });
});

describe('filterCopyRecipients', () => {
  it('🔁 a caixa do próprio sistema nunca entra em cópia', () => {
    // Sem isto o e-mail volta para a fila de entrada e vira OS nova — o laço que
    // já produziu OS duplicada.
    const r = filterCopyRecipients('ana@px.com.br, os@px.com.br', ['os@px.com.br']);
    expect(r).toEqual(['ana@px.com.br']);
  });

  it('quem já é destinatário direto não recebe cópia também', () => {
    // Mandar duas vezes para a mesma pessoa é exatamente o que faz o sistema
    // parecer que spamma.
    expect(filterCopyRecipients('ana@px.com.br, bruno@px.com.br', ['ana@px.com.br'])).toEqual([
      'bruno@px.com.br',
    ]);
  });

  it('bloqueio compara o endereço, não o texto todo', () => {
    expect(filterCopyRecipients('ana@px.com.br', ['Ana Souza <ANA@px.com.br>'])).toEqual([]);
  });

  it('sem bloqueio, devolve a lista inteira', () => {
    expect(filterCopyRecipients('ana@px.com.br; bruno@px.com.br')).toEqual([
      'ana@px.com.br',
      'bruno@px.com.br',
    ]);
  });

  it('não divide por espaço no envio — nome com espaço não vira endereço', () => {
    expect(parseEmailList('Ana Souza <ana@px.com.br>')).toEqual(['ana@px.com.br']);
  });
});
