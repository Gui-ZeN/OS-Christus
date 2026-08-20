import { describe, expect, it } from 'vitest';
import {
  copiaParaDiretoria,
  destinoDaDiretoria,
  diretoresAtivos,
  enderecoDoSolicitante,
  temDiretorEnvolvido,
} from '../../src/services/ticketEmail/destinatarios';
import type { Ticket } from '../../src/types';

/**
 * QUEM RECEBE CADA E-MAIL.
 *
 * `ticketEmail.ts` tem 870 linhas e estava a 3,7% de cobertura — medida hoje, pela
 * primeira vez. E-mail é a saída inteira deste produto: errar aqui não deixa a tela
 * feia, manda informação de OS para quem não devia ou deixa de avisar quem esperava.
 */

const os = (extra: Record<string, unknown> = {}) => extra as unknown as Ticket;

describe('o endereço do solicitante', () => {
  it('sai limpo, sem espaço em volta', () => {
    expect(enderecoDoSolicitante(os({ requesterEmail: '  josy@px.com.br  ' }))).toBe('josy@px.com.br');
  });

  it('ausente devolve null, NÃO string vazia', () => {
    // String vazia atravessa um `if` como se fosse endereço. Quem chama precisa
    // decidir o que fazer sem destinatário, e para isso precisa enxergar a ausência.
    expect(enderecoDoSolicitante(os({}))).toBeNull();
    expect(enderecoDoSolicitante(os({ requesterEmail: '' }))).toBeNull();
    expect(enderecoDoSolicitante(os({ requesterEmail: '   ' }))).toBeNull();
  });
});

describe('os endereços da diretoria', () => {
  it('viram uma lista pronta para o cabeçalho, em caixa baixa', () => {
    expect(destinoDaDiretoria(os({ directorEmails: ['A@X.com.br', 'b@x.com.br'] }))).toBe(
      'a@x.com.br, b@x.com.br'
    );
  });

  it('sem repetido — o mesmo diretor em duas grafias é uma pessoa só', () => {
    expect(copiaParaDiretoria(os({ directorCcEmails: ['Ana@X.com', ' ana@x.com ', 'ANA@X.COM'] }))).toBe(
      'ana@x.com'
    );
  });

  it('lista vazia ou campo ausente devolve string vazia', () => {
    expect(destinoDaDiretoria(os({}))).toBe('');
    expect(destinoDaDiretoria(os({ directorEmails: [] }))).toBe('');
    expect(copiaParaDiretoria(os({ directorCcEmails: ['', '  ', null] }))).toBe('');
  });

  it('campo que não é lista não quebra', () => {
    expect(destinoDaDiretoria(os({ directorEmails: 'a@x.com' }))).toBe('');
  });
});

describe('a OS tem diretor envolvido?', () => {
  it('basta o ID, mesmo sem e-mail cadastrado', () => {
    // Um diretor pode estar designado por id sem e-mail no cadastro. Exigir os dois
    // faria o aviso à diretoria sumir exatamente onde ele foi pedido.
    expect(temDiretorEnvolvido(os({ directorIds: ['dir-1'], directorEmails: [] }))).toBe(true);
  });

  it('basta o e-mail, mesmo sem id', () => {
    // O contrário acontece em OS antiga.
    expect(temDiretorEnvolvido(os({ directorIds: [], directorEmails: ['dir@x.com'] }))).toBe(true);
  });

  it('sem nenhum dos dois, não há diretor', () => {
    expect(temDiretorEnvolvido(os({}))).toBe(false);
    expect(temDiretorEnvolvido(os({ directorIds: [], directorEmails: [] }))).toBe(false);
  });

  it('valores vazios não contam como diretor', () => {
    expect(temDiretorEnvolvido(os({ directorIds: ['', null], directorEmails: ['  '] }))).toBe(false);
  });
});

describe('a REDE: sem destinatário explícito, vai para todos os diretores ativos', () => {
  /**
   * A decisão de maior alcance do módulo, e perigosa nos dois sentidos: restrita
   * demais, a diretoria não fica sabendo do que foi pedido para ela; larga demais,
   * informação de OS chega a quem saiu da empresa.
   */
  const pessoa = (extra = {}) => ({ email: 'x@x.com', role: 'Diretor', status: 'Ativo', active: true, ...extra });

  it('encontra os diretores ativos', () => {
    const lista = diretoresAtivos([
      pessoa({ email: 'dir1@x.com' }),
      pessoa({ email: 'dir2@x.com' }),
      pessoa({ email: 'gestor@x.com', role: 'Gestor' }),
    ]);
    expect(lista).toEqual(['dir1@x.com', 'dir2@x.com']);
  });

  it('entende "diretor" com e sem acento, e "director" em inglês', () => {
    // O cadastro tem as duas grafias, vindas de épocas diferentes do sistema. Uma
    // comparação literal deixaria metade dos diretores de fora sem ninguém perceber.
    const lista = diretoresAtivos([
      pessoa({ email: 'a@x.com', role: 'DIRETOR' }),
      pessoa({ email: 'b@x.com', role: 'director' }),
      pessoa({ email: 'c@x.com', role: 'Diretór' }),
    ]);
    expect(lista).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  it('INATIVO não recebe — pelas duas marcas', () => {
    // `active: false` e `status: 'Inativo'` convivem no cadastro. Checar só uma
    // delas manda e-mail de OS para quem já saiu da empresa.
    const lista = diretoresAtivos([
      pessoa({ email: 'saiu1@x.com', active: false }),
      pessoa({ email: 'saiu2@x.com', status: 'Inativo' }),
      pessoa({ email: 'fica@x.com' }),
    ]);
    expect(lista).toEqual(['fica@x.com']);
  });

  it('sem status declarado, conta como ativo', () => {
    // O cadastro antigo não tinha o campo; tratar ausência como inativo silenciaria
    // a diretoria inteira de uma vez.
    expect(diretoresAtivos([{ email: 'a@x.com', role: 'Diretor' }])).toEqual(['a@x.com']);
  });

  it('o mesmo diretor duas vezes vira um destinatário só', () => {
    const lista = diretoresAtivos([pessoa({ email: 'A@X.com' }), pessoa({ email: 'a@x.com' })]);
    expect(lista).toEqual(['a@x.com']);
  });

  it('diretor sem e-mail não vira destinatário vazio', () => {
    expect(diretoresAtivos([pessoa({ email: '' }), pessoa({ email: null })])).toEqual([]);
  });

  it('diretório vazio devolve lista vazia, não explode', () => {
    expect(diretoresAtivos([])).toEqual([]);
    expect(diretoresAtivos()).toEqual([]);
    expect(diretoresAtivos(null as unknown as [])).toEqual([]);
  });
});

describe('o que o teste de mutacao encontrou', () => {
  /**
   * Este modulo tinha 100% de cobertura de linha e 83,5% de mutacao. A diferenca sao
   * regras que o codigo aplica e nenhum teste observava.
   */

  it('OS ausente devolve ausencia, nao explode', () => {
    // Os `?.` do modulo sobreviveram a mutacao: nenhum teste chamava sem a OS. Sao
    // funcoes de e-mail, chamadas de varios pontos do fluxo -- a defesa existe por
    // um motivo, e agora esta afirmada.
    expect(enderecoDoSolicitante(null as never)).toBeNull();
    expect(copiaParaDiretoria(null as never)).toBe('');
    expect(destinoDaDiretoria(undefined as never)).toBe('');
    expect(temDiretorEnvolvido(null as never)).toBe(false);
  });

  it('endereco em branco no meio da lista nao vira destinatario vazio', () => {
    /**
     * O `.filter(Boolean)` da montagem da lista sobrevivia a mutacao: os testes
     * passavam listas SO com vazios, e ai tanto faz. So uma lista MISTA distingue.
     *
     * Sem o filtro, `['ana@x.com', '']` viraria o cabecalho "ana@x.com, " -- com
     * virgula sobrando e um destinatario em branco no fim.
     */
    expect(destinoDaDiretoria(os({ directorEmails: ['ana@x.com', '', '  '] }))).toBe('ana@x.com');
    expect(copiaParaDiretoria(os({ directorCcEmails: ['', 'bia@x.com', null] }))).toBe('bia@x.com');
  });

  it('diretor ativo no meio de inativos continua sendo achado', () => {
    // Mesma armadilha do lado da rede: lista so-de-inativos nao distingue nada.
    const lista = diretoresAtivos([
      { email: 'saiu@x.com', role: 'Diretor', status: 'Inativo' },
      { email: 'fica@x.com', role: 'Diretor', status: 'Ativo' },
      { email: 'tambem-saiu@x.com', role: 'Diretor', active: false },
    ]);
    expect(lista).toEqual(['fica@x.com']);
  });
});
