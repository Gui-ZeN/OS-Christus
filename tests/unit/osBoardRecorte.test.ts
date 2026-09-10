import { describe, it, expect } from 'vitest';
import { passaNoRecorte, type EscolhasDeCategoria, type LinhaDoRecorte } from '../../src/views/osboard/recorte';

/**
 * O RECORTE DA GESTÃO, COM MÚLTIPLA ESCOLHA.
 *
 * A fila tinha seis `<select>` de resposta única, e a regra cabia num `!==`. Agora
 * são listas, e há três convenções empilhadas que só existiam na cabeça de quem
 * escreveu: vazio é TUDO, dentro de uma dimensão é OU, entre dimensões é E.
 *
 * ⚠️ Nenhuma delas grita quando quebra. A tabela continua desenhando OS — só as
 * erradas —, e quem olha conclui que o sistema perdeu OS, não que o filtro errou.
 * É por isso que estes testes existem antes de qualquer teste de aparência.
 */

const linha = (patch: Partial<LinhaDoRecorte> = {}): LinhaDoRecorte => ({
  siteLabel: 'SUL 1',
  macro: 'Elevadores',
  service: 'Manutenção preventiva',
  team: 'Metalúrgica',
  etapa: 'Em orçamento',
  responsibleEmail: 'cezar@christus.com.br',
  ...patch,
});

const escolhas = (patch: Partial<EscolhasDeCategoria> = {}): EscolhasDeCategoria => ({
  sede: [],
  macroService: [],
  service: [],
  team: [],
  status: [],
  responsible: [],
  ...patch,
});

describe('lista vazia é "todas"', () => {
  it('sem nenhuma escolha, a OS passa', () => {
    // A tela abre assim. Se vazio fosse "nenhuma", a Gestão abriria em branco.
    expect(passaNoRecorte(linha(), escolhas())).toBe(true);
  });

  it('uma dimensão escolhida não estreita as outras', () => {
    // Sede marcada, equipe vazia: a OS de qualquer equipe daquela sede continua.
    expect(passaNoRecorte(linha({ team: 'Qualquer Outra' }), escolhas({ sede: ['SUL 1'] }))).toBe(true);
  });
});

describe('dentro de uma dimensão é OU', () => {
  it('duas sedes marcadas aceitam as duas', () => {
    // A pergunta que não existia: quem cuida de duas sedes filtrava uma, lia,
    // filtrava a outra e somava de cabeça.
    const escolha = escolhas({ sede: ['SUL 1', 'SUL 3'] });
    expect(passaNoRecorte(linha({ siteLabel: 'SUL 1' }), escolha)).toBe(true);
    expect(passaNoRecorte(linha({ siteLabel: 'SUL 3' }), escolha)).toBe(true);
    expect(passaNoRecorte(linha({ siteLabel: 'BS' }), escolha)).toBe(false);
  });
});

describe('entre dimensões é E', () => {
  it('marcar mais uma sede não afrouxa a etapa', () => {
    /*
     * ⚠️ O teste que impede o erro caro. Se as dimensões fossem somadas com OU,
     * marcar uma sede a mais AUMENTARIA a lista de etapas — filtrar passaria a
     * alargar a fila, o oposto do que a palavra quer dizer.
     */
    const escolha = escolhas({ sede: ['SUL 1', 'SUL 3'], status: ['Em orçamento'] });
    expect(passaNoRecorte(linha({ siteLabel: 'SUL 3', etapa: 'Em orçamento' }), escolha)).toBe(true);
    expect(passaNoRecorte(linha({ siteLabel: 'SUL 3', etapa: 'Em execução' }), escolha)).toBe(false);
  });
});

describe('"sem responsável" convive com nomes', () => {
  it('sozinho, pega só as que ninguém assumiu', () => {
    expect(passaNoRecorte(linha({ responsibleEmail: null }), escolhas({ responsible: ['none'] }))).toBe(true);
    expect(passaNoRecorte(linha(), escolhas({ responsible: ['none'] }))).toBe(false);
  });

  it('junto com um nome, soma as duas — a pergunta que não cabia num select', () => {
    // "as do Cezar e as que ninguém assumiu" era impossível com resposta única.
    const escolha = escolhas({ responsible: ['none', 'cezar@christus.com.br'] });
    expect(passaNoRecorte(linha({ responsibleEmail: null }), escolha)).toBe(true);
    expect(passaNoRecorte(linha({ responsibleEmail: 'cezar@christus.com.br' }), escolha)).toBe(true);
    expect(passaNoRecorte(linha({ responsibleEmail: 'outra@christus.com.br' }), escolha)).toBe(false);
  });

  it('escolher só nomes exclui as sem dono, e não o contrário', () => {
    // O erro fácil aqui é deixar a OS sem responsável passar em qualquer filtro de
    // responsável, porque o e-mail dela não bate com nada — inclusive com a exclusão.
    expect(passaNoRecorte(linha({ responsibleEmail: null }), escolhas({ responsible: ['cezar@christus.com.br'] }))).toBe(false);
  });
});
