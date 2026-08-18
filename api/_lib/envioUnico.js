/**
 * ENVIO ÚNICO — idempotência de verdade, no banco.
 *
 * ⚠️ POR QUE ISTO EXISTE. O desenho anterior confiava no `concurrency` do GitHub
 * Actions para não mandar e-mail em dobro. A auditoria (consulta 12) derrubou a
 * premissa: `concurrency` serializa execuções AGENDADAS do mesmo workflow e não
 * cobre nada além disso —
 *
 *   - retry de HTTP depois de a rota já ter enviado;
 *   - disparo manual acontecendo junto com o agendado;
 *   - timeout do cliente DEPOIS de o Gmail ter aceitado a mensagem;
 *   - dois caminhos diferentes chamando a mesma rota;
 *   - crash entre o envio e a gravação da marca.
 *
 * A marca no compromisso (`checagemEnviadaEm`) também não resolve: ela é gravada
 * DEPOIS do envio, de propósito, para não perder o aviso se o envio falhar. A
 * janela entre uma coisa e outra é justamente onde a duplicata nasce.
 *
 * Aqui a reivindicação é ANTES, e é atômica: `create()` no Firestore falha se o
 * documento já existe. Quem cria, envia. Quem perdeu a corrida, não envia.
 *
 * ⚠️ E se o envio falhar depois de reivindicado? A reivindicação é LIBERADA
 * (`liberarEnvio`), e a próxima volta tenta de novo. O que não pode acontecer é o
 * contrário: mandar duas vezes. Com ~31 compromissos/dia em 16 sedes, um e-mail a
 * mais é pior que um a menos — é assim que o destinatário aprende a ignorar.
 */

const COLECAO = 'enviosUnicos';

/**
 * A chave tem que ser DETERMINÍSTICA para o mesmo evento — mesma sede, mesma
 * pessoa, mesma janela de tempo. Chave com relógio dentro (timestamp exato) não
 * serve: duas execuções separadas por segundos gerariam chaves diferentes e as
 * duas enviariam.
 */
export function chaveDeEnvio(partes) {
  return partes
    .map(p => String(p ?? '').trim().toLowerCase().replace(/[^a-z0-9@.-]+/g, '-'))
    .filter(Boolean)
    .join('__')
    .slice(0, 400);
}

/** Tenta ficar com o direito de enviar. `false` = outro já ficou. */
export async function reivindicarEnvio(db, chave, agora = new Date()) {
  try {
    await db.collection(COLECAO).doc(chave).create({ em: agora });
    return true;
  } catch {
    // `create` falha se o documento existe. Qualquer outro erro também cai aqui, e
    // o conservador é NÃO enviar: duplicata é o dano que não dá para desfazer.
    return false;
  }
}

/** Devolve o direito quando o envio falhou, para a próxima volta tentar. */
export async function liberarEnvio(db, chave) {
  try {
    await db.collection(COLECAO).doc(chave).delete();
  } catch {
    // Falhar aqui só significa que a próxima volta não vai reenviar. Preferível a
    // estourar a rota inteira por causa da limpeza.
  }
}

/**
 * Envia uma vez só. Devolve `true` se enviou, `false` se alguém já tinha enviado.
 *
 * Note que o `enviar` roda DENTRO da reivindicação: se ele lançar, a chave é
 * liberada e o erro sobe — quem chama decide se aborta ou segue para o próximo.
 */
export async function enviarUmaVez(db, chave, enviar, agora = new Date()) {
  const meu = await reivindicarEnvio(db, chave, agora);
  if (!meu) return false;
  try {
    const resultado = await enviar();

    // ⚠️ ENVIO SUPRIMIDO LIBERA A CHAVE. Sem isto, o deploy escuro se sabota: uma
    // execução em `desligado` ou `sombra` reivindicaria a chave do dia, e ao abrir
    // a torneira o envio real seria descartado como duplicata — a operação passaria
    // o primeiro dia sem receber nada e ninguém saberia por quê.
    //
    // Foi um teste rodando dois modos em sequência que expôs isso. A chave existe
    // para impedir DUAS ENTREGAS, e nada foi entregue.
    // `suprimido` = não saiu. `ensaio` = saiu, mas para a caixa de teste, e o
    // destinatário real continua sem receber. Os dois liberam a chave: ela existe
    // para impedir DUAS ENTREGAS ao destinatário, e não houve nenhuma.
    if (resultado && (resultado.suprimido || resultado.ensaio)) {
      await liberarEnvio(db, chave);
      return false;
    }
    return true;
  } catch (erro) {
    await liberarEnvio(db, chave);
    throw erro;
  }
}
