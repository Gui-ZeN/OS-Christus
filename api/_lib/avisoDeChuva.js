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
  /**
   * O CADASTRO de cada marcado, indexado pelo e-mail.
   *
   * `destinos` continua sendo a lista de endereços — é o que os chamadores e os
   * testes já usam. Isto vem ao lado porque o aviso passou a ser recortado por
   * TERRITÓRIO, e território mora no cadastro: sem a pessoa, só o endereço, quem
   * monta o e-mail teria que ir buscá-la de novo e adivinhar o que fazer com quem
   * não tem cadastro nenhum.
   */
  const pessoas = new Map();
  for (const user of Array.isArray(users) ? users : []) {
    if (user?.avisoDeChuva !== true) continue;
    // Inativo não recebe: desligar alguém do sistema tem que desligar os e-mails
    // junto, senão a caixa de quem saiu continua recebendo alerta de madrugada.
    if (user.active === false) continue;
    if (String(user.status || '').trim().toLowerCase() === 'inativo') continue;
    const email = String(user.email || '').trim().toLowerCase();
    if (email && EMAIL_ACEITAVEL.test(email)) {
      marcados.push(email);
      pessoas.set(email, user);
    }
  }

  const unicos = [...new Set(marcados)].sort();
  if (unicos.length > 0) return { destinos: unicos, origem: 'cadastro', pessoas };

  const reserva = String(doAmbiente || '')
    .split(/[,;]/)
    .map(valor => valor.trim().toLowerCase())
    .filter(valor => EMAIL_ACEITAVEL.test(valor));

  const daReserva = [...new Set(reserva)].sort();
  if (daReserva.length > 0) return { destinos: daReserva, origem: 'ambiente', pessoas };

  return { destinos: [], origem: 'nenhum', pessoas };
}

/**
 * O QUE CADA UM VÊ NO AVISO — recortado pelo território de quem recebe.
 *
 * ⚠️ TODO MUNDO RECEBIA A LISTA INTEIRA. Medido em produção em 10/09/2026: 10
 * pessoas marcadas, 7 pontos de goteira abertos em 6 sedes, e **7 dos 10 são
 * Gestores que respondem por 3 ou 4 deles**. Quem cuida do Eusébio recebia, de
 * madrugada, a goteira do SUL1 — ruído que ensina a ignorar o alerta, e informação
 * de sede que não é dela.
 *
 * ⚠️ QUEM NÃO TEM CADASTRO CONTINUA VENDO TUDO, de propósito. São dois casos, os
 * dois deliberados: o endereço de `RAIN_ALERT_TO` (a rede que existe para o aviso
 * não parar de sair no dia em que ninguém marcou a caixinha) e o `?para=` de
 * simulação. Recortar por um território que não existe daria lista vazia — a rede
 * deixaria de ser rede exatamente quando ela é acionada.
 *
 * ⚠️ E LISTA VAZIA NÃO CANCELA O AVISO. Quem responde por sedes sem goteira marcada
 * continua sendo avisado de que choveu, com "nenhuma OS marcada" escrito — é a mesma
 * regra que `linhasDeGoteira` já aplica: ausência é dita, não omitida. Sumir com o
 * e-mail faria a pessoa concluir que o alerta parou de funcionar.
 *
 * @template P, G
 * @param {string[]} destinos
 * @param {Map<string, P>} pessoas cadastro de cada destino, quando existe
 * @param {G[]} goteiras pontos já selecionados por `selecionarPontosDeGoteira`
 * @param {(pessoa: P, goteira: G) => boolean} podeVer injetado para esta regra ser
 *        testável sem Firestore; em produção é `canUserAccessTicket` com o catálogo.
 *        ⚠️ Os dois parâmetros vão declarados: sem eles o TypeScript infere a
 *        assinatura do valor padrão (zero argumentos) e recusa qualquer função real.
 * @returns {Map<string, G[]>} na mesma ordem recebida
 */
export function goteirasPorDestinatario(destinos = [], pessoas = new Map(), goteiras = [], podeVer = () => true) {
  const porEmail = new Map();
  for (const email of destinos) {
    const pessoa = pessoas instanceof Map ? pessoas.get(email) : null;
    if (!pessoa) {
      porEmail.set(email, goteiras);
      continue;
    }
    porEmail.set(email, goteiras.filter(goteira => podeVer(pessoa, goteira)));
  }
  return porEmail;
}
