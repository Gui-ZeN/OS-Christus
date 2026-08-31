import { describe, it, expect } from 'vitest';
import { buildListaPdf, descreverRecorte } from '../../api/_lib/listaPdf.js';
import { A4_RETRATO, A4_PAISAGEM } from '../../api/_lib/pdfPapel.js';
import { ehPdf, textoDoPdf } from '../pdfTexto';

/**
 * A LISTA DA GESTÃO NO PAPEL.
 *
 * O risco deste documento não é o desenho — é ele circular sem dizer de que recorte
 * saiu. "23 OS" num e-mail se lê como "existem 23 OS", e não como "existem 23 no Sul
 * 1, em orçamento, fora as encerradas". Por isso a maior parte destes testes é sobre
 * o cabeçalho, e não sobre a tabela.
 */

const linha = (id: string, assunto = 'Reparo nas traves da quadra') => [
  id, assunto, 'BS', 'Elevadores', 'Metalúrgica', 'Cezar Serra', 'Em orçamento', '1/6', '33 dias',
];

describe('o recorte escrito no cabeçalho', () => {
  it('lista os filtros ativos e ignora os que estão em "todos"', () => {
    const r = descreverRecorte(
      { sede: 'SUL 1', macroServico: 'todos', servico: 'todos', equipe: 'todas', etapa: 'Em orçamento' },
      { total: 207, exibidas: 15 },
    );
    expect(r.filtros).toContain('Sede: SUL 1');
    expect(r.filtros).toContain('Etapa: Em orçamento');
    expect(r.filtros).not.toContain('todos');
    expect(r.contagem).toBe('15 de 207 OS');
  });

  it('diz que não há filtro em vez de deixar a linha em branco', () => {
    // Linha vazia se lê como "o filtro se perdeu"; a frase se lê como escopo inteiro.
    expect(descreverRecorte({}, { total: 207, exibidas: 207 }).filtros).toContain('Sem filtros');
  });

  it('declara sempre as duas escolhas que mudam o que está na lista', () => {
    // Encerradas e ordem nao aparecem como "filtro" na tela, mas mudam o conteudo do
    // papel — quem le precisa saber se a lista exclui OS encerradas.
    const semEncerradas = descreverRecorte({ ordem: 'parada' }, { total: 9, exibidas: 9 });
    expect(semEncerradas.filtros).toContain('Sem encerradas e canceladas');
    expect(semEncerradas.filtros).toContain('Mais paradas primeiro');

    const comEncerradas = descreverRecorte({ mostrarEncerradas: true, ordem: 'recentes' }, { total: 9, exibidas: 9 });
    expect(comEncerradas.filtros).toContain('Inclui encerradas e canceladas');
    expect(comEncerradas.filtros).toContain('Mais recentes primeiro');
  });

  it('nomeia os atalhos que a tela mostra como botão', () => {
    const r = descreverRecorte({ travadas: true, agua: true, busca: '  quadra  ' }, { total: 207, exibidas: 5 });
    expect(r.filtros).toContain('Somente travadas');
    expect(r.filtros).toContain('Somente problemas de água');
    expect(r.filtros).toContain('Busca: "quadra"');
  });
});

describe('o arquivo, aberto', () => {
  const documento = (linhas: string[][], filtros = 'Sede: SUL 1') =>
    buildListaPdf({ linhas, filtros, contagem: `${linhas.length} de 207 OS`, geradoEm: '31/08/2026 10:00', geradoPor: 'Guilherme' });

  it('sai um PDF de verdade, com o recorte e as OS dentro', async () => {
    const pdf = await documento([linha('OS-0271'), linha('OS-0272', 'Troca de lâmpadas')]);
    expect(ehPdf(pdf)).toBe(true);
    const texto = textoDoPdf(pdf);
    expect(texto).toContain('Gestão de OS');
    expect(texto).toContain('Sede: SUL 1');
    expect(texto).toContain('2 de 207 OS');
    expect(texto).toContain('OS-0271');
    expect(texto).toContain('OS-0272');
    expect(texto).toContain('Guilherme');
  });

  it('a lista vazia diz que o recorte está vazio, e não some', async () => {
    const texto = textoDoPdf(await documento([]));
    expect(texto).toContain('Nenhuma OS neste recorte');
  });

  it('aguenta a fila inteira sem estourar', async () => {
    const muitas = Array.from({ length: 207 }, (_, i) => linha(`OS-${String(i).padStart(4, '0')}`));
    const pdf = await documento(muitas);
    expect(ehPdf(pdf)).toBe(true);
    const texto = textoDoPdf(pdf);
    // A primeira e a ULTIMA: paginacao que perde a cauda passaria olhando so a
    // primeira pagina, e e a cauda que interessa numa fila ordenada por tempo parado.
    expect(texto).toContain('OS-0000');
    expect(texto).toContain('OS-0206');
  });
});

describe('a geometria do papel', () => {
  it('paisagem é o retrato deitado, e o retrato continua o que era', () => {
    // ⚠️ O padrao nao pode ter mudado: `ensureSpace` e `drawTable` sem geometria
    // desenham o relatorio gerencial e o retrato da OS, que ja estavam em producao.
    expect(A4_RETRATO).toEqual({ M: 48, PAGE_W: 595.28, PAGE_H: 841.89, CW: 499.28, BOTTOM: 769.89 });
    expect(A4_PAISAGEM.PAGE_W).toBe(A4_RETRATO.PAGE_H);
    expect(A4_PAISAGEM.PAGE_H).toBe(A4_RETRATO.PAGE_W);
    expect(A4_PAISAGEM.CW).toBeGreaterThan(A4_RETRATO.CW);
  });
});
