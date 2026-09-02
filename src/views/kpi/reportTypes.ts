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
  /**
   * ⚠️ "Encerradas" DEIXOU DE INCLUIR CANCELADA. A série somava as duas e a legenda
   * dizia "Encerradas" — obra cancelada aparecia como entrega no relatório impresso,
   * que é o que sai da empresa.
   */
  osPorSede: Array<{ name: string; abertas: number; concluidas: number; canceladas: number }>;
  backlogPorEtapa: Array<{ name: string; total: number }>;
  agingBuckets: Array<{ name: string; total: number }>;
  /**
   * Espera média na etapa ATUAL, e quantas OS formam a média.
   *
   * ⚠️ `dias` é `null` quando não há OS na etapa. Antes vinha `0`, e "0 dias" numa
   * coluna chamada "Dias méd." se lê como "resolvemos na hora", não como "não temos
   * dado". `osNaEtapa` acompanha para o relatório poder dizer de quantas OS a média
   * saiu — média de uma OS só não é média.
   */
  tempoPorEtapa: Array<{ name: string; dias: number | null; osNaEtapa: number }>;
  tendenciaMensal: Array<{ name: string; abertas: number; encerradas: number }>;
  distribuicaoUrgencia: Array<{ name: string; total: number }>;
  backlogPorEquipe: Array<{ name: string; total: number }>;
}
