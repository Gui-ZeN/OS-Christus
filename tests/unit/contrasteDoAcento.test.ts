import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * GUARDA DO ACENTO — o dourado da marca reprovava, e ninguém viu.
 *
 * O acento tem DOIS empregos, e cada um é um par de contraste diferente:
 *
 *   1. ele é TEXTO sobre a página     → `primary` contra `surface` e contra `bg`
 *   2. ele é PREENCHIMENTO com rótulo → `on-primary` contra `primary` e `primary-hover`
 *
 * Durante meses um único token tentou responder às duas perguntas, e o
 * dourado `#b08d57` reprovava nas duas ao mesmo tempo — 3,09:1 nos dois
 * sentidos, com 21 textos de 12px afetados. Texto pequeno exige 4,5:1.
 *
 * O tema escuro é a prova de que um token só não resolve: lá o azul PRECISA
 * ser claro para servir de texto sobre o fundo escuro, e é justamente por ser
 * claro que o rótulo branco em cima dele reprovava. São pares opostos — não
 * existe valor de azul que satisfaça os dois. Por isso `on-primary` existe.
 *
 * Este teste relê o CSS e refaz a conta nos quatro temas. Se alguém trocar um
 * acento "só para ficar mais bonito", a conta quebra aqui, e não em produção.
 */

const CSS = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

/** WCAG 2.1 — 1.4.3, texto normal. A UI é densa e cheia de 11/12px. */
const MINIMO = 4.5;

const TEMAS = ['official', 'blue-orange', 'dark', 'athletico'] as const;

function canal(valor: number): number {
  const c = valor / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminancia(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/**
 * O tema `official` mora num seletor duplo (`:root, [data-theme="official"]`),
 * os outros num seletor simples. Pegamos o bloco que contém o nome do tema.
 */
function tokensDoTema(tema: string): Record<string, string> {
  const blocos: string[] = CSS.match(/[^{}]*\{[^{}]*\}/g) ?? [];
  const bloco = blocos.find(
    (b) => b.includes(`[data-theme="${tema}"]`) && b.includes('--theme-roman-primary:'),
  );
  if (!bloco) throw new Error(`não achei o bloco do tema "${tema}" em src/index.css`);

  const tokens: Record<string, string> = {};
  for (const [, nome, valor] of bloco.matchAll(/--theme-roman-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[nome] = valor.toLowerCase();
  }
  return tokens;
}

describe('contraste do acento, nos quatro temas', () => {
  it.each(TEMAS)('%s define os três tokens do acento', (tema) => {
    const t = tokensDoTema(tema);
    expect(t.primary, 'primary').toMatch(/^#[0-9a-f]{6}$/);
    expect(t['primary-hover'], 'primary-hover').toMatch(/^#[0-9a-f]{6}$/);
    expect(t['on-primary'], 'on-primary').toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each(TEMAS)('%s: o acento serve como TEXTO sobre a superfície e sobre o fundo', (tema) => {
    const t = tokensDoTema(tema);
    expect(contraste(t.primary, t.surface), `${tema}: primary sobre surface`).toBeGreaterThanOrEqual(MINIMO);
    expect(contraste(t.primary, t.bg), `${tema}: primary sobre bg`).toBeGreaterThanOrEqual(MINIMO);
  });

  it.each(TEMAS)('%s: o rótulo serve sobre o preenchimento, em repouso e no hover', (tema) => {
    const t = tokensDoTema(tema);
    expect(contraste(t['on-primary'], t.primary), `${tema}: on-primary sobre primary`).toBeGreaterThanOrEqual(MINIMO);
    expect(
      contraste(t['on-primary'], t['primary-hover']),
      `${tema}: on-primary sobre primary-hover`,
    ).toBeGreaterThanOrEqual(MINIMO);
  });

  /**
   * WCAG 1.4.11 pede 3:1 para o contorno que identifica um controle. A borda comum
   * (`border`) fica de fora de propósito: moldura de painel e linha de tabela não
   * são controle, e engrossá-las desfaria a poda visual.
   */
  it.each(TEMAS)('%s: a borda de CONTROLE passa em 3:1, e a de moldura segue leve', (tema) => {
    const t = tokensDoTema(tema);
    expect(contraste(t['border-control'], t.surface), `${tema}: borda de controle sobre surface`).toBeGreaterThanOrEqual(3);
    expect(contraste(t['border-control'], t.bg), `${tema}: borda de controle sobre bg`).toBeGreaterThanOrEqual(3);
    // A de moldura continua discreta — se um dia alguém igualar as duas, o token
    // separado perdeu a razão de existir e é melhor saber por aqui.
    expect(t['border-control'], `${tema}: os dois tokens de borda viraram o mesmo valor`).not.toBe(t.border);
  });

  it('o hover continua sendo um passo VISÍVEL a partir do repouso', () => {
    // Sem isto, "passar no contraste" poderia ser satisfeito colando o hover no
    // primary — acessível e inútil, porque o botão pararia de responder ao mouse.
    for (const tema of TEMAS) {
      const t = tokensDoTema(tema);
      expect(contraste(t.primary, t['primary-hover']), `${tema}: distância do hover`).toBeGreaterThan(1.15);
    }
  });
});

describe('a cor do rótulo sobre o acento sai do token, não de text-white', () => {
  /**
   * `text-white` sobre `bg-roman-primary` é o defeito original: funciona no tema
   * claro e desaparece no escuro, onde o acento é claro de propósito.
   */
  it('nenhum preenchimento sólido do acento carrega text-white', () => {
    const arquivos = listarTsx(join(process.cwd(), 'src'));
    const culpados: string[] = [];

    for (const arquivo of arquivos) {
      readFileSync(arquivo, 'utf8')
        .split('\n')
        .forEach((linha, i) => {
          // `bg-roman-primary` sólido — sem `/opacidade` (tinta) e sem `-hover`.
          if (linha.includes('text-white') && /bg-roman-primary(?![\w/-])/.test(linha)) {
            culpados.push(`${arquivo.replace(process.cwd(), '')}:${i + 1}`);
          }
        });
    }

    expect(culpados, `use text-roman-on-primary:\n${culpados.join('\n')}`).toEqual([]);
  });
});

function listarTsx(dir: string): string[] {
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  const saida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...listarTsx(caminho));
    else if (entrada.name.endsWith('.tsx')) saida.push(caminho);
  }
  return saida;
}
