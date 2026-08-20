import type { Ticket } from '../../types';

/**
 * QUEM RECEBE CADA E-MAIL — a decisão mais cara do sistema, e a menos testada.
 *
 * Saiu de dentro do `ticketEmail.ts` (870 linhas, 3,7% de cobertura) porque ali
 * estas regras só eram alcançáveis disparando um envio de verdade. E-mail é a saída
 * inteira do produto: errar aqui não deixa a tela feia — manda informação de OS
 * para quem não devia, ou não manda para quem esperava.
 *
 * Sem I/O: recebe a OS e a lista de pessoas já lidas, e responde endereços.
 */

const normalizar = (valor: unknown) => String(valor ?? '').trim().toLowerCase();

/** Lista de e-mails, em caixa baixa, sem repetido e sem vazio, pronta para o cabeçalho. */
function listaDeEmails(valores: unknown): string {
  if (!Array.isArray(valores)) return '';
  return [...new Set(valores.map(normalizar).filter(Boolean))].join(', ');
}

/**
 * O endereço do solicitante, ou `null`.
 *
 * `null` e não string vazia: quem chama precisa DECIDIR o que fazer sem
 * destinatário, e string vazia atravessa um `if` como se fosse endereço.
 */
export function enderecoDoSolicitante(ticket: Pick<Ticket, 'requesterEmail'>): string | null {
  const email = String(ticket?.requesterEmail ?? '').trim();
  return email || null;
}

/** Diretores em cópia. */
export function copiaParaDiretoria(ticket: Pick<Ticket, 'directorCcEmails'>): string {
  return listaDeEmails(ticket?.directorCcEmails);
}

/** Diretores como destinatários diretos. */
export function destinoDaDiretoria(ticket: Pick<Ticket, 'directorEmails'>): string {
  return listaDeEmails(ticket?.directorEmails);
}

/**
 * A OS tem diretor envolvido?
 *
 * ⚠️ ID **OU** E-MAIL. Um diretor pode estar designado por id sem ter e-mail
 * cadastrado, e o contrário também acontece em OS antiga. Exigir os dois faria a OS
 * com diretor designado passar como se não tivesse — e o aviso à diretoria sumiria
 * exatamente onde ele foi pedido.
 */
export function temDiretorEnvolvido(ticket: Pick<Ticket, 'directorIds' | 'directorEmails'>): boolean {
  const ids = Array.isArray(ticket?.directorIds) ? ticket.directorIds.filter(Boolean) : [];
  const emails = Array.isArray(ticket?.directorEmails)
    ? ticket.directorEmails.map(normalizar).filter(Boolean)
    : [];
  return ids.length > 0 || emails.length > 0;
}

export interface PessoaDoDiretorio {
  email?: string | null;
  role?: string | null;
  status?: string | null;
  active?: boolean;
}

/**
 * A REDE DO AVISO À DIRETORIA: sem destinatário explícito, vai para TODOS os
 * diretores ativos do cadastro.
 *
 * É a decisão de maior alcance do módulo — e por isso a mais perigosa nos dois
 * sentidos. Restrita demais, a diretoria não fica sabendo do que foi pedido para
 * ela; larga demais, informação de OS chega a quem saiu da empresa.
 *
 * ⚠️ ACENTO E IDIOMA. O papel é comparado sem acento e aceitando "diretor" e
 * "director": o cadastro tem as duas grafias, vindas de épocas diferentes do
 * sistema, e uma comparação literal deixaria metade dos diretores de fora sem
 * ninguém perceber.
 *
 * ⚠️ INATIVO NÃO RECEBE, pelas DUAS marcas. `active: false` e `status: 'Inativo'`
 * convivem no cadastro, e checar só uma delas manda e-mail para quem já saiu.
 */
export function diretoresAtivos(pessoas: PessoaDoDiretorio[] = []): string[] {
  const semAcento = (valor: unknown) =>
    normalizar(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const encontrados = (Array.isArray(pessoas) ? pessoas : [])
    .filter(pessoa => {
      const papel = semAcento(pessoa?.role);
      const situacao = semAcento(pessoa?.status ?? 'Ativo');
      const ehDiretor = papel === 'diretor' || papel === 'director';
      const estaAtivo = pessoa?.active !== false && (situacao === 'ativo' || situacao === 'active');
      return ehDiretor && estaAtivo;
    })
    .map(pessoa => normalizar(pessoa?.email))
    .filter(Boolean);

  return [...new Set(encontrados)];
}
