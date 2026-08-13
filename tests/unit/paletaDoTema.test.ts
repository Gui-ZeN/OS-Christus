import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * GUARDA DA PALETA — impede a volta das 402.
 *
 * O app tinha 402 classes de cor cruas (`bg-white`, `bg-stone-50`,
 * `border-stone-200`…) convivendo com 2.772 de token. Elas funcionavam porque o
 * `.theme-bridge` as remapeia em runtime — mas o bridge é uma lista enumerada À MÃO
 * em `index.css`, então classe nova escapa em silêncio e só aparece quando alguém
 * abre o tema escuro.
 *
 * Foi exatamente o que aconteceu com `bg-red-50/60` e `bg-slate-50/60` no TodayView:
 * vermelho e slate não estavam na lista, e os cartões de "Vencidas" e "Suspensas"
 * renderizavam com luminância 152 e 156 sobre um fundo de luminância 15. Ninguém viu
 * por meses.
 *
 * Converter as 402 foi o conserto; este teste é o que impede a 403ª.
 */

/** Cores cruas que PODEM ficar, com o motivo de cada uma. */
const PERMITIDAS = [
  // Texto branco sobre botão/faixa já colorida pelo tema. O próprio bridge não toca
  // em `text-white` — a cor de fundo é que é temática.
  /^text-white(\/\d{1,3})?$/,
  /^border-white(\/\d{1,3})?$/,
  // Cortina de modal: preto translúcido é escuro em qualquer tema, de propósito.
  /^bg-black(\/\d{1,3})?$/,
  // Tom semântico do TodayView, aplicado como TINTA sobre a superfície do tema
  // (`/10`) e não como pastel fixo — funciona nos quatro temas. Ver GROUP_TONE.
  /^bg-(red|slate)-500\/10$/,
];

const RX_COR_CRUA = /\b(?:bg|text|border)-(?:white|black|stone|gray|slate|zinc|neutral)(?:-\d{2,3})?(?:\/\d{1,3})?\b/g;

function arquivosTsx(dir: string): string[] {
  return readdirSync(dir).flatMap(nome => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosTsx(caminho);
    return caminho.endsWith('.tsx') ? [caminho] : [];
  });
}

/**
 * Comentário não é código. Sem tirar, a documentação que EXPLICA o defeito
 * (citando `bg-red-50/60`) reprovaria o próprio teste — aconteceu ao escrever isto.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');
}

describe('paleta: só token do tema', () => {
  it('nenhuma cor crua nova entrou no código', () => {
    const encontradas: string[] = [];

    for (const arquivo of arquivosTsx('src')) {
      const fonte = semComentarios(readFileSync(arquivo, 'utf8'));
      for (const classe of fonte.match(RX_COR_CRUA) || []) {
        if (PERMITIDAS.some(regra => regra.test(classe))) continue;
        encontradas.push(`${arquivo.replace(/\\/g, '/')}: ${classe}`);
      }
    }

    // Mensagem em vez de só o número: quem quebrar isto precisa saber o que fazer.
    expect(
      encontradas,
      'Use os tokens do tema (bg-roman-surface, bg-roman-bg, border-roman-border, ' +
        'text-roman-text-main/sub). Cor crua depende do .theme-bridge, que é uma lista ' +
        'enumerada à mão — o que não estiver nela fica claro no tema escuro.'
    ).toEqual([]);
  });

  it('a guarda realmente pega uma cor crua (senão passaria vazia para sempre)', () => {
    const fonte = semComentarios('const x = "rounded-xl bg-stone-50 border-stone-200";');
    const achadas = (fonte.match(RX_COR_CRUA) || []).filter(c => !PERMITIDAS.some(r => r.test(c)));
    expect(achadas).toEqual(['bg-stone-50', 'border-stone-200']);
  });

  it('e não pega o que é permitido, nem o que está em comentário', () => {
    const fonte = semComentarios(`
      /* documentação citando bg-red-50/60 e bg-stone-100 */
      const y = "bg-black/50 text-white/70 bg-red-500/10";
    `);
    const achadas = (fonte.match(RX_COR_CRUA) || []).filter(c => !PERMITIDAS.some(r => r.test(c)));
    expect(achadas).toEqual([]);
  });
});
