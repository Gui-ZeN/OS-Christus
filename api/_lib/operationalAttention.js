import { toDateOrNull } from './dates.js';
import { effectiveCommitmentState, COMMITMENT_STATE } from './commitments.js';

/**
 * ATENÇÃO OPERACIONAL — o sistema propõe; a pessoa corrige.
 *
 * Substitui a "regra única" original, em que alguém tinha de DIGITAR a próxima ação de
 * cada OS. Os números diziam que aquilo não ia sobreviver: 58% do histórico é conversa,
 * o campo `location` diz "E-mail" em 214 das 270 OS, e 163 OS estão paradas na mesma
 * etapa há meses. As pessoas mantêm conversas, não cadastros. Uma obrigação universal
 * de escrever produziria ações genéricas ("acompanhar"), datas vencidas que ninguém
 * atualiza, e uma tela que vira painel de culpa.
 *
 * O princípio continua: **toda OS ativa precisa ter uma data de nova atenção**. O que
 * mudou é quem preenche.
 *
 * Isto é uma PROJEÇÃO DETERMINÍSTICA de eventos estruturados — não uma interpretação
 * do histórico. Toda atenção sabe dizer por que apareceu (`sourceId`), e nada aqui
 * depende de adivinhar intenção em texto livre.
 */

export const ATTENTION_KIND = {
  /** Chegou mensagem de gente e ninguém respondeu ainda. */
  REVIEW_MESSAGE: 'revisar-mensagem',
  /** Alguém registrou que está esperando retorno, e o prazo passou. */
  AWAITING_REPLY: 'retorno-pendente',
  /** Fornecedor prometeu vir. */
  CHECK_VISIT: 'verificar-comparecimento',
  /** A suspensão venceu. */
  REVIEW_SUSPENSION: 'reavaliar-suspensao',
  /** Parada, sem ninguém respondendo por ela. */
  SET_OWNER: 'definir-responsavel',
  /** Tem responsável, e mesmo assim não andou. */
  NO_PROGRESS: 'sem-progresso',
};

/**
 * Versão das regras. Gravada junto da atenção para permitir reprocessar só o que foi
 * calculado por uma versão antiga, em vez de recalcular tudo às cegas.
 */
export const ATTENTION_RULE_VERSION = 2;

/**
 * Dias úteis entre registrar que se espera retorno e a OS voltar a aparecer.
 *
 * O sistema NÃO cobra ninguém: ele guarda a data que a pessoa registrou e devolve a
 * OS para a vista dela depois. Quem liga, escreve ou cobra é gente — o Serv3 lembra.
 */
export const AWAITING_REPLY_BUSINESS_DAYS = 3;

/**
 * Dias CORRIDOS parada até virar cobrança de responsável.
 *
 * Corridos, não úteis: uma semana parada é uma semana parada, e a pessoa que abriu
 * não conta em dias úteis. Sete dias porque é o ciclo em que a operação já se
 * organiza (a revisão de fila do processo é semanal) — abaixo disso a regra brigaria
 * com trabalho normal em andamento.
 */
export const IDLE_WITHOUT_OWNER_DAYS = 7;

/**
 * Dias corridos SEM PROGRESSO depois de alguém assumir a OS.
 *
 * Constante separada, embora hoje valha o mesmo, porque mede outra coisa: a de cima
 * é "ninguém pegou", esta é "alguém pegou e não andou". A segunda é a que impede o
 * campo de responsável de virar teatro — atribuir em lote silenciaria o alerta sem
 * mover nenhuma OS, e o sistema passaria a tratar o rótulo como solução.
 *
 * Elas vão divergir quando houver medida: a régua de quem assumiu pode ser mais
 * curta que a de quem foi ignorado.
 */
export const IDLE_WITH_OWNER_DAYS = 7;

const FIM_DE_SEMANA = new Set([0, 6]);

/**
 * Próximo dia útil às 9h, no fuso da operação.
 *
 * ⚠️ NÃO conhece feriado — então isto é "de segunda a sexta", não "dia útil" no
 * sentido pleno. A distinção importa: numa segunda de feriado a atenção aparece para
 * uma equipe que não está lá. Uma lista anual (nacional + CE + Fortaleza) resolve, e
 * é dívida assumida, não descuido: inventar feriado errado é pior que cair num.
 */
export function nextBusinessDay(from, dias = 1, hora = 9) {
  const base = toDateOrNull(from) || new Date();
  // A operação inteira vive em America/Fortaleza (UTC-3, sem horário de verão).
  const d = new Date(base.getTime() - 3 * 3600_000);
  let restantes = Math.max(1, dias);
  while (restantes > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!FIM_DE_SEMANA.has(d.getUTCDay())) restantes -= 1;
  }
  d.setUTCHours(hora, 0, 0, 0);
  return new Date(d.getTime() + 3 * 3600_000);
}

function maisRecente(a, b) {
  const da = toDateOrNull(a);
  const db = toDateOrNull(b);
  if (!da) return db || null;
  if (!db) return da;
  return da.getTime() >= db.getTime() ? da : db;
}

function depoisDe(a, b) {
  const da = toDateOrNull(a);
  const db = toDateOrNull(b);
  if (!da) return false;
  if (!db) return true;
  return da.getTime() > db.getTime();
}

/** OS encerrada ou cancelada não cobra nada de ninguém. */
const MORTAS = new Set(['Encerrada', 'Cancelada']);

/**
 * Escrituração, não trabalho.
 *
 * `system` e `field_change` são o que o sistema anota SOBRE a OS — "responsável
 * definido", "painel atualizado", "prioridade alterada". Contá-las como movimento
 * abriria a porta que estas regras existem para fechar: definir um responsável
 * escreve uma entrada `system`, e ela sozinha zeraria o relógio de "sem progresso".
 * O rótulo não pode ser o próprio álibi.
 *
 * Mensagem de gente — `customer`, `tech`, `internal` — conta, inclusive a nota
 * interna: escrever um parecer É o trabalho.
 */
const ESCRITURACAO = new Set(['system', 'field_change']);

/**
 * Quando esta OS PROGREDIU pela última vez.
 *
 * Olha o histórico junto com os carimbos de e-mail de propósito: `lastInboundAt`
 * existe em 4 das 195 OS vivas e `lastOutboundAt` em 9 — eles só passaram a ser
 * gravados nas mensagens novas. Uma regra que dependesse só deles trataria 190 OS
 * como se nunca tivessem se mexido.
 *
 * `stageEnteredAt` entra porque mudar de etapa É progresso — e entra como carimbo
 * ESTRUTURADO, não lendo o texto da entrada `system` que descreve a transição.
 * Adivinhar intenção em texto livre é justamente o que este módulo promete não
 * fazer.
 *
 * `updatedAt` fica FORA: o servidor carimba a cada escrita, inclusive nos
 * recálculos automáticos, então ele diria que a OS se mexeu quando quem mexeu foi o
 * próprio sistema.
 *
 * Cai na data de abertura quando não há mais nada — OS recém-criada e nunca tocada
 * está parada desde que nasceu, e é exatamente o caso que precisa aparecer.
 */
export function ultimaMovimentacao(ticket) {
  let ultima = maisRecente(ticket?.lastInboundAt, ticket?.lastOutboundAt);
  ultima = maisRecente(ultima, ticket?.stageEnteredAt);
  const historico = Array.isArray(ticket?.history) ? ticket.history : [];
  for (const entrada of historico) {
    if (ESCRITURACAO.has(String(entrada?.type || ''))) continue;
    ultima = maisRecente(ultima, entrada?.time);
  }
  return ultima || toDateOrNull(ticket?.time) || toDateOrNull(ticket?.createdAt) || null;
}

/**
 * Há quanto tempo a OS está NESTA etapa, em dias corridos. `null` quando o carimbo
 * não existe — OS anterior ao campo, que nunca trocou de etapa desde então.
 *
 * Separado de `ultimaMovimentacao` de propósito: conversar numa OS é progresso, mas
 * não a tira da etapa. As 158 paradas em "Aguardando Parecer Técnico" têm 280
 * mensagens internas entre elas — movimento sem avanço é o padrão desta operação,
 * e um relógio só não distingue os dois.
 */
export function diasNaEtapa(ticket, now = new Date()) {
  const desde = toDateOrNull(ticket?.stageEnteredAt);
  if (!desde) return null;
  return Math.floor((now.getTime() - desde.getTime()) / (24 * 3600_000));
}

/**
 * O que esta OS exige, e quando.
 *
 * Precedência, e o motivo de cada degrau:
 *  1. **OS morta** → nada.
 *  2. **Mensagem de gente ainda sem resposta** → vem ANTES da suspensão de propósito:
 *     quem escreveu não sabe que a OS foi suspensa, e deixar a suspensão engolir a
 *     mensagem é como o sistema se comportava antes (o e-mail sumia).
 *  3. **Suspensão vigente** → esconde o resto até a revisão.
 *  4. **Visita marcada** → verificar comparecimento.
 *  5. **Retorno pedido e vencido** → cobrar.
 *  6. Nada disso → `null`. NÃO inventa "revisar" para OS sem sinal nenhum: despejar
 *     263 OS antigas na tela de uma vez ensina a ignorá-la.
 *
 * @returns {{ kind: string, dueAt: Date, sourceId: string, ruleVersion: number } | null}
 */
export function computeOperationalAttention(input, now = new Date()) {
  const ticket = input?.ticket || {};
  if (MORTAS.has(String(ticket.status || ''))) return null;

  const lastInboundAt = toDateOrNull(ticket.lastInboundAt);
  const lastOutboundAt = toDateOrNull(ticket.lastOutboundAt);

  // 2. Mensagem de gente sem resposta nossa depois dela.
  //    "Revisar", não "responder": responder pressupõe uma necessidade que o sistema
  //    não conhece — a mensagem pode ser um "obrigado".
  if (lastInboundAt && depoisDe(lastInboundAt, lastOutboundAt)) {
    return {
      kind: ATTENTION_KIND.REVIEW_MESSAGE,
      dueAt: nextBusinessDay(lastInboundAt),
      sourceId: String(ticket.lastInboundMessageId || `inbound-${lastInboundAt.getTime()}`),
      ruleVersion: ATTENTION_RULE_VERSION,
    };
  }

  // 3. Suspensão vigente.
  const suspensao = ticket.attention;
  const reviewAt = toDateOrNull(suspensao?.reviewAt);
  if (suspensao?.state === 'suspensa' && reviewAt) {
    if (reviewAt.getTime() > now.getTime()) {
      return {
        kind: ATTENTION_KIND.REVIEW_SUSPENSION,
        dueAt: reviewAt,
        sourceId: `suspensao-${reviewAt.getTime()}`,
        ruleVersion: ATTENTION_RULE_VERSION,
      };
    }
    // Suspensão vencida: cai adiante e volta a cobrar como qualquer OS.
  }

  // 4. Visita de fornecedor em aberto.
  const visitas = Array.isArray(input?.commitments) ? input.commitments : [];
  const emAberto = visitas
    .filter(c => {
      const estado = effectiveCommitmentState(c, now);
      return estado === COMMITMENT_STATE.SCHEDULED || estado === COMMITMENT_STATE.UNCONFIRMED;
    })
    .sort((a, b) => (toDateOrNull(a.startAt)?.getTime() || 0) - (toDateOrNull(b.startAt)?.getTime() || 0))[0];

  if (emAberto) {
    const inicio = toDateOrNull(emAberto.endAt) || toDateOrNull(emAberto.startAt);
    if (inicio) {
      return {
        kind: ATTENTION_KIND.CHECK_VISIT,
        dueAt: inicio,
        sourceId: `visita-${emAberto.id}`,
        ruleVersion: ATTENTION_RULE_VERSION,
      };
    }
  }

  // 5. Alguém REGISTROU que está esperando retorno, e o prazo passou.
  //
  //    Nasce de sinal estruturado — a pessoa marcou — e nunca de adivinhar o texto
  //    do e-mail. Some sozinha quando chega mensagem DEPOIS do pedido: retorno que
  //    chegou não é retorno pendente.
  //
  //    O sistema não verifica se a pessoa realmente pediu. Não é trabalho dele:
  //    ele registra o que ela declara e devolve a OS na data. Marcar sem ter pedido
  //    é problema de quem marcou.
  const aguardaDesde = toDateOrNull(ticket.followUpRequestedAt);
  if (aguardaDesde) {
    if (!lastInboundAt || lastInboundAt.getTime() < aguardaDesde.getTime()) {
      return {
        kind: ATTENTION_KIND.AWAITING_REPLY,
        dueAt: nextBusinessDay(aguardaDesde, AWAITING_REPLY_BUSINESS_DAYS),
        sourceId: `aguardando-retorno-${aguardaDesde.getTime()}`,
        ruleVersion: ATTENTION_RULE_VERSION,
      };
    }
  }

  // 6/7. Parada. As duas metades da mesma pergunta, e o que separa é ter dono.
  //
  //    A regra que faltava, e a que casa com a falha REAL desta operação: 155 OS
  //    (57% do estoque) paradas em Parecer Técnico há 39 dias na mediana, e 154
  //    delas COM equipe atribuída. Equipe responde pelo trabalho; pessoa responde
  //    pelo prazo. As outras cinco regras só enxergam "alguém está esperando por
  //    nós" — por isso 101 OS não geravam atenção nenhuma justamente por estarem
  //    abandonadas, que é o oposto do que deveria acontecer.
  //
  //    Vem por ÚLTIMO de propósito: se há mensagem sem resposta ou visita marcada,
  //    isso é mais específico e mais útil do que "defina um responsável".
  const responsavel = String(ticket.responsible?.email || '').trim();
  const parouEm = ultimaMovimentacao(ticket);

  if (!responsavel) {
    if (parouEm) {
      const cobrarEm = new Date(parouEm.getTime() + IDLE_WITHOUT_OWNER_DAYS * 24 * 3600_000);
      if (cobrarEm.getTime() <= now.getTime()) {
        return {
          kind: ATTENTION_KIND.SET_OWNER,
          // `sourceId` preso à última movimentação, não à contagem de dias: com os
          // dias no id, dispensar hoje e o id mudar amanhã traria a mesma proposta
          // de volta todo dia. Assim a dispensa vale até algo realmente acontecer.
          sourceId: `sem-responsavel-${parouEm.getTime()}`,
          dueAt: cobrarEm,
          ruleVersion: ATTENTION_RULE_VERSION,
        };
      }
    }
    return null;
  }

  // 7. TEM responsável e mesmo assim não andou.
  //
  //    Esta é a regra que impede o campo de responsável de virar teatro. Sem ela,
  //    preencher os 154 de uma vez apagaria o alerta e nenhuma OS se moveria — o
  //    sistema passaria a tratar o rótulo como solução, que é exatamente o vício
  //    que a etapa "Aguardando Parecer Técnico" já tinha.
  //
  //    Assumir REINICIA o relógio: quem pega uma OS parada há 39 dias merece a
  //    janela inteira, não uma cobrança no mesmo segundo.
  const assumiuEm = toDateOrNull(ticket.responsible?.setAt);
  const desde = maisRecente(parouEm, assumiuEm);
  if (!desde) return null;
  const cobrarEm = new Date(desde.getTime() + IDLE_WITH_OWNER_DAYS * 24 * 3600_000);
  if (cobrarEm.getTime() <= now.getTime()) {
    return {
      kind: ATTENTION_KIND.NO_PROGRESS,
      // O e-mail entra no id: trocar de responsável é evento novo e merece janela
      // nova — senão a cobrança seguiria contando contra quem acabou de assumir.
      sourceId: `sem-progresso-${responsavel}-${desde.getTime()}`,
      dueAt: cobrarEm,
      ruleVersion: ATTENTION_RULE_VERSION,
    };
  }

  return null;
}

/**
 * Aplica a correção humana por cima da proposta.
 *
 * O override morre quando chega evento novo — é a regra que impede um "não se aplica"
 * de hoje de esconder o próximo e-mail da mesma OS. Sem isso, uma dispensa viraria
 * silêncio permanente, que é o problema que esta tela veio resolver.
 */
export function applyAttentionOverride(atencao, override) {
  if (!atencao) return null;
  if (!override || override.sourceId !== atencao.sourceId) return atencao;

  if (override.dismissed) return null;
  const dueAt = toDateOrNull(override.dueAt);
  return {
    ...atencao,
    dueAt: dueAt || atencao.dueAt,
    kind: override.kind || atencao.kind,
    overridden: true,
  };
}

/** A atenção mudou o bastante para valer uma escrita? Evita gravar por gravar. */
export function attentionChanged(antes, depois) {
  if (!antes && !depois) return false;
  if (!antes || !depois) return true;
  return (
    antes.kind !== depois.kind ||
    antes.sourceId !== depois.sourceId ||
    (toDateOrNull(antes.dueAt)?.getTime() || 0) !== (toDateOrNull(depois.dueAt)?.getTime() || 0)
  );
}

/**
 * Janela em que uma atenção vinda do PASSADO ainda vale como trabalho de hoje.
 *
 * Medido em produção antes de existir: das 103 OS que as regras marcariam como
 * "revisar mensagem", 80 (78%) têm mais de uma semana de atraso — 24 delas passam de
 * 60 dias. Despejar tudo isso na tela no primeiro dia não é informação, é o painel de
 * culpa que a consulta previu: ninguém consegue "resolver" 103 pendências de meses, e
 * a tela vira algo que se aprende a ignorar.
 *
 * O que passa da janela não some — vai para uma revisão administrativa à parte.
 */
export const LEGACY_ATTENTION_DAYS = 7;

/** Esta atenção é trabalho de hoje ou passivo antigo? */
export function isLegacyAttention(atencao, now = new Date(), dias = LEGACY_ATTENTION_DAYS) {
  // As duas regras de PARADA nunca são passivo antigo. A janela existe porque
  // mensagem velha sem resposta é notícia vencida — responder um e-mail de 60 dias
  // atrás raramente ajuda alguém. Já uma OS parada há 60 dias não fica menos urgente
  // com o tempo: fica MAIS. Aplicar o corte aqui esconderia justamente as piores, e
  // as duas regras nasceriam inúteis.
  if (
    atencao?.kind === ATTENTION_KIND.SET_OWNER ||
    atencao?.kind === ATTENTION_KIND.NO_PROGRESS
  ) {
    return false;
  }
  const dueAt = toDateOrNull(atencao?.dueAt);
  if (!dueAt) return false;
  return now.getTime() - dueAt.getTime() > dias * 24 * 3600_000;
}

/**
 * Recalcula e grava a atenção de UMA OS.
 *
 * Ponto único: toda rota que muda algo relevante chama ISTO, nunca reimplementa a
 * regra. Regra duplicada por rota é como as telas passam a discordar entre si.
 *
 * Não lança: a atenção é uma projeção sobre o trabalho, não o trabalho. Derrubar o
 * recebimento de um e-mail porque a projeção falhou seria trocar o certo pelo
 * acessório — o mesmo critério da detecção de autorização.
 */
export async function recomputeOperationalAttention(db, ticketId, now = new Date()) {
  try {
    const id = String(ticketId || '').trim();
    if (!id) return null;

    const ref = db.collection('tickets').doc(id);

    // Visitas desta OS, buscadas ANTES da transação: consulta em transação é
    // limitada, e visita mudando no mesmo instante é muito mais raro do que dois
    // eventos da mesma OS chegando juntos (um e-mail e uma resposta, por exemplo).
    const visitas = await db
      .collection('commitments')
      .where('ticketIds', 'array-contains', id)
      .limit(20)
      .get();
    const commitments = visitas.docs.map(d => ({ id: d.id, ...d.data() }));

    // TRANSAÇÃO: lê e grava no mesmo passo. Sem isto, dois eventos simultâneos
    // calculam sobre o mesmo estado antigo e o mais lento sobrescreve o mais novo —
    // a OS ficaria apontando para a mensagem errada, em silêncio.
    return await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const ticket = { id: snap.id, ...snap.data() };

      const proposta = computeOperationalAttention({ ticket, commitments }, now);
      const comCorrecao = applyAttentionOverride(proposta, ticket.attentionOverride);

      if (!attentionChanged(ticket.operationalAttention, comCorrecao)) return comCorrecao;

      tx.set(
        ref,
        {
          // `attentionStaleAt` some quando o cálculo tem sucesso e FICA quando falha.
          // É o que permite perguntar "quantas projeções estão velhas?" sem varrer o
          // histórico — falhar em silêncio e deixar projeção velha era o furo que a
          // revisão apontou.
          attentionStaleAt: null,
          operationalAttention: comCorrecao
            ? {
                kind: comCorrecao.kind,
                dueAt: comCorrecao.dueAt,
                sourceId: comCorrecao.sourceId,
                ruleVersion: comCorrecao.ruleVersion || ATTENTION_RULE_VERSION,
                legacy: isLegacyAttention(comCorrecao, now),
                computedAt: now,
              }
          : null,
          updatedAt: now,
        },
        { merge: true }
      );
      return comCorrecao;
    });
  } catch (error) {
    console.error('[atencao] falha ao recalcular', ticketId, error);
    // Marca a OS como "projeção suja". Não lançar continua certo — a atenção é
    // acessória ao trabalho —, mas sumir com o erro não: sem esta marca, uma projeção
    // velha ficaria velha para sempre e ninguém saberia.
    try {
      await db.collection('tickets').doc(String(ticketId)).set({ attentionStaleAt: now }, { merge: true });
    } catch {
      // Se nem isto grava, o banco está fora — não há o que fazer aqui.
    }
    return null;
  }
}

export { maisRecente };
