import { TICKET_STATUS } from '../constants/ticketStatus';
import type { Ticket } from '../types';

/**
 * Marco ausente tem que virar `null`, não "hoje".
 *
 * `coerceDate` existe para campos que SEMPRE têm valor e cai num fallback — aqui o
 * vazio é o dado: significa "não aconteceu" ou "o sistema não sabe". Um fallback
 * silencioso desenharia a linha do tempo cheia e mentiria, que é o defeito do
 * gráfico que lia `closureChecklist.closedAt`.
 */
function paraData(valor: unknown): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor === 'object' && typeof (valor as { toDate?: unknown }).toDate === 'function') {
    const convertido = (valor as { toDate: () => Date }).toDate();
    return Number.isNaN(convertido.getTime()) ? null : convertido;
  }
  const convertido = new Date(valor as string);
  return Number.isNaN(convertido.getTime()) ? null : convertido;
}

/**
 * A LINHA DO TEMPO DA OS — os seis marcos que a operação acompanha.
 *
 * A régua não foi inventada: é a que a coordenação usa na planilha própria
 * (`MANUTENÇÕES CHRISTUS_UNICHRISTUS - COORD. GERAL.xlsx`), com uma coluna de data
 * por marco. Ela existe há mais de dois anos e é o motivo de a planilha continuar
 * aberta — o Serv3 não respondia "o que já aconteceu nesta OS" sem varrer a conversa.
 *
 * Os rótulos são os DELES, não os nossos: "visita técnica" e não "parecer técnico".
 * Quem lê a tela precisa reconhecer a própria planilha nela.
 *
 * ⚠️ NÃO é uma esteira obrigatória. Medido na planilha: 45% das linhas pulam etapa e,
 * das 235 concluídas, 45% nunca registraram início de execução e 31% não passaram por
 * aprovação da solução. Marco vazio é informação — "não aconteceu" ou "o sistema não
 * sabe" —, nunca pendência. Qualquer tela que trate buraco como erro vai estar
 * cobrando um processo que a operação não executa.
 */
export const MARCOS_DA_OS = [
  { chave: TICKET_STATUS.WAITING_TECH_OPINION, curto: 'VT', rotulo: 'Visita técnica' },
  { chave: TICKET_STATUS.WAITING_SOLUTION_APPROVAL, curto: 'AS', rotulo: 'Aprovação da solução' },
  { chave: TICKET_STATUS.WAITING_BUDGET, curto: 'OR', rotulo: 'Orçamento' },
  { chave: TICKET_STATUS.WAITING_PRELIM_ACTIONS, curto: 'AP', rotulo: 'Ações preliminares' },
  { chave: TICKET_STATUS.IN_PROGRESS, curto: 'EX', rotulo: 'Início da execução' },
  { chave: TICKET_STATUS.CLOSED, curto: 'CO', rotulo: 'Conclusão' },
] as const;

export type MarcoDaOs = {
  chave: string;
  curto: string;
  rotulo: string;
  data: Date | null;
};

/** Os seis marcos da OS, na ordem da régua, com a data quando o sistema a conhece. */
export function lerMarcos(ticket: Pick<Ticket, 'marcos'>): MarcoDaOs[] {
  const mapa = ticket.marcos && typeof ticket.marcos === 'object' ? ticket.marcos : {};
  return MARCOS_DA_OS.map(marco => ({
    chave: marco.chave,
    curto: marco.curto,
    rotulo: marco.rotulo,
    data: paraData(mapa[marco.chave]),
  }));
}

/** Quantos marcos o sistema já conhece — o "3 de 6" que a planilha mostra como %. */
export function contarMarcos(ticket: Pick<Ticket, 'marcos'>): number {
  return lerMarcos(ticket).filter(marco => marco.data).length;
}
