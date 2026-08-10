/**
 * Erro cuja mensagem foi ESCRITA PARA UMA PESSOA LER — em português, dizendo o que
 * aconteceu e, quando dá, o que fazer.
 *
 * Existe para separar do resto. O padrão anterior — `error instanceof Error ?
 * error.message : 'fallback'` — estava repetido em 37 lugares e mostrava qualquer
 * `Error` cru na tela. Quando o erro era nosso, o texto ajudava; quando vinha do
 * navegador ou do SDK do Firebase, a pessoa recebia `Failed to fetch` ou
 * `Firebase: Error (auth/id-token-expired)` no meio de uma tela em português.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

/**
 * Mensagem de erro para mostrar a quem está usando o sistema.
 *
 * A regra: só chega à tela o texto que alguém escreveu pensando nela. Todo o resto
 * vira a frase que o próprio chamador definiu para aquela situação — ele sabe o que
 * a pessoa estava tentando fazer; a biblioteca não.
 *
 * O erro técnico não some: vai para o console, que é onde ele serve para alguma
 * coisa.
 */
export function mensagemDeErro(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError && error.message.trim()) {
    return error.message.trim();
  }
  if (error) console.error('[erro]', error);
  return fallback;
}

/**
 * Erros técnicos que o log de e-mail grava crus, e o que eles querem dizer.
 *
 * Estes NÃO passam por `mensagemDeErro`: são registro do backend, gravado no
 * Firestore em inglês pelo SDK que falhou, e a tela de Saúde de E-mail imprimia o
 * texto literal. Desde 01/08 foram 44 ocorrências só do token expirado — quem lia
 * via `Firebase ID token has expired. Get a fresh ID token from your client app`
 * numa tela inteira em português.
 *
 * A tradução fica AO LADO do original, nunca no lugar: o texto em inglês é o que
 * serve para procurar no Google e abrir chamado com quem mantém a biblioteca.
 */
const ERROS_CONHECIDOS: Array<{ quando: RegExp; explicacao: string }> = [
  {
    quando: /id-token-expired|ID token has expired/i,
    explicacao: 'A sessão de quem estava com a tela aberta expirou. Basta recarregar e entrar de novo — nenhuma mensagem se perdeu.',
  },
  {
    quando: /id-token-revoked|token has been revoked/i,
    explicacao: 'A sessão foi encerrada (senha trocada ou acesso revogado). É preciso entrar de novo.',
  },
  {
    quando: /argument-error|Decoding Firebase ID token failed/i,
    explicacao: 'O sistema recebeu uma credencial malformada. Costuma ser aba antiga aberta há muito tempo.',
  },
  {
    quando: /Invalid login|Username and Password not accepted|invalid_grant/i,
    explicacao: 'A conta de e-mail recusou a credencial do sistema. O token de acesso do Gmail precisa ser renovado.',
  },
  {
    quando: /Message blocked|Message rejected/i,
    explicacao: 'O provedor do destinatário recusou a mensagem. Confira o endereço e se a caixa não está cheia ou bloqueando remetente externo.',
  },
  {
    quando: /Address not found|Recipient address rejected|User unknown/i,
    explicacao: 'O endereço de destino não existe. Provavelmente há um erro de digitação no e-mail cadastrado.',
  },
  {
    quando: /quota|rate limit|Too many/i,
    explicacao: 'O limite de envio do provedor foi atingido. O sistema tenta de novo sozinho mais tarde.',
  },
  {
    quando: /ECONNRESET|ETIMEDOUT|ENOTFOUND|network|fetch failed/i,
    explicacao: 'A conexão com o provedor caiu no meio. Costuma ser passageiro e a próxima tentativa resolve.',
  },
];

/**
 * Explicação em português para um erro técnico de log, ou `null` quando não
 * reconhecemos. `null` é resposta legítima: inventar explicação para erro
 * desconhecido é pior que mostrar o texto cru, porque a pessoa acredita.
 */
export function explicaErroTecnico(erro?: string | null): string | null {
  const texto = String(erro || '').trim();
  if (!texto) return null;
  return ERROS_CONHECIDOS.find(item => item.quando.test(texto))?.explicacao ?? null;
}
