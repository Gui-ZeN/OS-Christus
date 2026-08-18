import { describe, expect, it } from 'vitest';
import { ETAPA, ORDEM_DAS_ETAPAS, etapaConhecida, etapaDe, etapaEmAberto, statusCanonicoDaEtapa } from '../../api/_lib/etapas.js';
import { TICKET_STATUS } from '../../src/constants/ticketStatus';

describe('as treze do banco viram seis na tela', () => {
  it('todo status que existe hoje tem etapa', () => {
    // Se algum ficar de fora, ele apareceria cru na tela — e é isso que este teste
    // impede de passar despercebido quando alguém acrescentar um status novo.
    for (const status of Object.values(TICKET_STATUS)) {
      expect(etapaConhecida(status), status).toBe(true);
    }
  });

  it('as seis (mais Cancelada) são o vocabulário inteiro', () => {
    const alcancadas = new Set(Object.values(TICKET_STATUS).map(etapaDe));
    expect([...alcancadas].sort()).toEqual([...new Set(ORDEM_DAS_ETAPAS)].sort());
    expect(ORDEM_DAS_ETAPAS).toHaveLength(7); // 6 de trabalho + Cancelada
  });

  it('agrupa os dois passos de análise, orçamento e contratação', () => {
    expect(etapaDe('Aguardando Parecer Técnico')).toBe(ETAPA.ANALISE);
    expect(etapaDe('Aguardando Aprovação da Solução')).toBe(ETAPA.ANALISE);
    expect(etapaDe('Aguardando Orçamento')).toBe(ETAPA.ORCAMENTO);
    expect(etapaDe('Aguardando Aprovação do Orçamento')).toBe(ETAPA.ORCAMENTO);
    expect(etapaDe('Aguardando Anexo de Contrato')).toBe(ETAPA.CONTRATACAO);
    expect(etapaDe('Aguardando Ações Preliminares')).toBe(ETAPA.CONTRATACAO);
  });

  it('"Encerrada" passou a se chamar "Concluída"', () => {
    expect(etapaDe('Encerrada')).toBe(ETAPA.CONCLUIDA);
    expect(ETAPA.CONCLUIDA).toBe('Concluída');
  });
});

describe('o pagamento NÃO encerra a OS', () => {
  it('"Aguardando pagamento" cai em execução, não em concluída', () => {
    // Mapear pagamento para Concluída encerraria as OS que só esperam dinheiro:
    // elas sairiam da agenda e ganhariam `closedAt` com o pagamento pendente.
    // O serviço acabou; a OS, não. O dinheiro tem tela própria.
    expect(etapaDe('Aguardando pagamento')).toBe(ETAPA.EXECUCAO);
    expect(etapaEmAberto('Aguardando pagamento')).toBe(true);
  });
});

describe('o que a tradução não conhece continua visível', () => {
  it('status desconhecido devolve o próprio texto', () => {
    // Some da tela é pior que aparecer estranho: um valor que ninguém mapeou
    // precisa ser notado, não virar "Em análise" por engano.
    expect(etapaDe('Aguardando Coisa Que Não Existe')).toBe('Aguardando Coisa Que Não Existe');
    expect(etapaConhecida('Aguardando Coisa Que Não Existe')).toBe(false);
  });

  it('vazio continua vazio', () => {
    expect(etapaDe('')).toBe('');
    expect(etapaDe(null)).toBe('');
  });

  it('não se perde por acento nem por caixa', () => {
    expect(etapaDe('aguardando parecer tecnico')).toBe(ETAPA.ANALISE);
    expect(etapaDe('ENCERRADA')).toBe(ETAPA.CONCLUIDA);
  });
});

describe('a leitura de "ainda exige trabalho" não muda de sentido', () => {
  it('concluída e cancelada estão fora; o resto está dentro', () => {
    expect(etapaEmAberto('Encerrada')).toBe(false);
    expect(etapaEmAberto('Cancelada')).toBe(false);
    expect(etapaEmAberto('Nova OS')).toBe(true);
    expect(etapaEmAberto('Em andamento')).toBe(true);
  });
});

describe('escolher uma etapa grava sempre o MESMO status', () => {
  it('cada etapa tem um status canônico', () => {
    // Sem isto, duas pessoas escolhendo "Em análise" produziriam status diferentes
    // e o histórico ficaria impossível de ler.
    for (const etapa of ORDEM_DAS_ETAPAS) {
      expect(statusCanonicoDaEtapa(etapa), etapa).toBeTruthy();
    }
  });

  it('o canônico volta para a mesma etapa — ida e volta fecha', () => {
    for (const etapa of ORDEM_DAS_ETAPAS) {
      expect(etapaDe(statusCanonicoDaEtapa(etapa)!), etapa).toBe(etapa);
    }
  });

  it('"Concluída" grava "Encerrada" enquanto a migração não acontece', () => {
    expect(statusCanonicoDaEtapa('Concluída')).toBe('Encerrada');
  });

  it('etapa desconhecida devolve null — palpite gravado é pior que recusa', () => {
    expect(statusCanonicoDaEtapa('Etapa Inventada')).toBeNull();
  });
});
