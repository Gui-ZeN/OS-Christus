/**
 * ONDE TERMINA O AVISO E COMEÇA O QUE ALGUÉM DIGITOU.
 *
 * A Caixa de Entrada gravava aceite e cancelamento como UMA frase, colando o motivo
 * digitado num texto que começa com marcador público (`Triagem concluída`, `OS
 * cancelada`). O filtro de visibilidade lia a frase inteira e deixava sair.
 *
 * O código já não faz mais isso — grava duas entradas. Este módulo é a outra metade:
 * separar o que já está no banco. Ele é PURO de propósito, sem Firestore, porque a
 * decisão de onde cortar precisa ser afirmável por teste. Um reparo que roda uma vez
 * sobre histórico de meses é exatamente o tipo de coisa que não dá para conferir
 * depois: se cortar errado, o erro fica gravado.
 *
 * ⚠️ CASA SÓ COM AS DUAS FORMAS QUE O CLIENTE ESCREVIA, e nada além. Qualquer texto
 * que não bata exatamente fica como está e é reportado. Adivinhar onde termina uma
 * frase seria trocar um vazamento por uma mutilação silenciosa.
 */

/** O que o aceite escrevia, imediatamente antes do texto digitado. */
const MOTIVO_DO_ACEITE = ' Motivo da transição: ';

/** O que o cancelamento escrevia. */
const MOTIVO_DO_CANCELAMENTO = '. Motivo: ';

/**
 * Devolve `{ aviso, motivo }` quando a entrada é uma das duas formas misturadas,
 * e `null` quando não é — inclusive quando já está separada, que é o caso comum
 * depois da primeira passada.
 */
export function separarAvisoDoMotivo(textoBruto) {
  const texto = String(textoBruto || '').trim();
  if (!texto) return null;

  if (texto.startsWith('Triagem concluída.')) {
    const corte = texto.indexOf(MOTIVO_DO_ACEITE);
    // Aceite sem motivo digitado já nasce limpo — nada a separar.
    if (corte === -1) return null;
    const motivo = texto.slice(corte + MOTIVO_DO_ACEITE.length).trim();
    if (!motivo) return null;
    return {
      aviso: texto.slice(0, corte).trim(),
      // O prefixo é composto pelo sistema; o que veio do teclado é `motivo`, e sai
      // daqui exatamente como entrou.
      motivo: `Motivo da transição: ${motivo}`,
    };
  }

  if (texto.startsWith('OS cancelada por ')) {
    const corte = texto.indexOf(MOTIVO_DO_CANCELAMENTO);
    if (corte === -1) return null;
    const motivo = texto.slice(corte + MOTIVO_DO_CANCELAMENTO.length).trim();
    if (!motivo) return null;
    return {
      // O ponto pertence ao aviso: `slice` até o corte para antes dele.
      aviso: `${texto.slice(0, corte).trim()}.`,
      motivo: `Motivo do cancelamento: ${motivo}`,
    };
  }

  return null;
}

/**
 * A entrada merece reparo?
 *
 * ⚠️ `visibility` JÁ DEFINIDO É RESPOSTA FINAL. Se alguém marcou a entrada à mão —
 * ou se uma passada anterior já mexeu nela — a decisão é dessa pessoa, não deste
 * script. Rodar duas vezes tem que dar o mesmo resultado que rodar uma.
 */
export function precisaSeparar(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.type !== 'system') return false;
  if (item.visibility) return false;
  return separarAvisoDoMotivo(item.text) !== null;
}

/**
 * Remonta o histórico de uma OS. Devolve `null` quando não há nada a fazer.
 *
 * ⚠️ O MOTIVO ENTRA LOGO DEPOIS DO AVISO, não no fim da lista. Era uma frase só: os
 * dois pedaços aconteceram no mesmo instante e se leem juntos. Jogar o motivo para o
 * fim jogaria ele meses à frente na conversa, ao lado de coisas com que não tem nada
 * a ver.
 *
 * ⚠️ O AVISO HERDA O ID da entrada original — é a mesma entrada, encurtada. Só o
 * pedaço que sai ganha id novo. E herda também `time` e `sender`: quem escreveu e
 * quando não mudou por causa de um reparo.
 *
 * `novoId` é injetado para o teste poder afirmar o resultado inteiro; em produção é
 * `randomUUID`.
 */
export function repararHistorico(historico, novoId) {
  if (!Array.isArray(historico) || !historico.some(precisaSeparar)) return null;

  const novo = [];
  const cortes = [];

  for (const item of historico) {
    if (!precisaSeparar(item)) {
      novo.push(item);
      continue;
    }
    const { aviso, motivo } = separarAvisoDoMotivo(item.text);
    novo.push({ ...item, text: aviso });
    novo.push({ ...item, id: novoId(), text: motivo, visibility: 'internal' });
    cortes.push({ aviso, motivo });
  }

  return { novo, cortes };
}
