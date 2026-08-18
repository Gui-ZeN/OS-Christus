/**
 * A PENDÊNCIA DE REGISTRAR O DESFECHO DA VISITA.
 *
 * Quando a sede diz "chegou", o sistema sabe que a equipe apareceu — e não sabe se
 * o serviço foi feito. Alguém precisa fechar isso, e a pendência é o registro
 * disso.
 *
 * ⚠️ POR QUE NÃO É `ticket.nextAction`. A primeira versão gravava a ação em cada
 * OS da visita, e a auditoria (consulta 13) mostrou três defeitos nascidos daí:
 *
 *   - visita que atende três OS criava TRÊS cartões idênticos, desfazendo o corte
 *     "uma visita é um item" que segura o volume do sistema inteiro;
 *   - a ação carregava `commitmentId`, e a agenda classifica ação com esse campo
 *     vencida como "Aguardando a sede" — a tarefa da GESTORA aparecia na tela como
 *     silêncio da sede, acusando quem já tinha respondido;
 *   - OS com ação escrita à mão não recebia nada, então o desfecho ficava sem
 *     dono justamente onde alguém estava trabalhando.
 *
 * A pendência mora no COMPROMISSO, que é a unidade certa: uma visita, uma
 * pergunta, um dono, um desfecho. E ela se conclui sozinha quando o desfecho é
 * registrado — ação que nunca fecha é a próxima gaveta.
 *
 * Sem I/O.
 */

export const PENDENCIA = {
  ABERTA: 'pendente',
  CONCLUIDA: 'concluida',
};

/**
 * O prazo para dizer o que aconteceu: 16h30 em Fortaleza, depois do horário típico
 * de término e ainda dentro do expediente de quem responde.
 *
 * ⚠️ Visita de fim de tarde cai no PRÓXIMO DIA ÚTIL, não em "amanhã". Sexta às 17h
 * gerava prazo no sábado — a auditoria pegou —, e prazo que nasce num dia sem
 * expediente já nasce vencido, poluindo o grupo "Vencidas" sem culpa de ninguém.
 */
export function prazoParaDesfecho(now = new Date()) {
  const prazo = new Date(now);
  prazo.setUTCHours(19, 30, 0, 0); // 16h30 em Fortaleza (UTC-3)
  if (prazo.getTime() <= now.getTime()) prazo.setUTCDate(prazo.getUTCDate() + 1);

  // getUTCDay serve aqui: 19h30 UTC é sempre o mesmo dia civil em Fortaleza.
  while (prazo.getUTCDay() === 0 || prazo.getUTCDay() === 6) {
    prazo.setUTCDate(prazo.getUTCDate() + 1);
  }
  return prazo;
}

/** A pendência que "chegou" cria. Uma por VISITA, com dono único. */
export function novaPendenciaDeDesfecho({ dono = null, now = new Date() }) {
  return {
    status: PENDENCIA.ABERTA,
    criadaEm: now,
    prazo: prazoParaDesfecho(now),
    donoEmail: dono?.email || null,
    donoNome: dono?.name || null,
    // Sem dono não vira pendência invisível: fica declarado para o resumo cobrar
    // cadastro, do mesmo jeito que a falta órfã.
    semDono: !dono?.email,
  };
}

/** Já existe pendência aberta? Evita recriar a cada resposta repetida. */
export function temPendenciaAberta(commitment) {
  return String(commitment?.desfechoPendente?.status || '') === PENDENCIA.ABERTA;
}

/**
 * A pendência se conclui SOZINHA quando o desfecho é registrado.
 *
 * É o que separa esta de uma tarefa comum: ninguém precisa lembrar de marcá-la
 * feita, e por isso ela não vira a próxima gaveta.
 */
export function concluirSeTemDesfecho(commitment, now = new Date()) {
  if (!temPendenciaAberta(commitment)) return null;
  if (!commitment?.outcome) return null;
  return {
    ...commitment.desfechoPendente,
    status: PENDENCIA.CONCLUIDA,
    concluidaEm: now,
  };
}

/** As visitas que ainda devem um desfecho. Entra nos resumos que já existem. */
export function pendentesDeDesfecho(commitments = [], now = new Date()) {
  return commitments
    .filter(c => temPendenciaAberta(c) && !c?.outcome)
    .map(c => ({
      commitmentId: c.id,
      sede: String(c.sede || c.siteId || ''),
      fornecedor: String(c.vendorName || 'Fornecedor'),
      ordens: Array.isArray(c.ticketIds) ? c.ticketIds.map(String) : [],
      donoEmail: c.desfechoPendente?.donoEmail || null,
      vencida: (() => {
        const p = c.desfechoPendente?.prazo;
        const data = p instanceof Date ? p : new Date(p || NaN);
        return !Number.isNaN(data.getTime()) && data.getTime() < now.getTime();
      })(),
    }));
}
