/** Forma dos dados do relatório gerencial (o front computa em KpiView e envia ao
 *  endpoint /api/report-pdf, que desenha o PDF com pdfkit). */
export interface KpiReportData {
  periodoLabel: string;
  sedeLabel: string;
  regiaoLabel: string;
  geradoEm: string;
  totalOs: number;
  abertas: number;
  encerradas: number;
  canceladas: number;
  urgentesAbertas: number;
  osMaisAntigaDias: number | null;
  osPorSede: Array<{ name: string; abertas: number; fechadas: number }>;
  backlogPorEtapa: Array<{ name: string; total: number }>;
  agingBuckets: Array<{ name: string; total: number }>;
  tempoPorEtapa: Array<{ name: string; dias: number }>;
  tendenciaMensal: Array<{ name: string; abertas: number; encerradas: number }>;
  distribuicaoUrgencia: Array<{ name: string; total: number }>;
  backlogPorEquipe: Array<{ name: string; total: number }>;
}
