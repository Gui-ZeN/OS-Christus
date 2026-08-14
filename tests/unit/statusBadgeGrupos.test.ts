import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O badge de etapa agrupa os 13 status em 5 tratamentos de função. Este teste
 * garante duas coisas que dão errado em silêncio:
 *
 *  1. que TODO status do domínio cai num grupo — se alguém adicionar uma etapa
 *     nova em `statusFlow.js`, ela não pode virar "esperando" por acidente;
 *  2. que os cinco grupos continuam **visualmente distintos**. O defeito que isso
 *     substitui era exatamente esse: 7 matizes que renderizavam 1 aparência só.
 */

const FONTE_BADGE = readFileSync(join(process.cwd(), 'src/components/ui/StatusBadge.tsx'), 'utf8');
const FONTE_FLUXO = readFileSync(join(process.cwd(), 'api/_lib/statusFlow.js'), 'utf8');

/** Reproduz `grupoDoStatus` do componente. Se um mudar sem o outro, o teste cai. */
function grupoDoStatus(rotulo: string): string {
  const n = rotulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (n.includes('cancelada') || n.includes('reprovad')) return 'morta';
  if (n.includes('encerrada')) return 'encerrada';
  if (n.includes('nova os')) return 'triagem';
  if (n.includes('em andamento') || n.includes('execucao')) return 'andando';
  if (n.includes('aguardando')) return 'esperando';
  return 'esperando';
}

/** Os rótulos vêm do domínio, não de uma lista copiada aqui. */
function statusDoDominio(): string[] {
  const bloco = FONTE_FLUXO.match(/TICKET_STATUS\s*=\s*\{([^}]*)\}/)?.[1];
  if (!bloco) throw new Error('não achei TICKET_STATUS em api/_lib/statusFlow.js');
  return [...bloco.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
}

describe('os grupos do badge de etapa', () => {
  it('cobre os 13 status do domínio', () => {
    const status = statusDoDominio();
    expect(status.length, 'o domínio mudou de tamanho — reveja o agrupamento').toBe(13);
    for (const s of status) {
      expect(['triagem', 'esperando', 'andando', 'encerrada', 'morta']).toContain(grupoDoStatus(s));
    }
  });

  it('classifica cada etapa onde o operador espera', () => {
    expect(grupoDoStatus('Nova OS')).toBe('triagem');
    expect(grupoDoStatus('Em andamento')).toBe('andando');
    expect(grupoDoStatus('Encerrada')).toBe('encerrada');
    expect(grupoDoStatus('Cancelada')).toBe('morta');
    // Uma OS morta não está "esperando" nada — a ordem das checagens importa.
    expect(grupoDoStatus('Orçamento Reprovado')).toBe('morta');
    // Os oito "Aguardando…" caem juntos, que é o ponto do agrupamento.
    for (const s of statusDoDominio().filter((x) => x.toLowerCase().startsWith('aguardando'))) {
      expect(grupoDoStatus(s), s).toBe('esperando');
    }
  });

  it('os nove "Aguardando" são mesmo a maioria — é o que justifica destacar o resto', () => {
    const esperando = statusDoDominio().filter((s) => grupoDoStatus(s) === 'esperando');
    // 9 de 13. Numa tabela onde 70% das linhas dizem "Aguardando alguma coisa",
    // dar uma cor diferente a cada uma delas não ajuda ninguém a varrer.
    expect(esperando.length).toBe(9);
  });

  it('os cinco grupos têm tratamentos distintos entre si', () => {
    const bloco = FONTE_BADGE.match(/const TRATAMENTO[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1];
    expect(bloco, 'não achei o mapa TRATAMENTO').toBeTruthy();

    const assinaturas = [...(bloco as string).matchAll(/(\w+):\s*\{([^}]*)\}/g)].map(([, nome, corpo]) => ({
      nome,
      // a assinatura visual: as quatro classes de cor, normalizadas
      visual: (corpo.match(/'([^']+)'/g) ?? []).join(' '),
    }));

    expect(assinaturas.length, 'esperava 5 grupos').toBe(5);
    const distintas = new Set(assinaturas.map((a) => a.visual));
    expect(
      distintas.size,
      `dois grupos ficaram idênticos:\n${assinaturas.map((a) => `${a.nome}: ${a.visual}`).join('\n')}`,
    ).toBe(5);
  });

  it('o grupo do acento não ganha fundo tingido com o próprio acento', () => {
    /**
     * Medido: `primary` tem só 4,8:1 de folga sobre a superfície, então uma tinta
     * dele mesmo come essa folga — a 12% o texto cai para 3,96 e nem a 6% chega
     * aos 4,5. `success` e `danger` foram escolhidos já CONTRA a própria tinta e
     * por isso podem ter fundo; o acento não pode. A pílula da triagem é
     * contornada, sem preenchimento.
     */
    const triagem = FONTE_BADGE.match(/triagem:\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(triagem, 'não achei o grupo triagem').toBeTruthy();
    expect(
      /fundo:\s*'bg-roman-primary\//.test(triagem),
      'fundo tingido com o acento derruba o texto abaixo de 4,5:1',
    ).toBe(false);
  });

  it('nenhum matiz cru do Tailwind voltou para o badge', () => {
    // Eram sky/violet/amber/orange/emerald/cyan/indigo — todos capturados pelo
    // `.theme-bridge` e achatados no dourado. É assim que a cor morre em silêncio.
    const crus = FONTE_BADGE.match(
      /\b(?:bg|text|border)-(?:sky|violet|amber|orange|emerald|cyan|indigo|blue|green|red|slate)-\d{2,3}/g,
    );
    expect(crus, `use tokens de tema: ${crus?.join(', ')}`).toBeNull();
  });
});
