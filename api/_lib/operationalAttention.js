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
  /** Pedimos algo e o prazo passou. Só nasce de sinal ESTRUTURADO. */
  FOLLOW_UP: 'cobrar-retorno',
  /** Fornecedor prometeu vir. */
  CHECK_VISIT: 'verificar-comparecimento',
  /** A suspensão venceu. */
  REVIEW_SUSPENSION: 'reavaliar-suspensao',
};

/**
 * Versão das regras. Gravada junto da atenção para permitir reprocessar só o que foi
 * calculado por uma versão antiga, em vez de recalcular tudo às cegas.
 */
export const ATTENTION_RULE_VERSION = 1;

/** Dias úteis a esperar antes de cobrar um retorno que pedimos. */
export const FOLLOW_UP_BUSINESS_DAYS = 3;

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

  // 5. Retorno que NÓS pedimos, com prazo vencido. Só nasce de sinal estruturado
  //    (alguém clicou "solicitar retorno") — nunca de adivinhar o texto do e-mail.
  const pedidoEm = toDateOrNull(ticket.followUpRequestedAt);
  if (pedidoEm) {
    const cobrarEm = nextBusinessDay(pedidoEm, FOLLOW_UP_BUSINESS_DAYS);
    if (!lastInboundAt || lastInboundAt.getTime() < pedidoEm.getTime()) {
      return {
        kind: ATTENTION_KIND.FOLLOW_UP,
        dueAt: cobrarEm,
        sourceId: `cobranca-${pedidoEm.getTime()}`,
        ruleVersion: ATTENTION_RULE_VERSION,
      };
    }
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
