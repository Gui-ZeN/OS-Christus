/**
 * REDUZ A FOTO NO NAVEGADOR ANTES DE SUBIR (15/10/2026).
 *
 * Foto de celular sai com 3 a 5 MB e 4000 px de lado, e o orçamento passou a aceitar
 * várias por OS. O Storage é o plano grátis (5 GB; 8,3 MB usados em 15/10), e quem
 * confere uma foto de serviço não precisa de mais que ~1600 px.
 *
 * ⚠️ NA DÚVIDA, SOBE O ORIGINAL. Formato que o navegador não decodifica (HEIC do
 * iPhone em alguns navegadores), GIF animado, SVG, ou resultado maior que o original:
 * vai o arquivo como veio. Reduzir é economia, não pode virar motivo de upload falhar.
 */

export const LADO_MAXIMO = 1600;
const QUALIDADE_JPEG = 0.82;
/** Abaixo disto e dentro do lado máximo, não vale reprocessar. */
const TAMANHO_QUE_JA_SERVE = 1.5 * 1024 * 1024;

/** Só fotos rasterizadas que o canvas sabe reescrever. */
export function eFotoReduzivel(tipo: string): boolean {
  return /^image\/(jpeg|jpg|png|webp)$/i.test(tipo);
}

/** As dimensões finais, mantendo a proporção. Nunca aumenta. */
export function dimensoesReduzidas(largura: number, altura: number, lado = LADO_MAXIMO) {
  const maior = Math.max(largura, altura);
  if (maior <= lado) return { largura, altura };
  const fator = lado / maior;
  return { largura: Math.round(largura * fator), altura: Math.round(altura * fator) };
}

export function nomeEmJpg(nome: string): string {
  return /\.[^./\\]+$/.test(nome) ? nome.replace(/\.[^./\\]+$/, '.jpg') : `${nome}.jpg`;
}

export async function reduzirFoto(arquivo: File): Promise<File> {
  if (!eFotoReduzivel(arquivo.type)) return arquivo;
  try {
    // `createImageBitmap` respeita a orientação do EXIF — sem isso, foto de celular
    // em pé subiria deitada.
    const imagem = await createImageBitmap(arquivo);
    const { largura, altura } = dimensoesReduzidas(imagem.width, imagem.height);
    const jaServe = largura === imagem.width && arquivo.size <= TAMANHO_QUE_JA_SERVE;
    if (jaServe) {
      imagem.close();
      return arquivo;
    }

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      imagem.close();
      return arquivo;
    }
    // Fundo branco: PNG com transparência viraria fundo PRETO no JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(imagem, 0, 0, largura, altura);
    imagem.close();

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALIDADE_JPEG));
    if (!blob || blob.size >= arquivo.size) return arquivo;
    return new File([blob], nomeEmJpg(arquivo.name), { type: 'image/jpeg', lastModified: arquivo.lastModified });
  } catch {
    return arquivo;
  }
}
