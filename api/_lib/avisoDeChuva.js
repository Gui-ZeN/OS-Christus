/**
 * QUEM RECEBE O AVISO DE CHUVA.
 *
 * Antes era `RAIN_ALERT_TO`, uma variável de ambiente com um endereço só. Trocar
 * quem recebe exigia editar a configuração na Vercel e publicar de novo — quem
 * administra o sistema não tinha como fazer sozinho, e ninguém que olhasse a tela
 * conseguia responder "quem está sendo avisado?".
 *
 * Agora sai do cadastro: cada usuário tem uma marca. A variável continua existindo
 * como REDE — se ninguém marcou, o aviso não pode simplesmente parar de sair no dia
 * do deploy, porque a falha seria silenciosa (a rota responde 200 e o log diz
 * `enviado: false`, o que nesta rota é o normal em 99% dos ciclos).
 *
 * ⚠️ MARCADO GANHA DA VARIÁVEL, e não é união. Somar os dois deixaria um
 * destinatário fantasma que não aparece em tela nenhuma — e o motivo de a lista ter
 * saído do ambiente foi exatamente esse.
 *
 * Sem I/O.
 */

const EMAIL_ACEITAVEL = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

/**
 * @param {Array<{email?: string, avisoDeChuva?: boolean, active?: boolean, status?: string}>} users
 * @param {string} [doAmbiente] valor de `RAIN_ALERT_TO`, usado só quando ninguém marcou
 * @returns {{ destinos: string[], origem: 'cadastro' | 'ambiente' | 'nenhum' }}
 */
export function destinatariosDoAviso(users = [], doAmbiente = '') {
  const marcados = [];
  for (const user of Array.isArray(users) ? users : []) {
    if (user?.avisoDeChuva !== true) continue;
    // Inativo não recebe: desligar alguém do sistema tem que desligar os e-mails
    // junto, senão a caixa de quem saiu continua recebendo alerta de madrugada.
    if (user.active === false) continue;
    if (String(user.status || '').trim().toLowerCase() === 'inativo') continue;
    const email = String(user.email || '').trim().toLowerCase();
    if (email && EMAIL_ACEITAVEL.test(email)) marcados.push(email);
  }

  const unicos = [...new Set(marcados)].sort();
  if (unicos.length > 0) return { destinos: unicos, origem: 'cadastro' };

  const reserva = String(doAmbiente || '')
    .split(/[,;]/)
    .map(valor => valor.trim().toLowerCase())
    .filter(valor => EMAIL_ACEITAVEL.test(valor));

  const daReserva = [...new Set(reserva)].sort();
  if (daReserva.length > 0) return { destinos: daReserva, origem: 'ambiente' };

  return { destinos: [], origem: 'nenhum' };
}
