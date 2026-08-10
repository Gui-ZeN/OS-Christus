/** Forma dos dados do relatório gerencial (o front computa em KpiView e envia ao
 *  endpoint /api/report-pdf, que desenha o PDF com pdfkit). */
export interface KpiReportData {
  /**
   * O recorte que gerou estes números, na ordem em que deve ser lido.
   *
   * É uma lista, e não três campos fixos, porque relatório filtrado que não diz
   * que está filtrado é o pior tipo de relatório: 12 OS numa folha com o timbre
   * do grupo passa por "a empresa inteira tem 12 OS". Todo filtro aplicado
   * aparece aqui, e o PDF imprime todos.
   */
  filtros: Array<{ label: string; value: string }>;
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
