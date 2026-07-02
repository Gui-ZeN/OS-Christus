import { requireAuthenticatedUser } from './_lib/authz.js';
import { HttpError, readJsonBody, sendError } from './_lib/http.js';
import { buildReportPdf } from './_lib/reportPdf.js';

/**
 * Gera o Relatório Gerencial de OS em PDF no servidor (pdfkit) — impecável pra
 * diretoria, sem barra do navegador. Recebe do front os números já computados
 * (ver KpiView.reportData) e devolve o PDF pra download. Autenticado.
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'Método não permitido.');
    }
    await requireAuthenticatedUser(req);

    const body = await readJsonBody(req);
    const data = body?.data;
    if (!data || typeof data !== 'object') {
      throw new HttpError(400, 'Dados do relatório ausentes.');
    }

    const pdf = await buildReportPdf(data);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-gerencial-os.pdf"');
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  } catch (error) {
    if (res.headersSent) {
      res.end();
      return;
    }
    sendError(res, error);
  }
}
