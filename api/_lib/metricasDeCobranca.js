import { cobrancasConcluidas } from './cobranca.js';

/**
 * A LINHA DE BASE, MEDIDA PELO SISTEMA — no lugar da semana de papel.
 *
 * O plano pedia cinco dias de anotação à mão: quantas cobranças por dia, em
 * quantas o fornecedor não atende, quanto tempo até conseguir nova data. O dono
 * cortou, e com razão: o botão Cobrar já grava exatamente esses campos. Pedir para
 * alguém anotar num papel o que o sistema registra sozinho é cobrar duas vezes
 * pelo mesmo trabalho — e a segunda cobrança é a que ninguém cumpre até sexta.
 *
 * ⚠️ O QUE O SISTEMA NÃO MEDE, E O PAPEL MEDIRIA: a cobrança que acontece FORA
 * dele. Ligação feita do celular, conversa no corredor, "passa lá e vê". Enquanto o
 * botão não for o caminho normal, o número aqui é piso, não total — e ler como
 * total faria a operação parecer mais leve do que é.
 *
 * A saída para isso não é papel: é ligar o registro ANTES dos e-mails da sede
 * (`EMAIL_TIPOS_DESLIGADOS=agenda-sede,checagem`). A operação segue como hoje,
 * cobrando por telefone, mas cada cobrança fica registrada. Duas semanas assim são
 * a linha de base — e nenhuma delas custa uma folha.
 *
 * Sem I/O.
 */

/**
 * ⚠️ `_seconds` COM SUBLINHADO, e não só `seconds`.
 *
 * As cobranças chegam ao navegador dentro do compromisso, e o serializador da API
 * copia o campo cru: um Timestamp do Firestore atravessa o JSON como
 * `{_seconds, _nanoseconds}` — o `toJSON()` da biblioteca usa o nome privado.
 * Sem esta linha toda data de cobrança viraria `null`, cairia fora do período, e o
 * painel mostraria zero cobrança tendo visitas — que é exatamente o número
 * plausível e falso que este módulo existe para não produzir.
 */
function paraData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor.toDate === 'function') return valor.toDate();
  if (typeof valor.seconds === 'number') return new Date(valor.seconds * 1000);
  if (typeof valor._seconds === 'number') return new Date(valor._seconds * 1000);
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dentroDoPeriodo(data, de, ate) {
  if (!data) return false;
  return data.getTime() >= de.getTime() && data.getTime() <= ate.getTime();
}

/**
 * Os números que a folha de papel queria, de um período.
 *
 * ⚠️ Tudo em TAXA, além do total. O volume de OS muda de mês para mês, e comparar
 * totais faz o indicador mentir sozinho: um mês com metade das visitas tem metade
 * das cobranças sem nada ter melhorado.
 */
export function metricasDeCobranca({ commitments = [], de, ate }) {
  const inicio = paraData(de) || new Date(0);
  const fim = paraData(ate) || new Date();

  const visitasDoPeriodo = (commitments || []).filter(c =>
    dentroDoPeriodo(paraData(c?.startAt), inicio, fim)
  );

  const tentativas = [];
  for (const c of commitments || []) {
    for (const cob of Array.isArray(c?.cobrancas) ? c.cobrancas : []) {
      const quando = paraData(cob?.em);
      if (dentroDoPeriodo(quando, inicio, fim)) tentativas.push({ ...cob, em: quando, visita: c });
    }
  }

  const concluidas = (commitments || []).flatMap(c =>
    cobrancasConcluidas(c)
      .map(cob => ({ ...cob, em: paraData(cob.em), desfechoEm: paraData(cob.desfechoEm), visita: c }))
      .filter(cob => dentroDoPeriodo(cob.em, inicio, fim))
  );

  const respondeu = concluidas.filter(c => c.desfecho === 'respondeu' || c.desfecho === 'nova-data');
  const comNovaData = concluidas.filter(c => c.desfecho === 'nova-data');

  // Tempo entre acionar o link e registrar o desfecho. Não é "tempo de telefone" —
  // é quanto o assunto fica aberto na cabeça de quem cobra, que é o custo real.
  const esperas = concluidas
    .map(c => (c.desfechoEm && c.em ? c.desfechoEm.getTime() - c.em.getTime() : null))
    .filter(ms => ms !== null && ms >= 0)
    .sort((a, b) => a - b);
  const medianaEmMinutos = esperas.length > 0 ? Math.round(esperas[Math.floor(esperas.length / 2)] / 60_000) : null;

  const faltas = visitasDoPeriodo.filter(c => String(c?.state || '') === 'faltou').length;
  const visitasComMaisDeUma = (commitments || []).filter(
    c => (Array.isArray(c?.cobrancas) ? c.cobrancas : []).filter(cob => dentroDoPeriodo(paraData(cob?.em), inicio, fim)).length > 1
  ).length;

  const taxa = (parte, total) => (total > 0 ? Math.round((parte / total) * 100) : null);

  return {
    visitas: visitasDoPeriodo.length,
    faltas,
    tentativas: tentativas.length,
    // Só desfecho conta como cobrança: abrir o WhatsApp não é ter cobrado.
    cobrancasConcluidas: concluidas.length,
    semDesfecho: tentativas.length - concluidas.length,
    naoResponderam: concluidas.length - respondeu.length,
    novasDatas: comNovaData.length,
    segundasTentativas: visitasComMaisDeUma,

    // As taxas, que é como se compara mês contra mês.
    cobrancasPorCemVisitas: visitasDoPeriodo.length > 0
      ? Math.round((tentativas.length / visitasDoPeriodo.length) * 100)
      : null,
    percentualSemResposta: taxa(concluidas.length - respondeu.length, concluidas.length),
    percentualComNovaData: taxa(comNovaData.length, concluidas.length),
    medianaAteODesfechoEmMinutos: medianaEmMinutos,
  };
}
