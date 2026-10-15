import { describe, expect, it } from 'vitest';
import { dimensoesReduzidas, eFotoReduzivel, nomeEmJpg, reduzirFoto } from '../../src/utils/reduzirFoto';

/** A regra de quando e quanto reduzir. O desenho no canvas é conferido no navegador. */
describe('reduzir foto antes de subir', () => {
  it('foto de celular deitada e em pé descem para 1600 no lado maior, mantendo a proporção', () => {
    expect(dimensoesReduzidas(4000, 3000)).toEqual({ largura: 1600, altura: 1200 });
    expect(dimensoesReduzidas(3024, 4032)).toEqual({ largura: 1200, altura: 1600 });
  });

  it('foto que já é pequena não é aumentada', () => {
    expect(dimensoesReduzidas(800, 600)).toEqual({ largura: 800, altura: 600 });
  });

  it('só JPEG, PNG e WebP são reescritos', () => {
    expect(eFotoReduzivel('image/jpeg')).toBe(true);
    expect(eFotoReduzivel('image/png')).toBe(true);
    expect(eFotoReduzivel('image/webp')).toBe(true);
    expect(eFotoReduzivel('image/heic')).toBe(false);
    expect(eFotoReduzivel('image/gif')).toBe(false);
    expect(eFotoReduzivel('image/svg+xml')).toBe(false);
    expect(eFotoReduzivel('application/pdf')).toBe(false);
  });

  it('o nome passa a terminar em .jpg', () => {
    expect(nomeEmJpg('IMG_2031.PNG')).toBe('IMG_2031.jpg');
    expect(nomeEmJpg('foto.do.servico.webp')).toBe('foto.do.servico.jpg');
    expect(nomeEmJpg('sem-extensao')).toBe('sem-extensao.jpg');
  });

  it('PDF sobe exatamente como veio', async () => {
    const pdf = new File(['%PDF-1.4'], 'proposta.pdf', { type: 'application/pdf' });
    expect(await reduzirFoto(pdf)).toBe(pdf);
  });

  it('se o navegador não consegue ler a foto, sobe o original em vez de falhar', async () => {
    // Bytes que não são imagem: `createImageBitmap` (ou a falta dele) lança.
    const quebrada = new File(['não é imagem'], 'foto.jpg', { type: 'image/jpeg' });
    expect(await reduzirFoto(quebrada)).toBe(quebrada);
  });
});
