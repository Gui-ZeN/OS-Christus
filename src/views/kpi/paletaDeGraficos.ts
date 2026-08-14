import { useEffect, useState } from 'react';

/**
 * A PALETA DOS GRÁFICOS, LIDA DO TEMA EM TEMPO DE EXECUÇÃO.
 *
 * O Recharts recebe cor por *prop* — `fill`, `stroke`, `contentStyle` — não por
 * classe. Por isso os 80 valores desta tela ficaram cravados em hexadecimal e
 * nunca participaram de tema nenhum. Medido no tema escuro: a barra de
 * "Concluídas" (`#1a1a1a`) sobre o fundo `#0b0f14` dá **1,01:1** — invisível.
 * A linha de destaque ainda usava `#b08d57`, o dourado *anterior* ao ajuste de
 * contraste: os gráficos ficaram para trás quando o acento escureceu.
 *
 * A saída é ler as variáveis CSS do tema ativo com `getComputedStyle`. O ponto
 * delicado é **quando** ler, e a primeira tentativa aqui estava errada:
 *
 *   Um `useEffect` dependente do `theme` do contexto NÃO funciona. O `data-theme`
 *   é escrito no `<html>` por um efeito do próprio AppContext, e no React os
 *   efeitos dos filhos rodam ANTES dos do pai. Então este componente lia o
 *   atributo ainda com o tema anterior — e, como `theme` não mudava de novo, a
 *   leitura velha ficava para sempre. Medido: trocar para o tema escuro deixava
 *   os gráficos com as cores do tema claro.
 *
 * Por isso a fonte da verdade é o **atributo**, observado com `MutationObserver`.
 * Ele dispara depois da escrita, seja qual for a ordem dos efeitos.
 *
 * A outra armadilha é o valor: `getPropertyValue` devolve o texto declarado —
 * aqui sempre hexadecimal, porque os temas declaram hex literal. A reserva
 * abaixo é o que impede um gráfico sem cor no primeiro quadro.
 */

/** Reserva do tema claro — só vale no primeiro quadro, antes do efeito rodar. */
const RESERVA = {
  grade: '#e4e4e4',
  eixo: '#465563',
  rotulo: '#465563',
  superficie: '#ffffff',
  borda: '#cfcfcf',
  textoDica: '#161616',
  cursor: '#fafafa',
  serieA: '#161616',
  serieB: '#465563',
  serieC: '#8f8f8f',
  destaque: '#896e44',
} as const;

export type PaletaDeGraficos = typeof RESERVA;

/**
 * As séries saem de tokens que já têm contraste garantido contra a superfície:
 * `text-main` e `text-sub` são texto (≥4,5:1) e `border-control` é contorno de
 * controle (≥3:1). Em qualquer tema elas se separam entre si porque ocupam
 * degraus distintos da escala de luminância — do texto principal ao cinza médio.
 */
const DE_ONDE_VEM: Record<keyof PaletaDeGraficos, string> = {
  grade: '--color-roman-border-light',
  eixo: '--color-roman-text-sub',
  rotulo: '--color-roman-text-sub',
  superficie: '--color-roman-surface',
  borda: '--color-roman-border',
  textoDica: '--color-roman-text-main',
  cursor: '--color-roman-bg',
  serieA: '--color-roman-text-main',
  serieB: '--color-roman-text-sub',
  serieC: '--color-roman-border-control',
  destaque: '--color-roman-primary',
};

function lerDoTema(): PaletaDeGraficos {
  const estilo = getComputedStyle(document.documentElement);
  const lida = { ...RESERVA } as Record<keyof PaletaDeGraficos, string>;
  for (const chave of Object.keys(DE_ONDE_VEM) as (keyof PaletaDeGraficos)[]) {
    const valor = estilo.getPropertyValue(DE_ONDE_VEM[chave]).trim();
    if (valor) lida[chave] = valor;
  }
  return lida as PaletaDeGraficos;
}

export function usePaletaDeGraficos(): PaletaDeGraficos {
  const [paleta, setPaleta] = useState<PaletaDeGraficos>(RESERVA);

  useEffect(() => {
    const reler = () => setPaleta(lerDoTema());
    reler();

    const observador = new MutationObserver(reler);
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observador.disconnect();
  }, []);

  return paleta;
}
