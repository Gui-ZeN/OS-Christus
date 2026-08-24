import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * TODA CONSULTA COMPOSTA PRECISA DE ÍNDICE DECLARADO.
 *
 * Este teste nasceu de uma rota agendada falhando em produção. O
 * `firestore.indexes.json` do repositório tinha ZERO índices — eles eram criados à
 * mão no console, então nada ligava o código ao que existia no projeto. Consulta
 * nova entrava, ninguém lembrava do índice, e o defeito aparecia na primeira
 * madrugada em que o cron encontrasse dado para processar.
 *
 * O Firestore exige índice composto quando a consulta combina IGUALDADE num campo
 * com INTERVALO (ou ordenação) em OUTRO. Intervalo no mesmo campo — `startAt >= x`
 * e `startAt <= y` — é servido pelo índice automático e não precisa de nada.
 *
 * ⚠️ O QUE ESTE TESTE NÃO VÊ: consulta montada em pedaços por variável
 * (`let q = col.where(...); q = q.where(...)`). Hoje não existe nenhuma assim no
 * backend — foi conferido —, mas se passar a existir, ela escapa daqui. O emulador
 * também não cobra índice, então nem os testes de integração pegariam.
 */

const RAIZ_API = join(process.cwd(), 'api');

/** Operadores que fixam um valor: entram no índice antes dos de intervalo. */
const IGUALDADE = new Set(['==', 'in', 'array-contains', 'array-contains-any']);
/** Operadores que varrem uma faixa: exigem estar no índice, e por último. */
const INTERVALO = new Set(['<', '<=', '>', '>=', '!=', 'not-in']);

interface Consulta {
  colecao: string;
  igualdades: string[];
  intervalos: string[];
  arquivo: string;
  linha: number;
}

function arquivosJs(raiz: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(raiz)) {
    const caminho = join(raiz, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosJs(caminho));
    else if (nome.endsWith('.js')) saida.push(caminho);
  }
  return saida;
}

function extrairConsultas(): Consulta[] {
  const consultas: Consulta[] = [];
  const padrao =
    /collection(?:Group)?\(\s*'([a-zA-Z_]+)'\s*\)((?:\s*\.(?:where|orderBy)\([^;]*?\))+)/gs;
  const condicao = /\.(where|orderBy)\(\s*'([^']+)'\s*,\s*'([^']+)'/g;

  for (const arquivo of arquivosJs(RAIZ_API)) {
    const fonte = readFileSync(arquivo, 'utf8');
    for (const achado of fonte.matchAll(padrao)) {
      const igualdades: string[] = [];
      const intervalos: string[] = [];

      for (const parte of achado[2].matchAll(condicao)) {
        const [, tipo, campo, operador] = parte;
        if (tipo === 'orderBy') intervalos.push(campo);
        else if (IGUALDADE.has(operador)) igualdades.push(campo);
        else if (INTERVALO.has(operador)) intervalos.push(campo);
      }

      consultas.push({
        colecao: achado[1],
        igualdades: [...new Set(igualdades)],
        intervalos: [...new Set(intervalos)],
        arquivo: arquivo.replace(process.cwd(), '').replace(/\\/g, '/'),
        linha: fonte.slice(0, achado.index).split('\n').length,
      });
    }
  }
  return consultas;
}

/**
 * Precisa de índice composto?
 *
 * Só quando há igualdade num campo E intervalo/ordenação em OUTRO, ou intervalo em
 * mais de um campo. Duas condições no MESMO campo não contam — é o caso de
 * `startAt >= manhã` com `startAt <= agora`, que o índice automático resolve.
 */
function precisaDeIndice(c: Consulta): boolean {
  const campos = new Set([...c.igualdades, ...c.intervalos]);
  if (campos.size < 2) return false;
  if (c.igualdades.length > 0 && c.intervalos.some(campo => !c.igualdades.includes(campo))) {
    return true;
  }
  return c.intervalos.length > 1;
}

interface IndiceDeclarado {
  collectionGroup: string;
  fields: Array<{ fieldPath: string }>;
}

function indicesDeclarados(): IndiceDeclarado[] {
  const bruto = readFileSync(join(process.cwd(), 'firestore.indexes.json'), 'utf8');
  return (JSON.parse(bruto).indexes || []) as IndiceDeclarado[];
}

function temIndice(c: Consulta, indices: IndiceDeclarado[]): boolean {
  const precisa = new Set([...c.igualdades, ...c.intervalos]);
  return indices.some(indice => {
    if (indice.collectionGroup !== c.colecao) return false;
    const nele = new Set(indice.fields.map(f => f.fieldPath));
    return [...precisa].every(campo => nele.has(campo));
  });
}

describe('índices do Firestore', () => {
  const consultas = extrairConsultas();

  it('a varredura encontra as consultas do backend', () => {
    // Guarda contra o extrator quebrar em silêncio: regex que para de casar
    // devolveria "nenhuma consulta precisa de índice" e o teste passaria vazio —
    // exatamente o tipo de verde que não protege nada.
    expect(consultas.length).toBeGreaterThan(5);
  });

  it('toda consulta que exige índice composto tem o índice declarado', () => {
    const indices = indicesDeclarados();
    const faltando = consultas
      .filter(precisaDeIndice)
      .filter(c => !temIndice(c, indices))
      .map(c => `${c.colecao} [${[...c.igualdades, ...c.intervalos].join(', ')}] em ${c.arquivo}:${c.linha}`);

    expect(
      faltando,
      `sem índice declarado em firestore.indexes.json:\n  ${faltando.join('\n  ')}`
    ).toEqual([]);
  });

  it('a consulta que derrubou a checagem das visitas está coberta', () => {
    /**
     * O caso concreto: `state == 'faltou'` com `confirmedAt >= ontem`, em
     * `?route=checagem-visitas`. Igualdade num campo e intervalo em outro — o
     * Firestore recusa sem índice, e o cron falhava.
     */
    const indices = indicesDeclarados();
    const alvo: Consulta = {
      colecao: 'commitments',
      igualdades: ['state'],
      intervalos: ['confirmedAt'],
      arquivo: '',
      linha: 0,
    };
    expect(precisaDeIndice(alvo)).toBe(true);
    expect(temIndice(alvo, indices)).toBe(true);
  });

  it('intervalo no MESMO campo não exige índice composto', () => {
    // `startAt >= doze` e `startAt <= agora`, na mesma rota. Declarar índice para
    // isso seria ruído — e ensinaria a declarar índice que não faz falta.
    const mesmoCampo: Consulta = {
      colecao: 'commitments',
      igualdades: [],
      intervalos: ['startAt'],
      arquivo: '',
      linha: 0,
    };
    expect(precisaDeIndice(mesmoCampo)).toBe(false);
  });
});
