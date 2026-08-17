/**
 * FECHAMENTO ASSISTIDO — uma vez por semana, uma pergunta por gestora.
 *
 * "Estas 7 OS não têm atividade há 30 dias." Boa parte das mais de duzentas OS
 * abertas já está resolvida e ninguém fechou; isto derruba justamente o número que
 * incomoda a diretoria SEM resolver mais nada, e compra tempo para o desenho grande
 * ser feito com calma.
 *
 * ⚠️ NADA ENCERRA SOZINHO. Esta é a diferença entre uma limpeza e uma perda: uma
 * varredura que fecha por inatividade apagaria trabalho real que só estava mal
 * registrado, e ninguém saberia dizer o que sumiu. Aqui o sistema só PERGUNTA — e
 * a resposta tem autor.
 *
 * ⚠️ E o silêncio não decide nada. Gestora que não responde deixa as OS exatamente
 * como estavam, e elas voltam na semana seguinte.
 *
 * Sem I/O e sem relógio próprio.
 */

export const DIAS_SEM_ATIVIDADE = 30;

/** Quantas OS cabem num e-mail antes dele virar parede de texto que ninguém lê. */
export const MAXIMO_POR_EMAIL = 15;

/** Status que já são desfecho — não entram. */
const JA_FECHADAS = new Set(['Encerrada', 'Cancelada']);

/**
 * O pulso da OS. `updatedAt` cobre qualquer toque — mensagem, mudança de status,
 * anexo, cotação. Sem ele, cai para a criação: OS que nasceu e nunca foi tocada é
 * exatamente o caso que este e-mail existe para achar.
 */
export function ultimaAtividade(ticket) {
  const bruto = ticket?.updatedAt || ticket?.createdAt || null;
  if (!bruto) return null;
  const data = bruto instanceof Date ? bruto : new Date(bruto);
  return Number.isNaN(data.getTime()) ? null : data;
}

export function diasParada(ticket, now = new Date()) {
  const ultima = ultimaAtividade(ticket);
  if (!ultima) return null;
  return Math.floor((now.getTime() - ultima.getTime()) / 86_400_000);
}

/**
 * Esta OS entra na revisão?
 *
 * `adiadaAte` é o "Ver depois": enquanto a data não chega, a OS não volta a
 * incomodar. Sem isso, "ver depois" seria só um jeito de receber a mesma pergunta
 * na semana seguinte — e a gestora aprenderia a ignorar o e-mail inteiro.
 */
export function entraNaRevisao(ticket, now = new Date()) {
  if (JA_FECHADAS.has(String(ticket?.status || ''))) return false;

  const adiada = ticket?.revisaoAdiadaAte ? new Date(ticket.revisaoAdiadaAte) : null;
  if (adiada && !Number.isNaN(adiada.getTime()) && now.getTime() < adiada.getTime()) return false;

  const dias = diasParada(ticket, now);
  return dias !== null && dias >= DIAS_SEM_ATIVIDADE;
}

/**
 * As três respostas. Nenhuma delas é destrutiva sem autor: `encerrar` grava quem
 * encerrou e a partir de onde, e é isso que permite desfazer depois.
 */
export const RESPOSTA = {
  ENCERRAR: 'encerrar',
  PENDENTE: 'ainda-pendente',
  DEPOIS: 'ver-depois',
  DESFAZER: 'desfazer',
};

export const DIAS_DE_ADIAMENTO = 30;

/**
 * O que cada resposta faz com a OS.
 *
 * "Ainda pendente" NÃO é no-op: ela conta como atividade, e é o que tira a OS da
 * lista da semana que vem. Sem isso a gestora responderia a mesma pergunta para
 * sempre, que é como um e-mail semanal morre.
 */
export function efeitoDaResposta(resposta, { now = new Date(), statusAnterior = null } = {}) {
  switch (resposta) {
    case RESPOSTA.ENCERRAR:
      return {
        status: 'Encerrada',
        fechamentoAssistido: { em: now, statusAnterior },
        updatedAt: now,
      };
    case RESPOSTA.PENDENTE:
      return { updatedAt: now, revisaoAdiadaAte: null };
    case RESPOSTA.DEPOIS:
      return {
        revisaoAdiadaAte: new Date(now.getTime() + DIAS_DE_ADIAMENTO * 86_400_000),
        // Não mexe em `updatedAt`: adiar a pergunta não é atividade na OS, e fingir
        // que é apagaria o tempo parado, que é o número que se quer enxergar.
      };
    case RESPOSTA.DESFAZER:
      return { status: statusAnterior || 'Aberta', fechamentoAssistido: null, updatedAt: now };
    default:
      return null;
  }
}

/**
 * Desfazer só vale para o que ESTE fluxo encerrou, e só dentro da janela.
 *
 * Sem o primeiro limite, o link viraria um jeito de reabrir qualquer OS encerrada
 * por qualquer motivo. Sem o segundo, um e-mail antigo reabriria OS meses depois.
 */
export const DIAS_PARA_DESFAZER = 7;

export function podeDesfazer(ticket, now = new Date()) {
  const marca = ticket?.fechamentoAssistido;
  if (!marca?.em) return false;
  const em = marca.em instanceof Date ? marca.em : new Date(marca.em);
  if (Number.isNaN(em.getTime())) return false;
  return now.getTime() - em.getTime() <= DIAS_PARA_DESFAZER * 86_400_000;
}

/**
 * Agrupa as OS paradas por gestora.
 *
 * `podeVer` entra por parâmetro para reusar a MESMA regra de escopo do resto do
 * sistema — uma segunda regra de território aqui seria a maneira mais rápida de
 * uma gestora receber e encerrar OS de outra região.
 */
export function montarRevisaoSemanal({ tickets = [], gestoras = [], podeVer, now = new Date() }) {
  const paradas = tickets.filter(t => entraNaRevisao(t, now));

  const lotes = [];
  for (const gestora of gestoras) {
    if (String(gestora?.status || 'Ativo') !== 'Ativo') continue;
    if (!String(gestora?.email || '').trim()) continue;

    const minhas = paradas
      .filter(t => podeVer(gestora, t))
      .map(t => ({
        id: t.id,
        assunto: String(t.subject || ''),
        sede: String(t.sede || ''),
        status: String(t.status || ''),
        dias: diasParada(t, now),
      }))
      .sort((a, b) => (b.dias || 0) - (a.dias || 0));

    if (minhas.length === 0) continue;

    lotes.push({
      gestora,
      total: minhas.length,
      ordens: minhas.slice(0, MAXIMO_POR_EMAIL),
      // O que não coube não é escondido: o e-mail diz quantas ficaram de fora.
      excedente: Math.max(0, minhas.length - MAXIMO_POR_EMAIL),
    });
  }

  return { paradas: paradas.length, lotes };
}
