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
function paraData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor.toDate === 'function') return valor.toDate();
  if (typeof valor.seconds === 'number') return new Date(valor.seconds * 1000);
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * O pulso da OS — quando ela teve PROGRESSO pela última vez.
 *
 * ⚠️ Não é `updatedAt`. Adiar uma revisão é uma alteração real e move `updatedAt`
 * (a auditoria foi explícita: esconder a escrita seria pior), mas adiar não é
 * progresso — se contasse, bastaria empurrar a OS toda semana para ela nunca mais
 * aparecer como parada. Era exatamente a maquiagem que o fechamento assistido
 * existe para acabar.
 *
 * ⚠️ E `stalledSince` sozinho também não serve, porque NINGUÉM o escreve nas 16
 * escritas de OS espalhadas pelo sistema: uma OS adiada e depois trabalhada de
 * verdade continuaria eternamente "parada há 60 dias". Este defeito nasceu na
 * primeira versão desta correção e foi pego na varredura seguinte.
 *
 * A regra que dispensa instrumentar 16 lugares: `stalledSince` só vale enquanto a
 * ÚLTIMA escrita tiver sido o próprio adiamento. Qualquer escrita posterior move
 * `updatedAt` para depois de `revisaoAdiadaEm`, e o relógio volta a ser o normal.
 */
export function ultimaAtividade(ticket) {
  const atualizada = paraData(ticket?.updatedAt);
  const adiadaEm = paraData(ticket?.revisaoAdiadaEm);
  const parada = paraData(ticket?.stalledSince);

  const ultimaEscritaFoiAdiamento =
    parada && adiadaEm && atualizada && Math.abs(atualizada.getTime() - adiadaEm.getTime()) < 1000;

  if (ultimaEscritaFoiAdiamento) return parada;
  return atualizada || paraData(ticket?.createdAt);
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
/** Quantas vezes esta OS já foi empurrada para depois. */
export function adiamentosDe(ticket) {
  const n = Number(ticket?.adiamentos);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function efeitoDaResposta(resposta, { now = new Date(), statusAnterior = null, ticketAtual = null } = {}) {
  switch (resposta) {
    case RESPOSTA.ENCERRAR:
      return {
        status: 'Encerrada',
        fechamentoAssistido: { em: now, statusAnterior },
        updatedAt: now,
      };
    case RESPOSTA.PENDENTE:
      // "Ainda pendente" é a gestora dizendo que olhou e a OS segue viva: isso É
      // progresso declarado, então o relógio da estagnação reinicia.
      // Progresso declarado: o relógio reinicia e a marca de adiamento sai, senão
      // a regra acima continuaria olhando para a base velha.
      return { updatedAt: now, stalledSince: now, revisaoAdiadaEm: null, revisaoAdiadaAte: null };
    case RESPOSTA.DEPOIS:
      return {
        // Adiar É uma alteração e mexe em `updatedAt` — esconder a escrita foi o
        // erro apontado na auditoria. O relógio da estagnação é preservado à parte:
        // guarda-se a base ANTERIOR, para o adiamento não zerar o tempo parado.
        updatedAt: now,
        stalledSince: ultimaAtividade(ticketAtual) || now,
        revisaoAdiadaAte: new Date(now.getTime() + DIAS_DE_ADIAMENTO * 86_400_000),
        revisaoAdiadaEm: now,
        // Sem o contador, adiamento repetido fica invisível — e some exatamente a
        // evidência de postergação que a revisão semanal existe para expor.
        adiamentos: (Number(adiamentosDe(ticketAtual)) || 0) + 1,
      };
    case RESPOSTA.DESFAZER:
      return { status: statusAnterior || 'Aberta', fechamentoAssistido: null, updatedAt: now, stalledSince: now, revisaoAdiadaEm: null };
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
        adiamentos: adiamentosDe(t),
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
