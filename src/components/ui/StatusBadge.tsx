import React from 'react';
import { etapaDe } from '../../../api/_lib/etapas.js';
import { repairMojibake } from '../../utils/text';

interface StatusBadgeProps {
  status: string;
  className?: string;
  /** Versão menor (lista densa): fonte/padding reduzidos pra quebrar menos em colunas estreitas. */
  compact?: boolean;
}

/**
 * COR DE ETAPA — de 7 matizes decorativos para 5 grupos de função.
 *
 * O badge dava uma cor diferente para cada etapa: sky, violet, amber, orange,
 * emerald, cyan, indigo. Medido no navegador, o resultado era outro:
 * **6 status distintos na tela da Gestão renderizavam 1 única aparência.** O
 * `.theme-bridge` (removido depois) capturava todos esses matizes e os achatava —
 * todos menos o vermelho. A cor prometia dizer a etapa e não dizia nada.
 *
 * Restaurar os 7 matizes seria pior: teriam de passar em contraste nos 4 temas
 * e o olho não separa 7 tons parecidos numa tabela densa. O agrupamento abaixo
 * não foi inventado — está no próprio vocabulário do sistema, onde **9 dos 13
 * status começam com "Aguardando"**:
 *
 *   Nova OS                        precisa de triagem     acento
 *   Aguardando… (9 status)         parado esperando       neutro
 *   Em andamento                   está andando           sucesso
 *   Encerrada                      terminou               neutro claro
 *   Cancelada / Reprovada          morreu                 perigo
 *
 * A varredura que isso resolve é real: numa tabela onde quase tudo está
 * "Aguardando", a pergunta do gestor é quais estão de fato andando.
 *
 * A cor nunca trabalha sozinha — o rótulo continua escrito por extenso, e o
 * ponto repete o grupo em forma além de cor.
 */
type Grupo = 'triagem' | 'esperando' | 'andando' | 'encerrada' | 'morta';

const TRATAMENTO: Record<Grupo, { fundo: string; texto: string; borda: string; ponto: string }> = {
  // Sem preenchimento, de propósito, e isso foi medido: o acento tem só 4,8:1 de
  // folga sobre a superfície, então QUALQUER tinta dele mesmo come essa folga —
  // a 12% cai para 3,96 e nem a 6% chega aos 4,5. `success` e `danger` foram
  // escolhidos já contra a própria tinta e por isso podem ter fundo; o acento não.
  // Aqui quem distingue é o contorno cheio, que vale 4,8:1.
  triagem: {
    fundo: 'bg-roman-surface',
    texto: 'text-roman-primary',
    borda: 'border-roman-primary',
    ponto: 'bg-roman-primary',
  },
  esperando: {
    fundo: 'bg-roman-bg',
    texto: 'text-roman-text-sub',
    borda: 'border-roman-border',
    ponto: 'bg-roman-text-sub',
  },
  andando: {
    fundo: 'bg-roman-success/12',
    texto: 'text-roman-success',
    borda: 'border-roman-success/35',
    ponto: 'bg-roman-success',
  },
  encerrada: {
    fundo: 'bg-roman-border-light',
    texto: 'text-roman-text-sub',
    borda: 'border-roman-border-light',
    ponto: 'bg-roman-text-sub',
  },
  morta: {
    fundo: 'bg-roman-danger/12',
    texto: 'text-roman-danger',
    borda: 'border-roman-danger/35',
    ponto: 'bg-roman-danger',
  },
};

/**
 * Recebe o status já normalizado (minúsculo, sem acento). A ordem importa:
 * "cancelada"/"reprovada" antes de qualquer coisa, porque uma OS morta não é
 * "esperando" nada; e "aguardando" por último, já que é o caso geral.
 */
function grupoDoStatus(normalizado: string): Grupo {
  if (normalizado.includes('cancelada') || normalizado.includes('reprovad')) return 'morta';
  if (normalizado.includes('encerrada') || normalizado.includes('concluida')) return 'encerrada';
  if (normalizado.includes('nova os')) return 'triagem';
  if (normalizado.includes('em andamento') || normalizado.includes('execucao')) return 'andando';
  if (normalizado.includes('aguardando')) return 'esperando';
  return 'esperando';
}

export function StatusBadge({ status, className = '', compact = false }: StatusBadgeProps) {
  /**
   * O QUE APARECE É A ETAPA, não o status cru do banco.
   *
   * São treze status gravados e seis etapas na boca da equipe. A tradução mora num
   * lugar só (`api/_lib/etapas.js`) e o banco continua com os nomes antigos — se
   * algum dos 34 lugares que comparam status por texto escapar, o erro aparece
   * aqui, visível, em vez de virar dado torto que ninguém desfaz.
   */
  const normalizedStatusText = etapaDe(repairMojibake(status));

  const normalizedStatus = normalizedStatusText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const { fundo, texto, borda, ponto } = TRATAMENTO[grupoDoStatus(normalizedStatus)];

  return (
    <span className={`inline-flex items-center rounded-full border ${borda} font-medium ${fundo} ${texto} ${
      compact ? 'gap-1 px-2 py-0.5 text-[11px]' : 'gap-1.5 px-2.5 py-1 text-xs'
    } ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ponto}`} aria-hidden="true"></span>
      {normalizedStatusText}
    </span>
  );
}
