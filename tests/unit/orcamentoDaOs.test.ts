import { describe, expect, it } from 'vitest';
import {
  anexosDoOrcamento,
  estadoDoOrcamento,
  orcamentoParaGravar,
  resumoDoOrcamento,
  variacaoDe,
  previstoEfetivo,
  problemasNasNotas,
  realizadoEfetivo,
  totalDasNotas,
  totalDosItens,
} from '../../src/views/financeiro/orcamento';

/**
 * A CONTA DO PAINEL FINANCEIRO NOVO.
 *
 * O painel anterior tinha 2.293 linhas e nenhum teste sobre o número que mostrava —
 * e nunca foi usado: zero cotações, zero contratos, zero medições, zero pagamentos
 * em 281 OS de produção. O novo registra duas coisas, e são estas as regras que
 * decidem se ele diz a verdade.
 */

describe('vazio não é zero', () => {
  it('sem os dois lados não há variação — e não é "-100%"', () => {
    /*
     * ⚠️ O ERRO QUE FARIA O PAINEL MENTIR PARA CIMA. Uma OS orçada em R$ 2.000 e
     * ainda não paga, com o vazio virando zero, apareceria como "-100%, economizou
     * tudo" — e entraria na soma de economia do período. Toda OS em andamento faria
     * isso ao mesmo tempo.
     */
    expect(variacaoDe({ previsto: '2000', realizado: null })).toBeNull();
    expect(variacaoDe({ previsto: null, realizado: '1800' })).toBeNull();
    expect(variacaoDe({})).toBeNull();
    expect(variacaoDe(null)).toBeNull();
  });

  it('com os dois, devolve a diferença em reais e em fração', () => {
    const v = variacaoDe({ previsto: 'R$ 2.400,00', realizado: 'R$ 2.180,00' });
    expect(v?.diferenca).toBeCloseTo(-220, 2);
    expect(v?.fracao).toBeCloseTo(-220 / 2400, 6);
  });

  it('zero realizado é uma resposta legítima, não ausência', () => {
    // "custou nada" existe — serviço resolvido pela própria equipe, por exemplo.
    const v = variacaoDe({ previsto: '500', realizado: '0' });
    expect(v?.diferenca).toBe(-500);
    expect(estadoDoOrcamento({ previsto: '500', realizado: '0' })).toBe('completo');
  });

  it('orçado zero não vira "∞%" — a fração some, a diferença fica', () => {
    // Dividir por zero dá Infinity, e o Intl formata isso como "∞%" sem reclamar.
    // Gasto de R$ 500 que ninguém previu: o número que conta é o 500.
    const v = variacaoDe({ previsto: '0', realizado: '500' });
    expect(v?.diferenca).toBe(500);
    expect(v?.fracao).toBeNull();
  });

  it('texto que não é um valor único conta como vazio', () => {
    // "R$ 1.500 a R$ 2.000" é coisa que se digita num orçamento. `parseFloat` daria
    // 1500,002; a regra da casa devolve null, e aqui isso significa "não informado".
    expect(estadoDoOrcamento({ previsto: 'R$ 1.500,00 a R$ 2.000,00' })).toBe('vazio');
    expect(variacaoDe({ previsto: '12,5,7', realizado: '100' })).toBeNull();
  });
});

describe('o estado diz o que falta', () => {
  it('nomeia os quatro casos', () => {
    expect(estadoDoOrcamento(undefined)).toBe('vazio');
    expect(estadoDoOrcamento({ previsto: '100' })).toBe('so-previsto');
    expect(estadoDoOrcamento({ realizado: '100' })).toBe('so-realizado');
    expect(estadoDoOrcamento({ previsto: '100', realizado: '90' })).toBe('completo');
  });
});

describe('o resumo do recorte', () => {
  const os = (previsto?: string | null, realizado?: string | null) => ({
    orcamento: { previsto, realizado },
  });

  it('conta quem tem e quem não tem registro', () => {
    // `semRegistro` é o número que diz se o painel está sendo usado — sem ele, um
    // painel vazio e um painel equilibrado mostram o mesmo total.
    const r = resumoDoOrcamento([os('100', '90'), os('200'), os(), { orcamento: undefined }]);
    expect(r.comRegistro).toBe(2);
    expect(r.semRegistro).toBe(2);
  });

  it('soma cada lado com quem tem aquele lado', () => {
    const r = resumoDoOrcamento([os('100', '90'), os('200', null), os(null, '50')]);
    expect(r.previsto).toBe(300);
    expect(r.realizado).toBe(140);
  });

  it('⚠️ a diferença comparável ignora OS meia-preenchida', () => {
    /*
     * Subtrair `realizado` de `previsto` daria -160 no caso abaixo — mas isso é a
     * diferença entre DUAS AMOSTRAS DIFERENTES, não a economia. Só a primeira OS tem
     * os dois lados, e a economia real dela é -10.
     */
    const r = resumoDoOrcamento([os('100', '90'), os('200', null), os(null, '50')]);
    expect(r.realizado - r.previsto).toBe(-160); // o número enganoso
    expect(r.diferencaComparavel).toBe(-10);     // o número honesto
    expect(r.comparaveis).toBe(1);
  });

  it('sem nada comparável, o contador distingue "bateu certinho" de "não havia o que comparar"', () => {
    const r = resumoDoOrcamento([os('200'), os(null, '50')]);
    expect(r.diferencaComparavel).toBe(0);
    expect(r.comparaveis).toBe(0);
  });
});

describe('o que vai gravado', () => {
  it('⚠️ campo apagado vira null, e não some do objeto', () => {
    /*
     * O merge do Firestore com a chave AUSENTE mantém o valor velho: quem limpasse o
     * realizado veria o número voltar no reload, sem erro nenhum. `null` apaga.
     */
    const gravado = orcamentoParaGravar({ previsto: '100', realizado: '90' }, { realizado: '' }, 'Larissa');
    expect(gravado.realizado).toBeNull();
    expect(gravado.previsto).toBe('100');
  });

  it('campo não mencionado preserva o que estava lá', () => {
    // A tela salva um campo por vez; sem isto, editar o previsto apagaria o realizado.
    const gravado = orcamentoParaGravar({ previsto: '100', realizado: '90' }, { previsto: '120' }, 'Larissa');
    expect(gravado.realizado).toBe('90');
    expect(gravado.previsto).toBe('120');
  });

  it('carimba quem mexeu e quando', () => {
    const agora = new Date('2026-09-10T12:00:00.000Z');
    const gravado = orcamentoParaGravar(undefined, { previsto: '100' }, 'Thais', agora);
    expect(gravado.atualizadoPor).toBe('Thais');
    expect(gravado.atualizadoEm).toBe('2026-09-10T12:00:00.000Z');
  });

  it('guarda o texto como a pessoa digitou', () => {
    // O dado é o que ela escreveu; a conversão para número é da leitura. Reformatar na
    // gravação apagaria a entrada original sem ela ter pedido.
    const gravado = orcamentoParaGravar(undefined, { previsto: 'R$ 2.400,00' }, 'Rafael');
    expect(gravado.previsto).toBe('R$ 2.400,00');
  });
});

/**
 * O ORÇADO DIGITADO LINHA A LINHA.
 *
 * O modal aceita duas formas: anexar o PDF do fornecedor ou lançar material e valor
 * à mão. O PDF NÃO é lido pelo sistema — o número que entra na conta é sempre o que
 * alguém digitou. Extrair valor de PDF e apresentar como dado seria inventar precisão.
 */
describe('a soma das linhas manda no total', () => {
  const item = (descricao: string, valor: string) => ({ id: descricao, descricao, valor });

  it('sem linhas, vale o total digitado', () => {
    expect(previstoEfetivo({ previsto: '2000' })).toBe(2000);
  });

  it('com linhas, vale a soma delas', () => {
    const o = { itens: [item('Gesseiro', '380'), item('Placas', '1150'), item('Pintura', '650')] };
    expect(totalDosItens(o.itens)).toBe(2180);
    expect(previstoEfetivo(o)).toBe(2180);
  });

  it('⚠️ a soma GANHA do total digitado quando os dois existem', () => {
    /*
     * O caso que faria a tabela dizer dois números ao mesmo tempo: alguém digita
     * R$ 2.000 no total, depois lança as linhas e elas somam R$ 2.350. Se o total
     * escrito vencesse, a variação sairia calculada em cima de um número que o
     * próprio detalhamento contradiz.
     */
    const o = { previsto: '2000', itens: [item('a', '1200'), item('b', '1150')] };
    expect(previstoEfetivo(o)).toBe(2350);
    expect(variacaoDe({ ...o, realizado: '2350' })?.diferenca).toBe(0);
  });

  it('linha sem valor legível fica de fora, e não zera a soma', () => {
    // Quem digitou o material e ainda não pôs o preço não pode derrubar o total.
    const o = { itens: [item('Gesseiro', '380'), item('Placas — orçar', '')] };
    expect(previstoEfetivo(o)).toBe(380);
  });

  it('nenhuma linha com valor devolve null, e aí o total digitado volta a valer', () => {
    expect(totalDosItens([item('Placas — orçar', ''), item('Frete', 'a combinar')])).toBeNull();
    expect(previstoEfetivo({ previsto: '900', itens: [item('Placas', '')] })).toBe(900);
  });

  it('o resumo do recorte usa o mesmo orçado da linha', () => {
    const r = resumoDoOrcamento([
      { orcamento: { itens: [item('a', '1200'), item('b', '1150')], realizado: '2000' } },
      { orcamento: { previsto: '500', realizado: '500' } },
    ]);
    expect(r.previsto).toBe(2850);
    expect(r.diferencaComparavel).toBe(-350);
    expect(r.comparaveis).toBe(2);
  });
});

describe('o que o modal grava', () => {
  it('⚠️ linha em branco não é gravada', () => {
    // O modal começa com uma linha vazia para haver onde digitar; abrir e fechar sem
    // escrever gravaria uma linha fantasma que reaparece toda vez.
    const g = orcamentoParaGravar(undefined, {
      itens: [{ id: '1', descricao: 'Gesseiro', valor: '380' }, { id: '2', descricao: '', valor: '' }],
    }, 'Larissa');
    expect(g.itens).toHaveLength(1);
  });

  it('linha só com descrição é gravada — é orçamento em andamento', () => {
    const g = orcamentoParaGravar(undefined, {
      itens: [{ id: '1', descricao: 'Placas de gesso — pedir preço', valor: '' }],
    }, 'Larissa');
    expect(g.itens).toHaveLength(1);
  });

  it('os anexos entram e saem sem levar o resto junto', () => {
    const pdf = { id: 'a1', name: 'proposta.pdf', path: 'attachments/tickets/orcamentos/OS-1/x.pdf' } as never;
    const foto = { id: 'a2', name: 'foto.jpg', path: 'attachments/tickets/orcamentos/OS-1/y.jpg' } as never;
    const comAnexos = orcamentoParaGravar({ previsto: '900' }, { anexos: [pdf, foto] }, 'Thais');
    expect(comAnexos.anexos).toEqual([pdf, foto]);
    expect(comAnexos.previsto).toBe('900');

    const semAnexos = orcamentoParaGravar(comAnexos, { anexos: [] }, 'Thais');
    expect(semAnexos.anexos).toEqual([]);
    expect(semAnexos.previsto).toBe('900');
  });

  it('salvar só o valor não apaga os anexos', () => {
    const pdf = { id: 'a1', name: 'proposta.pdf', path: 'p' } as never;
    const g = orcamentoParaGravar({ anexos: [pdf] }, { realizado: '1.000' }, 'Thais');
    expect(g.anexos).toEqual([pdf]);
  });
});

describe('anexo único de antes de 15/10 vira lista de um', () => {
  const antigo = { id: 'a0', name: 'proposta-antiga.pdf', path: 'p0' } as never;

  it('o campo antigo é lido como lista', () => {
    expect(anexosDoOrcamento({ anexo: antigo })).toEqual([antigo]);
    expect(anexosDoOrcamento({})).toEqual([]);
    expect(anexosDoOrcamento(null)).toEqual([]);
  });

  it('ao salvar, o anexo antigo passa para a lista e o campo velho zera — nada some', () => {
    const g = orcamentoParaGravar({ anexo: antigo, previsto: '500' }, { realizado: '480' }, 'Thais');
    expect(g.anexos).toEqual([antigo]);
    expect(g.anexo).toBeNull();
  });

  it('a lista nova manda sobre o campo antigo', () => {
    const novo = { id: 'a3', name: 'nova.pdf', path: 'p3' } as never;
    expect(anexosDoOrcamento({ anexo: antigo, anexos: [novo] })).toEqual([novo]);
  });
});

describe('realizado com notas fiscais (16/10/2026)', () => {
  const nota = (valor: string, pagoEm: string | null = '2026-10-10') => ({ id: valor, valor, pagoEm, anexo: null });

  it('com notas, o realizado é a soma delas', () => {
    expect(realizadoEfetivo({ notas: [nota('1.000,00'), nota('250,50')] })).toBeCloseTo(1250.5);
  });

  it('as notas ganham do realizado digitado antes', () => {
    expect(realizadoEfetivo({ realizado: '9.999', notas: [nota('100')] })).toBe(100);
  });

  it('sem notas, vale o realizado digitado (as 19 OS antigas)', () => {
    expect(realizadoEfetivo({ realizado: '480' })).toBe(480);
    expect(realizadoEfetivo({})).toBeNull();
  });

  it('nota sem valor legível não zera a soma', () => {
    expect(totalDasNotas([nota('300'), nota('')])).toBe(300);
    expect(totalDasNotas([nota('')])).toBeNull();
  });

  it('a variação usa a soma das notas', () => {
    const v = variacaoDe({ previsto: '1.000', notas: [nota('600'), nota('500')] });
    expect(v?.diferenca).toBe(100);
  });

  it('o resumo do painel conta a OS que só tem notas', () => {
    const r = resumoDoOrcamento([{ orcamento: { notas: [nota('200')] } }, { orcamento: {} }]);
    expect(r.comRegistro).toBe(1);
    expect(r.realizado).toBe(200);
  });

  it('gravar descarta a nota em branco e guarda as preenchidas, com a data', () => {
    const g = orcamentoParaGravar(undefined, { notas: [nota('150', '2026-10-01'), { id: 'x', valor: '', pagoEm: null, anexo: null }] }, 'Thais');
    expect(g.notas).toEqual([{ id: '150', valor: '150', pagoEm: '2026-10-01', anexo: null }]);
  });

  it('salvar o orçado não apaga as notas', () => {
    const g = orcamentoParaGravar({ notas: [nota('150')] }, { previsto: '200' }, 'Thais');
    expect(g.notas).toHaveLength(1);
  });
});

describe('o que o auditor achou nas notas (16/10/2026)', () => {
  const pdf = { id: 'a', name: 'nf.pdf', path: 'p' } as never;

  it('nota preenchida sem valor ou sem data não pode ser salva', () => {
    expect(problemasNasNotas([{ id: '1', valor: '', pagoEm: '2026-10-10', anexo: pdf }])).toEqual(['Nota 1: falta valor.']);
    expect(problemasNasNotas([{ id: '1', valor: '100', pagoEm: null, anexo: null }])).toEqual(['Nota 1: falta data do pagamento.']);
    expect(problemasNasNotas([{ id: '1', valor: '', pagoEm: null, anexo: pdf }])).toEqual(['Nota 1: falta valor e data do pagamento.']);
  });

  it('a linha em branco e a nota sem arquivo não travam o salvar', () => {
    expect(problemasNasNotas([{ id: '1', valor: '', pagoEm: null, anexo: null }])).toEqual([]);
    expect(problemasNasNotas([{ id: '1', valor: '100', pagoEm: '2026-10-10', anexo: null }])).toEqual([]);
  });

  it('salvar notas substitui o realizado digitado antes — apagar as notas não o ressuscita', () => {
    const comNotas = orcamentoParaGravar({ realizado: '500' }, { notas: [{ id: '1', valor: '100', pagoEm: '2026-10-10', anexo: null }] }, 'T');
    expect(comNotas.realizado).toBeNull();
    expect(realizadoEfetivo(comNotas)).toBe(100);
    const semNotas = orcamentoParaGravar(comNotas, { notas: [] }, 'T');
    expect(realizadoEfetivo(semNotas)).toBeNull();
  });

  it('salvar só o orçado não mexe no realizado digitado antes', () => {
    expect(orcamentoParaGravar({ realizado: '500' }, { previsto: '600' }, 'T').realizado).toBe('500');
  });
});
