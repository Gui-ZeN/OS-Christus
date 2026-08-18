import { randomBytes } from 'node:crypto';
import { COMMITMENT_OUTCOME, COMMITMENT_STATE } from './commitments.js';

/**
 * A CONFIRMAÇÃO DA SEDE — o coordenador não faz login, não navega e não aprende
 * sistema. Ele recebe e-mail e toca num botão.
 *
 * ⚠️ O BOTÃO DO E-MAIL NÃO REGISTRA NADA. Ele abre uma página, e o registro só
 * acontece no toque DA PÁGINA. Isso não é passo a mais por descuido: filtro de
 * segurança de e-mail corporativo abre os links sozinho para checar se são
 * seguros, e um link que grava registraria "não apareceu" para visitas que
 * ninguém olhou — o sistema cobraria fornecedor que compareceu. Por isso a rota
 * de leitura é GET e não escreve, e a de gravação é POST.
 *
 * Este módulo é só a DECISÃO: token -> pergunta, escolha -> novo estado. Sem I/O,
 * então dá para testar as regras sem emulador.
 */

/** Quanto tempo o link do e-mail continua valendo. */
export const VALIDADE_DO_LINK_EM_HORAS = 72;

/**
 * Emite o link de uma pessoa para uma visita. Quem grava é o chamador — este
 * módulo continua sem I/O.
 *
 * O token é POR PESSOA, não por visita: é o que permite a página dizer "você é
 * Pablo Ferreira" e o registro guardar quem respondeu. Um token só por visita
 * gravaria confirmação anônima, e "quem confirmou" é justamente o que protege o
 * coordenador quando o fornecedor contesta a falta.
 *
 * 192 bits de aleatoriedade: o link circula por e-mail e não expira na hora.
 */
export function novoTokenDeConfirmacao({ commitmentId, email, nome = '', now = new Date() }) {
  const id = String(commitmentId || '').trim();
  const destinatario = String(email || '').trim();
  if (!id || !destinatario) return null;
  return {
    token: randomBytes(24).toString('hex'),
    doc: { commitmentId: id, email: destinatario, nome: String(nome || '').trim(), createdAt: now },
  };
}

/**
 * As escolhas que a página oferece.
 *
 * "Já foi resolvido pela sede" existe porque sem ela a sede que resolveu sozinha
 * continuaria recebendo cobrança — e o fornecedor apareceria para um serviço que
 * já não existe, com deslocamento cobrado.
 */
export const ESCOLHA = {
  CHEGOU: 'chegou',
  NAO_APARECEU: 'nao-apareceu',
  RESOLVIDO_PELA_SEDE: 'resolvido-pela-sede',
  /** Desfazer: o fornecedor apareceu depois, ou o toque foi errado. */
  APARECEU_DEPOIS: 'apareceu-depois',
};

/**
 * Escolha da sede -> o que grava no compromisso.
 *
 * ⚠️ "chegou" grava SEM desfecho, de propósito. O desfecho é o que aconteceu
 * depois que a equipe entrou (concluiu, faltou material, sem acesso) e às 08h30
 * o coordenador não tem como saber — forçá-lo a escolher produziria desfecho
 * inventado, que é pior que desfecho ausente. A separação entre CHEGADA e
 * RESULTADO já está no modelo; aqui ela é respeitada.
 */
export function efeitoDaEscolha(escolha) {
  switch (escolha) {
    case ESCOLHA.CHEGOU:
    case ESCOLHA.APARECEU_DEPOIS:
      return { state: COMMITMENT_STATE.ARRIVED, outcome: null };
    case ESCOLHA.NAO_APARECEU:
      return { state: COMMITMENT_STATE.MISSED, outcome: null };
    case ESCOLHA.RESOLVIDO_PELA_SEDE:
      return { state: COMMITMENT_STATE.CANCELED, outcome: COMMITMENT_OUTCOME.SOLVED_BY_SITE };
    default:
      return null;
  }
}

/**
 * A sede pode registrar esta escolha agora?
 *
 * Regra diferente da confirmação de dentro do app (`validateConfirmation`), e por
 * dois motivos: aqui "chegou" não exige desfecho (acima), e aqui EXISTE desfazer.
 * Sem desfazer, um toque errado às 08h30 viraria falta permanente no histórico do
 * fornecedor — que é o dado usado depois para decidir quem continua atendendo.
 */
export function validarEscolhaDaSede(commitment, escolha) {
  const efeito = efeitoDaEscolha(escolha);
  if (!efeito) return { ok: false, error: 'Escolha desconhecida.' };

  const atual = String(commitment?.state || '');

  if (escolha === ESCOLHA.APARECEU_DEPOIS) {
    // Só corrige o que foi registrado como falta. Corrigir um "cancelado" seria
    // ressuscitar visita que a sede disse não precisar mais.
    if (atual !== COMMITMENT_STATE.MISSED) {
      return { ok: false, error: 'Só dá para corrigir um registro de falta.' };
    }
    return { ok: true, efeito };
  }

  if (atual === COMMITMENT_STATE.RESCHEDULED) {
    return { ok: false, error: 'Esta visita foi remarcada — o registro vale para a data nova.' };
  }
  // Já respondido: a página mostra o que foi registrado e oferece o desfazer, em
  // vez de gravar por cima em silêncio.
  if (atual === COMMITMENT_STATE.ARRIVED || atual === COMMITMENT_STATE.MISSED || atual === COMMITMENT_STATE.CANCELED) {
    return { ok: false, error: 'Esta visita já foi respondida.', jaRespondido: true };
  }

  return { ok: true, efeito };
}

/** O link ainda vale? Token velho que vaza não deve confirmar para sempre. */
export function tokenExpirou(token, now = new Date(), horas = VALIDADE_DO_LINK_EM_HORAS) {
  const criadoEm = token?.createdAt instanceof Date ? token.createdAt : new Date(token?.createdAt || 0);
  if (Number.isNaN(criadoEm.getTime())) return true;
  return now.getTime() - criadoEm.getTime() > horas * 3_600_000;
}

/**
 * O que a página mostra. Só o necessário para a pessoa reconhecer a visita: sede,
 * fornecedor, horário e as OS. Um link que vaza não vira janela para o sistema.
 */
export function montarPergunta({ commitment, token, ticketsResumo = [] }) {
  const registrado =
    commitment.state === COMMITMENT_STATE.ARRIVED ||
    commitment.state === COMMITMENT_STATE.MISSED ||
    commitment.state === COMMITMENT_STATE.CANCELED;

  return {
    sede: commitment.sede || null,
    fornecedor: commitment.vendorName || null,
    marcadoPara: commitment.startAt instanceof Date ? commitment.startAt.toISOString() : commitment.startAt || null,
    ordens: ticketsResumo,
    // Quem a página acha que você é. O rodapé usa isto para dizer "se não for
    // você, ignore" — o coordenador muda, e o link antigo continua circulando.
    convidado: { nome: token?.nome || null, email: token?.email || null },
    estado: commitment.state,
    jaRespondido: registrado,
    respondidoPor: commitment.confirmedBy || null,
    respondidoEm: commitment.confirmedAt instanceof Date ? commitment.confirmedAt.toISOString() : commitment.confirmedAt || null,
    // Só oferece desfazer no caso em que ele é legítimo.
    podeDesfazer: commitment.state === COMMITMENT_STATE.MISSED,
  };
}
