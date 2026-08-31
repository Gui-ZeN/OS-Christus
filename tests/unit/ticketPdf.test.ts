import { describe, expect, it } from 'vitest';
import {
  MARCOS_DA_OS as MARCOS_BACK,
  MOTIVO_DA_PARADA,
  buildTicketPdf,
  montarEstadoDaOs,
} from '../../api/_lib/ticketPdf.js';
import { SUSPENSION_REASON_LABEL } from '../../src/constants/agenda';
import { MARCOS_DA_OS as MARCOS_FRONT } from '../../src/utils/marcos';
import { ehPdf, textoDoPdf } from '../pdfTexto';

const AGORA = new Date('2026-08-31T15:00:00Z');

/** Uma OS com tudo o que o documento sabe desenhar — e com o que ele não pode. */
const OS = {
  id: 'OS-0123',
  subject: 'Infiltracao no teto da recepcao',
  requester: 'Maria Solicitante',
  requesterEmail: 'maria.solicitante@px.com.br',
  time: new Date('2026-07-01T13:00:00Z'),
  status: 'Aguardando Orçamento',
  stageEnteredAt: new Date('2026-08-20T13:00:00Z'),
  type: 'Manutencao Predial Estrutural',
  region: 'Universidade',
  sede: 'PQL3',
  sector: 'Recepcao',
  location: 'Bloco B',
  macroServiceName: 'Estrutura Civil',
  serviceCatalogName: 'Reforma',
  assignedTeam: 'Infra - Sede',
  priority: 'Alta',
  responsible: { email: 'gestor@px.com.br', name: 'Gestor Fulano' },
  marcos: {
    'Aguardando Parecer Técnico': new Date('2026-07-02T13:00:00Z'),
    'Aguardando Orçamento': new Date('2026-08-20T13:00:00Z'),
  },
  nextAction: { what: 'Cobrar a terceira cotacao', dueAt: new Date('2026-09-03T13:00:00Z'), ownerName: 'Gestor Fulano' },
  executionProgress: { paymentFlowParts: 1, currentPercent: 40, releasedPercent: 90 },
  attachments: [
    {
      id: 'a1',
      name: 'foto-do-teto.jpg',
      path: 'attachments/tickets/images/a1.jpg',
      url: 'https://storage.googleapis.com/serv3-attachments/a1.jpg?X-Goog-Signature=abc',
      uploadedAt: new Date('2026-07-02T13:00:00Z'),
    },
  ],
  history: [
    { id: 'h1', type: 'customer', sender: 'Maria Solicitante', time: new Date('2026-07-01T13:00:00Z'), text: 'O teto esta pingando na recepcao.' },
    {
      id: 'h2',
      type: 'internal',
      sender: 'Gestor Fulano',
      time: new Date('2026-07-05T13:00:00Z'),
      text: 'NOTA RESERVADA: negociar por baixo com o fornecedor.',
      visibility: 'internal',
    },
    { id: 'h3', type: 'tech', sender: 'Gestor Fulano', time: new Date('2026-08-19T13:00:00Z'), text: 'Cotacao recebida no valor de R$ 4.500,00.' },
    { id: 'h4', type: 'system', sender: 'Sistema', time: new Date('2026-08-20T13:00:00Z'), text: 'Status atualizado de "Nova OS" para "Aguardando Orcamento".' },
  ],
};

const estado = () => montarEstadoDaOs(OS, { agora: AGORA, geradoPor: 'Gestor Fulano (Gestor)' });

describe('marcos — servidor e tela em sincronia', () => {
  /**
   * O mapa `ticket.marcos` é gravado pelo SERVIDOR e lido pela tela; o PDF precisa
   * dos mesmos seis rótulos. Front e back são deploys separados, então a lista vive
   * nos dois lados — como o enum de status. Este teste é a fonte única na prática:
   * renomear um marco de um lado só faz o papel discordar da tela em silêncio.
   */
  it('os seis marcos têm as mesmas chaves e os mesmos rótulos', () => {
    expect(MARCOS_BACK.map((m: { chave: string; rotulo: string }) => [m.chave, m.rotulo])).toEqual(
      MARCOS_FRONT.map(m => [m.chave, m.rotulo])
    );
  });

  /** Mesmo motivo: o papel tem que chamar a parada pelo nome que a tela usa. */
  it('os motivos de parada têm o mesmo texto da tela', () => {
    expect(MOTIVO_DA_PARADA).toEqual(SUSPENSION_REASON_LABEL);
  });
});

describe('montarEstadoDaOs — o corte de visibilidade', () => {
  it('a nota interna não entra, e o que ficou de fora é contado', () => {
    const data = estado();
    const textos = data.conversa.map(entrada => entrada.texto);
    expect(textos).toEqual([
      'O teto esta pingando na recepcao.',
      'Status atualizado de "Nova OS" para "Aguardando Orcamento".',
    ]);
    // A nota interna e a cotação com valor — duas entradas cortadas, duas contadas.
    expect(data.conversaOmitida).toBe(2);
  });

  it('o percentual FÍSICO da execução entra; o financeiro liberado, não', () => {
    const execucao = estado().registros.find(r => r.titulo === 'Execução');
    expect(execucao?.itens.map(i => i.value)).toContain('40%');
    expect(JSON.stringify(execucao)).not.toContain('90');
  });

  it('anexo entra como nome e data, nunca como URL assinada (que expira)', () => {
    const data = estado();
    expect(data.anexos).toEqual([{ nome: 'foto-do-teto.jpg', quando: '02/07/2026' }]);
    expect(JSON.stringify(data.anexos)).not.toContain('X-Goog-Signature');
  });

  it('sem próxima ação, o documento CONSTATA em vez de cobrar', () => {
    const semAcao = montarEstadoDaOs({ ...OS, nextAction: null }, { agora: AGORA });
    const proxima = semAcao.registros.find(r => r.titulo === 'Próxima ação');
    expect(proxima?.nota).toBe('Nenhuma próxima ação registrada nesta OS.');
  });

  it('marco sem data vira traço, e não some da régua', () => {
    const data = estado();
    expect(data.marcos).toHaveLength(6);
    expect(data.marcosComData).toBe(2);
    expect(data.marcos.find(m => m.rotulo === 'Conclusão')?.data).toBe('—');
  });
});

describe('buildTicketPdf — o arquivo, aberto', () => {
  it('o PDF mostra a identificação, a etapa e o responsável', async () => {
    const pdf = await buildTicketPdf(estado());
    expect(ehPdf(pdf)).toBe(true);
    const texto = textoDoPdf(pdf);

    expect(texto).toContain('OS-0123');
    expect(texto).toContain('Infiltracao no teto da recepcao');
    expect(texto).toContain('Em orçamento');
    expect(texto).toContain('Gestor Fulano');
    expect(texto).toContain('PQL3');
    expect(texto).toContain('Estrutura Civil');
    expect(texto).toContain('Visita técnica');
    expect(texto).toContain('foto-do-teto.jpg');
  });

  /**
   * A PROVA DO CORTE — e o motivo de este teste abrir o arquivo em vez de conferir
   * o tamanho: um PDF com nota interna dentro tem exatamente a mesma cara de um sem.
   */
  it('a nota interna e o valor da cotação NÃO estão no arquivo', async () => {
    const texto = textoDoPdf(await buildTicketPdf(estado()));
    expect(texto).not.toContain('NOTA RESERVADA');
    expect(texto).not.toContain('R$ 4.500,00');
    expect(texto).not.toContain('X-Goog-Signature');
    // E o leitor sabe que houve corte: omissão calada se lê como ausência.
    expect(texto).toContain('não entram neste documento');
  });

  it('OS quase vazia ainda vira documento, em vez de estourar', async () => {
    const pdf = await buildTicketPdf(montarEstadoDaOs({ id: 'OS-0001', status: 'Nova OS' }, { agora: AGORA }));
    expect(ehPdf(pdf)).toBe(true);
    expect(textoDoPdf(pdf)).toContain('OS-0001');
  });
});
