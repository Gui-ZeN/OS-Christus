import { normalizeKey, resolveTicketSiteIds } from './ticketAccess.js';

/**
 * A SEDE DE UMA VISITA — derivada das OS, nunca aceita do cliente.
 *
 * Uma visita atende várias OS, e o sistema inteiro assume que são da MESMA sede:
 * o fornecedor faz uma viagem. Essa invariante existia só em comentário. O POST
 * aceitava `ticketIds`, `sede` e `siteId` vindos do navegador, sem conferir nada,
 * e autorizava se QUALQUER uma das OS fosse acessível.
 *
 * Duas consequências, e a segunda é a séria:
 *
 * 1. Um compromisso com OS de sedes diferentes aparece nos DOIS filtros de sede do
 *    painel, levando as mesmas cobranças para os dois — o indicador conta o mesmo
 *    trabalho duas vezes e nenhum dos dois números está certo.
 *
 * 2. Quem tem acesso só a PE cria uma visita misturando uma OS de PE com uma de DL
 *    e passa a ler e alterar o compromisso inteiro, incluindo o que é da outra
 *    sede. A regra "basta uma acessível" existe para LER visita legítima; virava
 *    porta de entrada quando quem monta a lista é o mesmo que quer o acesso.
 *
 * A `sede` textual também sai daqui, e não do corpo da requisição: ela vai no
 * assunto do e-mail que a sede recebe, e um valor digitado pelo cliente mandaria a
 * pessoa procurar uma visita numa sede onde ela não existe.
 *
 * Sem I/O — recebe as OS já lidas e o catálogo.
 */
export function sedeDaVisita(tickets, sites = []) {
  const lista = Array.isArray(tickets) ? tickets.filter(Boolean) : [];
  if (lista.length === 0) return { ok: false, erro: 'Nenhuma das OS informadas existe.' };

  const porSede = new Map();
  for (const ticket of lista) {
    /**
     * A CHAVE inclui a OS sem sede resolvida, como `sem-sede`. Agrupar essas todas
     * numa só e deixar passar significaria criar visita de sede desconhecida sempre
     * que o catálogo não reconhecesse o valor — e o defeito voltaria calado.
     */
    const ids = resolveTicketSiteIds(ticket, sites);
    const chave = ids.length > 0 ? ids.slice().sort().join('|') : `sem-sede:${normalizeKey(ticket?.sede) || '?'}`;
    if (!porSede.has(chave)) porSede.set(chave, { siteIds: ids, tickets: [] });
    porSede.get(chave).tickets.push(ticket);
  }

  if (porSede.size > 1) {
    const nomes = [...porSede.values()]
      .map(g => rotuloDaSede(g, sites))
      .filter(Boolean)
      .join(', ');
    return {
      ok: false,
      erro: `Uma visita é uma viagem só: todas as OS precisam ser da mesma sede (vieram de ${nomes}).`,
    };
  }

  const [grupo] = [...porSede.values()];
  const siteId = grupo.siteIds[0] || null;
  const site = siteId ? sites.find(s => s.id === siteId) : null;

  return {
    ok: true,
    siteId,
    // O rótulo que a sede reconhece — código quando existe, nome quando não.
    sede: site ? site.code || site.name || null : primeiraSedeTextual(grupo.tickets),
  };
}

function primeiraSedeTextual(tickets) {
  for (const ticket of tickets) {
    const valor = String(ticket?.sede || '').trim();
    if (valor) return valor;
  }
  return null;
}

function rotuloDaSede(grupo, sites) {
  const id = grupo.siteIds[0];
  if (id) {
    const site = sites.find(s => s.id === id);
    if (site) return site.code || site.name || id;
    return id;
  }
  return primeiraSedeTextual(grupo.tickets) || 'sede não identificada';
}
