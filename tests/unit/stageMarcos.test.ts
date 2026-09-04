import { describe, expect, it } from 'vitest';
import { MARCOS_EM_ORDEM, addStageMarco, aplicarMarcosSemData } from '../../api/_lib/statusFlow.js';
import { MARCOS_DA_OS } from '../../src/utils/marcos';

/**
 * O MAPA DE MARCOS — a linha do tempo que o Serv3 descartava.
 *
 * `stageEnteredAt` é um carimbo só, sobrescrito a cada transição. Medido na produção
 * em 13/08/2026: o sistema reconstruía do histórico a visita técnica em 97% das OS e
 * a conclusão em 36%, mas as quatro etapas do meio em 1-3% — enquanto a planilha que
 * a coordenação mantém tem 226 aprovações de solução, 177 orçamentos e 141 ações
 * preliminares datadas. Não era falta de digitação: o sistema jogava fora.
 */
describe('addStageMarco', () => {
  const t1 = new Date('2026-08-01T10:00:00Z');
  const t2 = new Date('2026-08-05T10:00:00Z');

  it('grava o marco quando a etapa é nova para a OS', () => {
    expect(addStageMarco({}, 'Aguardando Orçamento', t1)).toEqual({ 'Aguardando Orçamento': t1 });
  });

  it('acrescenta sem derrubar os marcos anteriores', () => {
    const atual = { 'Nova OS': t1 };
    expect(addStageMarco(atual, 'Aguardando Parecer Técnico', t2)).toEqual({
      'Nova OS': t1,
      'Aguardando Parecer Técnico': t2,
    });
  });

  it('NÃO sobrescreve: reabrir e voltar à etapa preserva a data original', () => {
    // Encerrar por engano e reabrir é comum aqui — o fluxo permite de propósito.
    // Se a reentrada sobrescrevesse, a OS reaberta perderia a própria linha do tempo,
    // e o "início da execução" passaria a ser o do retrabalho.
    const atual = { 'Em andamento': t1 };
    expect(addStageMarco(atual, 'Em andamento', t2)).toBeNull();
  });

  it('devolve null quando não há o que acrescentar (não reescreve o mapa à toa)', () => {
    expect(addStageMarco({ Encerrada: t1 }, 'Encerrada', t2)).toBeNull();
  });

  it('ignora entrada inválida em vez de gravar lixo na linha do tempo', () => {
    expect(addStageMarco({}, '', t1)).toBeNull();
    expect(addStageMarco({}, 'Encerrada', null)).toBeNull();
    expect(addStageMarco({}, 'Encerrada', undefined)).toBeNull();
  });

  it('sobrevive a um documento antigo sem o campo, ou com o campo corrompido', () => {
    // 181 OS em produção nasceram antes deste mapa existir.
    expect(addStageMarco(undefined, 'Encerrada', t1)).toEqual({ Encerrada: t1 });
    expect(addStageMarco(null, 'Encerrada', t1)).toEqual({ Encerrada: t1 });
    // Array não é mapa: trata como vazio em vez de espalhar índices numéricos.
    expect(addStageMarco([t1] as unknown as Record<string, Date>, 'Encerrada', t1)).toEqual({
      Encerrada: t1,
    });
  });
});

/**
 * OS MARCOS QUE ACONTECERAM SEM DATA.
 *
 * A decisão é do dono do produto (03/09/2026): *"a pessoa já fez isso tudo, só não tem
 * a data"*. O dado sustenta — a planilha da coordenação registra 226 aprovações de
 * solução e 177 orçamentos, contra 4 datas de cada dentro do Serv3 em 220 OS. Medido
 * em produção no mesmo dia: 100 das 220 tinham exatamente quatro marcos ultrapassados
 * sem carimbo, e uma OS encerrada aparecia como "2 de 6".
 */
describe('aplicarMarcosSemData', () => {
  const t1 = new Date('2026-08-01T10:00:00Z');
  const VT = 'Aguardando Parecer Técnico';
  const AS = 'Aguardando Aprovação da Solução';
  const OR = 'Aguardando Orçamento';
  const AP = 'Aguardando Ações Preliminares';
  const EX = 'Em andamento';
  const CO = 'Encerrada';

  it('a espinha do pedido: pular de análise para execução marca o meio', () => {
    expect(aplicarMarcosSemData({ [VT]: t1, [EX]: t1 }, [], EX)).toEqual([AS, OR, AP]);
  });

  it('devolve na ordem da régua, não na ordem em que foram descobertos', () => {
    expect(aplicarMarcosSemData({}, [AP], CO)).toEqual([VT, AS, OR, AP, EX, CO]);
  });

  it('marco com data NÃO entra — a data manda', () => {
    // O carimbo da etapa de destino já veio do `addStageMarco`, como no chamador real.
    const semData = aplicarMarcosSemData({ [VT]: t1, [OR]: t1, [EX]: t1 }, [], EX);
    expect(semData).not.toContain(VT);
    expect(semData).not.toContain(OR);
    expect(semData).toEqual([AS, AP]);
  });

  it('marco que GANHOU data sai da lista — deixa de dizer "não sei quando"', () => {
    // A OS tinha o orçamento como "aconteceu, sem data". Depois alguém de fato moveu
    // a OS para a etapa de orçamento e o carimbo nasceu. A ressalva tem que sumir.
    expect(aplicarMarcosSemData({ [OR]: t1, [EX]: t1 }, [AS, OR, AP], EX)).toEqual([VT, AS, AP]);
  });

  it('a própria etapa de destino conta como alcançada', () => {
    // Ela chega carimbada na chamada real, então cai fora pela regra da data. Mas se
    // o carimbo faltar — documento antigo, transição fora do caminho normal —, ela
    // entra como "aconteceu, sem data": a OS ESTÁ ali, negar isso seria pior.
    expect(aplicarMarcosSemData({ [VT]: t1 }, [], EX)).toEqual([AS, OR, AP, EX]);
  });

  it('devolve null quando nada muda — não reescreve o campo a cada transição', () => {
    expect(aplicarMarcosSemData({ [VT]: t1, [EX]: t1 }, [AS, OR, AP], EX)).toBeNull();
  });

  it('as etapas que não são marco também posicionam a OS', () => {
    // Quem está em "Aguardando pagamento" já passou do início da execução, mesmo sem
    // nunca ter parado em "Em andamento". Sem isto, quem pula para o pagamento não
    // marcaria a execução — e é justamente essa OS que precisa.
    expect(aplicarMarcosSemData({}, [], 'Aguardando pagamento')).toEqual([VT, AS, OR, AP, EX]);
    expect(aplicarMarcosSemData({}, [], 'Aguardando Aprovação do Orçamento')).toEqual([VT, AS, OR]);
  });

  it('Nova OS não marca nada — ela não passou por lugar nenhum', () => {
    expect(aplicarMarcosSemData({}, [], 'Nova OS')).toBeNull();
  });

  it('CANCELADA não avança a régua: a OS parou, não passou', () => {
    expect(aplicarMarcosSemData({}, [], 'Cancelada')).toBeNull();
    // Mas o que já estava marcado continua — cancelar não apaga o que houve.
    expect(aplicarMarcosSemData({}, [VT, AS], 'Cancelada')).toBeNull();
  });

  it('sobrevive a documento antigo sem os campos', () => {
    expect(aplicarMarcosSemData(undefined, undefined, EX)).toEqual([VT, AS, OR, AP, EX]);
    expect(aplicarMarcosSemData(null, null, 'status que não existe')).toBeNull();
  });
});

/**
 * O servidor ESCREVE a régua e a tela DESENHA — cada lado tem a sua lista. Duas listas
 * que precisam concordar são uma divergência esperando acontecer; este teste é o que
 * impede que ela aconteça em silêncio.
 */
describe('as duas cópias da régua', () => {
  it('servidor e tela listam os mesmos seis marcos, na mesma ordem', () => {
    expect(MARCOS_EM_ORDEM).toEqual(MARCOS_DA_OS.map(m => m.chave));
  });
});
