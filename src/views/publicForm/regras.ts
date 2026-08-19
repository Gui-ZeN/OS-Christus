/**
 * AS REGRAS DO FORMULÁRIO PÚBLICO, fora do componente.
 *
 * Esta é a única tela que qualquer pessoa alcança sem login: quem abre a OS é a
 * sede, o professor, o terceiro que passou no corredor. Tudo aqui decide o que
 * entra no sistema vindo de fora.
 *
 * Saíram do `PublicFormView` sem mudar comportamento, por um motivo simples: dentro
 * do componente elas só eram alcançáveis clicando na tela, e por isso nenhuma tinha
 * teste. A de anexo é a que mais preocupa — cinco condições, com `break` e
 * `continue` misturados, onde a diferença entre "recusa este arquivo" e "para de
 * aceitar os próximos" é uma palavra.
 *
 * Sem I/O e sem React.
 */

const PUBLIC_IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|heic|heif)$/i;

export const MAX_PUBLIC_FILES = 10;
export const MAX_PUBLIC_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PUBLIC_TOTAL_BYTES = 25 * 1024 * 1024;

/**
 * ⚠️ EXTENSÃO **E** TIPO. O GIF é recusado mesmo com nome `.png`: o `type` vem do
 * sistema operacional e denuncia o conteúdo, enquanto a extensão é só texto que
 * qualquer um renomeia.
 */
export function isSupportedPublicImage(file: Pick<File, 'name' | 'type'>) {
  return PUBLIC_IMAGE_EXTENSION.test(file.name) && file.type !== 'image/gif';
}

/**
 * A lista de interessados, digitada à mão num campo de texto.
 *
 * Separadores variados porque a pessoa cola de onde tiver: vírgula do Outlook,
 * ponto e vírgula do Excel, quebra de linha do bloco de notas. Caixa baixa e sem
 * repetido porque o mesmo endereço em duas grafias viraria duas cópias do e-mail.
 *
 * Os inválidos NÃO são descartados em silêncio: eles voltam para a tela dizer qual
 * está errado. Engolir um endereço torto faria a pessoa achar que avisou alguém que
 * nunca foi avisado.
 */
export function parseEmailList(input: string) {
  const values = String(input || '')
    .split(/[;,\s]+/)
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];

  values.forEach(value => {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      if (!valid.includes(value)) valid.push(value);
    } else {
      invalid.push(value);
    }
  });

  return { valid, invalid };
}

export interface ArquivoDoFormulario {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

/**
 * Quais imagens entram, e a mensagem quando alguma não entra.
 *
 * ⚠️ `continue` E `break` SIGNIFICAM COISAS DIFERENTES, e a diferença é a regra:
 *
 *   tipo não aceito / arquivo grande demais  -> `continue`: recusa ESTE, segue nos outros
 *   passou de 10 arquivos / 25 MB no total   -> `break`: o limite é do conjunto, não faz
 *                                               sentido continuar tentando
 *
 * Quem anexa cinco fotos e uma delas é GIF espera perder o GIF, não as outras quatro.
 *
 * A duplicata sai CALADA de propósito: anexar de novo a mesma foto é engano óbvio
 * de quem clicou duas vezes, não erro que mereça mensagem.
 */
export function selecionarImagens(
  atuais: ArquivoDoFormulario[],
  novas: ArquivoDoFormulario[]
): { aceitas: ArquivoDoFormulario[]; erro: string } {
  const aceitas: ArquivoDoFormulario[] = [];
  let totalBytes = atuais.reduce((total, file) => total + file.size, 0);
  let erro = '';

  for (const file of novas) {
    if (atuais.length + aceitas.length >= MAX_PUBLIC_FILES) {
      erro = `Você pode anexar no máximo ${MAX_PUBLIC_FILES} imagens.`;
      break;
    }
    if (!isSupportedPublicImage(file)) {
      erro = 'Use imagens JPG, PNG, WebP, HEIC ou HEIF. Arquivos GIF não são aceitos.';
      continue;
    }
    if (file.size > MAX_PUBLIC_FILE_BYTES) {
      erro = `A imagem ${file.name} ultrapassa o limite de 10 MB.`;
      continue;
    }
    if (totalBytes + file.size > MAX_PUBLIC_TOTAL_BYTES) {
      erro = 'Os anexos juntos não podem ultrapassar 25 MB.';
      break;
    }
    const duplicada = [...atuais, ...aceitas].some(
      atual =>
        atual.name === file.name &&
        atual.size === file.size &&
        atual.lastModified === file.lastModified
    );
    if (duplicada) continue;
    aceitas.push(file);
    totalBytes += file.size;
  }

  return { aceitas, erro };
}

/**
 * O que a pessoa lê quando o registro falha.
 *
 * O caso do anexo tem texto próprio porque a causa mais comum é foto grande, e
 * "falha ao criar ticket" mandaria a pessoa embora sem saber que bastava mandar uma
 * imagem menor — ou registrar sem foto e anexar depois.
 */
export function getPublicFormSubmitError(mensagem: string) {
  if (!mensagem) return 'Não foi possível registrar a OS agora. Tente novamente em alguns minutos.';
  if (mensagem === 'Falha ao criar ticket na API.') {
    return 'Não foi possível registrar a solicitação. Se houver foto anexada, tente enviar uma imagem menor ou registre sem foto e envie a imagem depois.';
  }
  return mensagem;
}
