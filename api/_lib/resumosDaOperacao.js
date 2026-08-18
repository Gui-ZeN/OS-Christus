import { effectiveCommitmentState } from './commitments.js';
import { diaEmFortaleza, horaEmFortaleza } from './agendaDoDia.js';
import { esperaDeclarada, precisaDestravar } from './estadoDaOs.js';
import { cobrancasConcluidas } from './cobranca.js';
import { pendentesDeDesfecho } from './desfechoPendente.js';

/**
 * OS TRÊS RESUMOS AGRUPADOS — o lado de dentro da operação.
 *
 * A sede recebe pergunta ("chegou?"); a operação recebe RESUMO. A diferença é
 * deliberada: alerta individual e imediato existe UM só no desenho inteiro (a falta
 * confirmada). Todo o resto vem agrupado, senão ~31 compromissos por dia em ~16
 * sedes viram 80 e-mails e o sensor para de funcionar.
 *
 *   07h    -> gestora: o que está marcado hoje na operação dela, e o que já venceu
 *   11h30  -> gestora: o que ficou SEM CONFIRMAÇÃO (nunca um e-mail por item)
 *   16h30  -> gestora: idem, segunda passada
 *   fim    -> diretoria: faltas do dia e OS sem próxima ação
 *
 * ⚠️ "sem confirmação" NÃO é falta. Falta entra no histórico do fornecedor e
 * decide quem continua atendendo; sem confirmação é a sede que não respondeu. Os
 * dois resumos existem separados porque misturá-los acusaria fornecedor pelo
 * silêncio de outra pessoa.
 *
 * Sem I/O e sem relógio próprio.
 */

/**
 * Data vinda de qualquer forma — Date, texto, ou Timestamp do Firestore.
 *
 * Existe porque o `desfechoEm` mora DENTRO do array `cobrancas`, e a conversão da
 * rota só alcança os campos de primeiro nível. Sem isto o Timestamp virava
 * `Invalid Date`, a comparação de dia falhava calada e o contador de cobranças
 * ficava em ZERO — a métrica que existe para proteger quem cobrou dizendo que
 * ninguém cobrou. Métrica que erra para baixo em silêncio é pior que métrica
 * ausente: ninguém vai conferir um número que parece plausível.
 */
function paraData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor.toDate === 'function') return valor.toDate();
  if (typeof valor.seconds === 'number') return new Date(valor.seconds * 1000);
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

const ABERTOS = new Set(['agendado', 'sem-confirmacao']);
const FECHADAS = new Set(['Encerrada', 'Cancelada']);

function doDia(commitments, now) {
  const hoje = diaEmFortaleza(now);
  return (commitments || []).filter(c => {
    const inicio = c?.startAt instanceof Date ? c.startAt : new Date(c?.startAt || NaN);
    return !Number.isNaN(inicio.getTime()) && diaEmFortaleza(inicio) === hoje;
  });
}

function linhaDaVisita(c) {
  return {
    id: c.id,
    hora: horaEmFortaleza(c.startAt instanceof Date ? c.startAt : new Date(c.startAt)),
    sede: String(c.sede || c.siteId || ''),
    fornecedor: String(c.vendorName || 'Fornecedor'),
    ordens: Array.isArray(c.ticketIds) ? c.ticketIds.map(String) : [],
  };
}

/** 07h — a agenda do dia da operação, com o que já está atrasado. */
export function resumoDaAgenda({ commitments = [], tickets = [], now = new Date() }) {
  const visitas = doDia(commitments, now)
    .filter(c => ABERTOS.has(String(c.state || '')))
    .map(linhaDaVisita)
    .sort((a, b) => a.hora.localeCompare(b.hora));

  // O que já venceu entra no MESMO e-mail: mandar "sua agenda" sem dizer o que já
  // está atrasado seria a tela antiga de novo — a que mostra etapa, não urgência.
  const vencidas = (tickets || [])
    .filter(t => {
      if (FECHADAS.has(String(t?.status || ''))) return false;
      const prazo = t?.nextAction?.dueAt ? new Date(t.nextAction.dueAt) : null;
      return prazo && !Number.isNaN(prazo.getTime()) && prazo.getTime() < now.getTime();
    })
    .map(t => ({ id: t.id, assunto: String(t.subject || ''), oQue: String(t?.nextAction?.what || '') }));

  return { visitas, vencidas, vazio: visitas.length === 0 && vencidas.length === 0 };
}

/**
 * 11h30 e 16h30 — o que ficou sem confirmação.
 *
 * Agrupado, nunca um por item. E só o que a sede realmente não respondeu: o estado
 * efetivo já leva a tolerância em conta.
 */
export function resumoSemConfirmacao({ commitments = [], now = new Date() }) {
  const semResposta = doDia(commitments, now)
    .filter(c => effectiveCommitmentState(c, now) === 'sem-confirmacao')
    .map(linhaDaVisita)
    .sort((a, b) => a.hora.localeCompare(b.hora));

  return { visitas: semResposta, vazio: semResposta.length === 0 };
}

/**
 * Fim do dia — o que a diretoria precisa ver.
 *
 * "Cobranças feitas" conta só o que tem DESFECHO. Abrir o WhatsApp não é cobrar —
 * a tentativa sem desfecho ficaria contabilizando atuação que não houve, que é o
 * defeito que a auditoria pegou no desenho original do botão.
 */
export function resumoDoFimDoDia({ commitments = [], tickets = [], now = new Date() }) {
  const hoje = diaEmFortaleza(now);

  const faltas = (commitments || [])
    .filter(c => {
      if (String(c.state || '') !== 'faltou') return false;
      const quando = c?.confirmedAt instanceof Date ? c.confirmedAt : new Date(c?.confirmedAt || NaN);
      return !Number.isNaN(quando.getTime()) && diaEmFortaleza(quando) === hoje;
    })
    .map(linhaDaVisita);

  // Só desfecho conta. É a diferença entre "alguém foi cobrar" e "a cobrança
  // aconteceu" — e essa métrica existe para proteger quem cobrou, então inflá-la a
  // torna inútil justamente para quem ela deveria defender.
  const cobrancas = (commitments || []).reduce((total, c) => {
    return total + cobrancasConcluidas(c).filter(cob => {
      const quando = paraData(cob?.desfechoEm);
      return quando !== null && diaEmFortaleza(quando) === hoje;
    }).length;
  }, 0);

  const cobrancasSemDesfecho = (commitments || []).reduce((total, c) => {
    const lista = Array.isArray(c?.cobrancas) ? c.cobrancas : [];
    return total + lista.filter(cob => !cob?.desfecho).length;
  }, 0);

  const semConfirmacao = doDia(commitments, now).filter(
    c => effectiveCommitmentState(c, now) === 'sem-confirmacao'
  ).length;

  // Visitas que aconteceram e ninguém disse o que saiu delas. Sem aparecer aqui,
  // a pendência criada pelo "chegou" seria a próxima gaveta — e o painel ficaria
  // verde com serviço que talvez não tenha sido feito.
  const desfechosPendentes = pendentesDeDesfecho(commitments, now);

  // Falta que aconteceu e não tinha ninguém configurado para receber o alerta. É
  // falha de CADASTRO, não de operação — mas fica invisível se não aparecer aqui, e
  // uma sede pode passar meses sem que ninguém seja avisado das faltas dela.
  const faltasSemDono = (commitments || []).filter(c => Boolean(c?.faltaSemDonoEm)).length;

  // O número que o rework existe para derrubar — e o mais fácil de maquiar, por
  // isso vem junto do tempo parado da mais antiga.
  //
  // Espera DECLARADA não entra: OS esperando aprovação ou impedida por terceiro tem
  // motivo e data de revisão gravados. Contá-la como buraco seria empurrar alguém a
  // inventar "revisar em 30 dias" só para tirá-la da lista — exatamente a maquiagem
  // que os três estados existem para acabar.
  const semProximaAcao = (tickets || []).filter(
    t => !FECHADAS.has(String(t?.status || '')) && !t?.nextAction?.dueAt && !esperaDeclarada(t, now)
  );

  // Impedidas contam à PARTE. Elas saem de "sem próxima ação" porque foram
  // declaradas — mas some-las do resumo faria o número da diretoria cair sem nada
  // ter melhorado, que é a maquiagem ao contrário. Prazo furado por terceiro é
  // trabalho pendente, e precisa aparecer.
  const impedidas = (tickets || []).filter(
    t => !FECHADAS.has(String(t?.status || '')) && precisaDestravar(t, now)
  ).length;

  const maisAntiga = semProximaAcao.reduce((pior, t) => {
    const base = t?.updatedAt || t?.createdAt;
    const data = base instanceof Date ? base : new Date(base || NaN);
    if (Number.isNaN(data.getTime())) return pior;
    return !pior || data < pior ? data : pior;
  }, null);

  return {
    faltas,
    desfechosPendentes: desfechosPendentes.length,
    faltasSemDono,
    desfechosVencidos: desfechosPendentes.filter(p => p.vencida).length,
    cobrancas,
    // Tentativa aberta não some: cobrança sem desfecho é trabalho pela metade, e
    // esconder isso devolveria a cegueira que o registro existe para tirar.
    pendentesDeDesfecho: cobrancasSemDesfecho,
    semConfirmacao,
    impedidas,
    semProximaAcao: semProximaAcao.length,
    diasDaMaisAntiga: maisAntiga ? Math.floor((now.getTime() - maisAntiga.getTime()) / 86_400_000) : null,
    // Dia sem falta, sem pendência e sem OS órfã não vira e-mail: silêncio é a
    // informação de que está tudo certo.
    vazio:
      faltas.length === 0 &&
      semConfirmacao === 0 &&
      semProximaAcao.length === 0 &&
      impedidas === 0 &&
      desfechosPendentes.length === 0 &&
      faltasSemDono === 0 &&
      cobrancas === 0 &&
      cobrancasSemDesfecho === 0,
  };
}
