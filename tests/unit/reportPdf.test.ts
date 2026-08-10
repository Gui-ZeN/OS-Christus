import { describe, it, expect } from 'vitest';
import { buildReportPdf } from '../../api/_lib/reportPdf.js';

/** Payload mínimo válido; cada teste troca só o recorte. */
const BASE = {
  geradoEm: '10/08/2026 10:40',
  totalOs: 17,
  abertas: 11,
  encerradas: 5,
  canceladas: 1,
  urgentesAbertas: 3,
  osMaisAntigaDias: 94,
  osPorSede: [{ name: 'PQL1', abertas: 11, fechadas: 6 }],
  backlogPorEtapa: [{ name: 'Orçamento', total: 7 }],
  agingBuckets: [{ name: '8-30d', total: 5 }],
  tempoPorEtapa: [{ name: 'Orçamento', dias: 18.7 }],
  tendenciaMensal: [{ name: 'jul', abertas: 8, encerradas: 5 }],
  distribuicaoUrgencia: [{ name: 'Alta', total: 11 }],
  backlogPorEquipe: [{ name: 'Infra - Sede', total: 9 }],
};

const ehPdf = (buf: Buffer) => buf.subarray(0, 5).toString('latin1') === '%PDF-';

describe('buildReportPdf', () => {
  it('gera PDF com o recorte de três filtros', async () => {
    const pdf = await buildReportPdf({
      ...BASE,
      filtros: [
        { label: 'Período', value: 'Últimos 30 dias' },
        { label: 'Sede', value: 'Todas' },
        { label: 'Região', value: 'Todas' },
      ],
    });
    expect(ehPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(2000);
  });

  // Sete filtros não cabem numa linha de A4: sem a quebra, o excedente saía pela
  // margem sem erro nenhum — relatório mutilado que ninguém percebe até imprimir.
  it('acomoda sete filtros sem estourar', async () => {
    const pdf = await buildReportPdf({
      ...BASE,
      filtros: [
        { label: 'Período', value: 'Últimos 30 dias' },
        { label: 'Sede', value: 'Parquelândia (PQL1)' },
        { label: 'Região', value: 'Universidade' },
        { label: 'Etapa', value: 'Aguardando aprovação do orçamento' },
        { label: 'Urgência', value: 'Alta' },
        { label: 'Equipe', value: 'Infra - Sede' },
        { label: 'Fornecedor', value: 'Construtora Exemplo Ltda ME' },
      ],
    });
    expect(ehPdf(pdf)).toBe(true);
  });

  // A aba aberta durante o deploy manda o formato antigo por alguns minutos.
  it('aceita o formato antigo (periodoLabel/sedeLabel/regiaoLabel)', async () => {
    const pdf = await buildReportPdf({
      ...BASE,
      periodoLabel: 'Últimos 30 dias',
      sedeLabel: 'Todas',
      regiaoLabel: 'Todas',
    });
    expect(ehPdf(pdf)).toBe(true);
  });

  it('sem recorte nenhum ainda produz PDF, em vez de estourar', async () => {
    const pdf = await buildReportPdf({ ...BASE, filtros: [] });
    expect(ehPdf(pdf)).toBe(true);
  });
});
