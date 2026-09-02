import { describe, expect, it } from 'vitest';
import {
  backlogPorEquipe,
  backlogPorEtapa,
  comTeto,
  coberturaDaProximaAcao,
  esperaDaFila,
  filaTravada,
  tempoDeResolucao,
  custoPor,
  envelhecimentoDaFila,
  esperaMaisLonga,
  esperaNaEtapaAtual,
  fornecedorMaisAcionado,
  fornecedoresComSaldo,
  maiorObra,
  media,
  porFornecedor,
  reguaDosMarcos,
  resumoFinanceiro,
  urgenciaDaFila,
  valorDaOs,
  volumeDoPeriodo,
  volumePorSede,
} from '../../src/views/kpi/calculos';
import type { ContractRecord, PaymentRecord, Ticket } from '../../src/types';
import { ORDEM_DAS_ETAPAS, etapaDe } from '../../api/_lib/etapas.js';

/**
 * AS CONTAS DO PAINEL DE INDICADORES.
 *
 * ⚠️ CADA BLOCO AQUI PRENDE UM DEFEITO QUE ESTAVA NA TELA. A auditoria de 31/08
 * achou 38, e a correlação com a cobertura foi perfeita: os módulos com teste
 * passaram limpos, e todo achado grave estava nos `useMemo` sem teste. Estes testes
 * existem para que a correção não seja desfeita por acidente — o comentário de cada
 * um diz o que a tela mostrava ANTES.
 */

const agora = new Date(2026, 8, 1, 12, 0, 0);
const diasAtras = (n: number) => new Date(agora.getTime() - n * 86_400_000);

const os = (over: Partial<Ticket> = {}): Ticket =>
  ({
    id: 'OS-0001',
    subject: 'Reparo',
    status: 'Em andamento',
    time: diasAtras(1),
    sede: 'SUL1',
    ...over,
  }) as Ticket;

const sede = (ticket: Ticket) => String(ticket.sede || 'Não definida');

describe('backlogPorEtapa — o vocabulário é o das seis etapas', () => {
  it('traduz os treze status do banco pelas etapas, e não por lista escrita à mão', () => {
    // ⚠️ A tela agrupava os status de QUATRO maneiras diferentes, e "Triagem"
    // significava coisas distintas em dois gráficos vizinhos.
    const fila = backlogPorEtapa([
      os({ id: 'A', status: 'Aguardando Parecer Técnico' }),
      os({ id: 'B', status: 'Aguardando Aprovação da Solução' }),
      os({ id: 'C', status: 'Aguardando Orçamento' }),
    ]);
    const analise = fila.find(f => f.name === 'Em análise');
    expect(analise?.total).toBe(2);
    expect(fila.find(f => f.name === 'Em orçamento')?.total).toBe(1);
  });

  it('não conta OS encerrada nem cancelada — é fila, não histórico', () => {
    const fila = backlogPorEtapa([
      os({ id: 'A', status: 'Encerrada' }),
      os({ id: 'B', status: 'Cancelada' }),
      os({ id: 'C', status: 'Em andamento' }),
    ]);
    expect(fila.reduce((soma, f) => soma + f.total, 0)).toBe(1);
  });

  it('sai na ordem do fluxo, não do tamanho — barra que troca de lugar não se compara', () => {
    const fila = backlogPorEtapa([
      os({ id: 'A', status: 'Em andamento' }),
      os({ id: 'B', status: 'Em andamento' }),
      os({ id: 'C', status: 'Nova OS' }),
    ]);
    expect(fila.map(f => f.name)).toEqual(['Nova OS', 'Em execução']);
  });
});

describe('esperaNaEtapaAtual — "não sei" não é "instantâneo"', () => {
  it('etapa sem nenhuma OS devolve null, não zero', () => {
    // ⚠️ `average([])` devolvia 0, e a barra sumia mostrando "0 dias" no tooltip —
    // lia-se "resolvemos na hora" onde o certo era "não temos dado".
    const espera = esperaNaEtapaAtual([os({ status: 'Em andamento', stageEnteredAt: diasAtras(10) })], agora);
    const orcamento = espera.find(e => e.name === 'Em orçamento');
    expect(orcamento?.dias).toBeNull();
    expect(orcamento?.osNaEtapa).toBe(0);
  });

  it('conta a amostra junto — etapa com uma OS não pode parecer uma média', () => {
    const espera = esperaNaEtapaAtual([os({ status: 'Em andamento', stageEnteredAt: diasAtras(10) })], agora);
    const execucao = espera.find(e => e.name === 'Em execução');
    expect(execucao?.dias).toBe(10);
    expect(execucao?.osNaEtapa).toBe(1);
  });

  it('mede desde a entrada na etapa, não desde a abertura da OS', () => {
    const espera = esperaNaEtapaAtual(
      [os({ status: 'Em andamento', time: diasAtras(40), stageEnteredAt: diasAtras(2) })],
      agora
    );
    expect(espera.find(e => e.name === 'Em execução')?.dias).toBe(2);
  });

  it('não lista Concluída nem Cancelada — não se espera numa etapa de saída', () => {
    const nomes = esperaNaEtapaAtual([], agora).map(e => e.name);
    expect(nomes).not.toContain('Concluída');
    expect(nomes).not.toContain('Cancelada');
  });
});

describe('envelhecimentoDaFila — o gráfico deixou de ser uma tautologia do filtro', () => {
  it('conta OS velhas nas faixas velhas', () => {
    /**
     * ⚠️ ESTE É O DEFEITO MAIS GRAVE QUE A AUDITORIA ACHOU. A lista chegava aqui já
     * cortada pelo período; no padrão "Últimos 30 dias", nenhuma OS podia ter mais
     * de 29 dias, então "31-60" e "60+" eram estruturalmente ZERO. O gráfico provava
     * que nada envelhece porque já tinha jogado fora tudo que envelheceu.
     */
    const faixas = envelhecimentoDaFila(
      [
        os({ id: 'A', time: diasAtras(3) }),
        os({ id: 'B', time: diasAtras(45) }),
        os({ id: 'C', time: diasAtras(200) }),
      ],
      agora
    );
    expect(faixas.find(f => f.name === '0-7 dias')?.total).toBe(1);
    expect(faixas.find(f => f.name === '31-60 dias')?.total).toBe(1);
    expect(faixas.find(f => f.name === '60+ dias')?.total).toBe(1);
  });

  it('OS encerrada não envelhece na fila', () => {
    const faixas = envelhecimentoDaFila([os({ status: 'Encerrada', time: diasAtras(200) })], agora);
    expect(faixas.every(f => f.total === 0)).toBe(true);
  });
});

describe('backlogPorEquipe — uma equipe, uma barra', () => {
  it('normaliza o nome: mojibake não vira uma segunda equipe', () => {
    // ⚠️ O dropdown usava `repairMojibake` e o gráfico não — "Manutenção" e
    // "ManutenÃ§Ã£o" viravam duas barras para a mesma equipe.
    const { itens } = backlogPorEquipe([
      os({ id: 'A', assignedTeam: 'Manutenção' }),
      os({ id: 'B', assignedTeam: 'ManutenÃ§Ã£o' }),
    ]);
    expect(itens).toHaveLength(1);
    expect(itens[0].total).toBe(2);
  });

  it('corta em 8 para o gráfico, mas diz o total e quantos ficaram de fora', () => {
    // ⚠️ O card "Concentração de fila" mostrava `.length` da lista JÁ cortada: com
    // 12 equipes em fila, ele afirmava "8".
    const muitas = Array.from({ length: 12 }, (_, i) => os({ id: `OS-${i}`, assignedTeam: `Equipe ${i}` }));
    const resultado = backlogPorEquipe(muitas);
    expect(resultado.itens).toHaveLength(8);
    expect(resultado.total).toBe(12);
    expect(resultado.ocultos).toBe(4);
  });
});

describe('urgenciaDaFila — ao lado de gráficos de fila, conta a fila', () => {
  it('ignora encerradas e canceladas', () => {
    // ⚠️ Contava tudo, e ficava entre dois gráficos de backlog com o mesmo formato.
    const fatias = urgenciaDaFila([
      os({ id: 'A', priority: 'Alta' }),
      os({ id: 'B', priority: 'Alta', status: 'Encerrada' }),
      os({ id: 'C', priority: 'Alta', status: 'Cancelada' }),
    ]);
    expect(fatias.find(f => f.name === 'Alta')?.total).toBe(1);
  });
});

describe('esperaMaisLonga — "0 dia" significava "nenhuma OS aberta"', () => {
  it('sem OS aberta devolve null, para a tela poder escrever "—"', () => {
    expect(esperaMaisLonga([os({ status: 'Encerrada' })], agora)).toBeNull();
  });

  it('com OS aberta, devolve a mais antiga e há quantos dias', () => {
    const espera = esperaMaisLonga([os({ id: 'A', time: diasAtras(5) }), os({ id: 'B', time: diasAtras(60) })], agora);
    expect(espera?.id).toBe('B');
    expect(espera?.dias).toBe(60);
  });
});

describe('volumeDoPeriodo — as canceladas deixaram de ser invisíveis', () => {
  it('total = em curso + concluídas + canceladas, e todas aparecem', () => {
    // ⚠️ A tela mostrava total, em curso e concluídas. A diferença eram as
    // canceladas, sem rótulo — quem somava as três não fechava e não sabia por quê.
    const volume = volumeDoPeriodo([
      os({ id: 'A', status: 'Em andamento' }),
      os({ id: 'B', status: 'Encerrada' }),
      os({ id: 'C', status: 'Cancelada' }),
    ]);
    expect(volume).toEqual({ total: 3, emCurso: 1, concluidas: 1, canceladas: 1 });
    expect(volume.emCurso + volume.concluidas + volume.canceladas).toBe(volume.total);
  });
});

describe('volumePorSede — "Concluídas" deixou de incluir cancelada', () => {
  it('separa as três, porque obra cancelada não é entrega', () => {
    const porSede = volumePorSede(
      [
        os({ id: 'A', sede: 'SUL1', status: 'Em andamento' }),
        os({ id: 'B', sede: 'SUL1', status: 'Encerrada' }),
        os({ id: 'C', sede: 'SUL1', status: 'Cancelada' }),
      ],
      sede
    );
    expect(porSede[0]).toMatchObject({ name: 'SUL1', abertas: 1, concluidas: 1, canceladas: 1 });
  });
});

// ── DINHEIRO ────────────────────────────────────────────────────────────────

const contrato = (valor: string, vendor = 'Fornecedor A'): ContractRecord =>
  ({ id: 'C1', vendor, value: valor, status: 'signed' }) as ContractRecord;

const pagamento = (valor: string, status = 'pending'): PaymentRecord =>
  ({ id: 'P1', vendor: 'Fornecedor A', value: valor, status }) as PaymentRecord;

describe('valorDaOs — uma fórmula, não três', () => {
  it('o previsto prefere os lançamentos ao contrato — é o lançamento que segue o aditivo', () => {
    // ⚠️ `value` preferia o contrato e `previsto` preferia os lançamentos, em cards
    // vizinhos. Com aditivo, a mesma sede aparecia com dois números no mesmo scroll.
    const [entrada] = valorDaOs([os()], { 'OS-0001': contrato('100000') }, { 'OS-0001': [pagamento('120000')] });
    expect(entrada.previsto).toBe(120000);
    expect(entrada.contratado).toBe(100000);
  });

  it('sem lançamento, cai para o contrato', () => {
    const [entrada] = valorDaOs([os()], { 'OS-0001': contrato('100000') }, {});
    expect(entrada.previsto).toBe(100000);
  });

  it('sem contrato e sem lançamento, o previsto é null — "não informado" não é R$ 0', () => {
    const [entrada] = valorDaOs([os()], {}, {});
    expect(entrada.previsto).toBeNull();
    expect(entrada.contratado).toBeNull();
  });

  it('OS CANCELADA não entra no dinheiro — trabalho que não houve não é compromisso', () => {
    // ⚠️ Obra cancelada com contrato assinado somava valor cheio em "Compromisso
    // previsto", "Base contratada" e "Custo por sede".
    const valores = valorDaOs(
      [os({ id: 'A' }), os({ id: 'B', status: 'Cancelada' })],
      { A: contrato('1000'), B: contrato('999999') },
      {}
    );
    expect(valores).toHaveLength(1);
    expect(valores[0].ticket.id).toBe('A');
  });

  it('só o que está pago conta como pago', () => {
    const [entrada] = valorDaOs([os()], {}, { 'OS-0001': [pagamento('300', 'paid'), pagamento('700')] });
    expect(entrada.pago).toBe(300);
    expect(entrada.previsto).toBe(1000);
    expect(entrada.saldo).toBe(700);
  });
});

describe('resumoFinanceiro — o card e a soma das barras têm que fechar', () => {
  it('o saldo do total é exatamente a soma dos saldos por OS', () => {
    /**
     * ⚠️ ERA ESTE O DEFEITO. O clamp `Math.max(0, …)` era aplicado em NÍVEIS
     * diferentes — global no card, por OS no gráfico ao lado —, e bastava isso para
     * os dois discordarem. Agora as duas somas saem da mesma subtração.
     */
    const valores = valorDaOs(
      [os({ id: 'A' }), os({ id: 'B' })],
      {},
      { A: [pagamento('100', 'paid')], B: [pagamento('50'), pagamento('80', 'paid')] }
    );
    const resumo = resumoFinanceiro(valores);
    expect(resumo.saldo).toBe(valores.reduce((soma, valor) => soma + valor.saldo, 0));
    expect(resumo.pago).toBe(180);
    expect(resumo.previsto).toBe(230);
  });
});

describe('maiorObra — deixou de anunciar uma lâmpada de R$ 0 como a maior obra', () => {
  it('sem nenhum valor lançado, devolve null', () => {
    // ⚠️ A trava só olhava lista vazia. Com 40 OS e nenhuma com valor, todas
    // empatavam em zero, a primeira do sort vencia, e o card mostrava "R$ 0 —
    // Lâmpada queimada na recepção" com selo vermelho de urgência.
    expect(maiorObra(valorDaOs([os(), os({ id: 'B' })], {}, {}), sede)).toBeNull();
  });

  it('com valor, devolve a maior', () => {
    const valores = valorDaOs([os({ id: 'A' }), os({ id: 'B' })], { A: contrato('500'), B: contrato('9000') }, {});
    expect(maiorObra(valores, sede)).toMatchObject({ id: 'B', valor: 9000 });
  });
});

describe('fornecedor — "mais acionado" passou a ser por número de contratos', () => {
  it('quarenta contratos pequenos ganham de um contrato grande', () => {
    // ⚠️ O card dizia "mais acionado" e ordenava por valor.
    const tickets = [
      ...Array.from({ length: 3 }, (_, i) => os({ id: `P${i}` })),
      os({ id: 'G' }),
    ];
    const contratos: Record<string, ContractRecord> = {
      P0: contrato('1000', 'Pequeno'),
      P1: contrato('1000', 'Pequeno'),
      P2: contrato('1000', 'Pequeno'),
      G: contrato('500000', 'Grande'),
    };
    const fornecedores = porFornecedor(valorDaOs(tickets, contratos, {}), contratos);
    expect(fornecedorMaisAcionado(fornecedores)?.name).toBe('Pequeno');
  });

  it('sem contrato nenhum, não inventa um vencedor', () => {
    expect(fornecedorMaisAcionado(porFornecedor(valorDaOs([os()], {}, {}), {}))).toBeNull();
  });
});

describe('fornecedoresComSaldo — contava fornecedor sem saldo, e contava a lista cortada', () => {
  it('quem está quitado não entra na conta', () => {
    const tickets = [os({ id: 'A' }), os({ id: 'B' })];
    const contratos: Record<string, ContractRecord> = { A: contrato('100', 'Quitado'), B: contrato('100', 'Devendo') };
    const pagamentos: Record<string, PaymentRecord[]> = { A: [pagamento('100', 'paid')] };
    const resultado = fornecedoresComSaldo(porFornecedor(valorDaOs(tickets, contratos, pagamentos), contratos));
    expect(resultado.itens.map(f => f.name)).toEqual(['Devendo']);
    expect(resultado.total).toBe(1);
  });
});

describe('custoPor — declara quantas OS não têm valor lançado', () => {
  it('separa "custou zero" de "não sabemos quanto custou"', () => {
    const valores = valorDaOs([os({ id: 'A', sede: 'SUL1' }), os({ id: 'B', sede: 'SUL1' })], { A: contrato('500') }, {});
    const [grupo] = custoPor(valores, sede);
    expect(grupo).toMatchObject({ name: 'SUL1', custo: 500, osComValor: 1, osSemValor: 1 });
  });
});

describe('auxiliares', () => {
  it('media de lista vazia é null', () => {
    expect(media([])).toBeNull();
    expect(media([2, 4])).toBe(3);
  });

  it('comTeto diz o total e o que ficou de fora', () => {
    expect(comTeto([1, 2, 3], 2)).toEqual({ itens: [1, 2], total: 3, ocultos: 1 });
    expect(comTeto([1], 2)).toEqual({ itens: [1], total: 1, ocultos: 0 });
  });
});

/**
 * O VOCABULÁRIO DO FILTRO — o defeito mais grave que a auditoria achou.
 *
 * O dropdown de etapa dos Indicadores é montado com `etapaDe()` (as SEIS etapas) e o
 * filtro comparava contra `ticket.status` (os TREZE status do banco). Só "Nova OS" e
 * "Cancelada" coincidem por acaso nas duas listas — nas outras cinco opções, escolher
 * uma etapa deixava a tela inteira vazia, sem erro nenhum.
 *
 * Este teste prende a razão: os dois vocabulários NÃO são intercambiáveis.
 */
describe('as seis etapas não são os treze status', () => {
  const STATUS_DO_BANCO = [
    'Nova OS', 'Aguardando Parecer Técnico', 'Aguardando Aprovação da Solução',
    'Aguardando Orçamento', 'Aguardando Aprovação do Orçamento', 'Aguardando Anexo de Contrato',
    'Aguardando aprovação do contrato', 'Aguardando Ações Preliminares', 'Em andamento',
    'Aguardando aprovação da manutenção', 'Aguardando pagamento', 'Encerrada', 'Cancelada',
  ];

  it('comparar etapa com status cru erraria a maioria — é o que a tela fazia', () => {
    const etapas = new Set(STATUS_DO_BANCO.map(status => etapaDe(status)));
    const coincidem = [...etapas].filter(etapa => STATUS_DO_BANCO.includes(etapa));
    // Só "Nova OS" e "Cancelada" sobrevivem à comparação literal.
    expect(coincidem.sort()).toEqual(['Cancelada', 'Nova OS']);
    expect(etapas.size).toBeGreaterThan(coincidem.length);
  });

  it('todo status do banco cai numa etapa conhecida — nenhum fica órfão', () => {
    for (const status of STATUS_DO_BANCO) {
      expect(ORDEM_DAS_ETAPAS, status).toContain(etapaDe(status));
    }
  });
});

// ── OS QUATRO INDICADORES NOVOS ─────────────────────────────────────────────

describe('tempoDeResolucao — a medida que o painel não tinha', () => {
  const fechada = (aberta: number, fechadaEm: number) =>
    ({ ...os({ status: 'Encerrada' }), time: diasAtras(aberta), closedAt: diasAtras(fechadaEm) }) as never;

  it('usa mediana, não média — uma obra longa não pode descrever o resto', () => {
    // Durações de 2, 3, 4 dias e uma obra de 200: a média diria 52 dias, número
    // que não descreve OS nenhuma. A mediana diz 4 (par, média dos centrais).
    const r = tempoDeResolucao([fechada(2, 0), fechada(5, 2), fechada(6, 2), fechada(200, 0)]);
    expect(r.mediana).toBe(4);
    expect(r.maisLento).toBe(200);
    expect(r.amostra).toBe(4);
  });

  it('com quantidade par, é a média dos dois centrais', () => {
    // [2, 4] tem que dar 3, e não 4 — pegar o de cima puxa sempre para o lado
    // que faz a operação parecer pior.
    expect(tempoDeResolucao([fechada(2, 0), fechada(4, 0)]).mediana).toBe(3);
  });

  it('OS sem data de fechamento não entra na conta', () => {
    const semFecho = { ...os({ status: 'Encerrada' }), closedAt: null } as never;
    expect(tempoDeResolucao([semFecho]).amostra).toBe(0);
  });

  it('sem amostra devolve null, não zero — "não sei" não é "resolvemos na hora"', () => {
    expect(tempoDeResolucao([])).toEqual({ mediana: null, maisLento: null, amostra: 0 });
  });
});

describe('coberturaDaProximaAcao — mede se a ferramenta está sendo usada', () => {
  const comAcao = (id: string, vence: number) =>
    os({ id, nextAction: { what: 'ligar', dueAt: diasAtras(vence) } as never });

  it('separa quem tem data, quem não tem, e quem já venceu', () => {
    const r = coberturaDaProximaAcao(
      [comAcao('A', 3), comAcao('B', -5), os({ id: 'C' }), os({ id: 'D', status: 'Encerrada' })],
      agora
    );
    // A venceu há 3 dias; B vence daqui a 5; C não tem data; D está fechada.
    expect(r).toEqual({ comData: 2, semData: 1, vencidas: 1, total: 3 });
  });

  it('OS fechada não entra — cobertura é da fila', () => {
    expect(coberturaDaProximaAcao([os({ status: 'Encerrada' })], agora).total).toBe(0);
  });
});

describe('filaTravada — o painel não sabia o que a Gestão já sabia', () => {
  const bloqueio = (ticket: Ticket) =>
    ticket.id === 'A' || ticket.id === 'B' ? { motivo: 'Falta classificar o serviço' } : null;

  it('conta as travadas e agrupa por motivo', () => {
    const r = filaTravada([os({ id: 'A' }), os({ id: 'B' }), os({ id: 'C' })], bloqueio);
    expect(r.travadas).toBe(2);
    expect(r.motivos).toEqual([{ name: 'Falta classificar o serviço', total: 2 }]);
  });

  it('OS fechada não está travada, está pronta', () => {
    expect(filaTravada([os({ id: 'A', status: 'Encerrada' })], bloqueio).travadas).toBe(0);
  });
});

describe('esperaDaFila — suspensa com data não é parada', () => {
  const suspensa = (ticket: Ticket) => ticket.id === 'A';

  it('separa as duas, porque uma é falha e a outra é gestão', () => {
    const r = esperaDaFila([os({ id: 'A' }), os({ id: 'B' }), os({ id: 'C' })], suspensa, agora);
    expect(r).toEqual({ suspensas: 1, paradas: 2, total: 3 });
  });

  it('as duas somam o total da fila, sempre', () => {
    const r = esperaDaFila([os({ id: 'A' }), os({ id: 'B' })], suspensa, agora);
    expect(r.suspensas + r.paradas).toBe(r.total);
  });
});

describe('reguaDosMarcos — buraco é informação, nunca pendência', () => {
  /** Um leitor de marcos falso, para o teste não depender do formato do banco. */
  const marcos = (datas: Array<number | null>) => (_ticket: Ticket) =>
    ['VT', 'AS', 'OR', 'AP', 'EX', 'CO'].map((curto, i) => ({
      curto,
      rotulo: curto,
      data: datas[i] === null || datas[i] === undefined ? null : diasAtras(datas[i] as number),
    }));

  it('conta quantas OS têm CADA data registrada — cobertura do registro', () => {
    /**
     * ⚠️ NÃO É "% DA RÉGUA PREENCHIDA". A planilha mostra que 45% das OS pulam etapa
     * e 45% das concluídas nunca registraram início de execução: um indicador de
     * completude leria isso como atraso e cobraria um processo que não existe.
     */
    const regua = reguaDosMarcos([os({ id: 'A' })], marcos([10, null, 8, null, null, 2]));
    expect(regua.coorte).toBe(1);
    expect(regua.marcos.find(m => m.curto === 'VT')?.registradas).toBe(1);
    expect(regua.marcos.find(m => m.curto === 'AS')?.registradas).toBe(0);
    expect(regua.marcos.find(m => m.curto === 'CO')?.registradas).toBe(1);
  });

  it('etapa pulada não entra no intervalo dela — nada é inventado', () => {
    // VT existe e AS não: o par VT→AS fica sem amostra, e diz isso com `null`.
    const regua = reguaDosMarcos([os({ id: 'A' })], marcos([10, null, 8, null, null, 2]));
    const vtAs = regua.intervalos.find(i => i.de === 'VT' && i.para === 'AS');
    expect(vtAs?.medianaDias).toBeNull();
    expect(vtAs?.amostra).toBe(0);
  });

  it('mede só os pares em que as DUAS datas existem, com a amostra ao lado', () => {
    // Duas OS com OR→AP: 3 e 5 dias. Uma terceira só tem OR.
    const regua = reguaDosMarcos(
      [os({ id: 'A' }), os({ id: 'B' }), os({ id: 'C' })],
      ticket => {
        const porOs: Record<string, Array<number | null>> = {
          A: [null, null, 10, 7, null, null],
          B: [null, null, 10, 5, null, null],
          C: [null, null, 10, null, null, null],
        };
        return marcos(porOs[ticket.id])(ticket);
      }
    );
    const orAp = regua.intervalos.find(i => i.de === 'OR' && i.para === 'AP');
    expect(orAp?.amostra).toBe(2);
    expect(orAp?.medianaDias).toBe(4); // mediana de [3, 5]
  });

  it('data invertida é CONTADA, não aparada em zero', () => {
    // ⚠️ `Math.max(0, …)` faria uma data fora de ordem virar "levou zero dia" — dado
    // torto disfarçado de eficiência. Fica de fora da média e aparece no contador.
    const regua = reguaDosMarcos([os({ id: 'A' })], marcos([null, null, 5, 9, null, null]));
    const orAp = regua.intervalos.find(i => i.de === 'OR' && i.para === 'AP');
    expect(orAp?.foraDeOrdem).toBe(1);
    expect(orAp?.amostra).toBe(0);
    expect(orAp?.medianaDias).toBeNull();
  });

  it('sem OS concluída, não inventa régua nenhuma', () => {
    const regua = reguaDosMarcos([], marcos([]));
    expect(regua.coorte).toBe(0);
    expect(regua.marcos).toEqual([]);
    expect(regua.intervalos).toEqual([]);
  });
});
