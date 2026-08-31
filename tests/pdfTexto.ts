import { inflateSync } from 'node:zlib';

/**
 * O TEXTO QUE ESTÁ DENTRO DO PDF — a única forma de conferir um PDF de verdade.
 *
 * Existe por causa de um defeito conhecido desta casa: download que dispara e
 * arquivo que abre vazio não geram erro nenhum. Afirmar "o PDF foi gerado" olhando
 * o `Content-Type`, o tamanho do corpo ou o evento de download é afirmar sobre o
 * transporte, não sobre o documento — e foi assim que um botão que descartava o
 * resultado passou por verde.
 *
 * O pdfkit desenha as fontes padrão (Helvetica/Times) com `TJ`, e cada pedaço sai
 * como string HEXADECIMAL: `<4f532d30303031>` é `OS-0001`. Os content streams vêm
 * comprimidos com Flate. Então: inflar todos os streams e colher as strings.
 *
 * ⚠️ OS PEDAÇOS SÃO COLADOS SEM SEPARADOR, e isso não é detalhe: o kerning parte
 * uma palavra em vários pedaços no mesmo `TJ` (`<4752>` + `<55504f...>` é "GR" +
 * "UPO ..."). Juntar com espaço quebraria toda busca por frase — a asserção passaria
 * a falhar por causa do espacejamento da fonte, não do conteúdo.
 *
 * ⚠️ NÃO É UM EXTRATOR DE PDF DE USO GERAL. Ele conhece exatamente o que o pdfkit
 * emite aqui; fonte embutida (subset com CID) sairia como código de glifo. Serve
 * para o que precisa servir: perguntar se uma frase está — ou não está — no papel.
 */

/**
 * WinAnsi ≠ Latin-1 na faixa 0x80–0x9F, e é ali que moram sinais que este documento
 * usa. Sem o mapa, "…" e "—" voltariam como caractere de controle.
 */
const WINANSI: Record<number, string> = {
  0x85: '…',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x96: '–',
  0x97: '—',
};

function decodifica(bytes: number[]): string {
  return bytes.map(byte => WINANSI[byte] ?? String.fromCharCode(byte)).join('');
}

function deHex(hex: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return decodifica(bytes);
}

/** Desfaz os escapes de uma string literal `(...)`, inclusive o octal `\350`. */
function deLiteral(bruto: string): string {
  const bytes: number[] = [];
  let i = 0;
  while (i < bruto.length) {
    const char = bruto[i];
    if (char !== '\\') {
      bytes.push(bruto.charCodeAt(i));
      i += 1;
      continue;
    }
    const proximo = bruto[i + 1] ?? '';
    if (proximo >= '0' && proximo <= '7') {
      const octal = bruto.slice(i + 1).match(/^[0-7]{1,3}/)?.[0] ?? '';
      bytes.push(parseInt(octal, 8));
      i += 1 + octal.length;
      continue;
    }
    const escapados: Record<string, number> = { n: 10, r: 13, t: 9 };
    bytes.push(escapados[proximo] ?? proximo.charCodeAt(0));
    i += 2;
  }
  return decodifica(bytes);
}

const STRING_DO_STREAM = /<([0-9a-fA-F]*)>|\(((?:\\.|[^()\\])*)\)/g;

function stringsDoStream(stream: Buffer): string {
  const conteudo = stream.toString('latin1');
  let saida = '';
  for (const achado of conteudo.matchAll(STRING_DO_STREAM)) {
    const [, hex, literal] = achado;
    // `<<` de dicionário e hex de tamanho ímpar não são texto.
    if (hex !== undefined) {
      if (hex.length > 0 && hex.length % 2 === 0) saida += deHex(hex);
      continue;
    }
    saida += deLiteral(literal ?? '');
  }
  return saida;
}

export function textoDoPdf(pdf: Buffer): string {
  const pedacos: string[] = [];
  let cursor = 0;
  while (cursor < pdf.length) {
    const inicio = pdf.indexOf('stream', cursor, 'latin1');
    if (inicio < 0) break;
    const fim = pdf.indexOf('endstream', inicio, 'latin1');
    if (fim < 0) break;
    // Pula o CRLF/LF que separa a palavra `stream` do conteúdo.
    let corpo = inicio + 'stream'.length;
    if (pdf[corpo] === 0x0d) corpo += 1;
    if (pdf[corpo] === 0x0a) corpo += 1;
    try {
      pedacos.push(stringsDoStream(inflateSync(pdf.subarray(corpo, fim))));
    } catch {
      // Stream que não é Flate (fonte, imagem): não é texto, segue.
    }
    cursor = fim + 'endstream'.length;
  }
  // Espaço entre PÁGINAS, não entre pedaços: é a única fronteira real de conteúdo.
  return pedacos.join(' ');
}

/** É mesmo um PDF, e não uma página de erro com `Content-Type` errado? */
export function ehPdf(pdf: Buffer): boolean {
  return pdf.subarray(0, 5).toString('latin1') === '%PDF-';
}
